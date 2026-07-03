import db from './db';

export interface AuditEvent {
  id: string;
  user_id: string;
  event_type: string;
  payload: any;
  created_at: Date;
}

/**
 * Log a mutation event to the immutable profile audit ledger.
 */
export async function logEvent(userId: string, eventType: string, payload: any): Promise<void> {
  await db.query(
    'INSERT INTO auth.profile_audit_ledger (user_id, event_type, payload) VALUES ($1, $2, $3)',
    [userId, eventType, JSON.stringify(payload)]
  );
}

/**
 * Reconstructs the complete state of a user by replaying the audit ledger from scratch.
 * This is used for compliance, dispute resolution, or history auditing.
 */
export async function reconstructUserState(userId: string): Promise<any> {
  const result = await db.query(
    'SELECT event_type, payload, created_at FROM auth.profile_audit_ledger WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );

  const state: any = {
    userId,
    profile: {},
    preferences: {},
    loyaltyPrograms: {},
    companions: {},
    consents: {},
    reconstructedAt: new Date(),
    eventsCount: result.rows.length
  };

  for (const row of result.rows) {
    const { event_type, payload } = row;

    switch (event_type) {
      case 'PROFILE_CREATE':
      case 'PROFILE_UPDATE':
        state.profile = {
          ...state.profile,
          email: payload.email || state.profile.email,
          firstName: payload.firstName || state.profile.firstName,
          lastName: payload.lastName || state.profile.lastName,
        };
        break;

      case 'PREFERENCES_UPDATE':
        state.preferences = {
          ...state.preferences,
          ...payload
        };
        break;

      case 'LOYALTY_UPDATE':
        state.loyaltyPrograms[payload.airlineCode] = {
          memberNumber: payload.memberNumber,
          tierStatus: payload.tierStatus
        };
        break;

      case 'LOYALTY_DELETE':
        delete state.loyaltyPrograms[payload.airlineCode];
        break;

      case 'COMPANION_CREATE':
      case 'COMPANION_UPDATE':
        state.companions[payload.id] = {
          firstName: payload.firstName,
          lastName: payload.lastName,
          relationship: payload.relationship
        };
        break;

      case 'COMPANION_DELETE':
        delete state.companions[payload.id];
        break;

      case 'CONSENT_UPDATE':
        state.consents[payload.permissionFlag] = payload.granted;
        break;

      default:
        // Ignore unrecognized events
        break;
    }
  }

  return state;
}
