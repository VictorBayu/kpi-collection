import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia } from "@/lib/kpi";
import {
  radarIndikator, jabatanBerdata, ringkasNasional, perArea,
  rincianInsentif, komposisiJabatan, trenPeriode, sebaranSkor,
  ujungCabang, biayaVsSkor,
} from "@/lib/analitik";
import { angka, rp, toISODate } from "@/lib/format";
import PilihPeriode from "@/components/PilihPeriode";
import AnalitikClient from "./AnalitikClient";

export const metadata = { title: "Dashboard Analitik" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: { searchParams: Promise<{ periode?: string }> }) {
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
            <p className="muted">
              Grafik dibentuk dari data KPI yang sudah terhitung. Tarik data API
              atau unggah berkas Excel dulu.
            </p>
            <p className="mt"><Link className="btn" href="/admin/data-api">Ke Data API</Link></p>
          </div>
        </main>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const aktif = daftar.find((p) => toISODate(p.periode) === sp.periode) ?? daftar[0];
  const periode = toISODate(aktif.periode);

  // Dijalankan berbarengan; tidak ada yang bergantung hasil yang lain, dan
  // berurutan berarti pembaca menunggu penjumlahan lima kali lebih lama.
  const [komposisi, radar, jabatan, ringkas, area,
         rincian, tren, sebaran, ujung, biaya] = await Promise.all([
    komposisiJabatan(periode),
    radarIndikator(periode),
    jabatanBerdata(periode),
    ringkasNasional(periode),
    perArea(periode),
    rincianInsentif(periode),
    trenPeriode(12),
    sebaranSkor(periode),
    ujungCabang(periode),
    biayaVsSkor(periode),
  ]);

  // Radar per jabatan disiapkan di server sekaligus, bukan diambil ulang
  // tiap kali penyaring diganti: jumlah jabatan sedikit, dan menunggu
  // perjalanan ke server tiap ganti pilihan membuat penelusuran terasa
  // berat justru saat pembaca sedang membandingkan.
  const radarPerJabatan: Record<string, Awaited<ReturnType<typeof radarIndikator>>> = {};
  await Promise.all(jabatan.map(async (j) => {
    radarPerJabatan[j.jabatan] = await radarIndikator(periode, j.jabatan);
  }));

  const persen = (n: number) =>
    ringkas.karyawan ? Math.round((n / ringkas.karyawan) * 100) : 0;

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead">
          <div>
            <h2>Dashboard Analitik</h2>
            <p>
              Pola menyeluruh dari data KPI — untuk melihat apa yang tidak
              terlihat saat memeriksa cabang satu per satu.
            </p>
          </div>
          <PilihPeriode daftar={daftar.map((p) => toISODate(p.periode))} aktif={periode} />
        </div>

        <div className="kartu-angka mb">
          <div className="angka-kotak">
            <span>Karyawan dinilai</span>
            <b>{ringkas.karyawan.toLocaleString("id-ID")}</b>
          </div>
          <div className="angka-kotak">
            <span>Skor rata-rata</span>
            <b className={ringkas.skorRata === null ? "" :
                          ringkas.skorRata >= 4 ? "baik" : ringkas.skorRata < 3 ? "buruk" : ""}>
              {ringkas.skorRata === null ? "—" : angka(ringkas.skorRata)}
            </b>
          </div>
          <div className="angka-kotak">
            <span>KPI 4 ke atas</span>
            <b className="baik">{ringkas.jumlahKpi4}</b>
            <i>{persen(ringkas.jumlahKpi4)}% dari total</i>
          </div>
          <div className="angka-kotak">
            <span>Di bawah KPI 3</span>
            <b className="buruk">{ringkas.jumlahBawah}</b>
            <i>{persen(ringkas.jumlahBawah)}% dari total</i>
          </div>
          <div className="angka-kotak">
            <span>Total insentif</span>
            <b>{rp(ringkas.insentif)}</b>
            <i>{rincian.penerima} penerima</i>
          </div>
        </div>

        {/* Rincian insentif: total saja menyembunyikan hal yang justru paling
            perlu diawasi — apakah angka besar itu datang dari pencapaian
            pokok, dari bonus tambahan, atau sudah dipotong penalti besar. */}
        <section className="card mb">
          <div className="cardhead">
            <h3 style={{ fontSize: 15 }}>Rincian insentif</h3>
            <p className="muted small">
              Reguler adalah pencapaian pokok; reward menambah, penalty
              mengurangi. Ketiganya diatur aturan berbeda, jadi pantas
              diawasi terpisah.
            </p>
          </div>
          <div className="card-pad">
            <div className="rincian-baris">
              <div className="rincian-pos">
                <span>Insentif reguler</span>
                <b>{rp(rincian.dasar)}</b>
              </div>
              <div className="rincian-tanda">+</div>
              <div className="rincian-pos naik">
                <span>Reward</span>
                <b>{rp(rincian.reward)}</b>
              </div>
              <div className="rincian-tanda">−</div>
              <div className="rincian-pos turun">
                <span>Penalty</span>
                <b>{rp(rincian.penalty)}</b>
              </div>
              <div className="rincian-tanda">=</div>
              <div className="rincian-pos total">
                <span>Dibayarkan</span>
                <b>{rp(rincian.total)}</b>
              </div>
            </div>

            {rincian.tanpaRincian > 0 && (
              <p className="faint small mt">
                {rp(rincian.tanpaRincian)} berasal dari baris lama yang belum
                punya rincian reguler/reward/penalty — masuk total, tapi tidak
                bisa dipecah. Angka ini akan hilang sendiri setelah periode
                bersangkutan dihitung ulang dari API.
              </p>
            )}
          </div>
        </section>

        <AnalitikClient komposisi={komposisi} radar={radar}
                        radarPerJabatan={radarPerJabatan}
                        jabatan={jabatan} area={area} tren={tren}
                        sebaran={sebaran} ujung={ujung} biaya={biaya} />
      </main>
    </AppShell>
  );
}
