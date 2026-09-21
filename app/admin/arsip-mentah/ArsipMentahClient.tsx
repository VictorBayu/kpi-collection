"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import Ikon from "@/components/Ikon";
import JudulHalaman from "@/components/JudulHalaman";
import { namaPeriode, waktu } from "@/lib/format";

type Batch = {
  id: string;
  periode: string;
  status: "draft" | "validated" | "published" | "superseded" | "failed";
  nama_file: string;
  total_baris: number;
  baris_valid: number;
  baris_ditolak: number;
  diunggah_pada: string;
  diterbitkan_pada: string | null;
  diunggah_oleh: string | null;
};

const BATAS_MB = 40;
const FORMAT_OK = /\.(xlsx|xls)$/i;

const LABEL_STATUS: Record<Batch["status"], string> = {
  draft: "Draf",
  validated: "Siap diterbitkan",
  published: "Aktif",
  superseded: "Digantikan",
  failed: "Gagal",
};
const CHIP_STATUS: Record<Batch["status"], string> = {
  draft: "chip",
  validated: "chip k3",
  published: "chip k5",
  superseded: "chip",
  failed: "chip k0",
};

function bulanLalu() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function panggil(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Terjadi gangguan. Coba lagi sebentar.");
  return data;
}

/**
 * Arsip Data Mentah — layar untuk mengunggah snapshot data mentah akhir
 * bulan, supaya periode itu bisa dihitung ulang nanti kalau ada rumus
 * indikator yang diperbaiki.
 *
 * Sengaja BUKAN wizard multi-langkah seperti Unggah Data KPI/Insentif:
 * di sana admin mencocokkan kolom Excel sendiri karena berkasnya bisa
 * dari format apa saja. Di sini template-nya sistem yang buat (tombol
 * "Unduh Template" di bawah), jadi begitu berkas diunggah langsung bisa
 * diperiksa dan disimpan — tidak ada langkah pencocokan kolom.
 */
export default function ArsipMentahClient() {
  const [batch, setBatch] = useState<Batch[]>([]);
  const [jumlahKolom, setJumlahKolom] = useState(0);
  const [muat, setMuat] = useState(true);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);

  const [periode, setPeriode] = useState(bulanLalu());
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [progres, setProgres] = useState(0);
  const [hasilUnggah, setHasilUnggah] = useState<{
    batchId: string; periode: string; totalBaris: number;
    barisValid: number; barisDitolak: number; contohTolak: string[];
  } | null>(null);
  const [hitungUlang, setHitungUlang] = useState(false);
  const [konfirmasiTerbit, setKonfirmasiTerbit] = useState(false);

  async function segarkan() {
    const r = await fetch("/api/admin/arsip-mentah", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat riwayat arsip."); setMuat(false); return; }
    setBatch(j.batch ?? []);
    setJumlahKolom(j.jumlahKolomTemplate ?? 0);
    setMuat(false);
  }
  useEffect(() => { segarkan(); }, []);

  async function pilihBerkas(file: File) {
    setPesan(null); setSukses(null); setHasilUnggah(null);
    if (!FORMAT_OK.test(file.name)) {
      setPesan(`Berkas "${file.name}" bukan .xlsx/.xls.`);
      return;
    }
    if (file.size > BATAS_MB * 1024 * 1024) {
      setPesan(`Berkas terlalu besar (maks. ${BATAS_MB} MB).`);
      return;
    }
    try {
      setSibuk("Mengunggah berkas..."); setProgres(0);
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/admin/arsip-mentah/upload",
        onUploadProgress: ({ percentage }) => setProgres(percentage),
      });

      setSibuk("Membaca dan memeriksa isi berkas...");
      const r = await panggil("/api/admin/arsip-mentah/parse", {
        blobUrl: blob.url, namaFile: file.name, periode: periode + "-01",
      });
      setHasilUnggah(r);
      await segarkan();
    } catch (e: any) {
      setPesan(e.message);
    } finally {
      setSibuk(null); setProgres(0);
    }
  }

  async function terbitkan() {
    if (!hasilUnggah) return;
    setSibuk("Menerbitkan..."); setPesan(null); setSukses(null);
    try {
      const r = await panggil("/api/admin/arsip-mentah/publish", {
        batchId: hasilUnggah.batchId, hitungUlang,
      });
      if (hitungUlang && r.hitung) {
        setSukses(
          `Arsip periode ${namaPeriode(hasilUnggah.periode)} diterbitkan dan dihitung ulang: ` +
          `${r.hitung.indikator} indikator, ${r.hitung.baris} baris KPI, ${r.hitung.insentif} baris insentif` +
          (r.hitung.gagal?.length ? `, ${r.hitung.gagal.length} gagal (lihat log admin).` : "."));
      } else {
        setSukses(
          `Arsip periode ${namaPeriode(hasilUnggah.periode)} diterbitkan. ` +
          `Pemicuan hitung ulang bisa dilakukan kapan saja lewat tombol "Hitung ulang" di baris batch ini.`);
      }
      setHasilUnggah(null);
      setKonfirmasiTerbit(false);
      setHitungUlang(false);
      await segarkan();
    } catch (e: any) {
      setPesan(e.message);
    } finally {
      setSibuk(null);
    }
  }

  async function hitungUlangBatch(b: Batch) {
    if (!confirm(
      `Hitung ulang KPI dan insentif periode ${namaPeriode(b.periode)} memakai arsip ini?\n\n` +
      "Ini akan MENIMPA angka KPI/insentif periode tersebut dengan hasil terbaru — " +
      "termasuk kalau ada rumus indikator yang baru saja diubah. Pastikan sudah yakin.")) return;
    setSibuk("Menghitung ulang..."); setPesan(null); setSukses(null);
    try {
      const r = await panggil("/api/admin/arsip-mentah/publish", { batchId: b.id, hitungUlang: true });
      setSukses(
        `Periode ${namaPeriode(b.periode)} dihitung ulang: ${r.hitung.indikator} indikator, ` +
        `${r.hitung.baris} baris KPI, ${r.hitung.insentif} baris insentif` +
        (r.hitung.gagal?.length ? `, ${r.hitung.gagal.length} gagal.` : "."));
      await segarkan();
    } catch (e: any) {
      setPesan(e.message);
    } finally {
      setSibuk(null);
    }
  }

  async function hapusBatch(b: Batch) {
    if (!confirm(`Hapus batch "${b.nama_file}" (periode ${namaPeriode(b.periode)})?`)) return;
    setSibuk("Menghapus..."); setPesan(null);
    try {
      await panggil("/api/admin/arsip-mentah/hapus", { batchId: b.id });
      await segarkan();
    } catch (e: any) {
      setPesan(e.message);
    } finally {
      setSibuk(null);
    }
  }

  return (
    <div className="wz">
      <JudulHalaman
        eyebrow="Supporting"
        meta={`Template saat ini: ${jumlahKolom} kolom`}
        judul="Arsip Data Mentah"
        deskripsi={
          <>
            Data mentah dari API hanya menyimpan snapshot HARI INI — begitu bulan berganti,
            data bulan lalu hilang. Unggah arsip akhir bulan di sini supaya periode itu tetap
            bisa <b>dihitung ulang</b> nanti kalau ada rumus indikator yang diperbaiki.
          </>
        }
        aksi={
          <a className="btn ghost" href="/api/admin/arsip-mentah/template" download>
            <Ikon nama="download" ukuran={16} /> Unduh Template Excel
          </a>
        }
      />

      {pesan && (
        <div className="alert-box bad mb" role="alert">
          <span className="alert-ikon" aria-hidden>✕</span>
          <span>{pesan}</span>
          <button className="alert-tutup" aria-label="Tutup pesan" onClick={() => setPesan(null)}>×</button>
        </div>
      )}
      {sukses && (
        <div className="alert-box good mb" role="status">
          <span className="alert-ikon" aria-hidden>✓</span>
          <span>{sukses}</span>
          <button className="alert-tutup" aria-label="Tutup pesan" onClick={() => setSukses(null)}>×</button>
        </div>
      )}

      {sibuk && (
        <div className="card wz-progres" aria-live="polite">
          <div className="wz-progres-atas">
            <span className="wz-berkas-ikon"><Ikon nama="sheet" ukuran={22} /></span>
            <div className="wz-progres-teks"><b>{sibuk}</b></div>
            {progres > 0 && <span className="wz-persen num">{Math.round(progres)}%</span>}
            <span className="wz-spin" aria-hidden />
          </div>
          <div className="wz-bar"><i style={{ width: `${progres || 8}%` }} className={progres ? "" : "jalan"} /></div>
        </div>
      )}

      {!sibuk && !hasilUnggah && (
        <div className="card wz-kartu">
          <div className="wz-kartu-kepala">
            <h3>Unggah arsip akhir bulan</h3>
            <p className="muted small">
              Isi template dengan data mentah akhir bulan (dari sistem sumber, mis. CONFINS),
              lalu unggah di sini. Header kolom harus persis seperti template.
            </p>
          </div>
          <div className="wz-kartu-isi">
            <div className="wz-pengaturan">
              <label className="field">
                <span>Periode data (akhir bulan)</span>
                <input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} />
              </label>
            </div>

            <label className="wz-drop"
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => {
                     e.preventDefault();
                     const f = e.dataTransfer.files?.[0];
                     if (f) pilihBerkas(f);
                   }}>
              <input type="file" accept=".xlsx,.xls" hidden
                     onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pilihBerkas(f); }} />
              <span className="wz-drop-ikon"><Ikon nama="upload" ukuran={26} /></span>
              <h3>Tarik berkas Excel ke sini</h3>
              <p className="muted">atau <b className="lnk">klik untuk memilih</b> dari komputer</p>
              <div className="wz-format">
                <span>.XLSX</span><span>.XLS</span><span>Maks. {BATAS_MB} MB</span>
              </div>
            </label>
          </div>
        </div>
      )}

      {!sibuk && hasilUnggah && (
        <div className="card wz-kartu wz-terbit">
          <span className="wz-terbit-ikon"><Ikon nama="checkCircle" ukuran={26} /></span>
          <h3>Berkas periode {namaPeriode(hasilUnggah.periode)} sudah dibaca</h3>
          <dl className="wz-terbit-rinci">
            <div><dt>Total baris</dt><dd className="num">{hasilUnggah.totalBaris.toLocaleString("id-ID")}</dd></div>
            <div><dt>Valid</dt><dd className="num">{hasilUnggah.barisValid.toLocaleString("id-ID")}</dd></div>
            <div><dt>Ditolak</dt><dd className="num">{hasilUnggah.barisDitolak.toLocaleString("id-ID")}</dd></div>
          </dl>
          {hasilUnggah.contohTolak.length > 0 && (
            <div className="alert-box warn mb">
              <span className="alert-ikon" aria-hidden>!</span>
              <div>
                <b>Contoh baris yang ditolak:</b>
                <ul>{hasilUnggah.contohTolak.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            </div>
          )}

          <label className="wz-berkas-ikon" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
            <input type="checkbox" checked={hitungUlang} onChange={(e) => setHitungUlang(e.target.checked)} />
            <span className="small">
              Hitung ulang KPI &amp; insentif periode ini segera setelah diterbitkan
            </span>
          </label>
          {hitungUlang && (
            <label className="wz-berkas-ikon" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" checked={konfirmasiTerbit} onChange={(e) => setKonfirmasiTerbit(e.target.checked)} />
              <span className="small">
                Saya paham ini akan <b>menimpa</b> angka KPI/insentif periode {namaPeriode(hasilUnggah.periode)}
                {" "}yang mungkin sudah dibayarkan.
              </span>
            </label>
          )}

          <div className="wz-kaki tengah">
            <button className="btn ghost" onClick={() => setHasilUnggah(null)}>Batalkan</button>
            <button className="btn good" onClick={terbitkan}
                    disabled={hasilUnggah.barisValid === 0 || (hitungUlang && !konfirmasiTerbit)}>
              <Ikon nama="check" ukuran={16} tebal={2.4} /> Terbitkan
              {hitungUlang ? " & hitung ulang" : ""}
            </button>
          </div>
        </div>
      )}

      <div className="card wz-kartu" style={{ marginTop: 20 }}>
        <div className="wz-kartu-kepala">
          <h3>Riwayat arsip</h3>
          <p className="muted small">Hanya satu batch bisa aktif ("Aktif") per periode.</p>
        </div>
        {muat ? (
          <p className="muted small" style={{ padding: 16 }}>Memuat...</p>
        ) : batch.length === 0 ? (
          <p className="muted small" style={{ padding: 16 }}>Belum ada arsip yang diunggah.</p>
        ) : (
          <div className="tabel-scroll">
            <table className="wz-map">
              <thead>
                <tr>
                  <th>Periode</th><th>Berkas</th><th>Status</th>
                  <th>Baris</th><th>Diunggah</th><th aria-label="aksi" />
                </tr>
              </thead>
              <tbody>
                {batch.map((b) => (
                  <tr key={b.id}>
                    <td>{namaPeriode(b.periode)}</td>
                    <td>{b.nama_file}</td>
                    <td><span className={CHIP_STATUS[b.status]}>{LABEL_STATUS[b.status]}</span></td>
                    <td className="num">
                      {b.baris_valid.toLocaleString("id-ID")}
                      {b.baris_ditolak > 0 && <span className="faint"> ({b.baris_ditolak} ditolak)</span>}
                    </td>
                    <td className="small muted">{waktu(b.diunggah_pada)}</td>
                    <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {b.status === "published" && (
                        <button className="btn ghost sm" onClick={() => hitungUlangBatch(b)}>
                          Hitung ulang
                        </button>
                      )}
                      {b.status !== "published" && (
                        <button className="btn ghost sm" onClick={() => hapusBatch(b)}>
                          Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
