require('dotenv').config(); // Muat rahasia dari backend/.env
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const https = require('https');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// ── Konfigurasi penyimpanan file gambar menu ──────────────────────────────────
// File disimpan ke folder public/uploads/ dengan nama unik berbasis timestamp.
// Folder dibuat otomatis jika belum ada.
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const menuImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'menu-' + Date.now() + ext);
  },
});
const uploadMenuImage = multer({
  storage: menuImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // maks 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diizinkan.'));
  },
});

// Sajikan folder uploads sebagai static files (/uploads/menu-xxx.jpg)
app.use('/uploads', express.static(UPLOADS_DIR));
// ─────────────────────────────────────────────────────────────────────────────

// Mode development/UTS: OTP disertakan di response API agar mudah di-demo
// tanpa gateway WhatsApp berbayar. Matikan dengan: DEV_MODE=false npm run dev
const DEV_MODE = process.env.DEV_MODE !== 'false';

// JWT Secret & expiry — override dengan JWT_SECRET di .env
const JWT_SECRET = process.env.JWT_SECRET || 'puthu-lanang-jwt-secret-2026';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

// Helper: buat JWT token untuk user
function signJwt(user) {
  return jwt.sign(
    { id: user.id, no_whatsapp: user.no_whatsapp, nama: user.nama },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// Helper: verifikasi JWT token, kembalikan payload atau null
function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

// =============================================================
// KONEKSI DATABASE MYSQL (XAMPP / Laragon)
// Menggunakan pool agar koneksi tahan terhadap timeout & restart
// =============================================================
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'puthu_lanang_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Uji koneksi saat server pertama kali berjalan
db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Koneksi MySQL gagal:', err.message);
    console.error('   Pastikan MySQL / XAMPP sudah berjalan dan database "puthu_lanang_db" sudah dibuat.');
    return;
  }
  console.log('✅ Berhasil terhubung ke database MySQL puthu_lanang_db.');
  connection.release();
  ensureOrdersSchema();
});

// Pastikan tabel `orders` punya kolom `summary_items` (ringkasan item pesanan)
// agar riwayat bisa menampilkan isi pesanan, serta kolom `user_id` (relasi ke
// akun pemilik pesanan). Aman dijalankan berulang kali.
function ensureOrdersSchema() {
  const ensureColumn = (table, column, alterSql) => {
    const checkColumn = `
      SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    `;
    db.query(checkColumn, [table, column], (err, rows) => {
      if (err) return console.error(`❌ Gagal memeriksa kolom ${table}.${column}:`, err.message);
      if (rows[0].n > 0) return;

      db.query(alterSql, (err2) => {
        if (err2) return console.error(`❌ Gagal menambah kolom ${column}:`, err2.message);
        console.log(`✅ Kolom ${table}.${column} berhasil ditambahkan.`);
      });
    });
  };

  ensureColumn('orders', 'summary_items', 'ALTER TABLE orders ADD COLUMN summary_items TEXT NULL AFTER total');
  ensureColumn('orders', 'user_id', 'ALTER TABLE orders ADD COLUMN user_id INT NULL AFTER id');
  ensureColumn('orders', 'name', "ALTER TABLE orders ADD COLUMN name VARCHAR(100) NULL AFTER user_id");
  ensureColumn('orders', 'phone', "ALTER TABLE orders ADD COLUMN phone VARCHAR(20) NULL AFTER name");

  // Pastikan tabel menu punya kolom deskripsi & gambar
  ensureMenuSchema();
}

// Pastikan tabel menu punya semua kolom yang dibutuhkan Admin Panel
function ensureMenuSchema() {
  // Buat tabel menu jika belum ada
  db.query(`
    CREATE TABLE IF NOT EXISTS menu (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nama VARCHAR(100) NOT NULL,
      harga INT NOT NULL DEFAULT 0,
      kategori VARCHAR(50) DEFAULT 'pusaka',
      deskripsi TEXT,
      gambar VARCHAR(255),
      tersedia TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) return console.error('❌ Gagal membuat tabel menu:', err.message);
  });

  const ensureMenuColumn = (column, alterSql) => {
    db.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu' AND COLUMN_NAME = ?`,
      [column],
      (err, rows) => {
        if (err || rows[0].n > 0) return;
        db.query(alterSql, (err2) => {
          if (err2) console.error(`❌ Gagal tambah kolom menu.${column}:`, err2.message);
          else console.log(`✅ Kolom menu.${column} berhasil ditambahkan.`);
        });
      }
    );
  };

  ensureMenuColumn('deskripsi', 'ALTER TABLE menu ADD COLUMN deskripsi TEXT NULL');
  ensureMenuColumn('gambar', 'ALTER TABLE menu ADD COLUMN gambar VARCHAR(255) NULL');
  ensureMenuColumn('tersedia', 'ALTER TABLE menu ADD COLUMN tersedia TINYINT(1) DEFAULT 1');
}


// =============================================================
// HELPER: Verifikasi akun pemilik request
// - user_id harus ada di tabel `users` (akun yang sudah dihapus ditolak)
// - header `Authorization: Bearer <token>` harus cocok dengan token akun tsb
// Callback: cb(user) bila valid; bila tidak, response error langsung dikirim.
// =============================================================
function parseUserId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function withAuthenticatedUser(req, res, rawUserId, cb) {
  const userId = parseUserId(rawUserId);
  if (!userId) {
    return res.status(400).json({ error: 'user_id wajib diisi dan harus berupa angka.' });
  }

  db.query('SELECT id, nama, no_whatsapp FROM users WHERE id = ? LIMIT 1', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Akun tidak ditemukan atau sudah dihapus. Silakan masuk kembali.' });
    }

    const user = rows[0];
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (bearer !== 'server-token-' + user.no_whatsapp) {
      return res.status(403).json({ error: 'Sesi tidak valid untuk akun ini. Silakan masuk kembali.' });
    }

    cb(user);
  });
}

// Format tanggal lokal YYYY-MM-DD (fallback bila pickupDate tidak dikirim)
function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// =============================================================
// HELPER: Kirim pesan WhatsApp via Fonnte API
// =============================================================
function sendFonnteMessage(targetPhone, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      target: targetPhone,
      message: message,
      countryCode: '62',
    });

    const options = {
      hostname: 'api.fonnte.com',
      port: 443,
      path: '/send',
      method: 'POST',
      headers: {
        'Authorization': process.env.FONNTE_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        console.log('[FONNTE RESPONSE]:', responseBody);
        resolve(responseBody);
      });
    });

    req.on('error', (error) => {
      console.error('[FONNTE ERROR]:', error.message);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// =============================================================
// CEK SERVER
// =============================================================
app.get('/', (req, res) => {
  res.json({
    message: '🥢 API Backend Puthu Lanang Berjalan Aktif!',
    version: '2.0.0',
    endpoints: [
      'GET  /api/menu',
      'GET  /api/orders?user_id=<id_akun>',
      'POST /api/orders',
      'PATCH /api/orders/:id/complete',
      'POST /api/auth/user-login',
      'POST /api/auth/user-register',
      'POST /api/auth/send-otp',
      'POST /api/auth/verify-otp',
      'POST /api/auth/forgot-password',
      'POST /api/payment/create-charge',
      'POST /api/ai/queue-estimator',
      'POST /api/ai/recommendation',
    ],
  });
});

// =============================================================
// GET /api/menu — Ambil seluruh daftar menu dari tabel `menu`
// =============================================================
app.get('/api/menu', (req, res) => {
  db.query('SELECT * FROM menu ORDER BY id ASC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// =============================================================
// POST /api/orders — Simpan pesanan baru & kembalikan data e-tiket
// Header: Authorization: Bearer <token>
// Body: { user_id, pickupTime, pickupDate, items, total, notes }
// Pesanan disimpan dengan orders.user_id = akun yang sedang login.
// Nama & nomor WhatsApp diambil dari data akun di database.
// =============================================================
app.post('/api/orders', (req, res) => {
  const { user_id, pickupTime, pickupDate, items, total, notes } = req.body;

  const totalNum = Number(total);
  if (!Number.isFinite(totalNum) || totalNum <= 0) {
    return res.status(400).json({ error: 'Field total wajib diisi dengan angka lebih dari 0.' });
  }

  withAuthenticatedUser(req, res, user_id, (user) => {
    const qrToken = 'PL-2026-' + Math.floor(10000 + Math.random() * 90000);
    const antreanNo = Math.floor(50 + Math.random() * 50);
    const pickupDateValue = pickupDate && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate) ? pickupDate : todayIso();

    const summaryItems =
      Array.isArray(items) && items.length > 0
        ? items.map((it) => `${it.quantity || it.qty || 1}x ${it.nama || it.name || 'Puthu'}`).join(', ')
        : '1x Puthu / Paket Pilihan';

    const query = `
      INSERT INTO orders (user_id, name, phone, pickup_time, pickup_date, total, notes, qr_token, antrean, summary_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      query,
      [user.id, user.nama, user.no_whatsapp, pickupTime || '-', pickupDateValue, totalNum, notes || '', qrToken, antreanNo, summaryItems],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
          message: 'Pesanan berhasil dibuat',
          data: {
            id: 'ORD-' + result.insertId,
            user_id: user.id,
            qr_code_token: qrToken,
            antrean: antreanNo,
            status: 'Sedang Dikukus',
            total_harga: totalNum,
            name: user.nama,
            phone: user.no_whatsapp,
            pickup_time: pickupTime || '-',
            pickup_date: pickupDateValue,
            notes: notes || '',
            summary_items: summaryItems,
            items: items || [],
          },
        });
      }
    );
  });
});

// =============================================================
// GET /api/orders?user_id=<id_akun> — Riwayat pesanan milik akun
// Header: Authorization: Bearer <token>
// Hanya mengembalikan pesanan dengan orders.user_id = akun tsb (urut terbaru).
// Pesanan akun yang sudah dihapus (user_id NULL) TIDAK akan pernah muncul.
// Response: { data: [ ...pesanan ] }
// =============================================================
app.get('/api/orders', (req, res) => {
  withAuthenticatedUser(req, res, req.query.user_id, (user) => {
    const query = `
      SELECT
        CONCAT('ORD-', id)                    AS id,
        qr_token                              AS qr_code_token,
        antrean,
        status,
        total,
        summary_items,
        pickup_time,
        DATE_FORMAT(pickup_date, '%Y-%m-%d')  AS pickup_date,
        notes,
        created_at
      FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `;

    db.query(query, [user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: rows });
    });
  });
});

// =============================================================
// PATCH /api/orders/:id/complete — Konfirmasi pesanan selesai
// Header: Authorization: Bearer <token>
// Body: { user_id }
// Ubah status 'Sedang Dikukus' -> 'Selesai' (hanya untuk pesanan milik akun).
// :id boleh berupa '8' atau 'ORD-8'.
// =============================================================
app.patch('/api/orders/:id/complete', (req, res) => {
  const orderId = parseInt(String(req.params.id).replace(/^ORD-/i, ''), 10);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'ID pesanan tidak valid.' });
  }

  withAuthenticatedUser(req, res, req.body.user_id, (user) => {
    db.query('SELECT id, status FROM orders WHERE id = ? AND user_id = ? LIMIT 1', [orderId, user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Pesanan tidak ditemukan untuk akun ini.' });
      }

      const respondOk = () =>
        res.json({ message: 'Pesanan ditandai selesai', data: { id: 'ORD-' + orderId, status: 'Selesai' } });

      // Idempoten: sudah selesai -> tetap sukses
      if (rows[0].status === 'Selesai') return respondOk();

      db.query(
        "UPDATE orders SET status = 'Selesai' WHERE id = ? AND user_id = ?",
        [orderId, user.id],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          respondOk();
        }
      );
    });
  });
});

// =============================================================
// POST /api/auth/user-login — Login dengan no_whatsapp & password
// Response kini menyertakan jwt_token (Materi 9 — JWT Auth)
// =============================================================
app.post('/api/auth/user-login', (req, res) => {
  const { no_whatsapp, password } = req.body;

  if (!no_whatsapp || !password) {
    return res.status(400).json({ message: 'Nomor WhatsApp dan password wajib diisi.' });
  }

  db.query(
    'SELECT * FROM users WHERE no_whatsapp = ? AND password = ? LIMIT 1',
    [no_whatsapp, password],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      if (results.length === 0) {
        return res.status(400).json({ message: 'Nomor WhatsApp atau password salah.' });
      }

      const user = results[0];
      const jwtToken = signJwt(user);

      res.json({
        message: 'Login berhasil',
        data: {
          id: user.id,
          nama: user.nama,
          no_whatsapp: user.no_whatsapp,
          // token lama (server-token-*) tetap ada untuk kompatibilitas backward
          token: 'server-token-' + user.no_whatsapp,
          // jwt_token: token JWT resmi Materi 9
          jwt_token: jwtToken,
        },
      });
    }
  );
});

// =============================================================
// POST /api/auth/verify-session — Validasi JWT token aktif
// Header: Authorization: Bearer <jwt_token>
// Response: { valid: true, user: { id, nama, no_whatsapp } }
// =============================================================
app.post('/api/auth/verify-session', (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    return res.status(401).json({ valid: false, message: 'Token tidak disertakan.' });
  }

  const payload = verifyJwt(bearer);
  if (!payload) {
    return res.status(401).json({ valid: false, message: 'Token tidak valid atau sudah kedaluwarsa.' });
  }

  // Pastikan user masih ada di database
  db.query('SELECT id, nama, no_whatsapp FROM users WHERE id = ? LIMIT 1', [payload.id], (err, rows) => {
    if (err) return res.status(500).json({ valid: false, message: err.message });
    if (rows.length === 0) {
      return res.status(401).json({ valid: false, message: 'Akun tidak ditemukan atau sudah dihapus.' });
    }

    const user = rows[0];
    res.json({
      valid: true,
      user: { id: user.id, nama: user.nama, no_whatsapp: user.no_whatsapp },
    });
  });
});

// =============================================================
// POST /api/auth/user-register — Daftar akun baru langsung
// Body: { nama, no_whatsapp, password }
// (Digunakan setelah OTP berhasil diverifikasi via verify-otp)
// =============================================================
app.post('/api/auth/user-register', (req, res) => {
  const { nama, no_whatsapp, password } = req.body;

  if (!nama || !no_whatsapp || !password) {
    return res.status(400).json({ message: 'Nama, nomor WhatsApp, dan password wajib diisi.' });
  }

  // Cek apakah nomor sudah terdaftar
  db.query(
    'SELECT id FROM users WHERE no_whatsapp = ? LIMIT 1',
    [no_whatsapp],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      if (results.length > 0) {
        return res.status(400).json({ message: 'Nomor WhatsApp sudah terdaftar. Silakan masuk.' });
      }

      const insertQuery = `
        INSERT INTO users (nama, no_whatsapp, password, is_verified)
        VALUES (?, ?, ?, 1)
      `;
      db.query(insertQuery, [nama, no_whatsapp, password], (err2, result) => {
        if (err2) return res.status(500).json({ message: err2.message });

        res.json({
          message: 'Registrasi berhasil!',
          data: {
            id: result.insertId,
            nama,
            no_whatsapp,
            token: 'server-token-' + no_whatsapp,
          },
        });
      });
    }
  );
});

// =============================================================
// POST /api/auth/send-otp — Kirim OTP via WhatsApp (Fonnte)
// Body: { no_whatsapp, type: 'register' | 'forgot' }
// =============================================================
app.post('/api/auth/send-otp', async (req, res) => {
  const { no_whatsapp, type } = req.body;

  if (!no_whatsapp) {
    return res.status(400).json({ message: 'Nomor WhatsApp wajib diisi.' });
  }

  db.query('SELECT id FROM users WHERE no_whatsapp = ? LIMIT 1', [no_whatsapp], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });

    const isExist = results.length > 0;

    if (type === 'register' && isExist) {
      return res.status(400).json({ message: 'Nomor WhatsApp sudah terdaftar. Silakan masuk.' });
    }
    if (type === 'forgot' && !isExist) {
      return res.status(400).json({ message: 'Akun belum terdaftar. Silakan daftar terlebih dahulu.' });
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // berlaku 5 menit

    // Hapus OTP lama yang belum dipakai untuk nomor ini
    db.query('DELETE FROM otp_codes WHERE no_whatsapp = ?', [no_whatsapp]);

    const insertOtp = 'INSERT INTO otp_codes (no_whatsapp, otp_code, expires_at) VALUES (?, ?, ?)';
    db.query(insertOtp, [no_whatsapp, otpCode, expiresAt], async (err2) => {
      if (err2) return res.status(500).json({ message: err2.message });

      // OTP sudah tersimpan di tabel otp_codes — tampilkan di terminal untuk testing
      console.log('KODE OTP:', otpCode, `(untuk ${no_whatsapp})`);

      const pesan =
        `🔒 *KODE OTP PUTHU LANANG*\n\n` +
        `Kode verifikasi Anda: *${otpCode}*\n` +
        `Berlaku 5 menit. Jangan berikan kode ini kepada siapa pun.\n\n` +
        `_Puthu Lanang Malang — EST. 1935_`;

      // Mode development / demo: kembalikan OTP di response, WhatsApp dikirim
      // best-effort di belakang layar (gagal pun tidak menghalangi demo).
      if (DEV_MODE) {
        sendFonnteMessage(no_whatsapp, pesan)
          .then(() => console.log(`[OTP] WhatsApp terkirim ke ${no_whatsapp}`))
          .catch((apiErr) => console.warn('[OTP FONNTE GAGAL]:', apiErr.message));

        return res.json({
          success: true,
          otp_code: otpCode,
          message: 'OTP berhasil dikirim',
        });
      }

      // Mode production: OTP TIDAK dikembalikan di response
      try {
        await sendFonnteMessage(no_whatsapp, pesan);
        console.log(`[OTP] Terkirim ke ${no_whatsapp}`);
        res.json({ success: true, message: 'Kode OTP berhasil dikirim ke WhatsApp Anda.' });
      } catch (apiErr) {
        console.error('[OTP FONNTE GAGAL]:', apiErr.message);
        res.status(502).json({ success: false, message: 'Gagal mengirim OTP ke WhatsApp. Coba lagi.' });
      }
    });
  });
});

// =============================================================
// POST /api/auth/verify-otp — Verifikasi OTP
// Body: { no_whatsapp, otp_code, nama, password, is_register }
// is_register=true  → selesaikan pendaftaran
// is_register=false → hanya verifikasi (untuk lupa password)
// =============================================================
app.post('/api/auth/verify-otp', (req, res) => {
  const { nama, no_whatsapp, password, otp_code, is_register } = req.body;

  if (!no_whatsapp || !otp_code) {
    return res.status(400).json({ message: 'Nomor WhatsApp dan kode OTP wajib diisi.' });
  }

  const checkOtp = `
    SELECT * FROM otp_codes
    WHERE no_whatsapp = ? AND otp_code = ? AND expires_at > NOW()
    ORDER BY id DESC LIMIT 1
  `;

  db.query(checkOtp, [no_whatsapp, otp_code], (err, otpResults) => {
    if (err) return res.status(500).json({ message: err.message });
    if (otpResults.length === 0) {
      return res.status(400).json({ message: 'Kode OTP salah atau sudah kedaluwarsa.' });
    }

    // Jika hanya verifikasi (alur lupa password), cukup konfirmasi valid
    if (!is_register) {
      return res.json({ message: 'OTP valid. Silakan reset password Anda.' });
    }

    // Alur register: pastikan user belum ada, lalu buat akun baru
    db.query('SELECT id FROM users WHERE no_whatsapp = ? LIMIT 1', [no_whatsapp], (err2, userResults) => {
      if (err2) return res.status(500).json({ message: err2.message });

      if (userResults.length > 0) {
        return res.status(400).json({ message: 'Nomor WhatsApp sudah terdaftar. Silakan masuk.' });
      }

      const insert = 'INSERT INTO users (nama, no_whatsapp, password, is_verified) VALUES (?, ?, ?, 1)';
      db.query(insert, [nama || 'Pelanggan', no_whatsapp, password || ''], (err3, result) => {
        if (err3) return res.status(500).json({ message: err3.message });

        // Hapus OTP yang sudah digunakan
        db.query('DELETE FROM otp_codes WHERE no_whatsapp = ?', [no_whatsapp]);

        res.json({
          message: 'Registrasi & Verifikasi Berhasil!',
          data: {
            id: result.insertId,
            nama: nama || 'Pelanggan',
            no_whatsapp,
            token: 'server-token-' + no_whatsapp,
          },
        });
      });
    });
  });
});

// =============================================================
// POST /api/auth/forgot-password — Reset password via OTP
// Body: { no_whatsapp, otp_code, new_password }
// =============================================================
app.post('/api/auth/forgot-password', (req, res) => {
  const { no_whatsapp, otp_code, new_password } = req.body;

  if (!no_whatsapp || !otp_code || !new_password) {
    return res.status(400).json({ message: 'Semua kolom wajib diisi.' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ message: 'Password baru minimal 6 karakter.' });
  }

  const checkOtp = `
    SELECT * FROM otp_codes
    WHERE no_whatsapp = ? AND otp_code = ? AND expires_at > NOW()
    ORDER BY id DESC LIMIT 1
  `;

  db.query(checkOtp, [no_whatsapp, otp_code], (err, otpResults) => {
    if (err) return res.status(500).json({ message: err.message });
    if (otpResults.length === 0) {
      return res.status(400).json({ message: 'Kode OTP salah atau sudah kedaluwarsa.' });
    }

    db.query(
      'UPDATE users SET password = ? WHERE no_whatsapp = ?',
      [new_password, no_whatsapp],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: err2.message });
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'Akun tidak ditemukan.' });
        }

        // Hapus OTP yang sudah digunakan
        db.query('DELETE FROM otp_codes WHERE no_whatsapp = ?', [no_whatsapp]);

        res.json({ message: 'Password berhasil diubah. Silakan masuk dengan password baru.' });
      }
    );
  });
});

// =============================================================
// POST /api/payment/create-charge — Buat Snap Token Midtrans Sandbox
// Body: { gross_amount, customer_name, customer_phone }
// =============================================================
app.post('/api/payment/create-charge', (req, res) => {
  const { gross_amount, customer_name, customer_phone } = req.body;

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const encodedKey = Buffer.from(serverKey + ':').toString('base64');

  const payload = JSON.stringify({
    transaction_details: {
      order_id: 'PL-TRX-' + Date.now(),
      gross_amount: gross_amount || 18000,
    },
    item_details: [
      {
        id: 'ITEM-01',
        price: gross_amount || 18000,
        quantity: 1,
        name: 'Jajanan Tradisional Puthu Lanang',
      },
    ],
    customer_details: {
      first_name: customer_name || 'Pelanggan Puthu Lanang',
      phone: customer_phone || '088212383828',
    },
  });

  const options = {
    hostname: 'app.sandbox.midtrans.com',
    port: 443,
    path: '/snap/v1/transactions',
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + encodedKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const midtransReq = https.request(options, (midtransRes) => {
    let body = '';
    midtransRes.on('data', (chunk) => { body += chunk; });
    midtransRes.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.redirect_url) {
          res.json({
            message: 'Midtrans Snap Token Created',
            redirect_url: json.redirect_url,
            token: json.token,
          });
        } else {
          res.status(400).json({
            message: json.error_messages ? json.error_messages[0] : 'Gagal membuat transaksi Snap.',
          });
        }
      } catch (e) {
        res.status(500).json({ message: 'Gagal mem-parsing respons dari Midtrans.' });
      }
    });
  });

  midtransReq.on('error', (err) => {
    res.status(500).json({ message: 'Koneksi ke Midtrans gagal: ' + err.message });
  });

  midtransReq.write(payload);
  midtransReq.end();
});

// =============================================================
// POST /api/ai/queue-estimator — Estimasi waktu antrean gerai
// Body: { outlet, day, timeSlot }
// =============================================================
app.post('/api/ai/queue-estimator', (req, res) => {
  const {
    outlet = 'Gerai Pusat Celaket',
    day = 'Hari Ini',
    timeSlot = '16:30 - 17:00',
  } = req.body;

  let baseWaitMin = 8;
  let baseWaitMax = 12;
  let crowdLevel = 'Ramai Lancar';
  let crowdColor = 'gold';
  let peakPct = 60;
  let tips = 'Slot ideal. Pesanan Anda diprioritaskan hangat saat diambil.';

  const isCelaket = outlet.toLowerCase().includes('celaket');
  const isWeekend = ['sabtu', 'minggu', 'jumat'].some((d) => day.toLowerCase().includes(d));

  if (timeSlot.startsWith('16:00')) {
    baseWaitMin = 4; baseWaitMax = 7; crowdLevel = 'Antrean Pendek'; crowdColor = 'green'; peakPct = 35;
    tips = 'Kondisi gerai sangat lengang. Sangat direkomendasikan untuk pengambilan kilat!';
  } else if (timeSlot.startsWith('17:00') || timeSlot.startsWith('17:30')) {
    baseWaitMin = 14; baseWaitMax = 20; crowdLevel = 'Jam Sibuk (Peak Hours)'; crowdColor = 'orange'; peakPct = 88;
    tips = 'Jam favorit pelanggan sepulang kerja. Disarankan tiba 5 menit sebelum slot berakhir.';
  } else if (timeSlot.startsWith('18:00')) {
    baseWaitMin = 10; baseWaitMax = 15; crowdLevel = 'Ramai Lancar'; crowdColor = 'gold'; peakPct = 70;
    tips = 'Aroma kukusan sangat harum. Antrean mengalir stabil.';
  } else if (timeSlot.startsWith('18:30')) {
    baseWaitMin = 5; baseWaitMax = 9; crowdLevel = 'Antrean Menipis'; crowdColor = 'green'; peakPct = 45;
    tips = 'Slot malam santai. Segera ambil sebelum gerai tutup pukul 19:30.';
  }

  if (!isCelaket) {
    baseWaitMin = Math.max(3, Math.round(baseWaitMin * 0.75));
    baseWaitMax = Math.max(6, Math.round(baseWaitMax * 0.75));
    peakPct = Math.round(peakPct * 0.8);
  }

  if (isWeekend) {
    baseWaitMin += 2;
    baseWaitMax += 3;
    peakPct = Math.min(95, peakPct + 15);
  }

  res.json({
    status: 'success',
    outlet, day,
    time_slot: timeSlot,
    crowd_level: crowdLevel,
    crowd_color: crowdColor,
    estimated_wait: `~${baseWaitMin} - ${baseWaitMax} Mnt`,
    wait_time_min: baseWaitMin,
    wait_time_max: baseWaitMax,
    peak_percentage: peakPct,
    confidence_score: '96% Akurasi Prediktif AI',
    tips,
  });
});

// =============================================================
// POST /api/ai/recommendation — Rekomendasi menu cerdas
// Body: { query, budget, preference }
// =============================================================
app.post('/api/ai/recommendation', (req, res) => {
  const { query = '', budget, preference = '' } = req.body;
  const lowerQ = (query + ' ' + preference).toLowerCase();

  // Fallback menu jika tabel kosong
  const FALLBACK_MENU = [
    { id: 'puthu-01', nama: 'Puthu', harga: 18000, kategori: 'pusaka' },
    { id: 'klepon-02', nama: 'Klepon', harga: 18000, kategori: 'paling_laris' },
    { id: 'cenil-03', nama: 'Cenil', harga: 18000, kategori: 'pusaka' },
    { id: 'lupis-04', nama: 'Lupis', harga: 18000, kategori: 'pusaka' },
    { id: 'paket-campur-05', nama: 'Paket Campur', harga: 20000, kategori: 'paket_campur' },
    { id: 'besek-hampers-06', nama: 'Box Besek Bambu Hampers', harga: 45000, kategori: 'besek' },
  ];

  db.query('SELECT * FROM menu', (err, dbResults) => {
    const menuList = (dbResults && dbResults.length > 0) ? dbResults : FALLBACK_MENU;

    const find = (keyword) => menuList.find((m) => (m.nama || '').toLowerCase().includes(keyword));

    let title = 'Paket Solo Harmoni 1935';
    let reason = 'Pilihan kurasi paling pas untuk dinikmati sendiri atau berdua.';
    let aiTag = 'Rekomendasi Cepat AI';
    let items = [];

    const wantsHampers = lowerQ.includes('hampers') || lowerQ.includes('oleh') || lowerQ.includes('hadiah') || lowerQ.includes('besek');
    const wantsFamily = lowerQ.includes('keluarga') || lowerQ.includes('rame') || lowerQ.includes('arisan') || lowerQ.includes('banyak') || lowerQ.includes('kantor');
    const wantsSweet = lowerQ.includes('manis') || lowerQ.includes('gula') || lowerQ.includes('aren');
    const wantsSavory = lowerQ.includes('gurih') || lowerQ.includes('kenyal') || lowerQ.includes('cenil') || lowerQ.includes('lupis');

    if (wantsHampers) {
      title = 'Paket Hampers Anyaman Besek Elegan';
      reason = 'Dipilih khusus untuk hantaran istimewa beraroma pandan dengan kemasan besek bambu ramah lingkungan.';
      aiTag = 'Rekomendasi Hantaran (Best Gift)';
      items = [
        { ...(find('besek') || menuList[5]), qty: 1, alasan: 'Kemasan anyaman bambu otentik siap hantar' },
        { ...(find('campur') || menuList[4]), qty: 1, alasan: 'Paket campur lengkap agar makin meriah' },
      ];
    } else if (wantsFamily) {
      title = 'Paket Santap Bersama Keluarga (3-5 Orang)';
      reason = 'Kombinasi komplit agar seluruh keluarga bisa mencicipi semua varian legendaris.';
      aiTag = 'Paling Populer untuk Keluarga';
      items = [
        { ...(find('campur') || menuList[4]), qty: 2, alasan: '2 porsi paket campur isi komplit 4 jajanan' },
        { ...(find('puthu') || menuList[0]), qty: 1, alasan: 'Puthu hangat aroma pandan suji favorit anak-anak' },
        { ...(find('klepon') || menuList[1]), qty: 1, alasan: 'Klepon lumer gula aren sensasi letupan di mulut' },
      ];
    } else if (wantsSweet) {
      title = 'Kombinasi Manis Legit Aren Asli';
      reason = 'Favorit bagi pecinta manis alami gula aren murni tanpa pemanis buatan.';
      aiTag = 'Manis Alami (Natural Sweetness)';
      items = [
        { ...(find('puthu') || menuList[0]), qty: 1, alasan: 'Uap bambu dengan gula aren cair di tengahnya' },
        { ...(find('klepon') || menuList[1]), qty: 1, alasan: 'Letupan gula aren cair berbalut kelapa parut segar' },
      ];
    } else if (wantsSavory) {
      title = 'Duo Tekstur Tradisional Gurih & Kenyal';
      reason = 'Tekstur legit dari beras ketan dan singkong dengan kelapa parut kukus gurih.';
      aiTag = 'Pecinta Tekstur Tradisional';
      items = [
        { ...(find('cenil') || menuList[2]), qty: 1, alasan: 'Cenil warna-warni kenyal berlumur juruh aren' },
        { ...(find('lupis') || menuList[3]), qty: 1, alasan: 'Lupis segitiga ketan pulen legit gurih' },
      ];
    } else {
      items = [
        { ...(find('campur') || menuList[4]), qty: 1, alasan: 'Semua varian rasa dalam satu piring hangat' },
        { ...(find('puthu') || menuList[0]), qty: 1, alasan: 'Puthu bambu ikon utama Puthu Lanang Malang' },
      ];
    }

    // Terapkan batas budget
    const targetBudget = budget ? parseInt(budget) : null;
    let totalEst = items.reduce((acc, it) => acc + (it.harga || 18000) * (it.qty || 1), 0);

    if (targetBudget && totalEst > targetBudget && items.length > 1) {
      items = items.slice(0, 1);
      totalEst = items.reduce((acc, it) => acc + (it.harga || 18000) * (it.qty || 1), 0);
    }

    res.json({
      status: 'success',
      recommendation_title: title,
      reason,
      ai_tag: aiTag,
      total_estimated: totalEst,
      items: items.map((it) => ({
        id: it.id || 'puthu-01',
        nama: it.nama || it.name || 'Menu Puthu Lanang',
        harga: it.harga || it.price || 18000,
        qty: it.qty || 1,
        gambar: it.gambar || it.image || 'assets/images/puthu_bambu.png',
        alasan: it.alasan || 'Pilihan terbaik resep 1935',
      })),
    });
  });
});

// =============================================================
// ADMIN ENDPOINTS — Khusus Dashboard Admin Web
// Tidak memerlukan autentikasi user (cukup pakai ADMIN_SECRET)
// Header: X-Admin-Key: puthu-admin-2026
// =============================================================

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'puthu-admin-2026';

function withAdminAuth(req, res, cb) {
  const key = req.headers['x-admin-key'] || req.query.admin_key;
  if (key !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Akses admin tidak diizinkan.' });
  }
  cb();
}

// GET /api/admin/orders — Semua pesanan (terbaru di atas), support filter status
app.get('/api/admin/orders', (req, res) => {
  withAdminAuth(req, res, () => {
    const { status } = req.query;
    let query = `
      SELECT
        o.id,
        CONCAT('ORD-', o.id)                  AS order_id,
        o.qr_token                             AS qr_code_token,
        o.antrean,
        o.status,
        o.total,
        o.name                                 AS customer_name,
        o.phone                                AS customer_phone,
        o.pickup_time,
        DATE_FORMAT(o.pickup_date, '%Y-%m-%d') AS pickup_date,
        o.notes,
        o.summary_items,
        o.created_at
      FROM orders o
    `;
    const params = [];
    if (status && status !== 'Semua') {
      query += ' WHERE o.status = ?';
      params.push(status);
    }
    query += ' ORDER BY o.created_at DESC, o.id DESC';

    db.query(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: rows });
    });
  });
});

// PATCH /api/admin/orders/:id/status — Ubah status pesanan (oleh Admin)
// Body: { status: 'Baru' | 'Diproses' | 'Selesai' | 'Dibatalkan' }
app.patch('/api/admin/orders/:id/status', (req, res) => {
  withAdminAuth(req, res, () => {
    const orderId = parseInt(String(req.params.id).replace(/^ORD-/i, ''), 10);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'ID pesanan tidak valid.' });
    }

    const VALID_STATUSES = ['Baru', 'Diproses', 'Sedang Dikukus', 'Selesai', 'Dibatalkan'];
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status tidak valid. Pilihan: ${VALID_STATUSES.join(', ')}` });
    }

    db.query(
      'UPDATE orders SET status = ? WHERE id = ?',
      [status, orderId],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
        res.json({ message: 'Status pesanan berhasil diperbarui', data: { id: 'ORD-' + orderId, status } });
      }
    );
  });
});

// GET /api/admin/menu — Semua menu (untuk Admin Panel)
app.get('/api/admin/menu', (req, res) => {
  withAdminAuth(req, res, () => {
    db.query('SELECT * FROM menu ORDER BY id ASC', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: results });
    });
  });
});

// =============================================================
// Helper: Buat slug id dari nama menu (kompatibel dengan VARCHAR id di tabel menu)
// Contoh: "Puthu Bambu Baru" → "puthu-bambu-baru-k7x2j"
// =============================================================
function slugifyMenuId(str) {
  const base = str
    .toLowerCase()
    .normalize('NFD')                  // pisah karakter diakritik
    .replace(/[\u0300-\u036f]/g, '')   // hapus diakritik
    .replace(/[^a-z0-9\s-]/g, '')     // hapus karakter non-alfanumerik
    .trim()
    .replace(/\s+/g, '-')             // spasi → tanda hubung
    .replace(/-+/g, '-')              // hapus tanda hubung berulang
    .slice(0, 35);                    // maks 35 karakter
  const suffix = Date.now().toString(36).slice(-4); // 4 karakter unik
  return `${base}-${suffix}`;
}

// Pemetaan kategori → path gambar default (dari assets Flutter yang sudah di-copy ke public/)
function defaultImageForCategory(category, name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('puthu'))                       return 'assets/images/puthu_bambu.png';
  if (n.includes('klepon'))                      return 'assets/images/klepon_pandan.png';
  if (n.includes('cenil'))                       return 'assets/images/cenil_pelangi.png';
  if (n.includes('lupis'))                       return 'assets/images/lupis_ketan.png';
  if (n.includes('paket') || n.includes('campur')) return 'assets/images/paket_tampah.png';
  if (n.includes('besek') || n.includes('hampers')) return 'assets/images/paket_tampah.png';
  if (category === 'paling_laris')               return 'assets/images/klepon_pandan.png';
  if (category === 'besek')                      return 'assets/images/paket_tampah.png';
  return 'assets/images/paket_tampah.png';
}

// POST /api/admin/menu — Tambah menu baru ke database
// Body: { name, price, category, description?, portionDetails?, preparationTimeMins? }
// FIX: tabel menu memakai id VARCHAR → generate slug id otomatis
app.post('/api/admin/menu', (req, res) => {
  withAdminAuth(req, res, () => {
    const name        = (req.body.name        || req.body.nama        || '').trim();
    const price       = req.body.price        ?? req.body.harga;
    const category    = (req.body.category    || req.body.kategori    || 'pusaka').trim();
    const description = (req.body.description || req.body.deskripsi   || '').trim();
    const image       = (req.body.image       || req.body.gambar      || defaultImageForCategory(category, name)).trim();
    const stock       = req.body.stock != null ? Number(req.body.stock) : 100; // default stok 100

    // Validasi wajib
    if (!name) {
      return res.status(400).json({ error: 'Nama menu wajib diisi.' });
    }
    if (price == null || price === '' || isNaN(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ error: 'Harga menu wajib diisi dan harus berupa angka positif.' });
    }

    // Generate id VARCHAR unik dari nama menu (sesuai skema tabel yang ada)
    const menuId = slugifyMenuId(name);

    db.query(
      `INSERT INTO menu (id, name, price, category, description, image, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [menuId, name, Number(price), category, description || 'Sajian jajanan pasar tradisional otentik 1935.', image, stock],
      (err) => {
        if (err) {
          console.error('❌ Gagal INSERT menu:', err.message);
          // Jika id duplicate (sangat jarang), coba satu kali lagi dengan suffix baru
          if (err.code === 'ER_DUP_ENTRY') {
            const retryId = slugifyMenuId(name);
            return db.query(
              `INSERT INTO menu (id, name, price, category, description, image, stock) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [retryId, name, Number(price), category, description || 'Sajian jajanan pasar tradisional otentik 1935.', image, stock],
              (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                console.log(`✅ Menu "${name}" (id: ${retryId}) berhasil ditambahkan ke database.`);
                res.status(201).json({
                  message: `Menu "${name}" berhasil ditambahkan!`,
                  data: { id: retryId, name, price: Number(price), category, description, image, stock },
                });
              }
            );
          }
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Menu "${name}" (id: ${menuId}) berhasil ditambahkan ke database.`);
        res.status(201).json({
          message: `Menu "${name}" berhasil ditambahkan!`,
          data: { id: menuId, name, price: Number(price), category, description, image, stock },
        });
      }
    );
  });
});


// PATCH /api/admin/menu/:id — Edit menu
// Body: { name?, price?, category?, description? }
app.patch('/api/admin/menu/:id', (req, res) => {
  withAdminAuth(req, res, () => {
    const menuId = String(req.params.id);
    if (!menuId) return res.status(400).json({ error: 'ID menu tidak valid.' });

    const name = req.body.name ?? req.body.nama;
    const price = req.body.price ?? req.body.harga;
    const category = req.body.category ?? req.body.kategori;
    const description = req.body.description ?? req.body.deskripsi;

    const fields = [];
    const vals = [];
    if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
    if (price !== undefined) { fields.push('price = ?'); vals.push(Number(price)); }
    if (category !== undefined) { fields.push('category = ?'); vals.push(category); }
    if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
    if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada field untuk diupdate.' });

    vals.push(menuId);
    db.query(`UPDATE menu SET ${fields.join(', ')} WHERE id = ?`, vals, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Menu tidak ditemukan.' });
      res.json({ message: 'Menu berhasil diperbarui', data: { id: menuId } });
    });
  });
});

// DELETE /api/admin/menu/:id — Hapus menu
app.delete('/api/admin/menu/:id', (req, res) => {
  withAdminAuth(req, res, () => {
    const menuId = String(req.params.id);
    if (!menuId) return res.status(400).json({ error: 'ID menu tidak valid.' });

    db.query('DELETE FROM menu WHERE id = ?', [menuId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Menu tidak ditemukan.' });
      res.json({ message: 'Menu berhasil dihapus', data: { id: menuId } });
    });
  });
});

// =============================================================
// PATCH /api/admin/menu/:id/image — Upload & simpan gambar menu
// Menerima: multipart/form-data dengan field "image" (file gambar)
// File disimpan ke public/uploads/, path disimpan ke kolom image di DB
// =============================================================
app.patch('/api/admin/menu/:id/image', (req, res) => {
  withAdminAuth(req, res, () => {
    const menuId = String(req.params.id);
    if (!menuId) return res.status(400).json({ error: 'ID menu tidak valid.' });

    uploadMenuImage.single('image')(req, res, (multerErr) => {
      if (multerErr) {
        return res.status(400).json({ error: multerErr.message || 'Gagal memproses file gambar.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'File gambar tidak ditemukan dalam request.' });
      }

      // Path yang akan disimpan di DB: "/uploads/menu-xxx.jpg"
      // Dapat diakses langsung dari browser via http://localhost:5000/uploads/menu-xxx.jpg
      const imagePath = '/uploads/' + req.file.filename;

      db.query(
        'UPDATE menu SET image = ? WHERE id = ?',
        [imagePath, menuId],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Menu tidak ditemukan.' });
          }
          console.log(`✅ Gambar menu "${menuId}" diperbarui: ${imagePath}`);
          res.json({
            message: 'Gambar menu berhasil diperbarui',
            data: { id: menuId, image: imagePath, image_url: `http://localhost:5000${imagePath}` },
          });
        }
      );
    });
  });
});


// GET /api/admin/stats — Statistik ringkas dashboard
app.get('/api/admin/stats', (req, res) => {
  withAdminAuth(req, res, () => {
    const queries = {
      totalOrders: 'SELECT COUNT(*) AS n FROM orders',
      newOrders: "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Baru', 'Sedang Dikukus')",
      totalMenu: 'SELECT COUNT(*) AS n FROM menu',
      totalCustomers: 'SELECT COUNT(DISTINCT COALESCE(user_id, phone)) AS n FROM orders',
    };

    const results = {};
    let done = 0;
    const keys = Object.keys(queries);

    keys.forEach((key) => {
      db.query(queries[key], (err, rows) => {
        if (err) results[key] = 0;
        else results[key] = rows[0].n;
        done++;
        if (done === keys.length) {
          res.json({
            total_orders: results.totalOrders,
            new_orders: results.newOrders,
            total_menu: results.totalMenu,
            total_customers: results.totalCustomers,
          });
        }
      });
    });
  });
});

// GET /api/admin/sales-chart — Data grafik penjualan per hari
// Query params: ?days=7 (default) atau ?days=30
// Response: { labels: ['Sen', 'Sel', ...], orders: [3, 5, ...], revenue: [60000, ...] }
app.get('/api/admin/sales-chart', (req, res) => {
  withAdminAuth(req, res, () => {
    const days = Math.min(parseInt(req.query.days) || 7, 90);

    const query = `
      SELECT
        DATE(created_at)                          AS day,
        DATE_FORMAT(created_at, '%d/%m')          AS label,
        COUNT(*)                                  AS total_orders,
        COALESCE(SUM(total), 0)                   AS total_revenue
      FROM orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `;

    db.query(query, [days - 1], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      // Buat array lengkap N hari (isi 0 untuk hari tanpa pesanan)
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
        const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const found = rows.find((r) => r.day && r.day.toISOString().slice(0, 10) === dateStr);
        result.push({
          date: dateStr,
          label,
          total_orders: found ? Number(found.total_orders) : 0,
          total_revenue: found ? Number(found.total_revenue) : 0,
        });
      }

      res.json({
        days,
        data: result,
        labels: result.map((r) => r.label),
        orders: result.map((r) => r.total_orders),
        revenue: result.map((r) => r.total_revenue),
      });
    });
  });
});

// =============================================================
// JALANKAN SERVER
// =============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server Puthu Lanang berjalan di http://localhost:${PORT}`);
  console.log(`   Jalankan dengan: npm run dev\n`);
});