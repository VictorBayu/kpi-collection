"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { namaPeriode } from "@/lib/format";
import JudulHalaman, { KartuMetrik } from "@/components/JudulHalaman";
import Ikon from "@/components/Ikon";
import type { RingkasanPeriode } from "@/lib/report-bulanan";

const NF = new Intl.NumberFormat("id-ID");

type Jenis = "kpi" | "insentif" | "semua";

export default function Client({ periode }: { periode: RingkasanPeriode[] }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ nada: "good" | "bad"; teks: string } | null>(null);

  const totalKpi = periode.reduce((a, p) => a + p.kpi_baris, 0);
  const totalIns = periode.reduce((a, p) => a + p.ins_baris, 0);

  async function hapus(p: RingkasanPeriode, jenis: Jenis) {
    const apa = jenis === "kpi" ? "baris kpi_row"
              : jenis === "insentif" ? "baris insentif_row"
              : "baris kpi_row DAN insentif_row";
    const rincian =
      (jenis !== "insentif" ? `kpi_row     : ${NF.format(p.kpi_baris)} baris\n` : "") +
      (jenis !== "kpi" ? `insentif_row: ${NF.format(p.ins_baris)} baris\n` : "");
    const ya = confirm(
      `Hapus ${apa} periode ${namaPeriode(p.periode)}?\n\n${rincian}\n` +
      `Hanya baris bersumber API yang dihapus. Baris dari impor Excel tidak ` +
      `tersentuh. Data yang dihapus bisa dibuat ulang lewat hitung ulang, ` +
      `tetapi tidak bisa dibatalkan dari sini.`);
    if (!ya) return;

    const kunci = p.periode + jenis;
    setSibuk(kunci); setPesan(null);
    try {
      const r = await fetch("/api/admin/report-bulanan", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periode: p.periode, jenis }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan({ nada: "bad", teks: j.error ?? "Gagal menghapus." }); return; }
      setPesan({
        nada: "good",
        teks: `Terhapus (${namaPeriode(p.periode)}): ${NF.format(j.kpi)} baris kpi_row, ` +
              `${NF.format(j.insentif)} baris insentif_row.`,
      });
      router.refresh();
    } finally { setSibuk(null); }
  }

  const url = (p: string, jenis: Jenis) =>
    `/api/admin/report-bulanan/export?periode=${p}&jenis=${jenis}`;

  return (
    <>
      <JudulHalaman
        eyebrow="Data & indikator"
        meta={`${periode.length} periode`}
        judul="Report Bulanan"
        deskripsi="Baris hasil hitung bersumber API per periode: unduh sebagai Excel atau hapus. Baris dari impor Excel tidak ikut dihitung maupun dihapus di sini."
      />

      <div className="km-grid">
        <KartuMetrik label="Periode tersimpan" nilai={NF.format(periode.length)} satuan="periode"
                     catatan="punya baris bersumber API" ikon={<Ikon nama="calendar" ukuran={20} />} nada="netral" />
        <KartuMetrik label="Baris kpi_row" nilai={NF.format(totalKpi)} satuan="baris"
                     catatan="sumber API, semua periode" ikon={<Ikon nama="table" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Baris insentif_row" nilai={NF.format(totalIns)} satuan="baris"
                     catatan="sumber API, semua periode" ikon={<Ikon nama="wallet" ukuran={20} />} nada="good" />
      </div>

      {pesan && (
        <div className={"banner " + (pesan.nada === "good" ? "good" : "warn")}>{pesan.teks}</div>
      )}

      <section className="card tabel-scroll">
        <table className="pa-tabel">
          <thead>
            <tr>
              <th>Periode</th>
              <th className="r">kpi_row</th>
              <th className="r">insentif_row</th>
              <th>Terakhir dihitung</th>
              <th className="r">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {periode.map((p) => {
              const s = (j: Jenis) => sibuk === p.periode + j;
              return (
                <tr key={p.periode}>
                  <td><b>{namaPeriode(p.periode)}</b><div className="faint">{p.periode}</div></td>
                  <td className="r">
                    <b className="num">{NF.format(p.kpi_baris)}</b>
                    <div className="faint">{NF.format(p.kpi_nik)} NIK</div>
                  </td>
                  <td className="r">
                    <b className="num">{NF.format(p.ins_baris)}</b>
                    <div className="faint">{NF.format(p.ins_nik)} NIK</div>
                  </td>
                  <td className="small">
                    {p.dihitung_pada
                      ? new Date(p.dihitung_pada).toLocaleString("id-ID", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td className="r">
                    <div className="rowact">
                      <a className="btn ghost sm" href={url(p.periode, "semua")}><Ikon nama="download" ukuran={14} /> Excel (KPI + insentif)</a>
                      <a className="btn ghost sm" href={url(p.periode, "kpi")}>KPI</a>
                      <a className="btn ghost sm" href={url(p.periode, "insentif")}>Insentif</a>
                      <button className="btn danger sm" disabled={!!sibuk || p.kpi_baris === 0}
                              onClick={() => hapus(p, "kpi")}>
                        {s("kpi") ? "Menghapus…" : "Hapus KPI"}
                      </button>
                      <button className="btn danger sm" disabled={!!sibuk || p.ins_baris === 0}
                              onClick={() => hapus(p, "insentif")}>
                        {s("insentif") ? "Menghapus…" : "Hapus insentif"}
                      </button>
                      <button className="btn danger sm" disabled={!!sibuk}
                              onClick={() => hapus(p, "semua")}>
                        {s("semua") ? "Menghapus…" : "Hapus semua"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!periode.length && (
              <tr><td colSpan={5} className="empty">
                Belum ada baris hasil hitung bersumber API.
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
