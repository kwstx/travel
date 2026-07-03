import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'travel_user',
  password: process.env.DB_PASSWORD || 'travel_password',
  database: process.env.DB_NAME || 'travel_db',
});

export default pool;
