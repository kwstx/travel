import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const CONVERSATIONAL_SERVICE_URL = process.env.CONVERSATIONAL_SERVICE_URL || 'http://localhost:8000';

app.use(cors());
// Note: We don't use express.json() globally because http-proxy-middleware needs the raw body stream for POST/PUT requests in some cases.

// Middleware to check authentication via Auth Service
const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const response = await axios.post(`${AUTH_SERVICE_URL}/verify`, { token });
    if (response.data && response.data.valid) {
      // Attach user info to headers so downstream services can use it
      req.headers['x-user-id'] = response.data.user.id;
      req.headers['x-user-email'] = response.data.user.email;
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: Token verification failed' });
  }
};

// Public Routes (No Auth required)
app.use('/auth', createProxyMiddleware({ 
  target: AUTH_SERVICE_URL, 
  changeOrigin: true,
  pathRewrite: { '^/auth': '' } 
}));

// Protected Routes
app.use('/chat', authenticate, createProxyMiddleware({ 
  target: CONVERSATIONAL_SERVICE_URL, 
  changeOrigin: true,
  pathRewrite: { '^/chat': '' } 
}));

// Add other downstream services here as they are built...

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
