"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import Pager from "@/components/Pager";
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

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Sampel Data Mentah</h2>
          <p>
            Contoh baris dari tarikan terakhir, kolom terkurasi. Untuk
            memeriksa status dan riwayat penarikannya, lihat{" "}
            <Link className="lnk" href="/admin/data-api">Data API</Link>.
          </p>
        </div>
      </div>

      {pesan && <div className="alert bad mb">{pesan}</div>}

      <div className="api-metrik mb" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
        <div className="api-kotak">
          <b>{total.toLocaleString("id-ID")}</b><span>total baris data mentah</span>
        </div>
        <div className="api-kotak">
          <b>{cabangList.length}</b><span>cabang punya data</span>
        </div>
      </div>

      <section className="card">
        <div className="saring-bar-rapi">
          <div style={{ width: 230 }}>
            <Pilih nilai={cabang} onPilih={gantiCabang} placeholder="Semua cabang"
                   opsi={[{ nilai: "", label: "Semua cabang" },
                     ...cabangList.map((c) => ({
                       nilai: c.branch_id, label: c.cabang, ket: `kode ${c.branch_id}`,
                     }))]} />
          </div>

          <KotakCari nilai={cari} onUbah={setCari} onCari={cariSekarang} lebar={320}
                     placeholder="Cari no. kontrak atau nama debitur, lalu Enter" />

          <button className="btn ghost sm" onClick={cariSekarang}>Cari</button>

          {adaSaring && (
            <button className="saring-bersih"
                    onClick={() => { setCari(""); setTerpakai(""); setCabang(""); setHal(0); }}>
              Bersihkan penyaring
            </button>
          )}

          <span className="faint small" style={{ marginLeft: "auto" }}>
            {muat ? "memuat…" : `${cocok.toLocaleString("id-ID")} baris cocok`}
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
                  {muat ? "Memuat…"
                    : adaSaring ? "Tidak ada baris yang cocok dengan penyaring."
                    : "Belum ada data mentah. Tarik data dulu dari halaman Data API."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {cocok > 0 && (
          <Pager hal={hal} totalHal={totalHal} totalBaris={cocok}
                 dariBaris={hal * PER + 1}
                 sampaiBaris={Math.min(hal * PER + PER, cocok)}
                 onPindah={setHal} />
        )}
      </section>
    </>
  );
}
