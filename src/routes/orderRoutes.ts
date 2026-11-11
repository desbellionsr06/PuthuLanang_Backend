import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateCustomerOrLegacy } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateMiddleware';
import { AuthenticatedRequest } from '../types';
import * as orderService from '../services/orderService';

const router = Router();

const CreateOrderSchema = z.object({
  user_id: z.union([z.number(), z.string()]).optional(),
  pickupTime: z.string().optional(),
  pickupDate: z.string().optional(),
  items: z.array(z.any()).optional(),
  total: z.coerce.number().positive('Field total wajib diisi dengan angka lebih dari 0.'),
  notes: z.string().max(300).optional(),
});

router.post(
  '/',
  authenticateCustomerOrLegacy,
  validateBody(CreateOrderSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await orderService.createOrder(req.user!, req.body);
      res.json({ message: 'Pesanan berhasil dibuat', data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat pesanan.';
      res.status(500).json({ error: message });
    }
  }
);

router.get(
  '/',
  authenticateCustomerOrLegacy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await orderService.getOrdersForUser(req.user!.id);
      res.json({ data: rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengambil riwayat pesanan.';
      res.status(500).json({ error: message });
    }
  }
);

router.patch(
  '/:id/complete',
  authenticateCustomerOrLegacy,
  async (req: AuthenticatedRequest, res: Response) => {
    const orderId = parseInt(String(req.params.id).replace(/^ORD-/i, ''), 10);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      res.status(400).json({ error: 'ID pesanan tidak valid.' });
      return;
    }

    try {
      await orderService.markOrderComplete(orderId, req.user!.id);
      res.json({
        message: 'Pesanan ditandai selesai',
        data: { id: `ORD-${orderId}`, status: 'Selesai' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyelesaikan pesanan.';
      const status = message.includes('tidak ditemukan') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

export default router;

