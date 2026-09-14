import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusHarianBar from "@/components/StatusHarian";
import { readSession } from "@/lib/auth";
import { statusHarian, cabangHarian, karyawanHarian } from "@/lib/harian";
import { rp, angka } from "@/lib/format";

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
          <div className="sectionhead">
            <div>
              <h2>KPI &amp; Insentif Harian</h2>
              <p>Progres berjalan bulan ini, dihitung langsung dari data API.</p>
            </div>
          </div>
          <StatusHarianBar s={status} />
          <div className="card card-pad narrow mt">
            <h3>Belum ada hasil hitung</h3>
            <p className="muted">
              Belum ada indikator yang terhitung untuk bulan berjalan. Pastikan
              data API sudah ditarik, dan indikator sudah didaftarkan ke
              jabatan · produk yang bersangkutan.
            </p>
            <p className="mt">
              <Link className="btn" href="/admin/data-api">Ke Data API</Link>{" "}
              <Link className="btn ghost" href="/admin/indikator">Ke Create Indicator</Link>
            </p>
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

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>KPI &amp; Insentif Harian</h2>
            <p>
              Progres berjalan bulan ini, dihitung langsung dari data API.
              Pilih cabang untuk melihat posisi tiap karyawan.
            </p>
          </div>
        </div>

        <StatusHarianBar s={status} />

        <div className="split-kpi mt">
          <aside className="card cabang-list">
            <div className="cardhead">
              <h3 style={{ fontSize: "14px" }}>
                {perArea.length} area · {cabang.length} cabang
              </h3>
            </div>
            <div className="cabang-scroll">
              {perArea.map((a) => {
                const berskor = a.cabang.filter((c) => c.skorRata !== null);
                const rataArea = berskor.reduce((x, c) => x + (c.skorRata ?? 0), 0)
                  / Math.max(1, berskor.length);
                const kurang = a.cabang.filter((c) => (c.skorRata ?? 9) < 3).length;
                const memuatPilihan = a.cabang.some((c) => c.cabang === cabangDipilih);
                return (
                  <details className="area-grup" key={a.area} open={memuatPilihan}>
                    <summary className="area-judul">
                      <span className="area-nama">{a.area}</span>
                      <span className="area-info">
                        <span className="faint">{a.cabang.length} cabang</span>
                        {kurang > 0 && <span className="area-kurang">{kurang}</span>}
                        <span className={"skorpill kecil " + (rataArea >= 4 ? "hi" : rataArea < 3 ? "lo" : "")}>
                          {angka(rataArea)}
                        </span>
                      </span>
                    </summary>
                    {a.cabang.map((c) => (
                      <Link key={c.cabang}
                            href={`/admin/harian?cabang=${encodeURIComponent(c.cabang)}`}
                            className={"cabang-item" + (c.cabang === cabangDipilih ? " on" : "")}>
                        <div>
                          <b>{c.cabang}</b>
                          <div className="faint">{c.karyawan} karyawan</div>
                        </div>
                        <span className={"skorpill " + (c.skorRata === null ? "" : c.skorRata >= 4 ? "hi" : c.skorRata < 3 ? "lo" : "")}>
                          {c.skorRata === null ? "—" : angka(c.skorRata)}
                        </span>
                      </Link>
                    ))}
                  </details>
                );
              })}
            </div>
          </aside>

          <section className="card">
            <div className="cardhead">
              <h3 style={{ fontSize: "15px" }}>{cabangDipilih || "Pilih cabang"}</h3>
              <p className="muted">{karyawan.length} karyawan · posisi berjalan</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Nama</th><th>Indikator terlemah</th>
                  <th style={{ width: 200 }}>Skor berjalan</th>
                  <th className="r">Proyeksi insentif</th>
                </tr>
              </thead>
              <tbody>
                {karyawan.map((k) => (
                  <tr key={k.nik}>
                    <td>
                      <Link href={`/admin/harian/${k.nik}`} className="lnk">
                        <b>{k.nama}</b>
                      </Link>
                      <div className="faint num">{k.nik} · {k.jabatan ?? "—"}</div>
                    </td>
                    <td className={k.terlemah ? "" : "faint"}>{k.terlemah ?? "—"}</td>
                    <td>
                      <div className="rowbetween small">
                        <span className="num"><b>{angka(k.skor)}</b></span>
                        <span className="faint">
                          {k.skor >= 4 ? "KPI 4" : k.skor >= 3 ? "KPI 3" : "di bawah KPI 3"}
                        </span>
                      </div>
                      <div className="rankbar">
                        <i className={k.skor >= 4 ? "high" : k.skor < 3 ? "low" : ""}
                           style={{ width: `${Math.min(100, (k.skor / 5) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="r">
                      <div className="num">{rp(k.insentif)}</div>
                      {/* Sebab tertahan ditampilkan di daftar, bukan hanya di
                          detail: yang dicari admin justru siapa yang tertahan
                          dan kenapa, dan membuka satu per satu untuk tahu itu
                          membuat daftarnya nyaris tak berguna. */}
                      {k.sebab && (
                        <div className="harian-sebab" title={k.sebab}>{k.sebab}</div>
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
          </section>
        </div>
      </main>
    </AppShell>
  );
}
