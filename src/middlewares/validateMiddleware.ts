import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Middleware generik untuk memvalidasi req.body menggunakan skema Zod.
 */
export const validateBody = <T>(schema: ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        status: 'error',
        message: 'Validasi data request gagal.',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          detail: issue.message,
        })),
      });
      return;
    }

    req.body = result.data;
    next();
  };
};

