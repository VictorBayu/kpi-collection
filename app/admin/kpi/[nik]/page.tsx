import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { tingkat } from "@/components/Ladder";
import TombolCetak from "@/components/TombolCetak";
import { readSession } from "@/lib/auth";
import { menuSesi } from "@/lib/menu";
import { periodeTersedia, indikatorNik, insentifKaryawan, ringkasan, trenKpi } from "@/lib/kpi";
import Ikon from "@/components/Ikon";
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
  if (s.peran !== "admin" && !menuSesi(s.peran, s.menu).includes("admin_kpi")) redirect("/dashboard");

  const { nik } = await params;
  const daftar = await periodeTersedia();
  const sp = await searchParams;
  const aktif = daftar.find((p) => toISODate(p.periode) === sp.periode) ?? daftar[0];
  const periode = aktif ? toISODate(aktif.periode) : "";

  // Jabatan diambil dari snapshot periode (baris KPI bulan itu) lebih dulu,
  // supaya periode lama menampilkan jabatan yang berlaku saat itu meski
  // orangnya sudah pindah jabatan. Jabatan terkini pengguna hanya jadi
  // cadangan bila baris periode itu tak menyimpannya.
  const [orang] = await q<any>(
    `SELECT u.nama, u.cabang, u.area,
            COALESCE(
              (SELECT jabatan FROM v_kpi_aktif
                WHERE nik = $1 AND periode = $2 AND jabatan IS NOT NULL
                LIMIT 1),
              u.jabatan) AS jabatan
       FROM app_user u WHERE u.nik = $1`, [nik, periode]);
  const [ind, ins, ring, tren] = await Promise.all([
    indikatorNik(nik, periode),
    insentifKaryawan(nik, periode),
    ringkasan(nik, periode),
    trenKpi(nik),
  ]);

  const totalIns = ins.reduce((a, b) => a + b.nominal, 0);
  const lv = tingkat(ring.skor, 3, 4, 5);
  const naikSkor = ring.skorLalu !== null ? ring.skor - ring.skorLalu : null;

  // Indikator diolah sekali, lalu diurutkan: yang bermasalah lebih dulu.
  //
  // Tingkatnya dibaca dari skor yang SUDAH dihitung mesin, bukan dihitung
  // ulang di sini dari tiga ambang. Sejak target boleh berupa pita nilai,
  // menghitung ulang memberi jawaban berbeda dari skor yang tersimpan —
  // itulah sebabnya sempat ada baris berskor 5,00 tapi diwarnai merah.
  const olah = ind.map((d) => {
    const satuanTampil = tebakSatuan(d.indikator, d.pencapaian);
    const band = nilaiBanding(d.pencapaian, d.rasio, d.target_kpi3);
    const s = d.skor_kpi === null || d.skor_kpi === undefined ? null : Number(d.skor_kpi);
    const tk = s === null ? null : s >= 5 ? 5 : s >= 4 ? 4 : s >= 3 ? 3 : 0;
    return { d, satuanTampil, band, tk, skor: s };
  }).sort((a, b) => (a.skor ?? 99) - (b.skor ?? 99));

  const kurang = olah.filter((x) => x.tk === 0).length;
  const insBerpengaruh = ins.filter((r) => r.nominal !== 0);
  const gerbangGagal = olah.filter((x) => x.d.peran === "nominal" && x.d.gerbang_gagal).length;
  const hrefCabang = `/admin/kpi?periode=${periode}&cabang=${encodeURIComponent(orang?.cabang ?? "")}`;
  const nadaSkor = lv === 0 ? "bad" : lv >= 4 ? "good" : "mid";
  const skorMaks = Math.max(5, ...tren.map((t) => t.skor));

  return (
    <AppShell>
      <main className="shell">
        <header className="rk-kepala">
          <div className="rk-id">
            <div className="rk-atas">
              <Link className="rk-balik" href={hrefCabang}>
                <Ikon nama="chevronRight" ukuran={15} className="rk-balik-ikon" />
                Cabang {orang?.cabang ?? "—"}
              </Link>
              <span className="jh-titik" aria-hidden>•</span>
              <span className="jh-meta">Periode {namaPeriode(periode)}</span>
            </div>
            <h1 className="rk-nama">{orang?.nama ?? nik}</h1>
            <div className="rk-meta">
              <span className="rk-nik num">NIK {nik}</span>
              <span><Ikon nama="badge" ukuran={15} /> Jabatan: <b>{orang?.jabatan ?? "—"}</b></span>
              <span><Ikon nama="building" ukuran={15} /> Wilayah: <b>{orang?.cabang ?? "—"}{orang?.area ? ` (${orang.area})` : ""}</b></span>
              <span><Ikon nama="calendar" ukuran={15} /> Periode: <b>{namaPeriode(periode)}</b></span>
            </div>
          </div>

          {ind.length > 0 && (
            <div className="rk-ringkas">
              <div className="rk-m">
                <span className="rk-m-lbl">
                  Skor KPI
                  {naikSkor !== null && naikSkor !== 0 && (
                    <em className={naikSkor > 0 ? "naik" : "turun"}>
                      {naikSkor > 0 ? "▲" : "▼"} {angka(Math.abs(naikSkor))}
                    </em>
                  )}
                </span>
                <b className={"num " + nadaSkor}>{angka(ring.skor)}<small>/ 5,00</small></b>
                <span className="rk-m-bar"><i className={nadaSkor} style={{ width: `${Math.min(100, (ring.skor / 5) * 100)}%` }} /></span>
              </div>
              <div className="rk-m">
                <span className="rk-m-lbl">Total insentif</span>
                <b className="num">{rpSingkat(totalIns)}</b>
                <span className={"km-lencana " + (totalIns > 0 ? "good" : totalIns < 0 ? "bad" : "netral")}>
                  {totalIns > 0 ? "Cair" : totalIns < 0 ? "Potongan" : "Nihil"}
                </span>
              </div>
              <div className="rk-m">
                <span className="rk-m-lbl">Di bawah KPI 3</span>
                <b className={"num " + (kurang ? "bad" : "good")}>{kurang}<small>/ {olah.length}</small></b>
                <span className={"km-lencana " + (kurang ? "warn" : "good")}>{kurang ? "Perlu coaching" : "Aman"}</span>
              </div>
              <div className="rk-aksi">
                <TombolCetak />
                <Link className="btn tint sm" href={`/admin/harian/${nik}`}>
                  <Ikon nama="calendar" ukuran={15} /> KPI harian
                </Link>
              </div>
            </div>
          )}
        </header>

        {!ind.length ? (
          <div className="sd-kosong">
            <Ikon nama="table" ukuran={28} />
            <b>Tidak ada data</b>
            <span className="muted">Karyawan ini tidak punya baris KPI di periode {namaPeriode(periode)}.</span>
          </div>
        ) : (
          <>
            {(kurang > 0 || gerbangGagal > 0) && (
              <div className="alert-box info rk-banner">
                <span className="alert-ikon" aria-hidden>i</span>
                <span>
                  <b>Evaluasi performa {orang?.jabatan ?? "karyawan"}</b> — skor {angka(ring.skor)}.
                  {kurang > 0 && <> {kurang} indikator di bawah KPI 3.</>}
                  {gerbangGagal > 0 && <> {gerbangGagal} indikator nominal tidak cair karena syaratnya gagal.</>}
                </span>
              </div>
            )}

            <div className="rk-isi">
              <div className="rk-kiri">
                {/* Indikator — tabel padat, satu baris satu indikator supaya
                    angkanya sejajar dan mudah dibandingkan. */}
                <section className="card rk-kartu">
                  <div className="rk-kartu-kepala">
                    <span className="km-ikon accent"><Ikon nama="chart" ukuran={20} /></span>
                    <div>
                      <h2>Rincian indikator evaluasi</h2>
                      <p className="muted small">{olah.length} indikator · yang bermasalah di atas</p>
                    </div>
                    {kurang > 0 && <span className="chip k0">{kurang} di bawah target</span>}
                  </div>
                  <div className="tabel-scroll">
                    <table className="rk-tabel">
                      <thead>
                        <tr>
                          <th>Indikator</th>
                          <th className="r">Pencapaian</th>
                          <th className="r">Saldo awal</th>
                          <th className="r">Skor</th>
                          <th style={{ width: 170 }}>Posisi target (1–5)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {olah.map(({ d, satuanTampil, tk, skor }, i) => {
                          // Bilah digambar pada skala skor 1–5 — skala yang sama
                          // dengan angka di kolom sebelahnya. Tanda di 50% dan
                          // 75% adalah ambang KPI 3 dan KPI 4.
                          const persen = skor === null ? 0
                            : Math.max(2, Math.min(100, ((skor - 1) / 4) * 100));
                          const nada = skor === null ? "kosong" : tk === 0 ? "bad" : tk !== null && tk >= 4 ? "good" : "mid";
                          return (
                            <tr key={i} className={"rk-baris " + nada}>
                              <td>
                                <div className="rk-ind">
                                  <span>{d.indikator}</span>
                                  {tk === 0 && <span className="rk-tag bad">Kritis</span>}
                                  {tk === 5 && <span className="rk-tag good">Optimal</span>}
                                </div>
                                {d.produk && <div className="rk-produk">{d.produk}</div>}
                                {/* Nominal nol tanpa penjelasan adalah keluhan yang
                                    pasti datang; sebabnya sudah tersimpan sejak
                                    angkanya dihitung, jadi tinggal ditampilkan. */}
                                {d.peran === "nominal" && (
                                  d.gerbang_gagal
                                    ? <div className="rk-gerbang gagal" title={d.gerbang_gagal}>
                                        <b>Tidak cair — syarat gagal</b>
                                        <span>{d.gerbang_gagal}</span>
                                      </div>
                                    : d.nominal_baris
                                    ? <div className="rk-gerbang lolos">
                                        <b>Semua syarat lolos</b> <span className="num">{rp(d.nominal_baris)}</span>
                                      </div>
                                    : null
                                )}
                              </td>
                              <td className="r num rk-nilai">{nilai(d.pencapaian, satuanTampil)}</td>
                              <td className="r num faint">
                                {d.saldo_awal ? nilai(d.saldo_awal, satuanTampil) : "—"}
                              </td>
                              <td className="r">
                                <b className={"num rk-skor " + nada}>{skor === null ? "—" : angka(skor)}</b>
                              </td>
                              <td>
                                <div className="rk-meter"
                                     title={skor === null ? "Skor belum terhitung"
                                            : tk === 0 ? `Skor ${angka(skor)} — di bawah KPI 3`
                                            : `Skor ${angka(skor)} — setara KPI ${tk}`}>
                                  {skor !== null && <i className={nada} style={{ width: `${persen}%` }} />}
                                  <em style={{ left: "50%" }} />
                                  <em style={{ left: "75%" }} />
                                </div>
                                <div className="rk-meter-x">
                                  <span style={{ left: 0, transform: "none" }}>1</span>
                                  <span style={{ left: "50%" }}>3</span>
                                  <span style={{ left: "75%" }}>4</span>
                                  <span style={{ left: "100%", transform: "translateX(-100%)" }}>5</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {tren.length > 1 && (
                  <section className="card rk-kartu">
                    <div className="rk-kartu-kepala">
                      <span className="km-ikon accent"><Ikon nama="chart" ukuran={20} /></span>
                      <div>
                        <h2>Riwayat tren skor</h2>
                        <p className="muted small">{tren.length} periode terakhir · {orang?.nama ?? nik}</p>
                      </div>
                    </div>
                    <div className="rk-tren">
                      {tren.map((t) => {
                        const iso = toISODate(t.periode);
                        const ini = iso === periode;
                        return (
                          <div className={"rk-tren-kol" + (ini ? " ini" : "")} key={iso}>
                            <span className="num">{angka(t.skor)}</span>
                            <div className="rk-tren-bar">
                              <i className={t.skor < 3 ? "bad" : t.skor >= 4 ? "good" : "mid"}
                                 style={{ height: `${Math.max(4, (t.skor / skorMaks) * 100)}%` }} />
                            </div>
                            <small>{namaPeriode(iso)}</small>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              {/* Insentif — kolom samping, bukan di bawah, supaya tidak
                  menambah panjang halaman. */}
              <aside className="rk-kanan">
                <section className="card rk-kartu">
                  <div className="rk-kartu-kepala">
                    <span className="km-ikon good"><Ikon nama="wallet" ukuran={20} /></span>
                    <div>
                      <h2>Kalkulasi insentif</h2>
                      <p className="muted small">{insBerpengaruh.length} dari {ins.length} kategori berpengaruh</p>
                    </div>
                  </div>
                  <div className="rk-total">
                    <span>Total penerimaan periode ini</span>
                    <b className={"num" + (totalIns < 0 ? " bad" : "")}>{rp(totalIns)}</b>
                    {totalIns === 0 && (
                      <p className="muted small">Tidak ada kategori yang menghasilkan insentif pada periode ini.</p>
                    )}
                  </div>
                  <ul className="rk-ins">
                    {insBerpengaruh.map((r) => (
                      <li key={r.kategori}>
                        <span className="rk-ins-nama" title={r.kategori}>{r.kategori}</span>
                        <span className={"num rk-ins-rp" + (r.nominal < 0 ? " neg" : "")}>{rp(r.nominal)}</span>
                      </li>
                    ))}
                  </ul>

                  {ins.length > insBerpengaruh.length && (
                    <details className="rk-nol">
                      <summary>
                        <Ikon nama="chevronRight" ukuran={14} className="rk-nol-panah" />
                        {ins.length - insBerpengaruh.length} kategori bernilai nol
                      </summary>
                      <ul className="rk-ins">
                        {ins.filter((r) => r.nominal === 0).map((r) => (
                          <li key={r.kategori}>
                            <span className="rk-ins-nama faint" title={r.kategori}>{r.kategori}</span>
                            <span className="faint num">
                              {r.rasio !== null ? Math.round(r.rasio * 100) + "%" : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>

                <section className="card rk-kartu rk-tautan">
                  <span className="km-label">Aksi terkait karyawan</span>
                  <Link href={`/admin/harian/${nik}`}>
                    <Ikon nama="calendar" ukuran={17} /> Buka progres KPI harian
                    <Ikon nama="chevronRight" ukuran={16} className="rk-tautan-panah" />
                  </Link>
                  <Link href={hrefCabang}>
                    <Ikon nama="users" ukuran={17} /> Bandingkan dengan tim {orang?.cabang ?? "cabang"}
                    <Ikon nama="chevronRight" ukuran={16} className="rk-tautan-panah" />
                  </Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
