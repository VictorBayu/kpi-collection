"use client";

import { useEffect, useMemo, useState } from "react";
import Pilih from "@/components/Pilih";
import Ikon from "@/components/Ikon";
import InputAngka from "@/components/InputAngka";
import JudulHalaman, { TitikStatus } from "@/components/JudulHalaman";

type Ringkas = {
  id: string; kode: string; nama: string; produk: string | null; berlaku_mulai: string;
  aktif: boolean; jml_dimensi: number; jml_sel: number; dimensi_tanpa_kolom: number;
  dipakai: string[];
};
type Kolom = { kolom: string; label: string; jenis: string; kelompok: string | null; sumber: string };

type BandF = { k: string; label: string; teks: string; min: string; max: string; minInk: boolean; maxInk: boolean };
type DimF = { k: string; kode: string; label: string; kolom: string; jenis: "kategori" | "rentang"; band: BandF[] };
type DocF = {
  id: string | null; kode: string; nama: string; produk: string; bulan: string;
  keterangan: string; aktif: boolean; dimensi: DimF[];
};

const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 });
const namaBulan = (iso: string) =>
  new Date(iso.slice(0, 7) + "-01T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "numeric" });
const bulanIni = () => {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Label otomatis untuk band rentang yang labelnya dikosongkan. */
function labelRentang(b: BandF): string {
  const a = b.min === "" ? null : `${b.minInk ? "≥" : ">"} ${nf.format(Number(b.min))}`;
  const z = b.max === "" ? null : `${b.maxInk ? "≤" : "<"} ${nf.format(Number(b.max))}`;
  return a && z ? `${a} dan ${z}` : a ?? z ?? "Semua";
}

const bandBaru = (jenis: DimF["jenis"]): BandF => ({
  k: uid(), label: jenis === "rentang" ? "Semua" : "", teks: "", min: "", max: "", minInk: true, maxInk: false,
});

const dokBaru = (): DocF => ({
  id: null, kode: "", nama: "", produk: "", bulan: bulanIni(), keterangan: "", aktif: true,
  dimensi: [{ k: uid(), kode: "sumbu_1", label: "Sumbu 1", kolom: "", jenis: "kategori", band: [bandBaru("kategori")] }],
});

/**
 * Editor tabel parameter: sumbu, band, dan nilai sel dalam satu layar.
 *
 * Sumbu terakhir menjadi kolom matriks, sumbu lainnya menjadi baris —
 * urutannya bisa digeser supaya tampilannya bisa disamakan dengan tabel
 * aslinya (mis. PD di kolom, bahan kerja & OSP di baris). Satu versi
 * disimpan utuh sekaligus, jadi tidak pernah ada setengah tabel tersimpan.
 */
export default function Client() {
  const [tabel, setTabel] = useState<Ringkas[]>([]);
  const [kolom, setKolom] = useState<Kolom[]>([]);
  const [produk, setProduk] = useState<{ kode: string; nama: string }[]>([]);
  const [doc, setDoc] = useState<DocF | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [ubah, setUbah] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ nada: "good" | "bad"; teks: string } | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/param-tabel", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan({ nada: "bad", teks: j.error ?? "Gagal memuat." }); return; }
    setTabel(j.tabel ?? []); setKolom(j.kolom ?? []); setProduk(j.produk ?? []);
  }
  useEffect(() => { segarkan(); }, []);

  function bolehPindah() {
    return !ubah || confirm("Perubahan di tabel ini belum disimpan. Tinggalkan?");
  }

  async function buka(id: string, paksa = false) {
    if (!paksa && !bolehPindah()) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(`/api/admin/param-tabel?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan({ nada: "bad", teks: j.error ?? "Gagal memuat tabel." }); return; }
      const d = j.dokumen;
      setDoc({
        id: d.id, kode: d.kode, nama: d.nama, produk: d.produk ?? "", bulan: d.berlaku_mulai.slice(0, 7),
        keterangan: d.keterangan ?? "", aktif: d.aktif,
        dimensi: d.dimensi.map((x: any) => ({
          k: x.k, kode: x.kode, label: x.label, kolom: x.kolom_sumber ?? "", jenis: x.jenis,
          band: x.band.map((b: any) => ({
            k: b.k, label: b.label, teks: (b.nilai_teks ?? []).join(", "),
            min: b.nilai_min === null ? "" : String(b.nilai_min),
            max: b.nilai_max === null ? "" : String(b.nilai_max),
            minInk: b.min_inklusif, maxInk: b.max_inklusif,
          })),
        })),
      });
      setSel(Object.fromEntries(d.sel.map((s: any) => [s.band.join("|"), String(s.nominal)])));
      setUbah(false);
    } finally { setSibuk(false); }
  }

  // --- perubahan dokumen -------------------------------------------------
  const ganti = (patch: Partial<DocF>) => { if (doc) { setDoc({ ...doc, ...patch }); setUbah(true); } };
  const gantiDim = (i: number, patch: Partial<DimF>) =>
    doc && ganti({ dimensi: doc.dimensi.map((d, x) => (x === i ? { ...d, ...patch } : d)) });
  const gantiBand = (i: number, j: number, patch: Partial<BandF>) =>
    doc && gantiDim(i, { band: doc.dimensi[i].band.map((b, x) => (x === j ? { ...b, ...patch } : b)) });

  /** Sumbu baru selalu dimulai dengan satu band "Semua" yang terbuka ke dua arah,
   *  dan seluruh sel lama ikut dipindahkan ke band itu — jadi menambah sumbu
   *  tidak menghapus nilai yang sudah diisi. */
  function tambahDim() {
    if (!doc) return;
    const b = bandBaru("rentang");
    const n = doc.dimensi.length + 1;
    ganti({ dimensi: [...doc.dimensi, { k: uid(), kode: `sumbu_${n}`, label: `Sumbu ${n}`, kolom: "", jenis: "rentang", band: [b] }] });
    setSel(Object.fromEntries(Object.entries(sel).map(([k, v]) => [`${k}|${b.k}`, v])));
  }

  function hapusDim(i: number) {
    if (!doc || doc.dimensi.length <= 1) return;
    if (!confirm(`Hapus sumbu "${doc.dimensi[i].label}"? Nilai sel digabung ke sumbu yang tersisa (yang pertama dipakai bila bertabrakan).`)) return;
    const baru: Record<string, string> = {};
    for (const [k, v] of Object.entries(sel)) {
      const p = k.split("|"); p.splice(i, 1);
      const nk = p.join("|");
      if (!(nk in baru)) baru[nk] = v;
    }
    setSel(baru);
    ganti({ dimensi: doc.dimensi.filter((_, x) => x !== i) });
  }

  function geserDim(i: number, arah: -1 | 1) {
    if (!doc) return;
    const j = i + arah;
    if (j < 0 || j >= doc.dimensi.length) return;
    const dims = [...doc.dimensi];
    [dims[i], dims[j]] = [dims[j], dims[i]];
    setSel(Object.fromEntries(Object.entries(sel).map(([k, v]) => {
      const p = k.split("|"); [p[i], p[j]] = [p[j], p[i]]; return [p.join("|"), v];
    })));
    ganti({ dimensi: dims });
  }

  // --- matriks -----------------------------------------------------------
  const matriks = useMemo(() => {
    if (!doc || !doc.dimensi.length) return null;
    const dims = doc.dimensi;
    const kolomDim = dims[dims.length - 1];
    const barisDim = dims.slice(0, -1);
    const kombinasi = barisDim.reduce<BandF[][]>(
      (acc, d) => acc.flatMap((c) => d.band.map((b) => [...c, b])), [[]]);
    const total = kombinasi.length * kolomDim.band.length;
    let terisi = 0;
    for (const c of kombinasi) for (const b of kolomDim.band) {
      if ((sel[[...c.map((x) => x.k), b.k].join("|")] ?? "") !== "") terisi++;
    }
    return { kolomDim, barisDim, kombinasi, total, terisi };
  }, [doc, sel]);

  // --- simpan / salin / hapus ---------------------------------------------
  async function simpan() {
    if (!doc) return;
    setSibuk(true); setPesan(null);
    try {
      const dokumen = {
        id: doc.id, kode: doc.kode, nama: doc.nama, produk: doc.produk || null,
        berlaku_mulai: `${doc.bulan}-01`, keterangan: doc.keterangan || null, aktif: doc.aktif,
        dimensi: doc.dimensi.map((d) => ({
          k: d.k, kode: d.kode, label: d.label, kolom_sumber: d.kolom || null, jenis: d.jenis,
          band: d.band.map((b) => ({
            k: b.k,
            label: b.label.trim() || (d.jenis === "rentang" ? labelRentang(b) : b.teks),
            nilai_teks: b.teks.split(",").map((x) => x.trim()).filter(Boolean),
            nilai_min: b.min === "" ? null : Number(b.min),
            nilai_max: b.max === "" ? null : Number(b.max),
            min_inklusif: b.minInk, max_inklusif: b.maxInk,
          })),
        })),
        sel: Object.entries(sel)
          .filter(([, v]) => v !== "")
          .map(([k, v]) => ({ band: k.split("|"), nominal: Number(v) })),
      };
      const r = await fetch("/api/admin/param-tabel", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ aksi: "simpan", dokumen }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan({ nada: "bad", teks: j.error ?? "Gagal menyimpan." }); return; }
      setUbah(false);
      await segarkan();
      await bukaTanpaTanya(j.id);
      setPesan({ nada: "good", teks: "Tabel tersimpan. Hitung ulang kolom turunan yang memakainya agar nilainya ikut berubah." });
    } finally { setSibuk(false); }
  }

  async function bukaTanpaTanya(id: string) { setUbah(false); await buka(id, true); }

  async function salin() {
    if (!doc?.id) return;
    const ke = prompt("Salin ke versi baru yang berlaku mulai bulan (format YYYY-MM):", bulanIni());
    if (!ke) return;
    if (!/^\d{4}-\d{2}$/.test(ke)) { setPesan({ nada: "bad", teks: "Format bulan harus YYYY-MM, mis. 2026-12." }); return; }
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/param-tabel", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ aksi: "salin", id: doc.id, berlaku_mulai: `${ke}-01` }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan({ nada: "bad", teks: j.error ?? "Gagal menyalin." }); return; }
      await segarkan();
      await bukaTanpaTanya(j.id);
      setPesan({ nada: "good", teks: `Versi baru berlaku mulai ${namaBulan(ke)} dibuat.` });
    } finally { setSibuk(false); }
  }

  async function hapus() {
    if (!doc?.id) return;
    if (!confirm(`Hapus versi "${doc.nama}" yang berlaku mulai ${namaBulan(doc.bulan)}?`)) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(`/api/admin/param-tabel?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan({ nada: "bad", teks: j.error ?? "Gagal menghapus." }); return; }
      setDoc(null); setSel({}); setUbah(false);
      await segarkan();
      setPesan({ nada: "good", teks: "Versi tabel dihapus." });
    } finally { setSibuk(false); }
  }

  // --- tampilan ------------------------------------------------------------
  const grup = useMemo(() => {
    const m = new Map<string, Ringkas[]>();
    for (const t of tabel) m.set(t.kode, [...(m.get(t.kode) ?? []), t]);
    return Array.from(m.entries());
  }, [tabel]);

  const opsiKolom = kolom.map((c) => ({
    nilai: c.kolom, label: c.label,
    ket: `${c.kolom} · ${c.jenis}`,
    grup: c.sumber === "pendukung" ? `Pendukung — ${c.kelompok ?? "Lain"}` : (c.kelompok ?? undefined),
  }));
  const belumKolom = tabel.filter((t) => t.dimensi_tanpa_kolom > 0).length;

  return (
    <>
      <JudulHalaman
        eyebrow="Data & indikator"
        meta={<><TitikStatus nada={belumKolom ? "warn" : "good"} /> {belumKolom ? `${belumKolom} versi belum lengkap kolomnya` : `${tabel.length} versi tabel`}</>}
        judul="Tabel Parameter"
        deskripsi="Nilai rupiah yang dicari dari kombinasi beberapa sumbu, mis. kategori bahan kerja × OSP × PD. Dipakai lewat Kolom Turunan mode “Tabel parameter”."
        aksi={
          <button className="btn" disabled={sibuk}
                  onClick={() => { if (bolehPindah()) { setDoc(dokBaru()); setSel({}); setUbah(false); setPesan(null); } }}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tabel baru
          </button>
        }
      />

      {pesan && (
        <div className={"alert-box mb " + pesan.nada} role="status">
          <span className="alert-ikon">{pesan.nada === "good" ? "✓" : "!"}</span>
          <span>{pesan.teks}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      <div className="pt-tata">
        <aside className="card pt-daftar" aria-label="Daftar tabel parameter">
          {!grup.length && <p className="faint small pt-kosong">Belum ada tabel parameter.</p>}
          {grup.map(([kode, versi]) => (
            <div className="pt-grup" key={kode}>
              <div className="pt-grup-nama">{versi[0].nama}</div>
              <div className="pa-sub num">{kode}{versi[0].produk ? ` · ${versi[0].produk}` : ""}</div>
              <div className="pt-versi">
                {versi.map((v) => (
                  <button key={v.id} type="button"
                          className={"pt-versi-chip" + (doc?.id === v.id ? " on" : "") + (v.aktif ? "" : " mati")}
                          onClick={() => buka(v.id)}
                          title={`${v.jml_dimensi} sumbu · ${v.jml_sel} sel${v.aktif ? "" : " · nonaktif"}`}>
                    {namaBulan(v.berlaku_mulai)}
                    {v.dimensi_tanpa_kolom > 0 && <i className="pt-titik-warn" aria-label="ada sumbu tanpa kolom" />}
                  </button>
                ))}
              </div>
              {versi[0].dipakai.length > 0 && (
                <div className="pa-sub">dipakai: {versi[0].dipakai.join(", ")}</div>
              )}
            </div>
          ))}
        </aside>

        {!doc ? (
          <section className="card pt-kosong-besar">
            <span className="km-ikon accent"><Ikon nama="table" ukuran={22} /></span>
            <b>Pilih versi tabel di kiri, atau buat tabel baru.</b>
            <span className="faint small">Satu tabel bisa punya beberapa versi; periode memakai versi terbaru yang sudah berlaku.</span>
          </section>
        ) : (
          <section className="pt-isi">
            {/* Identitas */}
            <div className="card pt-kartu">
              <div className="pt-kepala">
                <h3>{doc.id ? doc.nama || doc.kode : "Tabel parameter baru"}</h3>
                {ubah && <span className="pt-belum">belum disimpan</span>}
                <span className="pt-aksi">
                  {doc.id && <button className="btn ghost sm" disabled={sibuk} onClick={salin}><Ikon nama="copy" ukuran={14} /> Salin ke bulan lain</button>}
                  {doc.id && <button className="btn danger sm" disabled={sibuk} onClick={hapus}><Ikon nama="trash" ukuran={14} /></button>}
                  <button className="btn sm" disabled={sibuk} onClick={simpan}>
                    <Ikon nama="check" ukuran={14} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan"}
                  </button>
                </span>
              </div>
              <div className="pt-identitas">
                <label className="field">
                  <span>Kode</span>
                  <input className="num" value={doc.kode} disabled={!!doc.id} placeholder="insentif_penyelesaian_r2"
                         onChange={(e) => ganti({ kode: e.target.value.toLowerCase() })} />
                </label>
                <label className="field pt-lebar">
                  <span>Nama</span>
                  <input value={doc.nama} placeholder="Insentif Penyelesaian Kontrak Prioritas R2"
                         onChange={(e) => ganti({ nama: e.target.value })} />
                </label>
                <label className="field">
                  <span>Produk</span>
                  <Pilih nilai={doc.produk} cari={false} placeholder="semua produk"
                         onPilih={(v) => ganti({ produk: v })}
                         opsi={[{ nilai: "", label: "Semua produk" },
                                ...produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))]} />
                </label>
                <label className="field">
                  <span>Berlaku mulai</span>
                  <input type="month" value={doc.bulan} onChange={(e) => ganti({ bulan: e.target.value })} />
                </label>
                <label className="field pt-lebar">
                  <span>Keterangan</span>
                  <input value={doc.keterangan} placeholder="mis. nilai rupiah per kontrak"
                         onChange={(e) => ganti({ keterangan: e.target.value })} />
                </label>
                <label className="pt-cek">
                  <input type="checkbox" checked={doc.aktif} onChange={(e) => ganti({ aktif: e.target.checked })} />
                  <span>Aktif</span>
                </label>
              </div>
            </div>

            {/* Sumbu & band */}
            <div className="card pt-kartu">
              <div className="pt-kepala">
                <h3>Sumbu &amp; band</h3>
                <span className="faint small">Sumbu terakhir tampil sebagai kolom matriks.</span>
                <span className="pt-aksi">
                  <button className="btn tint sm" onClick={tambahDim}><Ikon nama="plus" ukuran={14} /> Sumbu</button>
                </span>
              </div>

              {doc.dimensi.map((d, i) => (
                <div className="pt-dim" key={d.k}>
                  <div className="pt-dim-kepala">
                    <span className="pt-nomor">{i === doc.dimensi.length - 1 ? "Kolom" : `Baris ${i + 1}`}</span>
                    <input className="pt-dim-label" value={d.label} placeholder="Nama sumbu"
                           onChange={(e) => gantiDim(i, { label: e.target.value })} />
                    <input className="num pt-dim-kode" value={d.kode} title="Kode sumbu"
                           onChange={(e) => gantiDim(i, { kode: e.target.value.toLowerCase() })} />
                    <div className="pt-dim-pilih">
                      <Pilih nilai={d.jenis} cari={false}
                             onPilih={(v) => gantiDim(i, { jenis: v as DimF["jenis"] })}
                             opsi={[
                               { nilai: "kategori", label: "Kategori", ket: "cocok teks" },
                               { nilai: "rentang", label: "Rentang angka", ket: "batas bawah–atas" },
                             ]} />
                    </div>
                    <div className="pt-dim-kolom">
                      <Pilih nilai={d.kolom} placeholder="kolom sumber"
                             onPilih={(v) => gantiDim(i, { kolom: v })}
                             opsi={[{ nilai: "", label: "— belum diatur —" }, ...opsiKolom]} />
                    </div>
                    <span className="pt-dim-tombol">
                      <button className="pa-ikon-btn" title="Geser ke atas" disabled={i === 0} onClick={() => geserDim(i, -1)}>↑</button>
                      <button className="pa-ikon-btn" title="Geser ke bawah" disabled={i === doc.dimensi.length - 1} onClick={() => geserDim(i, 1)}>↓</button>
                      <button className="pa-ikon-btn" title="Hapus sumbu" disabled={doc.dimensi.length <= 1} onClick={() => hapusDim(i)}>
                        <Ikon nama="trash" ukuran={14} />
                      </button>
                    </span>
                  </div>
                  {!d.kolom && (
                    <p className="pt-peringatan">Kolom sumber belum diatur — kolom turunan yang memakai tabel ini akan gagal dihitung sampai diisi.</p>
                  )}

                  <div className="pt-band-daftar">
                    {d.band.map((b, j) => (
                      <div className="pt-band" key={b.k}>
                        <input className="pt-band-label" value={b.label}
                               placeholder={d.jenis === "rentang" ? labelRentang(b) : "label band"}
                               onChange={(e) => gantiBand(i, j, { label: e.target.value })} />
                        {d.jenis === "kategori" ? (
                          <input className="pt-band-teks" value={b.teks}
                                 placeholder="nilai persis dari data, pisahkan dengan koma"
                                 onChange={(e) => gantiBand(i, j, { teks: e.target.value })} />
                        ) : (
                          <span className="pt-rentang">
                            <button type="button" className="pt-op" title="Ganti inklusif/eksklusif"
                                    onClick={() => gantiBand(i, j, { minInk: !b.minInk })}>{b.minInk ? "≥" : ">"}</button>
                            <InputAngka className="num" desimal value={b.min} placeholder="tanpa batas"
                                        onChange={(v) => gantiBand(i, j, { min: v })} />
                            <span className="faint">dan</span>
                            <button type="button" className="pt-op" title="Ganti inklusif/eksklusif"
                                    onClick={() => gantiBand(i, j, { maxInk: !b.maxInk })}>{b.maxInk ? "≤" : "<"}</button>
                            <InputAngka className="num" desimal value={b.max} placeholder="tanpa batas"
                                        onChange={(v) => gantiBand(i, j, { max: v })} />
                          </span>
                        )}
                        <button className="pa-ikon-btn" title="Hapus band" disabled={d.band.length <= 1}
                                onClick={() => gantiDim(i, { band: d.band.filter((_, x) => x !== j) })}>×</button>
                      </div>
                    ))}
                    <button className="btn ghost sm pt-band-tambah"
                            onClick={() => gantiDim(i, { band: [...d.band, bandBaru(d.jenis)] })}>
                      <Ikon nama="plus" ukuran={13} /> Band
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Matriks nilai */}
            {matriks && (
              <div className="card pt-kartu">
                <div className="pt-kepala">
                  <h3>Nilai sel (Rp)</h3>
                  <span className={"pt-hitung" + (matriks.terisi < matriks.total ? " warn" : "")}>
                    {matriks.terisi} dari {matriks.total} sel terisi
                  </span>
                  <span className="faint small">Sel kosong bernilai 0.</span>
                </div>
                <div className="tabel-scroll">
                  <table className="pt-matriks">
                    <thead>
                      <tr>
                        {matriks.barisDim.map((d) => <th key={d.k} rowSpan={2}>{d.label}</th>)}
                        <th className="pt-kolom-judul" colSpan={matriks.kolomDim.band.length}>{matriks.kolomDim.label}</th>
                      </tr>
                      <tr>
                        {matriks.kolomDim.band.map((b) => (
                          <th key={b.k} className="r">{b.label || labelRentang(b)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matriks.kombinasi.map((c, ri) => {
                        const sebelum = matriks.kombinasi[ri - 1];
                        let berubah = !sebelum;
                        return (
                          <tr key={c.map((b) => b.k).join("|") || "satu"}>
                            {c.map((b, ci) => {
                              berubah = berubah || sebelum[ci].k !== b.k;
                              return (
                                <td key={b.k} className={"pt-baris-label" + (berubah ? "" : " ulang")}>
                                  {berubah ? (b.label || labelRentang(b)) : ""}
                                </td>
                              );
                            })}
                            {matriks.kolomDim.band.map((cb) => {
                              const kunci = [...c.map((b) => b.k), cb.k].join("|");
                              return (
                                <td key={cb.k} className="pt-sel">
                                  <InputAngka className="num r" value={sel[kunci] ?? ""} placeholder="0"
                                              onChange={(v) => { setSel({ ...sel, [kunci]: v }); setUbah(true); }} />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
