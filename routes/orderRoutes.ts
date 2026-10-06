import { Router } from 'express';
import { getOrders, createOrder, createCustomEventOrder, updateOrderStatus, getOrderById } from '../controllers/orderController';

const router = Router();

// Order Endpoints
router.get('/', getOrders);
router.post('/', createOrder);
router.post('/custom-event', createCustomEventOrder);
router.patch('/:id/status', updateOrderStatus);
router.get('/:id', getOrderById);

export default router;
