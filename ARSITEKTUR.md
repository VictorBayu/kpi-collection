# Arsitektur Sistem — KPI Collection di Vercel

Status: usulan · Konteks: migrasi dari Google Apps Script + Spreadsheet
Keputusan utama: sumber data berpindah dari spreadsheet langsung menjadi **unggahan Excel oleh admin** yang diproses ke database.

---

## 1. Masalah dengan arsitektur lama

Apps Script membaca seluruh sheet setiap permintaan, tidak punya indeks, dan dibatasi kuota eksekusi.
Semakin banyak user aktif, semakin lambat, dan tidak ada cara memisahkan "data yang sedang disiapkan"
dari "data yang sudah boleh dilihat karyawan". Spreadsheet juga bisa diedit siapa saja yang punya akses,
sehingga angka bisa berubah tanpa jejak.

Arsitektur baru mempertahankan Excel sebagai **format kerja tim data** (mereka tetap bekerja di Excel),
tetapi menjadikannya **input yang divalidasi**, bukan database yang dibaca langsung.

---

## 2. Gambaran komponen

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  Next.js App Router (React Server Components)                │
│  · /login   · /dashboard   · /request   · /admin/*           │
└───────────────┬──────────────────────────────────┬──────────┘
                │ cookie httpOnly (JWT)            │ upload langsung
                ▼                                  ▼
┌───────────────────────────────┐      ┌───────────────────────┐
│  Route Handlers (serverless)  │      │  Vercel Blob          │
│  /api/auth/*                  │      │  simpan file .xlsx    │
│  /api/import/*                │◄─────┤  asli sebagai arsip   │
│  /api/kpi/*  /api/request/*   │      └───────────────────────┘
└───────────────┬───────────────┘
                │ SQL
                ▼
┌───────────────────────────────────────────────────────────────┐
│  Postgres (Neon via Vercel Marketplace)                        │
│  users · import_batch · kpi_row · insentif_row · request · log │
└───────────────────────────────────────────────────────────────┘
```

**Kenapa Postgres, bukan tetap spreadsheet lewat API?**
Sheets API punya kuota per menit dan tidak bisa melakukan filter/agregasi di sisi server.
Postgres memberi indeks pada `(nik, periode)` sehingga satu dashboard = satu query beberapa milidetik,
berapa pun jumlah barisnya. Neon punya paket gratis dan terhubung langsung dari dashboard Vercel.

**Kenapa Vercel Blob untuk file mentah?**
Route handler Vercel membatasi body request 4,5 MB. File KPI bulanan bisa lebih besar.
Solusinya: browser mengunggah **langsung** ke Blob (`@vercel/blob/client`), server hanya menerima URL-nya.
File asli juga jadi bukti audit — kalau ada sengketa angka, file sumbernya masih tersimpan.

---

## 3. Alur unggah data (bagian paling kritis)

Prinsipnya: **data yang diunggah tidak langsung terlihat karyawan.** Ada tahap tinjau dan terbit.

```
1. Pilih file  → admin menarik file .xlsx ke dropzone
2. Unggah      → langsung ke Blob, dapat URL
3. Baca        → server parse dengan SheetJS, deteksi sheet & kolom
4. Petakan     → admin mencocokkan kolom Excel ke kolom sistem (tersimpan sebagai preset)
5. Validasi    → cek NIK dikenal, angka valid, periode konsisten, duplikat
6. Tinjau      → tampilkan: 1.240 baris siap · 18 perlu dicek · 3 ditolak
7. Terbitkan   → batch dibuat aktif, batch periode sama sebelumnya dinonaktifkan
```

Tahap 3–6 tidak mengubah data produksi sama sekali; semuanya masuk ke `import_row_staging`
yang terikat pada satu `import_batch` berstatus `draft`. Menekan **Terbitkan** hanya menjalankan
satu transaksi: set batch lama `superseded`, set batch baru `published`. Jadi karyawan tidak
pernah melihat data setengah jadi, dan pembatalan (rollback) cukup mengaktifkan batch sebelumnya.

**Batas waktu eksekusi.** Serverless Hobby berhenti di 10 detik, Pro 60 detik (Fluid Compute lebih longgar).
File 5.000 baris masih aman diproses sekali jalan. Di atas itu, proses per potongan 1.000 baris
dengan endpoint `/api/import/chunk?offset=` yang dipanggil berulang dari browser sambil menampilkan
progress bar — lebih sederhana dan lebih transparan bagi admin daripada antrean latar belakang.

**Idempoten.** Setiap batch menyimpan SHA-256 file. Mengunggah file yang sama dua kali akan
ditolak dengan pesan yang menyebut kapan file itu pertama diunggah dan oleh siapa.

---

## 4. Skema data

Lihat `schema.sql` untuk DDL lengkap. Ringkasnya:

| Tabel | Isi | Indeks penting |
|---|---|---|
| `app_user` | NIK, hash password, nama, jabatan, cabang, area, peran | `nik` unik |
| `import_batch` | periode, tipe, status, pengunggah, url file, hash | `(periode, tipe, status)` |
| `kpi_row` | satu baris indikator KPI per karyawan per periode | `(nik, periode)` |
| `insentif_row` | rincian insentif per kategori | `(nik, periode)` |
| `request` | pengajuan karyawan + status + hasil | `(nik, status)` |
| `request_message` | percakapan tiap tiket | `request_id` |

`kpi_row` dan `insentif_row` menyimpan `batch_id`. Query dashboard selalu menyaring
`batch.status = 'published'`, sehingga tidak perlu menghapus data lama — riwayat tiap periode tetap utuh
dan tren enam bulan bisa dihitung langsung tanpa sheet terpisah.

---

## 5. Autentikasi & peran

- Password disimpan sebagai hash **bcrypt** (cost 12), bukan teks biasa seperti di sheet `login`.
  Saat migrasi, impor password lama lalu paksa ganti password di login pertama (`must_change_password`).
- Sesi berupa **JWT di cookie httpOnly, Secure, SameSite=Lax**, masa berlaku 8 jam.
  Tidak ada token di localStorage — itu yang bisa dicuri lewat XSS.
- `middleware.ts` menjaga rute: `/admin/*` hanya untuk peran `admin`, sisanya butuh sesi aktif.
- Setiap route handler memeriksa peran ulang dari token. Middleware itu lapisan kenyamanan, bukan pengaman.
- Kunci: `JWT_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` sebagai Environment Variables di Vercel.

**Data karyawan lain.** Endpoint KPI selalu memakai NIK dari token, bukan dari parameter URL.
Atasan yang boleh melihat bawahan divalidasi lewat tabel relasi cabang/area di sisi server —
tidak pernah dari nilai yang dikirim browser.

---

## 6. Peta endpoint

| Method | Rute | Peran | Fungsi |
|---|---|---|---|
| POST | `/api/auth/login` | publik | verifikasi NIK + password, set cookie |
| POST | `/api/auth/logout` | user | hapus cookie |
| POST | `/api/auth/password` | user | ganti password |
| GET | `/api/kpi/summary` | user | skor, insentif, tren 6 bulan |
| GET | `/api/kpi/detail?periode=` | user | rincian indikator + target |
| POST | `/api/import/upload-url` | admin | token unggah Blob |
| POST | `/api/import/parse` | admin | baca file, kembalikan sheet & kolom |
| POST | `/api/import/validate` | admin | jalankan validasi, isi staging |
| POST | `/api/import/publish` | admin | terbitkan batch |
| POST | `/api/import/rollback` | admin | aktifkan kembali batch sebelumnya |
| GET/POST | `/api/request` | user | daftar & buat pengajuan |
| PATCH | `/api/request/:id` | admin | ubah status, tulis hasil |

---

## 7. Yang perlu diterima sebagai konsekuensi

- **Data tidak lagi real-time dari spreadsheet.** Angka berubah hanya ketika admin menerbitkan batch.
  Ini sebenarnya keunggulan (karyawan tidak melihat angka berubah-ubah di tengah rekonsiliasi),
  tapi harus dikomunikasikan: setiap halaman menampilkan "Data periode Agustus 2026 · terbit 12 Agu 14:20".
- **Ada langkah manual baru.** Tim data harus mengunggah, bukan sekadar menempel di sheet.
  Imbalannya: validasi menangkap NIK salah ketik dan angka kosong sebelum karyawan protes.
- **Biaya.** Vercel Hobby + Neon free tier cukup untuk ratusan user; jika butuh domain perusahaan,
  SSO, dan durasi eksekusi 60 detik, siapkan Vercel Pro.
- **Migrasi tidak instan.** Rencana aman: jalankan dua sistem sebulan, bandingkan angkanya,
  baru matikan Apps Script.

---

## 8. Urutan pengerjaan yang saya sarankan

1. Skema database + seed user dari sheet `login` (hash ulang password).
2. Login + middleware + ganti password. Belum ada data, tapi kerangka aman sudah berdiri.
3. Pipeline impor sampai tahap Tinjau — inilah bagian yang paling banyak kejutannya, kerjakan lebih awal.
4. Dashboard karyawan (lihat `preview-ui.html` untuk acuan tampilan).
5. Modul request, dipindahkan dari Apps Script hampir apa adanya.
6. Tren periode dan laporan atasan.

---

## 9. Catatan bahasa antarmuka

Tombol menyebut apa yang terjadi, bukan istilah sistem. Konsisten dari tombol sampai notifikasi.

| Hindari | Pakai |
|---|---|
| Submit | Terbitkan data |
| Upload berhasil | 1.240 baris siap diterbitkan |
| Error: invalid NIK | NIK 20249xxx tidak ada di daftar karyawan — baris 84 |
| Data kosong | Belum ada data periode ini. Unggah file Excel untuk mulai. |
| Loading... | Membaca 1.240 baris... |
| Score: 4.12 | Skor KPI 4,12 — kurang 0,38 untuk mencapai KPI 5 |

Angka selalu diberi konteks pembanding. "Rp 3.450.000" saja tidak memberi tahu apa pun;
"Rp 3.450.000 · naik Rp 420.000 dari bulan lalu" langsung bisa dipakai mengambil keputusan.
