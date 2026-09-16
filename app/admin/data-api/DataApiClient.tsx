"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

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
  const [buka, setBuka] = useState<number | null>(null);
  const [hal, setHal] = useState(0);
  const [tersalin, setTersalin] = useState(false);

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

  const PER = 8;
  const totalHal = Math.max(1, Math.ceil(riwayat.length / PER));
  const halIni = Math.min(hal, totalHal - 1);
  const potong = riwayat.slice(halIni * PER, halIni * PER + PER);
  const berdurasi = riwayat.filter((r) => r.durasi_ms !== null);
  const rataDurasi = berdurasi.length
    ? berdurasi.reduce((a, r) => a + (r.durasi_ms ?? 0), 0) / berdurasi.length : null;
  const durasiAkhir = riwayat.find((r) => r.durasi_ms !== null)?.durasi_ms ?? null;
  const BATAS_MS = 300_000;
  const porsi = durasiAkhir === null ? 0 : Math.min(100, (durasiAkhir / BATAS_MS) * 100);

  // Nada pesan ditentukan dari awal kalimatnya, sama seperti sebelumnya.
  const nadaPesan = !pesan ? "info"
    : pesan.startsWith("Berhasil") || pesan.startsWith("Selesai") ? "good"
    : pesan.startsWith("Menarik") || pesan.startsWith("Menghitung") ? "info" : "bad";

  async function salin() {
    try {
      await navigator.clipboard.writeText("/api/cron/tarik?token=CRON_SECRET");
      setTersalin(true); setTimeout(() => setTersalin(false), 2000);
    } catch { /* clipboard ditolak browser — alamat tetap terlihat untuk disalin manual */ }
  }

  async function bersihkan() {
    if (!confirm("Hapus riwayat penarikan? Yang terakhir tetap disimpan.")) return;
    setSibuk(true);
    try {
      const r = await fetch("/api/admin/data-api?riwayat=1", { method: "DELETE" });
      const j = await r.json();
      setPesan(`Berhasil menghapus ${j.dihapus} catatan riwayat.`);
      setHal(0);
      await segarkan();
    } finally { setSibuk(false); }
  }

  return (
    <>
      <JudulHalaman
        eyebrow="Engine collection sync"
        meta={<><TitikStatus nada={!ringkas ? "netral" : terakhirGagal || usia.basi ? "bad" : "good"} />
              {!ringkas ? "memuat status…" : terakhirGagal ? "tarikan terakhir gagal" : usia.basi ? "data basi" : "sinkron berjalan"}</>}
        judul="Data API & riwayat penarikan"
        deskripsi="Data mentah ditarik berkala dari API collection, lalu diolah jadi angka KPI periode berjalan. Penimpaan bersifat semua-atau-tidak."
        aksi={<>
          {/* Hitung ulang tanpa menarik: untuk memunculkan indikator yang
              baru dibuat/diubah tanpa memaksa tarik ulang 87 ribu baris. */}
          <button className="btn ghost" disabled={sibuk} onClick={hitungUlang}
                  title="Menghitung ulang indikator dari data mentah yang sudah ada, tanpa menarik lagi">
            <Ikon nama="refresh" ukuran={16} /> {sibuk ? "Memproses…" : "Hitung ulang"}
          </button>
          <button className="btn" disabled={sibuk} onClick={tarikSekarang}>
            <Ikon nama="download" ukuran={16} /> {sibuk ? "Menarik…" : "Tarik sekarang"}
          </button>
        </>}
      />

      {pesan && (
        <div className={"alert-box da-pesan " + nadaPesan} role="status">
          <span className="alert-ikon">{nadaPesan === "good" ? "✓" : nadaPesan === "bad" ? "!" : "i"}</span>
          <span>{pesan}</span>
          {!sibuk && <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>}
        </div>
      )}

      <div className="km-grid">
        <KartuMetrik label="Sinkronisasi terakhir"
                     nilai={<span className={"km-teks" + (usia.basi ? " teks-bad" : "")}>{ringkas ? usia.teks : "—"}</span>}
                     catatan={<span className="num">{waktu(ringkas?.terakhir ?? null)}</span>}
                     ikon={<Ikon nama="clock" ukuran={20} />} nada={usia.basi ? "bad" : "accent"}
                     lencana={usia.basi && ringkas ? { teks: "basi", nada: "bad" } : undefined} />
        <KartuMetrik label="Volume data mentah" nilai={(ringkas?.baris ?? 0).toLocaleString("id-ID")} satuan="baris"
                     catatan={`${ringkas?.cabang_terisi ?? 0} cabang terisi`}
                     ikon={<Ikon nama="database" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Hasil metrik KPI" nilai={(ringkas?.baris_kpi ?? 0).toLocaleString("id-ID")} satuan="baris KPI"
                     catatan={`Dihitung ${selisih(ringkas?.kpi_terakhir ?? null).teks}`}
                     ikon={<Ikon nama="chart" ukuran={20} />} nada="good" />
        <KartuMetrik label="Cabang aktif ditarik" nilai={cabangAktif} satuan={`/ ${cabangTotal} terdaftar`}
                     catatan={cabangTotal ? `${cabangTotal - cabangAktif} cabang dinonaktifkan` : "Belum ada cabang terdaftar"}
                     ikon={<Ikon nama="building" ukuran={20} />} nada={cabangAktif === 0 ? "bad" : "netral"}
                     lencana={cabangTotal ? {
                       teks: `${Math.round((cabangAktif / cabangTotal) * 100)}%`,
                       nada: cabangAktif === cabangTotal ? "good" : cabangAktif === 0 ? "bad" : "warn",
                     } : undefined} />
      </div>

      {terakhirGagal && (
        <div className="alert-box bad da-pesan">
          <span className="alert-ikon">!</span>
          <span>
            <b>Tarikan terakhir gagal.</b> Data lama masih dipakai dan tidak tertimpa.
            {riwayat[0].pesan && <span className="da-galat num">{riwayat[0].pesan}</span>}
          </span>
        </div>
      )}

      {ringkas && cabangAktif === 0 && (
        <div className="alert-box warn da-pesan">
          <span className="alert-ikon">!</span>
          <span>
            Belum ada kode cabang aktif, jadi penarikan tidak akan mengambil apa pun.
            Atur di <Link className="lnk" href="/admin/cabang">Master Cabang API</Link>.
          </span>
        </div>
      )}

      <div className="da-grid">
        <section className="card da-riwayat">
          <div className="rk-kartu-kepala">
            <span className="km-ikon accent"><Ikon nama="history" ukuran={20} /></span>
            <div>
              <h2>Riwayat penarikan API <span className="da-hitung num">{riwayat.length} sesi terakhir</span></h2>
              <p className="faint small">Log penarikan terjadwal dan manual. Riwayat dipangkas sendiri, hanya 50 terbaru yang disimpan.</p>
            </div>
            {riwayat.length > 1 && (
              <button className="btn ghost sm" disabled={sibuk} onClick={bersihkan}>
                <Ikon nama="trash" ukuran={14} /> Bersihkan riwayat
              </button>
            )}
          </div>

          <div className="tabel-scroll">
            <table className="rk-tabel da-tabel">
              <thead>
                <tr>
                  <th>Waktu penarikan</th><th>Status & cabang</th>
                  <th className="r">Baris data</th><th className="r">Durasi</th>
                  <th className="r" style={{ width: 56 }}>Audit</th>
                </tr>
              </thead>
              <tbody>
                {potong.map((r) => {
                  const terbuka = buka === r.id;
                  const adaDetail = !!(r.pesan || r.cabang_gagal?.length || r.selesai || r.tanggal_loc);
                  return (
                    <Fragment key={r.id}>
                      <tr className={"rk-baris" + (r.berhasil ? "" : " bad")}>
                        <td>
                          <div className="da-waktu num">{waktu(r.mulai)}</div>
                          <div className="da-pemicu">
                            <Ikon nama={r.dipicu_oleh === "manual" ? "userCog" : "clock"} ukuran={13} />
                            {r.dipicu_oleh === "manual" ? "manual" : "terjadwal"}
                            {r.tanggal_loc && <><span className="sd-sep">·</span><span className="num">{r.tanggal_loc}</span></>}
                          </div>
                        </td>
                        <td>
                          <span className={"pa-status " + (r.berhasil ? "good" : "bad")}>{r.berhasil ? "berhasil" : "gagal"}</span>
                          <div className="pa-sub num">{r.cabang_sukses}/{r.cabang_diminta} cabang</div>
                        </td>
                        <td className="r num da-baris">{r.jumlah_baris.toLocaleString("id-ID")}</td>
                        <td className="r num faint">{durasi(r.durasi_ms)}</td>
                        <td className="r">
                          {adaDetail && (
                            <button className={"pa-ikon-btn da-audit" + (terbuka ? " on" : "")}
                                    aria-expanded={terbuka} title="Lihat detail penarikan"
                                    onClick={() => setBuka(terbuka ? null : r.id)}>
                              <Ikon nama={terbuka ? "chevronDown" : "code"} ukuran={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {terbuka && (
                        <tr className="da-detail">
                          <td colSpan={5}>
                            <dl>
                              <div><dt>Mulai</dt><dd className="num">{waktu(r.mulai)}</dd></div>
                              <div><dt>Selesai</dt><dd className="num">{waktu(r.selesai)}</dd></div>
                              <div><dt>Tanggal LOC</dt><dd className="num">{r.tanggal_loc ?? "—"}</dd></div>
                              <div><dt>Cabang gagal</dt><dd className="num">{r.cabang_gagal?.length ? r.cabang_gagal.join(", ") : "—"}</dd></div>
                            </dl>
                            {r.pesan && <pre className="da-log">{r.pesan}</pre>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!riwayat.length && (
                  <tr><td colSpan={5} className="empty">{ringkas ? "Belum pernah menarik data." : "Memuat riwayat…"}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pa-pager">
            <span className="faint">
              {riwayat.length
                ? <>Menampilkan <b>{halIni * PER + 1}–{Math.min(halIni * PER + PER, riwayat.length)}</b> dari <b>{riwayat.length}</b> riwayat
                    {rataDurasi !== null && <> <span className="sd-sep">•</span> rata-rata durasi <b className="num">{durasi(Math.round(rataDurasi))}</b></>}</>
                : "Tidak ada data"}
            </span>
            {totalHal > 1 && (
              <div className="pa-pager-btn">
                <button className="btn ghost sm" disabled={halIni === 0} onClick={() => setHal(halIni - 1)}>← Sebelumnya</button>
                <button className="btn ghost sm" disabled={halIni >= totalHal - 1} onClick={() => setHal(halIni + 1)}>Berikutnya →</button>
              </div>
            )}
          </div>
        </section>

        <aside className="da-samping">
          <section className="card da-panel">
            <div className="da-panel-kepala">
              <span className="km-ikon accent"><Ikon nama="clock" ukuran={18} /></span>
              <div>
                <h3>Memasang jadwal jam-jaman</h3>
                <span className="eyebrow">VERCEL CRON & WEBHOOK SECRET</span>
              </div>
            </div>
            <p className="da-teks">
              Paket Vercel Hobby hanya mengizinkan cron harian, jadi jadwalnya dipasang di layanan luar.
              Arahkan <b>cron-job.org</b> ke alamat berikut tiap jam, dengan <code className="da-kode">CRON_SECRET</code> yang
              sama seperti di Environment Variables:
            </p>
            <div className="da-endpoint">
              <div className="da-endpoint-atas">
                <span className="eyebrow">ENDPOINT WEBHOOK</span>
                <span className="num faint">GET</span>
              </div>
              <div className="da-endpoint-isi">
                <code className="num">/api/cron/tarik?token=CRON_SECRET</code>
                <button className="pa-ikon-btn" onClick={salin} title="Salin alamat">
                  <Ikon nama={tersalin ? "check" : "copy"} ukuran={15} />
                </button>
              </div>
              {tersalin && <span className="da-tersalin">Tersalin ke clipboard</span>}
            </div>
            <div className="alert-box warn da-ambang">
              <span className="alert-ikon"><Ikon nama="clock" ukuran={15} /></span>
              <span>
                <b>Perhatikan ambang durasi.</b> Ukur dulu lewat tombol “Tarik sekarang”. Kalau melebihi 300 detik,
                nyalakan <em>Fluid Compute</em> di pengaturan project atau pecah penarikan bertahap.
              </span>
            </div>
            <div>
              <span className="eyebrow">REFERENSI TERKAIT</span>
              <div className="da-tautan">
                <Link href="/admin/cabang"><Ikon nama="server" ukuran={14} /> Master Cabang API</Link>
                <Link href="/admin/indikator"><Ikon nama="formula" ukuran={14} /> Indikator KPI</Link>
                <Link href="/admin/sampel-data"><Ikon nama="code" ukuran={14} /> Sampel data mentah</Link>
              </div>
            </div>
          </section>

          <section className="card da-panel">
            <div className="da-panel-baris">
              <span className="eyebrow da-ikon-teks"><Ikon nama="server" ukuran={14} /> DURASI VS BATAS WAKTU</span>
              <span className={"da-siap " + (porsi >= 80 ? "bad" : porsi >= 50 ? "warn" : "good")}>
                <i /> {durasiAkhir === null ? "belum diukur" : porsi >= 80 ? "mendekati batas" : porsi >= 50 ? "perlu dipantau" : "aman"}
              </span>
            </div>
            <div className="da-panel-baris small">
              <span className="muted">Tarikan terakhir</span>
              <span className="num">{durasi(durasiAkhir)} / 300 dtk ({porsi.toFixed(1).replace(".", ",")}%)</span>
            </div>
            <div className="rk-m-bar"><i className={porsi >= 80 ? "bad" : porsi >= 50 ? "" : "good"} style={{ width: porsi + "%" }} /></div>
            <div className="da-panel-baris small">
              <span className="muted">Rata-rata: <b className="num">{durasi(rataDurasi === null ? null : Math.round(rataDurasi))}</b></span>
              <span className="muted">Batas fungsi: <b className="num">300 dtk</b></span>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
