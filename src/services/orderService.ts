import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { logger } from '../config/logger';
import { JwtUserPayload } from '../types';
import { createMidtransTransaction } from './midtransService';
import { sendPushNotificationToUser } from './notificationService';

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
}

/**
 * Membuat pesanan baru pelanggan (Takeaway / Dine-in).
 * Mendukung metode pembayaran:
 * - 'cash': Bayar langsung di kasir saat pengambilan (tanpa Midtrans)
 * - 'qris' / 'transfer': Terintegrasi dengan Midtrans Snap SDK (Sandbox)
 */
export async function createOrder(user: JwtUserPayload, input: CreateOrderInput) {
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

  // 1. Simpan pesanan ke database MySQL
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO orders (user_id, name, phone, pickup_time, pickup_date, total, notes, qr_token, antrean, summary_items, payment_method, payment_status, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.nama,
      user.no_whatsapp,
      input.pickupTime || '-',
      pickupDateValue,
      input.total,
      input.notes || '',
      qrToken,
      antreanNo,
      summaryItems,
      paymentMethod,
      initialPaymentStatus,
      initialOrderStatus,
    ]
  );

  const orderId = res.insertId;
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

      await db.query(
        'UPDATE orders SET snap_token = ?, snap_redirect_url = ? WHERE id = ?',
        [snapToken, snapRedirectUrl, orderId]
      );
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
    name: user.nama,
    phone: user.no_whatsapp,
    pickup_time: input.pickupTime || '-',
    pickup_date: pickupDateValue,
    notes: input.notes || '',
    summary_items: summaryItems,
    items: input.items || [],
  };
}

export async function getOrdersForUser(userId: number): Promise<RowDataPacket[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       CONCAT('ORD-', id) AS id,
       qr_token AS qr_code_token,
       antrean,
       status,
       total,
       COALESCE(payment_method, 'cash') AS payment_method,
       COALESCE(payment_status, 'pending') AS payment_status,
       snap_token,
       snap_redirect_url,
       summary_items,
       pickup_time,
       DATE_FORMAT(pickup_date, '%Y-%m-%d') AS pickup_date,
       notes,
       created_at
     FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows;
}

export async function markOrderComplete(orderId: number, userId: number): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, status FROM orders WHERE id = ? AND user_id = ? LIMIT 1',
    [orderId, userId]
  );

  if (rows.length === 0) {
    throw new Error('Pesanan tidak ditemukan atau Anda tidak memiliki akses.');
  }

  await db.query(
    "UPDATE orders SET status = 'Selesai', payment_status = 'settlement' WHERE id = ? AND user_id = ?",
    [orderId, userId]
  );
}

export async function getAdminOrders(status?: string): Promise<RowDataPacket[]> {
  let query = `
    SELECT
      CONCAT('ORD-', o.id) AS id,
      o.id AS raw_id,
      o.user_id,
      o.name,
      o.phone,
      o.pickup_time,
      DATE_FORMAT(o.pickup_date, '%Y-%m-%d') AS pickup_date,
      o.total,
      COALESCE(o.payment_method, 'cash') AS payment_method,
      COALESCE(o.payment_status, 'pending') AS payment_status,
      o.snap_token,
      o.snap_redirect_url,
      o.status,
      o.antrean,
      o.summary_items,
      o.notes,
      o.created_at
    FROM orders o
  `;
  const params: any[] = [];
  if (status && status !== 'Semua') {
    query += ' WHERE o.status = ?';
    params.push(status);
  }
  query += ' ORDER BY o.created_at DESC, o.id DESC';

  const [rows] = await db.query<RowDataPacket[]>(query, params);
  return rows;
}

export async function updateAdminOrderStatus(
  orderId: number,
  status: string
): Promise<boolean> {
  const paymentUpdate = status === 'Selesai' ? ", payment_status = 'settlement'" : '';
  const [updateRes] = await db.query<ResultSetHeader>(
    `UPDATE orders SET status = ? ${paymentUpdate} WHERE id = ?`,
    [status, orderId]
  );

  if (updateRes.affectedRows === 0) return false;

  const [orderRows] = await db.query<RowDataPacket[]>(
    'SELECT user_id, antrean FROM orders WHERE id = ? LIMIT 1',
    [orderId]
  );
  const userId = orderRows[0]?.user_id as number | null | undefined;
  if (userId && userId > 0) {
    const antrean = orderRows[0]?.antrean ?? '-';
    await sendPushNotificationToUser(
      userId,
      `Status Pesanan ORD-${orderId} Diperbarui`,
      `Pesanan Anda (Antrean #${antrean}) kini berstatus: ${status}.`
    );
  }

  return true;
}

export async function getAdminStats() {
  const [[ordersRow], [newOrdersRow], [menuRow], [customersRow]] = await Promise.all([
    db.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM orders'),
    db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM orders WHERE status IN ('Baru', 'Sedang Dikukus', 'Menunggu Pembayaran')"),
    db.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM menu'),
    db.query<RowDataPacket[]>('SELECT COUNT(DISTINCT COALESCE(user_id, phone)) AS n FROM orders'),
  ]);

  return {
    total_orders: Number(ordersRow[0]?.n ?? 0),
    new_orders: Number(newOrdersRow[0]?.n ?? 0),
    total_menu: Number(menuRow[0]?.n ?? 0),
    total_customers: Number(customersRow[0]?.n ?? 0),
  };
}

export async function getSalesChartData(rawDays?: number) {
  const days = Math.min(Math.max(rawDays || 7, 1), 90);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       DATE(created_at) AS day,
       DATE_FORMAT(created_at, '%d/%m') AS label,
       COUNT(*) AS total_orders,
       COALESCE(SUM(total), 0) AS total_revenue
     FROM orders
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY DATE(created_at) ASC`,
    [days - 1]
  );

  const result: any[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const found = rows.find(
      (r) => r.day && new Date(r.day).toISOString().slice(0, 10) === dateStr
    );
    result.push({
      date: dateStr,
      label,
      total_orders: found ? Number(found.total_orders) : 0,
      total_revenue: found ? Number(found.total_revenue) : 0,
    });
  }

  return {
    days,
    data: result,
    labels: result.map((r) => r.label),
    orders: result.map((r) => r.total_orders),
    revenue: result.map((r) => r.total_revenue),
  };
}
