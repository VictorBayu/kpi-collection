"use client";

import { useEffect, useMemo, useState } from "react";
import Ikon from "@/components/Ikon";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

type Baris = {
  id: number; kelompok_produk: string; tipe_lokasi: "cabang" | "area"; cabang_atau_area: string;
  bucket: string; satuan: string; tier_aktif: number | null;
  t1: number | null; t2: number | null; t3: number | null; t4: number | null; t5: number | null;
};
type Pratinjau = {
  ringkas: { barisFile: number; barisTarget: number; berubah: number; baru: number };
  galat: string[]; jumlahGalat: number; peringatan: string[]; jumlahPeringatan: number;
};

const KELOMPOK = ["MIX", "R2", "R4"];
const BUCKET = [
  { kode: "delq0", label: "Delq0+" }, { kode: "delq30", label: "Delq30+" },
  { kode: "delq60", label: "Delq60+" }, { kode: "delq90", label: "Delq90+" },
  { kode: "coll1_30", label: "Coll1-30" },
];
const KOLOM = ["tier_aktif", "t5", "t4", "t3", "t2", "t1"] as const;
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const labelBulan = (p: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(p ?? "");
  return m ? `${BULAN[Number(m[2]) - 1]} ${m[1]}` : p;
};
const PER = 30;

/** 13,74% · Rp1,45 M · Rp850 rb */
function tampil(v: number | null, satuan: string) {
  if (v === null || v === undefined) return "—";
  if (satuan === "persen") return `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
  const a = Math.abs(v);
  if (a >= 1e9) return `Rp${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (a >= 1e6) return `Rp${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`;
  return `Rp${v.toLocaleString("id-ID")}`;
}

export default function TargetTierClient() {
  const [periode, setPeriode] = useState("");
  const [periodeNow, setPeriodeNow] = useState("");
  const [periodeAda, setPeriodeAda] = useState<{ periode: string; n: number }[]>([]);
  const [baris, setBaris] = useState<Baris[]>([]);
  const [lalu, setLalu] = useState<Baris[]>([]);
  const [kelompok, setKelompok] = useState("MIX");
  const [bucket, setBucket] = useState("delq0");
  const [cari, setCari] = useState("");
  const [hal, setHal] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [edit, setEdit] = useState<{ id: number; kolom: string; nilai: string } | null>(null);
  const [salinDari, setSalinDari] = useState("");
  const [salinTimpa, setSalinTimpa] = useState(false);

  async function muat(p: string = periode) {
    const r = await fetch(`/api/admin/target-tier${p ? `?periode=${p}` : ""}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat target."); return; }
    setPeriode(j.periode); setPeriodeNow(j.periodeBerjalan); setPeriodeAda(j.periodeAda ?? []);
    setBaris(j.baris ?? []); setLalu(j.lalu ?? []);
  }
  useEffect(() => { muat(); }, []);

  const kunci = (b: Pick<Baris, "kelompok_produk" | "tipe_lokasi" | "cabang_atau_area" | "bucket">) =>
    `${b.kelompok_produk}|${b.tipe_lokasi}|${b.cabang_atau_area.toUpperCase()}|${b.bucket}`;
  const petaLalu = useMemo(() => new Map(lalu.map((b) => [kunci(b), b])), [lalu]);

  const saring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return baris.filter((b) => b.kelompok_produk === kelompok && b.bucket === bucket
      && (!k || b.cabang_atau_area.toLowerCase().includes(k)));
  }, [baris, kelompok, bucket, cari]);
  const totalHal = Math.max(1, Math.ceil(saring.length / PER));
  const halIni = Math.min(hal, totalHal - 1);
  const potong = saring.slice(halIni * PER, halIni * PER + PER);

  const jumlahLokasi = new Set(baris.map((b) => `${b.tipe_lokasi}|${b.cabang_atau_area}`)).size;
  const berubah = baris.filter((b) => {
    const l = petaLalu.get(kunci(b));
    return l && KOLOM.some((c) => l[c] !== b[c]);
  }).length;

  async function unggah(mode: "pratinjau" | "simpan") {
    if (!berkas) { setPesan("Pilih berkas Excel dulu."); return; }
    setSibuk(true); setPesan(null);
    try {
      const fd = new FormData();
      fd.set("file", berkas); fd.set("periode", periode); fd.set("mode", mode);
      const r = await fetch("/api/admin/target-tier", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal membaca berkas."); return; }
      if (mode === "pratinjau") { setPratinjau(j); return; }
      setPratinjau(null); setBerkas(null);
      setPesan(`${j.disimpan} baris target ${labelBulan(periode)} tersimpan.`);
      await muat(periode);
    } finally { setSibuk(false); }
  }

  async function simpanSel() {
    if (!edit) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/target-tier", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: edit.id, kolom: edit.kolom, nilai: edit.nilai }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan sel."); return; }
      setEdit(null);
      await muat(periode);
    } finally { setSibuk(false); }
  }

  async function salin() {
    if (!salinDari) { setPesan("Pilih periode asal."); return; }
    if (!confirm(`Salin target ${labelBulan(salinDari)} ke ${labelBulan(periode)}${salinTimpa ? " (isi yang ada DIGANTI)" : ""}?`)) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/target-tier", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ dari: salinDari, ke: periode, timpa: salinTimpa }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyalin."); return; }
      setPesan(`${j.disalin} baris disalin ke ${labelBulan(periode)}.`);
      await muat(periode);
    } finally { setSibuk(false); }
  }

  async function hapusPeriode() {
    if (!confirm(`Hapus SELURUH target ${labelBulan(periode)}? Indikator bersumber Target Tier periode ini tidak bisa dihitung sampai diisi lagi.`)) return;
    setSibuk(true);
    try {
      const r = await fetch(`/api/admin/target-tier?periode=${periode}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      setPesan(r.ok ? `${j.dihapus} baris dihapus.` : (j.error ?? "Gagal menghapus."));
      await muat(periode);
    } finally { setSibuk(false); }
  }

  const opsiPeriode = [...new Set([...periodeAda.map((x) => x.periode), periodeNow, periode].filter(Boolean))]
    .sort().reverse()
    .map((p) => {
      const a = periodeAda.find((x) => x.periode === p);
      return { nilai: p, label: `${labelBulan(p)}${p === periodeNow ? " (berjalan)" : ""} · ${a ? a.n : "kosong"}` };
    });
  const bulanLain = periodeAda.filter((x) => x.periode !== periode);

  return (
    <div className="tt">
      <JudulHalaman
        eyebrow="Master"
        meta={<><TitikStatus nada={baris.length ? "good" : "warn"} /> {baris.length ? `${baris.length} baris target` : "belum ada target"} · {labelBulan(periode)}</>}
        judul="Target Tier"
        deskripsi="Target Delq & Coll per periode, kelompok produk (MIX/R2/R4), dan cabang atau area. Dipakai indikator yang di Create Indicator bersumber Tabel Target Tier."
        aksi={
          <a className="btn ghost" href={`/api/admin/target-tier/template?periode=${periode}`} download>
            <Ikon nama="download" ukuran={16} /> Unduh Template {labelBulan(periode)}
          </a>
        }
      />

      <div className="km-grid">
        <KartuMetrik label="Baris target" nilai={baris.length.toLocaleString("id-ID")} satuan="baris"
                     catatan="kelompok × lokasi × bucket" ikon={<Ikon nama="target" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Lokasi" nilai={jumlahLokasi.toLocaleString("id-ID")} satuan="cabang/area"
                     catatan="punya minimal satu target" ikon={<Ikon nama="building" ukuran={20} />} nada="netral" />
        <KartuMetrik label="Berubah dari bulan lalu" nilai={berubah.toLocaleString("id-ID")} satuan="baris"
                     catatan={lalu.length ? "disorot di tabel" : "bulan lalu belum ada target"}
                     ikon={<Ikon nama="history" ukuran={20} />} nada={berubah ? "warn" : "netral"} />
      </div>

      {pesan && <div className="alert-box info tt-pesan"><span className="alert-ikon">i</span><span>{pesan}</span></div>}

      <section className="card tt-kartu">
        <div className="tt-alat">
          <label className="tt-field">
            <span className="eyebrow">PERIODE</span>
            <Pilih nilai={periode} cari={false} opsi={opsiPeriode}
                   onPilih={(p) => { setPratinjau(null); setEdit(null); setHal(0); muat(p); }} />
          </label>
          <label className="tt-field">
            <span className="eyebrow">UNGGAH EXCEL</span>
            <input type="file" accept=".xlsx,.xls"
                   onChange={(e) => { setBerkas(e.target.files?.[0] ?? null); setPratinjau(null); }} />
          </label>
          <button className="btn" disabled={!berkas || sibuk} onClick={() => unggah("pratinjau")}>
            <Ikon nama="upload" ukuran={15} /> Periksa berkas
          </button>
          <details className="tt-salin">
            <summary>Salin dari periode lain</summary>
            <div className="tt-salin-isi">
              <Pilih nilai={salinDari} cari={false} onPilih={setSalinDari}
                     opsi={[{ nilai: "", label: "Pilih bulan asal…" },
                            ...bulanLain.map((x) => ({ nilai: x.periode, label: `${labelBulan(x.periode)} · ${x.n}` }))]} />
              <label className="tt-cek"><input type="checkbox" checked={salinTimpa}
                     onChange={(e) => setSalinTimpa(e.target.checked)} /> Timpa isi {labelBulan(periode)}</label>
              <button className="btn sm" disabled={sibuk} onClick={salin}>Salin</button>
              {baris.length > 0 && (
                <button className="btn ghost sm bahaya" disabled={sibuk} onClick={hapusPeriode}>Hapus target periode ini</button>
              )}
            </div>
          </details>
        </div>

        {pratinjau && (
          <div className="tt-pratinjau">
            <div className="tt-pratinjau-ringkas">
              <b>Hasil periksa untuk {labelBulan(periode)}</b>
              <span>{pratinjau.ringkas.barisFile} baris file → {pratinjau.ringkas.barisTarget} baris target
                · {pratinjau.ringkas.baru} baru · {pratinjau.ringkas.berubah} berubah dari isi sekarang</span>
            </div>
            {pratinjau.jumlahGalat > 0 && (
              <div className="tt-daftar bad">
                <b>{pratinjau.jumlahGalat} galat — harus diperbaiki sebelum disimpan</b>
                <ul>{pratinjau.galat.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </div>
            )}
            {pratinjau.jumlahPeringatan > 0 && (
              <div className="tt-daftar warn">
                <b>{pratinjau.jumlahPeringatan} peringatan — boleh disimpan, mohon dicek</b>
                <ul>{pratinjau.peringatan.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </div>
            )}
            <div className="tt-pratinjau-aksi">
              <button className="btn" disabled={sibuk || pratinjau.jumlahGalat > 0} onClick={() => unggah("simpan")}>
                <Ikon nama="check" ukuran={15} /> Simpan & ganti target {labelBulan(periode)}
              </button>
              <button className="btn ghost" onClick={() => setPratinjau(null)}>Batal</button>
            </div>
          </div>
        )}

        <div className="tt-tab" role="tablist">
          {KELOMPOK.map((k) => (
            <button key={k} role="tab" aria-selected={kelompok === k} className={kelompok === k ? "on" : ""}
                    onClick={() => { setKelompok(k); setHal(0); }}>
              {k} <span className="num">{baris.filter((b) => b.kelompok_produk === k && b.bucket === bucket).length}</span>
            </button>
          ))}
          <span className="tt-sela" />
          {BUCKET.map((b) => (
            <button key={b.kode} className={"tt-chip" + (bucket === b.kode ? " on" : "")}
                    onClick={() => { setBucket(b.kode); setHal(0); }}>{b.label}</button>
          ))}
          <div className="tt-cari"><KotakCari nilai={cari} onUbah={(v: string) => { setCari(v); setHal(0); }} placeholder="Cari cabang atau area…" /></div>
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel tt-tabel">
            <thead>
              <tr>
                <th>Cabang / area</th>
                <th className="r">Tier aktif</th>
                {[5, 4, 3, 2, 1].map((n) => <th key={n} className="r">Tier {n}</th>)}
              </tr>
            </thead>
            <tbody>
              {potong.map((b) => {
                const l = petaLalu.get(kunci(b));
                return (
                  <tr key={b.id}>
                    <td>
                      <div className="tt-tempat">{b.cabang_atau_area}</div>
                      <span className="pa-sub">{b.tipe_lokasi === "area" ? "level area" : "cabang"} · {b.satuan}</span>
                    </td>
                    {KOLOM.map((c) => {
                      const beda = !!l && l[c] !== b[c];
                      const sedang = edit?.id === b.id && edit.kolom === c;
                      const aktif = c !== "tier_aktif" && b.tier_aktif !== null && c === `t${b.tier_aktif}`;
                      return (
                        <td key={c} className={"r num tt-sel" + (beda ? " beda" : "") + (aktif ? " aktif" : "")}
                            title={beda ? `Bulan lalu: ${c === "tier_aktif" ? (l![c] ?? "—") : tampil(l![c] as number | null, b.satuan)}` : "Klik untuk ubah"}
                            onClick={() => !sedang && setEdit({ id: b.id, kolom: c, nilai: b[c] === null ? "" : String(b[c]) })}>
                          {sedang ? (
                            <input autoFocus className="num tt-input" value={edit!.nilai}
                                   onChange={(e) => setEdit({ ...edit!, nilai: e.target.value })}
                                   onKeyDown={(e) => { if (e.key === "Enter") simpanSel(); if (e.key === "Escape") setEdit(null); }}
                                   onBlur={() => setEdit(null)} />
                          ) : c === "tier_aktif" ? (b.tier_aktif ?? "—") : tampil(b[c], b.satuan)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!potong.length && (
                <tr><td colSpan={7} className="empty">
                  {baris.length ? "Tidak ada baris untuk pilihan ini." : `Belum ada target ${labelBulan(periode)}. Unduh template, isi, lalu unggah — atau salin dari periode lain.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pa-pager">
          <span className="faint">
            {saring.length ? <>Menampilkan <b>{halIni * PER + 1}–{Math.min(halIni * PER + PER, saring.length)}</b> dari <b>{saring.length}</b></> : "Tidak ada data"}
            {" "}· sel kuning = berubah dari bulan lalu · sel tebal = tier aktif · Enter simpan, Esc batal
          </span>
          {totalHal > 1 && (
            <div className="pa-pager-btn">
              <button className="btn ghost sm" disabled={halIni === 0} onClick={() => setHal(halIni - 1)}>← Sebelumnya</button>
              <span className="faint num">{halIni + 1} / {totalHal}</span>
              <button className="btn ghost sm" disabled={halIni >= totalHal - 1} onClick={() => setHal(halIni + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
