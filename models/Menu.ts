export interface MenuItemSchema {
  id: string;
  nama: string;
  harga: number;
  stok: number;
  waktu_kukus: string;
  gambar: string;
  deskripsi?: string;
  kategori?: 'pusaka' | 'paling_laris' | 'besek' | 'paket_campur';
  is_tersedia?: boolean;
}
