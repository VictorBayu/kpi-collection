"use client";

import { useCallback, useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import Diagram from "./Diagram";
import Diagnosa from "./Diagnosa";
import KelolaLevel from "./KelolaLevel";

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

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Master Hierarki Jabatan</h2>
          <p>
            Menentukan siapa boleh melihat KPI siapa. Atasan hanya melihat jabatan
            yang ada di bawahnya pada rantai, dan hanya dalam cabang/area sendiri.
          </p>
        </div>
        <button className="btn" onClick={() => bukaTambah()} disabled={sibuk}>+ Tambah jabatan</button>
      </div>

      {galat && <div className="banner warn"><b>Gagal</b>{galat}</div>}
      {kabar && <div className="banner good"><b>Selesai</b>{kabar}</div>}

      {yatim.length > 0 && (
        <div className="banner warn">
          <b>{yatim.length} jabatan belum dikenal master</b>
          Pegawai dengan jabatan ini tidak muncul di layar Tim Saya siapa pun.
          <div className="chiprow mt">
            {yatim.map((y) => (
              <button key={y.jabatan} className="chipbtn" onClick={() => petakanYatim(y)}>
                {y.jabatan} <span className="faint">· {y.pemakai} orang</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {form && (
        <section className="card card-pad mb">
          <h3 className="formtitle">
            {form.jabatanAsli === null ? "Tambah jabatan" : `Ubah jabatan ${form.jabatanAsli}`}
          </h3>
          <form onSubmit={simpan}>
            <div className="formgrid">
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
                    .map((l) => ({
                      nilai: l.kode, label: l.nama,
                      ket: l.se_area ? "se-area" : undefined,
                    }))}
                />
              </label>
              <label className="field">
                <span>Urutan (opsional)</span>
                <input className="num" inputMode="numeric" value={form.urutan}
                       placeholder="otomatis dari level"
                       onChange={(e) => setForm({ ...form, urutan: e.target.value })} />
              </label>
            </div>

            <div className="mt">
              <span className="eyebrow">Rantai atasan — dari atasan langsung ke paling atas</span>
              <div className="rantai">
                {form.rantai.map((r, i) => (
                  <div className="rantai-item" key={i}>
                    <span className="rantai-no">{i + 1}</span>
                    <div className="rantai-pilih">
                      <Pilih nilai={r} onPilih={(v) => ubahRantai(i, v)} bebas
                             placeholder={i === 0 ? "atasan langsung" : "atasan berikutnya"}
                             opsi={opsiAtasan(form.jabatan)} />
                    </div>
                    <button type="button" className="btn ghost sm"
                            onClick={() => setForm({
                              ...form, rantai: form.rantai.filter((_, x) => x !== i),
                            })}>Hapus</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn ghost sm mt"
                      onClick={() => setForm({ ...form, rantai: [...form.rantai, ""] })}>
                + Tambah tingkat
              </button>
            </div>

            <div className="formcheck">
              <label>
                <input type="checkbox" checked={form.aktif}
                       onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
                <span>Jabatan aktif dipakai</span>
              </label>
            </div>

            <div className="formact">
              <button className="btn" type="submit" disabled={sibuk}>
                {sibuk ? "Menyimpan…" : "Simpan"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setForm(null)}>Batal</button>
            </div>
          </form>
        </section>
      )}

      <div className="viewswitch mb">
        <span className="faint">Tampilan:</span>
        <button className={"vbtn" + (tampilan === "diagram" ? " on" : "")}
                onClick={() => setTampilan("diagram")}>Diagram</button>
        <button className={"vbtn" + (tampilan === "tabel" ? " on" : "")}
                onClick={() => setTampilan("tabel")}>Tabel</button>
        <button className={"vbtn" + (tampilan === "level" ? " on" : "")}
                onClick={() => setTampilan("level")}>Tingkatan</button>
        <button className={"vbtn" + (tampilan === "uji" ? " on" : "")}
                onClick={() => setTampilan("uji")}>Uji visibilitas</button>
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
      <section className="card">
        <table>
          <thead>
            <tr>
              <th>Jabatan</th>
              <th style={{ width: 170 }}>Level</th>
              <th>Rantai atasan</th>
              <th className="r" style={{ width: 90 }}>Pegawai</th>
              <th className="r" style={{ width: 210 }}>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.jabatan}>
                <td>
                  <b>{j.jabatan}</b>
                  {!j.aktif && <span className="tag-warn">nonaktif</span>}
                  {j.alias.length > 0 && (
                    <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                      juga dibaca:{" "}
                      {j.alias.map((a) => (
                        <button key={a} className="aliaschip" title="Klik untuk hapus alias"
                                onClick={() => alias("hapus", a)}>{a} ×</button>
                      ))}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 12.5 }}>{namaLevel(j.level)}</td>
                <td>
                  {j.rantai.length === 0
                    ? <span className="faint">— tidak punya atasan —</span>
                    : (
                      <div className="rantai-view">
                        {j.rantai.map((r) => (
                          <span key={r.tingkat} className="rantai-step">{r.atasan}</span>
                        ))}
                      </div>
                    )}
                </td>
                <td className="r num">{j.pemakai}</td>
                <td className="r">
                  <div className="rowact">
                    <button className="btn ghost sm" disabled={sibuk} onClick={() => bukaEdit(j)}>Ubah</button>
                    <button className="btn ghost sm" disabled={sibuk} onClick={() => tambahAlias(j)}>+ Alias</button>
                    <button className="btn danger sm" disabled={sibuk} onClick={() => hapus(j)}>Hapus</button>
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
      </section>
      )}

      <p className="faint mt">
        Contoh membaca rantai: FC TT R2 → BCS TT → BCH F → BCH FE → ACH → BM → AM.
        BCH F melihat KPI FC TT R2 dan BCS TT, tapi tidak melihat BCH FE ke atas.
      </p>
    </>
  );
}
