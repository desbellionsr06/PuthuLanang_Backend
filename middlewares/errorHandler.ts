import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
}

/**
 * Global Error Handling Middleware
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Terjadi kesalahan internal pada server backend';

  console.error(`[Error] ${req.method} ${req.url} - Status: ${statusCode} - ${message}`);

  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

/**
 * 404 Route Not Found Middleware
 */
export const notFoundHandler = (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: `Endpoint REST API '${req.method} ${req.originalUrl}' tidak ditemukan!`,
  });
};
