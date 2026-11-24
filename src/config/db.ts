import mysql from 'mysql2/promise';
import { env } from './env';

export const db = mysql.createPool({
  host: env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});