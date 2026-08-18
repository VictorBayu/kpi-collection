"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Cabang = { branch_id: string; cabang: string; area: string | null; aktif: boolean };
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
 */
export default function DataApiClient() {
  const [cabang, setCabang] = useState<Cabang[]>([]);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [muat, setMuat] = useState(true);
  const [pesan, setPesan] = useState<string | null>(null);
  const [tempel, setTempel] = useState("");
  const [bukaTempel, setBukaTempel] = useState(false);
  const [baru, setBaru] = useState<Cabang | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/data-api", { cache: "no-store" });
    const j = await r.json();
    setCabang(j.cabang ?? []); setRiwayat(j.riwayat ?? []); setRingkas(j.ringkas ?? null);
    setMuat(false);
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
            (j.hitung ? `${j.hitung.baris} baris KPI dihitung ulang.` : "")
          : `Gagal — tidak ada data yang ditimpa. ${j.tarik.pesan ?? ""}`,
      );
      await segarkan();
    } finally { setSibuk(false); }
  }

  const aktif = cabang.filter((c) => c.aktif).length;
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
        <button className="btn" disabled={sibuk} onClick={tarikSekarang}>
          {sibuk ? "Menarik…" : "Tarik sekarang"}
        </button>
      </div>

      {pesan && (
        <div className={"alert mb " + (pesan.startsWith("Berhasil") ? "ok" : pesan.startsWith("Menarik") ? "" : "bad")}>
          {pesan}
        </div>
      )}

      {/* --- ringkasan --- */}
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
        <div className={"api-kotak" + (aktif === 0 ? " bahaya" : "")}>
          <b>{aktif}</b>
          <span>cabang aktif ditarik</span>
          <em className="faint">dari {cabang.length} terdaftar</em>
        </div>
      </div>

      {terakhirGagal && (
        <div className="alert bad mb">
          <b>Tarikan terakhir gagal.</b> Data lama masih dipakai dan tidak tertimpa.
          {riwayat[0].pesan && <div className="small mt">{riwayat[0].pesan}</div>}
        </div>
      )}

      {aktif === 0 && !muat && (
        <div className="alert warn mb">
          Belum ada kode cabang aktif, jadi penarikan tidak akan mengambil apa pun.
          Tempelkan daftar 57 kode cabang di bawah.
        </div>
      )}

      <div className="split-kpi">
        {/* --- master kode cabang --- */}
        <section className="card">
          <div className="cardhead rowbetween">
            <h3 style={{ fontSize: 14 }}>Kode cabang API</h3>
            <div className="ind-aksi">
              <button className="btn ghost sm" onClick={() => setBukaTempel(!bukaTempel)}>
                Tempel banyak
              </button>
              <button className="btn ghost sm"
                      onClick={() => setBaru({ branch_id: "", cabang: "", area: "", aktif: true })}>
                + Satu
              </button>
            </div>
          </div>

          {bukaTempel && (
            <div className="api-tempel">
              <p className="faint small">
                Satu baris per cabang: <span className="num">kode, nama cabang, area</span>.
                Area boleh dikosongkan. Kode yang sudah ada akan diperbarui.
              </p>
              <textarea rows={6} value={tempel} onChange={(e) => setTempel(e.target.value)}
                        placeholder={"451, MANADO, AREA SULUT-TENG-GO\n452, GORONTALO, AREA SULUT-TENG-GO"} />
              <div className="formact">
                <button className="btn sm" disabled={sibuk || !tempel.trim()}
                        onClick={async () => {
                          setSibuk(true);
                          try {
                            const r = await fetch("/api/admin/data-api", {
                              method: "PUT", headers: { "content-type": "application/json" },
                              body: JSON.stringify({ teks: tempel }),
                            });
                            const j = await r.json();
                            setPesan(`${j.masuk} kode cabang tersimpan.` +
                              (j.ditolak?.length ? ` ${j.ditolak.length} baris dilewati.` : ""));
                            setTempel(""); setBukaTempel(false); await segarkan();
                          } finally { setSibuk(false); }
                        }}>
                  Simpan daftar
                </button>
                <button className="btn ghost sm" onClick={() => setBukaTempel(false)}>Batal</button>
              </div>
            </div>
          )}

          {baru && (
            <div className="api-tempel">
              <div className="grid3">
                <input value={baru.branch_id} placeholder="451"
                       onChange={(e) => setBaru({ ...baru, branch_id: e.target.value })} />
                <input value={baru.cabang} placeholder="MANADO"
                       onChange={(e) => setBaru({ ...baru, cabang: e.target.value.toUpperCase() })} />
                <input value={baru.area ?? ""} placeholder="Area (opsional)"
                       onChange={(e) => setBaru({ ...baru, area: e.target.value.toUpperCase() })} />
              </div>
              <div className="formact">
                <button className="btn sm" disabled={sibuk}
                        onClick={async () => {
                          setSibuk(true);
                          try {
                            await fetch("/api/admin/data-api", {
                              method: "POST", headers: { "content-type": "application/json" },
                              body: JSON.stringify(baru),
                            });
                            setBaru(null); await segarkan();
                          } finally { setSibuk(false); }
                        }}>Simpan</button>
                <button className="btn ghost sm" onClick={() => setBaru(null)}>Batal</button>
              </div>
            </div>
          )}

          <div className="cabang-scroll">
            <table className="rapat">
              <thead>
                <tr><th style={{ width: 70 }}>Kode</th><th>Cabang</th><th style={{ width: 70 }}></th></tr>
              </thead>
              <tbody>
                {cabang.map((c) => (
                  <tr key={c.branch_id} className={c.aktif ? "" : "kurang"}>
                    <td className="num"><b>{c.branch_id}</b></td>
                    <td>{c.cabang}<div className="faint small">{c.area ?? "—"}</div></td>
                    <td className="r">
                      <button className="isyarat-x" title="Hapus" disabled={sibuk}
                              onClick={async () => {
                                await fetch(`/api/admin/data-api?branch_id=${encodeURIComponent(c.branch_id)}`,
                                  { method: "DELETE" });
                                await segarkan();
                              }}>×</button>
                    </td>
                  </tr>
                ))}
                {!cabang.length && (
                  <tr><td colSpan={3} className="empty">
                    {muat ? "Memuat…" : "Belum ada kode cabang."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* --- riwayat --- */}
        <section className="card">
          <div className="cardhead">
            <h3 style={{ fontSize: 14 }}>Riwayat penarikan</h3>
            <p className="muted small">20 percobaan terakhir, berhasil maupun gagal.</p>
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
              Ukur dulu durasinya lewat tombol “Tarik sekarang” di atas. Kalau
              melebihi 300 detik, nyalakan Fluid Compute di pengaturan project
              atau penarikannya perlu dipecah bertahap.
            </p>
            <p className="faint small">
              Indikator yang dihitung dari data ini diatur di{" "}
              <Link className="lnk" href="/admin/indikator">Indikator</Link>, dan
              pemetaan jabatan ke produknya di{" "}
              <Link className="lnk" href="/admin/produk">Master Produk</Link>.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
