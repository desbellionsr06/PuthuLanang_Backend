import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { env } from './env';
import { logger } from './logger';

let initialized = false;

/**
 * Inisialisasi Firebase Admin SDK menggunakan kredensial dari path file JSON
 * yang merujuk pada process.env.GOOGLE_APPLICATION_CREDENTIALS.
 */
export function initializeFirebase(): App | null {
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    initialized = true;
    return existingApps[0];
  }

  const credentialsPath =
    env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    logger.warn(
      'GOOGLE_APPLICATION_CREDENTIALS belum diatur di .env. FCM HTTP v1 dalam mode bypass (notifikasi dicatat ke database tanpa kirim FCM langsung).'
    );
    return null;
  }

  // Handle path absolut atau path relatif terhadap root Backend / process.cwd()
  const resolvedPath = path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(process.cwd(), credentialsPath);

  if (!fs.existsSync(resolvedPath)) {
    logger.warn(
      `File kredensial Firebase tidak ditemukan di: "${resolvedPath}". FCM HTTP v1 dinonaktifkan.`
    );
    return null;
  }

  try {
    const app = initializeApp({
      credential: cert(resolvedPath),
    });
    initialized = true;
    logger.info(`Firebase Admin SDK berhasil diinisialisasi (HTTP v1) via ${resolvedPath}`);
    return app;
  } catch (error) {
    logger.error({ err: error }, 'Gagal menginisialisasi Firebase Admin SDK.');
    return null;
  }
}

export function isFirebaseReady(): boolean {
  if (!initialized && getApps().length === 0) {
    initializeFirebase();
  }
  return getApps().length > 0;
}

export function getFirebaseMessaging(): Messaging | null {
  if (!isFirebaseReady()) {
    return null;
  }
  try {
    return getMessaging();
  } catch {
    return null;
  }
}
