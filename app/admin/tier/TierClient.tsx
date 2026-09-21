"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Pilih from "@/components/Pilih";
import InputAngka from "@/components/InputAngka";
import KotakCari from "@/components/KotakCari";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

type Baris = { alias: string; produk: string; tier: string; kelas: string; nominal: string };
type Pasangan = { alias: string; produk: string };

const rp = (v: number) => "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
const KELAS_OPSI = [
  { nilai: "large", label: "Large" },
  { nilai: "medium", label: "Medium" },
  { nilai: "small", label: "Small" },
];

/**
 * Tabel tier insentif.
 *
 * Dipakai jabatan+produk yang mekanismenya diset "tabel tier" di Pagu
 * Insentif — nominalnya bukan skor linear, tapi dicari langsung dari
 * kombinasi tier (dari indikator berperan "Penentu tier") dan tier
 * cabang tempatnya bertugas.
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
  const [saringJabatan, setSaringJabatan] = useState("");
  const [saringProduk, setSaringProduk] = useState("");
  const [saringKelas, setSaringKelas] = useState("");

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
    return baris.filter((b) =>
      (!k || b.alias.toLowerCase().includes(k) || b.produk.toLowerCase().includes(k)) &&
      (!saringJabatan || b.alias === saringJabatan) &&
      (!saringProduk || b.produk === saringProduk) &&
      (!saringKelas || b.kelas === saringKelas));
  }, [baris, cari, saringJabatan, saringProduk, saringKelas]);

  // Pasangan jabatan+produk yang mekanismenya "tier" di Pagu Insentif tapi
  // belum punya satu baris pun di sini — nominalnya akan selalu nol tanpa
  // baris ini, dan itu tidak menimbulkan pesan galat.
  const belumTerisi = jabatan.filter(
    (j) => !baris.some((b) => b.alias === j.alias && b.produk === j.produk));

  const perJabatan = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baris) m.set(b.alias, (m.get(b.alias) ?? 0) + 1);
    return Array.from(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [baris]);
  const tertinggi = baris.reduce<Baris | null>((a, b) => (!a || Number(b.nominal) > Number(a.nominal) ? b : a), null);
  const nol = baris.filter((b) => !Number(b.nominal)).length;
  const adaSaring = !!(cari || saringJabatan || saringProduk || saringKelas);
  const bawaanBaru = (): Baris => ({
    alias: saringJabatan || jabatan[0]?.alias || "", produk: saringProduk || jabatan[0]?.produk || produk[0]?.kode || "",
    tier: "1", kelas: saringKelas || "medium", nominal: "1000000",
  });

  async function hapus(b: Baris) {
    if (!confirm(`Hapus ${b.alias} · ${b.produk} tier ${b.tier}/${b.kelas}?`)) return;
    setSibuk(true);
    try {
      await fetch(
        `/api/admin/tier?alias=${encodeURIComponent(b.alias)}&produk=${encodeURIComponent(b.produk)}&tier=${b.tier}&kelas=${b.kelas}`,
        { method: "DELETE" });
      await segarkan();
    } finally { setSibuk(false); }
  }

  const duplikatBaru = !!baru && baris.some((b) =>
    b.alias === baru.alias && b.produk === baru.produk && b.tier === baru.tier && b.kelas === baru.kelas);

  return (
    <>
      <JudulHalaman
        eyebrow="Master data & formula"
        meta={<><TitikStatus nada={belumTerisi.length ? "warn" : "good"} /> {belumTerisi.length ? `${belumTerisi.length} pasangan belum terisi` : "matriks lengkap"}</>}
        judul="Tabel Tier Insentif"
        deskripsi={<>Nominal untuk jabatan+produk bermekanisme “tabel tier” — dicari lewat kombinasi tier orang dan grading cabang
          (Large/Medium/Small), bukan rumus skor ÷ pembagi × pagu.</>}
        aksi={<>
          <Link className="btn ghost" href="/admin/kelas-cabang"><Ikon nama="building" ukuran={16} /> Grading cabang</Link>
          <button className="btn" onClick={() => setBaru(bawaanBaru())}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tambah baris tier
          </button>
        </>}
      />

      {pesan && (
        <div className="alert-box bad tr-pesan" role="alert">
          <span className="alert-ikon">!</span><span>{pesan}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      <div className="km-grid">
        <KartuMetrik label="Total kombinasi tier" nilai={baris.length} satuan="baris"
                     catatan={`Dari ${perJabatan.length} jabatan`}
                     ikon={<Ikon nama="layers" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Pasangan bermekanisme tier" nilai={jabatan.length} satuan="jabatan·produk"
                     catatan={belumTerisi.length ? `${belumTerisi.length} belum punya baris` : "Semua sudah punya baris"}
                     ikon={<Ikon nama="wallet" ukuran={20} />} nada={belumTerisi.length ? "warn" : "good"}
                     lencana={jabatan.length ? { teks: `${Math.round(((jabatan.length - belumTerisi.length) / jabatan.length) * 100)}%`, nada: belumTerisi.length ? "warn" : "good" } : undefined} />
        <KartuMetrik label="Nominal tertinggi" nilai={<span className="km-teks num">{tertinggi ? rp(Number(tertinggi.nominal)) : "—"}</span>}
                     catatan={tertinggi ? `${tertinggi.alias} · ${tertinggi.produk} · tier ${tertinggi.tier}/${tertinggi.kelas}` : "Belum ada baris"}
                     ikon={<Ikon nama="chart" ukuran={20} />} nada="good" />
        <KartuMetrik label="Nominal belum diisi" nilai={<span className={nol ? "teks-bad" : ""}>{nol}</span>} satuan="baris"
                     catatan="Bernilai Rp 0 — belum diisi, bukan nol sengaja"
                     ikon={<Ikon nama="alert" ukuran={20} />} nada={nol ? "bad" : "netral"} />
      </div>

      {!muat && !jabatan.length && (
        <div className="alert-box warn tr-pesan">
          <span className="alert-ikon">!</span>
          <span>Belum ada jabatan+produk bermekanisme “tabel tier”. Atur dulu di <Link className="lnk" href="/admin/pagu">Pagu Insentif</Link>.</span>
        </div>
      )}

      {belumTerisi.length > 0 && (
        <div className="tr-info warn">
          <span className="sd-ikon"><Ikon nama="alert" ukuran={18} /></span>
          <div className="tr-info-teks">
            <b>{belumTerisi.length} pasangan belum punya baris tier sama sekali</b>
            <p>{belumTerisi.slice(0, 6).map((s) => `${s.alias}/${s.produk}`).join(", ")}
              {belumTerisi.length > 6 && `, dan ${belumTerisi.length - 6} lainnya`}. Nominalnya akan selalu nol sampai barisnya diisi.</p>
          </div>
          <button className="btn sm" onClick={() => setBaru({ ...bawaanBaru(), alias: belumTerisi[0].alias, produk: belumTerisi[0].produk })}>
            <Ikon nama="plus" ukuran={14} /> Isi {belumTerisi[0].alias}/{belumTerisi[0].produk}
          </button>
        </div>
      )}

      {baru && (
        <section className="card tr-form">
          <div className="kt-form-kepala">
            <span className="kt-titik" aria-hidden />
            <h3>Baris matriks tier baru</h3>
            <span className="kt-mode">nominal dicari dari tier orang × grading cabang</span>
            <button className="pa-tutup" onClick={() => setBaru(null)} aria-label="Tutup formulir">×</button>
          </div>
          <div className="tr-form-isi">
            <div className="tr-medan">
              <label className="field">
                <span>Jabatan <em className="kt-wajib">*</em></span>
                <Pilih nilai={baru.alias} bebas placeholder="Pilih jabatan"
                       onPilih={(v) => setBaru({ ...baru, alias: v.toUpperCase() })}
                       opsi={Array.from(new Set(jabatan.map((j) => j.alias)))
                         .map((a) => ({ nilai: a, label: a }))} />
              </label>
              <label className="field">
                <span>Produk</span>
                <Pilih nilai={baru.produk} cari={false}
                       onPilih={(v) => setBaru({ ...baru, produk: v })}
                       opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
              </label>
              <label className="field">
                <span>Tier karyawan</span>
                <input className="num" inputMode="numeric" value={baru.tier}
                       onChange={(e) => setBaru({ ...baru, tier: e.target.value })} />
              </label>
              <label className="field">
                <span>Grading cabang</span>
                <Pilih nilai={baru.kelas} cari={false}
                       onPilih={(v) => setBaru({ ...baru, kelas: v })}
                       opsi={KELAS_OPSI} />
              </label>
              <label className="field">
                <span>Nominal (Rp)</span>
                <InputAngka className="num" value={baru.nominal}
                       onChange={(v) => setBaru({ ...baru, nominal: v })} />
              </label>
            </div>
            {duplikatBaru && (
              <div className="alert-box warn"><span className="alert-ikon">!</span>
                <span>Kombinasi ini sudah ada di tabel — menyimpan akan menimpa nominalnya.</span></div>
            )}
          </div>
          <div className="sd-form-kaki">
            <button className="btn ghost" onClick={() => setBaru(null)}>Batal</button>
            <button className="btn" disabled={sibuk || !baru.alias || !baru.produk}
                    onClick={async () => { if (await simpan(baru)) setBaru(null); }}>
              <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan baris"}
            </button>
          </div>
        </section>
      )}

      <section className="card pa-tabel-kartu">
        <div className="tr-pil" role="tablist" aria-label="Saring jabatan">
          <button role="tab" aria-selected={!saringJabatan} className={!saringJabatan ? "on" : ""}
                  onClick={() => setSaringJabatan("")}>Semua jabatan <span className="num">{baris.length}</span></button>
          {perJabatan.map(([a, n]) => (
            <button key={a} role="tab" aria-selected={saringJabatan === a} className={saringJabatan === a ? "on" : ""}
                    onClick={() => setSaringJabatan(saringJabatan === a ? "" : a)}>{a} <span className="num">{n}</span></button>
          ))}
        </div>
        <div className="pa-alat">
          <div className="pa-alat-cari">
            <KotakCari nilai={cari} onUbah={setCari} lebar={360} placeholder="Cari jabatan atau produk…" />
          </div>
          <div className="ri-saring">
            <Pilih nilai={saringProduk} cari={false} onPilih={setSaringProduk}
                   opsi={[{ nilai: "", label: "Semua produk" }, ...produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))]} />
            <Pilih nilai={saringKelas} cari={false} onPilih={setSaringKelas}
                   opsi={[{ nilai: "", label: "Semua grading cabang" }, ...KELAS_OPSI]} />
          </div>
          <div className="ri-alat-kanan">
            {adaSaring && (
              <button className="btn polos sm" onClick={() => { setCari(""); setSaringJabatan(""); setSaringProduk(""); setSaringKelas(""); }}>
                Bersihkan
              </button>
            )}
            <span className="faint">{tersaring.length} dari {baris.length} baris</span>
          </div>
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel tr-tabel">
            <thead>
              <tr>
                <th>Jabatan</th><th>Produk</th><th>Tier karyawan</th>
                <th>Grading cabang</th><th className="r" style={{ width: 190 }}>Nominal insentif</th><th className="r" style={{ width: 96 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tersaring
                .slice()
                .sort((a, b) => a.alias.localeCompare(b.alias) || a.produk.localeCompare(b.produk)
                  || Number(a.tier) - Number(b.tier) || a.kelas.localeCompare(b.kelas))
                .map((b) => (
                <tr key={`${b.alias}/${b.produk}/${b.tier}/${b.kelas}`} className={Number(b.nominal) ? undefined : "tr-nol"}>
                  <td><span className="tr-jabatan"><i className="titik-status good" aria-hidden />{b.alias}</span></td>
                  <td><span className="sp-produk">{b.produk}</span></td>
                  <td><span className={"tr-tier t" + Math.min(Number(b.tier) || 0, 4)}>Tier {b.tier}</span></td>
                  <td><span className={"tr-kelas " + b.kelas}><i aria-hidden />{KELAS_OPSI.find((k) => k.nilai === b.kelas)?.label ?? b.kelas}</span></td>
                  <td className="r">
                    <div className="tr-nominal">
                      <span className="num">Rp</span>
                      <InputAngka className="num r" value={b.nominal}
                             onChange={(v) => setBaris(baris.map((x) => x === b ? { ...x, nominal: v } : x))}
                             onBlur={() => simpan(b)} />
                    </div>
                  </td>
                  <td className="r">
                    <div className="pa-aksi">
                      <button className="pa-ikon-btn" title="Duplikasi ke baris baru"
                              onClick={() => { setBaru({ ...b }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                        <Ikon nama="copy" ukuran={15} />
                      </button>
                      <button className="pa-ikon-btn pr-mati" title={`Hapus baris tier ${b.alias}`} disabled={sibuk}
                              onClick={() => hapus(b)}>
                        <Ikon nama="trash" ukuran={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!tersaring.length && (
                <tr><td colSpan={6} className="empty">
                  {muat ? "Memuat…" : adaSaring ? "Tidak ada yang cocok." : "Belum ada baris tier."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="pa-catatan">
        <Ikon nama="bulb" ukuran={16} />
        <span>
          Nominal diubah langsung di tabel dan tersimpan saat kotaknya ditinggalkan. {rp(0)} berarti kombinasi itu belum
          diisi — bukan nol sengaja. Grading cabang diatur di <Link className="lnk" href="/admin/kelas-cabang">Grading Cabang</Link>.
        </span>
      </p>
    </>
  );
}
