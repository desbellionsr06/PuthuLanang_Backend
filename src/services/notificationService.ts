import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { getFirebaseMessaging } from '../config/firebase';
import { logger } from '../config/logger';

export interface SendPushNotificationOptions {
  data?: Record<string, string>;
  channelId?: string;
}

/**
 * Mengirim push notification ke perangkat Flutter user melalui FCM HTTP v1
 * menggunakan library `firebase-admin` dan menyimpan riwayat di MySQL `push_notifications_log`.
 */
export async function sendPushNotificationToUser(
  userId: number,
  title: string,
  body: string,
  options?: SendPushNotificationOptions
): Promise<void> {
  // 1. Simpan audit log awal di database dengan status 'queued'
  const [logRes] = await db.query<ResultSetHeader>(
    'INSERT INTO push_notifications_log (user_id, title, body, status) VALUES (?, ?, ?, ?)',
    [userId, title, body, 'queued']
  );
  const logId = logRes.insertId;

  // 2. Ambil token FCM perangkat pengguna dari tabel users
  const [userRows] = await db.query<RowDataPacket[]>(
    'SELECT fcm_token FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  const fcmToken = userRows[0]?.fcm_token as string | undefined;
  if (!fcmToken || !fcmToken.trim()) {
    logger.debug(
      { userId, logId },
      'User tidak memiliki FCM token terdaftar. Notifikasi tersimpan di log database.'
    );
    return;
  }

  // 3. Dapatkan instance Firebase Messaging (FCM HTTP v1)
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    logger.warn(
      { userId, logId },
      'FCM HTTP v1 tidak aktif (GOOGLE_APPLICATION_CREDENTIALS belum diatur / file tidak ditemukan). Notifikasi disimpan sebagai queued di database.'
    );
    return;
  }

  // 4. Kirim menggunakan API FCM HTTP v1 melalui Firebase Admin SDK
  try {
    const stringData: Record<string, string> = {
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      type: 'PUTHU_UPDATE',
      userId: String(userId),
      notificationId: String(logId),
      ...(options?.data ?? {}),
    };

    const messageResponse = await messaging.send({
      token: fcmToken.trim(),
      notification: {
        title,
        body,
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: options?.channelId || 'puthu_lanang_channel',
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound: 'default',
            badge: 1,
          },
        },
      },
    });

    await db.query('UPDATE push_notifications_log SET status = ? WHERE id = ?', [
      'sent',
      logId,
    ]);

    logger.info(
      { userId, logId, messageId: messageResponse },
      'Push notification FCM HTTP v1 berhasil dikirim ke perangkat user.'
    );
  } catch (error) {
    logger.error(
      { err: error, userId, logId },
      'Gagal mengirim Push Notification via FCM HTTP v1.'
    );

    await db.query('UPDATE push_notifications_log SET status = ? WHERE id = ?', [
      'failed',
      logId,
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
