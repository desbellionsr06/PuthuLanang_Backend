import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateMiddleware';
import * as authController from '../controllers/authController';

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
  role: z.enum(['owner', 'cashier', 'manager']).default('owner'),
});

const FcmTokenSchema = z.object({
  fcm_token: z.string().min(10, 'FCM token tidak valid.').max(255),
});

router.post('/user-login', validateBody(LoginSchema), authController.login);
router.post('/verify-session', authController.verifySession);
router.post('/user-register', validateBody(RegisterSchema), authController.register);
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/forgot-password', authController.forgotPassword);
router.post('/manager-token', validateBody(ManagerTokenSchema), authController.issueManagerToken);
router.patch('/fcm-token', authenticateJwt, validateBody(FcmTokenSchema), authController.updateFcmToken);

export default router;
