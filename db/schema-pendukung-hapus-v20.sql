-- ---------------------------------------------------------------------
-- v20 — hapus data pendukung per batch unggahan
--
-- Sebelumnya baris data pendukung hanya bisa dihapus satu-satu (per id)
-- atau semuanya sekaligus. Kalau berkas yang salah terlanjur diunggah dan
-- sudah tercampur dengan unggahan lain, tidak ada cara menghapus HANYA
-- baris dari berkas itu.
--
-- Solusinya: setiap baris data_pendukung mencatat unggahan mana yang
-- terakhir mengisinya (unggah_id). Karena unggahan memakai UPSERT
-- (ON CONFLICT DO UPDATE), kolom ini selalu menunjuk ke unggahan PALING
-- BARU yang menyentuh baris tersebut — bukan yang pertama kali membuatnya.
-- Konsekuensinya disengaja: menghapus "berdasarkan batch X" hanya
-- menghapus baris yang isinya memang masih berasal dari batch X. Baris
-- yang sudah ditimpa unggahan yang lebih baru tidak ikut terhapus, karena
-- isinya sekarang bukan lagi milik batch lama itu.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

ALTER TABLE data_pendukung
  ADD COLUMN IF NOT EXISTS unggah_id BIGINT
  REFERENCES pendukung_unggah(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_data_pendukung_unggah
  ON data_pendukung (unggah_id);
