"use client";

import { useEffect, useState } from "react";
import Pilih from "@/components/Pilih";

type Kolom = { kolom: string; label: string; jenis: string; kelompok: string | null; sumber: string };
type Syarat = { kolom: string; operator: string; nilai: string[] };
type Cabang = { syarat: Syarat[]; gabung: "dan" | "atau"; nilai: string };
type Turunan = {
  kolom: string; label: string; jenis: string; kelompok: string | null;
  mode: "visual" | "sql"; aturan: Cabang[]; nilai_lain: string | null;
  ekspresi_sql: string | null;
  dihitung_pada: string | null; baris_terisi: number | null; galat: string | null;
};

const OPERATOR = [
  { nilai: "sama", label: "sama dengan" },
  { nilai: "tidak_sama", label: "tidak sama dengan" },
  { nilai: "termasuk", label: "termasuk salah satu" },
  { nilai: "tidak_termasuk", label: "bukan salah satu" },
  { nilai: "mengandung", label: "mengandung" },
  { nilai: "lebih", label: "lebih dari" },
  { nilai: "lebih_sama", label: "lebih dari atau sama" },
  { nilai: "kurang", label: "kurang dari" },
  { nilai: "kurang_sama", label: "kurang dari atau sama" },
  { nilai: "kosong", label: "kosong" },
  { nilai: "terisi", label: "terisi" },
];

const KOSONG: Turunan = {
  kolom: "", label: "", jenis: "teks", kelompok: "Olahan",
  mode: "visual", aturan: [{ syarat: [{ kolom: "", operator: "sama", nilai: [""] }], gabung: "dan", nilai: "" }],
  nilai_lain: "", ekspresi_sql: "",
  dihitung_pada: null, baris_terisi: null, galat: null,
};

/**
 * Kolom turunan — kolom yang nilainya diolah dari kolom lain.
 *
 * Dua mode disediakan karena kebutuhannya memang dua jenis. Sebagian besar
 * aturan berbentuk "kalau begini maka begitu", dan itu paling aman disusun
 * lewat dropdown: tidak mungkin salah ketik nama kolom, dan tidak mungkin
 * menyentuh tabel lain. Sisanya butuh ekspresi yang lebih bebas, dan untuk
 * itu tersedia mode SQL yang disaring ketat — hanya kolom terdaftar dan
 * sedikit kata kunci yang diizinkan, tanpa SELECT, FROM, atau titik koma.
 */
export default function Client() {
  const [daftar, setDaftar] = useState<Turunan[]>([]);
  const [kolom, setKolom] = useState<Kolom[]>([]);
  const [draf, setDraf] = useState<(Turunan & { baru: boolean }) | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/turunan", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat."); return; }
    setDaftar(j.turunan ?? []); setKolom(j.kolom ?? []);
  }
  useEffect(() => { segarkan(); }, []);

  const opsiKolom = kolom.map((c) => ({
    nilai: c.kolom, label: c.label,
    grup: c.sumber === "pendukung" ? `Pendukung — ${c.kelompok ?? "Lain"}` : (c.kelompok ?? undefined),
  }));

  function ubahCabang(i: number, patch: Partial<Cabang>) {
    if (!draf) return;
    setDraf({ ...draf, aturan: draf.aturan.map((c, x) => (x === i ? { ...c, ...patch } : c)) });
  }
  function ubahSyarat(ci: number, si: number, patch: Partial<Syarat>) {
    if (!draf) return;
    const c = draf.aturan[ci];
    ubahCabang(ci, { syarat: c.syarat.map((s, x) => (x === si ? { ...s, ...patch } : s)) });
  }

  async function simpan() {
    if (!draf) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/turunan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(draf),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return; }
      await segarkan(); setDraf(null);
      setPesan("Tersimpan. Tekan Hitung untuk mengisi kolomnya sekarang.");
    } finally { setSibuk(false); }
  }

  async function hitung(k: string) {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/turunan", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kolom: k }),
      });
      const j = await r.json().catch(() => ({}));
      setPesan(r.ok ? `Selesai — ${j.baris} baris terisi.` : (j.error ?? "Gagal menghitung."));
      await segarkan();
    } finally { setSibuk(false); }
  }

  async function hapus(k: string) {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(`/api/admin/turunan?kolom=${encodeURIComponent(k)}`,
        { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menghapus."); return; }
      await segarkan(); setDraf(null); setPesan("Kolom turunan dihapus.");
    } finally { setSibuk(false); }
  }

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Kolom Turunan</h2>
          <p>
            Kolom hasil olahan dari kolom lain — termasuk kolom data pendukung.
            Dihitung ulang otomatis tiap tarikan API.
          </p>
        </div>
        <button className="btn" onClick={() => setDraf({ ...KOSONG, baru: true })}>
          + Kolom turunan
        </button>
      </div>

      {pesan && (
        <div className={"alert mb " + (/Tersimpan|Selesai|dihapus/.test(pesan) ? "ok" : "bad")}>
          {pesan}
        </div>
      )}

      {draf && (
        <section className="card card-pad mb">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>
            {draf.baru ? "Kolom turunan baru" : `Ubah: ${draf.label}`}
          </h3>

          <div className="kolom-form">
            <label className="field">
              <span>Nama kolom</span>
              <input value={draf.kolom} disabled={!draf.baru} placeholder="od_movement_new"
                     onChange={(e) => setDraf({ ...draf, kolom: e.target.value })} />
            </label>
            <label className="field">
              <span>Label</span>
              <input value={draf.label} placeholder="OD Movement New"
                     onChange={(e) => setDraf({ ...draf, label: e.target.value })} />
            </label>
            <label className="field">
              <span>Jenis</span>
              <Pilih nilai={draf.jenis} cari={false}
                     onPilih={(v) => setDraf({ ...draf, jenis: v })}
                     opsi={[
                       { nilai: "teks", label: "Teks" },
                       { nilai: "angka", label: "Angka" },
                       { nilai: "tanggal", label: "Tanggal" },
                     ]} />
            </label>
            <label className="field">
              <span>Cara menyusun</span>
              <Pilih nilai={draf.mode} cari={false}
                     onPilih={(v) => setDraf({ ...draf, mode: v as "visual" | "sql" })}
                     opsi={[
                       { nilai: "visual", label: "Perakit visual", ket: "kalau begini maka begitu" },
                       { nilai: "sql", label: "Ekspresi SQL", ket: "untuk kasus rumit" },
                     ]} />
            </label>
          </div>

          {draf.mode === "visual" ? (
            <div className="mt">
              {draf.aturan.map((c, ci) => (
                <div className="turunan-cabang" key={ci}>
                  <div className="turunan-kepala">
                    <b>{ci === 0 ? "Kalau" : "Kalau tidak, kalau"}</b>
                    <button className="ibtn"
                            onClick={() => setDraf({
                              ...draf, aturan: draf.aturan.filter((_, x) => x !== ci),
                            })}>×</button>
                  </div>

                  {c.syarat.map((s, si) => (
                    <div className="turunan-syarat" key={si}>
                      {si > 0 && (
                        <button className="pill-op"
                                onClick={() => ubahCabang(ci, {
                                  gabung: c.gabung === "dan" ? "atau" : "dan",
                                })}>{c.gabung}</button>
                      )}
                      <Pilih nilai={s.kolom} onPilih={(v) => ubahSyarat(ci, si, { kolom: v })}
                             placeholder="pilih kolom" opsi={opsiKolom} />
                      <Pilih nilai={s.operator} cari={false}
                             onPilih={(v) => ubahSyarat(ci, si, { operator: v })}
                             opsi={OPERATOR} />
                      {!["kosong", "terisi"].includes(s.operator) && (
                        <input value={s.nilai.join(", ")}
                               placeholder={s.operator === "termasuk" ? "BTC, Lunas" : "nilai"}
                               onChange={(e) => ubahSyarat(ci, si, {
                                 nilai: e.target.value.split(",").map((v) => v.trim()),
                               })} />
                      )}
                      <button className="ibtn"
                              onClick={() => ubahCabang(ci, {
                                syarat: c.syarat.filter((_, x) => x !== si),
                              })}>×</button>
                    </div>
                  ))}

                  <div className="turunan-kaki">
                    <button className="btn ghost sm"
                            onClick={() => ubahCabang(ci, {
                              syarat: [...c.syarat, { kolom: "", operator: "sama", nilai: [""] }],
                            })}>+ Syarat</button>
                    <span className="faint small">maka isinya</span>
                    <input value={c.nilai} placeholder="nilai hasil" style={{ maxWidth: 220 }}
                           onChange={(e) => ubahCabang(ci, { nilai: e.target.value })} />
                  </div>
                </div>
              ))}

              <div className="turunan-kaki mt">
                <button className="btn ghost sm"
                        onClick={() => setDraf({
                          ...draf,
                          aturan: [...draf.aturan, {
                            syarat: [{ kolom: "", operator: "sama", nilai: [""] }],
                            gabung: "dan", nilai: "",
                          }],
                        })}>+ Aturan</button>
                <span className="faint small">kalau tidak ada yang cocok, isinya</span>
                <input value={draf.nilai_lain ?? ""} placeholder="kosong"
                       style={{ maxWidth: 220 }}
                       onChange={(e) => setDraf({ ...draf, nilai_lain: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="mt">
              <label className="field">
                <span>Ekspresi SQL</span>
                <textarea rows={5} value={draf.ekspresi_sql ?? ""}
                          placeholder={"CASE WHEN prepaid > 0 THEN 'Prepaid'\n     WHEN od_movement = 'BTC' THEN 'BTC'\n     ELSE od_movement END"}
                          onChange={(e) => setDraf({ ...draf, ekspresi_sql: e.target.value })} />
              </label>
              <p className="muted small">
                Tulis nama kolom apa adanya (tanpa nama tabel). Hanya kolom terdaftar,
                angka, teks berkutip, dan kata kunci <code>CASE WHEN THEN ELSE END</code>,{" "}
                <code>AND OR NOT</code>, <code>COALESCE</code>, <code>NULLIF</code>,{" "}
                <code>ROUND</code> yang diizinkan. Titik koma, komentar, dan{" "}
                <code>SELECT</code>/<code>FROM</code> ditolak.
              </p>
            </div>
          )}

          <div className="mt" style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={sibuk} onClick={simpan}>Simpan</button>
            <button className="btn ghost" disabled={sibuk}
                    onClick={() => { setDraf(null); setPesan(null); }}>Batal</button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="cardhead">
          <h3 style={{ fontSize: 14 }}>{daftar.length} kolom turunan</h3>
        </div>
        <table>
          <thead>
            <tr><th>Kolom</th><th>Cara</th><th>Terakhir dihitung</th><th></th></tr>
          </thead>
          <tbody>
            {daftar.map((t) => (
              <tr key={t.kolom} className={t.galat ? "kurang" : ""}>
                <td>
                  <b>{t.label}</b>
                  <div className="faint num">{t.kolom} · {t.jenis}</div>
                  {t.galat && <div className="dk-gerbang gagal">{t.galat}</div>}
                </td>
                <td>{t.mode === "sql" ? "Ekspresi SQL" : `${t.aturan.length} aturan`}</td>
                <td className="faint">
                  {t.dihitung_pada
                    ? `${new Date(t.dihitung_pada).toLocaleString("id-ID")} · ${t.baris_terisi ?? 0} baris`
                    : "belum pernah"}
                </td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" disabled={sibuk}
                          onClick={() => hitung(t.kolom)}>Hitung</button>{" "}
                  <button className="btn ghost sm"
                          onClick={() => setDraf({ ...t, baru: false })}>Ubah</button>{" "}
                  <button className="btn ghost sm bahaya" disabled={sibuk}
                          onClick={() => hapus(t.kolom)}>Hapus</button>
                </td>
              </tr>
            ))}
            {!daftar.length && (
              <tr><td colSpan={4} className="empty">Belum ada kolom turunan.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
