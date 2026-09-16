"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Ikon from "@/components/Ikon";
import KotakCari from "@/components/KotakCari";
import Pilih from "@/components/Pilih";
import { KartuMetrik } from "@/components/JudulHalaman";

type Cabang = {
  cabang: string; area: string; skorRata: number; orang: number; bawah: number;
  skorLalu: number | null; tren: number | null; tipis: boolean;
};

/**
 * Pita status. Sengaja memakai ambang skor yang sama dengan seluruh
 * aplikasi (KPI 3 sebagai garis bawah), ditambah satu pita peringatan
 * tepat di atasnya: cabang yang rata-ratanya baru saja lolos biasanya
 * masih menyimpan banyak orang di bawah garis.
 */
const BATAS_KRITIS = 3;
const BATAS_AMAN = 3.5;
type Status = "kritis" | "waspada" | "stabil";
const statusDari = (skor: number): Status =>
  skor < BATAS_KRITIS ? "kritis" : skor < BATAS_AMAN ? "waspada" : "stabil";
const LABEL: Record<Status, string> = { kritis: "Audit segera", waspada: "Peringatan", stabil: "Stabil" };
const NADA: Record<Status, string> = { kritis: "bad", waspada: "warn", stabil: "good" };

const koma = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const persen = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export default function PrioritasClient({ cabang, periode }: { cabang: Cabang[]; periode: string }) {
  const [saringStatus, setSaringStatus] = useState<"" | Status>("");
  const [cari, setCari] = useState("");
  const [area, setArea] = useState("");
  const [urut, setUrut] = useState("skor");
  const [per, setPer] = useState("15");
  const [hal, setHal] = useState(0);

  // Peringkat ditetapkan sekali dari urutan skor terendah, bukan dari
  // urutan tampilan — supaya "#03" tetap berarti hal yang sama saat
  // penyaring atau urutan diganti.
  const berperingkat = useMemo(
    () => cabang.map((c, i) => ({ ...c, peringkat: i + 1, status: statusDari(c.skorRata) })),
    [cabang]);

  const jumlah = (s: Status) => berperingkat.filter((c) => c.status === s).length;
  const daftarArea = useMemo(() => Array.from(new Set(cabang.map((c) => c.area))).sort(), [cabang]);
  const totalOrang = cabang.reduce((a, c) => a + c.orang, 0);
  const totalBawah = cabang.reduce((a, c) => a + c.bawah, 0);
  const adaTren = cabang.some((c) => c.tren !== null);

  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    const hasil = berperingkat.filter((c) =>
      (!saringStatus || c.status === saringStatus) &&
      (!area || c.area === area) &&
      (!k || c.cabang.toLowerCase().includes(k) || c.area.toLowerCase().includes(k)));
    const salin = hasil.slice();
    if (urut === "bawah") salin.sort((a, b) => b.bawah - a.bawah || a.skorRata - b.skorRata);
    else if (urut === "porsi") salin.sort((a, b) => persen(b.bawah, b.orang) - persen(a.bawah, a.orang) || a.skorRata - b.skorRata);
    else if (urut === "turun") salin.sort((a, b) => (a.tren ?? 0) - (b.tren ?? 0));
    else if (urut === "orang") salin.sort((a, b) => b.orang - a.orang);
    else if (urut === "nama") salin.sort((a, b) => a.cabang.localeCompare(b.cabang, "id"));
    return salin;
  }, [berperingkat, saringStatus, area, cari, urut]);

  const PER = per === "semua" ? Math.max(1, tampil.length) : Number(per);
  const totalHal = Math.max(1, Math.ceil(tampil.length / PER));
  const halIni = Math.min(hal, totalHal - 1);
  const potong = tampil.slice(halIni * PER, halIni * PER + PER);
  const ubah = <T,>(set: (v: T) => void) => (v: T) => { set(v); setHal(0); };
  const nomorHal = Array.from(new Set([0, halIni - 1, halIni, halIni + 1, totalHal - 1]))
    .filter((i) => i >= 0 && i < totalHal).sort((a, b) => a - b);
  const alihStatus = (v: Status) => { setSaringStatus(saringStatus === v ? "" : v); setHal(0); };
  const adaSaring = !!(saringStatus || cari || area || urut !== "skor");

  /** Ekspor apa yang sedang tersaring, supaya daftar kunjungan bisa dibagikan. */
  function ekspor() {
    const kepala = ["Peringkat", "Cabang", "Area", "Karyawan dinilai", "Di bawah KPI 3", "Porsi (%)",
                    "Skor rata-rata", "Skor bulan lalu", "Perubahan", "Status"];
    const esc = (v: unknown) => {
      const t = v === null || v === undefined ? "" : String(v);
      return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const baris = tampil.map((c) => [
      c.peringkat, c.cabang, c.area, c.orang, c.bawah, koma(persen(c.bawah, c.orang), 1),
      koma(c.skorRata), c.skorLalu === null ? "" : koma(c.skorLalu), c.tren === null ? "" : koma(c.tren), LABEL[c.status],
    ]);
    // Titik koma + BOM: dibuka Excel berlocale Indonesia langsung rapi per kolom.
    const isi = "﻿" + [kepala, ...baris].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([isi], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `prioritas-pemulihan-${periode}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="km-grid">
        <KartuMetrik label="Cakupan evaluasi" nilai={cabang.length} satuan="cabang"
                     catatan={`${daftarArea.length} area · ${totalOrang.toLocaleString("id-ID")} karyawan`}
                     ikon={<Ikon nama="building" ukuran={20} />} nada="accent" />
        <div role="button" tabIndex={0} aria-pressed={saringStatus === "kritis"} className={"pp-status bad" + (saringStatus === "kritis" ? " on" : "")} onClick={() => alihStatus("kritis")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alihStatus("kritis"); } }}>
          <KartuMetrik label="Audit segera" nilai={jumlah("kritis")} satuan="cabang"
                       catatan={`Skor rata-rata < ${koma(BATAS_KRITIS, 1)}`}
                       lencana={{ teks: `${koma(persen(jumlah("kritis"), cabang.length), 1)}%`, nada: "bad" }}
                       ikon={<Ikon nama="alert" ukuran={20} />} nada="bad" />
        </div>
        <div role="button" tabIndex={0} aria-pressed={saringStatus === "waspada"} className={"pp-status warn" + (saringStatus === "waspada" ? " on" : "")} onClick={() => alihStatus("waspada")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alihStatus("waspada"); } }}>
          <KartuMetrik label="Peringatan" nilai={jumlah("waspada")} satuan="cabang"
                       catatan={`Skor ${koma(BATAS_KRITIS, 1)} – ${koma(BATAS_AMAN - 0.01)}`}
                       lencana={{ teks: `${koma(persen(jumlah("waspada"), cabang.length), 1)}%`, nada: "warn" }}
                       ikon={<Ikon nama="trendDown" ukuran={20} />} nada="warn" />
        </div>
        <div role="button" tabIndex={0} aria-pressed={saringStatus === "stabil"} className={"pp-status good" + (saringStatus === "stabil" ? " on" : "")} onClick={() => alihStatus("stabil")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alihStatus("stabil"); } }}>
          <KartuMetrik label="Stabil" nilai={jumlah("stabil")} satuan="cabang"
                       catatan={`Skor rata-rata ≥ ${koma(BATAS_AMAN, 1)}`}
                       lencana={{ teks: `${koma(persen(jumlah("stabil"), cabang.length), 1)}%`, nada: "good" }}
                       ikon={<Ikon nama="checkCircle" ukuran={20} />} nada="good" />
        </div>
      </div>

      {jumlah("kritis") > 0 && (
        <div className="pp-eskalasi">
          <span className="sd-ikon"><Ikon nama="alert" ukuran={18} /></span>
          <div className="tr-info-teks">
            <b>{jumlah("kritis")} cabang di bawah KPI 3 perlu ditindaklanjuti</b>
            <p>
              Bersama-sama memuat {berperingkat.filter((c) => c.status === "kritis").reduce((a, c) => a + c.bawah, 0).toLocaleString("id-ID")} karyawan
              di bawah KPI 3 dari total {totalBawah.toLocaleString("id-ID")} secara nasional.
            </p>
          </div>
          {saringStatus !== "kritis" && (
            <button className="btn sm" onClick={() => ubah(setSaringStatus)("kritis")}>Tampilkan yang kritis</button>
          )}
        </div>
      )}

      <section className="card pa-tabel-kartu">
        <div className="tr-pil" role="tablist" aria-label="Saring status">
          {([["", "Semua cabang", cabang.length], ["kritis", "Audit segera", jumlah("kritis")],
             ["waspada", "Peringatan", jumlah("waspada")], ["stabil", "Stabil", jumlah("stabil")]] as const).map(([v, t, n]) => (
            <button key={v} role="tab" aria-selected={saringStatus === v}
                    className={(saringStatus === v ? "on " : "") + "pp-pil-" + (v || "semua")}
                    onClick={() => ubah(setSaringStatus)(v)}>
              {v && <i aria-hidden />}{t} <span className="num">{n}</span>
            </button>
          ))}
          <label className="pp-per">
            <span>Tampilkan</span>
            <Pilih nilai={per} cari={false} onPilih={ubah(setPer)}
                   opsi={[{ nilai: "15", label: "15 / halaman" }, { nilai: "30", label: "30 / halaman" },
                          { nilai: "semua", label: `Semua (${tampil.length})` }]} />
          </label>
        </div>
        <div className="pa-alat">
          <div className="pa-alat-cari">
            <KotakCari nilai={cari} onUbah={ubah(setCari)} lebar={380} placeholder="Cari nama cabang atau area…" />
          </div>
          <div className="ri-saring pp-saring">
            <Pilih nilai={area} cari={daftarArea.length > 7} onPilih={ubah(setArea)}
                   opsi={[{ nilai: "", label: `Semua area (${daftarArea.length})` }, ...daftarArea.map((a) => ({ nilai: a, label: a }))]} />
            <Pilih nilai={urut} cari={false} onPilih={ubah(setUrut)}
                   opsi={[
                     { nilai: "skor", label: "Urut: skor terendah" },
                     { nilai: "bawah", label: "Urut: < KPI 3 terbanyak" },
                     { nilai: "porsi", label: "Urut: porsi < KPI 3 terbesar" },
                     ...(adaTren ? [{ nilai: "turun", label: "Urut: penurunan terbesar" }] : []),
                     { nilai: "orang", label: "Urut: karyawan terbanyak" },
                     { nilai: "nama", label: "Urut: nama cabang (A–Z)" },
                   ]} />
          </div>
          <div className="ri-alat-kanan">
            {adaSaring && (
              <button className="btn polos sm" title="Atur ulang penyaring"
                      onClick={() => { setSaringStatus(""); setCari(""); setArea(""); setUrut("skor"); setHal(0); }}>
                <Ikon nama="refresh" ukuran={14} /> Atur ulang
              </button>
            )}
            <button className="btn ghost sm" onClick={ekspor} disabled={!tampil.length}>
              <Ikon nama="download" ukuran={14} /> Ekspor CSV
            </button>
          </div>
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel pp-tabel">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Rank</th>
                <th>Cabang</th>
                <th>Area</th>
                <th className="r">Dinilai</th>
                <th style={{ width: 200 }}>Karyawan &lt; KPI 3</th>
                <th className="r">Skor rata-rata</th>
                {adaTren && <th className="r">vs bln lalu</th>}
                <th>Status</th>
                <th className="r" style={{ width: 64 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {potong.map((c) => {
                const porsi = persen(c.bawah, c.orang);
                const deviasi = c.skorRata - BATAS_KRITIS;
                return (
                  <tr key={c.cabang} className={"pp-" + c.status}>
                    <td className="num pp-rank">#{String(c.peringkat).padStart(2, "0")}</td>
                    <td>
                      <div className="pp-cabang">{c.cabang}</div>
                      {c.tipis && <div className="pa-sub" title="Kurang dari tiga karyawan — rata-ratanya mudah berayun">data tipis</div>}
                    </td>
                    <td><span className="mh-level">{c.area}</span></td>
                    <td className="r num">{c.orang.toLocaleString("id-ID")}</td>
                    <td>
                      <div className="pp-porsi">
                        <div className="pp-porsi-atas num">
                          <b>{c.bawah} / {c.orang}</b>
                          <span className={porsi >= 50 ? "teks-bad" : ""}>{koma(porsi, 1)}%</span>
                        </div>
                        <span className="rk-m-bar"><i className={porsi >= 50 ? "bad" : porsi > 0 ? "" : "good"} style={{ width: Math.max(porsi, c.bawah ? 3 : 0) + "%" }} /></span>
                      </div>
                    </td>
                    <td className="r">
                      <div className={"pp-skor num " + NADA[c.status]}>{koma(c.skorRata)}</div>
                      <div className={"pp-deviasi num" + (deviasi < 0 ? " teks-bad" : "")}>{deviasi >= 0 ? "+" : ""}{koma(deviasi)} dari KPI 3</div>
                    </td>
                    {adaTren && (
                      <td className="r num">
                        {c.tren === null
                          ? <span className="faint">baru</span>
                          : <span className={"pp-tren " + (c.tren > 0 ? "naik" : c.tren < 0 ? "turun" : "tetap")}>
                              {c.tren > 0 ? "▲" : c.tren < 0 ? "▼" : "•"} {c.tren > 0 ? "+" : ""}{koma(c.tren)}
                            </span>}
                      </td>
                    )}
                    <td><span className={"pa-status " + NADA[c.status]}>{LABEL[c.status]}</span></td>
                    <td className="r">
                      <Link className="pa-ikon-btn pp-lihat" href={`/admin/kpi?periode=${periode}&cabang=${encodeURIComponent(c.cabang)}`}
                            title={`Lihat karyawan ${c.cabang}`}>
                        <Ikon nama="eye" ukuran={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!potong.length && (
                <tr><td colSpan={adaTren ? 9 : 8} className="empty">
                  {cabang.length ? "Tidak ada cabang yang cocok dengan penyaring." : "Belum ada data KPI cabang pada periode ini."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pa-pager">
          <span className="faint">
            {tampil.length
              ? <>Menampilkan <b>{halIni * PER + 1}–{Math.min(halIni * PER + PER, tampil.length)}</b> dari <b>{tampil.length}</b> cabang</>
              : "Tidak ada data"}
          </span>
          {totalHal > 1 && (
            <div className="pa-pager-btn">
              <button className="btn ghost sm" disabled={halIni === 0} onClick={() => setHal(halIni - 1)}>← Sebelumnya</button>
              {nomorHal.map((i, idx) => (
                <span key={i} className="pa-hal-wrap">
                  {idx > 0 && i - nomorHal[idx - 1] > 1 && <span className="pa-elipsis">…</span>}
                  <button className={"pa-hal num" + (i === halIni ? " on" : "")} aria-current={i === halIni ? "page" : undefined}
                          onClick={() => setHal(i)}>{i + 1}</button>
                </span>
              ))}
              <button className="btn ghost sm" disabled={halIni >= totalHal - 1} onClick={() => setHal(halIni + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      </section>

      <p className="pa-catatan">
        <Ikon nama="bulb" ukuran={16} />
        <span>
          Skor rata-rata dihitung dari total skor tertimbang tiap karyawan. Peringkat tetap mengikuti skor terendah walau urutan
          tabel diganti. Cabang dengan kurang dari tiga karyawan ditandai “data tipis”.
        </span>
      </p>
    </>
  );
}
