import { Router } from 'express';
import { getAiPreview } from '../controllers/aiController';

const router = Router();

// AI Preview Endpoint
router.get('/preview', getAiPreview);

export default router;
