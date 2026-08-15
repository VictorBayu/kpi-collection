"use client";

import { useState } from "react";
import { rp, rpSingkat, angka, namaPeriode } from "@/lib/format";

type Baris = {
  kategori: string; saldo_awal: number | null; pencapaian: number | null;
  rasio: number | null; nominal: number;
};

/**
 * Rincian insentif.
 *
 * Sebagian besar baris biasanya bernilai nol — kategori yang tidak kena
 * penalty dan tidak dapat extra. Menampilkan semuanya membuat tabel panjang
 * tanpa memberi informasi, jadi baris nol disembunyikan lebih dulu dan bisa
 * dibuka kalau memang ingin diperiksa.
 */
export default function TabelInsentif({
  data, periode, total,
}: { data: Baris[]; periode: string; total: number }) {
  const [semua, setSemua] = useState(false);

  const berpengaruh = data.filter((r) => r.nominal !== 0);
  const nol = data.length - berpengaruh.length;
  const tampil = semua || !berpengaruh.length ? data : berpengaruh;

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Dari mana insentif ini datang</h2>
          <p>
            {berpengaruh.length === 0
              ? "Belum ada kategori yang menghasilkan insentif periode ini."
              : `${berpengaruh.length} kategori memengaruhi angka insentif Anda.`}
          </p>
        </div>
        {nol > 0 && berpengaruh.length > 0 && (
          <button className="btn ghost sm" onClick={() => setSemua(!semua)}>
            {semua ? "Sembunyikan yang nol" : `Tampilkan ${nol} kategori bernilai nol`}
          </button>
        )}
      </div>

      <section className="card tabel-responsif">
        <table>
          <thead>
            <tr>
              <th>Kategori</th><th className="r">Saldo awal</th><th className="r">Pencapaian</th>
              <th className="r">Rasio</th><th className="r">Insentif</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((r) => (
              <tr key={r.kategori} className={r.nominal === 0 ? "baris-nol" : ""}>
                <td data-label="Kategori">
                  <b>{r.kategori}</b>{" "}
                  {r.nominal < 0
                    ? <span className="chip c-tolak">Penalty</span>
                    : r.nominal > 0
                      ? <span className="chip c-selesai">Extra</span>
                      : null}
                </td>
                <td className="r num faint" data-label="Saldo awal">
                  {r.saldo_awal ? rpSingkat(r.saldo_awal) : "—"}
                </td>
                <td className="r num" data-label="Pencapaian">
                  {r.saldo_awal ? rpSingkat(r.pencapaian) : angka(r.pencapaian, 0)}
                </td>
                <td className="r num" data-label="Rasio">
                  {r.rasio !== null ? Math.round(r.rasio * 100) + "%" : "—"}
                </td>
                <td className={"r num utama" + (r.nominal < 0 ? " neg" : "")} data-label="Insentif">
                  <b>{rp(r.nominal)}</b>
                </td>
              </tr>
            ))}
            {!data.length && (
              <tr><td colSpan={5} className="empty">Belum ada rincian insentif untuk periode ini.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total perkiraan insentif {namaPeriode(periode)}</td>
              <td className="r num">{rp(total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </>
  );
}
