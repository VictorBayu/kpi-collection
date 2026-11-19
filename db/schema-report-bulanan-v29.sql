-- =====================================================================
-- v29 — MENU REPORT BULANAN
--
-- Tidak ada tabel baru. Menu ini hanya membaca/mengekspor/menghapus baris
-- kpi_row dan insentif_row ber-sumber 'api' per periode. Yang dimigrasikan
-- cuma hak akses menunya (daftar menu sendiri ada di lib/menu.ts).
--
-- Aman dijalankan berulang.
-- =====================================================================

INSERT INTO peran_menu (peran_kode, menu_kode)
SELECT 'admin', 'admin_report_bulanan'
 WHERE EXISTS (SELECT 1 FROM peran WHERE kode = 'admin')
ON CONFLICT DO NOTHING;

-- Ringkasan per periode mengelompokkan (periode, sumber). Indeks ini
-- sudah ada sejak v5/v8; ditulis ulang sebagai jaring pengaman.
CREATE INDEX IF NOT EXISTS idx_kpi_sumber      ON kpi_row      (periode, sumber);
CREATE INDEX IF NOT EXISTS idx_insentif_sumber ON insentif_row (periode, sumber);
