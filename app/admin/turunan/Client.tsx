"use client";

import { useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import Ikon from "@/components/Ikon";
import JudulHalaman, { TitikStatus } from "@/components/JudulHalaman";

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

  const pesanOk = !!pesan && /Tersimpan|Selesai|dihapus/.test(pesan);
  const bergalat = daftar.filter((t) => t.galat).length;
  const tambahAturan = () => draf && setDraf({
    ...draf,
    aturan: [...draf.aturan, { syarat: [{ kolom: "", operator: "sama", nilai: [""] }], gabung: "dan", nilai: "" }],
  });

  return (
    <>
      <JudulHalaman
        eyebrow="Data & indikator"
        meta={<><TitikStatus nada={bergalat ? "bad" : "good"} /> {bergalat ? `${bergalat} kolom bergalat` : "dihitung tiap tarikan API"}</>}
        judul="Kolom Turunan"
        deskripsi="Kolom hasil olahan dari kolom lain — termasuk kolom data pendukung. Dihitung ulang otomatis tiap tarikan API."
        aksi={!draf && (
          <button className="btn" onClick={() => { setPesan(null); setDraf({ ...KOSONG, baru: true }); }}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Kolom turunan
          </button>
        )}
      />

      {pesan && (
        <div className={"alert-box kt-pesan " + (pesanOk ? "good" : "bad")} role="status">
          <span className="alert-ikon">{pesanOk ? "✓" : "!"}</span>
          <span>{pesan}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      {draf && (
        <section className="card sd-form kt-form">
          <div className="kt-form-kepala">
            <span className="kt-titik" aria-hidden />
            <h3>{draf.baru ? "Kolom turunan baru" : `Ubah: ${draf.label}`}</h3>
            <span className="kt-mode">{draf.mode === "sql" ? "Mode ekspresi SQL" : "Mode perakit visual"}</span>
          </div>

          <div className="kt-form-isi">
            <div className="kt-grid">
              <label className="field">
                <span>Nama kolom <em className="kt-wajib">*</em></span>
                <input value={draf.kolom} disabled={!draf.baru} placeholder="od_movement_new" className="num"
                       onChange={(e) => setDraf({ ...draf, kolom: e.target.value })} />
              </label>
              <label className="field">
                <span>Label <em className="kt-wajib">*</em></span>
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
              <label className="field kt-cara">
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
              <div className="kt-perakit">
                {draf.aturan.map((c, ci) => (
                  <div className="kt-aturan" key={ci}>
                    <div className="kt-aturan-kepala">
                      <span className="kt-nomor">Aturan {ci + 1}</span>
                      <b>{ci === 0 ? "Kalau" : "Kalau tidak, kalau"}</b>
                      <button className="pa-ikon-btn kt-hapus" title="Hapus aturan"
                              onClick={() => setDraf({ ...draf, aturan: draf.aturan.filter((_, x) => x !== ci) })}>
                        <Ikon nama="trash" ukuran={15} />
                      </button>
                    </div>

                    {c.syarat.map((s, si) => (
                      <div className="kt-syarat" key={si}>
                        {si > 0 ? (
                          <button className={"kt-gabung " + c.gabung} title="Klik untuk mengganti DAN/ATAU"
                                  onClick={() => ubahCabang(ci, { gabung: c.gabung === "dan" ? "atau" : "dan" })}>
                            {c.gabung}
                          </button>
                        ) : <span className="kt-gabung kosong" aria-hidden />}
                        <Pilih nilai={s.kolom} onPilih={(v) => ubahSyarat(ci, si, { kolom: v })}
                               placeholder="pilih kolom" opsi={opsiKolom} />
                        <Pilih nilai={s.operator} cari={false}
                               onPilih={(v) => ubahSyarat(ci, si, { operator: v })}
                               opsi={OPERATOR} />
                        {!["kosong", "terisi"].includes(s.operator) ? (
                          <input value={s.nilai.join(", ")}
                                 placeholder={["termasuk", "tidak_termasuk"].includes(s.operator) ? "BTC, Lunas" : "nilai (misal: 0 atau LANCAR)"}
                                 onChange={(e) => ubahSyarat(ci, si, { nilai: e.target.value.split(",").map((v) => v.trim()) })} />
                        ) : <span className="kt-tanpa-nilai faint">tanpa nilai</span>}
                        <button className="pa-ikon-btn" title="Hapus syarat"
                                onClick={() => ubahCabang(ci, { syarat: c.syarat.filter((_, x) => x !== si) })}>×</button>
                      </div>
                    ))}

                    <div className="kt-kaki">
                      <button className="btn ghost sm"
                              onClick={() => ubahCabang(ci, { syarat: [...c.syarat, { kolom: "", operator: "sama", nilai: [""] }] })}>
                        <Ikon nama="plus" ukuran={14} /> Syarat
                      </button>
                      <span className="kt-maka">maka isinya</span>
                      <input value={c.nilai} placeholder="nilai hasil (misal: Lancar)"
                             onChange={(e) => ubahCabang(ci, { nilai: e.target.value })} />
                    </div>
                  </div>
                ))}

                <div className="kt-kaki kt-lain">
                  <button className="btn tint sm" onClick={tambahAturan}>
                    <Ikon nama="plus" ukuran={14} /> Aturan lain
                  </button>
                  <span className="kt-maka"><b>kalau tidak ada yang cocok</b>, isinya</span>
                  <input value={draf.nilai_lain ?? ""} placeholder="kosong"
                         onChange={(e) => setDraf({ ...draf, nilai_lain: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="kt-perakit">
                <label className="field">
                  <span>Ekspresi SQL</span>
                  <textarea rows={6} className="kt-sql" value={draf.ekspresi_sql ?? ""}
                            placeholder={"CASE WHEN prepaid > 0 THEN 'Prepaid'\n     WHEN od_movement = 'BTC' THEN 'BTC'\n     ELSE od_movement END"}
                            onChange={(e) => setDraf({ ...draf, ekspresi_sql: e.target.value })} />
                </label>
                <div className="alert-box info">
                  <span className="alert-ikon">i</span>
                  <span>
                    Tulis nama kolom apa adanya (tanpa nama tabel). Hanya kolom terdaftar, angka, teks berkutip, dan kata
                    kunci <code>CASE WHEN THEN ELSE END</code>, <code>AND OR NOT</code>, <code>COALESCE</code>,{" "}
                    <code>NULLIF</code>, <code>ROUND</code> yang diizinkan. Titik koma, komentar, dan{" "}
                    <code>SELECT</code>/<code>FROM</code> ditolak.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="sd-form-kaki">
            <button className="btn ghost" disabled={sibuk} onClick={() => { setDraf(null); setPesan(null); }}>Batal</button>
            <button className="btn" disabled={sibuk} onClick={simpan}>
              <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </section>
      )}

      <section className="card kt-daftar">
        <div className="rk-kartu-kepala">
          <span className="km-ikon accent"><Ikon nama="branch" ukuran={20} /></span>
          <div>
            <h2>{daftar.length} kolom turunan terdaftar</h2>
            <p className="faint small">Aturan olahan yang ikut dihitung setiap data API masuk.</p>
          </div>
        </div>
        <div className="tabel-scroll">
          <table className="rk-tabel kt-tabel">
            <thead>
              <tr><th>Kolom</th><th>Cara</th><th>Terakhir dihitung</th><th className="r">Aksi</th></tr>
            </thead>
            <tbody>
              {daftar.map((t) => (
                <tr key={t.kolom} className={"rk-baris" + (t.galat ? " bad" : "")}>
                  <td>
                    <div className="ka-label">{t.label} <span className="rk-tag ka-mati">{t.jenis}</span></div>
                    <div className="pa-sub num">{t.kolom}</div>
                    {t.galat && <div className="rk-gerbang gagal"><b>Gagal dihitung</b>{t.galat}</div>}
                  </td>
                  <td>
                    <span className={"kt-cara-chip " + t.mode}>
                      <Ikon nama={t.mode === "sql" ? "code" : "branch"} ukuran={13} />
                      {t.mode === "sql" ? "Ekspresi SQL" : `${t.aturan.length} aturan`}
                    </span>
                  </td>
                  <td>
                    {t.dihitung_pada ? (
                      <>
                        <div className="num kt-waktu">{new Date(t.dihitung_pada).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</div>
                        <div className="pa-sub num">{(t.baris_terisi ?? 0).toLocaleString("id-ID")} baris terisi</div>
                      </>
                    ) : <span className="pa-status warn">belum pernah</span>}
                  </td>
                  <td className="r">
                    <div className="ri-aksi">
                      <button className="btn tint sm" disabled={sibuk} onClick={() => hitung(t.kolom)}>
                        <Ikon nama="refresh" ukuran={14} /> Hitung
                      </button>
                      <button className="btn ghost sm" onClick={() => { setPesan(null); setDraf({ ...t, baru: false }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                        <Ikon nama="pencil" ukuran={14} /> Ubah
                      </button>
                      <button className="btn danger sm" disabled={sibuk}
                              onClick={() => { if (confirm(`Hapus kolom turunan "${t.label}"?`)) hapus(t.kolom); }}>
                        <Ikon nama="trash" ukuran={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!daftar.length && (
                <tr>
                  <td colSpan={4} className="kt-kosong">
                    <span className="km-ikon"><Ikon nama="branch" ukuran={22} /></span>
                    <b>Belum ada kolom turunan</b>
                    <span>Tambahkan aturan pertama lewat tombol “Kolom turunan” di atas.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
