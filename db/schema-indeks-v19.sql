-- ---------------------------------------------------------------------
-- v19 — indeks untuk halaman yang paling sering dibuka
--
-- Latar: laporan Speed Insights menunjukkan TTFB sampai 25 detik pada
-- /admin/kpi. TTFB sebesar itu bukan soal browser atau ukuran halaman —
-- servernya memang belum menjawab. Penyebabnya tabel kpi_row hanya punya
-- indeks (nik, periode) dan (periode, sumber); tidak satu pun bisa dipakai
-- untuk kueri yang menyaring PERIODE lalu mengelompokkan per CABANG,
-- sehingga tiap pembukaan halaman memindai seluruh tabel.
--
-- Indeks di bawah dibuat mengikuti bentuk kueri yang benar-benar dipakai,
-- termasuk bentuk ekspresinya. Indeks pada kolom mentah tidak akan terpakai
-- oleh kueri yang menyaring dengan norm_wilayah(cabang) atau
-- UPPER(TRIM(cabang)) — Postgres hanya memakai indeks ekspresi bila
-- ekspresinya cocok persis.
--
-- CONCURRENTLY sengaja TIDAK dipakai: perintah itu tidak boleh berada di
-- dalam blok transaksi, sementara berkas ini dijalankan sebagai satu
-- kesatuan lewat psql -f. Tabelnya juga masih berukuran puluhan ribu baris,
-- jadi penguncian saat membangun indeks hanya sesaat.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

-- Dasar: hampir semua kueri dasbor menyaring periode lebih dulu.
CREATE INDEX IF NOT EXISTS idx_kpi_periode ON kpi_row (periode);

-- Daftar cabang per periode (lib/kpi.ts cabangPeriode, lib/harian.ts).
CREATE INDEX IF NOT EXISTS idx_kpi_periode_cabang_norm
  ON kpi_row (periode, norm_wilayah(cabang));

-- Daftar karyawan satu cabang (lib/kpi.ts karyawanCabang) memakai bentuk
-- ekspresi yang berbeda, jadi butuh indeksnya sendiri.
CREATE INDEX IF NOT EXISTS idx_kpi_periode_cabang_upper
  ON kpi_row (periode, (COALESCE(UPPER(TRIM(cabang)), '(TANPA CABANG)')));

-- Tampilan harian selalu menyaring sumber='api' pada periode berjalan.
CREATE INDEX IF NOT EXISTS idx_kpi_api_periode
  ON kpi_row (periode, nik) WHERE sumber = 'api';

-- Indikator terlemah per orang: DISTINCT ON (nik) ORDER BY skor_kpi.
CREATE INDEX IF NOT EXISTS idx_kpi_nik_skor
  ON kpi_row (periode, nik, skor_kpi);

-- Insentif dijumlahkan per periode di hampir setiap dasbor.
CREATE INDEX IF NOT EXISTS idx_insentif_periode ON insentif_row (periode);
CREATE INDEX IF NOT EXISTS idx_insentif_periode_nik ON insentif_row (periode, nik);

-- Penggabungan data pendukung memakai nomor kontrak pada kedua sisi.
CREATE INDEX IF NOT EXISTS idx_mentah_agreement ON data_mentah (agreement_no);

-- Pengelompokan per PIC saat menghitung indikator.
CREATE INDEX IF NOT EXISTS idx_mentah_staff ON data_mentah (nik_staff);
CREATE INDEX IF NOT EXISTS idx_mentah_spv   ON data_mentah (nik_spv);
CREATE INDEX IF NOT EXISTS idx_mentah_bch   ON data_mentah (nik_bch);

-- Statistik dimutakhirkan supaya perencana kueri langsung memakai indeks
-- baru, bukan menunggu autovacuum berjalan sendiri.
ANALYZE kpi_row;
ANALYZE insentif_row;
ANALYZE data_mentah;
