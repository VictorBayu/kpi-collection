"use client";

import { useEffect, useMemo, useState } from "react";

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

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Peran &amp; Hak Akses</h2>
          <p>
            Menentukan menu apa saja yang terlihat untuk tiap peran. Peran bawaan
            tidak bisa dihapus, tapi hak menunya tetap boleh diatur.
          </p>
        </div>
      </div>

      {pesan && (
        <div className={"alert mb " + (pesan.startsWith("Tersimpan") ? "ok" : "bad")}>
          {pesan}
        </div>
      )}

      <div className="ind-tata">
        <aside className="card ind-samping">
          <div className="cardhead rowbetween">
            <h3 style={{ fontSize: 14 }}>Peran</h3>
            <button className="btn sm" onClick={kosongkan}>+ Baru</button>
          </div>
          <div className="ind-daftar">
            {daftar.map((p) => (
              <button key={p.kode}
                      className={"ind-item" + (p.kode === pilih ? " on" : "")}
                      onClick={() => buka(p)}>
                <b>{p.nama}</b>
                <span className="faint">
                  {p.pengguna} pengguna · {p.menu.length} menu
                  {p.bawaan && " · bawaan"}
                  {!p.aktif && " · nonaktif"}
                </span>
              </button>
            ))}
            {!daftar.length && !muat && <p className="empty">Belum ada peran.</p>}
            {muat && <p className="empty">Memuat…</p>}
          </div>
        </aside>

        <section className="ind-utama">
          {!draf ? (
            <div className="card card-pad">
              <p className="muted">
                Pilih peran di kiri untuk mengatur hak menunya, atau tekan
                &quot;+ Baru&quot; untuk membuat peran baru.
              </p>
            </div>
          ) : (
            <>
              <div className="ind-kepala">
                <input className="ind-nama" value={draf.nama}
                       placeholder="Nama peran (mis. Manajemen HO)"
                       onChange={(e) => setDraf({ ...draf, nama: e.target.value })} />
                <div className="ind-aksi">
                  <button className="btn sm" disabled={sibuk || !draf.nama.trim()}
                          onClick={simpan}>Simpan</button>
                  {!baru && !draf.bawaan && (
                    <button className="btn ghost sm bahaya" disabled={sibuk}
                            onClick={hapus}>Hapus</button>
                  )}
                </div>
              </div>

              <input className="ind-desk" value={draf.keterangan ?? ""}
                     placeholder="Keterangan singkat (opsional)"
                     onChange={(e) => setDraf({ ...draf, keterangan: e.target.value })} />

              <div className="ind-atur">
                <label>
                  <span className="faint small">Kode peran</span>
                  <input value={draf.kode} disabled={!baru}
                         placeholder="manajemen_ho"
                         onChange={(e) => setDraf({ ...draf, kode: e.target.value })} />
                </label>
                <label>
                  <span className="faint small">Urutan</span>
                  <input type="number" value={draf.urutan} style={{ width: 90 }}
                         onChange={(e) =>
                           setDraf({ ...draf, urutan: Number(e.target.value) || 0 })} />
                </label>
                <label className="ind-cek">
                  <input type="checkbox" checked={draf.aktif}
                         onChange={(e) => setDraf({ ...draf, aktif: e.target.checked })} />
                  Aktif
                </label>
              </div>

              {draf.bawaan && (
                <p className="muted small mb">
                  Peran bawaan: kode tidak bisa diubah dan tidak bisa dihapus,
                  karena aturan hierarki dan mesin hitung bersandar padanya.
                </p>
              )}
              {baru && (
                <p className="muted small mb">
                  Kode dipakai di database dan tidak bisa diubah setelah disimpan.
                  Gunakan huruf kecil tanpa spasi, mis. <code>manajemen_ho</code>.
                </p>
              )}

              <section className="card mb">
                <div className="cardhead rowbetween">
                  <div>
                    <h3 style={{ fontSize: 14 }}>Menu yang boleh dibuka</h3>
                    <p className="muted small">
                      {draf.menu.length} dari {katalog.length} menu dipilih.
                    </p>
                  </div>
                </div>

                <div className="peran-menu">
                  {kelompok.map(([judul, isi]) => {
                    const semua = isi.every((m) => draf.menu.includes(m.kode));
                    return (
                      <div className="peran-grup" key={judul}>
                        <div className="peran-grup-kepala">
                          <b>{judul}</b>
                          <button className="btn ghost sm"
                                  onClick={() => alihGrup(isi, !semua)}>
                            {semua ? "Kosongkan" : "Pilih semua"}
                          </button>
                        </div>
                        {isi.map((m) => (
                          <label className="peran-baris" key={m.kode}>
                            <input type="checkbox"
                                   checked={draf.menu.includes(m.kode)}
                                   onChange={() => alih(m.kode)} />
                            <span>
                              <b>{m.label}</b>
                              <i className="faint num">{m.href}</i>
                            </span>
                          </label>
                        ))}
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
