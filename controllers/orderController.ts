import { Request, Response } from 'express';
import { ordersData, OrderData } from '../data/store';

export const getOrders = (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    total: ordersData.length,
    data: ordersData,
  });
};

export const createOrder = (req: Request, res: Response) => {
  const { nama, outlet, jadwal_ambil, items, total_harga, qr_code_token, catatan, no_whatsapp, tanggal_ambil } = req.body;

  if (!nama || !outlet || !jadwal_ambil || !items || !total_harga) {
    return res.status(400).json({
      success: false,
      message: 'Semua field wajib (nama, outlet, jadwal_ambil, items, total_harga) diisi!',
    });
  }

  const newOrder: OrderData = {
    id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
    nama,
    outlet: outlet || 'Pusat Celaket',
    jadwal_ambil,
    tanggal_ambil: tanggal_ambil || 'Hari Ini',
    items: items || [],
    total_harga: Number(total_harga),
    qr_code_token: qr_code_token || `PL-QR-${Math.floor(100000 + Math.random() * 900000)}`,
    status: 'Baru',
    catatan: catatan || '-',
    no_whatsapp: no_whatsapp || '081234567890',
    createdAt: new Date().toISOString(),
  };

  ordersData.unshift(newOrder);

  return res.status(201).json({
    success: true,
    message: 'Pesanan Smart Takeaway Berhasil Dibuat!',
    data: newOrder,
  });
};

export const createCustomEventOrder = (req: Request, res: Response) => {
  const {
    eventDate,
    pickupTime,
    packageType,
    packagePrice,
    compositionRatio,
    customerContact,
    notes,
  } = req.body;

  if (!eventDate || !packageType || !customerContact?.name || !customerContact?.phone) {
    return res.status(400).json({
      success: false,
      message: 'Informasi tanggal acara, paket, nama, dan kontak WA wajib diisi.',
    });
  }

  const customOrderId = `TMPH-${Math.floor(1000 + Math.random() * 9000)}`;
  const newCustomOrder = {
    id: customOrderId,
    eventDate,
    pickupTime: pickupTime || '16:00 WIB',
    packageType,
    packagePrice: packagePrice || 150000,
    compositionRatio: compositionRatio || { puthu: 25, klepon: 25, cenil: 25, lupis: 25 },
    customerContact,
    notes: notes || '-',
    status: 'SUBMITTED',
    createdAt: new Date().toISOString(),
  };

  const waText = encodeURIComponent(
    `*PESANAN KHUSUS TAMPAH / HAJATAN PUTHU LANANG*\n` +
    `ID Pesanan: ${customOrderId}\n` +
    `Pemesan: ${customerContact.name} (${customerContact.phone})\n` +
    `Instansi/Acara: ${customerContact.institution || '-'}\n` +
    `Tanggal & Jam Tiba: ${eventDate} @ ${pickupTime}\n` +
    `Paket: ${packageType}\n` +
    `Komposisi Varian:\n` +
    ` - Puthu: ${compositionRatio?.puthu || 25}%\n` +
    ` - Klepon: ${compositionRatio?.klepon || 25}%\n` +
    ` - Cenil: ${compositionRatio?.cenil || 25}%\n` +
    ` - Lupis: ${compositionRatio?.lupis || 25}%\n` +
    `Catatan: ${notes || '-'}\n\n` +
    `Mohon konfirmasi pesanan tampah kami. Terima Kasih!`
  );

  return res.status(201).json({
    success: true,
    message: 'Kalkulasi & Pemesanan Tampah Berhasil!',
    customOrder: newCustomOrder,
    whatsappRedirectUrl: `https://wa.me/6281234567890?text=${waText}`,
  });
};

export const updateOrderStatus = (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Baru', 'Diproses', 'Selesai', 'Bisa Diambil', 'Dibatalkan'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Status tidak valid! Pilih salah satu: ${validStatuses.join(', ')}`,
    });
  }

  const order = ordersData.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({
      success: false,
      message: `Pesanan dengan ID ${id} tidak ditemukan!`,
    });
  }

  order.status = status;

  return res.status(200).json({
    success: true,
    message: `Status pesanan ${id} berhasil diperbarui menjadi '${status}'`,
    data: order,
  });
};

export const getOrderById = (req: Request, res: Response) => {
  const { id } = req.params;

  const order = ordersData.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({
      success: false,
      message: `Pesanan ${id} tidak ditemukan!`,
    });
  }

  return res.status(200).json({
    success: true,
    data: order,
    ticket_status: {
      qr_code: order.qr_code_token,
      is_valid: true,
      pickup_location: order.outlet === 'Pusat Celaket' ? 'Jl. Jaksa Agung Suprapto No. 73' : 'Jl. MT Haryono No. 195',
      time_slot: order.jadwal_ambil,
    },
  });
};
