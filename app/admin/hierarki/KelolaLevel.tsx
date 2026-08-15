"use client";

import { useCallback, useEffect, useState } from "react";

type Level = {
  kode: string; nama: string; urutan: number;
  se_area: boolean; aktif: boolean; jabatan: number;
};

type Form = {
  kodeAsli: string | null;
  kode: string; nama: string; urutan: string;
  seArea: boolean; aktif: boolean;
};

const KOSONG: Form = {
  kodeAsli: null, kode: "", nama: "", urutan: "", seArea: false, aktif: true,
};

/**
 * Pengelolaan tingkatan jabatan.
 *
 * Dipisah dari pengelolaan jabatan karena sifatnya berbeda: jabatan berubah
 * sering (orang pindah posisi), sedangkan level berubah jarang tapi
 * dampaknya luas — mengubah "se-area" pada satu level langsung mengubah
 * siapa yang bisa melihat KPI siapa di seluruh aplikasi.
 */
export default function KelolaLevel({ onBerubah }: { onBerubah?: () => void }) {
  const [list, setList] = useState<Level[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    const d = await fetch("/api/admin/level").then((r) => r.json());
    setList(d.level ?? []);
  }, []);

  useEffect(() => { muat(); }, [muat]);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/level", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(`Level ${form.nama} tersimpan.`);
    setForm(null);
    muat(); onBerubah?.();
  }

  async function hapus(l: Level) {
    if (!confirm(`Hapus level ${l.nama}?`)) return;
    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/level", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kode: l.kode }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(`Level ${l.nama} dihapus.`);
    muat(); onBerubah?.();
  }

  /** Menggeser urutan satu langkah, lebih aman daripada mengetik angka. */
  async function geser(l: Level, arah: -1 | 1) {
    const urut = [...list].sort((a, b) => a.urutan - b.urutan);
    const i = urut.findIndex((x) => x.kode === l.kode);
    const j = i + arah;
    if (j < 0 || j >= urut.length) return;

    setSibuk(true); setGalat(null);
    // Tukar nilai urutan dengan tetangganya
    for (const [item, nilai] of [[urut[i], urut[j].urutan], [urut[j], urut[i].urutan]] as const) {
      await fetch("/api/admin/level", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kodeAsli: item.kode, kode: item.kode, nama: item.nama,
          urutan: nilai, seArea: item.se_area, aktif: item.aktif,
        }),
      });
    }
    setSibuk(false);
    muat(); onBerubah?.();
  }

  return (
    <section className="card card-pad mb">
      <div className="rowbetween" style={{ marginBottom: 12 }}>
        <div>
          <h3 className="formtitle" style={{ margin: 0 }}>Tingkatan jabatan</h3>
          <p className="faint small nomargin">
            Urutan menentukan susunan diagram. Tanda “se-area” membuat pemegang
            level itu melihat seluruh cabang dalam areanya, bukan satu cabang saja.
          </p>
        </div>
        <button className="btn sm" onClick={() => { setForm({ ...KOSONG }); setGalat(null); }}
                disabled={sibuk}>+ Tambah level</button>
      </div>

      {galat && <div className="banner warn"><b>Gagal</b>{galat}</div>}
      {kabar && <div className="banner good"><b>Selesai</b>{kabar}</div>}

      {form && (
        <form onSubmit={simpan} className="card card-pad mb" style={{ background: "#F9FBFE" }}>
          <div className="formgrid">
            <label className="field">
              <span>Nama level</span>
              <input required value={form.nama} placeholder="SPV level 3"
                     onChange={(e) => setForm({ ...form, nama: e.target.value })} />
            </label>
            <label className="field">
              <span>Kode {form.kodeAsli === null && "(otomatis bila kosong)"}</span>
              <input value={form.kode} placeholder="spv_level_3"
                     onChange={(e) => setForm({ ...form, kode: e.target.value })} />
            </label>
            <label className="field">
              <span>Urutan (makin besar makin tinggi)</span>
              <input className="num" inputMode="numeric" required value={form.urutan}
                     placeholder="35"
                     onChange={(e) => setForm({ ...form, urutan: e.target.value })} />
            </label>
          </div>
          <div className="formcheck">
            <label>
              <input type="checkbox" checked={form.seArea}
                     onChange={(e) => setForm({ ...form, seArea: e.target.checked })} />
              <span>Berwenang se-area (bukan hanya satu cabang)</span>
            </label>
            <label>
              <input type="checkbox" checked={form.aktif}
                     onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
              <span>Level aktif dipakai</span>
            </label>
          </div>
          <div className="formact">
            <button className="btn sm" type="submit" disabled={sibuk}>
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
            <button className="btn ghost sm" type="button" onClick={() => setForm(null)}>Batal</button>
          </div>
        </form>
      )}

      <div className="levellist">
        {list.map((l, i) => (
          <div className={"levelrow" + (l.aktif ? "" : " mati")} key={l.kode}>
            <span className="levelurut num">{l.urutan}</span>
            <span className="levelnama">
              <b>{l.nama}</b>
              <span className="faint num">{l.kode}</span>
            </span>
            <span className="levelket">
              {l.se_area
                ? <span className="chip c-proses">se-area</span>
                : <span className="faint">se-cabang</span>}
              <span className="faint">{l.jabatan} jabatan</span>
            </span>
            <span className="rowact">
              <button className="btn ghost sm" disabled={sibuk || i === 0}
                      title="Naikkan urutan" onClick={() => geser(l, 1)}>↑</button>
              <button className="btn ghost sm" disabled={sibuk || i === list.length - 1}
                      title="Turunkan urutan" onClick={() => geser(l, -1)}>↓</button>
              <button className="btn ghost sm" disabled={sibuk}
                      onClick={() => setForm({
                        kodeAsli: l.kode, kode: l.kode, nama: l.nama,
                        urutan: String(l.urutan), seArea: l.se_area, aktif: l.aktif,
                      })}>Ubah</button>
              <button className="btn danger sm" disabled={sibuk || l.jabatan > 0}
                      title={l.jabatan > 0 ? "Masih dipakai jabatan" : "Hapus level"}
                      onClick={() => hapus(l)}>Hapus</button>
            </span>
          </div>
        ))}
        {!list.length && <p className="empty">Belum ada level. Jalankan db/schema-hierarki-v4.sql.</p>}
      </div>
    </section>
  );
}
