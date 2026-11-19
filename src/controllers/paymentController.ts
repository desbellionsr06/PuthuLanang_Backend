import { Request, Response } from 'express';
import { createMidtransSnapCharge } from '../services/paymentService';

export async function createCharge(req: Request, res: Response): Promise<void> {
  try {
    const { redirect_url, token } = await createMidtransSnapCharge(req.body);
    res.json({
      message: 'Midtrans Snap Token Created',
      redirect_url,
      token,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membuat transaksi Snap.';
    res.status(400).json({ message });
  }
}

