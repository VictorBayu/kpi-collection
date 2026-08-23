import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import LoginForm from "./LoginForm";
import IkonTarget from "@/components/IkonTarget";

export const metadata = { title: "Masuk — KPI Collection" };

/**
 * Halaman ini sengaja tidak menyentuh database sama sekali.
 * Tanpa kueri, HTML bisa dikirim langsung — TTFB turun drastis
 * dibanding versi lama yang menunggu statistik terbit lebih dulu.
 */
export default async function LoginPage() {
  const s = await readSession();
  if (s) redirect(s.peran === "admin" ? "/admin/analitik" : "/dashboard");

  return (
    <div className="loginwrap">
      <aside className="loginside">
        <span className="glow" />
        <div className="z">
          <span className="mark big"><IkonTarget ukuran={23} /></span>
          <h1>Lihat skor dan insentif Anda bulan ini.</h1>
          <p>
            Data KPI diterbitkan tim data setiap awal bulan. Kalau ada angka yang tidak sesuai
            catatan Anda, ajukan koreksi langsung dari aplikasi.
          </p>
        </div>
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
