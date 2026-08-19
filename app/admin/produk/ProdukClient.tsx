"use client";

import { useEffect, useState } from "react";
import KotakCari from "@/components/KotakCari";

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

  async function segarkan() {
    setMuat(true);
    try {
      const r = await fetch("/api/admin/produk", { cache: "no-store" });
      const j = await r.json();
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

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Master Produk</h2>
          <p>
            Menentukan produk apa yang ditangani tiap jabatan. Jabatan MIX
            menangani lebih dari satu, dan menerima indikator kedua produknya.
          </p>
        </div>
      </div>

      {pesan && <div className="alert bad mb">{pesan}</div>}

      {/* --- daftar produk --- */}
      <section className="card mb">
        <div className="cardhead rowbetween">
          <h3 style={{ fontSize: 15 }}>Produk terdaftar</h3>
          <button className="btn sm" disabled={sibuk}
                  onClick={() => setSunting({ kode: "", nama: "", urutan: 0, aktif: true })}>
            + Tambah produk
          </button>
        </div>

        <div className="prod-baris">
          {aktif.map((p) => (
            <div className="prod-kartu" key={p.kode}>
              <div>
                <b className="num">{p.kode}</b>
                <div className="faint">{p.nama}</div>
              </div>
              <div className="prod-aksi">
                <button className="btn ghost sm" onClick={() => setSunting(p)}>Ubah</button>
                <button className="btn ghost sm bahaya" disabled={sibuk}
                        onClick={() => kirim(`/api/admin/produk?kode=${encodeURIComponent(p.kode)}`, "DELETE")}>
                  Nonaktifkan
                </button>
              </div>
            </div>
          ))}
          {!aktif.length && !muat && (
            <p className="empty">Belum ada produk. Tambahkan minimal satu.</p>
          )}
        </div>
      </section>

      {/* --- formulir produk --- */}
      {sunting && (
        <section className="card card-pad narrow mb">
          <h3>{sunting.kode ? `Ubah produk ${sunting.kode}` : "Produk baru"}</h3>
          <div className="grid2 mt">
            <label>
              <span className="faint small">Kode</span>
              <input value={sunting.kode} placeholder="R2"
                     onChange={(e) => setSunting({ ...sunting, kode: e.target.value.toUpperCase() })} />
            </label>
            <label>
              <span className="faint small">Nama</span>
              <input value={sunting.nama} placeholder="Roda 2"
                     onChange={(e) => setSunting({ ...sunting, nama: e.target.value })} />
            </label>
          </div>
          <div className="formact">
            <button className="btn sm" disabled={sibuk}
                    onClick={async () => {
                      const asli = produk.find((p) => p.kode === sunting.kode);
                      const ok = await kirim("/api/admin/produk", "POST", {
                        ...sunting, kodeAsli: asli ? sunting.kode : "",
                      });
                      if (ok) setSunting(null);
                    }}>
              Simpan
            </button>
            <button className="btn ghost sm" onClick={() => setSunting(null)}>Batal</button>
          </div>
        </section>
      )}

      {/* --- pemetaan jabatan --- */}
      <section className="card">
        <div className="cardhead">
          <div className="rowbetween">
            <h3 style={{ fontSize: 15 }}>Jabatan · produk yang ditangani</h3>
            <span className="faint small">
              {jabatan.length} jabatan
              {belumDipetakan > 0 && ` · ${belumDipetakan} belum dipetakan`}
            </span>
          </div>
          <div className="prod-saring">
            <KotakCari nilai={cari} onUbah={setCari} lebar={240}
                       placeholder="Cari nama jabatan" />
            <label className="prod-cek">
              <input type="checkbox" checked={hanyaKosong}
                     onChange={(e) => setHanyaKosong(e.target.checked)} />
              Hanya yang belum dipetakan
            </label>
          </div>
        </div>

        <table className="rapat">
          <thead>
            <tr>
              <th>Jabatan</th>
              <th style={{ width: 90 }} className="r">Pemakai</th>
              <th>Produk</th>
            </tr>
          </thead>
          <tbody>
            {terlihat.map((j) => {
              const punya = produkDari(j.alias);
              return (
                <tr key={j.alias} className={punya.length ? "" : "kurang"}>
                  <td><b>{j.alias}</b></td>
                  <td className="r num faint">{j.pemakai}</td>
                  <td>
                    <div className="prod-cip">
                      {aktif.map((p) => (
                        <button key={p.kode} disabled={sibuk}
                                className={"cip" + (punya.includes(p.kode) ? " on" : "")}
                                onClick={() => ubahPeta(j.alias, p.kode)}>
                          {p.kode}
                        </button>
                      ))}
                      {!punya.length && (
                        <span className="faint small">belum dipetakan — indikatornya tidak akan dihitung</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!terlihat.length && (
              <tr><td colSpan={3} className="empty">
                {muat ? "Memuat…" : "Tidak ada jabatan yang cocok."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
