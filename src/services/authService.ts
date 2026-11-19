import { env } from '../config/env';
import { logger } from '../config/logger';
import { signJwtToken } from '../middlewares/authMiddleware';
import * as userModel from '../models/userModel';
import { JwtUserPayload, UserRole } from '../types';
import { sendWhatsAppMessage } from './whatsapp.service';

export async function loginCustomer(noWhatsapp: string, password: string) {
  const user = await userModel.findUserByPhone(noWhatsapp);

  if (!user || user.password !== password) {
    throw new Error('Nomor WhatsApp atau password salah.');
  }

  const roleName = String(user.role_name || 'customer').toLowerCase();
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
  const user = await userModel.findUserById(userId);
  if (!user) {
    return null;
  }

  return {
    id: Number(user.id),
    nama: String(user.nama),
    no_whatsapp: String(user.no_whatsapp),
    role: (user.role_name === 'manager' ? 'manager' : 'customer') as UserRole,
  };
}

export async function registerCustomer(nama: string, noWhatsapp: string, password: string) {
  const existing = await userModel.findUserByPhone(noWhatsapp);
  if (existing) {
    throw new Error('Nomor WhatsApp sudah terdaftar. Silakan masuk.');
  }

  const newUserId = await userModel.createUser({
    role_id: 1,
    nama,
    no_whatsapp: noWhatsapp,
    password,
    is_verified: 1,
  });

  const payload: JwtUserPayload = {
    id: newUserId,
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
  const existing = await userModel.findUserByPhone(noWhatsapp);
  const isExist = !!existing;

  if (type === 'register' && isExist) {
    throw new Error('Nomor WhatsApp sudah terdaftar. Silakan masuk.');
  }
  if (type === 'forgot' && !isExist) {
    throw new Error('Akun belum terdaftar. Silakan daftar terlebih dahulu.');
  }

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await userModel.createOtpCode(noWhatsapp, otpCode, expiresAt);

  const templatePesan =
    `🔒 *KODE OTP PUTHU LANANG MALANG*\n\n` +
    `Halo! Kode verifikasi Anda adalah: *${otpCode}*\n\n` +
    `⏱️ Kode ini berlaku selama *5 menit*.\n` +
    `⚠️ JANGAN bagikan kode ini kepada siapa pun demi keamanan akun Anda.\n\n` +
    `_Puthu Lanang Malang — Cita Rasa Pusaka Sejak 1935_`;

  try {
    await sendWhatsAppMessage(noWhatsapp, templatePesan);
    return {
      success: true,
      message: 'Kode OTP berhasil dikirim ke nomor WhatsApp Anda.',
    };
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : error, noWhatsapp },
      'Gagal mengirim OTP WhatsApp via Fonnte'
    );

    if (env.DEV_MODE) {
      return {
        success: true,
        message: 'Kode OTP sedang diproses (Dev Mode aktif).',
      };
    }

    throw new Error(
      'Gagal mengirim pesan OTP ke nomor WhatsApp. Pastikan nomor aktif atau coba lagi beberapa saat.'
    );
  }
}

export async function verifyOtpCode(params: {
  no_whatsapp: string;
  otp_code: string;
  nama?: string;
  password?: string;
  is_register?: boolean;
}) {
  const validOtp = await userModel.findValidOtp(params.no_whatsapp, params.otp_code);
  if (!validOtp) {
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
  await userModel.deleteOtpByPhone(params.no_whatsapp);

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

  const validOtp = await userModel.findValidOtp(noWhatsapp, otpCode);
  if (!validOtp) {
    throw new Error('Kode OTP salah atau sudah kedaluwarsa.');
  }

  const updated = await userModel.updateUserPassword(noWhatsapp, newPassword);
  if (!updated) {
    throw new Error('Akun tidak ditemukan.');
  }

  await userModel.deleteOtpByPhone(noWhatsapp);
}

/**
 * Menerbitkan JWT Token resmi untuk peran Pemantau/Manajer (Next.js Web Admin)
 * berdasarkan email Google OAuth yang sudah terverifikasi di server Next.js.
 * Membatasi maksimal 3 akun admin sah.
 */
export async function issueManagerJwtToken(
  email: string,
  nama: string,
  role: 'owner' | 'cashier' | 'manager' = 'owner'
) {
  const cleanEmail = email.trim().toLowerCase();
  const roleId = role === 'cashier' ? 3 : 2;

  // upsertManagerUser akan membatasi maksimal 3 admin
  const managerId = await userModel.upsertManagerUser(cleanEmail, nama, roleId);

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
  await userModel.updateUserFcmToken(userId, fcmToken);
}
