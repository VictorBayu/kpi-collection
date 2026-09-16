import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { periodeTersedia } from "@/lib/kpi";
import {
  radarIndikator, jabatanBerdata, ringkasNasional, perArea,
  rincianInsentif, komposisiJabatan, trenPeriode, sebaranSkor,
  ujungCabang, biayaVsSkor, semuaCabang,
} from "@/lib/analitik";
import { angka, rp, toISODate } from "@/lib/format";
import PilihPeriode from "@/components/PilihPeriode";
import AnalitikClient from "./AnalitikClient";
import TombolCetak from "./TombolCetak";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik } from "@/components/JudulHalaman";
import { namaPeriode } from "@/lib/format";

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
         rincian, tren, sebaran, ujung, biaya, cabangSemua] = await Promise.all([
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
    semuaCabang(periode),
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

  // Prioritas pemulihan: cabang dengan data cukup (≥ 3 orang), skor
  // terendah dulu — aturan yang sama dengan halaman /admin/analitik/cabang,
  // supaya lima baris ringkas di sini tidak berbeda urutan dari daftar
  // lengkapnya.
  const prioritas = cabangSemua.filter((c) => !c.tipis).slice(0, 5);
  const jumlahAreaCakupan = new Set(cabangSemua.map((c) => c.area)).size;

  return (
    <AppShell>
      <main className="shell">
        <JudulHalaman
          eyebrow="Modul eksekutif · analisis mendalam"
          nada="tegas"
          meta={<span className="an-meta">
            <span>{aktif === daftar[0] ? "Periode terbaru" : "Periode lampau"}</span>
            <span className="an-meta-chip"><Ikon nama="building" ukuran={13} /> Cakupan: {cabangSemua.length} cabang · {jumlahAreaCakupan} area</span>
          </span>}
          judul="Dashboard Analitik"
          deskripsi="Pola menyeluruh dari data KPI — mendeteksi deviasi dan disparitas kinerja sebelum berdampak pada cabang."
          aksi={<div className="an-aksi-kepala">
            <PilihPeriode daftar={daftar.map((p) => toISODate(p.periode))} aktif={periode} />
            <TombolCetak />
          </div>}
        />

        <div className="km-grid lima">
          <KartuMetrik label="Karyawan dinilai" nilai={ringkas.karyawan.toLocaleString("id-ID")} satuan="orang"
                       catatan={`Periode ${namaPeriode(periode)}`}
                       ikon={<Ikon nama="users" ukuran={20} />} nada="accent"
                       progres={{ persen: 100, nada: "accent" }} />
          <KartuMetrik label="Skor rata-rata"
                       nilai={ringkas.skorRata === null ? "—" : angka(ringkas.skorRata)}
                       lencana={ringkas.skorRata === null ? undefined
                         : ringkas.skorRata >= 3 ? { teks: "≥ KPI 3", nada: "good" } : { teks: "< KPI 3", nada: "bad" }}
                       catatan="Rata-rata nasional"
                       ikon={<Ikon nama={ringkas.skorRata !== null && ringkas.skorRata < 3 ? "trendDown" : "chart"} ukuran={20} />}
                       nada={ringkas.skorRata !== null && ringkas.skorRata < 3 ? "bad" : "good"}
                       progres={{ persen: ((ringkas.skorRata ?? 0) / 5) * 100,
                                  nada: ringkas.skorRata !== null && ringkas.skorRata < 3 ? "bad" : "good" }} />
          <KartuMetrik label="KPI 4 ke atas" nilai={ringkas.jumlahKpi4.toLocaleString("id-ID")} satuan="orang"
                       catatan={`${persen(ringkas.jumlahKpi4)}% dari total`}
                       ikon={<Ikon nama="checkCircle" ukuran={20} />} nada="good"
                       progres={{ persen: persen(ringkas.jumlahKpi4), nada: "good" }} />
          <KartuMetrik label="Di bawah KPI 3" nilai={ringkas.jumlahBawah.toLocaleString("id-ID")} satuan="orang"
                       catatan={`${persen(ringkas.jumlahBawah)}% dari total`}
                       ikon={<Ikon nama="alert" ukuran={20} />} nada="bad"
                       progres={{ persen: persen(ringkas.jumlahBawah), nada: "bad" }} />
          <KartuMetrik label="Total insentif" nilai={rp(ringkas.insentif)}
                       catatan={`${rincian.penerima.toLocaleString("id-ID")} penerima`}
                       ikon={<Ikon nama="wallet" ukuran={20} />}
                       progres={{ persen: ringkas.karyawan ? (rincian.penerima / ringkas.karyawan) * 100 : 0, nada: "netral" }} />
        </div>

        {/* Rincian insentif: total saja menyembunyikan hal yang justru paling
            perlu diawasi — apakah angka besar itu datang dari pencapaian
            pokok, dari bonus tambahan, atau sudah dipotong penalti besar. */}
        <section className="card an-kartu mb">
          <div className="an-kepala">
            <div className="an-kepala-teks">
              <h3><Ikon nama="wallet" ukuran={17} />Rincian insentif</h3>
              <p>
                Reguler adalah pencapaian pokok; reward menambah, penalty mengurangi.
                Ketiganya diatur aturan berbeda, jadi pantas diawasi terpisah.
              </p>
            </div>
          </div>
          <div className="an-rincian">
            <div className="an-pos">
              <span><Ikon nama="wallet" ukuran={15} />Insentif reguler</span>
              <b className="num">{rp(rincian.dasar)}</b>
              <small>Pencapaian pokok</small>
            </div>
            <span className="an-tanda" aria-hidden>+</span>
            <div className="an-pos naik">
              <span><Ikon nama="target" ukuran={15} />Reward</span>
              <b className="num">{rp(rincian.reward)}</b>
              <small>Bonus</small>
            </div>
            <span className="an-tanda" aria-hidden>−</span>
            <div className="an-pos turun">
              <span><Ikon nama="alert" ukuran={15} />Penalty</span>
              <b className="num">{rp(rincian.penalty)}</b>
              <small>Potongan</small>
            </div>
            <span className="an-tanda" aria-hidden>=</span>
            <div className="an-pos total">
              <span><Ikon nama="checkCircle" ukuran={15} />Dibayarkan</span>
              <b className="num">{rp(rincian.total)}</b>
              <small>{rincian.penerima.toLocaleString("id-ID")} penerima · net</small>
            </div>
          </div>
          {rincian.tanpaRincian > 0 && (
            <div className="an-kaki">
              <span>
                {rp(rincian.tanpaRincian)} berasal dari baris lama yang belum punya rincian
                reguler/reward/penalty — masuk total, tapi tidak bisa dipecah. Angka ini akan
                hilang sendiri setelah periode bersangkutan dihitung ulang dari API.
              </span>
            </div>
          )}
        </section>

        <AnalitikClient komposisi={komposisi} radar={radar}
                        radarPerJabatan={radarPerJabatan}
                        jabatan={jabatan} area={area} tren={tren}
                        sebaran={sebaran} ujung={ujung} biaya={biaya} periode={periode}
                        prioritas={prioritas} jumlahCabangSemua={cabangSemua.length}
                        ringkas={{ karyawan: ringkas.karyawan, bawah: ringkas.jumlahBawah,
                                   persenBawah: persen(ringkas.jumlahBawah) }} />
      </main>
    </AppShell>
  );
}
