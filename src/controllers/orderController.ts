import { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import * as orderService from '../services/orderService';
import { AuthenticatedRequest } from '../types';

export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await orderService.createOrder(req.user!, req.body);
    res.json({ message: 'Pesanan berhasil dibuat', data });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Gagal membuat pesanan.';
    const statusCode = err?.statusCode || (message.includes('operasional') ? 400 : 500);
    res.status(statusCode).json({ error: message });
  }
}

export async function getUserOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rows = await orderService.getOrdersForUser(req.user!.id);
    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil riwayat pesanan.';
    res.status(500).json({ error: message });
  }
}

export async function markOrderComplete(req: AuthenticatedRequest, res: Response): Promise<void> {
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
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Gagal menyelesaikan pesanan.';
    const statusCode = err?.statusCode || (message.includes('tidak ditemukan') ? 404 : 500);
    res.status(statusCode).json({ error: message });
  }
}

/**
 * Endpoint invoice struk pembayaran & detail pesanan (Requirement 3):
 * Mendukung GET /api/orders/invoice/:order_id dan GET /api/orders/:id
 */
export async function getOrderInvoice(req: Request, res: Response): Promise<void> {
  const identifier = req.params.order_id || req.params.id;
  if (!identifier) {
    res.status(400).json({ error: 'Parameter ID atau nomor pesanan wajib disertakan.' });
    return;
  }

  try {
    const order = await orderService.getInvoiceDetails(identifier);
    if (!order) {
      res.status(404).json({ error: 'Pesanan / invoice tidak ditemukan.' });
      return;
    }
    res.json({
      status: 'success',
      data: order,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil data invoice.';
    res.status(500).json({ error: message });
  }
}

