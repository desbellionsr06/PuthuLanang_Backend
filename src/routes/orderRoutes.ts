import { Router } from 'express';
import { z } from 'zod';
import { authenticateCustomerOrLegacy } from '../middlewares/authMiddleware';
import { validateBody } from '../middlewares/validateMiddleware';
import * as orderController from '../controllers/orderController';

const router = Router();

const CreateOrderSchema = z.object({
  user_id: z.union([z.number(), z.string()]).optional(),
  pickupTime: z.string().optional(),
  pickupDate: z.string().optional(),
  items: z.array(z.any()).optional(),
  total: z.coerce.number().positive('Field total wajib diisi dengan angka lebih dari 0.'),
  notes: z.string().max(300).optional(),
  payment_method: z.enum(['cash', 'qris', 'transfer']).or(z.string()).optional(),
  paymentMethod: z.string().optional(),
  estimated_minutes: z.coerce.number().positive().optional(),
});

// Endpoint pembuatan pesanan (memvalidasi jam operasional 17:30 – 21:30 WIB)
router.post(
  '/',
  authenticateCustomerOrLegacy,
  validateBody(CreateOrderSchema),
  orderController.createOrder
);

// Riwayat pesanan pengguna
router.get('/', authenticateCustomerOrLegacy, orderController.getUserOrders);

// Tandai pesanan selesai
router.patch('/:id/complete', authenticateCustomerOrLegacy, orderController.markOrderComplete);

// Endpoint Invoice & Struk Pembayaran (Requirement 3)
router.get('/invoice/:order_id', orderController.getOrderInvoice);
router.get('/:id', orderController.getOrderInvoice);

export default router;
