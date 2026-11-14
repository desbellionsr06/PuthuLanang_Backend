import cors from 'cors';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { httpLogger, logger } from './config/logger';
import { bootstrapDatabaseSchema } from './config/schemaBootstrap';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware';
import apiRouter from './routes';

const app = express();

// 1. Hardening: Set trust proxy untuk load balancer / reverse proxy
app.set('trust proxy', 1);

// 2. Keamanan: Helmet HTTP Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 3. Logging terstruktur dengan pino-http & request ID otomatis
app.use(httpLogger);

// 4. Rate Limiter Global (Mencegah brute force dan DoS attack)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 300, // maks 300 request per windowMs per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi beberapa saat kemudian.',
  },
});
app.use(globalLimiter);

// 5. Rate Limiter Khusus endpoint sensitif (Auth & AI)
const sensitiveEndpointsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Batas pemanggilan endpoint sensitif (Auth/AI) tercapai. Tunggu 15 menit.',
  },
});

app.use(express.json({ limit: '5mb' }));
app.use(cors());

// Direktori static uploads
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Healthcheck & Index Route
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: '🥢 API Backend Puthu Lanang (TypeScript + Hardened Security) Aktif!',
    version: '2.1.0',
    security: {
      trustProxy: true,
      helmet: 'enabled',
      rateLimit: 'enabled',
      logging: 'pino-http (x-request-id)',
    },
    endpoints: [
      'GET   /api/menu',
      'POST  /api/auth/user-login',
      'POST  /api/auth/verify-session',
      'POST  /api/auth/manager-token',
      'PATCH /api/auth/fcm-token',
      'GET   /api/orders',
      'POST  /api/orders',
      'PATCH /api/orders/:id/complete',
      'POST  /api/ai/queue-estimator',
      'POST  /api/ai/recommendation',
      'GET   /api/ai/verified-latest',
      'GET   /api/ai/logs',
      'PATCH /api/ai/logs/:id/verify',
      'GET   /api/notifications/me',
      'GET   /api/admin/orders',
      'PATCH /api/admin/orders/:id/status',
    ],
  });
});

// Pasang Rate Limiter ketat pada /api/auth dan /api/ai
app.use('/api/auth', sensitiveEndpointsLimiter);
app.use('/api/ai', sensitiveEndpointsLimiter);

// Mount Modular API Routes
app.use('/api', apiRouter);

// Handler 404 & Global Error (4 argumen, di baris paling akhir)
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await bootstrapDatabaseSchema();
    logger.info('✅ Skema database MySQL berhasil diverifikasi/disinkronkan.');
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      '❌ Peringatan inisialisasi MySQL. Pastikan database puthu_lanang_db berjalan.'
    );
  }

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server Puthu Lanang berjalan di http://localhost:${env.PORT}`);
  });
}

startServer();
