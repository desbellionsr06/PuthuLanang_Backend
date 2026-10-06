import { Request, Response } from 'express';
import { ordersData, menuData, usersData } from '../data/store';

export const getMetrics = (req: Request, res: Response) => {
  const total_pesanan = ordersData.length;
  const total_menu = menuData.length;
  const pesanan_baru = ordersData.filter((o) => o.status === 'Baru').length;
  const total_pelanggan = usersData.filter((u) => u.role === 'user').length;

  const total_pendapatan = ordersData
    .filter((o) => o.status === 'Selesai' || o.status === 'Diproses')
    .reduce((acc, curr) => acc + curr.total_harga, 0);

  return res.status(200).json({
    success: true,
    data: {
      total_pesanan,
      total_menu,
      pesanan_baru,
      total_pelanggan,
      total_pendapatan,
      status_ringkasan: {
        baru: pesanan_baru,
        diproses: ordersData.filter((o) => o.status === 'Diproses').length,
        selesai: ordersData.filter((o) => o.status === 'Selesai').length,
      },
      gerai_teramai: 'Pusat Celaket Malang (85% Antrean)',
    },
  });
};
