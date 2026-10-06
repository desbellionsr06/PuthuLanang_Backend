import { Request, Response } from 'express';
import { menuData, MenuItemData } from '../data/store';

export const getMenu = (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    total: menuData.length,
    data: menuData,
  });
};

export const createMenu = (req: Request, res: Response) => {
  const { nama, harga, stok, waktu_kukus, gambar, deskripsi, kategori } = req.body;

  if (!nama || harga === undefined || stok === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Field nama, harga, dan stok wajib diisi!',
    });
  }

  const newMenuItem: MenuItemData = {
    id: `menu-${Date.now()}`,
    nama,
    harga: Number(harga),
    stok: Number(stok),
    waktu_kukus: waktu_kukus || '5 Menit',
    gambar: gambar || '/images/puthu_bambu.png',
    deskripsi: deskripsi || 'Resep warisan Puthu Lanang 1935.',
    kategori: kategori || 'Tradisional',
  };

  menuData.push(newMenuItem);

  return res.status(201).json({
    success: true,
    message: 'Menu baru berhasil ditambahkan!',
    data: newMenuItem,
  });
};

export const updateMenu = (req: Request, res: Response) => {
  const { id } = req.params;
  const index = menuData.findIndex((m) => m.id === id);

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: `Menu dengan ID ${id} tidak ditemukan!`,
    });
  }

  const existing = menuData[index];
  const updatedItem: MenuItemData = {
    ...existing,
    ...req.body,
    harga: req.body.harga !== undefined ? Number(req.body.harga) : existing.harga,
    stok: req.body.stok !== undefined ? Number(req.body.stok) : existing.stok,
  };

  menuData[index] = updatedItem;

  return res.status(200).json({
    success: true,
    message: `Data menu ${id} berhasil diperbarui!`,
    data: updatedItem,
  });
};

export const deleteMenu = (req: Request, res: Response) => {
  const { id } = req.params;
  const index = menuData.findIndex((m) => m.id === id);

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: `Menu dengan ID ${id} tidak ditemukan!`,
    });
  }

  const deletedItem = menuData.splice(index, 1)[0];

  return res.status(200).json({
    success: true,
    message: `Menu '${deletedItem.nama}' berhasil dihapus!`,
    data: deletedItem,
  });
};
