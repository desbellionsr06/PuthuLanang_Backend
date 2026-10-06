export interface OrderItemSchema {
  id: string;
  nama: string;
  harga: number;
  jumlah: number;
  catatan?: string;
}

export type OrderStatus = 'Baru' | 'Diproses' | 'Selesai' | 'Bisa Diambil' | 'Dibatalkan';

export interface OrderSchema {
  id: string;
  nama: string;
  outlet: string;
  jadwal_ambil: string;
  tanggal_ambil?: string;
  items: OrderItemSchema[];
  total_harga: number;
  qr_code_token: string;
  status: OrderStatus;
  catatan?: string;
  no_whatsapp?: string;
  createdAt: string;
}
