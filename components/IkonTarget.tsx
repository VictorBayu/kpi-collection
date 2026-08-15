/**
 * Lambang aplikasi: papan target dengan anak panah menancap di pusat.
 *
 * Dipilih karena langsung terbaca sebagai "pencapaian terhadap sasaran" —
 * persis yang diukur aplikasi ini — dan tetap jelas pada ukuran kecil di
 * bilah atas. Lingkarannya sengaja hanya tiga, mengikuti tingkat KPI 3, 4,
 * dan 5 yang dipakai perusahaan.
 *
 * Digambar sebagai SVG, bukan berkas gambar, supaya tetap tajam di layar
 * beresolusi tinggi dan warnanya bisa mengikuti tema.
 */
export default function IkonTarget({
  ukuran = 20, className,
}: { ukuran?: number; className?: string }) {
  return (
    <svg
      width={ukuran} height={ukuran} viewBox="0 0 24 24"
      fill="none" className={className} aria-hidden focusable="false"
    >
      {/* tiga lingkaran target */}
      <circle cx="11" cy="13" r="8.2" stroke="currentColor" strokeWidth="1.7" opacity=".45" />
      <circle cx="11" cy="13" r="4.9" stroke="currentColor" strokeWidth="1.7" opacity=".75" />
      <circle cx="11" cy="13" r="1.7" fill="currentColor" />
      {/* anak panah menancap dari kanan atas */}
      <path
        d="M11 13 L20.4 3.6" stroke="currentColor" strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M16.9 3.2 L20.8 3.2 L20.8 7.1" stroke="currentColor" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
