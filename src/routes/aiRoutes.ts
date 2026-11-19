import { Router } from 'express';
import { z } from 'zod';
import {
  authenticateJwt,
  authenticateManager,
  authorizeRoles,
} from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateMiddleware';
import * as aiController from '../controllers/aiController';

const router = Router();

const QueueEstimateSchema = z.object({
  outlet: z.string().min(2).max(80).default('Gerai Pusat Celaket'),
  day: z.string().min(2).max(40).default('Hari Ini'),
  timeSlot: z.string().min(3).max(40).default('16:30 - 17:00'),
  distanceKm: z.number().min(0).max(500).optional(),
});

const RecommendationSchema = z.object({
  query: z.string().max(200).optional().default(''),
  budget: z.coerce.number().positive().optional(),
  preference: z.string().max(120).optional().default(''),
});

const VerifyAiSchema = z.object({
  verification_status: z.enum(['verified', 'rejected']),
  verification_notes: z.string().max(300).optional(),
});

// Estimasi antrean cerdas AI
router.post(
  '/queue-estimator',
  authenticateJwt,
  authorizeRoles('customer', 'owner', 'cashier', 'manager'),
  validateBody(QueueEstimateSchema),
  aiController.estimateQueue
);

// Rekomendasi menu AI
router.post(
  '/recommendation',
  authenticateJwt,
  authorizeRoles('customer', 'owner', 'cashier', 'manager'),
  validateBody(RecommendationSchema),
  aiController.recommendMenu
);

// Data AI terverifikasi terkini untuk mobile
router.get('/verified-latest', aiController.getVerifiedLatest);

// Panel Audit & Verifikasi Manajer
router.get('/stats', authenticateManager, aiController.getAiStats);
router.get('/logs', authenticateManager, aiController.getAiLogs);
router.patch(
  '/logs/:id/verify',
  authenticateManager,
  validateBody(VerifyAiSchema),
  aiController.verifyAiLog
);

export default router;
