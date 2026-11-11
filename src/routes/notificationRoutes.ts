import { Router, Response } from 'express';
import { authenticateJwt } from '../middlewares/authMiddleware';
import { AuthenticatedRequest } from '../types';
import * as notificationService from '../services/notificationService';

const router = Router();

router.get('/me', authenticateJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await notificationService.getUserNotifications(req.user!.id);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat notifikasi.';
    res.status(500).json({ status: 'error', message });
  }
});

router.patch('/read-all', authenticateJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await notificationService.markUserNotificationsRead(req.user!.id);
    res.json({ status: 'success', message: 'Semua notifikasi ditandai sudah dibaca.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui notifikasi.';
    res.status(500).json({ status: 'error', message });
  }
});

export default router;

