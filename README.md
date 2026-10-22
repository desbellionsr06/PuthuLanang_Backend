# ⚙️ Puthu Lanang - Backend API 

Repositori ini berisi layanan backend (API) dan koneksi database MySQL untuk aplikasi Puthu Lanang.

## 🚀 Cara Setup & Menjalankan (Lokal)

**1. Clone Repositori**

Buka terminal dan jalankan perintah berikut:
```bash
git clone [https://github.com/desbellionsr06/PuthuLanang_Backend.git](https://github.com/desbellionsr06/PuthuLanang_Backend.git)
cd PuthuLanang_Backend
```
**2. Instal Dependencies**
```bash
npm install
```
**3. Konfigurasi Database**
```
- Pastikan MySQL (XAMPP/MAMP) di laptop Anda menyala.
- Buka phpMyAdmin, lalu buat database baru dengan nama puthu_lanang_db.
(Opsional jika ada) Import file puthu_lanang.sql ke dalam database tersebut.
- File .env sudah tersedia di dalam folder ini. Anda hanya perlu memastikannya sesuai dengan konfigurasi lokal Anda (biasanya DB_USER=root dan DB_PASS= dikosongkan).
```
**4. Jalankan Server Backend**
```bash
npm run dev
```
(Server akan menyala di Port 5000 dan siap dihubungkan ke Web Admin & Mobile).
