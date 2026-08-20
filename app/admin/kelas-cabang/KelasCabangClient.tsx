"use client";

import { useEffect, useMemo, useState } from "react";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";

type Baris = { cabang: string; berlaku_mulai: string; kelas: string };

const KELAS_LABEL: Record<string, string> = { large: "Besar", medium: "Sedang", small: "Kecil" };

/**
 * Kelas cabang berperiode.
 *
 * Dipakai mekanisme tier di Pagu Insentif: nominal dicari lewat tier
 * disilang kelas cabang orangnya pada periode yang dihitung. Disimpan
 * berbaris dengan tanggal mulai berlaku, bukan diedit di tempat, supaya
 * mengubah kelas cabang tidak diam-diam mengubah insentif periode lampau
 * yang sudah dibayarkan — baris lama tetap ada sebagai riwayat.
 */
export default function KelasCabangClient() {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [cabangDikenal, setCabangDikenal] = useState<string[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [baru, setBaru] = useState<Baris | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/kelas-cabang", { cache: "no-store" });
    const j = await r.json();
    setBaris(j.kelas ?? []);
    setCabangDikenal(j.cabang ?? []);
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
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return false; }
      await segarkan();
      return true;
    } finally { setSibuk(false); }
  }

  const tersaring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return baris.filter((b) => !k || b.cabang.toLowerCase().includes(k));
  }, [baris, cari]);

  // Cabang yang punya orang aktif tapi belum sekalipun diberi kelas —
  // tanpa ini, saat mekanisme tier dipakai nominalnya diam-diam nol
  // tanpa pesan galat apa pun.
  const belumBerkelas = cabangDikenal.filter((c) => !baris.some((b) => b.cabang === c));

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Kelas Cabang</h2>
          <p>
            Kelas cabang (besar/sedang/kecil) dipakai jabatan yang mekanisme
            insentifnya "tabel tier" — dicari bersama tier untuk menentukan
            nominal di Tabel Tier Insentif.
          </p>
        </div>
        <button className="btn sm"
                onClick={() => setBaru({
                  cabang: "", berlaku_mulai: new Date().toISOString().slice(0, 10), kelas: "medium",
                })}>
          + Tambah kelas
        </button>
      </div>

      {pesan && <div className="alert bad mb">{pesan}</div>}

      {belumBerkelas.length > 0 && (
        <div className="alert warn mb">
          <b>{belumBerkelas.length} cabang belum punya kelas.</b>{" "}
          {belumBerkelas.slice(0, 8).join(", ")}
          {belumBerkelas.length > 8 && `, dan ${belumBerkelas.length - 8} lainnya`}.
        </div>
      )}

      {baru && (
        <section className="panel-isi mb">
          <div className="panel-kepala">
            <b>Kelas cabang baru</b>
            <button className="panel-x" onClick={() => setBaru(null)}>×</button>
          </div>
          <div className="panel-badan">
            <div className="pagu-medan">
              <label>
                <span className="faint small">Cabang</span>
                <Pilih nilai={baru.cabang} bebas placeholder="Pilih atau ketik cabang"
                       onPilih={(v) => setBaru({ ...baru, cabang: v.toUpperCase() })}
                       opsi={cabangDikenal.map((c) => ({ nilai: c, label: c }))} />
              </label>
              <label>
                <span className="faint small">Berlaku mulai</span>
                <input type="date" value={baru.berlaku_mulai}
                       onChange={(e) => setBaru({ ...baru, berlaku_mulai: e.target.value })} />
              </label>
              <label>
                <span className="faint small">Kelas</span>
                <Pilih nilai={baru.kelas} cari={false}
                       onPilih={(v) => setBaru({ ...baru, kelas: v })}
                       opsi={[
                         { nilai: "large", label: "Besar" },
                         { nilai: "medium", label: "Sedang" },
                         { nilai: "small", label: "Kecil" },
                       ]} />
              </label>
            </div>
            <div className="formact">
              <button className="btn sm" disabled={sibuk || !baru.cabang}
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
          <KotakCari nilai={cari} onUbah={setCari} lebar={280} placeholder="Cari cabang" />
          <span className="faint small" style={{ marginLeft: "auto" }}>
            {baris.length} baris
          </span>
        </div>

        <table className="rapat tbl-pagu">
          <colgroup>
            <col /><col style={{ width: 150 }} /><col style={{ width: 120 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Cabang</th><th>Berlaku mulai</th><th>Kelas</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tersaring.map((b) => (
              <tr key={b.cabang + b.berlaku_mulai}>
                <td><b>{b.cabang}</b></td>
                <td className="faint">{b.berlaku_mulai}</td>
                <td>
                  <Pilih nilai={b.kelas} cari={false}
                         onPilih={(v) => simpan({ ...b, kelas: v })}
                         opsi={[
                           { nilai: "large", label: "Besar" },
                           { nilai: "medium", label: "Sedang" },
                           { nilai: "small", label: "Kecil" },
                         ]} />
                </td>
                <td className="r">
                  <button className="isyarat-x" title={`Hapus kelas ${b.cabang}`}
                          disabled={sibuk}
                          onClick={async () => {
                            if (!confirm(`Hapus baris kelas ${b.cabang} · ${b.berlaku_mulai}?`)) return;
                            setSibuk(true);
                            try {
                              await fetch(
                                `/api/admin/kelas-cabang?cabang=${encodeURIComponent(b.cabang)}&berlaku_mulai=${b.berlaku_mulai}`,
                                { method: "DELETE" });
                              await segarkan();
                            } finally { setSibuk(false); }
                          }}>×</button>
                </td>
              </tr>
            ))}
            {!tersaring.length && (
              <tr><td colSpan={4} className="empty">
                {muat ? "Memuat…" : cari ? "Tidak ada yang cocok." : "Belum ada kelas cabang."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="faint small mt">
        {KELAS_LABEL.large} · {KELAS_LABEL.medium} · {KELAS_LABEL.small} — istilah "large/medium/small"
        di basis data ditampilkan sebagai Besar/Sedang/Kecil di sini.
      </p>
    </>
  );
}
