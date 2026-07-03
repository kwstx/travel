import { Request, Response, NextFunction } from 'express';

// Define available roles in the system
export enum Role {
    USER = 'user',
    SUPPORT = 'support',
    ADMIN = 'admin',
    SUPPORT_ELEVATED = 'support_elevated' // JIT elevated role
}

// Extend Request to include roles (assuming jwt decoded includes them)
export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        roles: Role[];
        jitExpiration?: number; // Epoch timestamp for JIT expiry
    };
}

// Middleware to enforce RBAC
export const requireRoles = (allowedRoles: Role[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !req.user.roles) {
            return res.status(403).json({ error: 'Access denied. No roles assigned.' });
        }

        // Check if user has JIT role and if it has expired
        const hasElevatedRole = req.user.roles.includes(Role.SUPPORT_ELEVATED);
        if (hasElevatedRole && req.user.jitExpiration && Date.now() > req.user.jitExpiration) {
             return res.status(403).json({ error: 'Access denied. Just-in-time privilege has expired.' });
        }

        const hasRequiredRole = req.user.roles.some(role => allowedRoles.includes(role));
        if (!hasRequiredRole) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }

        next();
    };
};

// Just-in-Time Elevation Request Helper
// In a real system, this might trigger an approval workflow or require an incident ticket ID
export const requestJitElevation = (userId: string, currentRoles: Role[], durationMinutes: number = 60) => {
    if (!currentRoles.includes(Role.SUPPORT)) {
        throw new Error('Only support staff can request JIT elevation');
    }
    
    const expiration = Date.now() + (durationMinutes * 60 * 1000);
    const newRoles = [...new Set([...currentRoles, Role.SUPPORT_ELEVATED])];
    
    return {
        roles: newRoles,
        jitExpiration: expiration
    };
};
