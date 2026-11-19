import { Response } from 'express';
import * as notificationService from '../services/notificationService';
import { AuthenticatedRequest } from '../types';

export async function getMyNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rows = await notificationService.getUserNotifications(req.user!.id);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat notifikasi.';
    res.status(500).json({ status: 'error', message });
  }
}

export async function markAllRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await notificationService.markUserNotificationsRead(req.user!.id);
    res.json({ status: 'success', message: 'Semua notifikasi ditandai sudah dibaca.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui notifikasi.';
    res.status(500).json({ status: 'error', message });
  }
}

