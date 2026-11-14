import { Router, Response } from 'express';
import { z } from 'zod';
import {
  authenticateJwt,
  authenticateManager,
  authorizeRoles,
} from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateMiddleware';
import { AiFeatureType, AiVerificationStatus, AuthenticatedRequest } from '../types';
import * as aiQueueService from '../ai-services/aiQueueService';

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

/**
 * POST /api/ai/queue-estimator
 * Digunakan oleh Pengguna Akhir (Mobile Flutter) maupun Manajer dengan JWT Token.
 */
router.post(
  '/queue-estimator',
  authenticateJwt,
  authorizeRoles('customer', 'manager'),
  validateBody(QueueEstimateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { outlet, day, timeSlot, distanceKm } = req.body;
      const { logId, prediction, aiEngine } = await aiQueueService.estimateQueueWithAi({
        userId: req.user?.id,
        outlet,
        day,
        timeSlot,
        distanceKm,
      });

      res.json({
        status: 'success',
        log_id: logId,
        ai_engine: aiEngine,
        verification_status: 'pending',
        outlet,
        day,
        time_slot: timeSlot,
        estimated_wait: `~${prediction.wait_time_min} - ${prediction.wait_time_max} Mnt`,
        ...prediction,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memproses estimasi antrean AI.';
      res.status(400).json({ status: 'error', message });
    }
  }
);

/**
 * POST /api/ai/recommendation
 * Kurasi rekomendasi menu cerdas berbasis Gemini AI (tervalidasi JSON).
 */
router.post(
  '/recommendation',
  authenticateJwt,
  authorizeRoles('customer', 'manager'),
  validateBody(RecommendationSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await aiQueueService.recommendMenuWithAi({
        userId: req.user?.id,
        query: req.body.query,
        budget: req.body.budget,
        preference: req.body.preference,
      });
      res.json({ status: 'success', ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memproses rekomendasi AI.';
      res.status(400).json({ status: 'error', message });
    }
  }
);

/**
 * GET /api/ai/verified-latest
 * Endpoint untuk Mobile Flutter: HANYA mengembalikan data AI yang telah lolos verifikasi Manajer ('verified').
 */
router.get('/verified-latest', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawFeature =
      typeof req.query.feature_type === 'string' ? req.query.feature_type : 'queue_estimator';
    const featureType =
      rawFeature === 'menu_recommendation' ? 'menu_recommendation' : 'queue_estimator';

    const data = await aiQueueService.getLatestVerifiedAiResult(featureType);
    res.json({
      status: 'success',
      verified_only: true,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat insight AI tervalidasi.';
    res.status(500).json({ status: 'error', message });
  }
});

/**
 * GET /api/ai/stats
 * Ringkasan analitik audit & verifikasi AI untuk peran Pemantau/Manajer.
 */
router.get('/stats', authenticateManager, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await aiQueueService.getAiVerificationStats();
    res.json({ status: 'success', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil statistik AI.';
    res.status(500).json({ status: 'error', message });
  }
});

/**
 * GET /api/ai/logs
 * Daftar log generate AI untuk ditinjau manual oleh Manajer di Next.js Web Admin.
 */
router.get('/logs', authenticateManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rawFeature = typeof req.query.feature_type === 'string' ? req.query.feature_type : undefined;

    const status =
      rawStatus && ['pending', 'verified', 'rejected'].includes(rawStatus)
        ? (rawStatus as AiVerificationStatus)
        : undefined;

    const featureType =
      rawFeature && ['queue_estimator', 'menu_recommendation'].includes(rawFeature)
        ? (rawFeature as AiFeatureType)
        : undefined;

    const data = await aiQueueService.getAiLogs(status, featureType);
    res.json({ status: 'success', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat log AI.';
    res.status(500).json({ status: 'error', message });
  }
});

/**
 * PATCH /api/ai/logs/:id/verify
 * Verifikasi manual hasil AI (Setujui / Tolak) oleh Manajer & memicu Push Notification ke Mobile.
 */
router.patch(
  '/logs/:id/verify',
  authenticateManager,
  validateBody(VerifyAiSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const logId = Number(req.params.id);
    if (!Number.isInteger(logId) || logId <= 0) {
      res.status(400).json({ status: 'error', message: 'ID log AI tidak valid.' });
      return;
    }

    try {
      await aiQueueService.verifyAiLogByManager(
        logId,
        req.user?.id ?? 0,
        req.body.verification_status,
        req.body.verification_notes
      );
      res.json({
        status: 'success',
        message: `Hasil AI #${logId} berhasil di-${req.body.verification_status}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memverifikasi hasil AI.';
      const code = message.includes('tidak ditemukan') ? 404 : 500;
      res.status(code).json({ status: 'error', message });
    }
  }
);

export default router;

