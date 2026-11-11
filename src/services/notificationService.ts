import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { env } from '../config/env';

/**
 * Mengirim push notification ke perangkat Flutter user melalui FCM API dan menyimpan log di MySQL.
 */
export async function sendPushNotificationToUser(
  userId: number,
  title: string,
  body: string
): Promise<void> {
  const [logRes] = await db.query<ResultSetHeader>(
    'INSERT INTO push_notifications_log (user_id, title, body, status) VALUES (?, ?, ?, ?)',
    [userId, title, body, 'queued']
  );

  const [userRows] = await db.query<RowDataPacket[]>(
    'SELECT fcm_token FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  const fcmToken = userRows[0]?.fcm_token as string | undefined;
  if (!fcmToken || !env.FCM_SERVER_KEY) {
    return;
  }

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${env.FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: fcmToken,
        notification: { title, body },
        data: { click_action: 'FLUTTER_NOTIFICATION_CLICK', type: 'PUTHU_UPDATE' },
      }),
    });

    await db.query('UPDATE push_notifications_log SET status = ? WHERE id = ?', [
      response.ok ? 'sent' : 'failed',
      logRes.insertId,
    ]);
  } catch {
    await db.query('UPDATE push_notifications_log SET status = ? WHERE id = ?', [
      'failed',
      logRes.insertId,
    ]);
  }
}

export async function getUserNotifications(userId: number): Promise<RowDataPacket[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, title, body, status, is_read, created_at
     FROM push_notifications_log
     WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 30`,
    [userId]
  );
  return rows;
}

export async function markUserNotificationsRead(userId: number): Promise<void> {
  await db.query('UPDATE push_notifications_log SET is_read = 1 WHERE user_id = ?', [userId]);
}

