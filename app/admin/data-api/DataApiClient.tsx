"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Riwayat = {
  id: number; mulai: string; selesai: string | null; berhasil: boolean;
  tanggal_loc: string | null; cabang_diminta: number; cabang_sukses: number;
  cabang_gagal: string[] | null; jumlah_baris: number; durasi_ms: number | null;
  pesan: string | null; dipicu_oleh: string;
};
type Ringkas = {
  baris: number; terakhir: string | null; cabang_terisi: number;
  baris_kpi: number; kpi_terakhir: string | null;
};

const waktu = (s: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";

const durasi = (ms: number | null) => {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms`
    : ms < 60000 ? `${(ms / 1000).toFixed(1)} dtk`
    : `${Math.floor(ms / 60000)} mnt ${Math.round((ms % 60000) / 1000)} dtk`;
};

/** Berapa lama sejak data terakhir masuk — ini yang paling sering dicari. */
function selisih(s: string | null): { teks: string; basi: boolean } {
  if (!s) return { teks: "belum pernah", basi: true };
  const menit = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (menit < 1) return { teks: "baru saja", basi: false };
  if (menit < 60) return { teks: `${menit} menit lalu`, basi: false };
  const jam = Math.floor(menit / 60);
  // Jadwalnya sejam sekali, jadi lewat dua jam berarti ada yang salah.
  if (jam < 24) return { teks: `${jam} jam lalu`, basi: jam >= 2 };
  return { teks: `${Math.floor(jam / 24)} hari lalu`, basi: true };
}

/**
 * Status penarikan data API.
 *
 * Dua hal yang harus terlihat tanpa dicari: kapan data terakhir masuk, dan
 * apakah tarikan terakhir berhasil. Tarikan terjadwal yang diam-diam
 * berhenti adalah kegagalan yang paling mahal — angkanya tetap tampil,
 * hanya saja sudah basi, dan tidak ada yang curiga sampai ada yang
 * membandingkannya dengan kenyataan.
 *
 * Pengelolaan kode cabang sendiri sudah dipindah ke /admin/cabang — di
 * sini cukup ringkasan dan riwayat, supaya halaman ini menjawab satu
 * pertanyaan ("apakah tarikan berjalan baik?") tanpa berebut ruang dengan
 * formulir pengelolaan cabang.
 */
export default function DataApiClient() {
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [cabangAktif, setCabangAktif] = useState(0);
  const [cabangTotal, setCabangTotal] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/data-api", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat status data API."); return; }
    setRiwayat(j.riwayat ?? []); setRingkas(j.ringkas ?? null);
    const cabang = j.cabang ?? [];
    setCabangTotal(cabang.length);
    setCabangAktif(cabang.filter((c: any) => c.aktif).length);
  }
  useEffect(() => { segarkan(); }, []);

  async function tarikSekarang() {
    setSibuk(true); setPesan("Menarik data… ini bisa memakan waktu beberapa menit.");
    try {
      const r = await fetch("/api/admin/data-api", { method: "PATCH" });
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? "Gagal menarik data."); return; }
      setPesan(
        j.tarik.berhasil
          ? `Berhasil: ${j.tarik.jumlahBaris.toLocaleString("id-ID")} baris dari ` +
            `${j.tarik.cabangSukses} cabang dalam ${durasi(j.tarik.durasiMs)}. ` +
            (j.hitung
              ? `${j.hitung.baris} baris KPI dan ${j.hitung.insentif ?? 0} baris insentif dihitung ulang.` +
                (j.hitung.gagal?.length ? ` ${j.hitung.gagal.length} indikator gagal dihitung.` : "")
              : "")
          : `Gagal — tidak ada data yang ditimpa. ${j.tarik.pesan ?? ""}`,
      );
      await segarkan();
    } finally { setSibuk(false); }
  }

  async function hitungUlang() {
    setSibuk(true);
    setPesan("Menghitung ulang indikator dari data yang sudah ada…");
    try {
      const r = await fetch("/api/admin/data-api", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hanyaHitung: true }),
      });
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? "Gagal menghitung ulang."); return; }
      setPesan(
        `Selesai: ${j.hitung.baris} baris KPI dan ${j.hitung.insentif ?? 0} baris ` +
        `insentif dihitung ulang untuk ${j.hitung.indikator} indikator.` +
        (j.hitung.gagal?.length
          ? ` ${j.hitung.gagal.length} indikator gagal: ` +
            j.hitung.gagal.map((g: any) => `${g.indikator} (${g.pesan})`).join("; ")
          : ""),
      );
      await segarkan();
    } finally { setSibuk(false); }
  }

  const usia = selisih(ringkas?.terakhir ?? null);
  const terakhirGagal = riwayat[0] && !riwayat[0].berhasil;

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Data API</h2>
          <p>
            Data mentah ditarik berkala dari API collection, lalu diolah jadi
            angka KPI periode berjalan. Penimpaan bersifat semua-atau-tidak.
          </p>
        </div>
        <div className="rowact">
          {/* Hitung ulang tanpa menarik: untuk memunculkan indikator yang
              baru dibuat/diubah tanpa memaksa tarik ulang 87 ribu baris. */}
          <button className="btn ghost" disabled={sibuk} onClick={hitungUlang}
                  title="Menghitung ulang indikator dari data mentah yang sudah ada, tanpa menarik lagi">
            {sibuk ? "Memproses…" : "Hitung ulang"}
          </button>
          <button className="btn" disabled={sibuk} onClick={tarikSekarang}>
            {sibuk ? "Menarik…" : "Tarik sekarang"}
          </button>
        </div>
      </div>

      {pesan && (
        <div className={"alert mb " + (pesan.startsWith("Berhasil") ? "ok" : pesan.startsWith("Menarik") ? "" : "bad")}>
          {pesan}
        </div>
      )}

      <div className="api-metrik mb">
        <div className={"api-kotak" + (usia.basi ? " bahaya" : "")}>
          <b>{usia.teks}</b>
          <span>data terakhir masuk</span>
          <em className="faint">{waktu(ringkas?.terakhir ?? null)}</em>
        </div>
        <div className="api-kotak">
          <b>{(ringkas?.baris ?? 0).toLocaleString("id-ID")}</b>
          <span>baris data mentah</span>
          <em className="faint">{ringkas?.cabang_terisi ?? 0} cabang terisi</em>
        </div>
        <div className="api-kotak">
          <b>{(ringkas?.baris_kpi ?? 0).toLocaleString("id-ID")}</b>
          <span>baris KPI dari API</span>
          <em className="faint">{selisih(ringkas?.kpi_terakhir ?? null).teks}</em>
        </div>
        <div className={"api-kotak" + (cabangAktif === 0 ? " bahaya" : "")}>
          <b>{cabangAktif}</b>
          <span>cabang aktif ditarik</span>
          <em className="faint">dari {cabangTotal} terdaftar</em>
        </div>
      </div>

      {terakhirGagal && (
        <div className="alert bad mb">
          <b>Tarikan terakhir gagal.</b> Data lama masih dipakai dan tidak tertimpa.
          {riwayat[0].pesan && <div className="small mt">{riwayat[0].pesan}</div>}
        </div>
      )}

      {cabangAktif === 0 && (
        <div className="alert warn mb">
          Belum ada kode cabang aktif, jadi penarikan tidak akan mengambil apa pun.
          Atur di <Link className="lnk" href="/admin/cabang">Master Cabang API</Link>.
        </div>
      )}

      <section className="card">
        <div className="cardhead rowbetween">
          <div>
            <h3 style={{ fontSize: 14 }}>Riwayat penarikan</h3>
            <p className="muted small">
              20 percobaan terakhir. Riwayat lama dipangkas sendiri, hanya 50
              terbaru yang disimpan.
            </p>
          </div>
          {riwayat.length > 1 && (
            <button className="btn ghost sm" disabled={sibuk}
                    onClick={async () => {
                      if (!confirm("Hapus riwayat penarikan? Yang terakhir tetap disimpan.")) return;
                      setSibuk(true);
                      try {
                        const r = await fetch("/api/admin/data-api?riwayat=1", { method: "DELETE" });
                        const j = await r.json();
                        setPesan(`Berhasil menghapus ${j.dihapus} catatan riwayat.`);
                        await segarkan();
                      } finally { setSibuk(false); }
                    }}>
              Bersihkan riwayat
            </button>
          )}
        </div>
        <table className="rapat">
          <thead>
            <tr>
              <th>Waktu</th><th style={{ width: 90 }}>Hasil</th>
              <th className="r" style={{ width: 90 }}>Baris</th>
              <th className="r" style={{ width: 90 }}>Durasi</th>
            </tr>
          </thead>
          <tbody>
            {riwayat.map((r) => (
              <tr key={r.id} className={r.berhasil ? "" : "kurang"}>
                <td>
                  {waktu(r.mulai)}
                  <div className="faint small">
                    {r.dipicu_oleh === "manual" ? "manual" : "terjadwal"}
                    {r.tanggal_loc && ` · ${r.tanggal_loc}`}
                  </div>
                </td>
                <td>
                  <span className={"tag " + (r.berhasil ? "ok" : "bad")}>
                    {r.berhasil ? "berhasil" : "gagal"}
                  </span>
                  <div className="faint small">{r.cabang_sukses}/{r.cabang_diminta} cabang</div>
                </td>
                <td className="r num">{r.jumlah_baris.toLocaleString("id-ID")}</td>
                <td className="r num faint">{durasi(r.durasi_ms)}</td>
              </tr>
            ))}
            {riwayat.some((r) => r.pesan && !r.berhasil) && (
              <tr>
                <td colSpan={4} className="faint small">
                  Galat terakhir: {riwayat.find((r) => !r.berhasil)?.pesan}
                </td>
              </tr>
            )}
            {!riwayat.length && (
              <tr><td colSpan={4} className="empty">
                Belum pernah menarik data.
              </td></tr>
            )}
          </tbody>
        </table>

        <div className="api-catatan">
          <b>Memasang jadwal jam-jaman</b>
          <p className="faint small">
            Paket Vercel Hobby hanya mengizinkan cron harian, jadi jadwalnya
            dipasang di layanan luar. Arahkan cron-job.org ke alamat berikut
            tiap jam, dengan <span className="num">CRON_SECRET</span> yang sama
            seperti di Environment Variables:
          </p>
          <code className="api-url">/api/cron/tarik?token=CRON_SECRET</code>
          <p className="faint small">
            Ukur dulu durasinya lewat tombol "Tarik sekarang" di atas. Kalau
            melebihi 300 detik, nyalakan Fluid Compute di pengaturan project
            atau penarikannya perlu dipecah bertahap.
          </p>
          <p className="faint small">
            Kode cabang diatur di{" "}
            <Link className="lnk" href="/admin/cabang">Master Cabang API</Link>,
            indikator yang dihitung dari data ini di{" "}
            <Link className="lnk" href="/admin/indikator">Indikator</Link>, dan
            contoh isi data mentahnya bisa diperiksa di{" "}
            <Link className="lnk" href="/admin/sampel-data">Sampel data</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
