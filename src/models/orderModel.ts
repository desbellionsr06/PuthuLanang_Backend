import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';

export interface OrderRow extends RowDataPacket {
  id: number | string;
  order_id?: string;
  raw_id?: number;
  user_id?: number | null;
  name?: string;
  customer_name?: string;
  phone?: string;
  customer_phone?: string;
  pickup_time?: string;
  pickup_date?: string;
  total?: number;
  payment_method?: string;
  payment_status?: string;
  snap_token?: string | null;
  snap_redirect_url?: string | null;
  status?: string;
  antrean?: number;
  summary_items?: string;
  notes?: string;
  estimated_minutes?: number | null;
  estimated_ready_at?: string | null;
  created_at?: string;
}

export async function insertOrderInDb(data: {
  userId: number;
  name: string;
  phone: string;
  pickupTime: string;
  pickupDate: string;
  total: number;
  notes: string;
  qrToken: string;
  antreanNo: number;
  summaryItems: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  estimatedMinutes?: number | null;
  estimatedReadyAt?: Date | null;
}): Promise<number> {
  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO orders (
       user_id, name, phone, pickup_time, pickup_date, total, notes,
       qr_token, antrean, summary_items, payment_method, payment_status, status,
       estimated_minutes, estimated_ready_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.userId,
      data.name,
      data.phone,
      data.pickupTime,
      data.pickupDate,
      data.total,
      data.notes,
      data.qrToken,
      data.antreanNo,
      data.summaryItems,
      data.paymentMethod,
      data.paymentStatus,
      data.status,
      data.estimatedMinutes ?? null,
      data.estimatedReadyAt ? data.estimatedReadyAt.toISOString().slice(0, 19).replace('T', ' ') : null,
    ]
  );
  return res.insertId;
}

export async function updateOrderSnapInDb(
  orderId: number,
  snapToken: string,
  snapRedirectUrl: string
): Promise<void> {
  await db.query(
    'UPDATE orders SET snap_token = ?, snap_redirect_url = ? WHERE id = ?',
    [snapToken, snapRedirectUrl, orderId]
  );
}

export async function findOrdersByUserId(userId: number): Promise<OrderRow[]> {
  const [rows] = await db.query<OrderRow[]>(
    `SELECT
       CONCAT('ORD-', id) AS id,
       CONCAT('ORD-', id) AS order_id,
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
       estimated_minutes,
       DATE_FORMAT(estimated_ready_at, '%Y-%m-%d %H:%i:%s') AS estimated_ready_at,
       created_at
     FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows;
}

export async function findOrderById(orderId: number): Promise<OrderRow | null> {
  const [rows] = await db.query<OrderRow[]>(
    `SELECT
       CONCAT('ORD-', id) AS id,
       CONCAT('ORD-', id) AS order_id,
       id AS raw_id,
       user_id,
       name,
       name AS customer_name,
       phone,
       phone AS customer_phone,
       pickup_time,
       DATE_FORMAT(pickup_date, '%Y-%m-%d') AS pickup_date,
       total,
       COALESCE(payment_method, 'cash') AS payment_method,
       COALESCE(payment_status, 'pending') AS payment_status,
       snap_token,
       snap_redirect_url,
       status,
       antrean,
       qr_token AS qr_code_token,
       summary_items,
       notes,
       estimated_minutes,
       DATE_FORMAT(estimated_ready_at, '%Y-%m-%d %H:%i:%s') AS estimated_ready_at,
       created_at
     FROM orders
     WHERE id = ? LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

/**
 * Endpoint invoice / lookup pesanan berdasarkan ID (mendukung format ORD-xxx atau numeric)
 */
export async function findOrderByInvoice(identifier: string | number): Promise<OrderRow | null> {
  const cleanStr = String(identifier).replace(/^ORD-/i, '').trim();
  const numericId = parseInt(cleanStr, 10);
  if (Number.isInteger(numericId) && numericId > 0) {
    return findOrderById(numericId);
  }
  // Fallback pencarian via qr_token jika bukan id numerik
  const [rows] = await db.query<OrderRow[]>(
    `SELECT
       CONCAT('ORD-', id) AS id,
       CONCAT('ORD-', id) AS order_id,
       id AS raw_id,
       user_id,
       name,
       name AS customer_name,
       phone,
       phone AS customer_phone,
       pickup_time,
       DATE_FORMAT(pickup_date, '%Y-%m-%d') AS pickup_date,
       total,
       COALESCE(payment_method, 'cash') AS payment_method,
       COALESCE(payment_status, 'pending') AS payment_status,
       snap_token,
       snap_redirect_url,
       status,
       antrean,
       qr_token AS qr_code_token,
       summary_items,
       notes,
       estimated_minutes,
       DATE_FORMAT(estimated_ready_at, '%Y-%m-%d %H:%i:%s') AS estimated_ready_at,
       created_at
     FROM orders
     WHERE qr_token = ? LIMIT 1`,
    [String(identifier)]
  );
  return rows[0] || null;
}

export async function markOrderCompleteInDb(orderId: number, userId: number): Promise<boolean> {
  const [res] = await db.query<ResultSetHeader>(
    "UPDATE orders SET status = 'Selesai', payment_status = 'settlement' WHERE id = ? AND user_id = ?",
    [orderId, userId]
  );
  return res.affectedRows > 0;
}

export async function getAdminOrdersFromDb(status?: string): Promise<OrderRow[]> {
  let query = `
    SELECT
      CONCAT('ORD-', o.id) AS id,
      CONCAT('ORD-', o.id) AS order_id,
      o.id AS raw_id,
      o.user_id,
      o.name,
      o.name AS customer_name,
      o.phone,
      o.phone AS customer_phone,
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
      o.estimated_minutes,
      DATE_FORMAT(o.estimated_ready_at, '%Y-%m-%d %H:%i:%s') AS estimated_ready_at,
      o.created_at
    FROM orders o
  `;
  const params: any[] = [];
  if (status && status !== 'Semua') {
    query += ' WHERE o.status = ?';
    params.push(status);
  }
  query += ' ORDER BY o.created_at DESC, o.id DESC';

  const [rows] = await db.query<OrderRow[]>(query, params);
  return rows;
}

export async function updateAdminOrderStatusInDb(
  orderId: number,
  status: string,
  estimatedMinutes?: number
): Promise<boolean> {
  const updates: string[] = ['status = ?'];
  const values: any[] = [status];

  if (status === 'Selesai') {
    updates.push("payment_status = 'settlement'");
  }

  if (estimatedMinutes !== undefined && Number.isInteger(estimatedMinutes) && estimatedMinutes > 0) {
    updates.push('estimated_minutes = ?');
    values.push(estimatedMinutes);

    updates.push('estimated_ready_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)');
    values.push(estimatedMinutes);
  }

  values.push(orderId);
  const [updateRes] = await db.query<ResultSetHeader>(
    `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
    values
  );

  return updateRes.affectedRows > 0;
}

export async function getAdminStatsFromDb() {
  const [[ordersRow], [newOrdersRow], [menuRow], [customersRow]] = await Promise.all([
    db.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM orders'),
    db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Baru', 'Sedang Dikukus', 'Menunggu Pembayaran', 'Diproses')"
    ),
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

export async function countActiveOrdersInDb(): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS active_orders FROM orders WHERE status IN ('Baru', 'Diproses', 'Sedang Dikukus')"
  );
  return Number(rows[0]?.active_orders ?? 0);
}

export async function getSalesChartFromDb(rawDays?: number) {
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
