import https from 'https';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { env } from '../config/env';
import { signJwtToken } from '../middlewares/authMiddleware';
import { JwtUserPayload, UserRole } from '../types';

function sendFonnteMessage(targetPhone: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      target: targetPhone,
      message,
      countryCode: '62',
    });

    const req = https.request(
      {
        hostname: 'api.fonnte.com',
        port: 443,
        path: '/send',
        method: 'POST',
        headers: {
          Authorization: env.FONNTE_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          console.log('[FONNTE RESPONSE]:', body);
          resolve(body);
        });
      }
    );

    req.on('error', (err) => {
      console.error('[FONNTE ERROR]:', err.message);
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

export async function loginCustomer(noWhatsapp: string, password: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.nama, u.no_whatsapp, COALESCE(r.name, 'customer') AS role
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.no_whatsapp = ? AND u.password = ? LIMIT 1`,
    [noWhatsapp, password]
  );

  if (rows.length === 0) {
    throw new Error('Nomor WhatsApp atau password salah.');
  }

  const user = rows[0];
  const roleName = String(user.role).toLowerCase();
  const role: UserRole =
    roleName === 'owner'
      ? 'owner'
      : roleName === 'cashier'
      ? 'cashier'
      : roleName === 'manager'
      ? 'manager'
      : 'customer';
  const payload: JwtUserPayload = {
    id: Number(user.id),
    no_whatsapp: String(user.no_whatsapp),
    nama: String(user.nama),
    role,
  };

  return {
    id: payload.id,
    nama: payload.nama,
    no_whatsapp: payload.no_whatsapp,
    role: payload.role,
    token: `server-token-${payload.no_whatsapp}`,
    jwt_token: signJwtToken(payload),
  };
}

export async function verifyActiveSession(userId: number) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.nama, u.no_whatsapp, COALESCE(r.name, 'customer') AS role
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }

  const user = rows[0];
  return {
    id: Number(user.id),
    nama: String(user.nama),
    no_whatsapp: String(user.no_whatsapp),
    role: (user.role === 'manager' ? 'manager' : 'customer') as UserRole,
  };
}

export async function registerCustomer(nama: string, noWhatsapp: string, password: string) {
  const [existing] = await db.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE no_whatsapp = ? LIMIT 1',
    [noWhatsapp]
  );

  if (existing.length > 0) {
    throw new Error('Nomor WhatsApp sudah terdaftar. Silakan masuk.');
  }

  const [result] = await db.query<ResultSetHeader>(
    'INSERT INTO users (role_id, nama, no_whatsapp, password, is_verified) VALUES (1, ?, ?, ?, 1)',
    [nama, noWhatsapp, password]
  );

  const payload: JwtUserPayload = {
    id: result.insertId,
    nama,
    no_whatsapp: noWhatsapp,
    role: 'customer',
  };

  return {
    id: payload.id,
    nama,
    no_whatsapp: noWhatsapp,
    role: 'customer' as UserRole,
    token: `server-token-${noWhatsapp}`,
    jwt_token: signJwtToken(payload),
  };
}

export async function sendOtpCode(noWhatsapp: string, type?: string) {
  const [existing] = await db.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE no_whatsapp = ? LIMIT 1',
    [noWhatsapp]
  );
  const isExist = existing.length > 0;

  if (type === 'register' && isExist) {
    throw new Error('Nomor WhatsApp sudah terdaftar. Silakan masuk.');
  }
  if (type === 'forgot' && !isExist) {
    throw new Error('Akun belum terdaftar. Silakan daftar terlebih dahulu.');
  }

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.query('DELETE FROM otp_codes WHERE no_whatsapp = ?', [noWhatsapp]);
  await db.query('INSERT INTO otp_codes (no_whatsapp, otp_code, expires_at) VALUES (?, ?, ?)', [
    noWhatsapp,
    otpCode,
    expiresAt,
  ]);

  console.log('KODE OTP:', otpCode, `(untuk ${noWhatsapp})`);

  const pesan =
    `🔒 *KODE OTP PUTHU LANANG*\n\n` +
    `Kode verifikasi Anda: *${otpCode}*\n` +
    `Berlaku 5 menit. Jangan berikan kode ini kepada siapa pun.\n\n` +
    `_Puthu Lanang Malang — EST. 1935_`;

  if (env.DEV_MODE) {
    sendFonnteMessage(noWhatsapp, pesan).catch((err) =>
      console.warn('[OTP FONNTE GAGAL]:', err instanceof Error ? err.message : err)
    );
    return { success: true, otp_code: otpCode, message: 'OTP berhasil dikirim' };
  }

  await sendFonnteMessage(noWhatsapp, pesan);
  return { success: true, message: 'Kode OTP berhasil dikirim ke WhatsApp Anda.' };
}

export async function verifyOtpCode(params: {
  no_whatsapp: string;
  otp_code: string;
  nama?: string;
  password?: string;
  is_register?: boolean;
}) {
  const [otpRows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM otp_codes
     WHERE no_whatsapp = ? AND otp_code = ? AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [params.no_whatsapp, params.otp_code]
  );

  if (otpRows.length === 0) {
    throw new Error('Kode OTP salah atau sudah kedaluwarsa.');
  }

  if (!params.is_register) {
    return { message: 'OTP valid. Silakan reset password Anda.' };
  }

  const registered = await registerCustomer(
    params.nama || 'Pelanggan',
    params.no_whatsapp,
    params.password || ''
  );
  await db.query('DELETE FROM otp_codes WHERE no_whatsapp = ?', [params.no_whatsapp]);

  return {
    message: 'Registrasi & Verifikasi Berhasil!',
    data: registered,
  };
}

export async function resetPasswordWithOtp(
  noWhatsapp: string,
  otpCode: string,
  newPassword: string
) {
  if (newPassword.length < 6) {
    throw new Error('Password baru minimal 6 karakter.');
  }

  const [otpRows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM otp_codes
     WHERE no_whatsapp = ? AND otp_code = ? AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [noWhatsapp, otpCode]
  );

  if (otpRows.length === 0) {
    throw new Error('Kode OTP salah atau sudah kedaluwarsa.');
  }

  const [updateRes] = await db.query<ResultSetHeader>(
    'UPDATE users SET password = ? WHERE no_whatsapp = ?',
    [newPassword, noWhatsapp]
  );

  if (updateRes.affectedRows === 0) {
    throw new Error('Akun tidak ditemukan.');
  }

  await db.query('DELETE FROM otp_codes WHERE no_whatsapp = ?', [noWhatsapp]);
}

/**
 * Menerbitkan JWT Token resmi untuk peran Pemantau/Manajer (Next.js Web Admin)
 * berdasarkan email Google OAuth yang sudah terverifikasi di server Next.js.
 */
export async function issueManagerJwtToken(
  email: string,
  nama: string,
  role: 'owner' | 'cashier' | 'manager' = 'owner'
) {
  const cleanEmail = email.trim().toLowerCase();
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, nama, no_whatsapp FROM users WHERE no_whatsapp = ? LIMIT 1',
    [cleanEmail]
  );

  const roleId = role === 'cashier' ? 3 : 2; // 2: owner, 3: cashier
  let managerId: number;
  if (rows.length === 0) {
    const [insertRes] = await db.query<ResultSetHeader>(
      'INSERT INTO users (role_id, nama, no_whatsapp, password, is_verified) VALUES (?, ?, ?, ?, 1)',
      [roleId, nama, cleanEmail, 'google-oauth-admin']
    );
    managerId = insertRes.insertId;
  } else {
    managerId = Number(rows[0].id);
    await db.query('UPDATE users SET role_id = ?, nama = ? WHERE id = ?', [roleId, nama, managerId]);
  }

  const payload: JwtUserPayload = {
    id: managerId,
    no_whatsapp: cleanEmail,
    nama,
    role,
  };

  return {
    jwt_token: signJwtToken(payload),
    user: payload,
  };
}

export async function updateUserFcmToken(userId: number, fcmToken: string): Promise<void> {
  await db.query('UPDATE users SET fcm_token = ? WHERE id = ?', [fcmToken, userId]);
}

