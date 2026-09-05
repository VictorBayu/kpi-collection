# Blueprint Sistem — KPI Collection

Dokumen ini menjelaskan **bagaimana sistem ini terbentuk**: masalah yang melatarbelakanginya, keputusan arsitektur yang diambil, model data yang dibangun bertahap, mesin perhitungan di jantungnya, dan bagaimana setiap modul saling terhubung. Ditujukan sebagai peta menyeluruh — bagi siapa pun yang meneruskan pengembangan agar paham bukan hanya *apa* yang ada, tetapi *mengapa* dibuat begitu.

Untuk detail operasional lain, lihat juga: `ARSITEKTUR.md` (keputusan arsitektur awal), `STRUKTUR.md` (peta berkas), `README.md` (pipeline impor Excel), dan `DEPLOY.md` (langkah deploy).

---

## 1. Latar belakang dan tujuan

Sistem ini menggantikan pendekatan lama berbasis Google Apps Script + Spreadsheet yang membaca seluruh sheet tiap permintaan, tanpa indeks, terbatas kuota, dan bisa diubah siapa saja tanpa jejak. Tujuannya: **mengubah data operasional pembiayaan (Smart Multi Finance) menjadi skor KPI dan proyeksi insentif yang dapat dipercaya, dapat ditelusuri, dan aman diakses sesuai peran.**

Tiga prinsip yang memandu seluruh keputusan:

1. **Data sebagai input yang divalidasi, bukan database yang dibaca langsung.** Tim data tetap bekerja di Excel, tetapi hasilnya melewati validasi sebelum menjadi angka yang dilihat karyawan.
2. **Angka yang sudah terbit harus beku dan tertelusuri.** Periode yang sudah ditutup tidak berubah diam-diam; snapshot disimpan agar riwayat tetap akurat meski master data berubah.
3. **Nyaman dipandang berjam-jam.** Warna, kontras (WCAG AA), dan kepadatan tampilan dipilih untuk pemakaian harian yang panjang, bukan untuk tampil mencolok.

---

## 2. Tumpukan teknologi

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | Next.js 15 (App Router, React Server Components) | Render di server, kueri dekat data, satu basis kode untuk UI + API |
| Database | Neon Postgres (serverless) | SQL penuh (window function, view, fungsi PL/pgSQL), penagihan sesuai pemakaian |
| Berkas | Vercel Blob | Menyimpan unggahan Excel mentah tanpa server sendiri |
| Autentikasi | JWT di cookie httpOnly (`jose`), password `bcryptjs` | Sesi ringan tanpa penyimpanan server, aman dari akses skrip klien |
| Hosting | Vercel (region `sin1` — Singapura) | Dekat pengguna Indonesia, deploy otomatis dari GitHub |

Tidak ada dependensi berat di sisi runtime: driver Neon serverless, `xlsx` (SheetJS) untuk baca Excel, dan pustaka autentikasi. Semua perhitungan berat didorong ke SQL agar satu periode selesai dalam satu kueri, bukan menarik ribuan baris ke Node.

---

## 3. Evolusi model data — dibaca dari versi skema

Skema dibangun **berlapis dan bernomor** (`db/schema-*.sql`), tiap lapis menambah kemampuan tanpa membongkar yang sudah ada. Urutan file ini sekaligus menceritakan sejarah pembentukan sistem:

| Versi | Berkas | Kemampuan yang ditambahkan |
|---|---|---|
| Dasar | `schema.sql`, `schema-addendum.sql` | Tabel inti: pengguna, baris KPI, batch impor |
| Akses | `schema-access.sql` | Peran & audit log akses |
| Hierarki | `schema-hierarki{,-v2,-v3,-v4}.sql` | Rantai jabatan: siapa boleh melihat KPI siapa; `norm_jabatan()`, `norm_wilayah()` |
| Produk | `schema-produk-v5.sql` | Produk (R2/R4/MIX) dan pemetaan jabatan·produk |
| Indikator | `schema-indikator-v5.sql` | Definisi indikator + target per jabatan·produk |
| Data mentah | `schema-mentah-v6.sql`, `schema-mentah-v7.sql` | Katalog kolom API, tabel `data_mentah` |
| Insentif | `schema-insentif{,-v8}.sql` | Pagu insentif, baris insentif hasil gabungan skor |
| Pita | `schema-pita-v9.sql`, `schema-pita-v9b-terbalik.sql` | Target bertingkat dengan interpolasi; dukungan indikator terbalik |
| Tier cabang | `schema-tier-cabang-v10.sql` | Kelas cabang → tabel tier insentif |
| Bersyarat | `schema-bersyarat-v11.sql` | Nominal bersyarat: gerbang kelayakan + pita rupiah |
| API | `schema-api-v5.sql` | Master kode cabang API + status penarikan |
| Notifikasi | `schema-request-notif.sql` | Tiket "Supporting"/request |

Pola penting: **fungsi perhitungan diletakkan di database** (`poin_dari_pita`, `nominal_dari_pita`, `kelas_cabang`, `norm_*`) supaya konsisten dipakai baik oleh mesin hitung maupun oleh kueri tampilan — satu sumber kebenaran.

### Konsep-konsep kunci di model data

- **Snapshot per baris KPI.** Setiap `kpi_row` menyimpan `jabatan`, `cabang`, `nama` apa adanya saat dihitung. Tampilan periode lama mengutamakan snapshot ini (`COALESCE(jabatan_file, u.jabatan)`) agar akurat historis walau master berubah.
- **`sumber = 'api' | 'excel'`.** Baris KPI dari penarikan API (bulan berjalan) dan dari unggahan Excel (periode lampau) hidup berdampingan di tabel yang sama, dibedakan kolom sumber.
- **View aktif (`v_kpi_aktif`, `v_insentif_aktif`).** Hanya batch yang sedang "terbit" yang tampil; batch lama tetap ada untuk rollback. Karena Postgres membekukan daftar kolom view, perubahan memakai pola `DROP VIEW ... CREATE VIEW`.
- **Foreign key `RESTRICT`, bukan `CASCADE`.** Sumber gerbang dan pemilih pita memakai `ON DELETE RESTRICT` supaya menghapus indikator sumber tidak diam-diam menghilangkan syarat kelayakan (yang akan membuat insentif selalu cair keliru).

---

## 4. Dua jalur data yang menyatu

Sistem menerima data lewat dua jalur berbeda yang berujung pada tabel `kpi_row` yang sama.

### Jalur A — Unggahan Excel (periode lampau, final)

Wizard 4 langkah (`app/admin/import/`) → endpoint di `app/api/import/`:

```
upload  → token unggah langsung ke Vercel Blob
parse   → baca sheet, deteksi header, tulis baris mentah ke staging
validate→ periksa per 1.000 baris, catat temuan & baris bermasalah
publish → satu transaksi: batch lama digeser, batch baru jadi "terbit"
rollback→ aktifkan kembali batch lama bila perlu
```

Ini menghasilkan angka **final** untuk periode yang sudah ditutup. Definisi kolom & alias header ada di `lib/import/`.

### Jalur B — Penarikan API (bulan berjalan, live)

`lib/tarik-api.ts` menarik data operasional per cabang (master kode di menu Master Cabang API) ke tabel `data_mentah`. Lalu mesin hitung (`lib/hitung-indikator.ts`) mengubahnya jadi `kpi_row` bersumber `'api'`.

Pemicu penarikan:
- **Otomatis** lewat cron (`app/api/cron/tarik/route.ts`).
- **Manual** lewat `PATCH /api/admin/data-api` (menarik lalu menghitung).
- **Hitung ulang saja** lewat `PATCH /api/admin/data-api` dengan `{ hanyaHitung: true }` — menghitung ulang dari `data_mentah` yang sudah ada tanpa menarik ulang. Berguna setelah rumus/indikator diubah; tombol "Hitung ulang" di halaman Create Indicator memicunya.

Angka jalur B **belum final** — dihitung ulang tiap tarikan sampai bulan ditutup, lalu digantikan versi Excel final.

---

## 5. Mesin perhitungan (`lib/hitung-indikator.ts`)

Inti sistem. Mengubah `data_mentah` menjadi skor dan insentif, mengikuti definisi rumus yang dirakit admin. Orkestratornya `hitungSemuaIndikator(periode)` menjalankan tiga tahap berurutan:

1. **Hitung tiap indikator** — per pasangan **indikator × produk**, dikelompokkan menurut NIK sesuai peran pemegang (staff/spv/bch). Rumus dirakit dari komponen (`lib/rumus.ts`): tiap komponen adalah agregasi (SUM/COUNT/COUNT_DISTINCT/…) atas satu kolom dengan sederet syarat, digabung antar komponen dengan operator (+ − × ÷). Hasilnya diubah jadi skor 0–5.
2. **`nilaiGerbang(periode)`** — mengevaluasi syarat kelayakan untuk indikator nominal bersyarat. Bila indikator sumber gerbang hilang, gerbang **dianggap gagal** (lebih aman daripada lolos), dan alasan kegagalan disimpan permanen di `kpi_row.gerbang_gagal`.
3. **`hitungInsentif(periode)`** — menggabungkan skor menjadi baris insentif menurut mekanismenya.

### Cara skor dihitung: pita vs tiga ambang

Setiap target boleh memakai salah satu dari dua cara:

- **Tiga ambang (sederhana)** — hanya KPI 3/4/5. Cocok untuk target dua-tiga tingkat. Di luar itu skor diinterpolasi linear ke 0.
- **Pita (bertingkat)** — daftar band `[nilai_min, nilai_max) → [poin_min, poin_max]`. Skor **diinterpolasi linear di dalam tiap band** (`poin_dari_pita`), sehingga pencapaian 87% bisa bernilai KPI 2,25. Kolom `poin_min`/`poin_max` berarti "skor di batas bawah/atas", bukan skor terkecil/terbesar — sehingga **indikator terbalik** (Repeat Roll, NPL: makin kecil makin bagus) didukung dengan skor menurun. Constraint `ck_pita_rentang` (v9b) hanya membatasi skor ke 0–5 tanpa memaksakan arah.

### Tiga mekanisme insentif

Kolom `mekanisme` pada pagu menentukan cara insentif dibayar:

- **`pagu`** — proporsional terhadap skor insentif reguler tertimbang.
- **`tier`** — nominal dari tabel tier, disilangkan dengan kelas cabang (`kelas_cabang`).
- **`bersyarat`** — nominal **datar** yang cair penuh bila **semua gerbang lolos**, nol bila satu saja gagal (Flow 1). Nominalnya dipilih dari pita rupiah berdasarkan nilai indikator pemilih (`nominal_dari_pita`, tanpa interpolasi).

### Peran indikator

`kpi` · `reguler` (setara kpi) · `reward` (menambah nominal) · `penalty` (mengurangi) · `tier` (penentu tier, tidak ikut skor) · `nominal` (insentif bersyarat) · `pendukung` (tidak dinilai/dibayar, hanya bahan syarat gerbang/pemilih pita).

---

## 6. Hierarki & visibilitas

`lib/hierarki.ts` + Master Hierarki mengatur **siapa boleh melihat KPI siapa**. Jabatan disusun berlevel (ADMIN → Management → AM → ACH → BM/DBM → SPV → Staff). Aturannya: atasan hanya melihat jabatan yang ada di bawahnya pada rantai, dan **hanya dalam cabang/area sendiri**.

`SQL_TIM_TERLIHAT` adalah satu sumber kebenaran visibilitas, dipakai ulang oleh halaman Tim Saya maupun tampilan harian — sehingga aturan tidak pernah bercabang dua. Jabatan boleh punya **alias** (mis. "FC TT R2" beralias ke "FC TT") agar varian berproduk tetap cocok dengan struktur.

---

## 7. Tampilan menurut peran

| Peran | Halaman utama |
|---|---|
| Admin | Dashboard (analitik), Data KPI, KPI Harian, Create Indicator, Data API, Master (hierarki, produk, pagu, tier, cabang, pengguna, unggah), Supporting |
| Atasan | Dasbor saya, Progres harian, Tim saya, Request |
| Karyawan | Dasbor saya, Progres harian, Request |

Sorotan tampilan:

- **Dashboard analitik** (`lib/analitik.ts`, `components/AmChart.tsx`) — peringkat cabang dengan gerak naik/turun (▲▼) dibanding bulan lalu, sebaran skor dengan tooltip per area/cabang. amCharts5 dimuat dari CDN; tooltip kolom memakai `tooltipText` pada template kolom, bukan tooltip tingkat seri.
- **KPI Harian** (`lib/harian.ts`, `components/RincianHarian.tsx`) — progres bulan berjalan dari data API. Indikator dipisah per peran (nominal dulu, lalu kpi, reward, penalty, tier, pendukung) dengan aksen warna kiri pembeda. Nilai KPI tiap indikator bisa diklik untuk membuka seluruh ambang pita; kolom "Target berikutnya" menunjukkan ambang untuk naik satu tingkat (sadar arah untuk indikator terbalik). Format persen menghormati flag "kalikan 100" agar tidak dikali dua kali.

---

## 8. Konvensi & keputusan yang mudah terlupa

- **Angka Indonesia** — titik ribuan, koma desimal. `components/InputAngka.tsx` menampilkan format ribuan sambil menyimpan angka mentah.
- **Pencocokan selalu lewat NIK**, tidak pernah lewat nama. Kolom NAMA murni untuk tampilan.
- **Normalisasi wilayah/jabatan** (`norm_wilayah`, `norm_jabatan`) hanya merapikan spasi & kapital — tidak menyatukan ejaan berbeda. Cabang/jabatan dengan ejaan tak konsisten harus dirapikan di sumber.
- **Cabang muncul di daftar hanya bila punya baris KPI.** Cabang di Master Cabang API tidak otomatis tampil di Data KPI/KPI Harian; ia baru muncul setelah ada pegawai berjabatan yang terdaftar ke suatu indikator dan menghasilkan `kpi_row`.
- **Kontras warna** — token `--ink-faint` sengaja digelapkan (#5C6979) agar lolos WCAG AA di semua latar, bukan hanya putih.

---

## 9. Penggunaan menu Master

Menu **Master** mengelompokkan pengaturan yang sifatnya sesekali — fondasi yang harus disiapkan sebelum angka KPI bisa dihitung dengan benar. Urutan penyiapannya penting karena tiap item bergantung pada yang sebelumnya.

**Urutan penyiapan yang disarankan (dari nol):**

```
Master Hierarki → Master Produk → Pengguna & Akses → Master Cabang API
→ Create Indicator*  → Pagu Insentif → Tabel Tier Insentif → Tier Cabang
                (*Create Indicator ada di grup "Data & indikator", bukan Master)
```

### Master Hierarki (`/admin/hierarki`)
Menentukan **rantai jabatan** dan siapa boleh melihat KPI siapa. Tiap jabatan ditempatkan pada level (ADMIN → Management → AM → ACH → BM/DBM → SPV → Staff). Fitur:
- **Diagram / Tabel / Tingkatan** — tiga cara memandang struktur yang sama.
- **Uji visibilitas** — cek langsung "jabatan X bisa melihat KPI siapa saja".
- **Alias jabatan** — daftarkan varian berproduk (mis. "FC TT R2", "MEBS R2") ke jabatan dasarnya, supaya impor pengguna & perhitungan cocok. Peringatan "jabatan belum ada di Master Hierarki" saat impor diselesaikan di sini.

Ini disiapkan **pertama** karena hampir semua modul lain mengacu pada jabatan.

### Master Produk (`/admin/produk`)
Mendaftarkan produk (R2, R4, MIX) dan **pemetaan jabatan·produk** — pasangan mana yang aktif. Indikator hanya dihitung untuk pasangan jabatan·produk yang terdaftar, jadi produk harus ada sebelum indikator didaftarkan.

### Pengguna & Akses (`/admin/pengguna`)
Mengelola akun login dan memantau seberapa sering tiap akun dipakai. Dua cara mengisi:
- **Tambah pengguna** satu per satu.
- **Impor dari Excel** — unduh template dulu (kolom NIK, NAMA, JABATAN, CABANG, AREA, PERAN, PASSWORD, AKTIF). Kolom NAMA cukup nama murni; pencocokan ke data KPI selalu lewat **NIK**. Pratinjau impor menandai baris "akan diperbarui", "perlu dicek" (peringatan, mis. jabatan belum ada di hierarki — tetap bisa disimpan), dan "ditolak" (bermasalah, tidak disimpan). Centang "Perbarui data akun yang NIK-nya sudah terdaftar" untuk memutakhirkan yang sudah ada.

Mengubah jabatan seseorang di sini tidak mengubah angka periode lama — snapshot jabatan tersimpan per baris KPI, dan tampilan periode lampau memakai snapshot itu.

### Master Cabang API (`/admin/cabang`)
Mendaftarkan **kode cabang (branch_id) → nama cabang** yang dipakai saat menarik data operasional dari API. Bisa ditambah satu per satu atau ditempel massal (dipisah koma/titik-koma/tab/baris baru). Penting dipahami: menu ini **hanya mengatur cabang mana yang datanya ditarik**, bukan cabang mana yang tampil di Data KPI. Sebuah cabang baru muncul di Data KPI/KPI Harian setelah ada pegawai berjabatan terdaftar yang menghasilkan baris KPI — bukan semata karena ada di daftar ini.

### Pagu Insentif (`/admin/pagu`)
Menentukan **mekanisme insentif** per jabatan·produk:
- **`pagu`** — proporsional terhadap skor insentif reguler, dengan pagu/skor/pembagi yang diisi di sini.
- **`tier`** — nominal diambil dari Tabel Tier Insentif, disilangkan kelas cabang.
- **`bersyarat`** — nominal datar dari indikator nominal bersyarat; panel mengarahkan ke Create Indicator untuk mengatur gerbang & pita rupiahnya.

### Tabel Tier Insentif (`/admin/tier`)
Tabel nominal untuk mekanisme `tier`: berapa rupiah untuk tiap kombinasi tier × kelas cabang. Field nominalnya memakai format ribuan Indonesia otomatis.

### Tier Cabang (`/admin/kelas-cabang`)
Menetapkan **kelas tiap cabang** (mis. kelas 1/2/3) yang menjadi salah satu sumbu Tabel Tier Insentif. Fungsi `kelas_cabang()` di database membaca penetapan ini per periode.

### Peran & Hak Akses (`/admin/peran`)
Mengelola **peran** dan **menu apa saja yang terlihat** untuk tiap peran. Lima peran bawaan tersedia: Karyawan, Atasan, Manager, Manajemen HO, dan Admin/Superuser. Peran baru bisa ditambah bebas.

- **Daftar peran di kiri, hak menunya di kanan** — centang menu yang boleh dibuka, dikelompokkan sama persis seperti tampil di navigasi (Menu utama, Data & indikator, Master), dengan tombol "Pilih semua" per grup.
- **Peran bawaan tidak bisa dihapus** dan kodenya tidak bisa diubah, karena aturan hierarki dan mesin hitung bersandar pada kode tersebut. Hak menunya tetap bebas diatur.
- **Peran yang masih dipakai pengguna tidak bisa dihapus** — pindahkan penggunanya dulu ke peran lain.
- **Perubahan berlaku setelah pengguna login ulang.** Hak menu disalin ke token sesi saat login supaya navigasi dan penjagaan rute tidak perlu memanggil database tiap permintaan; masa token 8 jam.

Katalog menu itu sendiri ada di `lib/menu.ts` — bukan di database, karena baris database tidak bisa memunculkan halaman yang belum ditulis. Menambah menu baru: tambahkan satu entri di katalog, lalu centangkan untuk peran yang berhak lewat layar ini.

### Grup "Data & indikator" — tiga menu pendukung indikator

**Kolom Data API** (`/admin/kolom-api`) — katalog kolom data mentah. Tambah kolom baru dari field API, atur label/kelompok/jenis, nonaktifkan yang tak terpakai. Kolom **inti** tidak bisa dihapus dan jenisnya dikunci; kolom **kustom** bebas selama belum dipakai indikator. Kolom kustom bersifat aditif pada penarikan — kegagalannya tidak bisa menggagalkan kolom inti. Di sini pula kolom **data pendukung** didaftarkan (pilih Sumber = "Data pendukung").

**Kolom Turunan** (`/admin/turunan`) — kolom yang nilainya diolah dari kolom lain, mis. `od_movement_new` yang menggabungkan OD Movement dengan prepaid dari data pendukung. Dua cara menyusunnya: **perakit visual** ("kalau begini maka begitu", disusun lewat dropdown) dan **ekspresi SQL** untuk kasus rumit. Mode SQL disaring dengan daftar-putih token: hanya kolom terdaftar, angka, teks berkutip, dan sedikit kata kunci (`CASE WHEN THEN ELSE END`, `AND/OR/NOT`, `COALESCE`, `ROUND`) yang lolos — `SELECT`, `FROM`, titik koma, dan komentar ditolak. Nilainya **dimaterialisasi** ke kolom fisik dan dihitung ulang otomatis tiap tarikan API, sehingga isinya bisa diperiksa seperti kolom biasa.

**Data Pendukung** (`/admin/pendukung`) — unggah Excel berisi `agreement_no` plus kolom nilai yang sudah didaftarkan. Nomor kontrak yang sudah ada diperbarui, bukan digandakan; baris tanpa nomor kontrak diabaikan. Penggabungan ke data utama memakai `LEFT JOIN` agar kontrak yang belum ada di data pendukung tetap ikut terhitung.

### Unggah data (`/admin/import`)
Wizard 4 langkah untuk menaikkan **data KPI final periode lampau** dari Excel (upload → parse → validate → publish), dengan kemampuan rollback ke batch sebelumnya lewat menu Riwayat impor. Ditaruh di Master karena hanya dipakai sesekali — saat data belum masuk lewat API, atau saat menutup periode.

---

## 10. Alur deploy singkat

1. Jalankan migrasi SQL baru di Neon bila ada (mis. `psql $DATABASE_URL -f db/schema-*.sql`).
2. `npm run build` lokal untuk memastikan tak ada galat.
3. `git commit` + `git push` → Vercel build & deploy otomatis.

Perubahan skema database dan perubahan kode saling melengkapi: kode baru yang bergantung pada kolom/constraint baru tidak akan berfungsi sampai migrasinya dijalankan. Lihat `DEPLOY.md` untuk langkah lengkap.

---

## 11. Ringkasan peta berkas

```
app/
  admin/            seluruh modul admin (analitik, kpi, harian, indikator, master, dst.)
  dashboard, tim, harian, request, login, ganti-password
  api/
    import/         pipeline unggah Excel (upload→parse→validate→publish→rollback)
    admin/          endpoint pengelolaan (indikator, pagu, tier, hierarki, data-api, pengguna, …)
    cron/tarik/     penarikan API terjadwal
    auth/           login, logout, ganti password
lib/
  hitung-indikator.ts  mesin hitung (indikator → gerbang → insentif)
  rumus.ts             perakit & pembaca rumus komponen
  tarik-api.ts         penarikan data operasional per cabang
  analitik.ts          kueri dashboard (peringkat, sebaran)
  harian.ts            kueri progres harian
  kpi.ts               kueri KPI periode (Excel)
  hierarki.ts          aturan visibilitas jabatan
  format.ts            format angka/persen/rupiah Indonesia
  auth.ts, db.ts       sesi & akses database
components/            UI bersama (AppShell, RincianHarian, InputAngka, AmChart, …)
db/                    skema berlapis bernomor + seed
```

---

*Dokumen ini menggambarkan sistem pada kondisi terkini. Saat menambah kemampuan, ikuti pola yang sudah ada: lapis skema baru bernomor, fungsi perhitungan di database, snapshot untuk akurasi historis, dan satu sumber kebenaran untuk aturan yang dipakai di banyak tempat.*
