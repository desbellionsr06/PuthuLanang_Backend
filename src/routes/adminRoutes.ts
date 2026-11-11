import { Router, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authenticateManager } from '../middlewares/authMiddleware';
import * as menuService from '../services/menuService';
import * as orderService from '../services/orderService';

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const uploadMenuImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `menu-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diizinkan.'));
  },
});

const VALID_ORDER_STATUSES = ['Baru', 'Diproses', 'Sedang Dikukus', 'Selesai', 'Dibatalkan'];

// Semua endpoint admin wajib lolos verifikasi Pemantau/Manajer
router.use(authenticateManager);

router.get('/orders', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await orderService.getAdminOrders(status);
    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil pesanan.';
    res.status(500).json({ error: message });
  }
});

router.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id).replace(/^ORD-/i, ''), 10);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: 'ID pesanan tidak valid.' });
    return;
  }

  const { status } = req.body;
  if (!VALID_ORDER_STATUSES.includes(status)) {
    res.status(400).json({
      error: `Status tidak valid. Pilihan: ${VALID_ORDER_STATUSES.join(', ')}`,
    });
    return;
  }

  try {
    const updated = await orderService.updateAdminOrderStatus(orderId, status);
    if (!updated) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }
    res.json({
      message: 'Status pesanan berhasil diperbarui',
      data: { id: `ORD-${orderId}`, status },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengubah status pesanan.';
    res.status(500).json({ error: message });
  }
});

router.get('/menu', async (_req: Request, res: Response) => {
  try {
    const results = await menuService.getAllMenu();
    res.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil daftar menu.';
    res.status(500).json({ error: message });
  }
});

router.post('/menu', async (req: Request, res: Response) => {
  const name = String(req.body.name || req.body.nama || '').trim();
  const rawPrice = req.body.price ?? req.body.harga;
  const category = String(req.body.category || req.body.kategori || 'pusaka').trim();
  const description = String(req.body.description || req.body.deskripsi || '').trim();
  const image = String(req.body.image || req.body.gambar || '').trim();
  const stock = req.body.stock != null ? Number(req.body.stock) : 100;

  if (!name) {
    res.status(400).json({ error: 'Nama menu wajib diisi.' });
    return;
  }
  if (rawPrice == null || rawPrice === '' || Number.isNaN(Number(rawPrice)) || Number(rawPrice) < 0) {
    res.status(400).json({ error: 'Harga menu wajib diisi dan harus berupa angka positif.' });
    return;
  }

  try {
    const data = await menuService.createMenuItem({
      name,
      price: Number(rawPrice),
      category,
      description,
      image,
      stock,
    });
    res.status(201).json({
      message: `Menu "${name}" berhasil ditambahkan!`,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menambah menu.';
    res.status(500).json({ error: message });
  }
});

router.patch('/menu/:id', async (req: Request, res: Response) => {
  const menuId = String(req.params.id || '');
  if (!menuId) {
    res.status(400).json({ error: 'ID menu tidak valid.' });
    return;
  }

  try {
    const updated = await menuService.updateMenuItem(menuId, {
      name: req.body.name ?? req.body.nama,
      price: req.body.price ?? req.body.harga,
      category: req.body.category ?? req.body.kategori,
      description: req.body.description ?? req.body.deskripsi,
    });

    if (!updated) {
      res.status(404).json({ error: 'Menu tidak ditemukan.' });
      return;
    }
    res.json({ message: 'Menu berhasil diperbarui', data: { id: menuId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui menu.';
    const status = message.includes('Tidak ada field') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

router.delete('/menu/:id', async (req: Request, res: Response) => {
  const menuId = String(req.params.id || '');
  if (!menuId) {
    res.status(400).json({ error: 'ID menu tidak valid.' });
    return;
  }

  try {
    const deleted = await menuService.deleteMenuItem(menuId);
    if (!deleted) {
      res.status(404).json({ error: 'Menu tidak ditemukan.' });
      return;
    }
    res.json({ message: 'Menu berhasil dihapus', data: { id: menuId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus menu.';
    res.status(500).json({ error: message });
  }
});

router.patch('/menu/:id/image', (req: Request, res: Response) => {
  const menuId = String(req.params.id || '');
  if (!menuId) {
    res.status(400).json({ error: 'ID menu tidak valid.' });
    return;
  }

  uploadMenuImage.single('image')(req, res, async (multerErr) => {
    if (multerErr) {
      res.status(400).json({ error: multerErr.message || 'Gagal memproses file gambar.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'File gambar tidak ditemukan dalam request.' });
      return;
    }

    const imagePath = `/uploads/${req.file.filename}`;
    try {
      const updated = await menuService.updateMenuImagePath(menuId, imagePath);
      if (!updated) {
        res.status(404).json({ error: 'Menu tidak ditemukan.' });
        return;
      }
      res.json({
        message: 'Gambar menu berhasil diperbarui',
        data: {
          id: menuId,
          image: imagePath,
          image_url: `http://localhost:${process.env.PORT || 5000}${imagePath}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan path gambar.';
      res.status(500).json({ error: message });
    }
  });
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await orderService.getAdminStats();
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil statistik.';
    res.status(500).json({ error: message });
  }
});

router.get('/sales-chart', async (req: Request, res: Response) => {
  try {
    const rawDays = parseInt(String(req.query.days ?? '7'), 10);
    const chartData = await orderService.getSalesChartData(rawDays);
    res.json(chartData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil data grafik.';
    res.status(500).json({ error: message });
  }
});

export default router;

