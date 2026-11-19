import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';

export interface MenuRow extends RowDataPacket {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string;
  image?: string;
  stock?: number;
  rating?: number;
  nama?: string;
  harga?: number;
  kategori?: string;
  deskripsi?: string;
  gambar?: string;
  tersedia?: number;
  estimasi_waktu_kukus?: number;
  takaran_porsi?: string;
  created_at?: string;
}

export async function getAllMenusFromDb(): Promise<MenuRow[]> {
  const [rows] = await db.query<MenuRow[]>('SELECT * FROM menu ORDER BY id ASC');
  return rows;
}

export async function getMenuById(menuId: string): Promise<MenuRow | null> {
  const [rows] = await db.query<MenuRow[]>('SELECT * FROM menu WHERE id = ? LIMIT 1', [menuId]);
  return rows[0] || null;
}

export async function insertMenuItemInDb(data: {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  image: string;
  stock: number;
  estimasi_waktu_kukus?: number;
  takaran_porsi?: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO menu (id, name, price, category, description, image, stock, estimasi_waktu_kukus, takaran_porsi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      data.name,
      data.price,
      data.category,
      data.description,
      data.image,
      data.stock,
      data.estimasi_waktu_kukus ?? 15,
      data.takaran_porsi ?? null,
    ]
  );
}

export async function updateMenuItemInDb(
  menuId: string,
  payload: {
    name?: string;
    price?: number;
    category?: string;
    description?: string;
    stock?: number;
    estimasi_waktu_kukus?: number;
    takaran_porsi?: string;
  }
): Promise<boolean> {
  const fields: string[] = [];
  const vals: unknown[] = [];

  if (payload.name !== undefined) {
    fields.push('name = ?');
    vals.push(payload.name);
  }
  if (payload.price !== undefined) {
    fields.push('price = ?');
    vals.push(Number(payload.price));
  }
  if (payload.category !== undefined) {
    fields.push('category = ?');
    vals.push(payload.category);
  }
  if (payload.description !== undefined) {
    fields.push('description = ?');
    vals.push(payload.description);
  }
  if (payload.stock !== undefined) {
    fields.push('stock = ?');
    vals.push(Number(payload.stock));
  }
  if (payload.estimasi_waktu_kukus !== undefined) {
    fields.push('estimasi_waktu_kukus = ?');
    vals.push(Number(payload.estimasi_waktu_kukus));
  }
  if (payload.takaran_porsi !== undefined) {
    fields.push('takaran_porsi = ?');
    vals.push(payload.takaran_porsi);
  }

  if (fields.length === 0) {
    throw new Error('Tidak ada field untuk diupdate.');
  }

  vals.push(menuId);
  const [res] = await db.query<ResultSetHeader>(
    `UPDATE menu SET ${fields.join(', ')} WHERE id = ?`,
    vals
  );
  return res.affectedRows > 0;
}

export async function deleteMenuItemInDb(menuId: string): Promise<boolean> {
  const [res] = await db.query<ResultSetHeader>('DELETE FROM menu WHERE id = ?', [menuId]);
  return res.affectedRows > 0;
}

export async function updateMenuImagePathInDb(menuId: string, imagePath: string): Promise<boolean> {
  const [res] = await db.query<ResultSetHeader>('UPDATE menu SET image = ? WHERE id = ?', [
    imagePath,
    menuId,
  ]);
  return res.affectedRows > 0;
}

