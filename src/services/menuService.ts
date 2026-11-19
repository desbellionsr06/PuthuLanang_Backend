import * as menuModel from '../models/menuModel';

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

export async function getAllMenu() {
  return menuModel.getAllMenusFromDb();
}

export async function getMenuById(id: string) {
  return menuModel.getMenuById(id);
}

export async function createMenuItem(input: {
  name: string;
  price: number;
  category?: string;
  description?: string;
  image?: string;
  stock?: number;
  estimasi_waktu_kukus?: number;
  takaran_porsi?: string;
}) {
  const category = (input.category || 'pusaka').trim();
  const description = (input.description || '').trim() || 'Sajian jajanan pasar tradisional otentik 1935.';
  const image = (input.image || '').trim() || defaultImageForCategory(category, input.name);
  const stock = input.stock != null ? Number(input.stock) : 100;
  let menuId = slugifyMenuId(input.name);

  try {
    await menuModel.insertMenuItemInDb({
      id: menuId,
      name: input.name,
      price: input.price,
      category,
      description,
      image,
      stock,
      estimasi_waktu_kukus: input.estimasi_waktu_kukus,
      takaran_porsi: input.takaran_porsi,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'ER_DUP_ENTRY') {
      menuId = slugifyMenuId(input.name);
      await menuModel.insertMenuItemInDb({
        id: menuId,
        name: input.name,
        price: input.price,
        category,
        description,
        image,
        stock,
        estimasi_waktu_kukus: input.estimasi_waktu_kukus,
        takaran_porsi: input.takaran_porsi,
      });
    } else {
      throw err;
    }
  }

  return {
    id: menuId,
    name: input.name,
    price: input.price,
    category,
    description,
    image,
    stock,
    estimasi_waktu_kukus: input.estimasi_waktu_kukus ?? 15,
    takaran_porsi: input.takaran_porsi ?? null,
  };
}

export async function updateMenuItem(
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
  return menuModel.updateMenuItemInDb(menuId, payload);
}

export async function deleteMenuItem(menuId: string): Promise<boolean> {
  return menuModel.deleteMenuItemInDb(menuId);
}

export async function updateMenuImagePath(menuId: string, imagePath: string): Promise<boolean> {
  return menuModel.updateMenuImagePathInDb(menuId, imagePath);
}
