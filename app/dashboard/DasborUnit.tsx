import Link from "next/link";
import Ladder from "@/components/Ladder";
import TombolCetak from "@/components/TombolCetak";
import { rp, rpSingkat, angka } from "@/lib/format";

type Unit = {
  lingkup: string; seArea: boolean; orang: number;
  rata: number; rataLalu: number | null; insentif: number;
  sebaran: { dibawah3: number; di3: number; di4: number; di5: number };
  terendah: { nik: string; nama: string; jabatan: string | null; cabang: string | null; skor: number }[];
  indikatorLemah: { indikator: string; jumlah: number }[];
  cabang: { cabang: string; orang: number; rata: number; dibawah: number }[];
};

/**
 * Dasbor untuk atasan yang tidak punya KPI pribadi (BM, DBM, ACH, AM).
 *
 * Buat mereka, pertanyaan "berapa skor saya" tidak ada jawabannya — yang
 * relevan adalah kondisi unit yang dipimpin. Susunannya mengikuti urutan
 * yang biasanya ditanyakan: sehat atau tidak secara keseluruhan, siapa yang
 * perlu dibantu, lalu apa yang salah secara sistemik.
 */
export default function DasborUnit({ u, periode }: { u: Unit; periode: string }) {
  const naik = u.rataLalu !== null ? u.rata - u.rataLalu : null;
  const total = Math.max(1, u.orang);
  const persen = (n: number) => Math.round((n / total) * 100);

  return (
    <main className="shell">
      <div className="sectionhead rowbetween">
        <div>
          <h2>Kinerja tim — {u.lingkup}</h2>
          <p>
            {u.orang} orang di bawah koordinasi Anda. Angka pribadi Anda tidak
            termasuk dalam KPI bulanan, jadi halaman ini menampilkan kondisi unit.
          </p>
        </div>
        <TombolCetak />
      </div>

      {/* Dua angka utama */}
      <section className="card card-pad dash-ring">
        <div className="dash-metrik">
          <div className="metrik">
            <span className="eyebrow">Skor rata-rata unit</span>
            <div className="scorewrap">
              <b className="score">{angka(u.rata)}</b>
              <span className="scoreof">dari 5,00</span>
              {naik !== null && naik !== 0 && (
                <span className={naik > 0 ? "delta up" : "delta down"}>
                  {naik > 0 ? "▲" : "▼"} {angka(Math.abs(naik))}
                </span>
              )}
            </div>
            <p className="muted small nomargin">
              {u.rataLalu !== null
                ? <>Bulan lalu {angka(u.rataLalu)}</>
                : <>Belum ada pembanding bulan lalu</>}
            </p>
          </div>

          <div className="metrik">
            <span className="eyebrow">Total insentif tim</span>
            <div className="moneyrow">
              <b className="money">{rp(u.insentif)}</b>
            </div>
            <p className="muted small nomargin">
              Gabungan seluruh anggota, final menunggu tutup buku
            </p>
          </div>
        </div>

        <Ladder v={u.rata} t3={3} t4={4} t5={5} satuan="skor" />
      </section>

      {/* Sebaran */}
      <section className="unit-sebaran">
        <div className={"sbar" + (u.sebaran.dibawah3 ? " bahaya" : "")}>
          <b>{u.sebaran.dibawah3}</b>
          <span>di bawah KPI 3</span>
          <i style={{ width: `${persen(u.sebaran.dibawah3)}%` }} />
        </div>
        <div className="sbar">
          <b>{u.sebaran.di3}</b><span>KPI 3</span>
          <i style={{ width: `${persen(u.sebaran.di3)}%` }} />
        </div>
        <div className="sbar">
          <b>{u.sebaran.di4}</b><span>KPI 4</span>
          <i style={{ width: `${persen(u.sebaran.di4)}%` }} />
        </div>
        <div className="sbar baik">
          <b>{u.sebaran.di5}</b><span>KPI 5</span>
          <i style={{ width: `${persen(u.sebaran.di5)}%` }} />
        </div>
      </section>

      <section className="unit-dua">
        {/* Yang perlu dibantu lebih dulu */}
        <div className="card">
          <div className="cardhead rowbetween">
            <h3>Paling perlu perhatian</h3>
            <Link href={`/tim?periode=${periode}`} className="lnk">Lihat semua →</Link>
          </div>
          <ul className="orangkecil">
            {u.terendah.map((o) => (
              <li key={o.nik}>
                <span className="ok-id">
                  <b>{o.nama}</b>
                  <span className="faint num">{o.jabatan ?? "—"} · {o.cabang ?? "—"}</span>
                </span>
                <span className={"ok-skor" + (o.skor < 3 ? " lo" : "")}>{angka(o.skor)}</span>
              </li>
            ))}
            {!u.terendah.length && <li className="faint">Belum ada data anggota.</li>}
          </ul>
        </div>

        {/* Masalah yang berulang di banyak orang */}
        <div className="card">
          <div className="cardhead">
            <h3>Indikator terlemah se-unit</h3>
          </div>
          <ul className="lemahkecil">
            {u.indikatorLemah.map((x) => (
              <li key={x.indikator}>
                <span className="lk-nama" title={x.indikator}>{x.indikator}</span>
                <span className="lk-jml">{x.jumlah} orang</span>
              </li>
            ))}
            {!u.indikatorLemah.length && (
              <li className="faint">Tidak ada indikator di bawah KPI 3.</li>
            )}
          </ul>
          <p className="faint small cardfoot">
            Indikator yang gagal di banyak orang biasanya soal proses atau target,
            bukan soal orang per orang.
          </p>
        </div>
      </section>

      {/* Peringkat cabang — hanya berguna bila membawahi lebih dari satu */}
      {u.cabang.length > 1 && (
        <>
          <div className="sectionhead">
            <div>
              <h2>Peringkat cabang</h2>
              <p>Diurutkan dari rata-rata terendah supaya yang tertinggal terlihat lebih dulu.</p>
            </div>
          </div>
          <section className="card tabel-responsif">
            <table>
              <thead>
                <tr>
                  <th>Cabang</th>
                  <th className="r">Orang</th>
                  <th className="r">Di bawah KPI 3</th>
                  <th className="r">Rata-rata</th>
                </tr>
              </thead>
              <tbody>
                {u.cabang.map((c) => (
                  <tr key={c.cabang}>
                    <td data-label="Cabang"><b>{c.cabang}</b></td>
                    <td className="r num" data-label="Orang">{c.orang}</td>
                    <td className="r num" data-label="Di bawah KPI 3">
                      {c.dibawah > 0
                        ? <span className="warnnum">{c.dibawah}</span>
                        : <span className="faint">0</span>}
                    </td>
                    <td className="r num utama" data-label="Rata-rata">
                      <span className={"skorpill" + (c.rata >= 4 ? " hi" : c.rata < 3 ? " lo" : "")}>
                        {angka(c.rata)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <div className="banner info mt">
        <b>Butuh rincian per orang?</b>
        Buka <Link href={`/tim?periode=${periode}&tampilan=detail`}>Tim saya</Link> untuk
        melihat seluruh indikator tiap anggota.
      </div>
    </main>
  );
}
