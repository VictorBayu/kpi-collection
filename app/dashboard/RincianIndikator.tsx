"use client";

import { useMemo, useState } from "react";
import Ladder, { kalimatJarak, tingkat } from "@/components/Ladder";
import { angka, nilai, tebakSatuan, nilaiBanding } from "@/lib/format";

type Ind = {
  produk: string | null; indikator: string;
  saldo_awal: number | null; pencapaian: number | null; rasio: number | null;
  skor_kpi: number | null; skor_terbobot: number | null;
  target_kpi3: number | null; target_kpi4: number | null; target_kpi5: number | null;
  catatan: string | null;
};

/**
 * Rincian indikator dalam bentuk padat.
 *
 * Versi lama menampilkan tiap indikator sebagai kartu besar dua kolom.
 * Dengan 24 indikator, halaman jadi sangat panjang padahal yang biasanya
 * dicari hanya beberapa yang bermasalah. Sekarang: kartu kecil tiga kolom,
 * dengan saringan bawaan ke indikator yang belum mencapai KPI 3.
 *
 * Semua data sudah dikirim server dalam satu render — menekan saringan
 * hanya menyembunyikan yang tidak dipilih, tidak memanggil server lagi.
 */
export default function RincianIndikator({ data }: { data: Ind[] }) {
  const [saring, setSaring] = useState<"perhatian" | "semua">("perhatian");
  const [terbuka, setTerbuka] = useState<number | null>(null);

  const olah = useMemo(() => data.map((d, i) => {
    const satuanTampil = tebakSatuan(d.indikator, d.pencapaian);
    const band = nilaiBanding(d.pencapaian, d.rasio, d.target_kpi3);
    const lv = band.v !== null && d.target_kpi3 !== null
      ? tingkat(band.v, d.target_kpi3,
                d.target_kpi4 ?? d.target_kpi3, d.target_kpi5 ?? d.target_kpi3)
      : null;
    return { d, i, satuanTampil, band, lv };
  }), [data]);

  const perhatian = olah.filter((x) => x.lv === 0);
  const tampil = saring === "perhatian" && perhatian.length ? perhatian : olah;

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Rincian per indikator</h2>
          <p>
            {perhatian.length === 0
              ? "Semua indikator Anda sudah mencapai KPI 3."
              : `${perhatian.length} dari ${olah.length} indikator masih di bawah KPI 3.`}
            {" "}Klik satu kartu untuk melihat target dan catatannya.
          </p>
        </div>
        {perhatian.length > 0 && (
          <div className="viewswitch">
            <button className={"vbtn" + (saring === "perhatian" ? " on" : "")}
                    onClick={() => setSaring("perhatian")}>
              Perlu perhatian ({perhatian.length})
            </button>
            <button className={"vbtn" + (saring === "semua" ? " on" : "")}
                    onClick={() => setSaring("semua")}>
              Semua ({olah.length})
            </button>
          </div>
        )}
      </div>

      <section className="indpadat">
        {tampil.map(({ d, i, satuanTampil, band, lv }) => {
          const buka = terbuka === i;
          return (
            <article
              key={i}
              className={"ipad" + (lv === 0 ? " kurang" : "") + (buka ? " buka" : "")}
              onClick={() => setTerbuka(buka ? null : i)}
            >
              <header className="ipad-head">
                <span className="ipad-nama" title={d.indikator}>{d.indikator}</span>
                {lv !== null && (
                  <span className={`dot k${lv}`} title={lv === 0 ? "Di bawah KPI 3" : `KPI ${lv}`}>
                    {lv === 0 ? "!" : lv}
                  </span>
                )}
              </header>

              {d.produk && <span className="ipad-produk">{d.produk}</span>}

              <div className="ipad-angka">
                <b>{nilai(d.pencapaian, satuanTampil)}</b>
                <span className="faint">skor {angka(d.skor_kpi)}</span>
              </div>

              <Ladder v={band.v} t3={d.target_kpi3} t4={d.target_kpi4}
                      t5={d.target_kpi5} satuan={band.satuan} ringkas />

              {buka && (
                <div className="ipad-detail" onClick={(e) => e.stopPropagation()}>
                  {d.saldo_awal ? (
                    <div className="ipad-baris">
                      <span>Saldo awal</span>
                      <b>{nilai(d.saldo_awal, satuanTampil)}</b>
                    </div>
                  ) : null}
                  {band.v !== null && d.target_kpi3 !== null
                    && d.target_kpi4 !== null && d.target_kpi5 !== null && (
                    <p className="ipad-jarak">
                      {kalimatJarak(band.v, d.target_kpi3, d.target_kpi4, d.target_kpi5, band.satuan)}
                    </p>
                  )}
                  {d.catatan && <p className="ipad-catatan">Catatan tim data: {d.catatan}</p>}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
