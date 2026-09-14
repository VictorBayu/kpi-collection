import type { StatusHarian } from "@/lib/harian";

/**
 * Kepala halaman harian: kapan datanya ditarik, dan peringatan bahwa
 * angkanya belum final.
 *
 * Peringatan itu bukan basa-basi. Angka di halaman ini dihitung ulang tiap
 * tarikan dan bisa berubah sampai bulan ditutup; tanpa keterangan yang
 * jelas, orang akan menganggapnya sudah pasti dan kecewa saat angka
 * akhirnya berbeda.
 */

const WAKTU = new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
});
const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
});

/** "3 jam lalu" — lebih cepat dicerna daripada jam absolut. */
function berapaLalu(d: Date): string {
  const menit = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.round(jam / 24);
  return `${hari} hari lalu`;
}

export default function StatusHarianBar({ s }: { s: StatusHarian }) {
  // Lebih dari 26 jam berarti tarikan hari ini kemungkinan gagal atau
  // belum jalan — layak ditandai, karena angka lama yang tampak segar
  // jauh lebih menyesatkan daripada halaman kosong.
  const basi = s.ditarik ? Date.now() - s.ditarik.getTime() > 26 * 3600 * 1000 : true;

  return (
    <div className={"harian-status" + (basi ? " basi" : "")}>
      <div className="harian-status-utama">
        <span className="harian-titik" aria-hidden />
        <div>
          <b>
            {s.ditarik
              ? `Data per ${berapaLalu(s.ditarik)}`
              : "Belum ada tarikan data"}
          </b>
          <span className="faint small">
            {s.ditarik ? WAKTU.format(s.ditarik) + " WIB" : "Jalankan tarikan di menu Data API"}
            {s.tglData && ` · posisi ${TANGGAL.format(s.tglData)}`}
          </span>
        </div>
      </div>

      <div className="harian-status-angka">
        <span><b>{s.karyawan.toLocaleString("id-ID")}</b> karyawan</span>
        <span><b>{s.indikator.toLocaleString("id-ID")}</b> indikator</span>
        <span><b>{s.barisMentah.toLocaleString("id-ID")}</b> baris data</span>
      </div>

      <p className="harian-status-catatan">
        Angka berjalan bulan ini, dihitung ulang tiap tarikan — belum final
        sampai bulan ditutup.
      </p>
    </div>
  );
}
