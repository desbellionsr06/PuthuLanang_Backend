import express, { Request, Response } from 'express';
import cors from 'cors';
import { config, DatabaseConnection } from './config/database';
import { corsOptions } from './config/corsOptions';
import apiRouter from './routes/index';
import { getSystemHealth } from './controllers/systemController';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler';

const app = express();

// Global Middleware Configuration
app.use(cors(corsOptions));
app.use(express.json());

// Root Health & System Status Endpoint
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
      health: ['/health (GET)'],
    },
  });
});

app.get('/health', getSystemHealth);

// Mount Modular API Routes
app.use('/api', apiRouter);

// 404 & Global Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Inisialisasi Database Connection & Listen Server
DatabaseConnection.connect().then(() => {
  app.listen(config.port, () => {
    console.log(`[Puthu Lanang Backend] REST API Server running on port ${config.port}`);
  });
});

export default app;
