import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import {
  authenticateJwt,
  verifyJwtToken,
} from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateMiddleware';
import * as authService from '../services/authService';
import { AuthenticatedRequest } from '../types';

const router = Router();

const LoginSchema = z.object({
  no_whatsapp: z.string().min(3, 'Nomor WhatsApp wajib diisi.'),
  password: z.string().min(1, 'Password wajib diisi.'),
});

const RegisterSchema = z.object({
  nama: z.string().min(2, 'Nama wajib diisi.'),
  no_whatsapp: z.string().min(6, 'Nomor WhatsApp wajib diisi.'),
  password: z.string().min(6, 'Password minimal 6 karakter.'),
});

const ManagerTokenSchema = z.object({
  email: z.string().email('Email manajer tidak valid.'),
  nama: z.string().min(1).max(100).default('Manajer Puthu Lanang'),
});

const FcmTokenSchema = z.object({
  fcm_token: z.string().min(10, 'FCM token tidak valid.').max(255),
});

router.post('/user-login', validateBody(LoginSchema), async (req: Request, res: Response) => {
  try {
    const data = await authService.loginCustomer(req.body.no_whatsapp, req.body.password);
    res.json({ message: 'Login berhasil', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login gagal.';
    res.status(400).json({ message });
  }
});

router.post('/verify-session', async (req: Request, res: Response) => {
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
});

router.post('/user-register', validateBody(RegisterSchema), async (req: Request, res: Response) => {
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
});

router.post('/send-otp', async (req: Request, res: Response) => {
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
});

router.post('/verify-otp', async (req: Request, res: Response) => {
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
});

router.post('/forgot-password', async (req: Request, res: Response) => {
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
});

/**
 * POST /api/auth/manager-token
 * Menukar sesi NextAuth Google OAuth (Web Admin) + ADMIN_SECRET menjadi JWT Token peran 'manager'.
 */
router.post(
  '/manager-token',
  validateBody(ManagerTokenSchema),
  async (req: Request, res: Response) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== env.ADMIN_SECRET) {
      res.status(403).json({ message: 'Kunci admin tidak valid.' });
      return;
    }

    try {
      const result = await authService.issueManagerJwtToken(req.body.email, req.body.nama);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menerbitkan token manajer.';
      res.status(500).json({ message });
    }
  }
);

/**
 * PATCH /api/auth/fcm-token
 * Menyimpan/memperbarui FCM token perangkat Flutter untuk Push Notification.
 */
router.patch(
  '/fcm-token',
  authenticateJwt,
  validateBody(FcmTokenSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await authService.updateUserFcmToken(req.user!.id, req.body.fcm_token);
      res.json({ status: 'success', message: 'FCM token perangkat berhasil disinkronkan.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan FCM token.';
      res.status(500).json({ status: 'error', message });
    }
  }
);

export default router;
