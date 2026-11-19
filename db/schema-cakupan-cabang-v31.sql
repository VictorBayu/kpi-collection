-- =====================================================================
-- v31 — CAKUPAN DATA INDIKATOR
--
-- 'pic'    (bawaan) : hanya baris kontrak yang kolom PIC-nya (staff_pic /
--                     spv_pic / bch_pic) berisi NIK orang itu.
-- 'cabang'          : SELURUH baris kontrak cabang tempat orang itu tercatat
--                     sebagai PIC (semua branch_id bernama cabang sama,
--                     mis. BSD 440 + 540), tanpa melihat siapa PIC barisnya.
--                     Cocok untuk indikator level cabang (Delq Target Tier).
-- Aman dijalankan berulang.
-- =====================================================================
ALTER TABLE indikator_def
  ADD COLUMN IF NOT EXISTS cakupan text NOT NULL DEFAULT 'pic';
ALTER TABLE indikator_def DROP CONSTRAINT IF EXISTS ck_indikator_cakupan;
ALTER TABLE indikator_def ADD CONSTRAINT ck_indikator_cakupan
  CHECK (cakupan IN ('pic', 'cabang'));
