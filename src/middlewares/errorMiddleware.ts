import { Request, Response, NextFunction } from 'express';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint tidak ditemukan.',
  });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[SERVER ERROR]:', err.message);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Terjadi kesalahan internal pada server.',
  });
}

