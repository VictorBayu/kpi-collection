-- =====================================================================
-- v32 — INDIKATOR DIHITUNG UNTUK LEBIH DARI SATU PERAN PIC
--
-- peran_pic tetap peran utama; peran_pic_tambahan berisi peran lain
-- (staff/spv/bch) yang ikut dihitung dengan rumus yang sama. Satu NIK
-- dinilai atas baris di mana ia tercatat pada SALAH SATU kolom PIC yang
-- dipilih (baris yang sama tidak dihitung dua kali).
-- Aman dijalankan berulang.
-- =====================================================================
ALTER TABLE indikator_def
  ADD COLUMN IF NOT EXISTS peran_pic_tambahan text[] NOT NULL DEFAULT '{}';
ALTER TABLE indikator_def DROP CONSTRAINT IF EXISTS ck_indikator_pic_tambahan;
ALTER TABLE indikator_def ADD CONSTRAINT ck_indikator_pic_tambahan
  CHECK (peran_pic_tambahan <@ ARRAY['staff','spv','bch']::text[]);
