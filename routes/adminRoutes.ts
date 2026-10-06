import { Router } from 'express';
import { getMetrics } from '../controllers/adminController';

const router = Router();

// Admin Metrics Endpoint
router.get('/metrics', getMetrics);

export default router;
