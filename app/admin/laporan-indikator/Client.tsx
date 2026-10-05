"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Ikon from "@/components/Ikon";
import KotakCari from "@/components/KotakCari";
import Pilih from "@/components/Pilih";
import {
  type BarisLaporan, PERAN_LABEL, STATUS_LABEL, labelPeran, normPeran, saring,
  statusDari, teksEfek, totalBobot, kunciBobot, labelBulan,
} from "@/lib/laporan-indikator";

const PER = 25;
const fmt = (n: number) => n.toLocaleString("id-ID");
const persen = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("id-ID")}%`);

const NADA_STATUS = { aktif: "good", daftar_nonaktif: "warn", indikator_nonaktif: "bad" } as const;

export default function Client({ baris, periode, periodeOpsi }: {
  baris: BarisLaporan[]; periode: string; periodeOpsi: { nilai: string; label: string }[];
}) {
  const router = useRouter();
  const semuaPeriode = periode === "semua";
  const [cari, setCari] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [produk, setProduk] = useState("");
  const [peran, setPeran] = useState("");
  const [status, setStatus] = useState("");
  const [hal, setHal] = useState(0);

  const ubah = <T,>(set: (v: T) => void) => (v: T) => { set(v); setHal(0); };

  const daftarJabatan = useMemo(() => [...new Set(baris.map((b) => b.jabatan))].sort(), [baris]);
  const daftarProduk = useMemo(() => {
    const m = new Map<string, string | null>();
    baris.forEach((b) => m.set(b.produk, b.produkNama));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [baris]);
  const total = useMemo(() => totalBobot(baris), [baris]);

  const saringan = useMemo(() => ({ cari, jabatan, produk, peran, status }),
    [cari, jabatan, produk, peran, status]);
  const tampil = useMemo(() => saring(baris, saringan), [baris, saringan]);

  const totalHal = Math.max(1, Math.ceil(tampil.length / PER));
  const halIni = Math.min(hal, totalHal - 1);
  const potong = tampil.slice(halIni * PER, halIni * PER + PER);

  // Tautan unduh memakai saringan yang sama persis dengan yang di layar.
  const hrefEkspor = `/api/admin/laporan-indikator/export?${new URLSearchParams({ ...saringan, periode })}`;
  const adaSaringan = !!(cari || jabatan || produk || peran || status);

  return (
    <section className="card pa-tabel-kartu li-kartu">
      <div className="pa-alat">
        <div className="pa-alat-cari">
          <KotakCari nilai={cari} onUbah={ubah(setCari)} lebar={360}
                     placeholder="Cari indikator, jabatan, atau produk…" />
        </div>
        <div className="ri-saring li-saring">
          <Pilih nilai={periode} cari={false}
                 onPilih={(v) => router.push(`/admin/laporan-indikator?periode=${v}`)}
                 opsi={[...(periodeOpsi.some((o) => o.nilai === periode) || semuaPeriode ? [] : [{ nilai: periode, label: `${labelBulan(periode)} · belum ada` }]),
                        ...periodeOpsi, { nilai: "semua", label: "Semua periode" }]} />
          <Pilih nilai={jabatan} onPilih={ubah(setJabatan)}
                 opsi={[{ nilai: "", label: "Semua jabatan" },
                        ...daftarJabatan.map((j) => ({ nilai: j, label: j }))]} />
          <Pilih nilai={produk} onPilih={ubah(setProduk)}
                 opsi={[{ nilai: "", label: "Semua produk" },
                        ...daftarProduk.map(([k, nm]) => ({ nilai: k, label: nm ? `${k} · ${nm}` : k }))]} />
          <Pilih nilai={peran} onPilih={ubah(setPeran)} cari={false}
                 opsi={[{ nilai: "", label: "Semua peran" },
                        ...Object.entries(PERAN_LABEL).map(([k, v]) => ({ nilai: k, label: v }))]} />
          <Pilih nilai={status} onPilih={ubah(setStatus)} cari={false}
                 opsi={[{ nilai: "", label: "Semua status" },
                        { nilai: "aktif", label: "Aktif" },
                        { nilai: "nonaktif", label: "Nonaktif (semua)" },
                        { nilai: "daftar_nonaktif", label: STATUS_LABEL.daftar_nonaktif },
                        { nilai: "indikator_nonaktif", label: STATUS_LABEL.indikator_nonaktif }]} />
        </div>
        <div className="ri-alat-kanan">
          {adaSaringan && (
            <button className="btn ghost sm" onClick={() => {
              setCari(""); setJabatan(""); setProduk(""); setPeran(""); setStatus(""); setHal(0);
            }}>Hapus saringan</button>
          )}
          <a className="btn sm" href={hrefEkspor} download
             title="Unduh baris yang sedang tersaring di layar sebagai berkas Excel">
            <Ikon nama="download" ukuran={14} /> Ekspor Excel
          </a>
        </div>
      </div>

      <div className="tabel-scroll">
        <table className="pa-tabel li-tabel">
          <thead>
            <tr>
              {semuaPeriode && <th>Periode</th>}
              <th>Jabatan · produk</th>
              <th>Indikator</th>
              <th>Peran</th>
              <th className="r">Bobot KPI</th>
              <th className="r">Bobot insentif</th>
              <th className="r">Faktor pengakuan</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {potong.map((b) => {
              const st = statusDari(b);
              const p = normPeran(b.peran);
              const t = total.get(kunciBobot(b));
              const efek = teksEfek(b);
              return (
                <tr key={b.id} className={st !== "aktif" ? "li-mati" : undefined}>
                  {semuaPeriode && <td className="num">{labelBulan(b.periode)}</td>}
                  <td>
                    <div className="li-jabatan">{b.jabatan}</div>
                    <span className="pa-sub">
                      {b.produk}{b.produkNama ? ` · ${b.produkNama}` : ""}
                      {t && (
                        <span className={"li-total" + (Math.abs(t.kpi - 100) > 0.001 ? " beda" : "")}
                              title="Jumlah bobot KPI seluruh indikator Reguler aktif di jabatan·produk ini">
                          {" "}· Σ KPI {t.kpi.toLocaleString("id-ID")}%
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    <div className="li-indikator">{b.indikator}</div>
                    {(b.satuan || b.adaPita) && (
                      <span className="pa-sub">
                        {b.satuan ?? ""}{b.satuan && b.adaPita ? " · " : ""}{b.adaPita ? "pakai pita" : ""}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={"li-peran " + p}>{labelPeran(b.peran)}</span>
                    {efek && <div className="pa-sub">{efek}</div>}
                  </td>
                  <td className="r num">{p === "kpi" ? persen(b.bobotKpi) : "—"}</td>
                  <td className="r num">{p === "kpi" ? persen(b.bobotInsentif) : "—"}</td>
                  <td className={"r num" + (b.faktorPengakuan !== 100 ? " li-faktor" : "")}>
                    {persen(b.faktorPengakuan)}
                  </td>
                  <td><span className={"pa-status " + NADA_STATUS[st]}>{STATUS_LABEL[st]}</span></td>
                </tr>
              );
            })}
            {!potong.length && (
              <tr><td colSpan={semuaPeriode ? 8 : 7} className="empty">
                {baris.length
                  ? "Tidak ada pendaftaran yang cocok dengan pencarian atau saringan."
                  : `Belum ada indikator terdaftar${semuaPeriode ? "" : ` untuk ${labelBulan(periode)}. Duplikasi dari bulan lain di Create Indicator`}.`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pa-pager">
        <span className="faint">
          {tampil.length
            ? <>Menampilkan <b>{halIni * PER + 1}–{Math.min(halIni * PER + PER, tampil.length)}</b> dari <b>{fmt(tampil.length)}</b> pendaftaran</>
            : "Tidak ada data"}
        </span>
        {totalHal > 1 && (
          <div className="pa-pager-btn">
            <button className="btn ghost sm" disabled={halIni === 0} onClick={() => setHal(halIni - 1)}>← Sebelumnya</button>
            {Array.from({ length: totalHal }, (_, i) => i)
              .filter((i) => i === 0 || i === totalHal - 1 || Math.abs(i - halIni) <= 2)
              .map((i, idx, arr) => (
                <span key={i} style={{ display: "contents" }}>
                  {idx > 0 && i - arr[idx - 1] > 1 && <span className="faint">…</span>}
                  <button className={"pa-hal num" + (i === halIni ? " on" : "")}
                          aria-current={i === halIni ? "page" : undefined}
                          onClick={() => setHal(i)}>{i + 1}</button>
                </span>
              ))}
            <button className="btn ghost sm" disabled={halIni >= totalHal - 1} onClick={() => setHal(halIni + 1)}>Berikutnya →</button>
          </div>
        )}
      </div>
    </section>
  );
}
