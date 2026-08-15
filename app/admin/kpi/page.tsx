import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia, cabangPeriode, karyawanCabang } from "@/lib/kpi";
import { rp, angka, namaPeriode, toISODate } from "@/lib/format";

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

  const cabang = await cabangPeriode(periode);
  const cabangDipilih = sp.cabang || (cabang[0]?.cabang ?? "");
  const karyawan = cabangDipilih ? await karyawanCabang(periode, cabangDipilih) : [];

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>Data KPI seluruh cabang</h2>
            <p>Pilih cabang untuk melihat pencapaian tiap karyawan. Diurutkan dari skor terendah.</p>
          </div>
          <form>
            <label className="faint" htmlFor="periode">Periode</label>{" "}
            <select id="periode" name="periode" defaultValue={periode} className="select">
              {daftar.map((p) => (
                <option key={String(p.periode)} value={toISODate(p.periode)}>
                  {namaPeriode(p.periode)}
                </option>
              ))}
            </select>{" "}
            <button className="btn sm ghost">Lihat</button>
          </form>
        </div>

        <div className="split-kpi">
          {/* daftar cabang */}
          <aside className="card cabang-list">
            <div className="cardhead"><h3 style={{ fontSize: "14px" }}>Cabang ({cabang.length})</h3></div>
            <div className="cabang-scroll">
              {cabang.map((c) => (
                <Link key={c.cabang}
                      href={`/admin/kpi?periode=${periode}&cabang=${encodeURIComponent(c.cabang)}`}
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
              {!cabang.length && <p className="empty">Tidak ada data cabang di periode ini.</p>}
            </div>
          </aside>

          {/* karyawan di cabang terpilih */}
          <section className="card">
            <div className="cardhead">
              <h3 style={{ fontSize: "15px" }}>{cabangDipilih || "Pilih cabang"}</h3>
              <p className="muted">{karyawan.length} karyawan · periode {namaPeriode(periode)}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Nama</th><th>Indikator terlemah</th>
                  <th style={{ width: 200 }}>Skor KPI</th><th className="r">Insentif</th>
                </tr>
              </thead>
              <tbody>
                {karyawan.map((k) => (
                  <tr key={k.nik}>
                    <td>
                      <Link href={`/admin/kpi/${k.nik}?periode=${periode}`} className="lnk">
                        <b>{k.nama}</b>
                      </Link>
                      {k.tanpaAkun && (
                        <span className="tag-warn" title="NIK ini ada di data KPI tapi belum punya akun login">
                          tanpa akun
                        </span>
                      )}
                      <div className="faint num">{k.nik} · {k.jabatan ?? "—"}</div>
                    </td>
                    <td className={k.terlemah ? "" : "faint"}>{k.terlemah ?? "—"}</td>
                    <td>
                      <div className="rowbetween small">
                        <span className="num"><b>{angka(k.skor)}</b></span>
                        <span className="faint">{k.skor >= 4 ? "KPI 4" : k.skor >= 3 ? "KPI 3" : "di bawah KPI 3"}</span>
                      </div>
                      <div className="rankbar">
                        <i className={k.skor >= 4 ? "high" : k.skor < 3 ? "low" : ""}
                           style={{ width: `${Math.min(100, (k.skor / 5) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="r num">{rp(k.insentif)}</td>
                  </tr>
                ))}
                {!karyawan.length && (
                  <tr><td colSpan={4} className="empty">Pilih cabang di kiri untuk melihat karyawannya.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
