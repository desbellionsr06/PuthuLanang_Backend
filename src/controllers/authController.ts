import { Request, Response } from 'express';
import { env } from '../config/env';
import { verifyJwtToken } from '../middlewares/authMiddleware';
import * as authService from '../services/authService';
import { AuthenticatedRequest } from '../types';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const data = await authService.loginCustomer(req.body.no_whatsapp, req.body.password);
    res.json({ message: 'Login berhasil', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login gagal.';
    res.status(400).json({ message });
  }
}

export async function verifySession(req: Request, res: Response): Promise<void> {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    res.status(401).json({ valid: false, message: 'Token tidak disertakan.' });
    return;
  }

  const payload = verifyJwtToken(bearer);
  if (!payload) {
    res.status(401).json({ valid: false, message: 'Token tidak valid atau sudah kedaluwarsa.' });
    return;
  }

  try {
    const user = await authService.verifyActiveSession(payload.id);
    if (!user) {
      res.status(401).json({ valid: false, message: 'Akun tidak ditemukan atau sudah dihapus.' });
      return;
    }
    res.json({ valid: true, user });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memverifikasi sesi.';
    res.status(500).json({ valid: false, message });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const data = await authService.registerCustomer(
      req.body.nama,
      req.body.no_whatsapp,
      req.body.password
    );
    res.json({ message: 'Registrasi berhasil!', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registrasi gagal.';
    res.status(400).json({ message });
  }
}

export async function sendOtp(req: Request, res: Response): Promise<void> {
  const { no_whatsapp, type } = req.body;
  if (!no_whatsapp) {
    res.status(400).json({ message: 'Nomor WhatsApp wajib diisi.' });
    return;
  }

  try {
    const result = await authService.sendOtpCode(String(no_whatsapp), type);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengirim OTP.';
    const status = message.includes('WhatsApp') && !env.DEV_MODE ? 502 : 400;
    res.status(status).json({ success: false, message });
  }
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { nama, no_whatsapp, password, otp_code, is_register } = req.body;
  if (!no_whatsapp || !otp_code) {
    res.status(400).json({ message: 'Nomor WhatsApp dan kode OTP wajib diisi.' });
    return;
  }

  try {
    const result = await authService.verifyOtpCode({
      nama,
      no_whatsapp: String(no_whatsapp),
      password,
      otp_code: String(otp_code),
      is_register: Boolean(is_register),
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verifikasi OTP gagal.';
    res.status(400).json({ message });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { no_whatsapp, otp_code, new_password } = req.body;
  if (!no_whatsapp || !otp_code || !new_password) {
    res.status(400).json({ message: 'Semua kolom wajib diisi.' });
    return;
  }

  try {
    await authService.resetPasswordWithOtp(
      String(no_whatsapp),
      String(otp_code),
      String(new_password)
    );
    res.json({ message: 'Password berhasil diubah. Silakan masuk dengan password baru.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengubah password.';
    res.status(400).json({ message });
  }
}

export async function issueManagerToken(req: Request, res: Response): Promise<void> {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== env.ADMIN_SECRET) {
    res.status(403).json({ message: 'Kunci admin tidak valid.' });
    return;
  }

  try {
    const result = await authService.issueManagerJwtToken(
      req.body.email,
      req.body.nama,
      req.body.role
    );
    res.json(result);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Gagal menerbitkan token manajer.';
    const statusCode = err?.statusCode || (message.includes('403') || message.includes('maksimal 3') ? 403 : 500);
    res.status(statusCode).json({ message });
  }
}

export async function updateFcmToken(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await authService.updateUserFcmToken(req.user!.id, req.body.fcm_token);
    res.json({ status: 'success', message: 'FCM token perangkat berhasil disinkronkan.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan FCM token.';
    res.status(500).json({ status: 'error', message });
  }
}

