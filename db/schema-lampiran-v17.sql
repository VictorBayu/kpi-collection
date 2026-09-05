-- ---------------------------------------------------------------------
-- LAMPIRAN v17 — gambar pada tiket Supporting
--
-- Tabel `request` sudah punya lampiran_url sejak awal, tapi balasan di
-- dalam percakapan belum. Padahal justru di situ lampiran paling sering
-- dibutuhkan: pertanyaan admin "bisa kirim tangkapan layarnya?" muncul
-- setelah tiket dibuat, bukan saat membuatnya.
--
-- Hanya satu gambar per pesan, maksimal 2 MB — batas itu ditegakkan di
-- endpoint unggah, bukan di sini, karena ukuran berkas tidak diketahui
-- database yang cuma menyimpan alamatnya.
--
-- Aman dijalankan ulang.
-- ---------------------------------------------------------------------

ALTER TABLE request_message ADD COLUMN IF NOT EXISTS lampiran_url TEXT;

-- Nama berkas asli disimpan terpisah supaya bisa ditampilkan apa adanya;
-- alamat di penyimpanan sudah diacak dan tidak enak dibaca manusia.
ALTER TABLE request_message ADD COLUMN IF NOT EXISTS lampiran_nama TEXT;
ALTER TABLE request         ADD COLUMN IF NOT EXISTS lampiran_nama TEXT;
