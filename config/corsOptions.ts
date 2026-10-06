import { CorsOptions } from 'cors';
import { config } from './database';

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Izin untuk permintaan dari frontend origin atau Postman/curl (tanpa origin)
    if (!origin || origin === config.clientOrigin || origin === 'http://localhost:3000') {
      callback(null, true);
    } else {
      callback(null, true); // Permisif untuk lingkungan pengujian akademik UTS
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
