import { Response } from 'express';
import * as aiQueueService from '../ai-services/aiQueueService';
import { AiFeatureType, AiVerificationStatus, AuthenticatedRequest } from '../types';

export async function estimateQueue(req: AuthenticatedRequest, res: Response): Promise<void> {
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

export async function recommendMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
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

export async function getVerifiedLatest(req: AuthenticatedRequest, res: Response): Promise<void> {
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
}

export async function getAiStats(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await aiQueueService.getAiVerificationStats();
    res.json({ status: 'success', data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil statistik AI.';
    res.status(500).json({ status: 'error', message });
  }
}

export async function getAiLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
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
}

export async function verifyAiLog(req: AuthenticatedRequest, res: Response): Promise<void> {
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

