import cors from 'cors';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { bootstrapDatabaseSchema } from './config/schemaBootstrap';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware';
import apiRouter from './routes';

const app = express();

app.use(express.json());
app.use(cors());

const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: '🥢 API Backend Puthu Lanang (TypeScript) Berjalan Aktif!',
    version: '2.0.0',
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
      'GET   /api/ai/logs',
      'PATCH /api/ai/logs/:id/verify',
      'GET   /api/notifications/me',
      'GET   /api/admin/orders',
      'PATCH /api/admin/orders/:id/status',
    ],
  });
});

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await bootstrapDatabaseSchema();
  } catch (err) {
    console.error('❌ Peringatan inisialisasi MySQL:', err instanceof Error ? err.message : err);
    console.error('   Pastikan MySQL / XAMPP berjalan dan database "puthu_lanang_db" tersedia.');
  }

  app.listen(env.PORT, () => {
    console.log(`\n🚀 Server TypeScript Puthu Lanang berjalan di http://localhost:${env.PORT}`);
  });
}

startServer();

