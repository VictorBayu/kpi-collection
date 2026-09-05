import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Ladder, { kalimatJarak, tingkat } from "@/components/Ladder";
import RincianIndikator from "./RincianIndikator";
import TabelInsentif from "./TabelInsentif";
import DasborUnit from "./DasborUnit";
import { readSession } from "@/lib/auth";
import {
  periodeTersedia, indikatorKaryawan, insentifKaryawan, ringkasan, trenKpi,
  ringkasanUnit,
} from "@/lib/kpi";
import {
  rp, rpSingkat, angka, nilai, namaPeriode, waktu, tebakSatuan, toISODate, nilaiBanding,
} from "@/lib/format";

export const metadata = { title: "Dasbor saya" };

/**
 * Halaman dibagi dua supaya browser tidak menunggu database sebelum
 * menggambar apa pun.
 *
 * Bagian luar hanya butuh sesi dan daftar periode (sudah di-cache), jadi
 * bilah atas dan pemilih periode langsung terkirim. Angka KPI yang perlu
 * beberapa kueri dibungkus <Suspense>, sehingga mengalir menyusul lewat
 * streaming — pengguna melihat kerangka halaman lebih dulu, bukan layar
 * kosong sampai semua kueri selesai.
 */
export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<{ periode?: string }> }) {
  const s = await readSession();
  if (!s) redirect("/login");

  const daftarPeriode = await periodeTersedia();
  if (!daftarPeriode.length) return <AppShell><KosongTotal /></AppShell>;

  const { periode: pilih } = await searchParams;
  const aktif = daftarPeriode.find((p) => toISODate(p.periode) === pilih) ?? daftarPeriode[0];
  const periode = toISODate(aktif.periode);

  return (
    <AppShell>
      {/* pita konteks: dari mana angka ini datang */}
      <div className="ribbon">
        <div className="ribbon-in">
          <span className="pill">● Terbit {waktu(aktif.diterbitkan_pada)}</span>
          <span className="spacer" />
          <form>
            <label className="faint" htmlFor="periode">Periode</label>{" "}
            <select id="periode" name="periode" defaultValue={periode} className="select"
                    // form dikirim ulang saat pilihan berubah, tanpa JavaScript tambahan
                    >
              {daftarPeriode.map((p) => (
                <option key={String(p.periode)} value={toISODate(p.periode)}>
                  {namaPeriode(p.periode)}
                </option>
              ))}
            </select>{" "}
            <button className="btn sm ghost">Lihat</button>
          </form>
        </div>
      </div>

      <Suspense fallback={<RangkaDasbor />}>
        <IsiDasbor nik={s.nik} periode={periode} peran={s.peran} />
      </Suspense>
    </AppShell>
  );
}

/** Bagian yang menunggu database. Dirender terpisah agar bisa di-stream. */
async function IsiDasbor({
  nik, periode, peran,
}: { nik: string; periode: string; peran: string }) {
  const [ind, ins, ring, tren] = await Promise.all([
    indikatorKaryawan(nik, periode),
    insentifKaryawan(nik, periode),
    ringkasan(nik, periode),
    trenKpi(nik),
  ]);

  /**
   * BM, DBM, ACH, dan AM tidak ikut dinilai KPI bulanan, jadi halaman ini
   * akan kosong bagi mereka. Daripada menampilkan "data tidak ditemukan"
   * kepada orang yang justru paling butuh gambaran cepat, tampilkan
   * kinerja unit yang dia pimpin.
   *
   * Pemicunya bukan nama jabatan melainkan keadaan: tidak punya KPI
   * pribadi TAPI punya bawahan. Dengan begitu aturan ini tetap benar
   * kalau suatu saat ada jabatan baru dengan sifat serupa.
   */
  /**
   * Dasbor saya hanya menjawab satu pertanyaan: bagaimana KPI SAYA.
   *
   * Sebelumnya, atasan yang tidak punya indikator sendiri di sini justru
   * disuguhi ringkasan timnya — termasuk daftar "paling perlu perhatian".
   * Itu menempatkan informasi tentang orang lain di halaman yang judulnya
   * tentang diri sendiri, dan menduplikasi Dashboard Tim yang memang
   * dibuat untuk itu. Sekarang halaman ini mengarahkan ke sana alih-alih
   * menirunya.
   */
  if (!ind.length && peran !== "karyawan") {
    const unit = await ringkasanUnit(nik, periode);
    if (unit.orang > 0) {
      return (
        <main className="shell">
          <div className="card card-pad narrow mt">
            <h2>Anda belum punya indikator sendiri</h2>
            <p className="muted">
              Jabatan Anda tidak dinilai lewat indikator pribadi pada periode{" "}
              {namaPeriode(periode)}. Pencapaian yang Anda pimpin ada di dasbor tim.
            </p>
            <p className="mt" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="btn" href="/tim/dashboard">Ke Dashboard Tim</Link>
              <Link className="btn ghost" href="/tim">Tim saya</Link>
            </p>
          </div>
        </main>
      );
    }
  }

  if (!ind.length) return <KosongPeriode periode={periode} />;

  const lv = tingkat(ring.skor, 3, 4, 5);
  const totalInsentif = ins.reduce((a, b) => a + b.nominal, 0);
  const naikSkor = ring.skorLalu !== null ? ring.skor - ring.skorLalu : null;
  const naikIns = ring.insentifLalu !== null ? ring.insentif - ring.insentifLalu : null;
  const maksTren = Math.max(5, ...tren.map((t) => t.skor));

  return (
      <main className="shell">
        {/* Ringkasan: dua angka utama disatukan dalam satu kartu supaya di
            layar kecil keduanya terbaca tanpa scroll. */}
        <section className="card card-pad dash-ring">
          <div className="dash-metrik">
            <div className="metrik">
              <span className="eyebrow">Skor KPI {namaPeriode(periode)}</span>
              <div className="scorewrap">
                <b className="score">{angka(ring.skor)}</b>
                <span className="scoreof">dari 5,00</span>
                {naikSkor !== null && naikSkor !== 0 && (
                  <span className={naikSkor > 0 ? "delta up" : "delta down"}>
                    {naikSkor > 0 ? "▲" : "▼"} {angka(Math.abs(naikSkor))}
                  </span>
                )}
              </div>
              <span className={`chip k${lv} chip-lv`}>
                {lv === 0 ? "Di bawah KPI 3" : `KPI ${lv}`}
              </span>
            </div>

            <div className="metrik">
              <span className="eyebrow">Perkiraan insentif</span>
              <div className="moneyrow">
                <b className="money">{rp(totalInsentif)}</b>
                {naikIns !== null && naikIns !== 0 && (
                  <span className={naikIns > 0 ? "delta up" : "delta down"}>
                    {naikIns > 0 ? "▲" : "▼"} {rpSingkat(Math.abs(naikIns))}
                  </span>
                )}
              </div>
              <p className="muted small nomargin">
                {ring.insentifLalu !== null
                  ? <>Bulan lalu {rpSingkat(ring.insentifLalu)} · final menunggu tutup buku</>
                  : <>Final menunggu penutupan buku</>}
              </p>
            </div>
          </div>

          <Ladder v={ring.skor} t3={3} t4={4} t5={5} satuan="skor" />

          <p className="verdict">
            {kalimatJarak(ring.skor, 3, 4, 5, "unit").replace(" unit", " poin")}
          </p>

          <details className="dash-tren">
            <summary>
              <span>Tren enam periode terakhir</span>
              <span className="faint num">{angka(ring.skor)} sekarang</span>
            </summary>
            <div className="trend">
              {tren.map((t, i) => (
                <i key={String(t.periode)} className={i === tren.length - 1 ? "bar now" : "bar"}
                   style={{ height: `${(t.skor / maksTren) * 100}%` }}
                   title={`${namaPeriode(t.periode)}: ${angka(t.skor)}`} />
              ))}
            </div>
            <div className="trend-x">
              {tren.map((t) => (
                <span key={String(t.periode)}>
                  {new Date(t.periode).toLocaleDateString("id-ID", { month: "short" })}
                </span>
              ))}
            </div>
          </details>
        </section>

        <RincianIndikator data={ind} />

        <TabelInsentif data={ins} periode={periode} total={totalInsentif} />

        <div className="banner info mt">
          <b>Ada angka yang menurut Anda keliru?</b>
          Ajukan koreksi lewat <Link href="/request">menu Request</Link>. Sertakan nomor kontrak
          atau nama debitur agar tim data bisa menelusuri barisnya.
        </div>
      </main>
  );
}

/** Kerangka yang tampil selama angka KPI masih diambil. */
function RangkaDasbor() {
  return (
    <main className="shell">
      <div className="card card-pad dash-ring">
        <div className="dash-metrik">
          <div className="metrik"><div className="sk sk-title" /><div className="sk sk-sub" /></div>
          <div className="metrik"><div className="sk sk-title" /><div className="sk sk-sub" /></div>
        </div>
        <div className="sk sk-bar" />
      </div>
      <div className="sk-cards">
        {Array.from({ length: 4 }).map((_, i) => <div className="sk sk-card" key={i} />)}
      </div>
    </main>
  );
}

function KosongTotal() {
  return (
    <main className="shell">
      <div className="card card-pad narrow mt">
        <h2>Belum ada data yang diterbitkan</h2>
        <p className="muted">
          Tim data belum menerbitkan periode mana pun. Coba lagi setelah pengumuman
          penutupan buku bulanan.
        </p>
      </div>
    </main>
  );
}

function KosongPeriode({ periode }: { periode: string }) {
  return (
    <main className="shell">
      <div className="card card-pad narrow mt">
        <h2>Data Anda belum ada di periode {namaPeriode(periode)}</h2>
        <p className="muted">
          Ini biasanya terjadi kalau NIK Anda belum masuk berkas yang diunggah tim data.
          Ajukan lewat menu Request dengan kategori “Data tidak muncul”.
        </p>
        <p className="mt"><Link className="btn" href="/request">Ajukan sekarang</Link></p>
      </div>
    </main>
  );
}
