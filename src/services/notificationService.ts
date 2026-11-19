import { getFirebaseMessaging } from '../config/firebase';
import { logger } from '../config/logger';
import {
  createNotificationLogInDb,
  updateNotificationStatusInDb,
  findNotificationsByUserIdFromDb,
  markNotificationsReadInDb,
  NotificationRow,
} from '../models/notificationModel';
import { findUserById } from '../models/userModel';

export interface SendPushNotificationOptions {
  data?: Record<string, string>;
  channelId?: string;
}

/**
 * Mengirim push notification ke perangkat Flutter user melalui FCM HTTP v1
 * menggunakan library `firebase-admin` dan mencatat riwayat di tabel `push_notifications_log`.
 */
export async function sendPushNotificationToUser(
  userId: number,
  title: string,
  body: string,
  options?: SendPushNotificationOptions
): Promise<void> {
  // 1. Simpan audit log awal di database melalui notificationModel
  const logId = await createNotificationLogInDb(userId, title, body, 'queued');

  // 2. Ambil token FCM perangkat pengguna dari userModel
  const user = await findUserById(userId);
  const fcmToken = user?.fcm_token;
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

    await updateNotificationStatusInDb(logId, 'sent');

    logger.info(
      { userId, logId, messageId: messageResponse },
      'Push notification FCM HTTP v1 berhasil dikirim ke perangkat user.'
    );
  } catch (error) {
    logger.error(
      { err: error, userId, logId },
      'Gagal mengirim Push Notification via FCM HTTP v1.'
    );

    await updateNotificationStatusInDb(logId, 'failed');
  }
}

export async function getUserNotifications(userId: number): Promise<NotificationRow[]> {
  return findNotificationsByUserIdFromDb(userId);
}

export async function markUserNotificationsRead(userId: number): Promise<void> {
  return markNotificationsReadInDb(userId);
}
