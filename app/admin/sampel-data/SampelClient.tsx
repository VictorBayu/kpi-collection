"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik } from "@/components/JudulHalaman";
import KotakCari from "@/components/KotakCari";

type Baris = {
  branch_id: string; branch_full_name: string | null; agreement_no: string;
  full_name: string | null; product_id: string | null;
  nik_staff: string | null; nama_staf: string | null;
  outstanding_principal: string | null; bucket_awal_bulan: string | null;
  od_movement: string | null; due_date_harian: string | null; ditarik_pada: string;
};

const PER = 50;

const rp = (v: string | null) =>
  v === null ? "—" : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 0 });

const tanggal = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit" });
const jam = (s: string) =>
  new Date(s).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

/** Warna bucket: lancar hijau, sisanya kuning makin gelap bila makin jauh. */
const nadaBucket = (b: string | null) => {
  if (!b) return "netral";
  const t = b.toLowerCase();
  if (t.includes("current") || t === "0") return "good";
  return /(^|\D)(9[1-9]|1\d\d|>|\+)/.test(t) ? "bad" : "warn";
};

/** Warna OD movement mengikuti arti hasilnya bagi collection. */
const nadaOd = (v: string | null) => {
  const t = (v ?? "").toLowerCase();
  if (!t) return "netral";
  if (t.includes("flow") || t.includes("roll")) return "bad";
  if (t.includes("stay")) return "warn";
  if (t.includes("btc") || t.includes("success") || t.includes("cure") || t.includes("lunas")) return "good";
  return "netral";
};

/**
 * Sample Data API — contoh baris data mentah.
 *
 * data_mentah punya sekitar tujuh puluh kolom — cukup untuk mesin hitung,
 * tapi kalau ditampilkan apa adanya admin harus menggulir ke samping tanpa
 * ujung hanya untuk memastikan tarikan terakhir masuk dengan benar. Di
 * sini sengaja dibatasi ke kolom yang paling sering diperiksa: siapa,
 * cabang mana, produk apa, dan tiga kolom yang jadi bahan syarat
 * indikator paling umum.
 *
 * Paginasinya dikerjakan database, bukan browser. Puluhan ribu baris yang
 * dikirim sekaligus lalu dipotong di sisi klien berarti menunggu lama
 * untuk data yang hampir seluruhnya tidak jadi dilihat.
 */
export default function SampelClient() {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [cocok, setCocok] = useState(0);
  const [total, setTotal] = useState(0);
  const [cabangList, setCabangList] = useState<{ branch_id: string; cabang: string }[]>([]);
  const [cabang, setCabang] = useState("");
  const [cari, setCari] = useState("");
  const [terpakai, setTerpakai] = useState("");   // kata kunci yang sedang berlaku
  const [hal, setHal] = useState(0);
  const [muat, setMuat] = useState(true);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      setMuat(true);
      try {
        const p = new URLSearchParams({ batas: String(PER), lewati: String(hal * PER) });
        if (cabang) p.set("cabang", cabang);
        if (terpakai.trim()) p.set("cari", terpakai.trim());
        const r = await fetch(`/api/admin/sampel-data?${p}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (batal) return;
        if (!r.ok) { setPesan(j.error ?? "Gagal memuat sampel data."); return; }
        setPesan(null);
        setBaris(j.baris ?? []); setCocok(j.cocok ?? 0);
        setTotal(j.total ?? 0); setCabangList(j.cabang ?? []);
      } finally { if (!batal) setMuat(false); }
    })();
    return () => { batal = true; };
  }, [cabang, terpakai, hal]);

  /** Mengganti penyaring selalu kembali ke halaman satu. */
  const cariSekarang = () => { setTerpakai(cari); setHal(0); };
  const gantiCabang = (v: string) => { setCabang(v); setHal(0); };

  const totalHal = Math.max(1, Math.ceil(cocok / PER));
  const adaSaring = Boolean(cabang || terpakai.trim());

  const nomorHal = Array.from(new Set([0, hal - 1, hal, hal + 1, totalHal - 1]))
    .filter((i) => i >= 0 && i < totalHal).sort((a, b) => a - b);

  return (
    <>
      <JudulHalaman
        eyebrow="Data & indikator"
        meta={<span className="num">{PER} baris per halaman</span>}
        judul="Sample Data API"
        deskripsi={<>Contoh baris dari tarikan terakhir, kolom terkurasi. Untuk memeriksa status dan riwayat
          penarikannya, lihat <Link className="lnk" href="/admin/data-api">Data API</Link>.</>}
        aksi={
          <Link className="btn ghost" href="/admin/data-api">
            <Ikon nama="api" ukuran={16} /> Status penarikan
          </Link>
        }
      />

      {pesan && (
        <div className="alert-box bad sp-pesan">
          <span className="alert-ikon">!</span><span>{pesan}</span>
        </div>
      )}

      <div className="km-grid sp-metrik">
        <KartuMetrik label="Total baris data mentah" nilai={total.toLocaleString("id-ID")} satuan="baris"
                     catatan="Isi tabel data_mentah dari tarikan terakhir"
                     ikon={<Ikon nama="database" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Cabang punya data" nilai={cabangList.length} satuan="cabang"
                     catatan={adaSaring ? `${cocok.toLocaleString("id-ID")} baris cocok dengan penyaring` : "Seluruh cabang yang ikut tertarik"}
                     ikon={<Ikon nama="building" ukuran={20} />} nada="good" />
      </div>

      <section className="card pa-tabel-kartu">
        <div className="pa-alat">
          <div className="sp-cabang">
            <Pilih nilai={cabang} onPilih={gantiCabang} placeholder="Semua cabang"
                   opsi={[{ nilai: "", label: "Semua cabang" },
                     ...cabangList.map((c) => ({
                       nilai: c.branch_id, label: c.cabang, ket: `kode ${c.branch_id}`,
                     }))]} />
          </div>
          <div className="pa-alat-cari sp-cari">
            <KotakCari nilai={cari} onUbah={setCari} onCari={cariSekarang} lebar={440}
                       placeholder="Cari no. kontrak atau nama debitur, lalu Enter" />
            <button className="btn ghost sm" onClick={cariSekarang}>
              <Ikon nama="search" ukuran={14} /> Cari
            </button>
          </div>
          {adaSaring && (
            <button className="btn polos sm"
                    onClick={() => { setCari(""); setTerpakai(""); setCabang(""); setHal(0); }}>
              Bersihkan penyaring
            </button>
          )}
          <span className="sp-cocok">
            {muat ? "memuat…" : <><b className="num">{cocok.toLocaleString("id-ID")}</b> baris cocok</>}
          </span>
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel sp-tabel">
            <thead>
              <tr>
                <th>Cabang</th><th>Kontrak</th><th>Debitur</th><th>Produk</th>
                <th>Staf</th><th className="r">Outstanding</th>
                <th>Bucket</th><th>OD movement</th><th>Ditarik</th>
              </tr>
            </thead>
            <tbody className={muat ? "sp-muat" : undefined}>
              {baris.map((b) => (
                <tr key={b.agreement_no + b.ditarik_pada}>
                  <td>
                    <span className="sp-kode num">{b.branch_id}</span>
                    <div className="pa-sub">{b.branch_full_name ?? "—"}</div>
                  </td>
                  <td className="num sp-kontrak">{b.agreement_no}</td>
                  <td className="sp-debitur">{b.full_name ?? "—"}</td>
                  <td>{b.product_id ? <span className="sp-produk">{b.product_id}</span> : <span className="faint">—</span>}</td>
                  <td>
                    {b.nama_staf
                      ? <div className="sp-staf">{b.nama_staf}</div>
                      : <div className="sp-yatim">akun tidak ditemukan</div>}
                    <div className="pa-sub num">{b.nik_staff ?? "—"}</div>
                  </td>
                  <td className="r num sp-rp">{b.outstanding_principal === null ? "—" : "Rp " + rp(b.outstanding_principal)}</td>
                  <td>{b.bucket_awal_bulan ? <span className={"sp-bucket " + nadaBucket(b.bucket_awal_bulan)}>{b.bucket_awal_bulan}</span> : "—"}</td>
                  <td>{b.od_movement ? <span className={"sp-od " + nadaOd(b.od_movement)}>{b.od_movement}</span> : "—"}</td>
                  <td className="num sp-ditarik">{tanggal(b.ditarik_pada)}<span>{jam(b.ditarik_pada)}</span></td>
                </tr>
              ))}
              {!baris.length && (
                <tr><td colSpan={9} className="empty">
                  {muat ? "Memuat…"
                    : adaSaring ? "Tidak ada baris yang cocok dengan penyaring."
                    : "Belum ada data mentah. Tarik data dulu dari halaman Data API."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pa-pager">
          <span className="faint">
            {cocok > 0
              ? <>Menampilkan <b>{(hal * PER + 1).toLocaleString("id-ID")}–{Math.min(hal * PER + PER, cocok).toLocaleString("id-ID")}</b> dari <b>{cocok.toLocaleString("id-ID")}</b> baris</>
              : "Tidak ada data"}
          </span>
          {totalHal > 1 && (
            <div className="pa-pager-btn">
              <button className="btn ghost sm" disabled={hal === 0 || muat} onClick={() => setHal((h) => h - 1)}>← Sebelumnya</button>
              {nomorHal.map((i, idx) => (
                <span key={i} className="pa-hal-wrap">
                  {idx > 0 && i - nomorHal[idx - 1] > 1 && <span className="pa-elipsis">…</span>}
                  <button className={"pa-hal num" + (i === hal ? " on" : "")} disabled={muat}
                          aria-current={i === hal ? "page" : undefined}
                          onClick={() => setHal(i)}>{(i + 1).toLocaleString("id-ID")}</button>
                </span>
              ))}
              <button className="btn ghost sm" disabled={hal >= totalHal - 1 || muat} onClick={() => setHal((h) => h + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
