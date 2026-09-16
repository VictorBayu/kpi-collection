"use client";

import Ikon from "@/components/Ikon";

/**
 * "Ekspor laporan" pada kepala dasbor.
 *
 * Diekspor lewat dialog cetak peramban (Simpan sebagai PDF), bukan berkas
 * yang dirakit server: grafik amCharts sudah tergambar di layar, dan
 * merakit ulang semuanya di server hanya menghasilkan salinan kedua yang
 * bisa berbeda dari yang sedang dilihat pembaca.
 */
export default function TombolCetak() {
  return (
    <button type="button" className="btn primary" onClick={() => window.print()}>
      <Ikon nama="download" ukuran={16} /> Ekspor laporan
    </button>
  );
}
