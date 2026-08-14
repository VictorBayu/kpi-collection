# Pipeline impor Excel — KPI Collection

Kode lengkap untuk mengubah unggahan Excel admin menjadi data KPI yang dilihat karyawan,
berjalan di Vercel dengan Neon Postgres dan Vercel Blob.

## Pasang

```bash
npm install
cp .env.example .env.local          # isi DATABASE_URL, BLOB_READ_WRITE_TOKEN, JWT_SECRET
psql $DATABASE_URL -f db/schema.sql -f db/schema-addendum.sql
npm run db:seed                     # pindahkan akun dari sheet login lama
npm run dev
```

Di Vercel: **Storage → Create Database → Neon** dan **Create Store → Blob**.
Keduanya mengisi environment variable secara otomatis; tinggal tambahkan `JWT_SECRET` sendiri.

## Alur berkas

| Berkas | Peran |
|---|---|
| `app/admin/import/ImportWizard.tsx` | Layar 4 langkah, memanggil semua endpoint di bawah |
| `app/api/import/upload/route.ts` | Menerbitkan token unggah langsung ke Blob |
| `app/api/import/parse/route.ts` | Baca sheet, deteksi header, simpan baris mentah ke staging |
| `app/api/import/validate/route.ts` | Periksa per 1.000 baris, tulis hasil dan temuan |
| `app/api/import/publish/route.ts` | Satu transaksi: batch lama digeser, batch baru naik |
| `app/api/import/rollback/route.ts` | Aktifkan kembali batch lama |
| `lib/import/fields.ts` | Definisi kolom sistem + alias header Excel |
| `lib/import/parse.ts` | Pembacaan workbook dan deteksi baris header |
| `lib/import/validate.ts` | Aturan pemeriksaan per baris |

## Tiga hal yang paling sering perlu diubah

**Judul kolom Excel berubah.** Tambahkan alias di `lib/import/fields.ts`. Tidak perlu menyentuh
kode lain — deteksi otomatis dan daftar pilihan pemetaan ikut menyesuaikan.

**Aturan pemeriksaan baru.** Semua ada di `validasiBaris()` pada `lib/import/validate.ts`.
`tolak()` membuat baris tidak terbit, `tandai()` hanya memberi peringatan.
Tulis pesannya untuk admin: sebutkan apa yang salah dan apa yang harus dilakukan.

**Berkas terlalu besar.** Naikkan `IMPORT_MAX_ROWS`, tapi perhatikan batas durasi:
Hobby 10 detik, Pro 60 detik. Pemeriksaan sudah dipotong 1.000 baris per panggilan,
yang berat hanya `parse` karena membaca seluruh workbook sekali. Untuk berkas di atas
30 ribu baris, pecah per area di sisi tim data.

## Yang menjaga data tetap aman

- Baris masuk `kpi_row` dengan `batch_id` berstatus `draft`; view `v_kpi_aktif` hanya membaca
  batch `published`. Jadi data separuh jadi tidak pernah bocor ke karyawan.
- `publish_batch()` berjalan dalam satu transaksi, dan indeks unik memastikan hanya ada satu
  batch aktif per periode per jenis data.
- Setiap unggah, terbit, dan rollback tercatat di `audit_log` lengkap dengan pelakunya.
- Berkas dengan SHA-256 sama ditolak, jadi impor ganda tidak terjadi karena salah klik.
- `requireAdmin()` dipanggil di setiap route handler. Middleware hanya untuk pengalihan halaman.

## Yang belum ada di paket ini

Login page, dashboard karyawan, dan modul request. Rancangan tampilannya ada di
`preview-ui.html` dan `preview-ui-2.html`; endpoint-nya menyusul pola yang sama —
`requireAdmin()` diganti `readSession()`, dan kueri membaca dari `v_kpi_aktif`.
