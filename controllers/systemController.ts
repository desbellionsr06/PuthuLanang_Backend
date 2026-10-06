import { Request, Response } from 'express';
import { DatabaseConnection } from '../config/database';

export const getSystemHealth = (req: Request, res: Response) => {
  const uptimeSeconds = process.uptime();
  const dbStatus = DatabaseConnection.getStatus();

  return res.status(200).json({
    success: true,
    message: 'Layanan REST API Puthu Lanang berjalan normal',
    data: {
      status: 'HEALTHY',
      uptime: `${Math.floor(uptimeSeconds)} detik`,
      database: dbStatus ? 'CONNECTED' : 'DISCONNECTED',
      timestamp: new Date().toISOString(),
      version: '1.0.0 (UTS Backend Framework)',
    },
  });
};
