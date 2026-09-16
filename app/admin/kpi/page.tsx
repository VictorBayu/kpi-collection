import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia, cabangPeriode, karyawanCabang } from "@/lib/kpi";
import { rp, angka, namaPeriode, toISODate } from "@/lib/format";
import PilihPeriode from "@/components/PilihPeriode";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";
import CariCabang from "./CariCabang";

export const metadata = { title: "Data KPI — Admin" };

export default async function AdminKpi({
  searchParams,
}: { searchParams: Promise<{ periode?: string; cabang?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  const daftar = await periodeTersedia();
  if (!daftar.length) {
    return (
      <AppShell>
        <main className="shell">
          <div className="card card-pad narrow mt">
            <h2>Belum ada data KPI</h2>
            <p className="muted">Unggah dan terbitkan berkas Excel dulu lewat menu Unggah data.</p>
            <p className="mt"><Link className="btn" href="/admin/import">Ke Unggah data</Link></p>
          </div>
        </main>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const aktif = daftar.find((p) => toISODate(p.periode) === sp.periode) ?? daftar[0];
  const periode = toISODate(aktif.periode);

  /**
   * Daftar cabang dan daftar karyawan diminta BERSAMAAN, bukan berurutan.
   *
   * Keduanya hanya bergantung pada periode, jadi tidak ada alasan yang
   * kedua menunggu yang pertama selesai. Lewat driver serverless tiap
   * kueri menanggung satu perjalanan jaringan sendiri, sehingga menunggu
   * berurutan menambah waktu tunggu tanpa menambah apa pun.
   *
   * Cabang yang dibuka ditentukan sebelum kueri dijalankan: kalau alamat
   * tidak menyebut cabang, yang dipakai adalah cabang pertama menurut
   * urutan yang sama dengan daftar di layar.
   */
  const cabangAwal = sp.cabang || null;
  const [cabang, karyawanAwal] = await Promise.all([
    cabangPeriode(periode),
    cabangAwal ? karyawanCabang(periode, cabangAwal) : Promise.resolve(null),
  ]);

  /**
   * Kelompokkan per area, cabang berurut abjad di dalam tiap area.
   * "(TANPA AREA)" sengaja ditaruh paling bawah supaya tidak mengganggu
   * pembacaan, tapi tetap terlihat agar bisa ditindaklanjuti admin.
   */
  const perArea = Array.from(
    cabang.reduce((peta, c) => {
      const arr = peta.get(c.area) ?? [];
      arr.push(c);
      peta.set(c.area, arr);
      return peta;
    }, new Map<string, typeof cabang>()),
  )
    .map(([area, isi]) => ({
      area,
      cabang: isi.slice().sort((a, b) => a.cabang.localeCompare(b.cabang, "id")),
    }))
    .sort((a, b) =>
      (a.area === "(TANPA AREA)" ? 1 : 0) - (b.area === "(TANPA AREA)" ? 1 : 0) ||
      a.area.localeCompare(b.area, "id"));

  const cabangDipilih = cabangAwal || (perArea[0]?.cabang[0]?.cabang ?? "");
  const karyawan = karyawanAwal
    ?? (cabangDipilih ? await karyawanCabang(periode, cabangDipilih) : []);

  /** Ringkasan untuk pita metrik di atas daftar. */
  const berskorSemua = cabang.filter((c) => c.skorRata !== null);
  const totalKaryawan = berskorSemua.reduce((n, c) => n + c.karyawan, 0);
  const rataNasional = totalKaryawan
    ? berskorSemua.reduce((n, c) => n + (c.skorRata ?? 0) * c.karyawan, 0) / totalKaryawan
    : null;
  const terendah = berskorSemua.slice().sort((a, b) => (a.skorRata ?? 0) - (b.skorRata ?? 0))[0];
  const insentifCabang = karyawan.reduce((n, k) => n + (Number(k.insentif) || 0), 0);
  const karyawanDiBawah = karyawan.filter((k) => k.skor < 3).length;
  const infoCabang = cabang.find((c) => c.cabang === cabangDipilih);

  const nadaSkor = (v: number | null) => v === null ? "" : v >= 4 ? "hi" : v < 3 ? "lo" : "mid";
  const labelSkor = (v: number) => v >= 4 ? "KPI 4 ke atas" : v >= 3 ? "KPI 3" : "di bawah KPI 3";
  const inisial = (nama: string) => {
    const k = nama.trim().split(/\s+/).filter(Boolean);
    return ((k[0]?.[0] ?? "") + (k.length > 1 ? k[k.length - 1][0] : k[0]?.[1] ?? "")).toUpperCase();
  };
  const singkatan = (nama: string) => {
    const k = nama.replace(/[()]/g, "").trim().split(/\s+/).filter(Boolean);
    return (k.length > 1 ? k[0][0] + (k[1].match(/\d+/)?.[0] ?? k[1][0]) : (k[0] ?? "?").slice(0, 2)).toUpperCase();
  };

  return (
    <AppShell>
      <main className="shell">
        <JudulHalaman
          eyebrow="Enterprise performance"
          nada="tegas"
          meta={<><TitikStatus nada="bad" /> Diurutkan dari skor terendah</>}
          judul="Data KPI seluruh cabang"
          deskripsi="Pilih cabang untuk melihat pencapaian tiap karyawan. Karyawan dengan skor terendah tampil paling atas."
          aksi={
            /* Cabang yang sedang dibuka ikut dibawa: berpindah bulan tidak
               melempar admin kembali ke cabang pertama. */
            <PilihPeriode daftar={daftar.map((p) => toISODate(p.periode))} aktif={periode}
                          simpan={{ cabang: sp.cabang }} />
          }
        />

        <div className="km-grid">
          <KartuMetrik label="Cakupan wilayah"
                       nilai={<>{perArea.length}<small> area</small> · {cabang.length}</>} satuan="cabang"
                       catatan={`${totalKaryawan.toLocaleString("id-ID")} karyawan berskor`}
                       ikon={<Ikon nama="network" ukuran={20} />} nada="accent" />
          <KartuMetrik label="Rata-rata skor nasional"
                       nilai={rataNasional === null ? "—" : angka(rataNasional)}
                       lencana={rataNasional === null ? undefined
                         : rataNasional >= 3 ? { teks: "Di atas KPI 3", nada: "good" }
                         : { teks: "Di bawah KPI 3", nada: "bad" }}
                       catatan="Rata-rata tertimbang jumlah karyawan"
                       ikon={<Ikon nama={rataNasional !== null && rataNasional < 3 ? "trendDown" : "chart"} ukuran={20} />}
                       nada={rataNasional !== null && rataNasional < 3 ? "bad" : "good"} />
          <KartuMetrik label="Cabang skor terendah"
                       nilai={terendah ? <span className="km-teks">{terendah.cabang}</span> : "—"}
                       lencana={terendah?.skorRata != null ? { teks: angka(terendah.skorRata), nada: terendah.skorRata < 3 ? "bad" : "netral" } : undefined}
                       catatan={terendah ? terendah.area : "Belum ada skor"}
                       ikon={<Ikon nama="alert" ukuran={20} />} nada="warn" />
          <KartuMetrik label="Insentif cabang terpilih"
                       nilai={rp(insentifCabang)}
                       catatan={cabangDipilih ? `${cabangDipilih} · ${karyawan.length} karyawan` : "Pilih cabang"}
                       ikon={<Ikon nama="wallet" ukuran={20} />} />
        </div>

        <div className="split-kpi dk2">
          {/* daftar cabang */}
          <aside className="card cabang-list" id="daftar-cabang">
            <div className="cabang-kepala">
              <div className="cabang-kepala-atas">
                <span className="cabang-hitung"><Ikon nama="building" ukuran={17} /> {perArea.length} area · {cabang.length} cabang</span>
                <span className="cabang-lbl">Skor rata²</span>
              </div>
              <CariCabang targetId="daftar-cabang" />
            </div>
            <div className="cabang-scroll">
              {/* Dikelompokkan per area, cabang berurut abjad di dalamnya.
                  Dengan 65 cabang, daftar datar membuat admin harus mengingat
                  cabang mana milik area mana. */}
              {perArea.map((a) => {
                const berskor = a.cabang.filter((c) => c.skorRata !== null);
                const rataArea = berskor.reduce((s, c) => s + (c.skorRata ?? 0), 0)
                  / Math.max(1, berskor.length);
                const kurang = a.cabang.filter((c) => (c.skorRata ?? 9) < 3).length;
                // Hanya area yang memuat cabang terpilih yang terbuka. Dengan
                // 65 cabang, membuka semuanya berarti menggulir jauh hanya
                // untuk sampai ke area yang dituju.
                const memuatPilihan = a.cabang.some((c) => c.cabang === cabangDipilih);
                return (
                  <details className="area-grup" key={a.area} open={memuatPilihan} data-area={a.area}>
                    <summary className="area-judul">
                      <span className="area-nama">{a.area}</span>
                      <span className="area-info">
                        <span className="faint">{a.cabang.length} cabang</span>
                        {kurang > 0 && <span className="area-kurang" title={`${kurang} cabang di bawah KPI 3`}>{kurang}</span>}
                        <span className={"skorpill kecil " + nadaSkor(berskor.length ? rataArea : null)}>
                          {berskor.length ? angka(rataArea) : "—"}
                        </span>
                      </span>
                    </summary>
                    {a.cabang.map((c) => (
                      <Link key={c.cabang} data-cari={c.cabang}
                            href={`/admin/kpi?periode=${periode}&cabang=${encodeURIComponent(c.cabang)}`}
                            aria-current={c.cabang === cabangDipilih ? "page" : undefined}
                            className={"cabang-item" + (c.cabang === cabangDipilih ? " on" : "")}>
                        <div>
                          <b>{c.cabang}</b>
                          <div className="faint">{c.karyawan} karyawan</div>
                        </div>
                        <span className={"skorpill " + nadaSkor(c.skorRata)}>
                          {c.skorRata === null ? "—" : angka(c.skorRata)}
                        </span>
                      </Link>
                    ))}
                  </details>
                );
              })}
              <p className="empty" data-cari-kosong hidden>Tidak ada cabang yang cocok.</p>
              {!cabang.length && <p className="empty">Tidak ada data cabang di periode ini.</p>}
            </div>
          </aside>

          {/* karyawan di cabang terpilih */}
          <section className="card kc-detail">
            <div className="kc-kepala">
              <span className="kc-monogram" aria-hidden>{cabangDipilih ? singkatan(cabangDipilih) : "–"}</span>
              <div className="kc-kepala-teks">
                <div className="kc-kepala-atas">
                  <h2>{cabangDipilih || "Pilih cabang"}</h2>
                  {infoCabang?.skorRata != null && infoCabang.skorRata < 3 && (
                    <span className="chip k0">Prioritas evaluasi</span>
                  )}
                  {infoCabang?.skorRata != null && infoCabang.skorRata >= 4 && (
                    <span className="chip k5">Kinerja baik</span>
                  )}
                </div>
                <p className="muted small">
                  <b>{karyawan.length} karyawan</b> · Periode {namaPeriode(periode)}
                  {infoCabang && <> · {infoCabang.area}</>}
                  {karyawanDiBawah > 0 && <> · <span className="teks-bad">{karyawanDiBawah} di bawah KPI 3</span></>}
                </p>
              </div>
              {infoCabang?.skorRata != null && (
                <div className="kc-skor-cabang">
                  <span>Skor rata²</span>
                  <b className={"num " + nadaSkor(infoCabang.skorRata)}>{angka(infoCabang.skorRata)}</b>
                </div>
              )}
            </div>
            <div className="tabel-scroll">
              <table className="kc-tabel">
                <thead>
                  <tr>
                    <th>Nama &amp; NIK / Jabatan</th><th>Indikator terlemah</th>
                    <th style={{ width: 220 }}>Skor KPI &amp; status</th><th className="r">Insentif</th>
                    <th style={{ width: 36 }} aria-label="Buka rincian" />
                  </tr>
                </thead>
                <tbody>
                  {karyawan.map((k) => {
                    const href = `/admin/kpi/${k.nik}?periode=${periode}`;
                    return (
                      <tr key={k.nik}>
                        <td>
                          <div className="kc-orang">
                            <span className="kc-avatar" aria-hidden>{inisial(k.nama)}</span>
                            <div>
                              <Link href={href} className="kc-nama">{k.nama}</Link>
                              {k.tanpaAkun && (
                                <span className="tag-warn" title="NIK ini ada di data KPI tapi belum punya akun login">
                                  tanpa akun
                                </span>
                              )}
                              <div className="faint num small">{k.nik} · {k.jabatan ?? "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td>{k.terlemah ? <span className="kc-ind">{k.terlemah}</span> : <span className="faint">—</span>}</td>
                        <td>
                          <div className="kc-skor">
                            <b className={"num " + nadaSkor(k.skor)}>{angka(k.skor)}</b>
                            <span>{labelSkor(k.skor)}</span>
                          </div>
                          <div className="rankbar">
                            <i className={k.skor >= 4 ? "high" : k.skor < 3 ? "low" : ""}
                               style={{ width: `${Math.min(100, (k.skor / 5) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="r num"><b>{rp(k.insentif)}</b></td>
                        <td className="r">
                          <Link href={href} className="kc-panah" aria-label={`Rincian ${k.nama}`}>
                            <Ikon nama="chevronRight" ukuran={18} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!karyawan.length && (
                    <tr><td colSpan={5} className="empty">Pilih cabang di kiri untuk melihat karyawannya.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
