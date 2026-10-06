import { Router } from 'express';
import authRoutes from './authRoutes';
import menuRoutes from './menuRoutes';
import orderRoutes from './orderRoutes';
import adminRoutes from './adminRoutes';
import aiRoutes from './aiRoutes';
import outletRoutes from './outletRoutes';

const apiRouter = Router();

// Modular Route Registrations
apiRouter.use('/auth', authRoutes);
apiRouter.use('/menu', menuRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/outlet', outletRoutes);

export default apiRouter;
