"use client";

import { useState } from "react";
import { rp, angka, nilai, tebakSatuan } from "@/lib/format";
import type { progresNik, ringkasHarian } from "@/lib/harian";

type Baris = Awaited<ReturnType<typeof progresNik>>[number];
type Ringkas = Awaited<ReturnType<typeof ringkasHarian>>;
type Pita = Baris["pita"][number];

/**
 * Format pencapaian yang paham apakah nilainya sudah berupa persen.
 *
 * Indikator dengan "kalikan 100" menyimpan pencapaian sebagai angka persen
 * (35,04), bukan rasio (0,3504). Formatter persen umum selalu mengalikan
 * 100, jadi untuk nilai yang sudah persen kita cukup menempelkan "%" —
 * kalau tidak, 35,04 tampil jadi 3504%.
 */
function pencapaianTampil(
  v: number | null, satuan: string, persenSudah: boolean,
): string {
  if (v === null) return "—";
  if (persenSudah && satuan === "persen") {
    return v.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";
  }
  return nilai(v, satuan);
}

/** Angka ambang pita apa adanya (bukan rasio ×100): 82 → "82%", 90 → "90%". */
function ambangTampil(v: number | null, satuan: string, persenSudah: boolean): string {
  if (v === null) return "∞";
  if (persenSudah && satuan === "persen") {
    return v.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";
  }
  return nilai(v, satuan);
}

/**
 * Target tingkat berikutnya dari pita: ambang yang perlu dilewati untuk
 * naik satu tingkat, plus perkiraan nilai KPI di tingkat itu. Mengembalikan
 * null bila sudah di pita teratas (tak ada lagi yang bisa dikejar) atau
 * indikatornya memang tidak memakai pita.
 */
function targetBerikut(
  pita: Pita[], pencapaian: number | null,
): { ambang: number | null; poin: number | null } | null {
  if (!pita.length || pencapaian === null) return null;
  // Pita saat ini: yang memuat nilai pencapaian sekarang.
  const kini = pita.find(
    (b) =>
      (b.min === null || pencapaian >= b.min) &&
      (b.max === null || pencapaian < b.max),
  );
  if (!kini) {
    // Di bawah pita pertama → kejar batas atas pita pertama.
    const awal = pita[0];
    return awal ? { ambang: awal.max, poin: awal.poinMax } : null;
  }
  // Sudah di pita teratas (tak berbatas atas) → tidak ada lagi target.
  if (kini.max === null) return null;
  return { ambang: kini.max, poin: kini.poinMax };
}

/**
 * Rincian progres harian satu orang.
 *
 * Indikator dipisah menurut perannya, bukan disatukan dalam satu tabel
 * panjang. Alasannya bukan kerapian: indikator yang menilai KPI, yang
 * membayar nominal, yang menambah/mengurangi, dan yang cuma jadi bahan
 * syarat menuntut tindakan yang berbeda-beda. Dicampur jadi satu, pembaca
 * mengira semuanya sama-sama perlu dikejar.
 */

const JUDUL: Record<string, { judul: string; ket: string }> = {
  nominal: {
    judul: "Insentif bersyarat",
    ket: "Cair penuh bila semua syarat lolos; nol bila ada satu yang gagal.",
  },
  kpi: {
    judul: "Indikator KPI & insentif reguler",
    ket: "Menyumbang skor sesuai bobotnya masing-masing.",
  },
  reward: { judul: "Reward", ket: "Menambah nominal insentif." },
  penalty: { judul: "Penalty", ket: "Mengurangi nominal insentif." },
  tier: { judul: "Penentu tier", ket: "Menentukan tier, tidak ikut skor." },
  pendukung: {
    judul: "Angka pendukung",
    ket: "Tidak dinilai dan tidak dibayar — hanya bahan syarat.",
  },
};

const URUT = ["nominal", "kpi", "reward", "penalty", "tier", "pendukung"];

export default function RincianHarian({
  ringkas, baris,
}: { ringkas: Ringkas; baris: Baris[] }) {
  // 'reguler' adalah nilai lama yang setara 'kpi'; disatukan supaya tidak
  // muncul sebagai kelompok kembar yang membingungkan.
  const kelompok = new Map<string, Baris[]>();
  for (const b of baris) {
    const k = b.peran === "reguler" ? "kpi" : (b.peran || "kpi");
    kelompok.set(k, [...(kelompok.get(k) ?? []), b]);
  }

  const adaRincian = ringkas.dasar || ringkas.reward || ringkas.penalty;

  return (
    <>
      <div className="kartu-angka mb">
        <div className="angka-kotak">
          <span>Skor berjalan</span>
          <b className={ringkas.skor === null ? "" :
                        ringkas.skor >= 4 ? "baik" : ringkas.skor < 3 ? "buruk" : ""}>
            {ringkas.skor === null ? "—" : angka(ringkas.skor)}
          </b>
          <i>{ringkas.dinilai} indikator dinilai</i>
        </div>
        <div className="angka-kotak">
          <span>Di bawah KPI 3</span>
          <b className={ringkas.bawah ? "buruk" : ""}>{ringkas.bawah}</b>
          <i>perlu dikejar</i>
        </div>
        <div className="angka-kotak">
          <span>Proyeksi insentif</span>
          <b>{rp(ringkas.insentif)}</b>
          <i>belum final</i>
        </div>
        {adaRincian ? (
          <div className="angka-kotak">
            <span>Rincian</span>
            <b style={{ fontSize: 15 }}>
              {rp(ringkas.dasar)}
              {ringkas.reward ? ` + ${rp(ringkas.reward)}` : ""}
              {ringkas.penalty ? ` − ${rp(ringkas.penalty)}` : ""}
            </b>
            <i>pokok{ringkas.reward ? " + reward" : ""}{ringkas.penalty ? " − penalty" : ""}</i>
          </div>
        ) : null}
      </div>

      {URUT.filter((p) => kelompok.has(p)).map((peran) => (
        <KelompokPeran key={peran} peran={peran} isi={kelompok.get(peran)!} />
      ))}

      {!baris.length && (
        <div className="card card-pad">
          <p className="muted">
            Belum ada indikator terhitung untuk bulan berjalan. Ini terjadi bila
            jabatan · produk yang bersangkutan belum didaftarkan ke indikator
            mana pun, atau data API-nya belum ditarik.
          </p>
        </div>
      )}
    </>
  );
}

function KelompokPeran({ peran, isi }: { peran: string; isi: Baris[] }) {
  const info = JUDUL[peran] ?? { judul: peran, ket: "" };
  const nominalPeran = peran === "nominal";
  // Sebagian indikator memakai pita; kalau ada satu saja, kolom "Target
  // berikutnya" ditampilkan untuk seluruh kelompok agar rata.
  const adaPita = !nominalPeran && isi.some((b) => b.pita.length > 0);

  return (
    <section className={"card mb rh-grup rh-" + peran}>
      <div className="cardhead">
        <h3 style={{ fontSize: 14 }}>{info.judul}</h3>
        <p className="muted small">{info.ket}</p>
      </div>
      <table className="dk-tabel rh-tabel">
        <thead>
          <tr>
            <th>Indikator</th>
            <th className="r">Pencapaian</th>
            {nominalPeran ? (
              <th className="r">Nominal</th>
            ) : (
              <>
                <th className="r">Nilai KPI</th>
                {adaPita && <th className="r rh-col-target">Target berikutnya</th>}
                <th className="r">Bobot</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {isi.map((b, i) => (
            <BarisIndikator key={i} b={b} nominalPeran={nominalPeran} adaPita={adaPita} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function BarisIndikator({
  b, nominalPeran, adaPita,
}: { b: Baris; nominalPeran: boolean; adaPita: boolean }) {
  const [buka, setBuka] = useState(false);
  const satuan = b.satuan ?? tebakSatuan(b.indikator, b.pencapaian);
  const persenSudah = b.persenSudah ?? false;
  const lv = b.skorKpi === null ? null : b.skorKpi >= 4 ? 4 : b.skorKpi >= 3 ? 3 : 0;
  const punyaPita = b.pita.length > 0;
  const next = punyaPita ? targetBerikut(b.pita, b.pencapaian) : null;
  const kolom = nominalPeran ? 3 : adaPita ? 5 : 4;

  return (
    <>
      <tr className={lv === 0 ? "kurang" : ""}>
        <td>
          <div className="dk-nama">{b.indikator}</div>
          {b.produk && <div className="dk-produk">{b.produk}</div>}
          {nominalPeran && (
            b.gerbangGagal
              ? <div className="dk-gerbang gagal">Tidak cair — {b.gerbangGagal}</div>
              : b.nominalBaris
              ? <div className="dk-gerbang lolos">Semua syarat lolos</div>
              : null
          )}
        </td>
        <td className="r num dk-nilai">{pencapaianTampil(b.pencapaian, satuan, persenSudah)}</td>
        {nominalPeran ? (
          <td className="r num">
            <b className={b.nominalBaris ? "" : "faint"}>{rp(b.nominalBaris ?? 0)}</b>
          </td>
        ) : (
          <>
            <td className="r">
              {punyaPita ? (
                <button type="button"
                        className={"rh-kpi" + (buka ? " on" : "") +
                                   (lv === 0 ? " bahaya" : lv === 4 ? " baik" : "")}
                        onClick={() => setBuka((v) => !v)}
                        aria-expanded={buka}
                        title="Lihat seluruh ambang target">
                  {b.skorKpi === null ? "—" : angka(b.skorKpi)}
                  <span className="rh-caret" aria-hidden>{buka ? "▴" : "▾"}</span>
                </button>
              ) : (
                <b className={"dk-skor" + (lv === 0 ? " bahaya" : lv === 4 ? " baik" : "")}>
                  {b.skorKpi === null ? "—" : angka(b.skorKpi)}
                </b>
              )}
            </td>
            {adaPita && (
              <td className="r rh-col-target">
                {next && next.ambang !== null ? (
                  <>
                    <b className="rh-chase">{ambangTampil(next.ambang, satuan, persenSudah)}</b>
                    {next.poin !== null && (
                      <div className="faint small">→ KPI {angka(next.poin, 0)}</div>
                    )}
                  </>
                ) : punyaPita ? (
                  <span className="rh-max">tercapai maks</span>
                ) : (
                  <span className="faint">—</span>
                )}
              </td>
            )}
            <td className="r num faint">
              {[b.bobot !== null && `KPI ${b.bobot}%`,
                b.bobotInsentif !== null && `Ins ${b.bobotInsentif}%`]
                .filter(Boolean).join(" · ") || "—"}
            </td>
          </>
        )}
      </tr>

      {punyaPita && buka && (
        <tr className="rh-banded">
          <td colSpan={kolom}>
            <PitaTabel b={b} satuan={satuan} persenSudah={persenSudah} />
          </td>
        </tr>
      )}
    </>
  );
}

function PitaTabel({
  b, satuan, persenSudah,
}: { b: Baris; satuan: string; persenSudah: boolean }) {
  const p = b.pencapaian;
  return (
    <div className="rh-pita">
      <div className="rh-pita-head">
        <span>Band pencapaian</span>
        <span className="r">Batas atas</span>
        <span className="r">Nilai KPI</span>
      </div>
      {b.pita.map((band, i) => {
        const kini =
          p !== null &&
          (band.min === null || p >= band.min) &&
          (band.max === null || p < band.max);
        const bawah = band.min === null
          ? `< ${ambangTampil(band.max, satuan, persenSudah)}`
          : `${ambangTampil(band.min, satuan, persenSudah)} – ${ambangTampil(band.max, satuan, persenSudah)}`;
        const poin = band.poinMin === band.poinMax
          ? angka(band.poinMin, 0)
          : `${angka(band.poinMin, 0)}–${angka(band.poinMax, 0)}`;
        return (
          <div className={"rh-pita-baris" + (kini ? " kini" : "")} key={i}>
            <span>
              {bawah}
              {kini && (
                <span className="rh-here">
                  {" "}← posisi Anda ({pencapaianTampil(p, satuan, persenSudah)})
                </span>
              )}
            </span>
            <span className="r">
              {band.max === null ? "∞" : ambangTampil(band.max, satuan, persenSudah)}
            </span>
            <span className="r">{poin}</span>
          </div>
        );
      })}
    </div>
  );
}
