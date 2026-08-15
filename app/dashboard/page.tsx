import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Ladder, { kalimatJarak, tingkat } from "@/components/Ladder";
import { readSession } from "@/lib/auth";
import {
  periodeTersedia, indikatorKaryawan, insentifKaryawan, ringkasan, trenKpi,
} from "@/lib/kpi";
import {
  rp, rpSingkat, angka, nilai, namaPeriode, waktu, tebakSatuan, toISODate, nilaiBanding,
} from "@/lib/format";

export const metadata = { title: "Dasbor saya" };

/**
 * Halaman dibagi dua supaya browser tidak menunggu database sebelum
 * menggambar apa pun.
 *
 * Bagian luar hanya butuh sesi dan daftar periode (sudah di-cache), jadi
 * bilah atas dan pemilih periode langsung terkirim. Angka KPI yang perlu
 * beberapa kueri dibungkus <Suspense>, sehingga mengalir menyusul lewat
 * streaming — pengguna melihat kerangka halaman lebih dulu, bukan layar
 * kosong sampai semua kueri selesai.
 */
export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<{ periode?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");

  const daftarPeriode = await periodeTersedia();
  if (!daftarPeriode.length) return <AppShell><KosongTotal /></AppShell>;

  const { periode: pilih } = await searchParams;
  const aktif = daftarPeriode.find((p) => toISODate(p.periode) === pilih) ?? daftarPeriode[0];
  const periode = toISODate(aktif.periode);

  return (
    <AppShell>
      {/* pita konteks: dari mana angka ini datang */}
      <div className="ribbon">
        <div className="ribbon-in">
          <span className="pill">● Terbit {waktu(aktif.diterbitkan_pada)}</span>
          <span className="spacer" />
          <form>
            <label className="faint" htmlFor="periode">Periode</label>{" "}
            <select id="periode" name="periode" defaultValue={periode} className="select"
                    // form dikirim ulang saat pilihan berubah, tanpa JavaScript tambahan
                    >
              {daftarPeriode.map((p) => (
                <option key={String(p.periode)} value={toISODate(p.periode)}>
                  {namaPeriode(p.periode)}
                </option>
              ))}
            </select>{" "}
            <button className="btn sm ghost">Lihat</button>
          </form>
        </div>
      </div>

      <Suspense fallback={<RangkaDasbor />}>
        <IsiDasbor nik={s.nik} periode={periode} />
      </Suspense>
    </AppShell>
  );
}

/** Bagian yang menunggu database. Dirender terpisah agar bisa di-stream. */
async function IsiDasbor({ nik, periode }: { nik: string; periode: string }) {
  const [ind, ins, ring, tren] = await Promise.all([
    indikatorKaryawan(nik, periode),
    insentifKaryawan(nik, periode),
    ringkasan(nik, periode),
    trenKpi(nik),
  ]);

  if (!ind.length) return <KosongPeriode periode={periode} />;

  const lv = tingkat(ring.skor, 3, 4, 5);
  const totalInsentif = ins.reduce((a, b) => a + b.nominal, 0);
  const naikSkor = ring.skorLalu !== null ? ring.skor - ring.skorLalu : null;
  const naikIns = ring.insentifLalu !== null ? ring.insentif - ring.insentifLalu : null;
  const maksTren = Math.max(5, ...tren.map((t) => t.skor));

  return (
      <main className="shell">
        {/* Ringkasan: dua angka utama disatukan dalam satu kartu supaya di
            layar kecil keduanya terbaca tanpa scroll. */}
        <section className="card card-pad dash-ring">
          <div className="dash-metrik">
            <div className="metrik">
              <span className="eyebrow">Skor KPI {namaPeriode(periode)}</span>
              <div className="scorewrap">
                <b className="score">{angka(ring.skor)}</b>
                <span className="scoreof">dari 5,00</span>
                {naikSkor !== null && naikSkor !== 0 && (
                  <span className={naikSkor > 0 ? "delta up" : "delta down"}>
                    {naikSkor > 0 ? "▲" : "▼"} {angka(Math.abs(naikSkor))}
                  </span>
                )}
              </div>
              <span className={`chip k${lv} chip-lv`}>
                {lv === 0 ? "Di bawah KPI 3" : `KPI ${lv}`}
              </span>
            </div>

            <div className="metrik">
              <span className="eyebrow">Perkiraan insentif</span>
              <div className="moneyrow">
                <b className="money">{rp(totalInsentif)}</b>
                {naikIns !== null && naikIns !== 0 && (
                  <span className={naikIns > 0 ? "delta up" : "delta down"}>
                    {naikIns > 0 ? "▲" : "▼"} {rpSingkat(Math.abs(naikIns))}
                  </span>
                )}
              </div>
              <p className="muted small nomargin">
                {ring.insentifLalu !== null
                  ? <>Bulan lalu {rpSingkat(ring.insentifLalu)} · final menunggu tutup buku</>
                  : <>Final menunggu penutupan buku</>}
              </p>
            </div>
          </div>

          <Ladder v={ring.skor} t3={3} t4={4} t5={5} satuan="skor" />

          <p className="verdict">
            {kalimatJarak(ring.skor, 3, 4, 5, "unit").replace(" unit", " poin")}
          </p>

          <details className="dash-tren">
            <summary>
              <span>Tren enam periode terakhir</span>
              <span className="faint num">{angka(ring.skor)} sekarang</span>
            </summary>
            <div className="trend">
              {tren.map((t, i) => (
                <i key={String(t.periode)} className={i === tren.length - 1 ? "bar now" : "bar"}
                   style={{ height: `${(t.skor / maksTren) * 100}%` }}
                   title={`${namaPeriode(t.periode)}: ${angka(t.skor)}`} />
              ))}
            </div>
            <div className="trend-x">
              {tren.map((t) => (
                <span key={String(t.periode)}>
                  {new Date(t.periode).toLocaleDateString("id-ID", { month: "short" })}
                </span>
              ))}
            </div>
          </details>
        </section>

        {/* indikator */}
        <div className="sectionhead">
          <div>
            <h2>Rincian per indikator</h2>
            <p>Garis di bawah tiap indikator menunjukkan posisi Anda terhadap target KPI 3, 4, dan 5.</p>
          </div>
        </div>

        <section className="grid2">
          {ind.map((d, i) => {
            // Nilai untuk ANGKA yang ditampilkan (rupiah/unit apa adanya)
            const satuanTampil = tebakSatuan(d.indikator, d.pencapaian);
            // Nilai untuk DIBANDINGKAN dengan target (rasio vs rasio)
            const band = nilaiBanding(d.pencapaian, d.rasio, d.target_kpi3);
            const lv2 = band.v !== null && d.target_kpi3 !== null
              ? tingkat(band.v, d.target_kpi3, d.target_kpi4 ?? d.target_kpi3, d.target_kpi5 ?? d.target_kpi3)
              : null;
            return (
              <article className="card card-pad" key={i}>
                <div className="ind-top">
                  <div>
                    <h3>{d.indikator}</h3>
                    <p className="faint">{d.produk ?? "Semua produk"}</p>
                  </div>
                  {lv2 !== null && (
                    <span className={`chip k${lv2}`}>{lv2 === 0 ? "Di bawah KPI 3" : `KPI ${lv2}`}</span>
                  )}
                </div>

                <div className="ind-figs">
                  <div>
                    <span className="eyebrow">Pencapaian</span>
                    <b className="v">{nilai(d.pencapaian, satuanTampil)}</b>
                  </div>
                  {d.saldo_awal ? (
                    <div>
                      <span className="eyebrow">Saldo awal</span>
                      <b className="v faint">{nilai(d.saldo_awal, satuanTampil)}</b>
                    </div>
                  ) : null}
                  <div>
                    <span className="eyebrow">Skor</span>
                    <b className="v">{angka(d.skor_kpi)}</b>
                  </div>
                </div>

                <Ladder v={band.v} t3={d.target_kpi3} t4={d.target_kpi4}
                        t5={d.target_kpi5} satuan={band.satuan} ringkas />

                {band.v !== null && d.target_kpi3 !== null && d.target_kpi4 !== null && d.target_kpi5 !== null && (
                  <p className="gap-note">
                    {kalimatJarak(band.v, d.target_kpi3, d.target_kpi4, d.target_kpi5, band.satuan)}
                  </p>
                )}
                {d.catatan && <p className="faint mt">Catatan tim data: {d.catatan}</p>}
              </article>
            );
          })}
        </section>

        {/* insentif */}
        <div className="sectionhead">
          <div>
            <h2>Dari mana insentif ini datang</h2>
            <p>Setiap baris dihitung dari pencapaian yang sudah diverifikasi tim data.</p>
          </div>
        </div>

        {/* Tabel untuk layar lebar; di layar kecil dibaca sebagai daftar
            kartu supaya tidak perlu geser ke samping. */}
        <section className="card tabel-responsif">
          <table>
            <thead>
              <tr>
                <th>Kategori</th><th className="r">Saldo awal</th><th className="r">Pencapaian</th>
                <th className="r">Rasio</th><th className="r">Insentif</th>
              </tr>
            </thead>
            <tbody>
              {ins.map((r) => (
                <tr key={r.kategori}>
                  <td data-label="Kategori">
                    <b>{r.kategori}</b>{" "}
                    {r.nominal < 0
                      ? <span className="chip c-tolak">Penalty</span>
                      : r.nominal > 0
                        ? <span className="chip c-selesai">Extra</span>
                        : null}
                  </td>
                  <td className="r num faint" data-label="Saldo awal">{r.saldo_awal ? rpSingkat(r.saldo_awal) : "—"}</td>
                  <td className="r num" data-label="Pencapaian">{r.saldo_awal ? rpSingkat(r.pencapaian) : angka(r.pencapaian, 0)}</td>
                  <td className="r num" data-label="Rasio">{r.rasio !== null ? Math.round(r.rasio * 100) + "%" : "—"}</td>
                  <td className={"r num utama" + (r.nominal < 0 ? " neg" : "")} data-label="Insentif"><b>{rp(r.nominal)}</b></td>
                </tr>
              ))}
              {!ins.length && (
                <tr><td colSpan={5} className="empty">Belum ada rincian insentif untuk periode ini.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total perkiraan insentif {namaPeriode(periode)}</td>
                <td className="r num">{rp(totalInsentif)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <div className="banner info mt">
          <b>Ada angka yang menurut Anda keliru?</b>
          Ajukan koreksi lewat <Link href="/request">menu Request</Link>. Sertakan nomor kontrak
          atau nama debitur agar tim data bisa menelusuri barisnya.
        </div>
      </main>
  );
}

/** Kerangka yang tampil selama angka KPI masih diambil. */
function RangkaDasbor() {
  return (
    <main className="shell">
      <div className="card card-pad dash-ring">
        <div className="dash-metrik">
          <div className="metrik"><div className="sk sk-title" /><div className="sk sk-sub" /></div>
          <div className="metrik"><div className="sk sk-title" /><div className="sk sk-sub" /></div>
        </div>
        <div className="sk sk-bar" />
      </div>
      <div className="sk-cards">
        {Array.from({ length: 4 }).map((_, i) => <div className="sk sk-card" key={i} />)}
      </div>
    </main>
  );
}

function KosongTotal() {
  return (
    <main className="shell">
      <div className="card card-pad narrow mt">
        <h2>Belum ada data yang diterbitkan</h2>
        <p className="muted">
          Tim data belum menerbitkan periode mana pun. Coba lagi setelah pengumuman
          penutupan buku bulanan.
        </p>
      </div>
    </main>
  );
}

function KosongPeriode({ periode }: { periode: string }) {
  return (
    <main className="shell">
      <div className="card card-pad narrow mt">
        <h2>Data Anda belum ada di periode {namaPeriode(periode)}</h2>
        <p className="muted">
          Ini biasanya terjadi kalau NIK Anda belum masuk berkas yang diunggah tim data.
          Ajukan lewat menu Request dengan kategori “Data tidak muncul”.
        </p>
        <p className="mt"><Link className="btn" href="/request">Ajukan sekarang</Link></p>
      </div>
    </main>
  );
}
