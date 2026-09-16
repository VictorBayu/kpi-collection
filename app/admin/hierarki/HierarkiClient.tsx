"use client";

import { useCallback, useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import Diagram from "./Diagram";
import Diagnosa from "./Diagnosa";
import KelolaLevel from "./KelolaLevel";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

type Rantai = { tingkat: number; atasan: string };
type Jabatan = {
  jabatan: string; level: string; urutan: number; aktif: boolean;
  pemakai: number; rantai: Rantai[]; alias: string[];
};
type Yatim = { jabatan: string; pemakai: number };

type Form = {
  jabatanAsli: string | null;   // null = tambah baru
  jabatan: string;
  level: string;
  urutan: string;
  aktif: boolean;
  rantai: string[];
};

type LevelRef = {
  kode: string; nama: string; urutan: number; se_area: boolean; aktif: boolean;
};

const FORM_KOSONG: Form = {
  jabatanAsli: null, jabatan: "", level: "staff", urutan: "", aktif: true, rantai: [""],
};

export default function HierarkiClient() {
  const [list, setList] = useState<Jabatan[]>([]);
  const [yatim, setYatim] = useState<Yatim[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [tampilan, setTampilan] = useState<"diagram" | "tabel" | "level" | "uji">("diagram");
  const [levelRef, setLevelRef] = useState<LevelRef[]>([]);

  const muat = useCallback(async () => {
    const d = await fetch("/api/admin/hierarki").then((r) => r.json());
    setList(d.jabatan ?? []);
    setYatim(d.yatim ?? []);
    setLevelRef(d.level ?? []);
  }, []);

  // Nama level untuk ditampilkan; ikut berubah begitu admin mengubahnya.
  const namaLevel = (kode: string) =>
    levelRef.find((l) => l.kode === kode)?.nama ?? kode;

  // Urutan level dari yang tertinggi, dipakai mengelompokkan daftar.
  const urutLevel = levelRef
    .slice().sort((a, b) => b.urutan - a.urutan).map((l) => l.kode);

  useEffect(() => { muat(); }, [muat]);

  function bukaTambah(namaAwal = "") {
    setGalat(null); setKabar(null);
    setForm({ ...FORM_KOSONG, jabatan: namaAwal, rantai: [""] });
  }

  function bukaEdit(j: Jabatan) {
    setGalat(null); setKabar(null);
    setForm({
      jabatanAsli: j.jabatan, jabatan: j.jabatan, level: j.level,
      urutan: String(j.urutan), aktif: j.aktif,
      rantai: j.rantai.length ? j.rantai.map((r) => r.atasan) : [""],
    });
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/hierarki", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jabatan: form.jabatan, jabatanAsli: form.jabatanAsli,
        level: form.level, urutan: form.urutan, aktif: form.aktif,
        rantai: form.rantai.filter((x) => x.trim()),
      }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(`Jabatan ${form.jabatan.toUpperCase()} tersimpan.`);
    setForm(null);
    muat();
  }

  /** Dipanggil diagram setelah admin menyusun ulang rantai dengan seret. */
  async function simpanRantai(jabatan: string, rantai: string[]) {
    const j = list.find((x) => x.jabatan === jabatan);
    if (!j) return;
    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/hierarki", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jabatan: j.jabatan, jabatanAsli: j.jabatan,
        level: j.level, urutan: j.urutan, aktif: j.aktif, rantai,
      }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(`Rantai atasan ${j.jabatan} diperbarui.`);
    muat();
  }

  async function hapus(j: Jabatan) {
    if (!confirm(`Hapus jabatan ${j.jabatan} dari master hierarki?`)) return;
    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/hierarki", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jabatan: j.jabatan }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(`Jabatan ${j.jabatan} dihapus.`);
    muat();
  }

  async function alias(aksi: "tambah" | "hapus", aliasNama: string, jabatan?: string) {
    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/hierarki", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aksi, alias: aliasNama, jabatan }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(aksi === "tambah"
      ? `"${aliasNama.toUpperCase()}" sekarang dibaca sebagai ${jabatan?.toUpperCase()}.`
      : `Alias "${aliasNama}" dihapus.`);
    muat();
  }

  function tambahAlias(j: Jabatan) {
    const a = prompt(
      `Penulisan lain yang harus dibaca sebagai ${j.jabatan}:\n\n` +
      `Contoh: kalau di data pegawai tertulis "${j.jabatan} MIX", isi persis seperti itu.`, "");
    if (a === null || !a.trim()) return;
    alias("tambah", a.trim(), j.jabatan);
  }

  function petakanYatim(y: Yatim) {
    const target = prompt(
      `"${y.jabatan}" dipakai ${y.pemakai} pegawai tapi belum dikenal master.\n\n` +
      `Ketik nama jabatan master yang setara (mis. BCH F), atau kosongkan untuk ` +
      `mendaftarkannya sebagai jabatan baru.`, "");
    if (target === null) return;
    if (target.trim()) alias("tambah", y.jabatan, target.trim());
    else bukaTambah(y.jabatan);
  }

  const ubahRantai = (i: number, v: string) => {
    if (!form) return;
    const r = [...form.rantai];
    r[i] = v;
    setForm({ ...form, rantai: r });
  };

  /**
   * Pilihan atasan untuk satu jabatan: semua jabatan lain, dikelompokkan
   * per level dan diurutkan dari yang tertinggi. Jabatan itu sendiri
   * dikeluarkan agar tidak bisa menjadi atasan dirinya sendiri.
   */
  function opsiAtasan(kecuali: string) {
    const bandingkan = String(kecuali ?? "").trim().toUpperCase();
    return list
      .filter((j) => j.jabatan !== bandingkan)
      .slice()
      .sort((a, b) =>
        urutLevel.indexOf(a.level) - urutLevel.indexOf(b.level) ||
        a.jabatan.localeCompare(b.jabatan))
      .map((j) => ({
        nilai: j.jabatan,
        label: j.jabatan,
        ket: j.pemakai ? `${j.pemakai} orang` : undefined,
        grup: namaLevel(j.level),
      }));
  }

  // Esc menutup formulir jabatan.
  useEffect(() => {
    if (!form) return;
    const tutup = (e: KeyboardEvent) => { if (e.key === "Escape" && !sibuk) setForm(null); };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [form, sibuk]);

  const levelAktif = levelRef.filter((l) => l.aktif);
  const totalPemakai = list.reduce((a, j) => a + j.pemakai, 0);
  const levelTertinggi = urutLevel[0];
  // Jabatan tanpa atasan wajar hanya di level paling atas; di level lain
  // artinya rantainya belum diisi dan tidak ada yang bisa melihat KPI-nya.
  const tanpaAtasan = list.filter((j) => j.aktif && !j.rantai.length && j.level !== levelTertinggi);
  const terpadat = list.reduce<Jabatan | null>((a, j) => (!a || j.pemakai > a.pemakai ? j : a), null);
  const pemakaiYatim = yatim.reduce((a, y) => a + y.pemakai, 0);

  const TAB: { kode: typeof tampilan; label: string; ikon: string; jml?: number }[] = [
    { kode: "diagram", label: "Diagram", ikon: "hierarchy" },
    { kode: "tabel", label: "Tabel", ikon: "table", jml: list.length },
    { kode: "level", label: "Tingkatan", ikon: "layers", jml: levelRef.length },
    { kode: "uji", label: "Uji visibilitas", ikon: "eye" },
  ];

  return (
    <div className="mh">
      <JudulHalaman
        eyebrow="Master · aturan visibilitas"
        meta={<><TitikStatus nada={yatim.length || tanpaAtasan.length ? "warn" : "good"} /> {levelAktif.length} tingkatan · {list.length} jabatan</>}
        judul="Master Hierarki Jabatan"
        deskripsi="Menentukan siapa boleh melihat KPI siapa. Atasan hanya melihat jabatan yang ada di bawahnya pada rantai, dan hanya dalam cabang/area sendiri."
        aksi={<>
          <button className="btn ghost" onClick={() => setTampilan("uji")}>
            <Ikon nama="eye" ukuran={16} /> Uji visibilitas
          </button>
          <button className="btn" onClick={() => bukaTambah()} disabled={sibuk}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tambah jabatan
          </button>
        </>}
      />

      {galat && !form && (
        <div className="alert-box bad mh-pesan" role="alert">
          <span className="alert-ikon">!</span><span><b>Gagal.</b> {galat}</span>
          <button className="alert-tutup" onClick={() => setGalat(null)} aria-label="Tutup">×</button>
        </div>
      )}
      {kabar && (
        <div className="alert-box good mh-pesan" role="status">
          <span className="alert-ikon">✓</span><span>{kabar}</span>
          <button className="alert-tutup" onClick={() => setKabar(null)} aria-label="Tutup">×</button>
        </div>
      )}

      <div className="km-grid">
        <KartuMetrik label="Tingkatan aktif" nilai={levelAktif.length} satuan="level"
                     catatan={`${levelAktif.filter((l) => l.se_area).length} berwenang se-area`}
                     ikon={<Ikon nama="layers" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Jabatan terdaftar" nilai={list.length} satuan="jabatan"
                     catatan={`${totalPemakai.toLocaleString("id-ID")} pegawai memakai`}
                     ikon={<Ikon nama="badge" ukuran={20} />} nada="good" />
        <KartuMetrik label="Rantai belum diisi" nilai={<span className={tanpaAtasan.length ? "teks-bad" : ""}>{tanpaAtasan.length}</span>} satuan="jabatan"
                     catatan={tanpaAtasan.length ? tanpaAtasan.slice(0, 3).map((j) => j.jabatan).join(", ") : "Semua jabatan punya atasan"}
                     ikon={<Ikon nama="hierarchy" ukuran={20} />} nada={tanpaAtasan.length ? "warn" : "netral"} />
        <KartuMetrik label="Jabatan terpadat" nilai={<span className="km-teks">{terpadat?.jabatan ?? "—"}</span>}
                     catatan={terpadat ? `${terpadat.pemakai.toLocaleString("id-ID")} pegawai · ${namaLevel(terpadat.level)}` : "Belum ada data"}
                     ikon={<Ikon nama="users" ukuran={20} />} />
      </div>

      {yatim.length > 0 && (
        <div className="tr-info warn mh-yatim">
          <span className="sd-ikon"><Ikon nama="alert" ukuran={18} /></span>
          <div className="tr-info-teks">
            <b>{yatim.length} jabatan belum dikenal master · {pemakaiYatim.toLocaleString("id-ID")} pegawai</b>
            <p>Pegawai dengan jabatan ini tidak muncul di layar Tim Saya siapa pun. Klik untuk memetakan ke jabatan master atau mendaftarkannya.</p>
            <div className="mh-yatim-daftar">
              {yatim.map((y) => (
                <button key={y.jabatan} className="mh-yatim-chip" onClick={() => petakanYatim(y)} disabled={sibuk}>
                  {y.jabatan} <span className="num">{y.pemakai}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mh-bar">
        <div className="mh-tab" role="tablist" aria-label="Tampilan">
          {TAB.map((t) => (
            <button key={t.kode} role="tab" aria-selected={tampilan === t.kode}
                    className={tampilan === t.kode ? "on" : ""} onClick={() => setTampilan(t.kode)}>
              <Ikon nama={t.ikon} ukuran={15} /> {t.label}
              {t.jml !== undefined && <span className="num">{t.jml}</span>}
            </button>
          ))}
        </div>
        <span className="mh-bar-ket faint">
          {tampilan === "diagram" ? "Klik satu jabatan untuk melihat jalur atasannya"
            : tampilan === "tabel" ? "Ubah, tambah alias, atau hapus jabatan"
            : tampilan === "level" ? "Urutan level menentukan susunan diagram"
            : "Periksa kenapa seseorang terlihat atau tidak"}
        </span>
      </div>

      {tampilan === "level" && <KelolaLevel onBerubah={muat} />}

      {tampilan === "uji" && <Diagnosa />}

      {tampilan === "diagram" && (
        <Diagram
          list={list}
          levelRef={levelRef}
          sibuk={sibuk}
          onSimpanRantai={simpanRantai}
          onEdit={(nama) => {
            const j = list.find((x) => x.jabatan === nama);
            if (j) bukaEdit(j);
          }}
        />
      )}

      {tampilan === "tabel" && (
      <section className="card pa-tabel-kartu">
        <div className="tabel-scroll">
          <table className="pa-tabel mh-tabel">
            <thead>
              <tr>
                <th>Jabatan</th>
                <th style={{ width: 170 }}>Level</th>
                <th>Rantai atasan</th>
                <th className="r" style={{ width: 90 }}>Pegawai</th>
                <th className="r" style={{ width: 150 }}>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.jabatan} className={j.aktif ? undefined : "mati"}>
                  <td>
                    <div className="ka-label">
                      {j.jabatan}
                      {!j.aktif && <span className="rk-tag ka-mati">nonaktif</span>}
                    </div>
                    {j.alias.length > 0 && (
                      <div className="mh-alias">
                        <span className="faint">juga dibaca:</span>
                        {j.alias.map((a) => (
                          <button key={a} className="mh-alias-chip" title="Klik untuk hapus alias" disabled={sibuk}
                                  onClick={() => { if (confirm(`Hapus alias "${a}"?`)) alias("hapus", a); }}>{a} ×</button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td><span className="mh-level">{namaLevel(j.level)}</span></td>
                  <td>
                    {j.rantai.length === 0
                      ? <span className={j.level === levelTertinggi ? "faint" : "pa-status warn"}>{j.level === levelTertinggi ? "— puncak rantai —" : "belum punya atasan"}</span>
                      : (
                        <div className="mh-rantai">
                          {j.rantai.map((r, i) => (
                            <span key={r.tingkat} className="mh-rantai-langkah">
                              {i > 0 && <Ikon nama="chevronRight" ukuran={12} />}
                              <span className="mh-rantai-chip">{r.atasan}</span>
                            </span>
                          ))}
                        </div>
                      )}
                  </td>
                  <td className={"r num " + (j.pemakai ? "" : "faint")}>{j.pemakai.toLocaleString("id-ID")}</td>
                  <td className="r">
                    <div className="pa-aksi">
                      <button className="pa-ikon-btn" disabled={sibuk} onClick={() => bukaEdit(j)} title={`Ubah ${j.jabatan}`}>
                        <Ikon nama="pencil" ukuran={15} />
                      </button>
                      <button className="pa-ikon-btn" disabled={sibuk} onClick={() => tambahAlias(j)} title="Tambah alias">
                        <Ikon nama="link" ukuran={15} />
                      </button>
                      <button className="pa-ikon-btn pr-mati" disabled={sibuk} onClick={() => hapus(j)} title={`Hapus ${j.jabatan}`}>
                        <Ikon nama="trash" ukuran={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr><td colSpan={5} className="empty">
                  Master hierarki masih kosong. Jalankan db/schema-hierarki.sql untuk mengisi data awal.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      <p className="pa-catatan">
        <Ikon nama="hierarchy" ukuran={16} />
        <span>
          Contoh membaca rantai: FC TT R2 → BCS TT → BCH F → BCH FE → ACH → BM → AM. BCH F melihat KPI FC TT R2 dan
          BCS TT, tapi tidak melihat BCH FE ke atas.
        </span>
      </p>

      {form && (
        <div className="modal-latar" onMouseDown={(e) => { if (e.target === e.currentTarget && !sibuk) setForm(null); }}>
          <form className="modal mh-modal" role="dialog" aria-modal="true" aria-labelledby="mh-judul" onSubmit={simpan}>
            <div className="modal-kepala">
              <span className="sd-ikon accent"><Ikon nama={form.jabatanAsli === null ? "badge" : "pencil"} ukuran={20} /></span>
              <div className="modal-judul">
                <h2 id="mh-judul">{form.jabatanAsli === null ? "Tambah jabatan" : `Ubah jabatan ${form.jabatanAsli}`}</h2>
                <p>Rantai atasan menentukan siapa yang boleh melihat KPI pemegang jabatan ini.</p>
              </div>
              <button type="button" className="pa-tutup" onClick={() => setForm(null)} disabled={sibuk} aria-label="Tutup">×</button>
            </div>

            <div className="modal-isi">
              {galat && <div className="alert-box bad"><span className="alert-ikon">!</span><span>{galat}</span></div>}
              <div className="pa-form-grid">
                <label className="field">
                  <span>Nama jabatan</span>
                  <input required value={form.jabatan} placeholder="BCH F"
                         onChange={(e) => setForm({ ...form, jabatan: e.target.value })} />
                </label>
                <label className="field">
                  <span>Level</span>
                  <Pilih
                    nilai={form.level}
                    onPilih={(v) => setForm({ ...form, level: v })}
                    cari={false}
                    opsi={levelRef.filter((l) => l.aktif)
                      .map((l) => ({ nilai: l.kode, label: l.nama, ket: l.se_area ? "se-area" : undefined }))}
                  />
                </label>
                <label className="field">
                  <span>Urutan (opsional)</span>
                  <input className="num" inputMode="numeric" value={form.urutan}
                         placeholder="otomatis dari level"
                         onChange={(e) => setForm({ ...form, urutan: e.target.value })} />
                </label>
              </div>

              <div className="mh-rantai-form">
                <div className="mh-rantai-form-kepala">
                  <span className="eyebrow">RANTAI ATASAN</span>
                  <span className="faint small">dari atasan langsung ke paling atas</span>
                </div>
                <div className="rantai">
                  {form.rantai.map((r, i) => (
                    <div className="rantai-item" key={i}>
                      <span className="rantai-no num">{i + 1}</span>
                      <div className="rantai-pilih">
                        <Pilih nilai={r} onPilih={(v) => ubahRantai(i, v)} bebas
                               placeholder={i === 0 ? "atasan langsung" : "atasan berikutnya"}
                               opsi={opsiAtasan(form.jabatan)} />
                      </div>
                      <button type="button" className="pa-ikon-btn pr-mati" title="Hapus tingkat ini"
                              onClick={() => setForm({ ...form, rantai: form.rantai.filter((_, x) => x !== i) })}>
                        <Ikon nama="trash" ukuran={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn ghost sm"
                        onClick={() => setForm({ ...form, rantai: [...form.rantai, ""] })}>
                  <Ikon nama="plus" ukuran={14} /> Tambah tingkat
                </button>
              </div>

              <label className={"ka-opsi-item" + (form.aktif ? " on" : "")}>
                <input type="checkbox" checked={form.aktif}
                       onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
                <span><b>Jabatan aktif dipakai</b><small>Nonaktif berarti tidak ikut aturan visibilitas</small></span>
              </label>
            </div>

            <div className="modal-kaki">
              <button className="btn ghost" type="button" onClick={() => setForm(null)} disabled={sibuk}>Batal</button>
              <button className="btn" type="submit" disabled={sibuk}>
                <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
