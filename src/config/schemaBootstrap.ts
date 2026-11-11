import { RowDataPacket } from 'mysql2';
import { db } from './db';

async function ensureColumn(table: string, column: string, alterSql: string): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0]?.n ?? 0) === 0) {
    await db.query(alterSql);
    console.log(`✅ Kolom ${table}.${column} berhasil ditambahkan.`);
  }
}

/**
 * Memastikan seluruh tabel dari 3 kategori baseline (Pengguna & Peran, Data Master, Transaksi/Log/Hasil AI)
 * tersedia di MySQL tanpa merusak data atau kolom eksisting.
 */
export async function bootstrapDatabaseSchema(): Promise<void> {
  const conn = await db.getConnection();
  try {
    console.log('✅ Berhasil terhubung ke database MySQL.');
  } finally {
    conn.release();
  }

  // 1. Kategori Pengguna & Peran
  await db.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(30) NOT NULL UNIQUE
    )
  `);
  await db.query(`INSERT IGNORE INTO roles (id, name) VALUES (1, 'customer'), (2, 'manager')`);

  await ensureColumn('users', 'role_id', 'ALTER TABLE users ADD COLUMN role_id INT NOT NULL DEFAULT 1 AFTER id');
  await ensureColumn('users', 'fcm_token', 'ALTER TABLE users ADD COLUMN fcm_token VARCHAR(255) NULL AFTER password');

  // 2. Kategori Data Master
  await db.query(`
    CREATE TABLE IF NOT EXISTS menu (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price INT NOT NULL DEFAULT 0,
      category VARCHAR(50) DEFAULT 'pusaka',
      description TEXT NULL,
      image VARCHAR(255) NULL,
      stock INT DEFAULT 100,
      rating DECIMAL(3, 1) DEFAULT 5.0,
      nama VARCHAR(100) NULL,
      harga INT NULL,
      kategori VARCHAR(50) NULL,
      deskripsi TEXT NULL,
      gambar VARCHAR(255) NULL,
      tersedia TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('menu', 'deskripsi', 'ALTER TABLE menu ADD COLUMN deskripsi TEXT NULL');
  await ensureColumn('menu', 'gambar', 'ALTER TABLE menu ADD COLUMN gambar VARCHAR(255) NULL');
  await ensureColumn('menu', 'tersedia', 'ALTER TABLE menu ADD COLUMN tersedia TINYINT(1) DEFAULT 1');

  await db.query(`
    CREATE TABLE IF NOT EXISTS outlets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nama_outlet VARCHAR(100) NOT NULL UNIQUE,
      alamat TEXT NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      kapasitas_slot INT NOT NULL DEFAULT 30
    )
  `);
  await db.query(`
    INSERT IGNORE INTO outlets (nama_outlet, alamat, latitude, longitude, kapasitas_slot)
    VALUES ('Gerai Pusat Celaket', 'Jl. Jaksa Agung Suprapto No. 73, Klojen, Malang', -7.96310000, 112.63350000, 40)
  `);

  // 3. Kategori Transaksi, Log & Hasil AI
  await ensureColumn('orders', 'summary_items', 'ALTER TABLE orders ADD COLUMN summary_items TEXT NULL AFTER total');
  await ensureColumn('orders', 'user_id', 'ALTER TABLE orders ADD COLUMN user_id INT NULL AFTER id');
  await ensureColumn('orders', 'name', 'ALTER TABLE orders ADD COLUMN name VARCHAR(100) NULL AFTER user_id');
  await ensureColumn('orders', 'phone', 'ALTER TABLE orders ADD COLUMN phone VARCHAR(20) NULL AFTER name');

  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_predictions_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      feature_type ENUM('queue_estimator', 'menu_recommendation') NOT NULL,
      requested_by_user_id INT NULL,
      anonymized_input JSON NOT NULL,
      validated_output JSON NOT NULL,
      confidence_score VARCHAR(60) NULL,
      verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
      verified_by_user_id INT NULL,
      verification_notes TEXT NULL,
      verified_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS push_notifications_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      body TEXT NOT NULL,
      status ENUM('queued', 'sent', 'failed') DEFAULT 'queued',
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

