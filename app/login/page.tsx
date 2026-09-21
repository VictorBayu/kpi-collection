import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import LoginForm from "./LoginForm";
import Ikon from "@/components/Ikon";

export const metadata = { title: "Masuk — KPI Collection" };

/**
 * Halaman ini sengaja tidak menyentuh database sama sekali.
 * Tanpa kueri, HTML bisa dikirim langsung — TTFB turun drastis
 * dibanding versi lama yang menunggu statistik terbit lebih dulu.
 *
 * Kartu pratinjau di panel kiri adalah ILUSTRASI tampilan dasbor, bukan
 * data siapa pun — diberi label jelas supaya tidak disangka angka nyata.
 */
export default async function LoginPage() {
  const s = await readSession();
  if (s) redirect(s.peran === "admin" ? "/admin/analitik" : "/dashboard");

  return (
    <div className="loginpage">
      <div className="loginwrap">
        <aside className="loginside">
          <span className="glow" />
          <div className="z login-atas">
            <div className="login-brand">
              <span className="mark big">KC</span>
              <span>
                <b>Smart Multi Finance</b>
                <small>KPI &amp; Insentif Collection System</small>
              </span>
            </div>
            <span className="login-aman">
              <Ikon nama="lock" ukuran={14} /> Koneksi terenkripsi
            </span>
          </div>

          <div className="z">
            <span className="login-pita">
              <i aria-hidden /> Portal KPI &amp; insentif bulanan
            </span>
            <h1>Lihat skor dan insentif Anda bulan ini.</h1>
            <p>
              Data KPI diterbitkan tim data setiap awal bulan. Pantau progres
              harian, lihat perhitungan insentif secara transparan, dan ajukan
              koreksi langsung dari aplikasi.
            </p>

            <div className="login-pratinjau" aria-hidden>
              <div className="lp-atas">
                <span className="lp-ikon">
                  <Ikon nama="wallet" ukuran={20} />
                </span>
                <span className="lp-judul">
                  <small>Estimasi insentif sementara</small>
                  <b className="num">Rp 8.450.000</b>
                </span>
                <span className="lp-tier">Contoh tampilan</span>
              </div>
              <div className="lp-baris">
                <span>Pencapaian indikator</span>
                <span>Target KPI 5</span>
              </div>
              <div className="lp-track">
                <i style={{ width: "78%" }} />
              </div>
              <div className="lp-stat">
                <span>
                  <small>Skor KPI</small>
                  <b className="num">4,20</b>
                </span>
                <span>
                  <small>Indikator</small>
                  <b className="num">6 / 7</b>
                </span>
                <span>
                  <small>Tier</small>
                  <b className="num">KPI 4</b>
                </span>
              </div>
            </div>
          </div>

          <div className="z login-kaki">
            <span>
              <Ikon nama="shield" ukuran={16} /> Akses sesuai peran
            </span>
            <span>
              <Ikon nama="gauge" ukuran={16} /> Progres harian &amp; bulanan
            </span>
          </div>
        </aside>

        <main className="loginform">
          <div className="inner">
            <span className="login-portal">
              <Ikon nama="badge" ukuran={15} /> Portal staf internal
            </span>
            <h2>Masuk ke Dasboard</h2>
            <p className="muted mb">
              Gunakan Nomor Induk Karyawan (NIK) dan password kepegawaian Anda.
            </p>
            <LoginForm />
            <div className="login-bantuan">
              Kendala akses atau koreksi data NIK?
              <b>Hubungi Tim Collection Head Office</b>
            </div>
            <p className="login-catatan">
              <span>
                <Ikon nama="shield" ukuran={14} /> Sesi aktif otomatis berlaku
                selama 8 jam.
              </span>
              <small>
                Tim Collection tidak akan pernah meminta password Anda lewat
                WhatsApp, telepon, atau email.
              </small>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
