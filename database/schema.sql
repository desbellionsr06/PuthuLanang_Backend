-- =====================================================================
-- SKEMA DATABASE MYSQL: PUTHU LANANG MALANG (3 KATEGORI TABEL BASELINE)
-- =====================================================================

-- ---------------------------------------------------------------------
-- KATEGORI 1: PENGGUNA & PERAN (Role-Based Access Control)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE -- 'customer' (Mobile), 'manager' (Web Admin)
);

INSERT IGNORE INTO roles (id, name) VALUES (1, 'customer'), (2, 'manager');

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL DEFAULT 1,
    nama VARCHAR(100) NOT NULL,
    no_whatsapp VARCHAR(30) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    fcm_token VARCHAR(255) NULL,
    is_verified TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    no_whatsapp VARCHAR(30) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- KATEGORI 2: DATA MASTER (Menu & Outlet)
-- ---------------------------------------------------------------------
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
);

CREATE TABLE IF NOT EXISTS outlets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_outlet VARCHAR(100) NOT NULL UNIQUE,
    alamat TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    kapasitas_slot INT NOT NULL DEFAULT 30
);

INSERT IGNORE INTO outlets (nama_outlet, alamat, latitude, longitude, kapasitas_slot)
VALUES ('Gerai Pusat Celaket', 'Jl. Jaksa Agung Suprapto No. 73, Klojen, Malang', -7.96310000, 112.63350000, 40);

-- ---------------------------------------------------------------------
-- KATEGORI 3: TRANSAKSI, LOG & HASIL AI
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    name VARCHAR(100) NULL,
    phone VARCHAR(20) NULL,
    pickup_time VARCHAR(50) NULL,
    pickup_date DATE NULL,
    total INT NOT NULL DEFAULT 0,
    summary_items TEXT NULL,
    notes TEXT NULL,
    qr_token VARCHAR(64) NULL,
    antrean INT NULL,
    status VARCHAR(30) DEFAULT 'Sedang Dikukus',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_requested_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ai_verified_user FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS push_notifications_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    body TEXT NOT NULL,
    status ENUM('queued', 'sent', 'failed') DEFAULT 'queued',
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

