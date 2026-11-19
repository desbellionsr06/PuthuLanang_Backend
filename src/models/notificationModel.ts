import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';

export interface NotificationRow extends RowDataPacket {
  id: number;
  user_id: number;
  title: string;
  body: string;
  status: string;
  is_read: number;
  created_at: string;
}

export async function createNotificationLogInDb(
  userId: number,
  title: string,
  body: string,
  status = 'queued'
): Promise<number> {
  const [logRes] = await db.query<ResultSetHeader>(
    'INSERT INTO push_notifications_log (user_id, title, body, status) VALUES (?, ?, ?, ?)',
    [userId, title, body, status]
  );
  return logRes.insertId;
}

export async function updateNotificationStatusInDb(
  logId: number,
  status: 'sent' | 'failed' | 'queued'
): Promise<void> {
  await db.query('UPDATE push_notifications_log SET status = ? WHERE id = ?', [status, logId]);
}

export async function findNotificationsByUserIdFromDb(userId: number): Promise<NotificationRow[]> {
  const [rows] = await db.query<NotificationRow[]>(
    `SELECT id, title, body, status, is_read, created_at
     FROM push_notifications_log
     WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 30`,
    [userId]
  );
  return rows;
}

export async function markNotificationsReadInDb(userId: number): Promise<void> {
  await db.query('UPDATE push_notifications_log SET is_read = 1 WHERE user_id = ?', [userId]);
}

