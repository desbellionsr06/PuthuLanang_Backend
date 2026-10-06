import { Request, Response } from 'express';
import { usersData, UserData } from '../data/store';

export const adminLogin = (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username dan Password wajib diisi!',
    });
  }

  // Validasi mock credentials: admin / admin123
  if (username === 'admin' && password === 'admin123') {
    return res.status(200).json({
      success: true,
      message: 'Login Admin Berhasil',
      token: 'mock-admin-jwt-token-puthu-lanang-1935',
      role: 'admin',
      user: {
        id: 'usr-admin-1',
        nama: 'Administrator Utama',
        username: 'admin',
        role: 'admin',
      },
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Kredensial Admin tidak valid! Gunakan username: admin & password: admin123',
  });
};

export const userLogin = (req: Request, res: Response) => {
  const { no_whatsapp, password } = req.body;

  if (!no_whatsapp || !password) {
    return res.status(400).json({
      success: false,
      message: 'Nomor WhatsApp dan Password wajib diisi!',
    });
  }

  const existingUser = usersData.find(
    (u) => (u.no_whatsapp === no_whatsapp || u.id === no_whatsapp) && u.password === password
  );

  if (existingUser) {
    return res.status(200).json({
      success: true,
      message: 'Login Pelanggan Berhasil',
      token: `user-token-${existingUser.id}`,
      role: existingUser.role,
      user: {
        id: existingUser.id,
        nama: existingUser.nama,
        no_whatsapp: existingUser.no_whatsapp,
        role: existingUser.role,
      },
    });
  }

  // Fallback auto create/accept for smooth UTS simulation
  const newUser: UserData = {
    id: `usr-${Date.now()}`,
    nama: 'Pecinta Kuliner',
    no_whatsapp,
    password,
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  usersData.push(newUser);

  return res.status(200).json({
    success: true,
    message: 'Login Pelanggan Berhasil (Sesi Baru)',
    token: `user-token-${newUser.id}`,
    role: newUser.role,
    user: {
      id: newUser.id,
      nama: newUser.nama,
      no_whatsapp: newUser.no_whatsapp,
      role: newUser.role,
    },
  });
};

export const userRegister = (req: Request, res: Response) => {
  const { nama, no_whatsapp, password } = req.body;

  if (!nama || !no_whatsapp || !password) {
    return res.status(400).json({
      success: false,
      message: 'Nama, Nomor WhatsApp, dan Password wajib diisi!',
    });
  }

  const isDuplicate = usersData.some((u) => u.no_whatsapp === no_whatsapp);
  if (isDuplicate) {
    return res.status(400).json({
      success: false,
      message: 'Nomor WhatsApp sudah terdaftar! Silakan login.',
    });
  }

  const newUser: UserData = {
    id: `usr-${Date.now()}`,
    nama,
    no_whatsapp,
    password,
    role: 'user',
    createdAt: new Date().toISOString(),
  };

  usersData.push(newUser);

  return res.status(201).json({
    success: true,
    message: 'Registrasi Akun Pelanggan Berhasil!',
    user: {
      id: newUser.id,
      nama: newUser.nama,
      no_whatsapp: newUser.no_whatsapp,
      role: newUser.role,
    },
  });
};
