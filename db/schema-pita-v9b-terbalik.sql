-- ---------------------------------------------------------------------
-- PITA v9b — dukung indikator terbalik (skor menurun)
--
-- Sebagian indikator makin kecil nilainya makin bagus (mis. Repeat Roll,
-- Delinquency, NPL): pita-nya menurun — skor di batas bawah lebih tinggi
-- daripada di batas atas. Constraint lama `poin_max >= poin_min` menolak
-- pola ini dan membuat simpan gagal dengan galat 500, padahal datanya sah.
--
-- Kolom poin_min/poin_max sebenarnya berarti "skor di nilai_min" dan "skor
-- di nilai_max" — bukan skor terkecil/terbesar. Jadi arahnya boleh naik
-- maupun turun. Fungsi interpolasi (poin_dari_pita) sudah menangani kedua
-- arah dengan benar, jadi yang perlu diperbaiki hanya aturannya.
--
-- Constraint arah diganti dengan batas nalar: skor tetap harus berada di
-- rentang KPI 0–5, sehingga salah ketik (mis. 50 alih-alih 5) tetap
-- tertangkap, tanpa memaksakan arah tertentu.
-- ---------------------------------------------------------------------

ALTER TABLE indikator_pita DROP CONSTRAINT IF EXISTS ck_pita_poin;

ALTER TABLE indikator_pita DROP CONSTRAINT IF EXISTS ck_pita_rentang;
ALTER TABLE indikator_pita ADD CONSTRAINT ck_pita_rentang
  CHECK (poin_min BETWEEN 0 AND 5 AND poin_max BETWEEN 0 AND 5);
