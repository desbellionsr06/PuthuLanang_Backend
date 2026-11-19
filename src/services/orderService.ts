import { AppError } from '../errors/AppError';
import { logger } from '../config/logger';
import { JwtUserPayload } from '../types';
import {
  insertOrderInDb,
  updateOrderSnapInDb,
  findOrdersByUserId,
  findOrderById,
  findOrderByInvoice,
  markOrderCompleteInDb,
  getAdminOrdersFromDb,
  updateAdminOrderStatusInDb,
  getAdminStatsFromDb,
  getSalesChartFromDb,
  OrderRow,
} from '../models/orderModel';
import { createMidtransTransaction } from './midtransService';
import { sendPushNotificationToUser } from './notificationService';

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Validasi jam operasional Puthu Lanang (17:30 – 21:30 WIB).
 * Mendukung bypass untuk keperluan testing via BYPASS_OPERATING_HOURS=true.
 */
export function isWithinOperatingHours(): boolean {
  if (process.env.BYPASS_OPERATING_HOURS === 'true') {
    return true;
  }
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [hourStr, minuteStr] = timeString.split(':');
  const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);
  const openMinutes = 17 * 60 + 30; // 17:30 WIB -> 1050 menit
  const closeMinutes = 21 * 60 + 30; // 21:30 WIB -> 1290 menit

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

export interface OrderItemPayload {
  id?: string;
  quantity?: number;
  qty?: number;
  nama?: string;
  name?: string;
  harga?: number;
  price?: number;
}

export interface CreateOrderInput {
  pickupTime?: string;
  pickupDate?: string;
  items?: OrderItemPayload[];
  total: number;
  notes?: string;
  payment_method?: 'cash' | 'qris' | 'transfer' | string;
  paymentMethod?: string;
  estimated_minutes?: number;
}

/**
 * Membuat pesanan baru pelanggan (Takeaway / Dine-in).
 * Memvalidasi jam operasional 17:30 – 21:30 WIB.
 * Mendukung metode pembayaran:
 * - 'cash': Bayar langsung di kasir saat pengambilan (tanpa Midtrans)
 * - 'qris' / 'transfer': Terintegrasi dengan Midtrans Snap SDK (Sandbox)
 */
export async function createOrder(user: JwtUserPayload, input: CreateOrderInput) {
  // Validasi jam operasional
  if (!isWithinOperatingHours()) {
    throw new AppError(
      'Maaf, pemesanan hanya dapat dilakukan pada jam operasional Puthu Lanang pukul 17:30 – 21:30 WIB.',
      400
    );
  }

  const qrToken = `PL-2026-${Math.floor(10000 + Math.random() * 90000)}`;
  const antreanNo = Math.floor(50 + Math.random() * 50);
  const pickupDateValue =
    input.pickupDate && /^\d{4}-\d{2}-\d{2}$/.test(input.pickupDate) ? input.pickupDate : todayIso();

  const summaryItems =
    Array.isArray(input.items) && input.items.length > 0
      ? input.items
          .map((it) => `${it.quantity || it.qty || 1}x ${it.nama || it.name || 'Puthu'}`)
          .join(', ')
      : '1x Puthu / Paket Pilihan';

  // Normalisasi metode pembayaran: 'cash', 'qris', atau 'transfer'
  const methodRaw = (input.payment_method || input.paymentMethod || 'cash').toLowerCase().trim();
  const paymentMethod = ['qris', 'transfer', 'cash'].includes(methodRaw) ? methodRaw : 'cash';

  let snapToken: string | null = null;
  let snapRedirectUrl: string | null = null;
  const initialOrderStatus = paymentMethod === 'cash' ? 'Sedang Dikukus' : 'Menunggu Pembayaran';
  const initialPaymentStatus = 'pending';

  // Hitung estimasi waktu jika ada
  const estimatedMinutes = input.estimated_minutes && input.estimated_minutes > 0 ? input.estimated_minutes : null;
  const estimatedReadyAt = estimatedMinutes ? new Date(Date.now() + estimatedMinutes * 60 * 1000) : null;

  // 1. Simpan pesanan ke database MySQL melalui orderModel
  const orderId = await insertOrderInDb({
    userId: user.id,
    name: user.nama,
    phone: user.no_whatsapp,
    pickupTime: input.pickupTime || '-',
    pickupDate: pickupDateValue,
    total: input.total,
    notes: input.notes || '',
    qrToken,
    antreanNo,
    summaryItems,
    paymentMethod,
    paymentStatus: initialPaymentStatus,
    status: initialOrderStatus,
    estimatedMinutes,
    estimatedReadyAt,
  });

  const orderCode = `ORD-${orderId}`;

  // 2. Jika metode pembayaran adalah QRIS atau Transfer Bank, buat transaksi Snap Midtrans
  if (paymentMethod === 'qris' || paymentMethod === 'transfer') {
    try {
      const midtrans = await createMidtransTransaction({
        orderId: `${orderCode}-${Date.now()}`,
        grossAmount: input.total,
        customerName: user.nama,
        customerPhone: user.no_whatsapp,
        paymentMethod,
        items: input.items,
      });

      snapToken = midtrans.token;
      snapRedirectUrl = midtrans.redirect_url;

      await updateOrderSnapInDb(orderId, snapToken, snapRedirectUrl);
    } catch (err: any) {
      logger.error({ err: err?.message, orderCode }, 'Peringatan pembuatan transaksi Midtrans Snap');
    }
  }

  // 3. Notifikasi riwayat untuk pelanggan
  const notifMsg =
    paymentMethod === 'cash'
      ? `Pesanan ${orderCode} (Antrean #${antreanNo}) berhasil dibuat. Silakan bayar di kasir saat pengambilan.`
      : `Pesanan ${orderCode} siap dibayar melalui ${paymentMethod.toUpperCase()}.`;

  sendPushNotificationToUser(user.id, 'Pesanan Diterima', notifMsg).catch((err) =>
    logger.warn({ err }, 'Gagal mengirim push notifikasi order')
  );

  return {
    id: orderCode,
    order_id: orderCode,
    user_id: user.id,
    qr_code_token: qrToken,
    antrean: antreanNo,
    status: initialOrderStatus,
    payment_method: paymentMethod,
    payment_status: initialPaymentStatus,
    snap_token: snapToken,
    snap_redirect_url: snapRedirectUrl,
    payment_url: snapRedirectUrl, // Shortcut untuk mobile Flutter
    total_harga: input.total,
    total: input.total,
    name: user.nama,
    customer_name: user.nama,
    phone: user.no_whatsapp,
    customer_phone: user.no_whatsapp,
    pickup_time: input.pickupTime || '-',
    pickup_date: pickupDateValue,
    notes: input.notes || '',
    summary_items: summaryItems,
    estimated_minutes: estimatedMinutes,
    estimated_ready_at: estimatedReadyAt ? estimatedReadyAt.toISOString() : null,
    items: input.items || [],
  };
}

export async function getOrdersForUser(userId: number): Promise<OrderRow[]> {
  return findOrdersByUserId(userId);
}

export async function markOrderComplete(orderId: number, userId: number): Promise<void> {
  const success = await markOrderCompleteInDb(orderId, userId);
  if (!success) {
    throw new AppError('Pesanan tidak ditemukan atau Anda tidak memiliki akses.', 404);
  }
}

export async function getAdminOrders(status?: string): Promise<OrderRow[]> {
  return getAdminOrdersFromDb(status);
}

export async function updateAdminOrderStatus(
  orderId: number,
  status: string,
  estimatedMinutes?: number
): Promise<boolean> {
  const success = await updateAdminOrderStatusInDb(orderId, status, estimatedMinutes);
  if (!success) return false;

  const order = await findOrderById(orderId);
  if (order && order.user_id && order.user_id > 0) {
    const antrean = order.antrean ?? '-';
    let message = `Pesanan Anda (Antrean #${antrean}) kini berstatus: ${status}.`;
    if (estimatedMinutes && estimatedMinutes > 0) {
      message += ` Estimasi waktu siap: ${estimatedMinutes} menit.`;
    }

    sendPushNotificationToUser(
      order.user_id,
      `Status Pesanan ORD-${orderId} Diperbarui`,
      message
    ).catch((err) => logger.warn({ err }, 'Gagal mengirim push notifikasi update status'));
  }

  return true;
}

export async function getAdminStats() {
  return getAdminStatsFromDb();
}

export async function getSalesChartData(rawDays?: number) {
  return getSalesChartFromDb(rawDays);
}

export async function getInvoiceDetails(identifier: string | number): Promise<OrderRow | null> {
  return findOrderByInvoice(identifier);
}
