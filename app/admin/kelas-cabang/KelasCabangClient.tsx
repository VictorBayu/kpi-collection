"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

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
  const [saringKelas, setSaringKelas] = useState("");   // "" | large | medium | small | belum
  const [saringArea, setSaringArea] = useState("");
  const [hal, setHal] = useState(0);

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

  const areaDari = useMemo(() => new Map(cabangList.map((c) => [c.cabang, c.area])), [cabangList]);

  const tersaring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return baris.filter((b) =>
      (!k || b.cabang.toLowerCase().includes(k) || (areaDari.get(b.cabang) ?? "").toLowerCase().includes(k)) &&
      (!saringProduk || b.produk === saringProduk) &&
      (!saringArea || areaDari.get(b.cabang) === saringArea) &&
      (!saringKelas || saringKelas === "belum" || b.kelas === saringKelas));
  }, [baris, cari, saringProduk, saringArea, saringKelas, areaDari]);

  // Pasangan cabang+produk yang belum pernah diberi tier. Tanpa ini,
  // insentif bermekanisme tier di cabang tersebut diam-diam bernilai nol.
  const belumBerkelas = useMemo(() => {
    const ada = new Set(baris.map((b) => `${b.cabang}|${b.produk}`));
    const kurang: { cabang: string; produk: string }[] = [];
    for (const c of cabangList) {
      for (const p of produk) {
        if (!ada.has(`${c.cabang}|${p.kode}`)) kurang.push({ cabang: c.cabang, produk: p.kode });
      }
    }
    return kurang;
  }, [baris, cabangList, produk]);

  const belumTersaring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return belumBerkelas.filter((b) =>
      (!k || b.cabang.toLowerCase().includes(k)) &&
      (!saringProduk || b.produk === saringProduk) &&
      (!saringArea || areaDari.get(b.cabang) === saringArea));
  }, [belumBerkelas, cari, saringProduk, saringArea, areaDari]);

  const daftarArea = useMemo(
    () => Array.from(new Set(cabangList.map((c) => c.area).filter(Boolean) as string[])).sort(),
    [cabangList]);
  const hitungKelas = (k: string) => baris.filter((b) => b.kelas === k).length;
  const totalPasangan = cabangList.length * produk.length;
  const terpetakan = totalPasangan - belumBerkelas.length;
  const modeBelum = saringKelas === "belum";
  const isi = modeBelum ? belumTersaring.length : tersaring.length;

  const PER = 20;
  const totalHal = Math.max(1, Math.ceil(isi / PER));
  const halIni = Math.min(hal, totalHal - 1);
  const ubah = <T,>(set: (v: T) => void) => (v: T) => { set(v); setHal(0); };
  const nomorHal = Array.from(new Set([0, halIni - 1, halIni, halIni + 1, totalHal - 1]))
    .filter((i) => i >= 0 && i < totalHal).sort((a, b) => a - b);

  function beriTier(cabang = "", prod = produk[0]?.kode ?? "") {
    setBaru({ cabang, produk: prod, berlaku_mulai: hariIni(), kelas: "medium" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function hapus(b: Baris) {
    if (!confirm(`Hapus tier ${b.cabang} · ${b.produk} berlaku ${b.berlaku_mulai}?`)) return;
    setSibuk(true);
    try {
      await fetch(
        `/api/admin/kelas-cabang?cabang=${encodeURIComponent(b.cabang)}&produk=${encodeURIComponent(b.produk)}&berlaku_mulai=${b.berlaku_mulai}`,
        { method: "DELETE" });
      await segarkan();
    } finally { setSibuk(false); }
  }

  return (
    <>
      <JudulHalaman
        eyebrow="Master data · klasifikasi cabang"
        meta={<><TitikStatus nada={belumBerkelas.length ? "warn" : "good"} /> {terpetakan} dari {totalPasangan} pasangan bertier</>}
        judul="Tier Cabang"
        deskripsi={<>Tier cabang (Large/Medium/Small) per produk, dipakai jabatan bermekanisme “tabel tier” — disilang dengan
          tier orangnya untuk menentukan nominal di <Link className="lnk" href="/admin/tier">Tabel Tier Insentif</Link>.</>}
        aksi={
          <button className="btn" disabled={!cabangList.length} onClick={() => beriTier()}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tambah tier cabang
          </button>
        }
      />

      {pesan && (
        <div className="alert-box bad tr-pesan" role="alert">
          <span className="alert-ikon">!</span><span>{pesan}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      <div className="km-grid">
        <KartuMetrik label="Cabang terdaftar" nilai={cabangList.length} satuan="cabang"
                     catatan={`${daftarArea.length} area operasional`}
                     ikon={<Ikon nama="building" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Pasangan cabang·produk" nilai={totalPasangan} satuan="pasangan"
                     catatan={`${cabangList.length} cabang × ${produk.length} produk`}
                     ikon={<Ikon nama="network" ukuran={20} />} />
        <KartuMetrik label="Sudah bertier" nilai={terpetakan} satuan="pasangan"
                     catatan={`${baris.length} baris termasuk riwayat`}
                     ikon={<Ikon nama="checkCircle" ukuran={20} />} nada="good"
                     lencana={totalPasangan ? { teks: `${((terpetakan / totalPasangan) * 100).toFixed(1).replace(".", ",")}%`, nada: belumBerkelas.length ? "warn" : "good" } : undefined} />
        <KartuMetrik label="Belum punya tier" nilai={<span className={belumBerkelas.length ? "teks-bad" : ""}>{belumBerkelas.length}</span>} satuan="pasangan"
                     catatan="Insentif tier di sana bernilai nol"
                     ikon={<Ikon nama="alert" ukuran={20} />} nada={belumBerkelas.length ? "bad" : "netral"} />
      </div>

      {!muat && !cabangList.length && (
        <div className="alert-box warn tr-pesan">
          <span className="alert-ikon">!</span>
          <span>Master cabang API masih kosong, jadi belum ada cabang yang bisa diberi tier. Isi dulu di{" "}
            <Link className="lnk" href="/admin/cabang">Master Cabang API</Link>.</span>
        </div>
      )}

      {belumBerkelas.length > 0 && (
        <div className="tr-info tc-perhatian">
          <span className="sd-ikon"><Ikon nama="alert" ukuran={18} /></span>
          <div className="tr-info-teks">
            <b>Perhatian: {belumBerkelas.length} pasangan cabang·produk belum ditetapkan tier</b>
            <p>{belumBerkelas.slice(0, 8).map((b) => `${b.cabang}/${b.produk}`).join(", ")}
              {belumBerkelas.length > 8 && `, dan ${belumBerkelas.length - 8} lainnya`}. Petugas bermekanisme tier di sana tidak mendapat nominal.</p>
          </div>
          <button className="btn sm" onClick={() => { setSaringKelas("belum"); setHal(0); }}>
            Lihat yang belum ({belumBerkelas.length})
          </button>
        </div>
      )}

      {baru && (
        <section className="card tr-form">
          <div className="kt-form-kepala">
            <span className="kt-titik" aria-hidden />
            <h3>Klasifikasi tier cabang baru</h3>
            <span className="kt-mode">baris lama tetap disimpan sebagai riwayat</span>
            <button className="pa-tutup" onClick={() => setBaru(null)} aria-label="Tutup formulir">×</button>
          </div>
          <div className="tr-form-isi">
            <div className="tc-medan">
              <label className="field">
                <span>Kantor cabang <em className="kt-wajib">*</em></span>
                <Pilih nilai={baru.cabang} placeholder="Pilih cabang"
                       onPilih={(v) => setBaru({ ...baru, cabang: v })}
                       opsi={cabangList.map((c) => ({
                         nilai: c.cabang, label: c.cabang, ket: [c.branch_id, c.area].filter(Boolean).join(" · ") || undefined,
                       }))} />
              </label>
              <label className="field">
                <span>Produk</span>
                <Pilih nilai={baru.produk} cari={false}
                       onPilih={(v) => setBaru({ ...baru, produk: v })}
                       opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
              </label>
              <label className="field">
                <span>Berlaku mulai</span>
                <input type="date" className="num" value={baru.berlaku_mulai}
                       onChange={(e) => setBaru({ ...baru, berlaku_mulai: e.target.value })} />
              </label>
              <div className="field">
                <span>Tier</span>
                <div className="tc-kelas-pilih" role="radiogroup" aria-label="Tier cabang">
                  {KELAS_OPSI.map((k) => (
                    <button key={k.nilai} type="button" role="radio" aria-checked={baru.kelas === k.nilai}
                            className={"tr-kelas-btn " + k.nilai + (baru.kelas === k.nilai ? " on" : "")}
                            onClick={() => setBaru({ ...baru, kelas: k.nilai })}>
                      <i aria-hidden />{k.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="alert-box info">
              <span className="alert-ikon">i</span>
              <span>Untuk mengubah tier yang sudah ada, tambahkan baris baru dengan tanggal berlaku yang lebih baru — baris
                lama tetap disimpan supaya insentif periode lampau tidak ikut berubah.</span>
            </div>
          </div>
          <div className="sd-form-kaki">
            <button className="btn ghost" onClick={() => setBaru(null)}>Batal</button>
            <button className="btn" disabled={sibuk || !baru.cabang || !baru.produk}
                    onClick={async () => { if (await simpan(baru)) setBaru(null); }}>
              <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan tier"}
            </button>
          </div>
        </section>
      )}

      <section className="card pa-tabel-kartu">
        <div className="tr-pil" role="tablist" aria-label="Saring tier">
          {[["", "Semua baris", baris.length], ["large", "Large", hitungKelas("large")],
            ["medium", "Medium", hitungKelas("medium")], ["small", "Small", hitungKelas("small")]].map(([v, t, n]) => (
            <button key={String(v)} role="tab" aria-selected={saringKelas === v} className={saringKelas === v ? "on" : ""}
                    onClick={() => ubah(setSaringKelas)(String(v))}>{t} <span className="num">{n}</span></button>
          ))}
          <button role="tab" aria-selected={modeBelum} className={"tc-pil-belum" + (modeBelum ? " on" : "")}
                  onClick={() => ubah(setSaringKelas)("belum")}>
            <i aria-hidden /> Belum bertier <span className="num">{belumBerkelas.length}</span>
          </button>
        </div>
        <div className="pa-alat">
          <div className="pa-alat-cari">
            <KotakCari nilai={cari} onUbah={ubah(setCari)} lebar={360} placeholder="Cari cabang atau area…" />
          </div>
          <div className="ri-saring">
            <Pilih nilai={saringProduk} cari={false} onPilih={ubah(setSaringProduk)}
                   opsi={[{ nilai: "", label: "Semua produk" }, ...produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))]} />
            {daftarArea.length > 0 && (
              <Pilih nilai={saringArea} cari={daftarArea.length > 7} onPilih={ubah(setSaringArea)}
                     opsi={[{ nilai: "", label: "Semua area" }, ...daftarArea.map((a) => ({ nilai: a, label: a }))]} />
            )}
          </div>
          <span className="ri-alat-kanan faint">
            {modeBelum ? `${belumTersaring.length} pasangan belum bertier` : `${tersaring.length} dari ${baris.length} baris`}
          </span>
        </div>

        <div className="tabel-scroll">
          {modeBelum ? (
            <table className="pa-tabel tc-tabel">
              <thead>
                <tr><th>Cabang</th><th>Produk</th><th>Status</th><th className="r">Aksi</th></tr>
              </thead>
              <tbody>
                {belumTersaring.slice(halIni * PER, halIni * PER + PER).map((b) => (
                  <tr key={b.cabang + "|" + b.produk} className="pr-kurang">
                    <td><div className="tc-cabang">{b.cabang}</div><div className="pa-sub">{areaDari.get(b.cabang) ?? "—"}</div></td>
                    <td><span className="sp-produk">{b.produk}</span></td>
                    <td><span className="pa-status bad">belum bertier</span></td>
                    <td className="r">
                      <button className="btn tint sm" onClick={() => beriTier(b.cabang, b.produk)}>
                        <Ikon nama="plus" ukuran={14} /> Beri tier
                      </button>
                    </td>
                  </tr>
                ))}
                {!belumTersaring.length && (
                  <tr><td colSpan={4} className="empty">
                    {belumBerkelas.length ? "Tidak ada yang cocok dengan penyaring." : "Semua pasangan cabang·produk sudah bertier."}
                  </td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="pa-tabel tc-tabel">
              <thead>
                <tr><th>Cabang</th><th>Produk</th><th>Berlaku mulai</th><th style={{ width: 170 }}>Tier</th><th className="r" style={{ width: 70 }}>Aksi</th></tr>
              </thead>
              <tbody>
                {tersaring.slice(halIni * PER, halIni * PER + PER).map((b) => (
                  <tr key={`${b.cabang}|${b.produk}|${b.berlaku_mulai}`}>
                    <td><div className="tc-cabang">{b.cabang}</div><div className="pa-sub">{areaDari.get(b.cabang) ?? "—"}</div></td>
                    <td><span className="sp-produk">{b.produk}</span></td>
                    <td className="num tc-tanggal">{b.berlaku_mulai}</td>
                    <td>
                      <div className={"tc-kelas-sel " + b.kelas}>
                        <Pilih nilai={b.kelas} cari={false} onPilih={(v) => simpan({ ...b, kelas: v })} opsi={KELAS_OPSI} />
                      </div>
                    </td>
                    <td className="r">
                      <button className="pa-ikon-btn pr-mati" title={`Hapus tier ${b.cabang} · ${b.produk}`} disabled={sibuk}
                              onClick={() => hapus(b)}>
                        <Ikon nama="trash" ukuran={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!tersaring.length && (
                  <tr><td colSpan={5} className="empty">
                    {muat ? "Memuat…" : (cari || saringProduk || saringArea || saringKelas) ? "Tidak ada yang cocok." : "Belum ada tier cabang."}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="pa-pager">
          <span className="faint">
            {isi ? <>Menampilkan <b>{halIni * PER + 1}–{Math.min(halIni * PER + PER, isi)}</b> dari <b>{isi}</b> {modeBelum ? "pasangan" : "baris"}</> : "Tidak ada data"}
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
    </>
  );
}
