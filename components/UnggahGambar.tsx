"use client";

import { useRef, useState } from "react";
import Ikon from "./Ikon";

export type Lampiran = { url: string; nama: string; ukuran?: number } | null;

const BATAS = 2 * 1024 * 1024;
/** Sama dengan daftar yang diterima /api/request/lampiran. */
const JENIS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const LABEL_JENIS = ["JPG", "PNG", "WEBP", "GIF"];

type Status =
  | { jenis: "naik"; nama: string; ukuran: number; persen: number }
  | { jenis: "format"; nama: string; ukuran: number }
  | { jenis: "ukuran"; nama: string; ukuran: number }
  | { jenis: "gagal"; nama: string; pesan: string }
  | { jenis: "diganti"; lama: string; baru: string; ukuran: number }
  | null;

function mb(b: number) {
  return b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}
const ekstensi = (n: string) => (n.includes(".") ? n.split(".").pop()!.toUpperCase() : "?");

/**
 * Pemilih satu gambar lampiran, maksimal 2 MB.
 *
 * Ukuran dan jenis diperiksa di sini sebelum berkas dikirim, bukan hanya di
 * server. Alasannya bukan keamanan (server tetap memeriksa ulang, termasuk
 * bita pertama berkasnya), melainkan kesopanan: menolak berkas 8 MB setelah
 * pengguna menunggu unggahannya selesai adalah pemborosan waktu.
 *
 * Unggahan memakai XMLHttpRequest, bukan fetch, karena hanya XHR yang
 * melaporkan kemajuan unggah — itu yang membuat persentase dan tombol
 * "Batalkan" di layar benar-benar mencerminkan keadaan.
 *
 * Hanya satu gambar yang bisa terpasang. Memilih gambar baru menggantikan
 * yang lama, bukan menambahkannya — sesuai batas satu lampiran per pesan.
 *
 * `varian="zona"` menampilkan area seret-lepas (formulir tiket baru);
 * `varian="ringkas"` hanya tombol kecil (kotak balasan percakapan).
 */
export default function UnggahGambar({
  nilai, onUbah, sibuk, varian = "ringkas", onSibukUnggah,
}: {
  nilai: Lampiran;
  onUbah: (l: Lampiran) => void;
  sibuk?: boolean;
  varian?: "ringkas" | "zona";
  /** Diberi tahu saat unggahan mulai/selesai, supaya tombol kirim bisa dikunci. */
  onSibukUnggah?: (naik: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const naik = status?.jenis === "naik";

  function selesaiNaik() {
    xhr.current = null;
    onSibukUnggah?.(false);
    if (input.current) input.current.value = "";
  }

  function pilih(file: File | null) {
    if (!file) return;
    if (input.current) input.current.value = "";

    if (!JENIS.includes(file.type)) {
      setStatus({ jenis: "format", nama: file.name, ukuran: file.size });
      return;
    }
    if (file.size > BATAS) {
      setStatus({ jenis: "ukuran", nama: file.name, ukuran: file.size });
      return;
    }

    const lama = nilai?.nama ?? (status && "nama" in status ? status.nama : null);
    setStatus({ jenis: "naik", nama: file.name, ukuran: file.size, persen: 0 });
    onSibukUnggah?.(true);

    const fd = new FormData();
    fd.append("file", file);
    const r = new XMLHttpRequest();
    xhr.current = r;
    r.open("POST", "/api/request/lampiran");
    r.responseType = "json";
    r.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setStatus({ jenis: "naik", nama: file.name, ukuran: file.size,
                    persen: Math.round((e.loaded / e.total) * 100) });
      }
    };
    r.onload = () => {
      const j = r.response ?? {};
      if (r.status >= 200 && r.status < 300) {
        onUbah({ url: j.url, nama: j.nama ?? file.name, ukuran: j.ukuran ?? file.size });
        setStatus(lama && lama !== file.name
          ? { jenis: "diganti", lama, baru: file.name, ukuran: file.size }
          : null);
      } else {
        setStatus({ jenis: "gagal", nama: file.name, pesan: j.error ?? "Gagal mengunggah gambar." });
      }
      selesaiNaik();
    };
    r.onerror = () => {
      setStatus({ jenis: "gagal", nama: file.name, pesan: "Koneksi terputus saat mengunggah. Coba lagi." });
      selesaiNaik();
    };
    r.onabort = () => { setStatus(null); selesaiNaik(); };
    r.send(fd);
  }

  const bukaPemilih = () => input.current?.click();
  const tolak = status?.jenis === "format" || status?.jenis === "ukuran";

  const kotakStatus = (
    <>
      {status?.jenis === "naik" && (
        <div className="ug-naik" aria-live="polite">
          <div className="ug-naik-atas">
            <span className="ug-berkas-ikon accent"><Ikon nama="upload" ukuran={18} /></span>
            <div className="ug-teks">
              <b>{status.nama}</b>
              <span className="num">
                {ekstensi(status.nama)} · {mb(status.ukuran * status.persen / 100)} dari {mb(status.ukuran)}
              </span>
            </div>
            <span className="ug-persen num">{status.persen}%</span>
            <button type="button" className="btn tint-bad sm" onClick={() => xhr.current?.abort()}>
              Batalkan
            </button>
          </div>
          <div className="ug-bar"><i style={{ width: `${Math.max(4, status.persen)}%` }} /></div>
          <span className="ug-catatan">Mohon tunggu hingga unggahan selesai sebelum mengirim.</span>
        </div>
      )}

      {tolak && status && (
        <div className="ug-tolak" role="alert">
          <span className="ug-berkas-ikon bad"><Ikon nama="file" ukuran={18} /></span>
          <div className="ug-teks">
            <div className="ug-baris">
              <b>{status.nama}</b>
              <span className="ug-lencana bad num">
                {status.jenis === "format"
                  ? `.${ekstensi(status.nama)} ditolak · ${mb(status.ukuran)}`
                  : `${mb(status.ukuran)} · maks. 2 MB`}
              </span>
            </div>
            <p>
              <Ikon nama="alert" ukuran={14} />
              {status.jenis === "format"
                ? `Format .${ekstensi(status.nama).toLowerCase()} tidak didukung. Lampirkan tangkapan layar dalam format ${LABEL_JENIS.join(", ")}.`
                : `Ukuran berkas ${mb(status.ukuran)} melebihi batas 2 MB. Perkecil atau potong gambarnya dulu.`}
            </p>
          </div>
          <div className="ug-aksi">
            <button type="button" className="btn ghost sm" onClick={bukaPemilih}>Ganti berkas</button>
            <button type="button" className="pa-ikon-btn" aria-label="Hapus pemberitahuan" onClick={() => setStatus(null)}>
              <Ikon nama="trash" ukuran={15} />
            </button>
          </div>
        </div>
      )}

      {status?.jenis === "gagal" && (
        <div className="ug-tolak" role="alert">
          <span className="ug-berkas-ikon bad"><Ikon nama="alert" ukuran={18} /></span>
          <div className="ug-teks">
            <b>{status.nama}</b>
            <p>{status.pesan}</p>
          </div>
          <div className="ug-aksi">
            <button type="button" className="btn ghost sm" onClick={bukaPemilih}>Coba lagi</button>
          </div>
        </div>
      )}

      {status?.jenis === "diganti" && nilai && (
        <div className="ug-diganti" role="status">
          <span className="ug-berkas-ikon good"><Ikon nama="checkCircle" ukuran={18} /></span>
          <div className="ug-teks">
            <div className="ug-baris"><b>Berkas berhasil diperbarui</b><span className="ug-lencana good">Berkas diganti</span></div>
            <p>
              <b>{status.lama}</b> diganti dengan <b>{status.baru}</b> ({mb(status.ukuran)}). Berkas valid dan siap dikirim.
            </p>
          </div>
          <button type="button" className="alert-tutup" aria-label="Tutup pemberitahuan" onClick={() => setStatus(null)}>×</button>
        </div>
      )}

      {nilai && !naik && (
        <div className="ug-ada">
          <a href={nilai.url} target="_blank" rel="noopener noreferrer" className="ug-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nilai.url} alt={nilai.nama} />
          </a>
          <div className="ug-teks">
            <b>{nilai.nama}</b>
            <span className="num">{nilai.ukuran ? `${mb(nilai.ukuran)} · ` : ""}Gambar lampiran</span>
          </div>
          <div className="ug-aksi">
            <button type="button" className="btn ghost sm" disabled={sibuk} onClick={bukaPemilih}>Ganti</button>
            <button type="button" className="pa-ikon-btn" disabled={sibuk} aria-label="Hapus gambar"
                    onClick={() => { onUbah(null); setStatus(null); }}>
              <Ikon nama="trash" ukuran={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={"ug " + varian}>
      {varian === "zona" ? (
        <>
          {!nilai && !naik && (
            <button type="button" className={"ug-zona" + (tolak ? " galat" : "")} disabled={sibuk}
                    onClick={bukaPemilih}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); pilih(e.dataTransfer.files?.[0] ?? null); }}>
              <span className={"ug-zona-ikon" + (tolak ? " bad" : "")}><Ikon nama={tolak ? "alert" : "upload"} ukuran={20} /></span>
              <span><b>{tolak ? "Pilih berkas baru" : "Klik untuk unggah"}</b> atau seret tangkapan layar ke sini</span>
              <small>{LABEL_JENIS.join(", ")} · maksimal 2 MB · satu gambar</small>
            </button>
          )}
          {kotakStatus}
          {tolak && (
            <div className="ug-format">
              <span>Format didukung:</span>
              {LABEL_JENIS.map((j) => <code key={j}>{j}</code>)}
            </div>
          )}
        </>
      ) : (
        <>
          {!nilai && !naik && (
            <div className="ug-ringkas-baris">
              <button type="button" className="ug-tombol" disabled={sibuk} onClick={bukaPemilih}>
                <Ikon nama="clip" ukuran={14} /> Lampirkan gambar
              </button>
              <span className="faint small">Satu gambar, maksimal 2 MB ({LABEL_JENIS.slice(0, 2).join(" / ")})</span>
            </div>
          )}
          {kotakStatus}
        </>
      )}

      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
             onChange={(e) => pilih(e.target.files?.[0] ?? null)} />
    </div>
  );
}
