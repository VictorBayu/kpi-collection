"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";

type Baris = { alias: string; produk: string; tier: string; kelas: string; nominal: string };
type Pasangan = { alias: string; produk: string };

const rp = (v: number) => "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
const KELAS_OPSI = [
  { nilai: "large", label: "Besar" },
  { nilai: "medium", label: "Sedang" },
  { nilai: "small", label: "Kecil" },
];

/**
 * Tabel tier insentif.
 *
 * Dipakai jabatan+produk yang mekanismenya diset "tabel tier" di Pagu
 * Insentif — nominalnya bukan skor linear, tapi dicari langsung dari
 * kombinasi tier (dari indikator berperan "Penentu tier") dan kelas
 * cabang orangnya.
 */
export default function TierClient() {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [produk, setProduk] = useState<{ kode: string; nama: string }[]>([]);
  const [jabatan, setJabatan] = useState<Pasangan[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [baru, setBaru] = useState<Baris | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/tier", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat data tier."); setMuat(false); return; }
    setBaris((j.tier ?? []).map((t: any) => ({
      ...t, tier: String(t.tier), nominal: String(t.nominal ?? 0),
    })));
    setProduk(j.produk ?? []);
    setJabatan(j.jabatan ?? []);
    setMuat(false);
  }
  useEffect(() => { segarkan(); }, []);

  async function simpan(b: Baris) {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/tier", {
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
    return baris.filter((b) => !k ||
      b.alias.toLowerCase().includes(k) || b.produk.toLowerCase().includes(k));
  }, [baris, cari]);

  // Pasangan jabatan+produk yang mekanismenya "tier" di Pagu Insentif tapi
  // belum punya satu baris pun di sini — nominalnya akan selalu nol tanpa
  // baris ini, dan itu tidak menimbulkan pesan galat.
  const belumTerisi = jabatan.filter(
    (j) => !baris.some((b) => b.alias === j.alias && b.produk === j.produk));

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Tabel Tier Insentif</h2>
          <p>
            Nominal untuk jabatan+produk bermekanisme "tabel tier" — dicari
            lewat kombinasi tier dan kelas cabang, bukan rumus skor ÷ pembagi × pagu.
          </p>
        </div>
        <button className="btn sm"
                onClick={() => setBaru({
                  alias: jabatan[0]?.alias ?? "", produk: jabatan[0]?.produk ?? produk[0]?.kode ?? "",
                  tier: "1", kelas: "medium", nominal: "1000000",
                })}>
          + Tambah baris
        </button>
      </div>

      {pesan && <div className="alert bad mb">{pesan}</div>}

      {!jabatan.length && (
        <div className="alert warn mb">
          Belum ada jabatan+produk bermekanisme "tabel tier". Atur dulu di{" "}
          <Link className="lnk" href="/admin/pagu">Pagu Insentif</Link>.
        </div>
      )}

      {belumTerisi.length > 0 && (
        <div className="alert warn mb">
          <b>{belumTerisi.length} pasangan belum punya baris tier sama sekali.</b>{" "}
          {belumTerisi.slice(0, 6).map((s) => `${s.alias}/${s.produk}`).join(", ")}
          {belumTerisi.length > 6 && `, dan ${belumTerisi.length - 6} lainnya`}.
        </div>
      )}

      {baru && (
        <section className="panel-isi mb">
          <div className="panel-kepala">
            <b>Baris tier baru</b>
            <button className="panel-x" onClick={() => setBaru(null)}>×</button>
          </div>
          <div className="panel-badan">
            <div className="pagu-medan">
              <label>
                <span className="faint small">Jabatan</span>
                <Pilih nilai={baru.alias} bebas placeholder="Pilih jabatan"
                       onPilih={(v) => setBaru({ ...baru, alias: v.toUpperCase() })}
                       opsi={Array.from(new Set(jabatan.map((j) => j.alias)))
                         .map((a) => ({ nilai: a, label: a }))} />
              </label>
              <label>
                <span className="faint small">Produk</span>
                <Pilih nilai={baru.produk} cari={false}
                       onPilih={(v) => setBaru({ ...baru, produk: v })}
                       opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
              </label>
              <label>
                <span className="faint small">Tier</span>
                <input className="num" inputMode="numeric" value={baru.tier}
                       onChange={(e) => setBaru({ ...baru, tier: e.target.value })} />
              </label>
              <label>
                <span className="faint small">Kelas cabang</span>
                <Pilih nilai={baru.kelas} cari={false}
                       onPilih={(v) => setBaru({ ...baru, kelas: v })}
                       opsi={KELAS_OPSI} />
              </label>
              <label>
                <span className="faint small">Nominal (Rp)</span>
                <input className="num" inputMode="numeric" value={baru.nominal}
                       onChange={(e) => setBaru({ ...baru, nominal: e.target.value })} />
              </label>
            </div>
            <div className="formact">
              <button className="btn sm" disabled={sibuk || !baru.alias || !baru.produk}
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
          <KotakCari nilai={cari} onUbah={setCari} lebar={280} placeholder="Cari jabatan atau produk" />
          <span className="faint small" style={{ marginLeft: "auto" }}>
            {baris.length} baris
          </span>
        </div>

        <table className="rapat tbl-pagu">
          <colgroup>
            <col /><col style={{ width: 88 }} /><col style={{ width: 72 }} />
            <col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Jabatan</th><th>Produk</th><th className="r">Tier</th>
              <th>Kelas</th><th className="r">Nominal</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tersaring
              .slice()
              .sort((a, b) => a.alias.localeCompare(b.alias) || a.produk.localeCompare(b.produk)
                || Number(a.tier) - Number(b.tier) || a.kelas.localeCompare(b.kelas))
              .map((b) => (
              <tr key={`${b.alias}/${b.produk}/${b.tier}/${b.kelas}`}>
                <td><b>{b.alias}</b></td>
                <td><span className="cip on">{b.produk}</span></td>
                <td className="r num">{b.tier}</td>
                <td>{KELAS_OPSI.find((k) => k.nilai === b.kelas)?.label ?? b.kelas}</td>
                <td>
                  <input className="num r" inputMode="numeric" value={b.nominal}
                         onChange={(e) => setBaris(baris.map((x) =>
                           x === b ? { ...x, nominal: e.target.value } : x))}
                         onBlur={() => simpan(b)} />
                </td>
                <td className="r">
                  <button className="isyarat-x" title={`Hapus baris tier ${b.alias}`}
                          disabled={sibuk}
                          onClick={async () => {
                            if (!confirm(`Hapus ${b.alias} · ${b.produk} tier ${b.tier}/${b.kelas}?`)) return;
                            setSibuk(true);
                            try {
                              await fetch(
                                `/api/admin/tier?alias=${encodeURIComponent(b.alias)}&produk=${encodeURIComponent(b.produk)}&tier=${b.tier}&kelas=${b.kelas}`,
                                { method: "DELETE" });
                              await segarkan();
                            } finally { setSibuk(false); }
                          }}>×</button>
                </td>
              </tr>
            ))}
            {!tersaring.length && (
              <tr><td colSpan={6} className="empty">
                {muat ? "Memuat…" : cari ? "Tidak ada yang cocok." : "Belum ada baris tier."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="faint small mt">
        {rp(0)} berarti kombinasi itu memang belum diisi — bukan dihitung nol
        secara sengaja. Kelas cabang orangnya diatur di{" "}
        <Link className="lnk" href="/admin/kelas-cabang">Kelas Cabang</Link>.
      </p>
    </>
  );
}
