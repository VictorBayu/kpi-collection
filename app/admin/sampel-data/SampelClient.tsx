"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Pilih from "@/components/Pilih";

type Baris = {
  branch_id: string; branch_full_name: string | null; agreement_no: string;
  full_name: string | null; product_id: string | null;
  nik_staff: string | null; nama_staf: string | null;
  outstanding_principal: string | null; bucket_awal_bulan: string | null;
  od_movement: string | null; due_date_harian: string | null; ditarik_pada: string;
};

const rp = (v: string | null) =>
  v === null ? "—" : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 0 });

const waktu = (s: string) =>
  new Date(s).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });

/**
 * Sampel data mentah.
 *
 * data_mentah punya sekitar tujuh puluh kolom — cukup untuk mesin hitung,
 * tapi kalau ditampilkan apa adanya admin harus menggulir ke samping tanpa
 * ujung hanya untuk memastikan tarikan terakhir masuk dengan benar. Di
 * sini sengaja dibatasi ke kolom yang paling sering diperiksa: siapa,
 * cabang mana, produk apa, dan tiga kolom yang jadi bahan syarat
 * indikator paling umum.
 *
 * Ini pemeriksaan sekilas, bukan alat analisis — kalau butuh menelusuri
 * lebih dalam, itu pekerjaan untuk kueri langsung ke database.
 */
export default function SampelClient() {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [total, setTotal] = useState(0);
  const [cabangList, setCabangList] = useState<{ branch_id: string; cabang: string }[]>([]);
  const [cabang, setCabang] = useState("");
  const [cari, setCari] = useState("");
  const [batas, setBatas] = useState(50);
  const [muat, setMuat] = useState(true);

  async function segarkan() {
    setMuat(true);
    try {
      const p = new URLSearchParams({ batas: String(batas) });
      if (cabang) p.set("cabang", cabang);
      if (cari.trim()) p.set("cari", cari.trim());
      const r = await fetch(`/api/admin/sampel-data?${p}`, { cache: "no-store" });
      const j = await r.json();
      setBaris(j.baris ?? []); setTotal(j.total ?? 0); setCabangList(j.cabang ?? []);
    } finally { setMuat(false); }
  }
  useEffect(() => { segarkan(); }, [cabang, batas]);

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Sampel Data Mentah</h2>
          <p>
            Contoh baris dari tarikan terakhir, kolom terkurasi. Untuk
            memeriksa data mentah lengkap dan riwayatnya, lihat{" "}
            <Link className="lnk" href="/admin/data-api">Data API</Link>.
          </p>
        </div>
      </div>

      <div className="api-metrik mb" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
        <div className="api-kotak">
          <b>{total.toLocaleString("id-ID")}</b><span>total baris data mentah</span>
        </div>
        <div className="api-kotak">
          <b>{cabangList.length}</b><span>cabang punya data</span>
        </div>
      </div>

      <section className="card">
        <div className="cardhead" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ width: 220 }}>
            <Pilih nilai={cabang} onPilih={setCabang} placeholder="Semua cabang"
                   opsi={[{ nilai: "", label: "Semua cabang" },
                     ...cabangList.map((c) => ({ nilai: c.branch_id, label: `${c.branch_id} · ${c.cabang}` }))]} />
          </div>
          <input value={cari} placeholder="Cari nomor kontrak atau nama debitur…"
                 onChange={(e) => setCari(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && segarkan()}
                 style={{ maxWidth: 280 }} />
          <button className="btn ghost sm" onClick={segarkan}>Cari</button>
          <span className="faint small" style={{ marginLeft: "auto" }}>
            menampilkan {baris.length} baris terbaru
          </span>
        </div>

        <div className="tabel-scroll">
          <table className="rapat">
            <thead>
              <tr>
                <th>Cabang</th><th>Kontrak</th><th>Debitur</th><th>Produk</th>
                <th>Staf</th>
                <th className="r">Outstanding</th>
                <th>Bucket</th><th>OD Movement</th><th>Ditarik</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.agreement_no + b.ditarik_pada}>
                  <td>{b.branch_id}<div className="faint small">{b.branch_full_name ?? "—"}</div></td>
                  <td className="num">{b.agreement_no}</td>
                  <td>{b.full_name ?? "—"}</td>
                  <td className="faint">{b.product_id ?? "—"}</td>
                  <td>
                    {b.nama_staf ?? <span className="faint">akun tidak ditemukan</span>}
                    <div className="faint small num">{b.nik_staff ?? "—"}</div>
                  </td>
                  <td className="r num">{rp(b.outstanding_principal)}</td>
                  <td>{b.bucket_awal_bulan ?? "—"}</td>
                  <td>{b.od_movement ?? "—"}</td>
                  <td className="faint small">{waktu(b.ditarik_pada)}</td>
                </tr>
              ))}
              {!baris.length && (
                <tr><td colSpan={9} className="empty">
                  {muat ? "Memuat…" : "Belum ada data mentah yang cocok. Tarik data dulu dari halaman Data API."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {baris.length >= batas && (
          <div className="formact">
            <button className="btn ghost sm" onClick={() => setBatas(batas + 50)}>
              Muat lebih banyak
            </button>
          </div>
        )}
      </section>
    </>
  );
}
