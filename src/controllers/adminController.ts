import { Request, Response } from 'express';
import * as orderService from '../services/orderService';

const VALID_ORDER_STATUSES = ['Baru', 'Diproses', 'Sedang Dikukus', 'Selesai', 'Dibatalkan'];

export async function getAdminOrders(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await orderService.getAdminOrders(status);
    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil pesanan.';
    res.status(500).json({ error: message });
  }
}

/**
 * Update status pesanan oleh admin (Requirement 5):
 * Menerima optional `estimated_minutes` ketika status diubah ke 'Diproses' atau 'Sedang Dikukus',
 * menghitung `estimated_ready_at`, dan mengembalikan data terbaru ke Web Admin & Mobile.
 */
export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  const orderId = parseInt(String(req.params.id).replace(/^ORD-/i, ''), 10);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: 'ID pesanan tidak valid.' });
    return;
  }

  const { status, estimated_minutes } = req.body;
  if (!VALID_ORDER_STATUSES.includes(status)) {
    res.status(400).json({
      error: `Status tidak valid. Pilihan: ${VALID_ORDER_STATUSES.join(', ')}`,
    });
    return;
  }

  const estimatedMinutes =
    estimated_minutes != null && Number.isInteger(Number(estimated_minutes)) && Number(estimated_minutes) > 0
      ? Number(estimated_minutes)
      : undefined;

  try {
    const updated = await orderService.updateAdminOrderStatus(orderId, status, estimatedMinutes);
    if (!updated) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    // Ambil data terbaru untuk response lengkap (termasuk estimated_minutes & estimated_ready_at)
    const freshOrder = await orderService.getInvoiceDetails(orderId);

    res.json({
      message: 'Status pesanan berhasil diperbarui',
      data: freshOrder || {
        id: `ORD-${orderId}`,
        status,
        estimated_minutes: estimatedMinutes,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengubah status pesanan.';
    res.status(500).json({ error: message });
  }
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await orderService.getAdminStats();
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil statistik.';
    res.status(500).json({ error: message });
  }
}

export async function getSalesChart(req: Request, res: Response): Promise<void> {
  try {
    const rawDays = parseInt(String(req.query.days ?? '7'), 10);
    const chartData = await orderService.getSalesChartData(rawDays);
    res.json(chartData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil data grafik.';
    res.status(500).json({ error: message });
  }
}

