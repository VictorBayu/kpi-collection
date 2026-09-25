import { redirect } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia, timSaya, indikatorBanyakNik } from "@/lib/kpi";
import Link from "next/link";
import Ladder, { tingkat } from "@/components/Ladder";
import KontrolDetail from "./KontrolDetail";
import PetaCabang from "./PetaCabang";
import TombolCetak from "@/components/TombolCetak";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik } from "@/components/JudulHalaman";
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
  const aktif = daftar.find((p) => toISODate(p.periode) === pilih) ?? daftar[0];
  const periode = toISODate(aktif.periode);

  return (
    <AppShell>
      <Suspense fallback={<RangkaTim />}>
        <IsiTim nik={s.nik} periode={periode} tampilan={tampilan} />
      </Suspense>
    </AppShell>
  );
}

/**
 * Bagian yang menunggu database. Dipisah agar kerangka halaman terkirim
 * lebih dulu — tampilan "detail semua indikator" bisa memuat ratusan baris
 * dan tanpa ini layar tetap kosong sampai semuanya siap.
 */
async function IsiTim({
  nik, periode, tampilan,
}: { nik: string; periode: string; tampilan?: string }) {
  const { lingkup, seArea, anggota } = await timSaya(nik, periode);

  /**
   * Bawaan tampilan mengikuti luas wilayah yang dipegang. AM/ACH membawahi
   * banyak cabang, jadi daftar datar tidak berguna bagi mereka; yang hanya
   * satu cabang tetap langsung melihat daftar orangnya.
   */
  const mode = tampilan === "detail" ? "detail"
    : tampilan === "orang" ? "orang"
    : tampilan === "cabang" ? "cabang"
    : seArea ? "cabang" : "orang";
  const detail = mode === "detail";
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
      <main className="shell">
        <JudulHalaman
          eyebrow="Tim saya"
          nada="tegas"
          meta={<>{lingkup}</>}
          judul="Tim saya"
          deskripsi={`${anggota.length} orang, periode ${namaPeriode(periode)}. Diurutkan dari skor terendah supaya yang butuh bantuan terlihat lebih dulu.`}
        />

        <div className="km-grid tiga">
          <KartuMetrik label="Anggota tim" nilai={anggota.length} satuan="orang"
                       catatan={lingkup}
                       ikon={<Ikon nama="users" ukuran={20} />} nada="accent" />
          <KartuMetrik label="Skor rata-rata"
                       nilai={angka(rata)}
                       lencana={anggota.length ? (rata >= 3 ? { teks: "≥ KPI 3", nada: "good" } : { teks: "< KPI 3", nada: "bad" }) : undefined}
                       catatan={`Rata-rata ${lingkup.toLowerCase()}`}
                       ikon={<Ikon nama={rata < 3 ? "trendDown" : "chart"} ukuran={20} />}
                       nada={rata < 3 ? "bad" : "good"}
                       progres={{ persen: (rata / 5) * 100, nada: rata < 3 ? "bad" : "good" }} />
          <KartuMetrik label="Di bawah KPI 3" nilai={dibawah} satuan="orang"
                       catatan={dibawah === 0 ? "Semua sudah di atas KPI 3" : "perlu perhatian bulan ini"}
                       ikon={<Ikon nama="alert" ukuran={20} />} nada={dibawah ? "bad" : "good"} />
        </div>

        <section className="card card-pad mt">
          <span className="eyebrow">Sebaran skor tim</span>
          <div className="distro">
            {ember.map((n, i) => (
              <div key={i} style={{ height: `${(n / maks) * 100}%` }}><span>{n}</span></div>
            ))}
          </div>
          <div className="distro-x">
            <span>&lt;3</span><span>3,0–3,5</span><span>3,5–4,0</span><span>4,0–4,5</span><span>&gt;4,5</span>
          </div>
        </section>

        <div className="viewswitch mt tanpa-cetak">
          <span className="faint">Tampilan:</span>
          {seArea && (
            <Link href={`/tim?periode=${periode}&tampilan=cabang`}
                  className={"vbtn" + (mode === "cabang" ? " on" : "")}>Per cabang</Link>
          )}
          <Link href={`/tim?periode=${periode}&tampilan=orang`}
                className={"vbtn" + (mode === "orang" ? " on" : "")}>Semua orang</Link>
          <Link href={`/tim?periode=${periode}&tampilan=detail`}
                className={"vbtn" + (mode === "detail" ? " on" : "")}>Detail semua indikator</Link>
          {detail && <KontrolDetail />}
          <TombolCetak />
        </div>

        {/* Tiga tampilan: peta cabang untuk AM/ACH, daftar orang untuk
            atasan cabang, dan detail per indikator bila perlu menelusuri.
            Mode detail keluar dari tabel karena kolom "Rincian" terlalu
            sempit untuk menampung puluhan indikator. */}
        {mode === "cabang" ? (
          <PetaCabang anggota={anggota} periode={periode} />
        ) : !detail ? (
        <section className="card mt">
          <table>
            <thead>
              <tr>
                <th>Nama</th><th>Indikator terlemah</th>
                <th style={{ width: 220 }}>Skor KPI</th><th className="r">Insentif</th>
              </tr>
            </thead>
            <tbody>
              {anggota.map((a) => (
                <tr key={a.nik}>
                  <td><b>{a.nama}</b><div className="faint num">{a.nik} · {a.jabatan ?? "—"}</div></td>
                  <td className={a.terlemah ? "" : "faint"}>{a.terlemah ?? "—"}</td>
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
        ) : (
        <section className="timdetail mt">
          {anggota.map((a) => {
            const ind = petaInd.get(a.nik) ?? [];
            // Dihitung dari skor tersimpan, bukan dari tiga ambang: sejak
            // target boleh berupa pita nilai, keduanya tidak lagi sama.
            const lemah = ind.filter(
              (d: any) => d.skor_kpi !== null && d.skor_kpi < 3).length;
            return (
              <details className="orang" key={a.nik} open={a.skor < 3}>
                <summary className="orang-head">
                  <span className="orang-id">
                    <b>{a.nama}</b>
                    <span className="faint num">{a.nik} · {a.jabatan ?? "—"}</span>
                  </span>
                  <span className="orang-angka">
                    <span className={"orang-skor" + (a.skor < 3 ? " lo" : a.skor >= 4 ? " hi" : "")}>
                      {angka(a.skor)}
                    </span>
                    <span className="faint">{rp(a.insentif)}</span>
                    {lemah > 0 && <span className="orang-lemah">{lemah} di bawah KPI 3</span>}
                    <span className="orang-jml faint">{ind.length} indikator</span>
                  </span>
                </summary>

                <div className="indgrid">
                  {ind.map((d: any, i: number) => {
                    const satuanTampil = tebakSatuan(d.indikator, d.pencapaian);
                    const band = nilaiBanding(d.pencapaian, d.rasio, d.target_kpi3);
                    const lv = d.skor_kpi === null ? null
                      : d.skor_kpi >= 5 ? 5 : d.skor_kpi >= 4 ? 4
                      : d.skor_kpi >= 3 ? 3 : 0;
                    return (
                      <div className={"indcell" + (lv === 0 ? " kurang" : "")} key={i}>
                        <div className="indcell-head">
                          <span className="indcell-nama" title={d.indikator}>
                            {d.indikator}
                            {d.produk ? <em> · {d.produk}</em> : null}
                          </span>
                          {lv !== null && (
                            <span className={`dot k${lv}`} title={lv === 0 ? "Di bawah KPI 3" : `KPI ${lv}`}>
                              {lv === 0 ? "!" : lv}
                            </span>
                          )}
                        </div>
                        <div className="indcell-figs">
                          <b>{nilai(d.pencapaian, satuanTampil)}</b>
                          <span className="faint">skor {angka(d.skor_kpi)}</span>
                        </div>
                        <div className="indcell-bar">
                          <Ladder v={band.v} t3={d.target_kpi3} t4={d.target_kpi4}
                                  t5={d.target_kpi5} satuan={band.satuan} ringkas />
                        </div>
                      </div>
                    );
                  })}
                  {!ind.length && <span className="faint">Tidak ada indikator.</span>}
                </div>
              </details>
            );
          })}
          {!anggota.length && (
            <div className="card card-pad empty">
              Belum ada anggota tim dengan data di periode ini.
            </div>
          )}
        </section>
        )}
      </main>
  );
}

/** Kerangka yang tampil selama data tim masih diambil. */
function RangkaTim() {
  return (
    <main className="shell">
      <div className="sk-head">
        <div className="sk sk-title" />
        <div className="sk sk-sub" />
      </div>
      <section className="hero">
        <div className="card card-pad"><div className="sk sk-title" /><div className="sk sk-sub" /></div>
        <div className="card card-pad"><div className="sk sk-title" /><div className="sk sk-sub" /></div>
      </section>
      <div className="sk-cards">
        {Array.from({ length: 3 }).map((_, i) => <div className="sk sk-card" key={i} />)}
      </div>
    </main>
  );
}
