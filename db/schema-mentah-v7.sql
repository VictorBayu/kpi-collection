-- =====================================================================
-- v7 — MEMBUANG KOLOM `lain` UNTUK MENGHEMAT PENYIMPANAN
--
-- Kolom `lain` menampung sisa field API sebagai JSON — puluhan field yang
-- tidak dipakai indikator, termasuk array daftar kontak konsumen yang
-- besar. Dikali 86 ribu baris ditambah salinannya di meja sementara, itu
-- ratusan megabyte yang menembus batas penyimpanan Neon (512 MB) dan
-- membuat penarikan gagal dengan "could not extend file".
--
-- Kolom ini tidak punya nilai fungsional: isinya tidak bisa dipakai di
-- pembangun indikator, yang hanya menerima kolom terkatalog. Field yang
-- sungguh diperlukan sudah dipromosikan jadi kolom sendiri (lihat v6), dan
-- pola itulah yang dipakai bila kelak ada field lain yang dibutuhkan.
--
-- TRUNCATE dijalankan supaya ruang yang dipakai baris lama (yang masih
-- membawa `lain`) langsung dibebaskan — tanpa itu, menghapus kolom saja
-- tidak mengembalikan ruangnya sampai tabel ditulis ulang. Datanya toh
-- akan terisi lagi pada penarikan berikutnya.
--
-- Aman dijalankan ulang.
-- =====================================================================

ALTER TABLE data_mentah         DROP COLUMN IF EXISTS lain;
ALTER TABLE data_mentah_staging DROP COLUMN IF EXISTS lain;

TRUNCATE data_mentah;
TRUNCATE data_mentah_staging;
