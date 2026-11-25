-- =====================================================================
-- v34 — TABEL PARAMETER (nilai rupiah dicari dari kombinasi beberapa sumbu)
--
-- Untuk skema seperti "Insentif Penyelesaian Kontrak Prioritas R2":
-- nilai per KONTRAK ditentukan oleh kombinasi kategori bahan kerja, rentang
-- OSP, rentang Probability of Default, dan rentang Max Overdue.
--
-- Bentuknya data, bukan kode, supaya perubahan hanya berupa isian:
--   - kategori baru         -> tambah satu band
--   - rentang baru          -> tambah satu band
--   - sumbu baru ("melebar")-> tambah satu dimensi
--   - produk lain (mis. R4) -> tambah satu tabel dengan struktur sama
--
-- Lapisan ini hanya MENYIMPAN tabelnya. Pemakaiannya (kolom turunan mode
-- "tabel") dan layar editornya dikerjakan pada tahap berikutnya.
--
-- Versi per periode: satu `kode` bisa punya beberapa baris param_tabel
-- dengan `berlaku_mulai` berbeda. Periode yang dihitung memakai versi
-- terbaru yang berlaku_mulai-nya <= periode itu (lihat param_versi()).
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL (satu baris = satu versi)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS param_tabel (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode          TEXT NOT NULL CHECK (kode ~ '^[a-z][a-z0-9_]{0,60}$'),
  nama          TEXT NOT NULL,
  produk        TEXT REFERENCES produk_master(kode) ON UPDATE CASCADE,
  berlaku_mulai DATE NOT NULL,
  keterangan    TEXT,
  aktif         BOOLEAN NOT NULL DEFAULT TRUE,
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kode, berlaku_mulai)
);

CREATE INDEX IF NOT EXISTS idx_param_tabel_kode ON param_tabel (kode, berlaku_mulai DESC);

-- ---------------------------------------------------------------------
-- 2. SUMBU (dimensi)
--
--    kolom_sumber menunjuk kolom di data mentah yang nilainya dicocokkan
--    ke band. Sengaja TANPA foreign key: tabelnya boleh disusun sebelum
--    kolom API-nya didaftarkan di CRUD Kolom API; kecocokannya diperiksa
--    saat kolom turunan dihitung, bukan saat disimpan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS param_dimensi (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabel_id      UUID NOT NULL REFERENCES param_tabel(id) ON DELETE CASCADE,
  urutan        INTEGER NOT NULL DEFAULT 0,
  kode          TEXT NOT NULL CHECK (kode ~ '^[a-z][a-z0-9_]{0,40}$'),
  label         TEXT NOT NULL,
  kolom_sumber  TEXT,
  jenis         TEXT NOT NULL CHECK (jenis IN ('kategori','rentang')),
  UNIQUE (tabel_id, urutan),
  UNIQUE (tabel_id, kode)
);

-- ---------------------------------------------------------------------
-- 3. BAND tiap sumbu
--
--    kategori : cocok bila nilai kolom sama dengan salah satu isi
--               nilai_teks (tanpa membedakan huruf besar/kecil).
--    rentang  : cocok bila nilai kolom berada di antara nilai_min dan
--               nilai_max. Batas kosong = terbuka ke arah itu.
--
--    Kedua batas membawa penanda inklusif sendiri. Tabel insentif sering
--    memakai "<= 4 Jt" lalu "> 4 Jt sd 8 Jt": nilai tepat 4.000.000 masuk
--    band pertama, dan 8.000.000 masuk band kedua. Konvensi pita lain
--    (bawah inklusif, atas eksklusif) akan salah di titik-titik batas itu.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS param_band (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimensi_id    UUID NOT NULL REFERENCES param_dimensi(id) ON DELETE CASCADE,
  urutan        INTEGER NOT NULL DEFAULT 0,
  label         TEXT NOT NULL,
  nilai_teks    TEXT[],
  nilai_min     NUMERIC(24,6),
  nilai_max     NUMERIC(24,6),
  min_inklusif  BOOLEAN NOT NULL DEFAULT TRUE,
  max_inklusif  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (dimensi_id, urutan),
  CHECK (nilai_min IS NULL OR nilai_max IS NULL OR nilai_max >= nilai_min)
);

CREATE INDEX IF NOT EXISTS idx_param_band_dimensi ON param_band (dimensi_id, urutan);

-- ---------------------------------------------------------------------
-- 4. SEL (nilai rupiah tiap kombinasi band)
--
--    kunci = { "<id dimensi>": "<id band>", ... } satu pasang per sumbu.
--    Memakai jsonb, bukan kolom per sumbu, supaya sumbu baru cukup
--    menambah satu kunci tanpa mengubah struktur tabel. Kombinasi yang
--    tidak punya sel bernilai 0 saat dipakai.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS param_sel (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabel_id    UUID NOT NULL REFERENCES param_tabel(id) ON DELETE CASCADE,
  kunci       JSONB NOT NULL,
  nominal     NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (nominal >= 0),
  UNIQUE (tabel_id, kunci)
);

CREATE INDEX IF NOT EXISTS idx_param_sel_kunci ON param_sel USING GIN (kunci);

-- JSONB tidak bisa memakai foreign key. Kalau sebuah band dihapus, sel yang
-- menunjuknya ikut dihapus di sini, supaya tidak ada sel yatim yang diam-diam
-- masih dipakai.
CREATE OR REPLACE FUNCTION param_band_hapus() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM param_sel
   WHERE kunci ->> OLD.dimensi_id::text = OLD.id::text;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_param_band_hapus ON param_band;
CREATE TRIGGER trg_param_band_hapus
  AFTER DELETE ON param_band
  FOR EACH ROW EXECUTE FUNCTION param_band_hapus();

-- ---------------------------------------------------------------------
-- 5. VERSI YANG BERLAKU UNTUK SEBUAH PERIODE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION param_versi(p_kode TEXT, p_periode DATE)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT t.id FROM param_tabel t
   WHERE t.kode = p_kode AND t.aktif AND t.berlaku_mulai <= p_periode
   ORDER BY t.berlaku_mulai DESC
   LIMIT 1
$$;

-- ---------------------------------------------------------------------
-- 6. DATA AWAL: Insentif Penyelesaian Kontrak Prioritas R2
--
--    Tiga hal yang HARUS dicek setelah kolom API-nya terdaftar:
--      a. param_dimensi.kolom_sumber masih kosong -- isi dengan nama kolom
--         di CRUD Kolom API (bahan kerja, OSP, PD, max overdue).
--      b. Isi nilai_teks band kategori memakai teks PERSIS seperti yang
--         dikirim API, bukan label di tabel.
--      c. Skala PD: band diisi dalam persen (60). Bila kolom API-nya
--         berskala 0-1, ubah batasnya jadi 0,6 (lihat contoh di bawah).
--
--    Contoh bila PD berskala 0-1:
--      UPDATE param_band SET nilai_min = nilai_min / 100, nilai_max = nilai_max / 100
--       WHERE dimensi_id IN (SELECT d.id FROM param_dimensi d
--                              JOIN param_tabel t ON t.id = d.tabel_id
--                             WHERE t.kode = 'insentif_penyelesaian_r2' AND d.kode = 'pd');
--
--    Nilai sel adalah rupiah PER KONTRAK.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_tabel UUID; d_bk UUID; d_osp UUID; d_pd UUID; d_od UUID;
  b_bk UUID[]; b_osp UUID[]; b_pd UUID[]; b_od UUID;
  nilai NUMERIC[][] := ARRAY[
    -- baris = band OSP (4), kolom = PD (<60, >=60); bahan kerja ke-1
    [5000, 10000], [7500, 12500], [10000, 15000], [12500, 17500],
    -- bahan kerja ke-2
    [3000, 7000],  [5500, 9500],  [8000, 12000],  [10500, 14500]
  ];
  i INT; j INT; k INT;
BEGIN
  IF EXISTS (SELECT 1 FROM param_tabel
              WHERE kode = 'insentif_penyelesaian_r2' AND berlaku_mulai = DATE '2026-11-01') THEN
    RETURN;
  END IF;

  INSERT INTO param_tabel (kode, nama, produk, berlaku_mulai, keterangan)
  VALUES ('insentif_penyelesaian_r2', 'Insentif Penyelesaian Kontrak Prioritas R2',
          'R2', DATE '2026-11-01', 'Nilai rupiah per kontrak.')
  RETURNING id INTO v_tabel;

  INSERT INTO param_dimensi (tabel_id, urutan, kode, label, jenis)
  VALUES (v_tabel, 0, 'bahan_kerja', 'Kategori Bahan Kerja', 'kategori') RETURNING id INTO d_bk;
  INSERT INTO param_dimensi (tabel_id, urutan, kode, label, jenis)
  VALUES (v_tabel, 1, 'osp', 'Kategori OSP', 'rentang') RETURNING id INTO d_osp;
  INSERT INTO param_dimensi (tabel_id, urutan, kode, label, jenis)
  VALUES (v_tabel, 2, 'pd', 'Probability of Default', 'rentang') RETURNING id INTO d_pd;
  INSERT INTO param_dimensi (tabel_id, urutan, kode, label, jenis)
  VALUES (v_tabel, 3, 'max_overdue', 'Max Overdue', 'rentang') RETURNING id INTO d_od;

  -- Bahan kerja
  b_bk := ARRAY[gen_random_uuid(), gen_random_uuid()];
  INSERT INTO param_band (id, dimensi_id, urutan, label, nilai_teks) VALUES
    (b_bk[1], d_bk, 0, 'Repeat Roll TT',       ARRAY['Repeat Roll TT']),
    (b_bk[2], d_bk, 1, 'LM Bayar Setelah JT',  ARRAY['LM Bayar Setelah JT']);

  -- OSP (rupiah): <= 4 Jt | > 4 sd 8 Jt | > 8 sd 10 Jt | > 10 Jt
  b_osp := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  INSERT INTO param_band (id, dimensi_id, urutan, label, nilai_min, nilai_max, min_inklusif, max_inklusif) VALUES
    (b_osp[1], d_osp, 0, '<= 4 Jt',        NULL,     4000000,  TRUE,  TRUE),
    (b_osp[2], d_osp, 1, '> 4 Jt sd 8 Jt', 4000000,  8000000,  FALSE, TRUE),
    (b_osp[3], d_osp, 2, '> 8 Jt sd 10 Jt',8000000,  10000000, FALSE, TRUE),
    (b_osp[4], d_osp, 3, '> 10 Jt',        10000000, NULL,     FALSE, TRUE);

  -- Probability of Default (persen): < 60 | >= 60
  b_pd := ARRAY[gen_random_uuid(), gen_random_uuid()];
  INSERT INTO param_band (id, dimensi_id, urutan, label, nilai_min, nilai_max, min_inklusif, max_inklusif) VALUES
    (b_pd[1], d_pd, 0, 'PD < 60%',  NULL, 60,   TRUE, FALSE),
    (b_pd[2], d_pd, 1, 'PD >= 60%', 60,   NULL, TRUE, FALSE);

  -- Max overdue (hari): <= 3. Di atas 3 hari belum punya band, jadi bernilai 0.
  b_od := gen_random_uuid();
  INSERT INTO param_band (id, dimensi_id, urutan, label, nilai_min, nilai_max, min_inklusif, max_inklusif)
  VALUES (b_od, d_od, 0, '<= 3 hari', NULL, 3, TRUE, TRUE);

  -- 2 bahan kerja x 4 OSP x 2 PD x 1 overdue = 16 sel
  FOR i IN 1..2 LOOP
    FOR j IN 1..4 LOOP
      FOR k IN 1..2 LOOP
        INSERT INTO param_sel (tabel_id, kunci, nominal)
        VALUES (v_tabel,
                jsonb_build_object(d_bk::text, b_bk[i], d_osp::text, b_osp[j],
                                   d_pd::text, b_pd[k], d_od::text, b_od),
                nilai[(i - 1) * 4 + j][k]);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
