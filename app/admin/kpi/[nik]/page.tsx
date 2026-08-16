import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { tingkat } from "@/components/Ladder";
import TombolCetak from "@/components/TombolCetak";
import { readSession } from "@/lib/auth";
import { periodeTersedia, indikatorNik, insentifKaryawan, ringkasan } from "@/lib/kpi";
import { q } from "@/lib/db";
import { rp, rpSingkat, angka, nilai, namaPeriode, toISODate, tebakSatuan, nilaiBanding } from "@/lib/format";

export const metadata = { title: "Detail KPI karyawan" };

/**
 * Detail KPI satu karyawan untuk admin.
 *
 * Disusun berbeda dari layar karyawan. Karyawan membuka halamannya sendiri
 * sesekali dan butuh penjelasan; admin memeriksa puluhan orang berturut-turut
 * dan butuh membandingkan angka dengan cepat. Karena itu di sini kartu besar
 * diganti tabel padat, dan seluruh isi — ringkasan, indikator, insentif —
 * disusun agar muat dalam satu layar tanpa menggulir bolak-balik.
 */
export default async function DetailKpi({
  params, searchParams,
}: { params: Promise<{ nik: string }>; searchParams: Promise<{ periode?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  const { nik } = await params;
  const daftar = await periodeTersedia();
  const sp = await searchParams;
  const aktif = daftar.find((p) => toISODate(p.periode) === sp.periode) ?? daftar[0];
  const periode = aktif ? toISODate(aktif.periode) : "";

  const [orang] = await q<any>(
    `SELECT nama, cabang, area, jabatan FROM app_user WHERE nik = $1`, [nik]);
  const [ind, ins, ring] = await Promise.all([
    indikatorNik(nik, periode),
    insentifKaryawan(nik, periode),
    ringkasan(nik, periode),
  ]);

  const totalIns = ins.reduce((a, b) => a + b.nominal, 0);
  const lv = tingkat(ring.skor, 3, 4, 5);
  const naikSkor = ring.skorLalu !== null ? ring.skor - ring.skorLalu : null;

  // Indikator diolah sekali, lalu diurutkan: yang bermasalah lebih dulu.
  const olah = ind.map((d) => {
    const satuanTampil = tebakSatuan(d.indikator, d.pencapaian);
    const band = nilaiBanding(d.pencapaian, d.rasio, d.target_kpi3);
    const tk = band.v !== null && d.target_kpi3 !== null
      ? tingkat(band.v, d.target_kpi3, d.target_kpi4 ?? d.target_kpi3, d.target_kpi5 ?? d.target_kpi3)
      : null;
    return { d, satuanTampil, band, tk };
  }).sort((a, b) => (a.tk ?? 9) - (b.tk ?? 9));

  const kurang = olah.filter((x) => x.tk === 0).length;
  const insBerpengaruh = ins.filter((r) => r.nominal !== 0);

  return (
    <AppShell>
      <main className="shell rapat">
        {/* Satu bar berisi identitas dan dua angka kunci, jadi konteks tidak
            hilang saat admin menggulir daftar indikator. */}
        <div className="dk-bar">
          <div className="dk-id">
            <Link className="dk-balik"
                  href={`/admin/kpi?periode=${periode}&cabang=${encodeURIComponent(orang?.cabang ?? "")}`}>
              ← {orang?.cabang ?? "Kembali"}
            </Link>
            <h2>{orang?.nama ?? nik}</h2>
            <p className="faint num">
              {nik} · {orang?.jabatan ?? "—"} · {orang?.cabang ?? "—"} · {namaPeriode(periode)}
            </p>
          </div>

          {ind.length > 0 && (
            <div className="dk-angka">
              <div className={"dk-metrik" + (lv === 0 ? " bahaya" : lv >= 4 ? " baik" : "")}>
                <b>{angka(ring.skor)}</b>
                <span>
                  skor KPI
                  {naikSkor !== null && naikSkor !== 0 && (
                    <em className={naikSkor > 0 ? "naik" : "turun"}>
                      {naikSkor > 0 ? "▲" : "▼"}{angka(Math.abs(naikSkor))}
                    </em>
                  )}
                </span>
              </div>
              <div className="dk-metrik">
                <b>{rpSingkat(totalIns)}</b>
                <span>insentif</span>
              </div>
              <div className={"dk-metrik" + (kurang ? " bahaya" : "")}>
                <b>{kurang}<i>/{olah.length}</i></b>
                <span>di bawah KPI 3</span>
              </div>
              <TombolCetak />
            </div>
          )}
        </div>

        {!ind.length ? (
          <div className="card card-pad narrow">
            <h3>Tidak ada data</h3>
            <p className="muted">
              Karyawan ini tidak punya baris KPI di periode {namaPeriode(periode)}.
            </p>
          </div>
        ) : (
          <div className="dk-isi">
            {/* Indikator — tabel padat, bukan kartu. Satu baris satu indikator
                supaya angkanya sejajar dan mudah dibandingkan. */}
            <section className="card">
              <div className="dk-judul">
                <h3>Rincian indikator</h3>
                <span className="faint">{olah.length} indikator · yang bermasalah di atas</span>
              </div>
              <table className="dk-tabel">
                <thead>
                  <tr>
                    <th>Indikator</th>
                    <th className="r">Pencapaian</th>
                    <th className="r">Saldo awal</th>
                    <th className="r">Skor</th>
                    <th style={{ width: 132 }}>Posisi target</th>
                  </tr>
                </thead>
                <tbody>
                  {olah.map(({ d, satuanTampil, band, tk }, i) => {
                    // Posisi pada rentang KPI 3–5, dipakai untuk bilah mini.
                    const t3 = d.target_kpi3, t5 = d.target_kpi5 ?? d.target_kpi3;
                    let persen = 0;
                    if (band.v !== null && t3 !== null && t5 !== null && t5 !== t3) {
                      persen = Math.max(0, Math.min(100, ((band.v - t3) / (t5 - t3)) * 100));
                    } else if (tk !== null) {
                      persen = tk === 0 ? 8 : tk === 3 ? 40 : tk === 4 ? 70 : 100;
                    }
                    return (
                      <tr key={i} className={tk === 0 ? "kurang" : ""}>
                        <td>
                          <div className="dk-nama">{d.indikator}</div>
                          {d.produk && <div className="dk-produk">{d.produk}</div>}
                        </td>
                        <td className="r num dk-nilai">{nilai(d.pencapaian, satuanTampil)}</td>
                        <td className="r num faint">
                          {d.saldo_awal ? nilai(d.saldo_awal, satuanTampil) : "—"}
                        </td>
                        <td className="r">
                          <b className={"dk-skor" + (tk === 0 ? " bahaya" : tk === 5 ? " baik" : "")}>
                            {angka(d.skor_kpi)}
                          </b>
                        </td>
                        <td>
                          <div className="dk-meter" title={tk === null ? "Target belum diisi" : `KPI ${tk}`}>
                            <i className={"k" + (tk ?? 0)} style={{ width: `${persen}%` }} />
                            <em style={{ left: "50%" }} />
                          </div>
                          <div className="dk-meter-x">
                            <span>3</span><span>4</span><span>5</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {/* Insentif — kolom sempit di samping, bukan di bawah, supaya
                tidak menambah panjang halaman. */}
            <section className="card dk-samping">
              <div className="dk-judul">
                <h3>Insentif</h3>
                <span className="faint">{insBerpengaruh.length} dari {ins.length} berpengaruh</span>
              </div>
              <ul className="dk-ins">
                {insBerpengaruh.map((r) => (
                  <li key={r.kategori}>
                    <span className="dk-ins-nama" title={r.kategori}>{r.kategori}</span>
                    <span className={"dk-ins-rp" + (r.nominal < 0 ? " neg" : "")}>
                      {rpSingkat(r.nominal)}
                    </span>
                  </li>
                ))}
                {!insBerpengaruh.length && (
                  <li className="faint">Tidak ada kategori yang menghasilkan insentif.</li>
                )}
              </ul>
              <div className="dk-ins-total">
                <span>Total</span>
                <b>{rp(totalIns)}</b>
              </div>

              {ins.length > insBerpengaruh.length && (
                <details className="dk-ins-nol">
                  <summary>{ins.length - insBerpengaruh.length} kategori bernilai nol</summary>
                  <ul className="dk-ins">
                    {ins.filter((r) => r.nominal === 0).map((r) => (
                      <li key={r.kategori}>
                        <span className="dk-ins-nama faint" title={r.kategori}>{r.kategori}</span>
                        <span className="faint">
                          {r.rasio !== null ? Math.round(r.rasio * 100) + "%" : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}
