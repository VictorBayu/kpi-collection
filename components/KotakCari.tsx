"use client";

/**
 * Kotak pencarian dengan ikon dan tombol bersihkan.
 *
 * Sebelumnya tiap halaman memakai <input> polos, yang menyisakan dua
 * masalah kecil tapi berulang: tidak ada tanda visual bahwa itu kotak
 * pencarian (mudah tertukar dengan isian biasa di sebelahnya), dan tidak
 * ada cara cepat mengosongkannya selain menyeleksi lalu menghapus manual —
 * padahal mengosongkan pencarian adalah hal yang paling sering dilakukan
 * setelah mencari.
 */
export default function KotakCari({
  nilai, onUbah, onCari, placeholder = "Cari…", lebar = 300,
}: {
  nilai: string;
  onUbah: (v: string) => void;
  /** Dipanggil saat Enter ditekan atau isian dikosongkan. */
  onCari?: () => void;
  placeholder?: string;
  lebar?: number;
}) {
  return (
    <div className="kcari" style={{ maxWidth: lebar }}>
      <span className="kcari-ikon" aria-hidden>⌕</span>
      <input
        value={nilai}
        placeholder={placeholder}
        onChange={(e) => onUbah(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onCari?.(); }}
      />
      {nilai && (
        <button className="kcari-x" title="Bersihkan pencarian"
                onClick={() => { onUbah(""); onCari?.(); }}>×</button>
      )}
    </div>
  );
}
