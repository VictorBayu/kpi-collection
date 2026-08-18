"use client";

import { useMemo, useState } from "react";

type Rantai = { tingkat: number; atasan: string };
export type JabatanDiagram = {
  jabatan: string; level: string; urutan: number; aktif: boolean;
  pemakai: number; rantai: Rantai[]; alias: string[];
};

type Props = {
  list: JabatanDiagram[];
  /** Daftar level dari master; menentukan lapisan dan urutannya. */
  levelRef: LevelRef[];
  sibuk: boolean;
  /** Menyimpan rantai baru untuk satu jabatan. */
  onSimpanRantai: (jabatan: string, rantai: string[]) => Promise<void> | void;
  onEdit: (jabatan: string) => void;
};

export type LevelRef = {
  kode: string; nama: string; urutan: number; se_area: boolean; aktif: boolean;
};

/**
 * Diagram struktur jabatan.
 *
 * Kenapa bukan bagan pohon bercabang: rantai atasan di sini tidak konsisten
 * antar jalur. BCH F beratasan BCH FE bila jalurnya lewat FC TT, tapi
 * beratasan ACH bila lewat FC F. Digambar sebagai pohon tunggal, salah satu
 * dari dua kenyataan itu pasti hilang.
 *
 * Karena itu diagram disusun berlapis menurut level, dan rantai satu jabatan
 * ditelusuri sebagai jalur yang menyala saat jabatannya dipilih. Penyusunan
 * ulang dilakukan dengan menyeret kartu di panel rantai.
 */
export default function Diagram({ list, levelRef, sibuk, onSimpanRantai, onEdit }: Props) {
  const [fokus, setFokus] = useState<string | null>(null);
  const [draf, setDraf] = useState<string[] | null>(null);
  const [seret, setSeret] = useState<number | null>(null);
  const [lewat, setLewat] = useState<number | null>(null);

  const lapisan = useMemo(() => {
    const peta = new Map<string, JabatanDiagram[]>();
    for (const j of list) {
      const arr = peta.get(j.level) ?? [];
      arr.push(j);
      peta.set(j.level, arr);
    }
    // Lapisan mengikuti urutan level dari master, tertinggi di atas.
    //
    // Level yang belum punya jabatan tetap ditampilkan sebagai baris kosong.
    // Sebelumnya level begini disaring keluar, sehingga admin yang baru
    // menambah level mengira penambahannya gagal — padahal levelnya ada,
    // hanya belum ada jabatan yang menempatinya.
    const urut = levelRef.slice()
      .filter((l) => l.aktif || peta.has(l.kode))
      .sort((a, b) => b.urutan - a.urutan);
    return urut.map((l) => ({
      level: l.kode,
      label: l.nama,
      isi: (peta.get(l.kode) ?? []).sort((a, b) => a.jabatan.localeCompare(b.jabatan)),
    }));
  }, [list, levelRef]);

  const terpilih = fokus ? list.find((j) => j.jabatan === fokus) ?? null : null;
  const rantaiAktif = draf ?? terpilih?.rantai.map((r) => r.atasan) ?? [];
  const berubah = draf !== null &&
    JSON.stringify(draf) !== JSON.stringify(terpilih?.rantai.map((r) => r.atasan) ?? []);

  /** Jabatan yang ikut menyala: yang dipilih + seluruh atasannya. */
  const menyala = new Set<string>(terpilih ? [terpilih.jabatan, ...rantaiAktif] : []);

  function pilih(nama: string) {
    setFokus(nama === fokus ? null : nama);
    setDraf(null);
  }

  function jatuhkan(ke: number) {
    if (seret === null || seret === ke) { setSeret(null); setLewat(null); return; }
    const baru = [...rantaiAktif];
    const [item] = baru.splice(seret, 1);
    baru.splice(ke, 0, item);
    setDraf(baru);
    setSeret(null);
    setLewat(null);
  }

  /** Menyeret kartu dari lapisan diagram untuk disisipkan ke rantai. */
  function jatuhkanBaru(nama: string) {
    if (!terpilih || nama === terpilih.jabatan) return;
    if (rantaiAktif.includes(nama)) return;
    setDraf([...rantaiAktif, nama]);
  }

  return (
    <section className="diagram">
      <div className="diagram-bar">
        <div>
          <b>Struktur per level</b>
          <span className="faint">
            {" "}— klik satu jabatan untuk melihat jalur atasannya
          </span>
        </div>
        {terpilih && (
          <button className="btn ghost sm" onClick={() => { setFokus(null); setDraf(null); }}>
            Bersihkan pilihan
          </button>
        )}
      </div>

      <div className="diagram-lapis">
        {lapisan.map((lp) => (
          <div className="lapis" key={lp.level}>
            <span className="lapis-judul">{lp.label}</span>
            <div className="lapis-isi">
              {!lp.isi.length && (
                <span className="lapis-kosong">Belum ada jabatan di level ini</span>
              )}
              {lp.isi.map((j) => {
                const nyala = menyala.has(j.jabatan);
                const ini = terpilih?.jabatan === j.jabatan;
                return (
                  <button
                    key={j.jabatan}
                    className={"jkartu" + (ini ? " ini" : "") + (nyala && !ini ? " nyala" : "")
                      + (terpilih && !nyala ? " redup" : "")}
                    draggable={!!terpilih && !nyala}
                    onDragStart={() => setSeret(null)}
                    onDragEnd={() => jatuhkanBaru(j.jabatan)}
                    onClick={() => pilih(j.jabatan)}
                    title={j.alias.length ? `alias: ${j.alias.join(", ")}` : undefined}
                  >
                    <span className="jkartu-nama">{j.jabatan}</span>
                    <span className="jkartu-jml">{j.pemakai}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {terpilih && (
        <div className="rantai-panel">
          <div className="rantai-panel-head">
            <div>
              <b>Rantai atasan {terpilih.jabatan}</b>
              <p className="faint small nomargin">
                Seret kartu untuk mengubah urutan. Nomor 1 adalah atasan langsung.
                Atasan bernomor besar boleh melihat KPI semua yang bernomor lebih kecil.
              </p>
            </div>
            <button className="btn ghost sm" onClick={() => onEdit(terpilih.jabatan)}>
              Buka form
            </button>
          </div>

          {rantaiAktif.length === 0 ? (
            <p className="faint">
              Belum punya atasan. Seret kartu jabatan dari diagram di atas untuk menambahkan.
            </p>
          ) : (
            <div className="rantai-seret">
              {rantaiAktif.map((nama, i) => (
                <div
                  key={nama + i}
                  className={"rseret" + (seret === i ? " diangkat" : "")
                    + (lewat === i && seret !== null && seret !== i ? " sasaran" : "")}
                  draggable
                  onDragStart={() => setSeret(i)}
                  onDragOver={(e) => { e.preventDefault(); setLewat(i); }}
                  onDragLeave={() => setLewat((l) => (l === i ? null : l))}
                  onDrop={(e) => { e.preventDefault(); jatuhkan(i); }}
                  onDragEnd={() => { setSeret(null); setLewat(null); }}
                >
                  <span className="rseret-no">{i + 1}</span>
                  <span className="rseret-nama">{nama}</span>
                  <button className="rseret-x" title="Keluarkan dari rantai"
                          onClick={() => setDraf(rantaiAktif.filter((_, x) => x !== i))}>×</button>
                  <span className="rseret-grip" aria-hidden>⋮⋮</span>
                </div>
              ))}
            </div>
          )}

          {berubah && (
            <div className="rantai-simpan">
              <span className="faint small">Urutan diubah dan belum disimpan.</span>
              <div className="formact" style={{ marginTop: 0 }}>
                <button className="btn sm" disabled={sibuk}
                        onClick={async () => { await onSimpanRantai(terpilih.jabatan, rantaiAktif); setDraf(null); }}>
                  Simpan rantai
                </button>
                <button className="btn ghost sm" onClick={() => setDraf(null)}>Batalkan</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
