-- =====================================================================
-- v33 — MEKANISME "PAGU PER GRADING CABANG"
--
-- Jabatan yang pagunya berbeda menurut grading cabang (Large/Medium/Small)
-- tetapi nominal akhirnya tetap mengikuti skor:
--     nominal = (skor insentif / pembagi) x pagu kelas cabang
-- Pagu per kelas disimpan di Tabel Tier Insentif (tier 1 per kelas).
-- Aman dijalankan ulang.
-- =====================================================================
ALTER TABLE insentif_pagu DROP CONSTRAINT IF EXISTS ck_pagu_mekanisme;
ALTER TABLE insentif_pagu ADD CONSTRAINT ck_pagu_mekanisme
  CHECK (mekanisme IN ('pagu','tier','bersyarat','pagu_kelas'));
