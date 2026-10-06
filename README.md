# 🍲 Puthu Lanang Malang - Express.js REST API Backend Server

> **Ujian Tengah Semester (UTS) - Pemrograman Web / Backend Framework Development**  
> RESTful API Server Terintegrasi untuk Layanan Smart Takeaway & Sistem Manajemen Kuliner Legendaris Puthu Lanang Celaket Malang (Est. 1935).

---

## 📌 Deskripsi Sistem API
**Puthu Lanang Backend** adalah server RESTful API yang dibangun menggunakan framework **Express.js** dan **TypeScript**. Server ini berfungsi sebagai pusat backend (*single source of truth*) yang menangani logika bisnis transaksi, autentikasi berbasis role (Admin & Konsumen), manajemen katalog produk jajanan pasar (Puthu, Klepon, Cenil, Lupis), antrean pesanan dapur secara real-time, pencetakan token verifikasi QR Code pesanan, serta layanan analitik prediksi stok (*AI Demand Predictor*).

---

## 🚀 Panduan Instalasi & Menjalankan di Lokal

Ikuti langkah-langkah berikut untuk menjalankan server backend di komputer lokal Anda:

### 1. Clone Repositori
```bash
git clone https://github.com/desbellionsr06/PuthuLanang_Backend.git
cd PuthuLanang_Backend
```

### 2. Instalasi Dependensi
Pastikan **Node.js** (versi 18.x atau 20.x+) sudah terpasang:
```bash
npm install
```

### 3. Konfigurasi Environment Variables (`.env`)
Salin file template `.env.example` menjadi `.env` (atau buat file `.env` baru pada root direktori):
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=puthu_lanang_celaket_secret_key_1935
CLIENT_ORIGIN=http://localhost:3000
```

### 4. Menjalankan Server API
Jalankan server dalam mode pengembangan menggunakan runtime TypeScript cepat (`tsx`):
```bash
npm run dev
```

Server API akan aktif dan dapat diakses pada:
```
http://localhost:5000
```

---

## 🛠️ Stack Teknologi Utama

| Kategori | Teknologi / Library | Versi | Peran & Deskripsi |
| :--- | :--- | :--- | :--- |
| **Runtime Environment** | Node.js | `>=20.x` | Runtime JavaScript asynchronous berbasis event-driven. |
| **Framework Backend** | Express.js | `^5.2.1` | Minimalist web framework generasi ke-5 untuk routing dan penanganan HTTP request. |
| **Bahasa Pemrograman** | TypeScript | `^5.x` | Strongly typed JavaScript untuk keamanan tipe data skema dan response. |
| **Runtime Runner** | tsx | `^4.23.15` | Fast TypeScript execution engine tanpa langkah kompilasi manual. |
| **Autentikasi & Keamanan** | JSON Web Token (JWT) | `^9.0.3` | Standar industri untuk tokenisasi otorisasi sesi admin dan user. |
| **CORS Handler** | cors | `^2.8.6` | Middleware untuk mengatur izin akses Cross-Origin Resource Sharing dari frontend. |
| **QR Code Generator** | qrcode | `^1.5.4` | Pembangkit data token QR code untuk tiket pengambilan Smart Takeaway. |

---

## 📁 Struktur Folder & Arsitektur Kode (Clean Architecture)

Struktur repositori dirancang dengan prinsip modularitas tinggi (*Separation of Concerns*):

```text
PuthuLanang_Backend/
├── config/                     # Konfigurasi environment variables & inisialisasi koneksi database
│   └── database.ts
├── controllers/                # Pengendali logika bisnis dan pemrosesan request/response
│   ├── adminController.ts      # Metrik KPI operasional & ringkasan penjualan
│   ├── aiController.ts         # Logika simulasi rekomendasi persediaan bahan baku
│   ├── authController.ts       # Autentikasi admin, login pelanggan, dan registrasi
│   ├── menuController.ts       # Logika CRUD item menu jajanan
│   ├── orderController.ts      # Pemrosesan pesanan takeaway, custom event & update status
│   └── outletController.ts     # Monitoring status buka dan estimasi antrean outlet
├── data/                       # In-memory database persistence & initial seed data
│   └── store.ts
├── middlewares/                # Middleware Express (CORS, Global Error Handling, Validasi)
│   ├── errorHandler.ts
│   └── responseFormatter.ts
├── models/                     # Skema tipe data & entitas domain database
│   ├── Menu.ts
│   ├── Order.ts
│   └── User.ts
├── routes/                     # Definisi endpoint routing modular
│   ├── adminRoutes.ts
│   ├── aiRoutes.ts
│   ├── authRoutes.ts
│   ├── menuRoutes.ts
│   ├── orderRoutes.ts
│   ├── outletRoutes.ts
│   └── index.ts                # Router aggregator utama
├── index.ts                    # Entry point aplikasi Express server
├── package.json                # Metadata proyek dan daftar dependensi
├── tsconfig.json               # Konfigurasi compiler TypeScript
└── README.md                   # Dokumentasi resmi server API
```

---

## 📡 Dokumentasi Endpoint REST API

Semua endpoint diawali dengan prefix `/api`:

### 1. Autentikasi (`/api/auth`)
| Method | Endpoint | Deskripsi | Akses |
| :---: | :--- | :--- | :---: |
| `POST` | `/api/auth/admin-login` | Autentikasi akun admin pengelola gerai | Publik |
| `POST` | `/api/auth/user-login` | Login akun pelanggan via No. WhatsApp | Publik |
| `POST` | `/api/auth/user-register` | Pendaftaran akun pelanggan baru | Publik |

### 2. Manajemen Menu (`/api/menu`)
| Method | Endpoint | Deskripsi | Akses |
| :---: | :--- | :--- | :---: |
| `GET` | `/api/menu` | Mengambil seluruh katalog jajanan aktif | Publik |
| `POST` | `/api/menu` | Menambahkan item jajanan baru ke katalog | Admin |
| `PUT` | `/api/menu/:id` | Memperbarui data harga, porsi, atau deskripsi menu | Admin |
| `DELETE` | `/api/menu/:id` | Menghapus item menu dari katalog aktif | Admin |

### 3. Manajemen Pesanan & Takeaway (`/api/orders`)
| Method | Endpoint | Deskripsi | Akses |
| :---: | :--- | :--- | :---: |
| `GET` | `/api/orders` | Mengambil daftar seluruh pesanan masuk | Admin / Kasir |
| `POST` | `/api/orders` | Membuat tiket pesanan Smart Takeaway baru | Pelanggan |
| `GET` | `/api/orders/:id` | Mengambil detail tiket pesanan berdasarkan ID | Pelanggan / Kasir |
| `PATCH`| `/api/orders/:id/status`| Mengubah status pesanan (*Baru / Diproses / Selesai*) | Admin / Dapur |
| `POST` | `/api/orders/custom-event`| Pengajuan pesanan paket tampah & hajatan khusus | Pelanggan |

### 4. Admin & Layanan Pendukung
| Method | Endpoint | Deskripsi |
| :---: | :--- | :--- |
| `GET` | `/api/admin/metrics` | Mengambil ringkasan metrik dashboard penjualan & stok |
| `GET` | `/api/ai/preview` | Mengambil data simulasi prediksi kebutuhan bahan baku AI |
| `GET` | `/api/outlet/status` | Mengambil data operasional gerai Celaket & Dinoyo |

---

## 👨‍💻 Informasi Pengembang (UTS)
- **Nama Pengembang**: Rendirmdhnii
- **Email**: muhamadrendiaf06@gmail.com
- **Topik Proyek**: Puthu Lanang Malang - Backend REST API Service
- **Tahun Akademik**: 2026
