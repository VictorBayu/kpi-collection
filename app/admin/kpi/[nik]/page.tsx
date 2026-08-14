import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Ladder, { kalimatJarak, tingkat } from "@/components/Ladder";
import { readSession } from "@/lib/auth";
import { periodeTersedia, indikatorNik, insentifKaryawan, ringkasan } from "@/lib/kpi";
import { q } from "@/lib/db";
import { rp, rpSingkat, angka, nilai, namaPeriode, toISODate, tebakSatuan, nilaiBanding } from "@/lib/format";

export const metadata = { title: "Detail KPI karyawan" };

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

  const [orang] = await q<any>(`SELECT nama, cabang, jabatan FROM app_user WHERE nik = $1`, [nik]);
  const [ind, ins, ring] = await Promise.all([
    indikatorNik(nik, periode),
    insentifKaryawan(nik, periode),
    ringkasan(nik, periode),
  ]);

  const totalIns = ins.reduce((a, b) => a + b.nominal, 0);
  const lv = tingkat(ring.skor, 3, 4, 5);

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <p className="faint" style={{ marginBottom: 4 }}>
              <Link className="lnk" href={`/admin/kpi?periode=${periode}&cabang=${encodeURIComponent(orang?.cabang ?? "")}`}>← Kembali ke {orang?.cabang ?? "cabang"}</Link>
            </p>
            <h2>{orang?.nama ?? nik}</h2>
            <p>NIK {nik} · {orang?.jabatan ?? "—"} · {orang?.cabang ?? "—"} · {namaPeriode(periode)}</p>
          </div>
        </div>

        {!ind.length ? (
          <div className="card card-pad narrow">
            <h3>Tidak ada data</h3>
            <p className="muted">Karyawan ini tidak punya baris KPI di periode {namaPeriode(periode)}.</p>
          </div>
        ) : (
          <>
            <section className="hero">
              <div className="card card-pad">
                <span className="eyebrow">Skor KPI</span>
                <div className="scorewrap">
                  <b className="score">{angka(ring.skor)}</b>
                  <span className="scoreof">dari 5,00</span>
                </div>
                <p className="verdict">
                  {lv > 0 ? <>Tingkat <b>KPI {lv}</b>. </> : <>Di bawah KPI 3. </>}
                  {kalimatJarak(ring.skor, 3, 4, 5, "unit").replace(" unit", " poin")}
                </p>
                <Ladder v={ring.skor} t3={3} t4={4} t5={5} satuan="skor" />
              </div>
              <div className="card card-pad">
                <span className="eyebrow">Total insentif</span>
                <div className="moneyrow"><b className="money">{rp(totalIns)}</b></div>
                <p className="muted small">Dari {ins.length} kategori insentif pada periode ini.</p>
              </div>
            </section>

            <div className="sectionhead"><div><h2 style={{ fontSize: 18 }}>Rincian indikator</h2></div></div>
            <section className="grid2">
              {ind.map((d, i) => {
                const satuanTampil = tebakSatuan(d.indikator, d.pencapaian);
                const band = nilaiBanding(d.pencapaian, d.rasio, d.target_kpi3);
                const lv2 = band.v !== null && d.target_kpi3 !== null
                  ? tingkat(band.v, d.target_kpi3, d.target_kpi4 ?? d.target_kpi3, d.target_kpi5 ?? d.target_kpi3)
                  : null;
                return (
                  <article className="card card-pad" key={i}>
                    <div className="ind-top">
                      <div><h3>{d.indikator}</h3><p className="faint">{d.produk ?? "Semua produk"}</p></div>
                      {lv2 !== null && <span className={`chip k${lv2}`}>{lv2 === 0 ? "Di bawah KPI 3" : `KPI ${lv2}`}</span>}
                    </div>
                    <div className="ind-figs">
                      <div><span className="eyebrow">Pencapaian</span><b className="v">{nilai(d.pencapaian, satuanTampil)}</b></div>
                      {d.saldo_awal ? <div><span className="eyebrow">Saldo awal</span><b className="v faint">{nilai(d.saldo_awal, satuanTampil)}</b></div> : null}
                      <div><span className="eyebrow">Skor</span><b className="v">{angka(d.skor_kpi)}</b></div>
                    </div>
                    <Ladder v={band.v} t3={d.target_kpi3} t4={d.target_kpi4} t5={d.target_kpi5} satuan={band.satuan} ringkas />
                  </article>
                );
              })}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
