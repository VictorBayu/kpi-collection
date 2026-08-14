import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia, timSaya, indikatorBanyakNik } from "@/lib/kpi";
import Link from "next/link";
import Ladder, { tingkat } from "@/components/Ladder";
import { rp, angka, nilai, namaPeriode, toISODate, tebakSatuan, nilaiBanding } from "@/lib/format";

export const metadata = { title: "Tim saya" };

export default async function Tim({
  searchParams,
}: { searchParams: Promise<{ periode?: string; tampilan?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran === "karyawan") redirect("/dashboard");

  const daftar = await periodeTersedia();
  if (!daftar.length) redirect("/dashboard");

  const { periode: pilih, tampilan } = await searchParams;
  const detail = tampilan === "detail";
  const aktif = daftar.find((p) => toISODate(p.periode) === pilih) ?? daftar[0];
  const periode = toISODate(aktif.periode);

  const { lingkup, anggota } = await timSaya(s.nik, periode);
  const rata = anggota.length
    ? anggota.reduce((a, b) => a + b.skor, 0) / anggota.length : 0;
  const dibawah = anggota.filter((a) => a.skor < 3).length;

  const ember = [0, 0, 0, 0, 0];
  anggota.forEach((a) => {
    const i = a.skor < 3 ? 0 : a.skor < 3.5 ? 1 : a.skor < 4 ? 2 : a.skor < 4.5 ? 3 : 4;
    ember[i]++;
  });
  const maks = Math.max(1, ...ember);

  // Tampilan detail: ambil seluruh indikator tiap anggota sekaligus.
  const petaInd = detail
    ? await indikatorBanyakNik(anggota.map((a) => a.nik), periode)
    : new Map<string, any[]>();

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>Tim saya — {lingkup}</h2>
            <p>
              {anggota.length} orang, periode {namaPeriode(periode)}. Diurutkan dari skor
              terendah supaya yang butuh bantuan terlihat lebih dulu.
            </p>
          </div>
        </div>

        <section className="hero">
          <div className="card card-pad">
            <span className="eyebrow">Skor rata-rata {lingkup.toLowerCase()}</span>
            <div className="scorewrap">
              <b className="score sm">{angka(rata)}</b>
            </div>
            <p className="muted small">
              {dibawah === 0
                ? "Semua anggota tim sudah di atas KPI 3."
                : `${dibawah} orang masih di bawah KPI 3 dan perlu perhatian bulan ini.`}
            </p>
          </div>

          <div className="card card-pad">
            <span className="eyebrow">Sebaran skor tim</span>
            <div className="distro">
              {ember.map((n, i) => (
                <div key={i} style={{ height: `${(n / maks) * 100}%` }}><span>{n}</span></div>
              ))}
            </div>
            <div className="distro-x">
              <span>&lt;3</span><span>3,0–3,5</span><span>3,5–4,0</span><span>4,0–4,5</span><span>&gt;4,5</span>
            </div>
          </div>
        </section>

        <div className="viewswitch mt">
          <span className="faint">Tampilan:</span>
          <Link href={`/tim?periode=${periode}`}
                className={"vbtn" + (detail ? "" : " on")}>Indikator terlemah</Link>
          <Link href={`/tim?periode=${periode}&tampilan=detail`}
                className={"vbtn" + (detail ? " on" : "")}>Detail semua indikator</Link>
        </div>

        <section className="card mt">
          <table>
            <thead>
              <tr>
                <th>Nama</th><th>{detail ? "Rincian" : "Indikator terlemah"}</th>
                <th style={{ width: 220 }}>Skor KPI</th><th className="r">Insentif</th>
              </tr>
            </thead>
            <tbody>
              {anggota.map((a) => (
                <tr key={a.nik}>
                  <td><b>{a.nama}</b><div className="faint num">{a.nik} · {a.jabatan ?? "—"}</div></td>
                  <td className={a.terlemah ? "" : "faint"}>
                    {!detail ? (a.terlemah ?? "—") : (
                      <details className="indbox">
                        <summary>
                          <span className="sum-lbl">
                            Lihat {(petaInd.get(a.nik) ?? []).length} indikator
                          </span>
                          {a.terlemah && (
                            <span className="faint sum-weak">terlemah: {a.terlemah}</span>
                          )}
                        </summary>
                      <div className="indlist">
                        {(petaInd.get(a.nik) ?? []).map((d: any, i: number) => {
                          const satuanTampil = tebakSatuan(d.indikator, d.pencapaian);
                          const band = nilaiBanding(d.pencapaian, d.rasio, d.target_kpi3);
                          const lv = band.v !== null && d.target_kpi3 !== null
                            ? tingkat(band.v, d.target_kpi3,
                                      d.target_kpi4 ?? d.target_kpi3, d.target_kpi5 ?? d.target_kpi3)
                            : null;
                          return (
                            <div className="indrow" key={i}>
                              <div className="indrow-top">
                                <span className="indnama">
                                  {d.indikator}
                                  {d.produk ? <span className="faint"> · {d.produk}</span> : null}
                                </span>
                                {lv !== null && (
                                  <span className={`chip k${lv}`}>{lv === 0 ? "< KPI 3" : `KPI ${lv}`}</span>
                                )}
                              </div>
                              <div className="indrow-figs faint">
                                <span>Pencapaian <b>{nilai(d.pencapaian, satuanTampil)}</b></span>
                                <span>Skor <b>{angka(d.skor_kpi)}</b></span>
                              </div>
                              <Ladder v={band.v} t3={d.target_kpi3} t4={d.target_kpi4}
                                      t5={d.target_kpi5} satuan={band.satuan} ringkas />
                            </div>
                          );
                        })}
                        {!(petaInd.get(a.nik) ?? []).length && (
                          <span className="faint">Tidak ada indikator.</span>
                        )}
                      </div>
                      </details>
                    )}
                  </td>
                  <td>
                    <div className="rowbetween small">
                      <span className="num"><b>{angka(a.skor)}</b></span>
                      <span className="faint">
                        {a.skor >= 4 ? "KPI 4" : a.skor >= 3 ? "KPI 3" : "di bawah KPI 3"}
                      </span>
                    </div>
                    <div className="rankbar">
                      <i className={a.skor >= 4 ? "high" : a.skor < 3 ? "low" : ""}
                         style={{ width: `${Math.min(100, (a.skor / 5) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="r num">{rp(a.insentif)}</td>
                </tr>
              ))}
              {!anggota.length && (
                <tr><td colSpan={4} className="empty">
                  Belum ada anggota tim dengan data di periode ini.
                </td></tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  );
}
