"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";

type Baris = { cabang: string; produk: string; berlaku_mulai: string; kelas: string };
type Cabang = { branch_id: string; cabang: string; area: string | null };

const KELAS_OPSI = [
  { nilai: "large", label: "Large" },
  { nilai: "medium", label: "Medium" },
  { nilai: "small", label: "Small" },
];
const namaKelas = (k: string) => KELAS_OPSI.find((o) => o.nilai === k)?.label ?? k;
const hariIni = () => new Date().toISOString().slice(0, 10);

/**
 * Tier cabang per produk.
 *
 * Dipakai jabatan yang mekanisme insentifnya "tabel tier": nominalnya
 * dicari lewat tier orangnya disilang tier cabang tempatnya bertugas.
 *
 * Nama cabang dipilih dari master cabang API, tidak diketik bebas — nama
 * yang meleset sedikit tidak akan cocok saat dicari waktu menghitung
 * insentif, dan kegagalannya sunyi: nominalnya nol tanpa pesan galat.
 */
export default function KelasCabangClient() {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [cabangList, setCabangList] = useState<Cabang[]>([]);
  const [produk, setProduk] = useState<{ kode: string; nama: string }[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [saringProduk, setSaringProduk] = useState("");
  const [baru, setBaru] = useState<Baris | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/kelas-cabang", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat tier cabang."); setMuat(false); return; }
    setBaris(j.kelas ?? []);
    setCabangList(j.cabang ?? []);
    setProduk(j.produk ?? []);
    setMuat(false);
  }
  useEffect(() => { segarkan(); }, []);

  async function simpan(b: Baris) {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/kelas-cabang", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return false; }
      await segarkan();
      return true;
    } finally { setSibuk(false); }
  }

  const tersaring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return baris.filter((b) =>
      (!k || b.cabang.toLowerCase().includes(k)) &&
      (!saringProduk || b.produk === saringProduk));
  }, [baris, cari, saringProduk]);

  // Pasangan cabang+produk yang belum pernah diberi tier. Tanpa ini,
  // insentif bermekanisme tier di cabang tersebut diam-diam bernilai nol.
  const belumBerkelas = useMemo(() => {
    const ada = new Set(baris.map((b) => `${b.cabang}|${b.produk}`));
    const kurang: string[] = [];
    for (const c of cabangList) {
      for (const p of produk) {
        if (!ada.has(`${c.cabang}|${p.kode}`)) kurang.push(`${c.cabang}/${p.kode}`);
      }
    }
    return kurang;
  }, [baris, cabangList, produk]);

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Tier Cabang</h2>
          <p>
            Tier cabang (Large/Medium/Small) per produk, dipakai jabatan yang
            mekanisme insentifnya "tabel tier" — disilang dengan tier orangnya
            untuk menentukan nominal di{" "}
            <Link className="lnk" href="/admin/tier">Tabel Tier Insentif</Link>.
          </p>
        </div>
        <button className="btn sm" disabled={!cabangList.length}
                onClick={() => setBaru({
                  cabang: "", produk: produk[0]?.kode ?? "",
                  berlaku_mulai: hariIni(), kelas: "medium",
                })}>
          + Tambah tier
        </button>
      </div>

      {pesan && <div className="alert bad mb">{pesan}</div>}

      {!muat && !cabangList.length && (
        <div className="alert warn mb">
          Master cabang API masih kosong, jadi belum ada cabang yang bisa diberi
          tier. Isi dulu di{" "}
          <Link className="lnk" href="/admin/cabang">Master Cabang API</Link>.
        </div>
      )}

      {belumBerkelas.length > 0 && (
        <div className="alert warn mb">
          <b>{belumBerkelas.length} pasangan cabang·produk belum punya tier.</b>{" "}
          {belumBerkelas.slice(0, 8).join(", ")}
          {belumBerkelas.length > 8 && `, dan ${belumBerkelas.length - 8} lainnya`}.
        </div>
      )}

      {baru && (
        <section className="panel-isi mb">
          <div className="panel-kepala">
            <b>Tier cabang baru</b>
            <button className="panel-x" onClick={() => setBaru(null)}>×</button>
          </div>
          <div className="panel-badan">
            <div className="medan-4">
              <label>
                <span className="faint small">Cabang</span>
                <Pilih nilai={baru.cabang} placeholder="Pilih cabang"
                       onPilih={(v) => setBaru({ ...baru, cabang: v })}
                       opsi={cabangList.map((c) => ({
                         nilai: c.cabang, label: c.cabang, ket: c.area ?? undefined,
                       }))} />
              </label>
              <label>
                <span className="faint small">Produk</span>
                <Pilih nilai={baru.produk} cari={false}
                       onPilih={(v) => setBaru({ ...baru, produk: v })}
                       opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
              </label>
              <label>
                <span className="faint small">Berlaku mulai</span>
                <input type="date" value={baru.berlaku_mulai}
                       onChange={(e) => setBaru({ ...baru, berlaku_mulai: e.target.value })} />
              </label>
              <label>
                <span className="faint small">Tier</span>
                <Pilih nilai={baru.kelas} cari={false}
                       onPilih={(v) => setBaru({ ...baru, kelas: v })}
                       opsi={KELAS_OPSI} />
              </label>
            </div>
            <p className="faint small">
              Untuk mengubah tier yang sudah ada, tambahkan baris baru dengan
              tanggal berlaku yang lebih baru — baris lama tetap disimpan supaya
              insentif periode lampau tidak ikut berubah.
            </p>
            <div className="formact">
              <button className="btn sm" disabled={sibuk || !baru.cabang || !baru.produk}
                      onClick={async () => { if (await simpan(baru)) setBaru(null); }}>
                Simpan
              </button>
              <button className="btn ghost sm" onClick={() => setBaru(null)}>Batal</button>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="saring-bar-rapi">
          <KotakCari nilai={cari} onUbah={setCari} lebar={260} placeholder="Cari cabang" />
          <div style={{ width: 150 }}>
            <Pilih nilai={saringProduk} cari={false} onPilih={setSaringProduk}
                   opsi={[{ nilai: "", label: "Semua produk" },
                          ...produk.map((p) => ({ nilai: p.kode, label: p.kode }))]} />
          </div>
          <span className="faint small" style={{ marginLeft: "auto" }}>
            {tersaring.length} dari {baris.length} baris
          </span>
        </div>

        <table className="rapat tbl-pagu">
          <colgroup>
            <col /><col style={{ width: 90 }} /><col style={{ width: 140 }} />
            <col style={{ width: 130 }} /><col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Cabang</th><th>Produk</th><th>Berlaku mulai</th>
              <th>Tier</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tersaring.map((b) => (
              <tr key={`${b.cabang}|${b.produk}|${b.berlaku_mulai}`}>
                <td><b>{b.cabang}</b></td>
                <td><span className="cip on">{b.produk}</span></td>
                <td className="faint num">{b.berlaku_mulai}</td>
                <td>
                  <Pilih nilai={b.kelas} cari={false}
                         onPilih={(v) => simpan({ ...b, kelas: v })}
                         opsi={KELAS_OPSI} />
                </td>
                <td className="r">
                  <button className="isyarat-x"
                          title={`Hapus tier ${b.cabang} · ${b.produk}`}
                          disabled={sibuk}
                          onClick={async () => {
                            if (!confirm(`Hapus tier ${b.cabang} · ${b.produk} berlaku ${b.berlaku_mulai}?`)) return;
                            setSibuk(true);
                            try {
                              await fetch(
                                `/api/admin/kelas-cabang?cabang=${encodeURIComponent(b.cabang)}&produk=${encodeURIComponent(b.produk)}&berlaku_mulai=${b.berlaku_mulai}`,
                                { method: "DELETE" });
                              await segarkan();
                            } finally { setSibuk(false); }
                          }}>×</button>
                </td>
              </tr>
            ))}
            {!tersaring.length && (
              <tr><td colSpan={5} className="empty">
                {muat ? "Memuat…" : (cari || saringProduk) ? "Tidak ada yang cocok."
                  : "Belum ada tier cabang."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
