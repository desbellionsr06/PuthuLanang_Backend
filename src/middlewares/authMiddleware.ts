import { Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { db } from '../config/db';
import { AuthenticatedRequest, JwtUserPayload, UserRole } from '../types';

export function signJwtToken(payload: JwtUserPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyJwtToken(token: string): JwtUserPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtUserPayload;
  } catch {
    return null;
  }
}

function extractBearerToken(req: AuthenticatedRequest): string {
  const raw = req.headers.authorization || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/**
 * Middleware wajib JWT Token. Mengisi req.user jika valid.
 */
export const authenticateJwt = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Akses ditolak. Header Authorization: Bearer <jwt_token> wajib disertakan.',
    });
    return;
  }

  const payload = verifyJwtToken(token);
  if (!payload) {
    res.status(401).json({
      status: 'error',
      message: 'Token JWT tidak valid atau sudah kedaluwarsa.',
    });
    return;
  }

  req.user = payload;
  next();
};

/**
 * Middleware RBAC: membatasi endpoint untuk peran tertentu ('customer' / 'manager').
 */
export const authorizeRoles = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Pengguna belum terautentikasi.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        status: 'error',
        message: `Akses ditolak. Fitur ini khusus peran: ${allowedRoles.join(', ')}.`,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware kompatibilitas pelanggan (JWT atau token legacy `server-token-<no_wa>` + user_id)
 * agar Flutter app lama yang belum refresh token tetap berfungsi tanpa merusak logika bisnis.
 */
export const authenticateCustomerOrLegacy = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Token autentikasi wajib disertakan.' });
    return;
  }

  const jwtPayload = verifyJwtToken(token);
  if (jwtPayload) {
    req.user = jwtPayload;
    next();
    return;
  }

  // Fallback token legacy `server-token-<no_whatsapp>`
  const rawUserId = req.body?.user_id ?? req.query?.user_id;
  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'Token JWT tidak valid atau user_id tidak disertakan.' });
    return;
  }

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT u.id, u.nama, u.no_whatsapp, COALESCE(r.name, 'customer') AS role
       FROM users u LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(401).json({ error: 'Akun tidak ditemukan atau sudah dihapus.' });
      return;
    }
    const user = rows[0];
    if (token !== `server-token-${user.no_whatsapp}`) {
      res.status(403).json({ error: 'Sesi tidak valid untuk akun ini.' });
      return;
    }
    req.user = {
      id: Number(user.id),
      nama: String(user.nama),
      no_whatsapp: String(user.no_whatsapp),
      role: (user.role === 'manager' ? 'manager' : 'customer'),
    };
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memverifikasi sesi.';
    res.status(500).json({ error: message });
  }
};

/**
 * Middleware khusus Admin/Manajer:
 * Memprioritaskan JWT dengan role 'manager'. Jika masih membawa X-Admin-Key selama masa transisi,
 * hanya diizinkan apabila bukan token 'customer'.
 */
export const authenticateManager = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractBearerToken(req);
  if (token) {
    const payload = verifyJwtToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Token JWT manajer tidak valid atau kedaluwarsa.' });
      return;
    }
    if (payload.role !== 'manager') {
      res.status(403).json({ error: 'Akses ditolak. Memerlukan peran Pemantau/Manajer.' });
      return;
    }
    req.user = payload;
    next();
    return;
  }

  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
  if (adminKey === env.ADMIN_SECRET) {
    req.user = {
      id: 0,
      no_whatsapp: 'admin-system',
      nama: 'Manajer Operasional',
      role: 'manager',
    };
    next();
    return;
  }

  res.status(403).json({ error: 'Akses admin/manajer tidak diizinkan.' });
};

