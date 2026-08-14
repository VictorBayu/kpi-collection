"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";

type FieldDef = { key: string; label: string; required: boolean };
type Tally = { total_baris: number; baris_valid: number; baris_warning: number; baris_ditolak: number };
type Issue = { baris: number; kolom: string | null; tingkat: "warning" | "error"; pesan: string };

const LANGKAH = ["Pilih berkas", "Cocokkan kolom", "Tinjau temuan", "Terbitkan"];

export default function ImportWizard() {
  const [step, setStep] = useState(0);
  const [pesanGalat, setPesanGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [progres, setProgres] = useState(0);

  const [periode, setPeriode] = useState(bulanIni());
  const [tipe, setTipe] = useState<"kpi" | "insentif">("kpi");
  const [namaFile, setNamaFile] = useState("");

  const [batchId, setBatchId] = useState<string>();
  const [headers, setHeaders] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [totalRows, setTotalRows] = useState(0);
  const [tally, setTally] = useState<Tally>();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [hasilTerbit, setHasilTerbit] = useState<{ barisTerbit: number; karyawanTerdampak: number }>();

  /* ---------------- langkah 1: unggah + baca ---------------- */
  async function pilihBerkas(file: File) {
    setPesanGalat(null);
    setNamaFile(file.name);
    try {
      setSibuk("Mengunggah berkas...");
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/import/upload",
        onUploadProgress: ({ percentage }) => setProgres(percentage),
      });

      setSibuk("Membaca isi berkas...");
      const r = await panggil("/api/import/parse", {
        blobUrl: blob.url, namaFile: file.name, periode, tipe,
      });

      setBatchId(r.batchId);
      setHeaders(r.headers);
      setFields(r.fields);
      setMapping(r.mapping);
      setTotalRows(r.totalRows);
      setStep(1);
    } catch (e: any) {
      setPesanGalat(e.message);
    } finally {
      setSibuk(null);
      setProgres(0);
    }
  }

  /* ---------------- langkah 2-3: periksa bertahap ---------------- */
  async function jalankanPemeriksaan() {
    setPesanGalat(null);
    const kurang = fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
    if (kurang.length) {
      setPesanGalat(`Kolom wajib belum dicocokkan: ${kurang.join(", ")}.`);
      return;
    }

    try {
      let offset = 0;
      let selesai = false;
      let diperiksa = 0;

      while (!selesai) {
        setSibuk(`Memeriksa ${diperiksa.toLocaleString("id-ID")} dari ${totalRows.toLocaleString("id-ID")} baris...`);
        const r = await panggil("/api/import/validate", { batchId, mapping, offset });
        offset = r.nextOffset;
        selesai = r.selesai;
        diperiksa += r.diproses;
        setProgres(Math.min(100, (diperiksa / Math.max(1, totalRows)) * 100));
        setTally(r.tally);
      }

      const d = await fetch(`/api/import/batches?batchId=${batchId}`).then((x) => x.json());
      setIssues(d.issues ?? []);
      setStep(2);
    } catch (e: any) {
      setPesanGalat(e.message);
    } finally {
      setSibuk(null);
      setProgres(0);
    }
  }

  /* ---------------- langkah 4: terbitkan ---------------- */
  async function terbitkan() {
    setPesanGalat(null);
    try {
      setSibuk("Menerbitkan...");
      const r = await panggil("/api/import/publish", { batchId });
      setHasilTerbit(r);
    } catch (e: any) {
      setPesanGalat(e.message);
    } finally {
      setSibuk(null);
    }
  }

  function ulangi() {
    setStep(0); setBatchId(undefined); setTally(undefined);
    setIssues([]); setHasilTerbit(undefined); setPesanGalat(null); setNamaFile("");
  }

  /* ---------------- tampilan ---------------- */
  return (
    <div>
      <ol className="steps">
        {LANGKAH.map((t, i) => (
          <li key={t} className={i === step ? "step active" : i < step ? "step done" : "step"}>
            <span className="n">{i + 1}</span><span className="t">{t}</span>
          </li>
        ))}
      </ol>

      {pesanGalat && (
        <div className="banner warn" role="alert">
          <b>Belum bisa dilanjutkan</b>{pesanGalat}
        </div>
      )}

      {sibuk && (
        <div className="card card-pad">
          <div className="rowbetween"><b>{namaFile || "Memproses"}</b><span className="muted">{sibuk}</span></div>
          <div className="progress"><i style={{ width: `${progres}%` }} /></div>
          <p className="faint">Anda bisa membatalkan kapan saja sebelum langkah terakhir.</p>
        </div>
      )}

      {/* langkah 1 */}
      {step === 0 && !sibuk && (
        <div>
          <div className="rowgap">
            <label className="field">
              <span>Periode data</span>
              <input type="month" value={periode.slice(0, 7)}
                     onChange={(e) => setPeriode(e.target.value + "-01")} />
            </label>
            <label className="field">
              <span>Jenis data</span>
              <select value={tipe} onChange={(e) => setTipe(e.target.value as any)}>
                <option value="kpi">Perhitungan KPI</option>
                <option value="insentif">Perhitungan insentif</option>
              </select>
            </label>
          </div>

          <label className="drop"
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => {
                   e.preventDefault();
                   const f = e.dataTransfer.files?.[0];
                   if (f) pilihBerkas(f);
                 }}>
            <input type="file" accept=".xlsx,.xls" hidden
                   onChange={(e) => e.target.files?.[0] && pilihBerkas(e.target.files[0])} />
            <h3>Tarik berkas Excel ke sini</h3>
            <p className="muted">atau klik untuk memilih · .xlsx atau .xls · maksimal 20 MB</p>
            <p className="faint">Gunakan sheet <code>KPI Calculation</code> seperti biasa. Sheet dikenali otomatis.</p>
          </label>
        </div>
      )}

      {/* langkah 2 */}
      {step === 1 && !sibuk && (
        <div>
          <div className="banner info">
            <b>Terbaca {totalRows.toLocaleString("id-ID")} baris</b>
            Kolom yang dikenali sudah terisi otomatis. Periksa kolom yang masih kosong di bawah.
          </div>
          <div className="card card-pad">
            {fields.map((f) => (
              <div className="maprow" key={f.key}>
                <span className="lbl">
                  {f.label} {f.required && <em title="wajib">wajib</em>}
                </span>
                <span className="arw">←</span>
                <select value={mapping[f.key] ?? ""}
                        className={f.required && !mapping[f.key] ? "kosong" : ""}
                        onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                  <option value="">Belum dicocokkan</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div className="actions">
              <button className="btn" onClick={jalankanPemeriksaan}>Periksa {totalRows.toLocaleString("id-ID")} baris</button>
              <button className="btn ghost" onClick={ulangi}>Batalkan</button>
            </div>
          </div>
        </div>
      )}

      {/* langkah 3 */}
      {step === 2 && !sibuk && tally && (
        <div>
          <div className="tally">
            <div className="card card-pad">
              <span className="eyebrow">Siap diterbitkan</span>
              <b className="v good">{Number(tally.baris_valid).toLocaleString("id-ID")}</b>
              <p className="faint">baris lolos pemeriksaan</p>
            </div>
            <div className="card card-pad">
              <span className="eyebrow">Perlu dicek</span>
              <b className="v warn">{Number(tally.baris_warning).toLocaleString("id-ID")}</b>
              <p className="faint">tetap terbit, tandai jika perlu</p>
            </div>
            <div className="card card-pad">
              <span className="eyebrow">Ditolak</span>
              <b className="v bad">{Number(tally.baris_ditolak).toLocaleString("id-ID")}</b>
              <p className="faint">tidak ikut terbit</p>
            </div>
          </div>

          <div className="card">
            <div className="cardhead">
              <h3>Temuan pemeriksaan</h3>
              <p className="muted">Nomor baris merujuk ke baris di berkas Excel Anda.</p>
            </div>
            {issues.length === 0
              ? <p className="empty">Tidak ada temuan. Semua baris bersih.</p>
              : issues.slice(0, 50).map((i, n) => (
                  <div className="issue" key={n}>
                    <span className={i.tingkat === "error" ? "tag err" : "tag wrn"}>
                      {i.tingkat === "error" ? "DITOLAK" : "DICEK"}
                    </span>
                    <span className="row">Baris {i.baris}</span>
                    <span>{i.pesan}</span>
                  </div>
                ))}
            {issues.length > 50 && (
              <p className="faint pad">{issues.length - 50} temuan lain tidak ditampilkan.{" "}
                <a href={`/api/import/batches?batchId=${batchId}`} download>Unduh semuanya</a>
              </p>
            )}
          </div>

          <div className="actions">
            <button className="btn" onClick={() => setStep(3)}
                    disabled={Number(tally.baris_valid) === 0}>
              Lanjut ke penerbitan
            </button>
            <button className="btn ghost" onClick={ulangi}>Perbaiki berkas dulu</button>
          </div>
        </div>
      )}

      {/* langkah 4 */}
      {step === 3 && !sibuk && !hasilTerbit && tally && (
        <div className="card card-pad narrow">
          <h3>Terbitkan data periode {namaPeriode(periode)}</h3>
          <p className="muted">
            Setelah diterbitkan, {Number(tally.baris_valid).toLocaleString("id-ID")} baris ini
            menjadi data yang dilihat karyawan. Batch sebelumnya tetap tersimpan dan bisa
            diaktifkan kembali kapan saja.
          </p>
          <div className="actions">
            <button className="btn good" onClick={terbitkan}>Terbitkan sekarang</button>
            <button className="btn ghost" onClick={() => setStep(2)}>Kembali ke temuan</button>
          </div>
        </div>
      )}

      {hasilTerbit && (
        <div className="banner good">
          <b>Data {namaPeriode(periode)} sudah terbit</b>
          {hasilTerbit.barisTerbit.toLocaleString("id-ID")} baris aktif untuk{" "}
          {hasilTerbit.karyawanTerdampak.toLocaleString("id-ID")} karyawan.
          <div className="actions">
            <button className="btn ghost sm" onClick={ulangi}>Unggah berkas lain</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- utilitas ---------------- */
async function panggil(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Terjadi gangguan. Coba lagi sebentar.");
  return data;
}

function bulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function namaPeriode(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
