import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { JwtUserPayload } from '../types';
import { sendPushNotificationToUser } from './notificationService';

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface OrderItemPayload {
  quantity?: number;
  qty?: number;
  nama?: string;
  name?: string;
}

export async function createOrder(
  user: JwtUserPayload,
  input: {
    pickupTime?: string;
    pickupDate?: string;
    items?: OrderItemPayload[];
    total: number;
    notes?: string;
  }
) {
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

  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO orders (user_id, name, phone, pickup_time, pickup_date, total, notes, qr_token, antrean, summary_items)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ]
  );

  return {
    id: `ORD-${res.insertId}`,
    user_id: user.id,
    qr_code_token: qrToken,
    antrean: antreanNo,
    status: 'Sedang Dikukus',
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
    throw new Error('Pesanan tidak ditemukan untuk akun ini.');
  }
  if (rows[0].status === 'Selesai') return;

  await db.query("UPDATE orders SET status = 'Selesai' WHERE id = ? AND user_id = ?", [
    orderId,
    userId,
  ]);
}

export async function getAdminOrders(status?: string): Promise<RowDataPacket[]> {
  let query = `
    SELECT
      o.id,
      CONCAT('ORD-', o.id) AS order_id,
      o.qr_token AS qr_code_token,
      o.antrean,
      o.status,
      o.total,
      o.name AS customer_name,
      o.phone AS customer_phone,
      o.pickup_time,
      DATE_FORMAT(o.pickup_date, '%Y-%m-%d') AS pickup_date,
      o.notes,
      o.summary_items,
      o.created_at
    FROM orders o
  `;
  const params: unknown[] = [];

  if (status && status !== 'Semua') {
    query += ' WHERE o.status = ?';
    params.push(status);
  }
  query += ' ORDER BY o.created_at DESC, o.id DESC';

  const [rows] = await db.query<RowDataPacket[]>(query, params);
  return rows;
}

export async function updateAdminOrderStatus(orderId: number, status: string): Promise<boolean> {
  const [updateRes] = await db.query<ResultSetHeader>('UPDATE orders SET status = ? WHERE id = ?', [
    status,
    orderId,
  ]);

  if (updateRes.affectedRows === 0) return false;

  // Kirim Push Notification ke pemilik pesanan jika terhubung ke akun user
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
    db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Baru', 'Sedang Dikukus')"
    ),
    db.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM menu'),
    db.query<RowDataPacket[]>(
      'SELECT COUNT(DISTINCT COALESCE(user_id, phone)) AS n FROM orders'
    ),
  ]);

  return {
    total_orders: Number(ordersRow[0]?.n ?? 0),
    new_orders: Number(newOrdersRow[0]?.n ?? 0),
    total_menu: Number(menuRow[0]?.n ?? 0),
    total_customers: Number(customersRow[0]?.n ?? 0),
  };
}

export async function getSalesChartData(rawDays: number) {
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

  const result: Array<{ date: string; label: string; total_orders: number; total_revenue: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const found = rows.find((r) => r.day && new Date(r.day).toISOString().slice(0, 10) === dateStr);
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

