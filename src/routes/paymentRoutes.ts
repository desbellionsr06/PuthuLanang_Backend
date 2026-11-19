import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';

const router = Router();

router.post('/create-charge', paymentController.createCharge);

export default router;
