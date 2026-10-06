import { Router } from 'express';
import { getOutletStatus } from '../controllers/outletController';

const router = Router();

// GET /api/outlet/status
router.get('/status', getOutletStatus);

export default router;
