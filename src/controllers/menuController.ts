import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { AppError } from '../errors/AppError';
import * as menuService from '../services/menuService';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const uploadMenuImageMulter = multer({
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

/**
 * Validasi ketat pengelolaan menu (Requirement 6):
 * - nama/name: hanya huruf dan spasi (/^[A-Za-z\s]+$/), tolak angka & simbol.
 * - harga/price: bilangan bulat positif (> 0).
 * - estimasi_waktu_kukus: bilangan bulat positif antara 1 - 180 menit.
 * - takaran_porsi: hanya huruf, angka, spasi, dan garis miring (/^[A-Za-z0-9\s\/]+$/).
 * - deskripsi/description: tidak boleh hanya berupa angka murni (/^\d+$/).
 */
export function validateStrictMenuInput(
  data: {
    name?: string;
    price?: unknown;
    estimasi_waktu_kukus?: unknown;
    takaran_porsi?: string;
    description?: string;
  },
  isUpdate = false
): void {
  // 1. Validasi nama
  if (!isUpdate || data.name !== undefined) {
    const rawName = String(data.name || '').trim();
    if (!rawName) {
      throw new AppError('Nama menu wajib diisi.', 400);
    }
    if (!/^[A-Za-z\s]+$/.test(rawName)) {
      throw new AppError(
        'Nama menu hanya boleh terdiri dari huruf alfabet dan spasi (tidak boleh mengandung angka atau simbol).',
        400
      );
    }
  }

  // 2. Validasi harga
  if (!isUpdate || data.price !== undefined) {
    if (data.price === undefined || data.price === null || data.price === '') {
      throw new AppError('Harga menu wajib diisi.', 400);
    }
    const priceNum = Number(data.price);
    if (!Number.isInteger(priceNum) || priceNum <= 0) {
      throw new AppError('Harga menu harus berupa bilangan bulat positif (> 0).', 400);
    }
  }

  // 3. Validasi estimasi_waktu_kukus
  if (data.estimasi_waktu_kukus !== undefined && data.estimasi_waktu_kukus !== null && data.estimasi_waktu_kukus !== '') {
    const steamTime = Number(data.estimasi_waktu_kukus);
    if (!Number.isInteger(steamTime) || steamTime < 1 || steamTime > 180) {
      throw new AppError(
        'Estimasi waktu kukus harus berupa bilangan bulat positif antara 1 hingga 180 menit.',
        400
      );
    }
  }

  // 4. Validasi takaran_porsi
  if (data.takaran_porsi !== undefined && data.takaran_porsi !== null && String(data.takaran_porsi).trim() !== '') {
    const portion = String(data.takaran_porsi).trim();
    if (!/^[A-Za-z0-9\s\/]+$/.test(portion)) {
      throw new AppError(
        'Takaran porsi hanya boleh berisi huruf, angka, spasi, dan garis miring (contoh: "5 pcs / porsi").',
        400
      );
    }
  }

  // 5. Validasi deskripsi
  if (data.description !== undefined && data.description !== null && String(data.description).trim() !== '') {
    const desc = String(data.description).trim();
    if (/^\d+$/.test(desc)) {
      throw new AppError('Deskripsi menu tidak boleh hanya terdiri dari angka.', 400);
    }
  }
}

export async function getAllMenu(_req: Request, res: Response): Promise<void> {
  try {
    const results = await menuService.getAllMenu();
    res.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil daftar menu.';
    res.status(500).json({ error: message });
  }
}

export async function getAdminMenu(_req: Request, res: Response): Promise<void> {
  try {
    const results = await menuService.getAllMenu();
    res.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengambil daftar menu.';
    res.status(500).json({ error: message });
  }
}

export async function createMenuItem(req: Request, res: Response): Promise<void> {
  const name = String(req.body.name || req.body.nama || '').trim();
  const rawPrice = req.body.price ?? req.body.harga;
  const category = String(req.body.category || req.body.kategori || 'pusaka').trim();
  const description = String(req.body.description || req.body.deskripsi || '').trim();
  const image = String(req.body.image || req.body.gambar || '').trim();
  const stock = req.body.stock != null ? Number(req.body.stock) : 100;
  const estimasi_waktu_kukus = req.body.estimasi_waktu_kukus != null ? Number(req.body.estimasi_waktu_kukus) : undefined;
  const takaran_porsi = req.body.takaran_porsi ? String(req.body.takaran_porsi).trim() : undefined;

  try {
    // Jalankan validasi ketat
    validateStrictMenuInput({
      name,
      price: rawPrice,
      estimasi_waktu_kukus,
      takaran_porsi,
      description,
    }, false);

    const data = await menuService.createMenuItem({
      name,
      price: Number(rawPrice),
      category,
      description,
      image,
      stock,
      estimasi_waktu_kukus,
      takaran_porsi,
    });

    res.status(201).json({
      message: `Menu "${name}" berhasil ditambahkan!`,
      data,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Gagal menambah menu.';
    const statusCode = err?.statusCode || 400;
    res.status(statusCode).json({ error: message });
  }
}

export async function updateMenuItem(req: Request, res: Response): Promise<void> {
  const menuId = String(req.params.id || '');
  if (!menuId) {
    res.status(400).json({ error: 'ID menu tidak valid.' });
    return;
  }

  const rawName = req.body.name ?? req.body.nama;
  const rawPrice = req.body.price ?? req.body.harga;
  const rawCategory = req.body.category ?? req.body.kategori;
  const rawDescription = req.body.description ?? req.body.deskripsi;
  const rawSteam = req.body.estimasi_waktu_kukus;
  const rawPortion = req.body.takaran_porsi;

  try {
    // Validasi field yang dikirimkan
    validateStrictMenuInput({
      name: rawName !== undefined ? String(rawName).trim() : undefined,
      price: rawPrice !== undefined ? Number(rawPrice) : undefined,
      estimasi_waktu_kukus: rawSteam !== undefined ? Number(rawSteam) : undefined,
      takaran_porsi: rawPortion !== undefined ? String(rawPortion).trim() : undefined,
      description: rawDescription !== undefined ? String(rawDescription).trim() : undefined,
    }, true);

    const updated = await menuService.updateMenuItem(menuId, {
      name: rawName !== undefined ? String(rawName).trim() : undefined,
      price: rawPrice !== undefined ? Number(rawPrice) : undefined,
      category: rawCategory !== undefined ? String(rawCategory).trim() : undefined,
      description: rawDescription !== undefined ? String(rawDescription).trim() : undefined,
      estimasi_waktu_kukus: rawSteam !== undefined ? Number(rawSteam) : undefined,
      takaran_porsi: rawPortion !== undefined ? String(rawPortion).trim() : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: 'Menu tidak ditemukan.' });
      return;
    }

    res.json({ message: 'Menu berhasil diperbarui', data: { id: menuId } });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui menu.';
    const statusCode = err?.statusCode || (message.includes('Tidak ada field') ? 400 : 500);
    res.status(statusCode).json({ error: message });
  }
}

export async function deleteMenuItem(req: Request, res: Response): Promise<void> {
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
}

export function updateMenuImage(req: Request, res: Response): void {
  const menuId = String(req.params.id || '');
  if (!menuId) {
    res.status(400).json({ error: 'ID menu tidak valid.' });
    return;
  }

  uploadMenuImageMulter.single('image')(req, res, async (multerErr) => {
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
}

