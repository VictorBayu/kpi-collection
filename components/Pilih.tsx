"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type OpsiPilih = {
  nilai: string;
  label: string;
  ket?: string;        // baris kecil di bawah label
  grup?: string;       // judul pemisah
};

type Props = {
  opsi: OpsiPilih[];
  nilai: string;
  onPilih: (v: string) => void;
  placeholder?: string;
  /** Boleh mengetik nilai yang tidak ada di daftar (untuk jabatan baru). */
  bebas?: boolean;
  /** Tampilkan kotak pencarian. Otomatis aktif bila opsi > 7. */
  cari?: boolean;
  id?: string;
  required?: boolean;
};

/**
 * Dropdown pengganti <select> dan <datalist>.
 *
 * Alasan tidak memakai bawaan browser: <datalist> tidak bisa menampilkan
 * keterangan tambahan dan tampilannya berbeda-beda di tiap browser,
 * sedangkan <select> tidak bisa dicari. Di daftar jabatan yang panjang,
 * keduanya membuat admin harus menggulir lama.
 *
 * Papan ketik: ↑ ↓ berpindah, Enter memilih, Esc menutup.
 */
export default function Pilih({
  opsi, nilai, onPilih, placeholder = "Pilih…",
  bebas = false, cari, id, required,
}: Props) {
  const [buka, setBuka] = useState(false);
  const [kata, setKata] = useState("");
  const [sorot, setSorot] = useState(0);
  const bungkus = useRef<HTMLDivElement>(null);
  const kotakCari = useRef<HTMLInputElement>(null);

  const pakaiCari = cari ?? opsi.length > 7;
  const terpilih = opsi.find((o) => o.nilai === nilai);

  const hasil = useMemo(() => {
    const k = kata.trim().toLowerCase();
    if (!k) return opsi;
    return opsi.filter((o) =>
      o.label.toLowerCase().includes(k) || o.ket?.toLowerCase().includes(k));
  }, [opsi, kata]);

  // Tutup saat mengklik di luar
  useEffect(() => {
    if (!buka) return;
    const klik = (e: MouseEvent) => {
      if (bungkus.current && !bungkus.current.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener("mousedown", klik);
    return () => document.removeEventListener("mousedown", klik);
  }, [buka]);

  useEffect(() => {
    if (buka) { setSorot(0); setTimeout(() => kotakCari.current?.focus(), 10); }
    else setKata("");
  }, [buka]);

  function pilih(v: string) {
    onPilih(v);
    setBuka(false);
  }

  function tombol(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setBuka(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!buka) { setBuka(true); return; }
      setSorot((s) => {
        const n = e.key === "ArrowDown" ? s + 1 : s - 1;
        return Math.max(0, Math.min(hasil.length - 1, n));
      });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!buka) { setBuka(true); return; }
      if (hasil[sorot]) pilih(hasil[sorot].nilai);
      else if (bebas && kata.trim()) pilih(kata.trim());
    }
  }

  let grupTerakhir: string | undefined;

  return (
    <div className={"pilih" + (buka ? " buka" : "")} ref={bungkus}>
      <button type="button" id={id} className="pilih-tombol" onClick={() => setBuka(!buka)}
              onKeyDown={tombol} aria-haspopup="listbox" aria-expanded={buka}>
        <span className={terpilih || nilai ? "pilih-nilai" : "pilih-kosong"}>
          {terpilih?.label ?? nilai ?? ""}
          {!terpilih && !nilai && placeholder}
        </span>
        {terpilih?.ket && <span className="pilih-ket">{terpilih.ket}</span>}
        <span className="pilih-panah" aria-hidden>▾</span>
      </button>

      {/* Nilai asli disimpan di input tersembunyi agar validasi form tetap jalan */}
      <input type="text" tabIndex={-1} required={required} value={nilai} readOnly
             className="pilih-bayangan" onChange={() => {}} aria-hidden />

      {buka && (
        <div className="pilih-panel" role="listbox">
          {pakaiCari && (
            <div className="pilih-cari">
              <input ref={kotakCari} value={kata} placeholder="Ketik untuk mencari…"
                     onChange={(e) => { setKata(e.target.value); setSorot(0); }}
                     onKeyDown={tombol} />
            </div>
          )}

          <div className="pilih-daftar">
            {hasil.map((o, i) => {
              const grupBaru = o.grup && o.grup !== grupTerakhir;
              grupTerakhir = o.grup;
              return (
                <div key={o.nilai}>
                  {grupBaru && <div className="pilih-grup">{o.grup}</div>}
                  <button type="button" role="option" aria-selected={o.nilai === nilai}
                          className={"pilih-opsi"
                            + (i === sorot ? " sorot" : "")
                            + (o.nilai === nilai ? " aktif" : "")}
                          onMouseEnter={() => setSorot(i)}
                          onClick={() => pilih(o.nilai)}>
                    <span className="pilih-opsi-label">{o.label}</span>
                    {o.ket && <span className="pilih-opsi-ket">{o.ket}</span>}
                    {o.nilai === nilai && <span className="pilih-centang">✓</span>}
                  </button>
                </div>
              );
            })}

            {!hasil.length && !bebas && (
              <div className="pilih-nihil">Tidak ada yang cocok.</div>
            )}
            {!hasil.length && bebas && kata.trim() && (
              <button type="button" className="pilih-opsi pilih-baru"
                      onClick={() => pilih(kata.trim())}>
                Pakai “<b>{kata.trim().toUpperCase()}</b>” sebagai nilai baru
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
