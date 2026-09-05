"use client";

import { useRef, useState } from "react";

export type Lampiran = { url: string; nama: string } | null;

const BATAS = 2 * 1024 * 1024;

/**
 * Pemilih satu gambar lampiran, maksimal 2 MB.
 *
 * Ukuran diperiksa di sini sebelum berkas dikirim, bukan hanya di server.
 * Alasannya bukan keamanan (server tetap memeriksa ulang), melainkan
 * kesopanan: menolak berkas 8 MB setelah pengguna menunggu unggahannya
 * selesai adalah pemborosan waktu yang bisa dihindari sepenuhnya.
 *
 * Hanya satu gambar yang bisa terpasang. Memilih gambar baru menggantikan
 * yang lama, bukan menambahkannya — sesuai batas satu lampiran per pesan.
 */
export default function UnggahGambar({
  nilai, onUbah, sibuk,
}: {
  nilai: Lampiran;
  onUbah: (l: Lampiran) => void;
  sibuk?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [naik, setNaik] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function pilih(file: File | null) {
    setGalat(null);
    if (!file) return;

    if (file.size > BATAS) {
      setGalat(`Ukuran ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 2 MB.`);
      if (input.current) input.current.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      setGalat("Hanya berkas gambar yang bisa dilampirkan.");
      if (input.current) input.current.value = "";
      return;
    }

    setNaik(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/request/lampiran", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(j.error ?? "Gagal mengunggah gambar."); return; }
      onUbah({ url: j.url, nama: j.nama });
    } finally {
      setNaik(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="lampiran">
      {nilai ? (
        <div className="lampiran-ada">
          <a href={nilai.url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nilai.url} alt={nilai.nama} className="lampiran-pratinjau" />
          </a>
          <div className="lampiran-info">
            <b>{nilai.nama}</b>
            <button type="button" className="btn ghost sm" disabled={sibuk}
                    onClick={() => onUbah(null)}>Hapus gambar</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="btn ghost sm" disabled={sibuk || naik}
                  onClick={() => input.current?.click()}>
            {naik ? "Mengunggah…" : "+ Lampirkan gambar"}
          </button>
          <span className="faint small">Satu gambar, maksimal 2 MB.</span>
        </>
      )}

      <input ref={input} type="file" accept="image/*" hidden
             onChange={(e) => pilih(e.target.files?.[0] ?? null)} />

      {galat && <p className="lampiran-galat">{galat}</p>}
    </div>
  );
}
