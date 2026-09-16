import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusHarianBar from "@/components/StatusHarian";
import { readSession } from "@/lib/auth";
import { statusHarian, cabangHarian, karyawanHarian } from "@/lib/harian";
import { rp, angka } from "@/lib/format";
import Ikon from "@/components/Ikon";
import JudulHalaman, { TitikStatus } from "@/components/JudulHalaman";
import CariCabang from "../kpi/CariCabang";

export const metadata = { title: "KPI & Insentif Harian — Admin" };
export const dynamic = "force-dynamic";

/**
 * KPI & insentif harian untuk admin.
 *
 * Tata letaknya sengaja dibuat sama persis dengan Data KPI (area → cabang →
 * karyawan): admin sudah hafal cara membacanya, dan halaman baru yang
 * bentuknya berbeda hanya memaksa mempelajari ulang hal yang sama. Yang
 * membedakan cuma sumbernya — di sini murni baris hasil hitung dari API
 * bulan berjalan — dan bingkainya sebagai angka yang masih bergerak.
 */
export default async function AdminHarian({
  searchParams,
}: { searchParams: Promise<{ cabang?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/harian");

  const [status, cabang] = await Promise.all([statusHarian(), cabangHarian()]);

  if (!cabang.length) {
    return (
      <AppShell>
        <main className="shell">
          <JudulHalaman
            eyebrow="Data berjalan"
            judul="KPI & Insentif Harian"
            deskripsi="Progres berjalan bulan ini, dihitung langsung dari data API."
          />
          <StatusHarianBar s={status} />
          <div className="sd-kosong mt">
            <Ikon nama="calendar" ukuran={28} />
            <b>Belum ada hasil hitung</b>
            <span className="muted">
              Belum ada indikator yang terhitung untuk bulan berjalan. Pastikan data API sudah
              ditarik, dan indikator sudah didaftarkan ke jabatan · produk yang bersangkutan.
            </span>
            <span className="hr-kosong-aksi">
              <Link className="btn" href="/admin/data-api">Ke Data API</Link>
              <Link className="btn ghost" href="/admin/indikator">Ke Create Indicator</Link>
            </span>
          </div>
        </main>
      </AppShell>
    );
  }

  const sp = await searchParams;

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

  const cabangDipilih = sp.cabang || (perArea[0]?.cabang[0]?.cabang ?? "");
  const karyawan = cabangDipilih ? await karyawanHarian(cabangDipilih) : [];

  const nadaSkor = (v: number | null) => v === null ? "" : v >= 4 ? "hi" : v < 3 ? "lo" : "mid";
  const labelSkor = (v: number) => v >= 4 ? "KPI 4 ke atas" : v >= 3 ? "KPI 3" : "di bawah KPI 3";
  const inisial = (nama: string) => {
    const k = nama.trim().split(/\s+/).filter(Boolean);
    return ((k[0]?.[0] ?? "") + (k.length > 1 ? k[k.length - 1][0] : k[0]?.[1] ?? "")).toUpperCase();
  };
  const infoCabang = cabang.find((c) => c.cabang === cabangDipilih);
  const bawah = karyawan.filter((k) => k.skor < 3);
  const tertahan = karyawan.filter((k) => k.sebab).length;
  const totalProyeksi = karyawan.reduce((n, k) => n + k.insentif, 0);
  // Indikator terlemah yang paling sering muncul di cabang ini — petunjuk
  // cepat ke mana pembinaan cabang sebaiknya diarahkan.
  const lemahUmum = Object.entries(
    bawah.reduce<Record<string, number>>((m, k) => {
      if (k.terlemah) m[k.terlemah] = (m[k.terlemah] ?? 0) + 1;
      return m;
    }, {}),
  ).sort((a, b) => b[1] - a[1])[0];

  return (
    <AppShell>
      <main className="shell">
        <JudulHalaman
          eyebrow="Data berjalan"
          nada="tegas"
          meta={<><TitikStatus nada="good" /> Dihitung dari data API bulan ini</>}
          judul="KPI & Insentif Harian"
          deskripsi="Progres berjalan bulan ini. Pilih cabang untuk melihat posisi tiap karyawan dan proyeksi insentifnya."
          aksi={
            <Link className="btn ghost" href="/admin/data-api">
              <Ikon nama="refresh" ukuran={16} /> Tarik data di Data API
            </Link>
          }
        />

        <StatusHarianBar s={status} />

        <div className="split-kpi dk2 hr-split">
          <aside className="card cabang-list" id="daftar-cabang-harian">
            <div className="cabang-kepala">
              <div className="cabang-kepala-atas">
                <span className="cabang-hitung"><Ikon nama="building" ukuran={17} /> {perArea.length} area · {cabang.length} cabang</span>
                <span className="cabang-lbl">Skor rata²</span>
              </div>
              <CariCabang targetId="daftar-cabang-harian" />
            </div>
            <div className="cabang-scroll">
              {perArea.map((a) => {
                const berskor = a.cabang.filter((c) => c.skorRata !== null);
                const rataArea = berskor.reduce((x, c) => x + (c.skorRata ?? 0), 0)
                  / Math.max(1, berskor.length);
                const kurang = a.cabang.filter((c) => (c.skorRata ?? 9) < 3).length;
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
                            href={`/admin/harian?cabang=${encodeURIComponent(c.cabang)}`}
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
            </div>
          </aside>

          <div className="hr-kanan">
            {karyawan.length > 0 && bawah.length === karyawan.length && (
              <div className="hr-tindak">
                <span className="km-ikon warn"><Ikon nama="alert" ukuran={20} /></span>
                <div>
                  <b>Tindak lanjut cabang {cabangDipilih}</b>
                  <p>
                    Seluruh {karyawan.length} karyawan masih di bawah KPI 3
                    {lemahUmum && <> — indikator terlemah paling umum <strong>{lemahUmum[0]}</strong> ({lemahUmum[1]} orang)</>}.
                    Angka ini masih bisa berubah sampai bulan ditutup.
                  </p>
                </div>
              </div>
            )}

            <section className="card kc-detail">
              <div className="kc-kepala">
                <span className="kc-monogram" aria-hidden><Ikon nama="users" ukuran={22} /></span>
                <div className="kc-kepala-teks">
                  <div className="kc-kepala-atas">
                    <h2>{cabangDipilih || "Pilih cabang"}</h2>
                    <span className="chip k4">Posisi berjalan</span>
                  </div>
                  <p className="muted small">
                    <b>{karyawan.length} karyawan</b>
                    {infoCabang && <> · {infoCabang.area}</>}
                    {bawah.length > 0 && <> · <span className="teks-bad">{bawah.length} di bawah KPI 3</span></>}
                    {tertahan > 0 && <> · {tertahan} insentif tertahan syarat</>}
                  </p>
                </div>
                <div className="kc-skor-cabang">
                  <span>Proyeksi insentif</span>
                  <b className="num hr-proyeksi">{rp(totalProyeksi)}</b>
                </div>
              </div>
              <div className="tabel-scroll">
                <table className="kc-tabel hr-tabel">
                  <thead>
                    <tr>
                      <th>Nama &amp; NIK</th><th>Indikator terlemah</th>
                      <th style={{ width: 180 }}>Skor berjalan</th>
                      <th className="r" style={{ width: 250 }}>Proyeksi insentif &amp; catatan syarat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {karyawan.map((k) => (
                      <tr key={k.nik}>
                        <td>
                          <div className="kc-orang">
                            <span className="kc-avatar" aria-hidden>{inisial(k.nama)}</span>
                            <div>
                              <Link href={`/admin/harian/${k.nik}`} className="kc-nama">{k.nama}</Link>
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
                        <td className="r hr-ins">
                          <b className={"num" + (k.insentif ? "" : " faint")}>{rp(k.insentif)}</b>
                          {/* Sebab tertahan ditampilkan di daftar, bukan hanya di
                              detail: yang dicari admin justru siapa yang tertahan
                              dan kenapa, dan membuka satu per satu untuk tahu itu
                              membuat daftarnya nyaris tak berguna. */}
                          {k.sebab && (
                            <ul className="hr-sebab" title={k.sebab}>
                              {k.sebab.split(/;\s*/).filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!karyawan.length && (
                      <tr><td colSpan={4} className="empty">
                        Pilih cabang di kiri untuk melihat karyawannya.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {karyawan.length > 0 && (
                <div className="an-kaki">
                  <span>Menampilkan <b>{karyawan.length}</b> karyawan pada cabang <b>{cabangDipilih}</b>, diurutkan dari skor terendah.</span>
                  <span className="an-kaki-lbl">Belum final</span>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
