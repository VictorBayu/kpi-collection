-- =====================================================================
-- v30 — TARGET TIER: TARGET RASIO & AMOUNT BERDAMPINGAN
--
-- Di file Target Tier, satu kelompok produk bisa berisi cabang bertarget
-- RASIO (mis. BSD R4 13,5%) dan cabang bertarget AMOUNT (mis. PALEMBANG
-- R4 Rp93 jt). Jenisnya kini ditentukan PER BARIS dari angkanya:
--   satuan = 'persen'  -> disimpan sebagai pecahan (0,0601 = 6,01%)
--   satuan = 'nominal' -> rupiah
-- Indikator bersumber Target Tier diberi indikator pendamping untuk
-- cabang bertarget amount (rumus amount, mis. OS Delq30+).
-- Aman dijalankan berulang.
-- =====================================================================

ALTER TABLE indikator_target
  ADD COLUMN IF NOT EXISTS indikator_amount_id uuid
    REFERENCES indikator_def(id) ON DELETE SET NULL;

-- Baris lama: satuan ditebak dari kelompok produk (R4 = nominal). Koreksi
-- dari angkanya: semua nilai terisi <= 1 berarti rasio.
UPDATE target_tier
   SET satuan = CASE WHEN GREATEST(COALESCE(t1,0),COALESCE(t2,0),COALESCE(t3,0),
                                   COALESCE(t4,0),COALESCE(t5,0)) > 1
                     THEN 'nominal' ELSE 'persen' END;
