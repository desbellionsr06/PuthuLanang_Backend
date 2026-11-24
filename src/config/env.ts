import dotenv from 'dotenv';

dotenv.config();

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Environment variable "${key}" wajib dikonfigurasi di file .env`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DEV_MODE: process.env.DEV_MODE !== 'false',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: Number(process.env.DB_PORT) || 3306,
  DB_USER: process.env.DB_USER || 'root',
  DB_PASS: process.env.DB_PASS ?? '',
  DB_NAME: process.env.DB_NAME || 'puthu_lanang_db',
  JWT_SECRET: getEnv('JWT_SECRET', 'puthu-lanang-jwt-secret-2026'),
  JWT_EXPIRES: process.env.JWT_EXPIRES || '30d',
  ADMIN_SECRET: getEnv('ADMIN_SECRET', 'puthu-admin-2026'),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY || '',
  FONNTE_TOKEN: process.env.FONNTE_TOKEN || '',
  MIDTRANS_SERVER_KEY: process.env.MIDTRANS_SERVER_KEY || '',
  MOBILE_APP_URL: process.env.MOBILE_APP_URL || 'https://puthu-lanang-mobile.vercel.app',
  BACKEND_URL: process.env.BACKEND_URL || 'https://puthulanangbackend-production.up.railway.app',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
};

