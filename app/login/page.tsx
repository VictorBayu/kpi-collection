import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { q } from "@/lib/db";
import LoginForm from "./LoginForm";
import { namaPeriode, waktu } from "@/lib/format";

export const metadata = { title: "Masuk — KPI Collection" };

export default async function LoginPage() {
  const s = await readSession();
  if (s) redirect(s.peran === "admin" ? "/admin/import" : "/dashboard");

  const [info] = await q<any>(
    `SELECT b.periode, b.diterbitkan_pada,
            (SELECT COUNT(*)::int FROM app_user WHERE aktif) AS karyawan
       FROM import_batch b
      WHERE b.tipe='kpi' AND b.status='published'
      ORDER BY b.periode DESC LIMIT 1`);

  return (
    <div className="loginwrap">
      <aside className="loginside">
        <span className="glow" />
        <div className="z">
          <span className="mark big">KC</span>
          <h1>Lihat skor dan insentif Anda bulan ini.</h1>
          <p>
            Data KPI diterbitkan tim data setiap awal bulan. Kalau ada angka yang tidak sesuai
            catatan Anda, ajukan koreksi langsung dari aplikasi.
          </p>
        </div>
        {info && (
          <div className="statline">
            <div><b>{info.karyawan}</b><span>karyawan aktif</span></div>
            <div><b>{namaPeriode(info.periode)}</b><span>periode terbit</span></div>
            <div><b>{waktu(info.diterbitkan_pada)}</b><span>pembaruan terakhir</span></div>
          </div>
        )}
      </aside>

      <main className="loginform">
        <div className="inner">
          <h2>Masuk</h2>
          <p className="muted mb">Gunakan NIK dan password kepegawaian Anda.</p>
          <LoginForm />
          <hr />
          <p className="faint">
            Sesi berlaku 8 jam. Tim data tidak pernah meminta password Anda lewat WhatsApp
            atau telepon.
          </p>
        </div>
      </main>
    </div>
  );
}
