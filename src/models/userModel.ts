import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { AppError } from '../errors/AppError';

export interface UserRow extends RowDataPacket {
  id: number;
  role_id: number;
  nama: string;
  no_whatsapp: string;
  password?: string;
  fcm_token?: string | null;
  is_verified?: number;
  role_name?: string;
  created_at?: string;
}

export interface OtpRow extends RowDataPacket {
  id: number;
  no_whatsapp: string;
  otp_code: string;
  expires_at: string;
}

/**
 * Mencari user berdasarkan ID dengan join tabel roles
 */
export async function findUserById(userId: number): Promise<UserRow | null> {
  const [rows] = await db.query<UserRow[]>(
    `SELECT u.id, u.role_id, u.nama, u.no_whatsapp, u.password, u.fcm_token, u.is_verified,
            COALESCE(r.name, 'customer') AS role_name
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Mencari user berdasarkan nomor WhatsApp
 */
export async function findUserByPhone(phone: string): Promise<UserRow | null> {
  const [rows] = await db.query<UserRow[]>(
    `SELECT u.id, u.role_id, u.nama, u.no_whatsapp, u.password, u.fcm_token, u.is_verified,
            COALESCE(r.name, 'customer') AS role_name
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.no_whatsapp = ? LIMIT 1`,
    [phone]
  );
  return rows[0] || null;
}

/**
 * Membuat user baru di database
 */
export async function createUser(data: {
  role_id?: number;
  nama: string;
  no_whatsapp: string;
  password?: string;
  is_verified?: number;
}): Promise<number> {
  const roleId = data.role_id || 1;

  // Validasi pembatasan akun admin maksimal 3 akun
  if ([2, 3, 4].includes(roleId)) {
    const adminCount = await countAdminAccounts();
    if (adminCount >= 3) {
      throw new AppError(
        'Akses ditolak (403 Forbidden). Kuota akun admin telah mencapai batas maksimal (maksimal 3 akun: 1 Owner dan 2 Kasir/Admin).',
        403
      );
    }
  }

  const [result] = await db.query<ResultSetHeader>(
    'INSERT INTO users (role_id, nama, no_whatsapp, password, is_verified) VALUES (?, ?, ?, ?, ?)',
    [
      roleId,
      data.nama,
      data.no_whatsapp,
      data.password || '',
      data.is_verified ?? 1,
    ]
  );
  return result.insertId;
}

/**
 * Memperbarui password user
 */
export async function updateUserPassword(phone: string, newPassword: string): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'UPDATE users SET password = ? WHERE no_whatsapp = ?',
    [newPassword, phone]
  );
  return result.affectedRows > 0;
}

/**
 * Memperbarui token FCM perangkat
 */
export async function updateUserFcmToken(userId: number, fcmToken: string): Promise<void> {
  await db.query('UPDATE users SET fcm_token = ? WHERE id = ?', [fcmToken, userId]);
}

/**
 * Menghitung jumlah akun admin/manajer (Owner, Cashier, Manager) yang terdaftar di database
 */
export async function countAdminAccounts(): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS total FROM users WHERE role_id IN (2, 3, 4)'
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Mengambil daftar akun admin/manajer sah yang terdaftar (maksimal 3 akun)
 */
export async function getAdminAccounts(limit = 3): Promise<UserRow[]> {
  const [rows] = await db.query<UserRow[]>(
    `SELECT u.id, u.role_id, u.nama, u.no_whatsapp, COALESCE(r.name, 'manager') AS role_name
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.role_id IN (2, 3, 4)
     ORDER BY u.id ASC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

/**
 * Memeriksa apakah user tertentu (ID atau nomor telepon / email) merupakan salah satu dari 3 admin sah
 */
export async function isAuthorizedAdmin(identifier: number | string): Promise<boolean> {
  // Ambil maksimal 3 admin sah pertama dari database
  const admins = await getAdminAccounts(3);
  if (typeof identifier === 'number') {
    return admins.some((adm) => Number(adm.id) === identifier);
  }
  const clean = identifier.trim().toLowerCase();
  return admins.some((adm) => adm.no_whatsapp.trim().toLowerCase() === clean);
}

/**
 * Menyimpan / memperbarui akun manajer via Google OAuth
 */
export async function upsertManagerUser(
  email: string,
  nama: string,
  roleId: number
): Promise<number> {
  const cleanEmail = email.trim().toLowerCase();
  const existing = await findUserByPhone(cleanEmail);

  if (!existing) {
    // Validasi pembatasan: maksimal 3 admin
    const currentAdminCount = await countAdminAccounts();
    if (currentAdminCount >= 3) {
      throw new AppError(
        'Akses ditolak (403 Forbidden). Kuota akun admin telah mencapai batas maksimal (maksimal 3 akun: 1 Owner dan 2 Kasir/Admin).',
        403
      );
    }

    const [insertRes] = await db.query<ResultSetHeader>(
      'INSERT INTO users (role_id, nama, no_whatsapp, password, is_verified) VALUES (?, ?, ?, ?, 1)',
      [roleId, nama, cleanEmail, 'google-oauth-admin']
    );
    return insertRes.insertId;
  }

  // Jika sudah terdaftar sebagai admin, perbarui data nama & role
  await db.query('UPDATE users SET role_id = ?, nama = ? WHERE id = ?', [
    roleId,
    nama,
    existing.id,
  ]);
  return existing.id;
}

// ----------------- OTP Model Queries -----------------

export async function deleteOtpByPhone(noWhatsapp: string): Promise<void> {
  await db.query('DELETE FROM otp_codes WHERE no_whatsapp = ?', [noWhatsapp]);
}

export async function createOtpCode(
  noWhatsapp: string,
  otpCode: string,
  expiresAt: Date
): Promise<void> {
  await deleteOtpByPhone(noWhatsapp);
  await db.query('INSERT INTO otp_codes (no_whatsapp, otp_code, expires_at) VALUES (?, ?, ?)', [
    noWhatsapp,
    otpCode,
    expiresAt,
  ]);
}

export async function findValidOtp(noWhatsapp: string, otpCode: string): Promise<OtpRow | null> {
  const [rows] = await db.query<OtpRow[]>(
    `SELECT * FROM otp_codes
     WHERE no_whatsapp = ? AND otp_code = ? AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [noWhatsapp, otpCode]
  );
  return rows[0] || null;
}
