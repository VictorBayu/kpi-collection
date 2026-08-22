-- =====================================================================
-- v10 — TIER CABANG PER PRODUK
--
-- Kelas cabang ternyata tidak seragam lintas produk: satu cabang bisa
-- berkelas besar untuk R2 tapi kecil untuk R4, karena volume tiap produk
-- di cabang itu berbeda. Karena itu produk masuk ke kunci utama, bukan
-- disimpan satu baris per cabang saja.
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. HET SEBAGAI PRODUK
-- ---------------------------------------------------------------------
INSERT INTO produk_master (kode, nama, urutan) VALUES
  ('HET', 'HET', 30)
ON CONFLICT (kode) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. PRODUK PADA KELAS CABANG
--    Baris lama (sebelum produk dikenal) tidak bisa ditebak produknya,
--    jadi diberi produk dari master satu per satu — bukan dibuang, sebab
--    kelas yang sudah dipakai menghitung insentif periode lampau harus
--    tetap bisa dibaca ulang dengan hasil yang sama.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'cabang_kelas' AND column_name = 'produk') THEN

    ALTER TABLE cabang_kelas ADD COLUMN produk TEXT;

    -- Kunci utama lama dibuang LEBIH DULU. Kalau tidak, penyalinan baris
    -- di bawah bentrok dengan kunci (cabang, berlaku_mulai) yang belum
    -- mengenal produk, dan seluruh salinannya diam-diam terbuang.
    ALTER TABLE cabang_kelas DROP CONSTRAINT IF EXISTS cabang_kelas_pkey;

    -- Baris lama digandakan ke tiap produk, supaya perilakunya persis
    -- sama seperti sebelum produk dikenal: kelas berlaku untuk semua
    -- produk di cabang itu. Baris asli dipakai untuk produk pertama.
    INSERT INTO cabang_kelas (cabang, berlaku_mulai, kelas, produk)
    SELECT k.cabang, k.berlaku_mulai, k.kelas, p.kode
      FROM cabang_kelas k
      CROSS JOIN produk_master p
     WHERE k.produk IS NULL
       AND p.kode <> (SELECT kode FROM produk_master ORDER BY urutan, kode LIMIT 1);

    -- Produk pertama diurutkan menurut kolom `urutan`, bukan abjad:
    -- MIN(kode) atas ('R2','R4','HET') menghasilkan 'HET', yang bukan
    -- produk pertama yang dimaksud siapa pun.
    UPDATE cabang_kelas
       SET produk = (SELECT kode FROM produk_master ORDER BY urutan, kode LIMIT 1)
     WHERE produk IS NULL;

    ALTER TABLE cabang_kelas ALTER COLUMN produk SET NOT NULL;
    ALTER TABLE cabang_kelas
      ADD CONSTRAINT cabang_kelas_produk_fkey
      FOREIGN KEY (produk) REFERENCES produk_master(kode) ON UPDATE CASCADE;

    ALTER TABLE cabang_kelas ADD PRIMARY KEY (cabang, produk, berlaku_mulai);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cabang_kelas_cari
  ON cabang_kelas (cabang, produk, berlaku_mulai DESC);

-- ---------------------------------------------------------------------
-- 3. PENCARIAN KELAS IKUT PRODUK
--    Tanda tangan lama (cabang, periode) diganti yang baru bertiga.
--    Versi lama dibuang supaya tidak ada pemanggil yang diam-diam masih
--    memakainya dan mendapat kelas produk yang keliru.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS kelas_cabang(TEXT, DATE);

CREATE OR REPLACE FUNCTION kelas_cabang(p_cabang TEXT, p_produk TEXT, p_periode DATE)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT k.kelas FROM cabang_kelas k
   WHERE norm_wilayah(k.cabang) = norm_wilayah(p_cabang)
     AND k.produk = p_produk
     AND k.berlaku_mulai <= p_periode
   ORDER BY k.berlaku_mulai DESC LIMIT 1
$$;

-- ---------------------------------------------------------------------
-- 4. BANGUN ULANG v_insentif_aktif
--    View dibuat dengan SELECT * pada v8, dan Postgres membekukan daftar
--    kolomnya saat view dibuat — kolom tier/kelas/nominal_dasar/reward/
--    penalty yang ditambahkan v9 karena itu tidak pernah ikut terlihat.
--    Gejalanya sunyi: kueri ke view berkata kolomnya tidak ada, padahal
--    tabelnya jelas punya.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_insentif_aktif;
CREATE VIEW v_insentif_aktif AS
SELECT i.*
  FROM insentif_row i
  JOIN import_batch b ON b.id = i.batch_id
 WHERE i.sumber = 'excel' AND b.status = 'published'
UNION ALL
SELECT i.* FROM insentif_row i WHERE i.sumber = 'api';
