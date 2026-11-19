import { Router } from 'express';
import { authenticateJwt } from '../middlewares/authMiddleware';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.get('/me', authenticateJwt, notificationController.getMyNotifications);
router.patch('/read-all', authenticateJwt, notificationController.markAllRead);

export default router;
