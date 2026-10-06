import express, { Request, Response } from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import menuRoutes from './routes/menuRoutes';
import orderRoutes from './routes/orderRoutes';
import adminRoutes from './routes/adminRoutes';
import aiRoutes from './routes/aiRoutes';
import outletRoutes from './routes/outletRoutes';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS & Body Parser
app.use(cors());
app.use(express.json());

// Root Health Check Route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ONLINE',
    system: 'Puthu Lanang Malang - Express REST API Backend Server',
    version: '1.0.0 (UTS Web Framework)',
    endpoints: {
      auth: ['/api/auth/admin-login', '/api/auth/user-login', '/api/auth/user-register'],
      menu: ['/api/menu (GET, POST)', '/api/menu/:id (PUT, DELETE)'],
      orders: ['/api/orders (GET, POST)', '/api/orders/custom-event (POST)', '/api/orders/:id/status (PATCH)', '/api/orders/:id (GET)'],
      admin: ['/api/admin/metrics (GET)'],
      ai: ['/api/ai/preview (GET)'],
      outlet: ['/api/outlet/status (GET)'],
    },
  });
});

// Register Modular API Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/outlet', outletRoutes);

// 404 Handler for undefined routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Endpoint REST API '${req.method} ${req.url}' tidak ditemukan!`,
  });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 [Puthu Lanang Backend] REST API Server running at http://localhost:${PORT}`);
});

export default app;
