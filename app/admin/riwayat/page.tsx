import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { namaPeriode, waktu } from "@/lib/format";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";
import RiwayatClient, { type BarisBatch } from "./RiwayatClient";

export const metadata = { title: "Riwayat impor" };

const angka = (n: unknown) => Number(n ?? 0).toLocaleString("id-ID");

export default async function Riwayat() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  const [list, [total], [jumlah]] = await Promise.all([
    q<any>(
      `SELECT b.id, b.periode, b.tipe, b.status, b.nama_file, b.blob_url,
              b.total_baris, b.baris_valid, b.baris_warning, b.baris_ditolak,
              b.diunggah_pada, b.diterbitkan_pada, u.nama AS pengunggah
         FROM import_batch b LEFT JOIN app_user u ON u.id = b.diunggah_oleh
        ORDER BY b.diunggah_pada DESC LIMIT 60`),
    // Ringkasan dihitung dari seluruh tabel, bukan hanya 60 baris yang
    // ditampilkan, supaya angkanya tidak diam-diam berubah makna saat
    // riwayat sudah panjang.
    q<{ berkas: number; baris: number; valid: number; aktif: number }>(
      `SELECT COUNT(*)::int AS berkas,
              COALESCE(SUM(total_baris),0)::int AS baris,
              COALESCE(SUM(baris_valid),0)::int AS valid,
              COUNT(*) FILTER (WHERE status = 'published')::int AS aktif
         FROM import_batch`),
    q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM app_user WHERE aktif`),
  ]);

  const aktif = list.find((b) => b.status === "published" && b.tipe === "kpi");
  const validitas = total.baris ? (total.valid / total.baris) * 100 : null;

  // Teks tanggal diformat di server supaya tampilan server dan browser
  // selalu sama (zona waktu keduanya bisa berbeda).
  const baris: BarisBatch[] = list.map((b) => ({
    id: b.id,
    periode: namaPeriode(b.periode),
    tipe: b.tipe,
    status: b.status,
    namaFile: b.nama_file,
    blobUrl: b.blob_url,
    total: Number(b.total_baris),
    valid: Number(b.baris_valid),
    warning: Number(b.baris_warning),
    ditolak: Number(b.baris_ditolak),
    diunggah: waktu(b.diunggah_pada),
    pengunggah: b.pengunggah ?? "—",
  }));

  return (
    <AppShell>
      <main className="shell">
        <JudulHalaman
          eyebrow="Data & indikator"
          meta={<><TitikStatus nada={total.aktif ? "good" : "netral"} /> {total.aktif} batch tayang</>}
          judul="Riwayat impor"
          deskripsi="Setiap unggahan tersimpan lengkap dengan berkas aslinya selama 24 bulan."
          aksi={
            <Link className="btn" href="/admin/import">
              <Ikon nama="upload" ukuran={16} /> Unggah berkas baru
            </Link>
          }
        />

        <div className="km-grid">
          <KartuMetrik label="Total berkas impor" nilai={angka(total.berkas)} satuan="berkas"
                       catatan="Seluruh unggahan tersimpan"
                       ikon={<Ikon nama="history" ukuran={20} />} nada="accent" />
          <KartuMetrik label="Total baris terproses" nilai={angka(total.baris)} satuan="baris"
                       catatan={`${angka(total.valid)} baris siap pakai`}
                       ikon={<Ikon nama="sheet" ukuran={20} />} nada="good" />
          <KartuMetrik label="Tingkat validitas"
                       nilai={validitas === null ? "—" : validitas.toFixed(1).replace(".", ",") + "%"}
                       catatan="Baris siap dibanding total baris"
                       ikon={<Ikon nama="checkCircle" ukuran={20} />}
                       nada={validitas === null ? "netral" : validitas >= 95 ? "good" : validitas >= 80 ? "warn" : "bad"} />
          <KartuMetrik label="Batch KPI tayang"
                       nilai={<span className="km-teks">{aktif ? namaPeriode(aktif.periode) : "Belum ada"}</span>}
                       catatan={aktif ? `${angka(aktif.baris_valid)} baris · ${angka(jumlah.n)} karyawan aktif` : "Terbitkan batch dari layar unggah"}
                       ikon={<Ikon nama="eye" ukuran={20} />} nada={aktif ? "accent" : "warn"} />
        </div>

        {aktif ? (
          <div className="ri-tayang">
            <span className="sd-ikon warn"><Ikon nama="eye" ukuran={20} /></span>
            <div className="ri-tayang-teks">
              <div className="ri-tayang-atas">
                <h2>Yang dilihat karyawan sekarang: {namaPeriode(aktif.periode)}</h2>
                <span className="pa-status good">Batch aktif</span>
              </div>
              <p>
                <b>{angka(aktif.baris_valid)} baris</b>, terbit {waktu(aktif.diterbitkan_pada)} oleh{" "}
                <b>{aktif.pengunggah ?? "—"}</b>. Mengaktifkan batch lain akan langsung mengubah angka di
                layar <b>{angka(jumlah.n)} karyawan</b>.
              </p>
            </div>
          </div>
        ) : (
          <div className="alert-box warn ri-tayang-kosong">
            <span className="alert-ikon">!</span>
            <span>Belum ada batch Data KPI yang tayang — karyawan belum melihat angka apa pun.</span>
          </div>
        )}

        <RiwayatClient baris={baris} />
      </main>
    </AppShell>
  );
}
