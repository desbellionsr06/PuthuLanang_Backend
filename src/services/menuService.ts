import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';

function slugifyMenuId(str: string): string {
  const base = str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 35);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}-${suffix}`;
}

function defaultImageForCategory(category: string, name = ''): string {
  const n = name.toLowerCase();
  if (n.includes('puthu')) return 'assets/images/puthu_bambu.png';
  if (n.includes('klepon')) return 'assets/images/klepon_pandan.png';
  if (n.includes('cenil')) return 'assets/images/cenil_pelangi.png';
  if (n.includes('lupis')) return 'assets/images/lupis_ketan.png';
  if (n.includes('paket') || n.includes('campur') || n.includes('besek') || n.includes('hampers')) {
    return 'assets/images/paket_tampah.png';
  }
  if (category === 'paling_laris') return 'assets/images/klepon_pandan.png';
  return 'assets/images/paket_tampah.png';
}

export async function getAllMenu(): Promise<RowDataPacket[]> {
  const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM menu ORDER BY id ASC');
  return rows;
}

export async function createMenuItem(input: {
  name: string;
  price: number;
  category?: string;
  description?: string;
  image?: string;
  stock?: number;
}) {
  const category = (input.category || 'pusaka').trim();
  const description = (input.description || '').trim() || 'Sajian jajanan pasar tradisional otentik 1935.';
  const image = (input.image || '').trim() || defaultImageForCategory(category, input.name);
  const stock = input.stock != null ? Number(input.stock) : 100;
  let menuId = slugifyMenuId(input.name);

  try {
    await db.query(
      'INSERT INTO menu (id, name, price, category, description, image, stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [menuId, input.name, input.price, category, description, image, stock]
    );
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'ER_DUP_ENTRY') {
      menuId = slugifyMenuId(input.name);
      await db.query(
        'INSERT INTO menu (id, name, price, category, description, image, stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [menuId, input.name, input.price, category, description, image, stock]
      );
    } else {
      throw err;
    }
  }

  return { id: menuId, name: input.name, price: input.price, category, description, image, stock };
}

export async function updateMenuItem(
  menuId: string,
  payload: { name?: string; price?: number; category?: string; description?: string }
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

  if (fields.length === 0) {
    throw new Error('Tidak ada field untuk diupdate.');
  }

  vals.push(menuId);
  const [res] = await db.query<ResultSetHeader>(`UPDATE menu SET ${fields.join(', ')} WHERE id = ?`, vals);
  return res.affectedRows > 0;
}

export async function deleteMenuItem(menuId: string): Promise<boolean> {
  const [res] = await db.query<ResultSetHeader>('DELETE FROM menu WHERE id = ?', [menuId]);
  return res.affectedRows > 0;
}

export async function updateMenuImagePath(menuId: string, imagePath: string): Promise<boolean> {
  const [res] = await db.query<ResultSetHeader>('UPDATE menu SET image = ? WHERE id = ?', [
    imagePath,
    menuId,
  ]);
  return res.affectedRows > 0;
}

