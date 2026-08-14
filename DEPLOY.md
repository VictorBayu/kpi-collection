# Deploy ke Vercel — langkah demi langkah

Perkiraan waktu 20–30 menit. Semua lewat browser, tidak perlu server sendiri.

---

## Sebelum mulai — siapkan tiga hal

1. Akun **GitHub** (gratis) — tempat menyimpan kode.
2. Akun **Vercel** (gratis) — daftar di vercel.com pakai akun GitHub agar langsung tersambung.
3. Berkas Excel KPI Anda dan hasil ekspor sheet `login` menjadi CSV (dijelaskan di Langkah 6).

---

## Langkah 1 — Unggah kode ke GitHub

Cara termudah lewat website, tanpa perintah:

1. Buka github.com → tombol **+** kanan atas → **New repository**.
2. Nama: `kpi-collection`. Pilih **Private**. Klik **Create repository**.
3. Di halaman berikutnya klik **uploading an existing file**.
4. Ekstrak `kpi-collection-app.zip` di komputer Anda. Buka folder `kpi-import`,
   pilih **semua isinya** (bukan foldernya), seret ke halaman GitHub tadi.
5. Tunggu unggahan selesai → **Commit changes**.

> Kalau Anda terbiasa dengan Git di terminal:
> ```bash
> cd kpi-import
> git init && git add . && git commit -m "versi awal"
> git branch -M main
> git remote add origin https://github.com/AKUN-ANDA/kpi-collection.git
> git push -u origin main
> ```

---

## Langkah 2 — Buat database Postgres (Neon)

1. Masuk ke vercel.com → tab **Storage** → **Create Database**.
2. Pilih **Neon (Serverless Postgres)** → **Continue**.
3. Region: pilih **Singapore (ap-southeast-1)** — paling dekat dari Indonesia.
4. Beri nama `kpi-db` → **Create**.

Vercel otomatis menyimpan `DATABASE_URL` untuk proyek Anda nanti.
Biarkan tab ini, kita pakai lagi di Langkah 5.

---

## Langkah 3 — Buat penyimpanan berkas (Blob)

1. Masih di tab **Storage** → **Create Database** (atau **Create Store**).
2. Pilih **Blob** → beri nama `kpi-files` → **Create**.

Ini tempat menyimpan berkas Excel asli yang diunggah admin.
`BLOB_READ_WRITE_TOKEN` otomatis tersimpan.

---

## Langkah 4 — Impor proyek dari GitHub

1. Vercel → **Add New…** → **Project**.
2. Cari `kpi-collection` di daftar repository → **Import**.
3. Framework otomatis terdeteksi **Next.js**. Jangan ubah apa pun dulu.
4. **JANGAN klik Deploy dulu.** Buka bagian **Environment Variables** di bawah.

---

## Langkah 5 — Isi Environment Variables

Tiga kunci wajib. Dua sudah otomatis kalau database & blob dibuat di proyek yang sama,
tapi periksa keberadaannya:

| Nama | Nilai |
|---|---|
| `DATABASE_URL` | otomatis dari Neon (Langkah 2). Kalau belum ada, salin dari Storage → kpi-db → `.env.local` |
| `BLOB_READ_WRITE_TOKEN` | otomatis dari Blob (Langkah 3) |
| `JWT_SECRET` | **buat sendiri** — lihat di bawah |

**Membuat `JWT_SECRET`:** buka terminal mana pun dan jalankan
`openssl rand -base64 48`, salin hasilnya. Kalau tidak punya terminal, ketik
40+ karakter acak campuran huruf-angka. Jangan pakai kata yang mudah ditebak.

Tambahkan juga (opsional):

| Nama | Nilai |
|---|---|
| `IMPORT_MAX_ROWS` | `30000` |

Klik **Deploy**. Tunggu 2–3 menit sampai muncul layar ucapan selamat.

---

## Langkah 6 — Siapkan isi database

Deploy pertama berhasil, tapi database masih kosong. Kita isi tabel dan akunnya.

### 6a. Buat tabel

1. Vercel → **Storage** → **kpi-db** → tab **Query** (editor SQL bawaan Neon).
2. Buka berkas `db/schema.sql` dari proyek Anda, salin **seluruh isinya**, tempel, **Run**.
3. Ulangi untuk `db/schema-addendum.sql`.

Kalau muncul tulisan sukses tanpa error merah, tabel sudah jadi.

### 6b. Pindahkan akun dari sheet login lama

1. Buka Google Sheet `login` Anda → **File → Download → CSV**.
2. Susun ulang kolomnya agar berurutan begini, lalu simpan sebagai `db/login.csv`
   di dalam folder proyek di komputer Anda:

   ```
   nik,password,nama,level,cabang,area,status
   20240117,rahasia123,Rizky Pratama,karyawan,Tangerang,Jabodetabek,active
   20240001,admin123,Dina Ariani,admin,Pusat,Pusat,active
   ```

   - `level` yang dikenali: `admin`/`superadmin` → admin, `manager`/`spv` → atasan,
     selain itu → karyawan.
   - `status` harus `active` agar bisa login.

3. Jalankan seeding dari komputer Anda (perlu Node.js terpasang):
   ```bash
   cd kpi-import
   npm install
   # tempel DATABASE_URL dari Vercel ke sini:
   export DATABASE_URL="postgresql://...sslmode=require"
   npx tsx db/seed.ts
   ```
   Muncul "Selesai. N akun tersimpan."

> ⚠️ **Segera hapus `db/login.csv` setelah ini.** Berkas itu berisi password asli
> dalam bentuk teks biasa. `.gitignore` sudah mencegahnya ikut ter-upload ke GitHub,
> tapi hapus juga dari komputer Anda. Semua akun otomatis diminta ganti password
> saat login pertama.

---

## Langkah 7 — Coba jalan

1. Buka URL proyek Anda (mis. `kpi-collection.vercel.app`).
2. Masuk pakai akun **admin** dari CSV tadi → langsung diminta ganti password.
3. Buka **Unggah data** → seret berkas Excel KPI → cocokkan kolom → tinjau → **Terbitkan**.
4. Keluar, masuk pakai akun **karyawan** → buka **Dasbor** → angkanya muncul.

Kalau keempat langkah ini jalan, deployment Anda beres.

---

## Perawatan rutin tiap bulan

- Tim data cukup buka **Unggah data**, seret Excel bulan itu, terbitkan. Selesai.
- Pemetaan kolom tersimpan, jadi bulan berikutnya tinggal memastikan, bukan mencocokkan ulang.
- Menambah karyawan baru: jalankan ulang `db/seed.ts` dengan CSV berisi baris baru,
  atau tambahkan lewat tab **Query** di Neon.

---

## Kalau ada yang tidak beres

| Gejala | Penyebab tersering | Tindakan |
|---|---|---|
| "relation ... does not exist" | `schema.sql` belum dijalankan | Ulangi Langkah 6a |
| Login selalu gagal | seeding belum jalan / status bukan `active` | Cek tabel `app_user` di tab Query |
| Unggah berkas gagal di tengah | berkas > 20 MB atau > 30.000 baris | Pecah per cabang, unggah bergantian |
| Dasbor kosong padahal sudah terbit | NIK di Excel beda dengan NIK di `app_user` | Cek layar Tinjau — biasanya ditandai "NIK tidak dikenal" |
| Halaman admin memantul ke dasbor | akun yang login bukan peran `admin` | Perbaiki kolom `peran` di `app_user` |

### Naik ke paket Pro (kalau perlu)

Paket gratis cukup untuk ratusan karyawan. Pertimbangkan **Vercel Pro** hanya kalau:
berkas rutin di atas 5.000 baris (butuh durasi eksekusi 60 detik, bukan 10),
atau Anda ingin domain perusahaan sendiri seperti `kpi.perusahaan.co.id`.
Domain diatur di **Settings → Domains** pada proyek.

---

## Riwayat perbaikan build

**Gagal build "KATEGORI is not a valid Route export field".**
Next.js melarang route handler meng-export apa pun selain fungsi HTTP.
Konstanta `KATEGORI` sudah dipindahkan ke `lib/request.ts`. Sudah diperbaiki.

**Peringatan bcryptjs di Edge Runtime.**
Middleware sempat menyeret bcrypt lewat impor `COOKIE` dari `lib/auth.ts`.
Konstanta itu dipindah ke `lib/session-const.ts` yang ringan, sehingga middleware
hanya memakai `jose` (aman di Edge). Sudah diperbaiki.

---

## Pembaruan fitur (jalankan schema tambahan)

Versi ini menambah: laporan akses pengguna, suspend/aktifkan login, dan halaman
Data KPI per cabang untuk admin. Satu file schema baru perlu dijalankan **sekali**
di SQL Editor Neon:

1. Buka `db/schema-access.sql`, salin seluruh isinya, tempel ke SQL Editor Neon, **Run**.
2. Selesai. Kolom penghitung dan tabel `access_log` terbentuk. Data lama tidak terpengaruh.

Setelah itu, setiap login dan setiap kali user membuka halaman akan tercatat.
Menu admin bertambah: **Data KPI** (lihat per cabang) dan **Pengguna & Akses**
(laporan akses + tombol nonaktifkan/aktifkan login).

---

## Pembaruan: impor INSENTIF + perbaikan tampilan indikator

Satu schema baru perlu dijalankan **sekali** di SQL Editor Neon:

* `db/schema-insentif.sql` — menambah kolom jabatan/cabang/bobot/skor_kpi pada
  `insentif_row` dan mengizinkan nominal kosong (berkas memakai "-").

Perubahan lain (otomatis setelah deploy):
* Pembacaan angka kini memahami nilai berlabel ("Penyelesaian : 1,689,239,025"),
  pemisah ribuan titik maupun koma, dan "#N/A"/"-" sebagai kosong.
* Perbandingan dengan Target 3/4/5 memakai kolom **% Pencapaian** bila target
  berskala rasio, bukan nominal rupiah.
* Indikator "makin kecil makin bagus" (Delq, NPL — ditandai target menurun)
  kini dinilai terbalik dengan benar.
* Halaman **Tim saya** punya pilihan tampilan: "Indikator terlemah" (ringkas)
  atau "Detail semua indikator".

---

## Pembaruan: penalty insentif + notifikasi & chat request

Schema baru (jalankan SEKALI di Neon): `db/schema-request-notif.sql`
— kolom penanda "sudah dibaca" untuk notifikasi request.

Perubahan otomatis setelah deploy:
* Nominal insentif NEGATIF kini diterima sebagai Penalty (positif = Extra),
  keduanya diberi label di dashboard. Penalty > Rp 50 juta ditandai untuk dicek.
* Badge merah di menu Request/Kelola request menunjukkan jumlah tiket dengan
  aktivitas baru yang belum dibaca. Tiket belum dibaca disorot di daftar.
* Pemohon melihat banner hijau saat tiketnya selesai ditindaklanjuti.
* Percakapan tiket memperbarui diri tiap 5 detik (daftar tiap 15 detik),
  pesan terkirim tampil seketika, dan otomatis menggulir ke pesan terbaru.
