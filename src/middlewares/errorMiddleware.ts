import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    message: `Endpoint tidak ditemukan: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Global Error Handler (4 argumen Express).
 * Diletakkan di urutan paling akhir pipeline middleware.
 * Memastikan stack trace tidak pernah bocor ke client di environment production.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const reqId = (req.headers['x-request-id'] as string) || (req as unknown as { id?: string }).id;

  // 1. Tangani AppError (Operational Error terprediksi)
  if (err instanceof AppError) {
    logger.warn({ reqId, statusCode: err.statusCode, err: err.message }, '[APP ERROR OPERASIONAL]');
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  // 2. Tangani Zod Validation Error
  if (err instanceof ZodError) {
    const formatted = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    logger.warn({ reqId, issues: err.issues }, '[VALIDASI ZOD GAGAL]');
    res.status(400).json({
      status: 'error',
      message: `Validasi input gagal: ${formatted}`,
    });
    return;
  }

  // 3. Tangani SyntaxError (misal invalid JSON body)
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      status: 'error',
      message: 'Format payload JSON tidak valid.',
    });
    return;
  }

  // 4. Tangani Unknown / Programmer Error (Internal Server Error)
  const errorMessage = err instanceof Error ? err.message : 'Unknown internal error';
  const errorStack = err instanceof Error ? err.stack : undefined;

  logger.error(
    {
      reqId,
      url: req.originalUrl,
      method: req.method,
      message: errorMessage,
      stack: errorStack,
    },
    '[INTERNAL SERVER ERROR]'
  );

  res.status(500).json({
    status: 'error',
    message:
      env.NODE_ENV === 'production'
        ? 'Terjadi kesalahan internal pada server. Silakan hubungi tim administrator.'
        : errorMessage,
  });
}
