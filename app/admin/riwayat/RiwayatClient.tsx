"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Ikon from "@/components/Ikon";
import KotakCari from "@/components/KotakCari";
import Pilih from "@/components/Pilih";
import RollbackButton from "./RollbackButton";
import HapusButton from "./HapusButton";

export type BarisBatch = {
  id: string;
  periode: string;
  tipe: string;
  status: string;
  namaFile: string;
  blobUrl: string;
  total: number;
  valid: number;
  warning: number;
  ditolak: number;
  diunggah: string;
  pengunggah: string;
};

const TIPE: Record<string, { label: string; nada: string }> = {
  kpi:         { label: "Data KPI",      nada: "info" },
  insentif:    { label: "Data insentif", nada: "accent" },
  od_movement: { label: "OD movement",   nada: "netral" },
  cp:          { label: "CP",            nada: "netral" },
};

const STATUS: Record<string, { label: string; nada: string }> = {
  published:  { label: "Aktif",       nada: "good" },
  validated:  { label: "Siap terbit", nada: "accent" },
  draft:      { label: "Draf",        nada: "netral" },
  superseded: { label: "Digantikan",  nada: "warn" },
  failed:     { label: "Gagal",       nada: "bad" },
};

const PER = 10;
const fmt = (n: number) => n.toLocaleString("id-ID");

export default function RiwayatClient({ baris }: { baris: BarisBatch[] }) {
  const router = useRouter();
  const [cari, setCari] = useState("");
  const [tipe, setTipe] = useState("");
  const [status, setStatus] = useState("");
  const [hal, setHal] = useState(0);

  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return baris.filter((b) =>
      (!tipe || b.tipe === tipe) &&
      (!status || b.status === status) &&
      (!k || [b.namaFile, b.periode, b.pengunggah].some((t) => t.toLowerCase().includes(k))));
  }, [baris, cari, tipe, status]);

  const totalHal = Math.max(1, Math.ceil(tampil.length / PER));
  const halIni = Math.min(hal, totalHal - 1);
  const potong = tampil.slice(halIni * PER, halIni * PER + PER);
  const ubah = <T,>(set: (v: T) => void) => (v: T) => { set(v); setHal(0); };

  return (
    <section className="card pa-tabel-kartu ri-kartu">
      <div className="pa-alat">
        <div className="pa-alat-cari">
          <KotakCari nilai={cari} onUbah={ubah(setCari)} lebar={420}
                     placeholder="Cari nama berkas, periode, atau pengunggah…" />
        </div>
        <div className="ri-saring">
          <Pilih nilai={tipe} onPilih={ubah(setTipe)} cari={false}
                 opsi={[{ nilai: "", label: "Semua kategori" },
                        ...Object.entries(TIPE).filter(([k]) => baris.some((b) => b.tipe === k))
                          .map(([k, v]) => ({ nilai: k, label: v.label }))]} />
          <Pilih nilai={status} onPilih={ubah(setStatus)} cari={false}
                 opsi={[{ nilai: "", label: "Semua status" },
                        ...Object.entries(STATUS).map(([k, v]) => ({ nilai: k, label: v.label }))]} />
        </div>
        <div className="ri-alat-kanan">
          <span className="faint">Menampilkan {fmt(tampil.length)} berkas</span>
          <button className="btn ghost sm" onClick={() => router.refresh()} title="Muat ulang data">
            <Ikon nama="refresh" ukuran={14} /> Segarkan
          </button>
        </div>
      </div>

      <div className="tabel-scroll">
        <table className="pa-tabel ri-tabel">
          <thead>
            <tr>
              <th>Periode</th><th>Berkas</th><th>Hasil pemeriksaan</th>
              <th>Status</th><th className="r">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {potong.map((b) => {
              const tp = TIPE[b.tipe] ?? { label: b.tipe, nada: "netral" };
              const st = STATUS[b.status] ?? { label: b.status, nada: "netral" };
              return (
                <tr key={b.id} className={b.status === "published" ? "ri-aktif" : undefined}>
                  <td>
                    <div className="ri-periode">{b.periode}</div>
                    <span className={"ri-tipe " + tp.nada}>{tp.label}</span>
                  </td>
                  <td>
                    <div className="ri-berkas">
                      <span className="ri-xls" aria-hidden>XLS</span>
                      <div className="ri-berkas-teks">
                        <span className="ri-nama" title={b.namaFile}>{b.namaFile}</span>
                        <span className="pa-sub">{b.diunggah} · {b.pengunggah}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="ri-tally">
                      <span className={"ri-t good" + (b.valid ? "" : " nol")}><b className="num">{fmt(b.valid)}</b> siap</span>
                      <span className={"ri-t warn" + (b.warning ? "" : " nol")}><i /><b className="num">{fmt(b.warning)}</b> dicek</span>
                      <span className={"ri-t bad" + (b.ditolak ? "" : " nol")}><i /><b className="num">{fmt(b.ditolak)}</b> ditolak</span>
                    </div>
                  </td>
                  <td>
                    {st.nada === "accent" || st.nada === "netral"
                      ? <span className={"ri-status " + st.nada}>{st.label}</span>
                      : <span className={"pa-status " + st.nada}>{st.label}</span>}
                  </td>
                  <td className="r">
                    <div className="ri-aksi">
                      {b.status === "superseded" && <RollbackButton batchId={b.id} periode={b.periode} />}
                      {b.status === "draft" && (
                        <Link className="btn tint sm" href="/admin/import">Lanjutkan</Link>
                      )}
                      <a className="btn ghost sm" href={b.blobUrl} download title="Unduh berkas Excel asli">
                        <Ikon nama="download" ukuran={14} /> Unduh
                      </a>
                      {/* Batch yang sedang terbit dilindungi: menghapusnya
                          akan mengosongkan layar seluruh karyawan. */}
                      {b.status !== "published" && (
                        <HapusButton batchId={b.id} periode={b.periode} namaFile={b.namaFile} baris={b.valid} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!potong.length && (
              <tr><td colSpan={5} className="empty">
                {baris.length
                  ? "Tidak ada berkas yang cocok dengan pencarian atau saringan."
                  : "Belum ada berkas yang diunggah. Mulai dari tombol Unggah berkas baru."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pa-pager">
        <span className="faint">
          {tampil.length
            ? <>Menampilkan <b>{halIni * PER + 1}–{Math.min(halIni * PER + PER, tampil.length)}</b> dari <b>{fmt(tampil.length)}</b> berkas impor</>
            : "Tidak ada data"}
        </span>
        {totalHal > 1 && (
          <div className="pa-pager-btn">
            <button className="btn ghost sm" disabled={halIni === 0} onClick={() => setHal(halIni - 1)}>← Sebelumnya</button>
            {Array.from({ length: totalHal }, (_, i) => (
              <button key={i} className={"pa-hal num" + (i === halIni ? " on" : "")}
                      aria-current={i === halIni ? "page" : undefined}
                      onClick={() => setHal(i)}>{i + 1}</button>
            ))}
            <button className="btn ghost sm" disabled={halIni >= totalHal - 1} onClick={() => setHal(halIni + 1)}>Berikutnya →</button>
          </div>
        )}
      </div>
    </section>
  );
}
