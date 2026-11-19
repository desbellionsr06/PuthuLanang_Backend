import { Router } from 'express';
import { authenticateManager } from '../middlewares/authMiddleware';
import * as adminController from '../controllers/adminController';
import * as menuController from '../controllers/menuController';

const router = Router();

// Seluruh endpoint admin diproteksi oleh authenticateManager (Maksimal 3 akun admin sah)
router.use(authenticateManager);

// Kelola pesanan
router.get('/orders', adminController.getAdminOrders);
router.patch('/orders/:id/status', adminController.updateOrderStatus);

// Kelola menu (Strict Validation)
router.get('/menu', menuController.getAdminMenu);
router.post('/menu', menuController.createMenuItem);
router.patch('/menu/:id', menuController.updateMenuItem);
router.delete('/menu/:id', menuController.deleteMenuItem);
router.patch('/menu/:id/image', menuController.updateMenuImage);

// Statistik & grafik penjualan
router.get('/stats', adminController.getStats);
router.get('/sales-chart', adminController.getSalesChart);

export default router;
