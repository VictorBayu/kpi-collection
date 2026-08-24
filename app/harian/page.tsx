import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusHarianBar from "@/components/StatusHarian";
import RincianHarian from "@/components/RincianHarian";
import { readSession } from "@/lib/auth";
import { statusHarian, progresNik, ringkasHarian, timHarian } from "@/lib/harian";
import { rp, angka } from "@/lib/format";

export const metadata = { title: "Progres Harian" };
export const dynamic = "force-dynamic";

/**
 * Progres harian milik pengguna sendiri, plus timnya bila ia atasan.
 *
 * Karyawan yang tidak punya indikator sendiri (BM, ACH, AM) tetap masuk ke
 * sini dan langsung melihat timnya, bukan halaman kosong yang membuat
 * mereka mengira fiturnya rusak.
 */
export default async function HarianSaya() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran === "admin") redirect("/admin/harian");

  const [status, baris, ringkas, tim] = await Promise.all([
    statusHarian(),
    progresNik(s.nik),
    ringkasHarian(s.nik),
    s.peran === "atasan" ? timHarian(s.nik) : Promise.resolve([]),
  ]);

  const punyaSendiri = baris.length > 0;

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>Progres Harian</h2>
            <p>
              Posisi berjalan bulan ini dari data API — bukan angka final.
              Halaman KPI biasa tetap menampilkan hasil yang sudah ditutup.
            </p>
          </div>
        </div>

        <StatusHarianBar s={status} />
        <div className="mt" />

        {punyaSendiri && <RincianHarian ringkas={ringkas} baris={baris} />}

        {tim.length > 0 && (
          <section className="card mb">
            <div className="cardhead">
              <h3 style={{ fontSize: 14 }}>Tim saya</h3>
              <p className="muted small">
                Diurutkan dari skor terendah — yang paling perlu dibantu di atas.
              </p>
            </div>
            <table className="dk-tabel">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Indikator terlemah</th>
                  <th className="r">Skor berjalan</th>
                  <th className="r">Proyeksi insentif</th>
                </tr>
              </thead>
              <tbody>
                {tim.map((a) => {
                  const lv = a.skor === null ? null
                    : a.skor >= 4 ? 4 : a.skor >= 3 ? 3 : 0;
                  return (
                    <tr key={a.nik} className={lv === 0 ? "kurang" : ""}>
                      <td>
                        <div className="dk-nama">{a.nama}</div>
                        <div className="dk-produk">
                          {a.nik} · {a.jabatan ?? "—"}
                          {a.cabang ? ` · ${a.cabang}` : ""}
                        </div>
                      </td>
                      <td className={a.terlemah ? "" : "faint"}>{a.terlemah ?? "—"}</td>
                      <td className="r">
                        <b className={"dk-skor" + (lv === 0 ? " bahaya" : lv === 4 ? " baik" : "")}>
                          {a.skor === null ? "—" : angka(a.skor)}
                        </b>
                      </td>
                      <td className="r num">{rp(a.insentif)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {!punyaSendiri && !tim.length && (
          <div className="card card-pad narrow">
            <h3>Belum ada progres</h3>
            <p className="muted">
              Belum ada indikator yang terhitung untuk Anda bulan ini. Bisa
              karena data API belum ditarik, atau jabatan · produk Anda belum
              didaftarkan ke indikator mana pun.
            </p>
            <p className="mt">
              <Link className="btn ghost" href="/dashboard">Ke Dasbor saya</Link>
            </p>
          </div>
        )}
      </main>
    </AppShell>
  );
}
