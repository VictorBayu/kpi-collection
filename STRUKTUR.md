# Peta berkas

```
app/
  layout.tsx                    kerangka HTML + font
  page.tsx                      pengalihan sesuai peran
  globals.css                   seluruh token desain & gaya

  login/                        halaman masuk
    page.tsx                    sisi kiri: konteks data terbit terakhir
    LoginForm.tsx               formulir + penanganan galat

  ganti-password/               wajib dilalui saat login pertama
    page.tsx
    PasswordForm.tsx            syarat password ditampilkan hidup

  dashboard/page.tsx            dasbor karyawan: skor, tangga target, insentif
  tim/page.tsx                  hanya untuk peran atasan
  request/
    page.tsx                    tampilan karyawan
    RequestClient.tsx           dipakai bersama oleh karyawan dan admin

  admin/
    import/                     wizard 4 langkah unggah Excel
    riwayat/                    daftar batch + aktifkan kembali
    request/page.tsx            RequestClient dengan admin=true

  api/
    auth/{login,logout,password}
    request/route.ts            daftar + buat tiket
    request/[id]/route.ts       detail, balasan, ubah status
    import/{upload,parse,validate,publish,rollback,batches}

components/
  AppShell.tsx                  bilah atas, menu menyesuaikan peran
  Ladder.tsx                    tangga target + kalimat jarak ke KPI berikutnya
  LogoutButton.tsx
  RollbackButton.tsx            (di app/admin/riwayat)

lib/
  db.ts                         koneksi Neon + audit log
  auth.ts                       sesi JWT, bcrypt, requireAdmin, pembungkus galat
  kpi.ts                        seluruh kueri dasbor & tim
  format.ts                     format rupiah, persen, satuan, tanggal
  import/{fields,parse,validate}.ts

db/
  schema.sql                    tabel inti
  schema-addendum.sql           staging + preset pemetaan
  seed.ts                       migrasi akun dari sheet login lama

middleware.ts                   penjaga rute per peran
```

## Urutan menjalankan pertama kali

```bash
npm install
cp .env.example .env.local
psql $DATABASE_URL -f db/schema.sql -f db/schema-addendum.sql
npm run db:seed          # setelah ini HAPUS db/login.csv
npm run dev
```

Masuk sebagai akun berperan `admin`, unggah satu berkas Excel lewat
`/admin/import`, terbitkan, lalu buka `/dashboard` dengan akun karyawan untuk
memastikan angkanya muncul.
