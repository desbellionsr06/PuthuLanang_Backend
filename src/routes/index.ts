import { Router } from 'express';
import authRoutes from './authRoutes';
import menuRoutes from './menuRoutes';
import orderRoutes from './orderRoutes';
import aiRoutes from './aiRoutes';
import adminRoutes from './adminRoutes';
import notificationRoutes from './notificationRoutes';
import paymentRoutes from './paymentRoutes';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/menu', menuRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/payment', paymentRoutes);

export default apiRouter;

