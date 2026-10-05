-- v27 — Pendaftaran indikator per periode (bulan)
-- Jalankan di Neon SEKALI. Aman diulang.
--
-- Setiap bulan punya set pendaftaran sendiri (jabatan·produk, bobot, target,
-- pita, gerbang). Definisi/rumus indikator (indikator_def) tetap satu.
-- Data yang ada sekarang dijadikan set bulan BERJALAN saja.

ALTER TABLE indikator_target ADD COLUMN IF NOT EXISTS periode DATE;

UPDATE indikator_target
   SET periode = date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta')::date
 WHERE periode IS NULL;

ALTER TABLE indikator_target ALTER COLUMN periode SET NOT NULL;

ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS ck_target_periode;
ALTER TABLE indikator_target ADD CONSTRAINT ck_target_periode
  CHECK (periode = date_trunc('month', periode)::date);

-- Ganti kunci unik lama (indikator_id, alias, produk) dengan yang memuat periode.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'indikator_target'::regclass AND c.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
              FROM unnest(c.conkey) k JOIN pg_attribute a
                ON a.attrelid = c.conrelid AND a.attnum = k)
           = ARRAY['alias','indikator_id','produk']
  LOOP
    EXECUTE format('ALTER TABLE indikator_target DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE indikator_target DROP CONSTRAINT IF EXISTS uq_target_periode;
ALTER TABLE indikator_target ADD CONSTRAINT uq_target_periode
  UNIQUE (indikator_id, alias, produk, periode);

CREATE INDEX IF NOT EXISTS idx_indtarget_periode
  ON indikator_target (periode, alias, produk) WHERE aktif;
