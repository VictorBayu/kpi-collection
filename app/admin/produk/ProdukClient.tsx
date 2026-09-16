"use client";

import { useEffect, useState } from "react";
import KotakCari from "@/components/KotakCari";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

type Produk = { kode: string; nama: string; urutan: number; aktif: boolean };
type Jabatan = { alias: string; jabatan: string; pemakai: number };
type Peta = { alias: string; produk: string };

/**
 * Master produk dan pemetaan jabatan → produk.
 *
 * Halaman ini menjawab satu hal yang selama ini hanya tersimpan di kepala
 * orang: bahwa "RE MIX" berarti menangani R2 dan R4 sekaligus. Selama
 * pengetahuan itu cuma ada di tulisan nama jabatan, mesin hitung tidak
 * punya cara mengetahuinya, dan pemegang jabatan MIX akan kehilangan
 * separuh indikatornya tanpa ada yang menyadari.
 *
 * Produk dipilih dari daftar, tidak diketik, karena satu salah ketik
 * membuat pencocokan gagal diam-diam — angkanya jadi nol, bukan error.
 */
export default function ProdukClient() {
  const [produk, setProduk] = useState<Produk[]>([]);
  const [jabatan, setJabatan] = useState<Jabatan[]>([]);
  const [peta, setPeta] = useState<Peta[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [sunting, setSunting] = useState<Produk | null>(null);
  const [hanyaKosong, setHanyaKosong] = useState(false);
  const [hal, setHal] = useState(0);

  async function segarkan() {
    setMuat(true);
    try {
      const r = await fetch("/api/admin/produk", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal memuat data produk."); return; }
      setProduk(j.produk ?? []);
      setJabatan(j.jabatan ?? []);
      setPeta(j.pemetaan ?? []);
    } finally { setMuat(false); }
  }
  useEffect(() => { segarkan(); }, []);

  const produkDari = (alias: string) =>
    peta.filter((p) => p.alias === alias).map((p) => p.produk);

  async function kirim(url: string, cara: string, badan?: unknown) {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(url, {
        method: cara,
        headers: badan ? { "content-type": "application/json" } : undefined,
        body: badan ? JSON.stringify(badan) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return false; }
      await segarkan();
      return true;
    } finally { setSibuk(false); }
  }

  /** Menyalakan atau mematikan satu produk pada satu jabatan. */
  async function ubahPeta(alias: string, kode: string) {
    const kini = produkDari(alias);
    const baru = kini.includes(kode)
      ? kini.filter((k) => k !== kode)
      : [...kini, kode];
    // Diubah di layar lebih dulu supaya klik terasa langsung; kalau
    // permintaannya gagal, segarkan() mengembalikannya ke keadaan asli.
    setPeta((p) => [
      ...p.filter((x) => x.alias !== alias),
      ...baru.map((produk) => ({ alias, produk })),
    ]);
    await kirim("/api/admin/produk", "PUT", { alias, produk: baru });
  }

  const aktif = produk.filter((p) => p.aktif);
  const terlihat = jabatan.filter((j) => {
    if (hanyaKosong && produkDari(j.alias).length) return false;
    if (!cari.trim()) return true;
    return j.alias.toLowerCase().includes(cari.trim().toLowerCase());
  });
  const belumDipetakan = jabatan.filter((j) => !produkDari(j.alias).length).length;
  const mix = jabatan.filter((j) => produkDari(j.alias).length > 1).length;
  const belumBerpemakai = jabatan.filter((j) => !produkDari(j.alias).length && j.pemakai > 0).length;

  const PER = 15;
  const totalHal = Math.max(1, Math.ceil(terlihat.length / PER));
  const halIni = Math.min(hal, totalHal - 1);
  const potong = terlihat.slice(halIni * PER, halIni * PER + PER);
  // Warna ikon produk diputar supaya kartu mudah dibedakan sekilas.
  const NADA = ["accent", "info", "warn", "good"];

  async function simpanProduk() {
    if (!sunting) return;
    const asli = produk.find((p) => p.kode === sunting.kode);
    const ok = await kirim("/api/admin/produk", "POST", { ...sunting, kodeAsli: asli ? sunting.kode : "" });
    if (ok) setSunting(null);
  }

  return (
    <>
      <JudulHalaman
        eyebrow="Master"
        meta={<><TitikStatus nada={belumBerpemakai ? "warn" : "good"} /> {belumBerpemakai ? `${belumBerpemakai} jabatan berpemakai belum dipetakan` : "semua jabatan berpemakai terpetakan"}</>}
        judul="Master Produk"
        deskripsi="Menentukan produk apa yang ditangani tiap jabatan. Jabatan MIX menangani lebih dari satu produk, dan menerima indikator kedua produknya."
        aksi={
          <button className="btn" disabled={sibuk} onClick={() => setSunting({ kode: "", nama: "", urutan: 0, aktif: true })}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tambah produk
          </button>
        }
      />

      {pesan && !sunting && (
        <div className="alert-box bad pr-pesan" role="alert">
          <span className="alert-ikon">!</span><span>{pesan}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      <div className="km-grid">
        <KartuMetrik label="Produk aktif" nilai={aktif.length} satuan="produk"
                     catatan={produk.length > aktif.length ? `${produk.length - aktif.length} nonaktif` : "Semua produk aktif"}
                     ikon={<Ikon nama="box" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Jabatan terdaftar" nilai={jabatan.length} satuan="jabatan"
                     catatan={`${jabatan.reduce((a, j) => a + j.pemakai, 0).toLocaleString("id-ID")} pemakai`}
                     ikon={<Ikon nama="badge" ukuran={20} />} />
        <KartuMetrik label="Jabatan MIX" nilai={mix} satuan="jabatan"
                     catatan="Menangani lebih dari satu produk"
                     ikon={<Ikon nama="layers" ukuran={20} />} nada="good" />
        <KartuMetrik label="Belum dipetakan" nilai={<span className={belumDipetakan ? "teks-bad" : ""}>{belumDipetakan}</span>} satuan="jabatan"
                     catatan="Indikatornya tidak akan dihitung"
                     ikon={<Ikon nama="alert" ukuran={20} />} nada={belumDipetakan ? "bad" : "netral"} />
      </div>

      {/* --- daftar produk --- */}
      <section className="card pr-produk">
        <div className="rk-kartu-kepala">
          <span className="km-ikon accent"><Ikon nama="box" ukuran={20} /></span>
          <div>
            <h2>Produk terdaftar <span className="da-hitung num">{aktif.length} item</span></h2>
            <p className="faint small">Kode produk dipakai untuk mencocokkan indikator dengan jabatan.</p>
          </div>
        </div>
        <div className="pr-grid">
          {aktif.map((p, i) => (
            <div className="pr-kartu" key={p.kode}>
              <span className={"pr-kode " + NADA[i % NADA.length]}>{p.kode}</span>
              <div className="pr-teks">
                <b>{p.nama}</b>
                <span><span className="pa-status good">aktif</span> <span className="num faint">kode {p.kode}</span></span>
              </div>
              <div className="pr-aksi">
                <button className="pa-ikon-btn" title={`Ubah ${p.kode}`} onClick={() => { setPesan(null); setSunting(p); }}>
                  <Ikon nama="pencil" ukuran={15} />
                </button>
                <button className="pa-ikon-btn pr-mati" title={`Nonaktifkan ${p.kode}`} disabled={sibuk}
                        onClick={() => { if (confirm(`Nonaktifkan produk ${p.kode}? Pemetaan jabatannya tidak lagi dihitung.`)) kirim(`/api/admin/produk?kode=${encodeURIComponent(p.kode)}`, "DELETE"); }}>
                  <Ikon nama="eyeOff" ukuran={15} />
                </button>
              </div>
            </div>
          ))}
          {!aktif.length && !muat && (
            <p className="empty">Belum ada produk. Tambahkan minimal satu.</p>
          )}
        </div>
      </section>

      {/* --- pemetaan jabatan --- */}
      <section className="card pa-tabel-kartu">
        <div className="pa-alat pr-alat">
          <div className="pr-alat-judul">
            <h2>
              Jabatan · produk yang ditangani
              <span className="da-hitung num">{jabatan.length} jabatan</span>
              {belumDipetakan > 0 && <span className="pr-lencana-warn"><Ikon nama="alert" ukuran={12} /> {belumDipetakan} belum dipetakan</span>}
            </h2>
            <p className="pa-sub">Klik kode produk untuk menyalakan atau mematikannya — tersimpan langsung.</p>
          </div>
          <div className="pr-alat-kanan">
            <KotakCari nilai={cari} onUbah={(v) => { setCari(v); setHal(0); }} lebar={240} placeholder="Cari nama jabatan…" />
            <label className={"pr-cek" + (hanyaKosong ? " on" : "")}>
              <input type="checkbox" checked={hanyaKosong}
                     onChange={(e) => { setHanyaKosong(e.target.checked); setHal(0); }} />
              Hanya yang belum dipetakan
            </label>
          </div>
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel pr-tabel">
            <thead>
              <tr>
                <th>Jabatan</th>
                <th className="r" style={{ width: 110 }}>Pemakai</th>
                <th>Produk yang ditangani</th>
                <th style={{ width: 150 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {potong.map((j) => {
                const punya = produkDari(j.alias);
                const status = !punya.length
                  ? (j.pemakai ? { t: "perlu aksi", n: "bad" } : { t: "tanpa pemakai", n: "netral" })
                  : punya.length > 1 ? { t: "MIX", n: "accent" } : { t: "dedicated", n: "good" };
                return (
                  <tr key={j.alias} className={!punya.length && j.pemakai ? "pr-kurang" : undefined}>
                    <td><span className="pr-jabatan">{j.alias}</span></td>
                    <td className={"r num " + (j.pemakai ? "" : "faint")}>{j.pemakai.toLocaleString("id-ID")}</td>
                    <td>
                      <div className="pr-cip">
                        {aktif.map((p) => {
                          const on = punya.includes(p.kode);
                          return (
                            <button key={p.kode} disabled={sibuk} aria-pressed={on}
                                    className={"pr-toggle" + (on ? " on" : "")}
                                    title={on ? `Lepas ${p.kode} dari ${j.alias}` : `Tambahkan ${p.kode} ke ${j.alias}`}
                                    onClick={() => ubahPeta(j.alias, p.kode)}>
                              {on && <Ikon nama="check" ukuran={12} tebal={2.6} />}{p.kode}
                            </button>
                          );
                        })}
                        {!punya.length && (
                          <span className="pr-catatan">belum dipetakan — indikatornya tidak akan dihitung</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {status.n === "accent" || status.n === "netral"
                        ? <span className={"ri-status " + status.n}>{status.t}</span>
                        : <span className={"pa-status " + status.n}>{status.t}</span>}
                    </td>
                  </tr>
                );
              })}
              {!potong.length && (
                <tr><td colSpan={4} className="empty">
                  {muat ? "Memuat…" : "Tidak ada jabatan yang cocok."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pa-pager">
          <span className="faint">
            {terlihat.length
              ? <>Menampilkan <b>{halIni * PER + 1}–{Math.min(halIni * PER + PER, terlihat.length)}</b> dari <b>{terlihat.length}</b> jabatan</>
              : "Tidak ada data"}
          </span>
          {totalHal > 1 && (
            <div className="pa-pager-btn">
              <button className="btn ghost sm" disabled={halIni === 0} onClick={() => setHal(halIni - 1)}>← Sebelumnya</button>
              {Array.from({ length: totalHal }, (_, i) => (
                <button key={i} className={"pa-hal num" + (i === halIni ? " on" : "")}
                        aria-current={i === halIni ? "page" : undefined} onClick={() => setHal(i)}>{i + 1}</button>
              ))}
              <button className="btn ghost sm" disabled={halIni >= totalHal - 1} onClick={() => setHal(halIni + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      </section>

      {/* --- formulir produk --- */}
      {sunting && (
        <div className="modal-latar" onMouseDown={(e) => { if (e.target === e.currentTarget && !sibuk) setSunting(null); }}>
          <div className="modal pr-modal" role="dialog" aria-modal="true" aria-labelledby="pr-judul">
            <div className="modal-kepala">
              <span className="sd-ikon accent"><Ikon nama="box" ukuran={20} /></span>
              <div className="modal-judul">
                <h2 id="pr-judul">{produk.some((p) => p.kode === sunting.kode && sunting.kode) ? `Ubah produk ${sunting.kode}` : "Produk baru"}</h2>
                <p>Kode dipakai mencocokkan indikator; nama hanya untuk tampilan.</p>
              </div>
              <button className="pa-tutup" onClick={() => setSunting(null)} disabled={sibuk} aria-label="Tutup">×</button>
            </div>
            <div className="modal-isi">
              {pesan && <div className="alert-box bad"><span className="alert-ikon">!</span><span>{pesan}</span></div>}
              <div className="pr-form">
                <label className="field">
                  <span>Kode</span>
                  <input value={sunting.kode} placeholder="R2" className="num"
                         onChange={(e) => setSunting({ ...sunting, kode: e.target.value.toUpperCase() })} />
                </label>
                <label className="field">
                  <span>Nama</span>
                  <input value={sunting.nama} placeholder="Roda 2"
                         onChange={(e) => setSunting({ ...sunting, nama: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="modal-kaki">
              <button className="btn ghost" disabled={sibuk} onClick={() => setSunting(null)}>Batal</button>
              <button className="btn" disabled={sibuk || !sunting.kode.trim()} onClick={simpanProduk}>
                <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
