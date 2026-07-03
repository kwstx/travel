import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_travel_app_development';
const PORT = process.env.PORT || 3001;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

// Register User
app.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    
    // Check if user exists
    const userCheck = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
       res.status(400).json({ error: 'User already exists' });
       return;
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Insert user
    const newUser = await db.query(
      'INSERT INTO auth.users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name',
      [email, passwordHash, firstName, lastName]
    );
    
    // Generate token
    const token = jwt.sign({ id: newUser.rows[0].id, email }, JWT_SECRET, { expiresIn: '1d' });
    
    res.status(201).json({ user: newUser.rows[0], token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login User
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await db.query('SELECT * FROM auth.users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
       res.status(400).json({ error: 'Invalid credentials' });
       return;
    }
    
    const user = result.rows[0];
    
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
       res.status(400).json({ error: 'Invalid credentials' });
       return;
    }
    
    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '1d' });
    
    // Omit password hash in response
    const { password_hash, ...userProfile } = user;
    
    res.json({ user: userProfile, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

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
