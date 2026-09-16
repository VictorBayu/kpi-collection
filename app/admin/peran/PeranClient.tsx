"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

type MenuKatalog = { kode: string; label: string; href: string; grup: string | null };
type Peran = {
  kode: string; nama: string; keterangan: string | null;
  bawaan: boolean; urutan: number; aktif: boolean;
  pengguna: number; menu: string[];
};

/**
 * Peran & hak akses menu.
 *
 * Dua hal dikelola di satu layar karena tidak berguna sendiri-sendiri:
 * membuat peran tanpa menentukan menunya menghasilkan peran yang tidak
 * bisa membuka apa pun, dan sebaliknya. Daftar peran di kiri, hak menunya
 * di kanan — pola yang sama dengan layar indikator, supaya admin tidak
 * perlu mempelajari tata letak baru.
 *
 * Peran bawaan tidak bisa dihapus atau diganti kodenya: mesin hitung dan
 * aturan hierarki bersandar pada kode-kode itu. Namun hak menunya tetap
 * bebas diatur, karena itu memang tujuan layar ini.
 */
export default function PeranClient() {
  const [katalog, setKatalog] = useState<MenuKatalog[]>([]);
  const [daftar, setDaftar] = useState<Peran[]>([]);
  const [pilih, setPilih] = useState<string | null>(null);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  // Salinan yang sedang disunting; null berarti belum ada yang dibuka.
  const [draf, setDraf] = useState<Peran | null>(null);
  const [baru, setBaru] = useState(false);
  const [cariPeran, setCariPeran] = useState("");

  async function segarkan() {
    setMuat(true);
    try {
      const r = await fetch("/api/admin/peran", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal memuat data peran."); return; }
      setKatalog(j.katalog ?? []);
      setDaftar(j.peran ?? []);
    } finally { setMuat(false); }
  }
  useEffect(() => { segarkan(); }, []);

  // Menu dikelompokkan seperti tampil di navigasi, supaya admin melihat
  // struktur yang sama dengan yang akan dilihat pengguna.
  const kelompok = useMemo(() => {
    const peta = new Map<string, MenuKatalog[]>();
    for (const m of katalog) {
      const g = m.grup ?? "Menu utama";
      peta.set(g, [...(peta.get(g) ?? []), m]);
    }
    return Array.from(peta);
  }, [katalog]);

  function buka(p: Peran) {
    setPilih(p.kode); setBaru(false); setPesan(null);
    setDraf({ ...p, menu: [...p.menu] });
  }

  function kosongkan() {
    setPilih(null); setBaru(true); setPesan(null);
    setDraf({
      kode: "", nama: "", keterangan: "", bawaan: false,
      urutan: (daftar.at(-1)?.urutan ?? 0) + 10, aktif: true,
      pengguna: 0, menu: [],
    });
  }

  function alih(kode: string) {
    if (!draf) return;
    setDraf({
      ...draf,
      menu: draf.menu.includes(kode)
        ? draf.menu.filter((m) => m !== kode)
        : [...draf.menu, kode],
    });
  }

  function alihGrup(isi: MenuKatalog[], nyalakan: boolean) {
    if (!draf) return;
    const kode = isi.map((m) => m.kode);
    setDraf({
      ...draf,
      menu: nyalakan
        ? Array.from(new Set([...draf.menu, ...kode]))
        : draf.menu.filter((m) => !kode.includes(m)),
    });
  }

  async function simpan() {
    if (!draf) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/peran", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draf, baru }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return; }
      await segarkan();
      setPilih(j.kode); setBaru(false);
      setPesan("Tersimpan. Perubahan hak akses berlaku setelah pengguna login ulang.");
    } finally { setSibuk(false); }
  }

  async function hapus() {
    if (!draf || draf.bawaan) return;
    if (!confirm(`Hapus peran "${draf.nama}"?${draf.pengguna ? ` ${draf.pengguna} pengguna masih memakainya.` : ""}`)) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(`/api/admin/peran?kode=${encodeURIComponent(draf.kode)}`,
        { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menghapus."); return; }
      setDraf(null); setPilih(null);
      await segarkan();
    } finally { setSibuk(false); }
  }

  const totalPengguna = daftar.reduce((a, p) => a + p.pengguna, 0);
  const daftarTampil = daftar.filter((p) => !cariPeran.trim() ||
    (p.nama + " " + p.kode).toLowerCase().includes(cariPeran.trim().toLowerCase()));
  const asli = draf && !baru ? daftar.find((p) => p.kode === pilih) : null;
  const berubah = !!draf && (baru || !asli ||
    JSON.stringify({ ...asli, menu: [...asli.menu].sort() }) !== JSON.stringify({ ...draf, menu: [...draf.menu].sort() }));
  const pesanOk = !!pesan && pesan.startsWith("Tersimpan");

  return (
    <>
      <JudulHalaman
        eyebrow="Master · keamanan akses"
        meta={<><TitikStatus nada="good" /> {daftar.length} peran · {katalog.length} menu</>}
        judul="Peran & Hak Akses"
        deskripsi="Menentukan menu apa saja yang terlihat untuk tiap peran. Peran bawaan tidak bisa dihapus, tapi hak menunya tetap boleh diatur."
        aksi={
          <button className="btn" onClick={kosongkan}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tambah peran
          </button>
        }
      />

      {pesan && (
        <div className={"alert-box pe-pesan " + (pesanOk ? "good" : "bad")} role="status">
          <span className="alert-ikon">{pesanOk ? "✓" : "!"}</span>
          <span>{pesan}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      <div className="km-grid">
        <KartuMetrik label="Total peran" nilai={daftar.length} satuan="peran"
                     catatan={`${daftar.filter((p) => p.bawaan).length} bawaan · ${daftar.filter((p) => !p.bawaan).length} kustom`}
                     ikon={<Ikon nama="shield" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Pengguna terkait" nilai={totalPengguna.toLocaleString("id-ID")} satuan="akun"
                     catatan="Akun yang memegang salah satu peran"
                     ikon={<Ikon nama="users" ukuran={20} />} />
        <KartuMetrik label="Menu terlindungi" nilai={katalog.length} satuan="menu"
                     catatan={`${kelompok.length} kelompok navigasi`}
                     ikon={<Ikon nama="lock" ukuran={20} />} nada="good" />
        <KartuMetrik label="Peran nonaktif" nilai={daftar.filter((p) => !p.aktif).length} satuan="peran"
                     catatan="Tidak bisa ditugaskan ke pengguna"
                     ikon={<Ikon nama="eyeOff" ukuran={20} />} />
      </div>

      <div className="pe-tata">
        <aside className="card pe-samping">
          <div className="fb-panel-kepala pe-samping-kepala">
            <h2><Ikon nama="shield" ukuran={18} /> Peran <span className="da-hitung num">{daftar.length}</span></h2>
            <button className="btn sm" onClick={kosongkan}><Ikon nama="plus" ukuran={14} tebal={2.2} /> Baru</button>
          </div>
          <label className="fb-cari pe-cari">
            <Ikon nama="search" ukuran={15} />
            <input value={cariPeran} placeholder="Cari nama peran…" onChange={(e) => setCariPeran(e.target.value)} />
          </label>
          <div className="pe-daftar">
            {baru && draf && (
              <div className="pe-item on">
                <div className="pe-item-atas"><b>{draf.nama.trim() || "Peran baru"}</b><span className="fb-lencana draf">draf</span></div>
                <span className="pe-item-meta">belum disimpan · {draf.menu.length} menu</span>
              </div>
            )}
            {daftarTampil.map((p) => {
              const porsi = katalog.length ? (p.menu.length / katalog.length) * 100 : 0;
              return (
                <button key={p.kode} className={"pe-item" + (p.kode === pilih ? " on" : "") + (p.aktif ? "" : " mati")}
                        onClick={() => buka(p)}>
                  <div className="pe-item-atas">
                    <b>{p.nama}</b>
                    {p.bawaan && <span className="pe-lencana">bawaan</span>}
                    {!p.aktif && <span className="fb-lencana mati">nonaktif</span>}
                  </div>
                  <span className="pe-item-meta num">{p.pengguna.toLocaleString("id-ID")} pengguna · {p.kode}</span>
                  <div className="pe-item-bar">
                    <span className="rk-m-bar"><i style={{ width: porsi + "%" }} /></span>
                    <span className="num">{p.menu.length}/{katalog.length}</span>
                  </div>
                </button>
              );
            })}
            {!daftar.length && !muat && <p className="empty">Belum ada peran.</p>}
            {muat && <p className="empty">Memuat…</p>}
          </div>
          <p className="pe-samping-kaki">Peran bertanda <b>bawaan</b> dipakai aturan hierarki dan mesin hitung, jadi kodenya dikunci.</p>
        </aside>

        <section className="pe-utama">
          {!draf ? (
            <>
              <div className="card pe-kosong">
                <span className="fb-kosong-ikon"><Ikon nama="shield" ukuran={24} /></span>
                <div>
                  <b>Pilih peran di kiri untuk mengatur hak menunya</b>
                  <p>atau tekan “Baru” untuk membuat peran baru. Hak menu menentukan tautan navigasi yang tampil sekaligus halaman yang boleh dibuka.</p>
                </div>
              </div>

              <div className="pe-prinsip">
                {[
                  ["01", "Menu dan rutenya dijaga", "Menu yang tidak dicentang hilang dari navigasi, dan alamatnya tidak bisa dibuka langsung."],
                  ["02", "Peran bawaan terkunci", "Kode peran bawaan tidak bisa diubah atau dihapus supaya aturan hierarki tetap berlaku."],
                  ["03", "Berlaku setelah login ulang", "Hak menu dibawa sesi login; pengguna yang sedang masuk melihat perubahan setelah login ulang."],
                ].map(([no, judul, isi]) => (
                  <div className="pe-prinsip-kartu" key={no}>
                    <span className="pe-no num">{no}</span>
                    <b>{judul}</b>
                    <p>{isi}</p>
                  </div>
                ))}
              </div>

              {daftar.length > 0 && (
                <section className="card pe-matriks">
                  <div className="rk-kartu-kepala">
                    <span className="km-ikon accent"><Ikon nama="table" ukuran={20} /></span>
                    <div>
                      <h2>Matriks visibilitas menu</h2>
                      <p className="faint small">Klik nama peran di kepala kolom untuk mengubah hak menunya.</p>
                    </div>
                  </div>
                  <div className="tabel-scroll">
                    <table className="rk-tabel pe-matriks-tabel">
                      <thead>
                        <tr>
                          <th>Menu</th>
                          {daftar.map((p) => (
                            <th key={p.kode} className="pe-kol">
                              <button onClick={() => buka(p)} title={`Atur ${p.nama}`}>{p.nama}</button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {kelompok.map(([judul, isi]) => (
                          <Fragment key={judul}>
                            <tr className="pe-grup-baris"><td colSpan={daftar.length + 1}>{judul}</td></tr>
                            {isi.map((m) => (
                              <tr key={m.kode}>
                                <td><span className="pe-menu-label">{m.label}</span></td>
                                {daftar.map((p) => (
                                  <td key={p.kode} className="pe-sel">
                                    {p.menu.includes(m.kode)
                                      ? <span className="pe-ya" aria-label="boleh"><Ikon nama="check" ukuran={13} tebal={2.6} /></span>
                                      : <span className="pe-tidak" aria-label="tidak">–</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              <div className="card pe-editor">
                <div className="fb-editor-kepala">
                  <div className="fb-identitas">
                    <div className="fb-status">
                      {baru ? <span className="ri-status accent">peran baru</span>
                        : draf.bawaan ? <span className="ri-status netral">peran bawaan</span>
                        : <span className="pa-status good">peran kustom</span>}
                      {berubah && !baru && <span className="pe-berubah">belum disimpan</span>}
                    </div>
                    <input className="ind-nama fb-nama" value={draf.nama}
                           placeholder="Nama peran (mis. Manajemen HO)"
                           onChange={(e) => setDraf({ ...draf, nama: e.target.value })} />
                    <input className="ind-desk fb-desk" value={draf.keterangan ?? ""}
                           placeholder="Keterangan singkat (opsional)"
                           onChange={(e) => setDraf({ ...draf, keterangan: e.target.value })} />
                  </div>
                  <div className="ind-aksi fb-aksi">
                    <button className="btn ghost" disabled={sibuk}
                            onClick={() => { if (asli) buka(asli); else { setDraf(null); setBaru(false); } }}>
                      Batal
                    </button>
                    <button className="btn" disabled={sibuk || !draf.nama.trim() || !berubah} onClick={simpan}>
                      <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan"}
                    </button>
                    {!baru && !draf.bawaan && (
                      <button className="btn tint-bad" disabled={sibuk} onClick={hapus} title="Hapus peran">
                        <Ikon nama="trash" ukuran={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="fb-editor-isi">
                  <div className="pe-atur">
                    <label className="field">
                      <span>Kode peran {baru && <em className="kt-wajib">*</em>}</span>
                      <input value={draf.kode} disabled={!baru} className="num"
                             placeholder="manajemen_ho"
                             onChange={(e) => setDraf({ ...draf, kode: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>Urutan</span>
                      <input type="number" value={draf.urutan} className="num"
                             onChange={(e) => setDraf({ ...draf, urutan: Number(e.target.value) || 0 })} />
                    </label>
                    <label className={"ka-opsi-item pe-aktif" + (draf.aktif ? " on" : "")}>
                      <input type="checkbox" checked={draf.aktif}
                             onChange={(e) => setDraf({ ...draf, aktif: e.target.checked })} />
                      <span><b>Aktif</b><small>Dapat ditugaskan ke pengguna</small></span>
                    </label>
                  </div>
                  {draf.bawaan && (
                    <div className="alert-box info"><span className="alert-ikon">i</span><span>
                      Peran bawaan: kode tidak bisa diubah dan tidak bisa dihapus, karena aturan hierarki dan mesin hitung bersandar padanya.
                    </span></div>
                  )}
                  {baru && (
                    <div className="alert-box info"><span className="alert-ikon">i</span><span>
                      Kode dipakai di database dan tidak bisa diubah setelah disimpan. Gunakan huruf kecil tanpa spasi, mis. <code>manajemen_ho</code>.
                    </span></div>
                  )}
                </div>
              </div>

              <section className="card pe-menu-kartu">
                <div className="rk-kartu-kepala">
                  <span className="km-ikon accent"><Ikon nama="lock" ukuran={20} /></span>
                  <div>
                    <h2>Menu yang boleh dibuka</h2>
                    <p className="faint small">Centang menu yang dapat diakses pemegang peran ini saat login.</p>
                  </div>
                  <span className="pe-hitung num">{draf.menu.length} dari {katalog.length} menu</span>
                </div>

                <div className="pe-grup-grid">
                  {kelompok.map(([judul, isi]) => {
                    const semua = isi.every((m) => draf.menu.includes(m.kode));
                    const jml = isi.filter((m) => draf.menu.includes(m.kode)).length;
                    return (
                      <div className="pe-grup" key={judul}>
                        <div className="pe-grup-kepala">
                          <b>{judul}</b>
                          <span className="da-hitung num">{jml}/{isi.length}</span>
                          <button className="btn ghost sm" onClick={() => alihGrup(isi, !semua)}>
                            {semua ? "Kosongkan" : "Pilih semua"}
                          </button>
                        </div>
                        {isi.map((m) => {
                          const on = draf.menu.includes(m.kode);
                          return (
                            <label className={"pe-baris" + (on ? " on" : "")} key={m.kode}>
                              <input type="checkbox" checked={on} onChange={() => alih(m.kode)} />
                              <span className="pe-baris-teks">
                                <b>{m.label}</b>
                                <i className="num">{m.href}</i>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </>
  );
}
