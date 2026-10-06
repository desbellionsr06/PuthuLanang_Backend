export interface MenuItemData {
  id: string;
  nama: string;
  harga: number;
  stok: number;
  waktu_kukus: string;
  gambar: string;
  deskripsi?: string;
  kategori?: string;
}

export interface OrderItemData {
  id: string;
  nama: string;
  harga: number;
  jumlah: number;
}

export interface OrderData {
  id: string;
  nama: string;
  outlet: string;
  jadwal_ambil: string;
  tanggal_ambil?: string;
  items: OrderItemData[];
  total_harga: number;
  qr_code_token: string;
  status: 'Baru' | 'Diproses' | 'Selesai' | 'Bisa Diambil' | 'Dibatalkan';
  catatan?: string;
  no_whatsapp?: string;
  createdAt: string;
}

export interface UserData {
  id: string;
  nama: string;
  no_whatsapp: string;
  password: string;
  role: 'admin' | 'user';
  createdAt: string;
}

// In-Memory Data Store (Default Seeds for UTS Puthu Lanang Malang)
export const usersData: UserData[] = [
  {
    id: 'usr-admin-1',
    nama: 'Administrator Utama',
    no_whatsapp: 'admin',
    password: 'admin123',
    role: 'admin',
    createdAt: '1935-01-01T00:00:00.000Z',
  },
  {
    id: 'usr-user-1',
    nama: 'Budi Santoso',
    no_whatsapp: '081234567890',
    password: '123456',
    role: 'user',
    createdAt: '2026-09-01T10:00:00.000Z',
  },
];

export const menuData: MenuItemData[] = [
  {
    id: 'menu-1',
    nama: 'Puthu Bambu Original (5 Biji)',
    harga: 15000,
    stok: 120,
    waktu_kukus: '3 - 5 Menit',
    gambar: '/images/puthu_bambu.png',
    deskripsi: 'Kue puthu bambu tradisional dengan isian gula merah melaka murni dan parutan kelapa gurih.',
    kategori: 'Puthu',
  },
  {
    id: 'menu-2',
    nama: 'Klepon Pandan Melaka (10 Biji)',
    harga: 15000,
    stok: 95,
    waktu_kukus: '4 Menit',
    gambar: '/images/klepon_pandan.png',
    deskripsi: 'Bola-bola ketan hijau pandan suji asli berisikan gula aren cair yang lumer di mulut.',
    kategori: 'Klepon',
  },
  {
    id: 'menu-3',
    nama: 'Cenil Pelangi Tampah (1 Porsi)',
    harga: 12000,
    stok: 80,
    waktu_kukus: 'Siap Saji',
    gambar: '/images/cenil_pelangi.png',
    deskripsi: 'Cenil singkong warna-warni kenyal ditaburi kelapa parut kukus dan sirupan gula merah kental.',
    kategori: 'Cenil',
  },
  {
    id: 'menu-4',
    nama: 'Lupis Ketan Gula Aren (4 Potong)',
    harga: 14000,
    stok: 60,
    waktu_kukus: 'Siap Saji',
    gambar: '/images/lupis_ketan.png',
    deskripsi: 'Lupis beras ketan murni berbentuk segitiga dengan tekstur lembut dan siraman juruh gula aren.',
    kategori: 'Lupis',
  },
  {
    id: 'menu-5',
    nama: 'Paket Tampah Heritage Campur (Isi 25)',
    harga: 55000,
    stok: 25,
    waktu_kukus: '10 Menit',
    gambar: '/images/paket_tampah.png',
    deskripsi: 'Kombinasi lengkap Puthu, Klepon, Cenil, dan Lupis dalam tampah bambu hias daun pisang.',
    kategori: 'Paket',
  },
];

export const ordersData: OrderData[] = [
  {
    id: 'ORD-1001',
    nama: 'Budi Santoso',
    outlet: 'Pusat Celaket',
    jadwal_ambil: '16:30 - 17:00 WIB',
    tanggal_ambil: 'Hari Ini, 30 Sep',
    items: [
      { id: 'menu-1', nama: 'Puthu Bambu Original (5 Biji)', harga: 15000, jumlah: 2 },
      { id: 'menu-2', nama: 'Klepon Pandan Melaka (10 Biji)', harga: 15000, jumlah: 1 },
    ],
    total_harga: 45000,
    qr_code_token: 'PL-CELAKET-1001-X99',
    status: 'Diproses',
    catatan: 'Pisahkan parutan kelapa',
    no_whatsapp: '081234567890',
    createdAt: '2026-09-30T16:15:00.000Z',
  },
  {
    id: 'ORD-1002',
    nama: 'Siti Rahmawati',
    outlet: 'Cabang Dinoyo',
    jadwal_ambil: '17:00 - 17:30 WIB',
    tanggal_ambil: 'Hari Ini, 30 Sep',
    items: [
      { id: 'menu-5', nama: 'Paket Tampah Heritage Campur (Isi 25)', harga: 55000, jumlah: 1 },
    ],
    total_harga: 55000,
    qr_code_token: 'PL-DINOYO-1002-Y88',
    status: 'Baru',
    catatan: 'Minta gula melaka ekstra',
    no_whatsapp: '085711223344',
    createdAt: '2026-09-30T16:40:00.000Z',
  },
  {
    id: 'ORD-1003',
    nama: 'Ahmad Fauzi',
    outlet: 'Pusat Celaket',
    jadwal_ambil: '17:30 - 18:00 WIB',
    tanggal_ambil: 'Hari Ini, 30 Sep',
    items: [
      { id: 'menu-3', nama: 'Cenil Pelangi Tampah (1 Porsi)', harga: 12000, jumlah: 2 },
      { id: 'menu-4', nama: 'Lupis Ketan Gula Aren (4 Potong)', harga: 14000, jumlah: 1 },
    ],
    total_harga: 38000,
    qr_code_token: 'PL-CELAKET-1003-Z77',
    status: 'Selesai',
    catatan: 'Sudah diambil di gerai',
    no_whatsapp: '089988776655',
    createdAt: '2026-09-30T15:30:00.000Z',
  },
];
