import { Router, Request, Response } from 'express';
import { getAllMenu } from '../services/menuService';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const results = await getAllMenu();
    res.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil daftar menu.';
    res.status(500).json({ error: message });
  }
});

export default router;

