import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import authRouter from './auth.controller';
import onboardingRouter from './onboarding.controller';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_travel_app_development';
const PORT = process.env.PORT || 3001;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

// Use routers
app.use('/api/auth', authRouter);
app.use('/api/onboarding', onboardingRouter);

// Verify Token (Used by API Gateway)
app.post('/verify', (req, res) => {
  const { token } = req.body;
  if (!token) {
     res.status(401).json({ error: 'No token provided' });
     return;
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});
