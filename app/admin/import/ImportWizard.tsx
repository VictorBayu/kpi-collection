"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import Ikon from "@/components/Ikon";

type FieldDef = { key: string; label: string; required: boolean };
type Tally = { total_baris: number; baris_valid: number; baris_warning: number; baris_ditolak: number };
type Issue = { baris: number; kolom: string | null; tingkat: "warning" | "error"; pesan: string };

const LANGKAH = ["Pilih berkas", "Cocokkan kolom", "Tinjau temuan", "Terbitkan"];

/** Sama dengan batas di /api/import/upload — dicek lebih dulu di browser
 *  supaya admin tidak menunggu unggahan besar yang pasti ditolak. */
const BATAS_MB = 20;
const FORMAT_OK = /\.(xlsx|xls)$/i;

type Tolak = { jenis: "format" | "ukuran"; nama: string; ukuran: number };

function ukuranTeks(b: number) {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function ImportWizard() {
  const [step, setStep] = useState(0);
  const [pesanGalat, setPesanGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [progres, setProgres] = useState(0);

  const [periode, setPeriode] = useState(bulanIni());
  const [tipe, setTipe] = useState<"kpi" | "insentif">("kpi");
  const [namaFile, setNamaFile] = useState("");
  const [ukuranFile, setUkuranFile] = useState(0);
  const [tolak, setTolak] = useState<Tolak | null>(null);

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
    setTolak(null);
    if (!FORMAT_OK.test(file.name)) {
      setTolak({ jenis: "format", nama: file.name, ukuran: file.size });
      return;
    }
    if (file.size > BATAS_MB * 1024 * 1024) {
      setTolak({ jenis: "ukuran", nama: file.name, ukuran: file.size });
      return;
    }
    setNamaFile(file.name);
    setUkuranFile(file.size);
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
    setUkuranFile(0); setTolak(null);
  }

  /* ---------------- tampilan ---------------- */
  const wajibKosong = fields.filter((f) => f.required && !mapping[f.key]).length;
  const cocok = fields.filter((f) => mapping[f.key]).length;
  const ekstensi = (n: string) => (n.split(".").pop() ?? "").toUpperCase();

  return (
    <div className="wz">
      <ol className="wz-langkah" aria-label="Langkah unggah">
        {LANGKAH.map((t, i) => {
          const status = hasilTerbit ? "done" : i === step ? "active" : i < step ? "done" : "";
          return (
            <li key={t} className={"wz-l " + status} aria-current={i === step ? "step" : undefined}>
              <span className="wz-n">{status === "done" ? <Ikon nama="check" ukuran={14} tebal={2.6} /> : i + 1}</span>
              <span className="wz-t"><small>Langkah {i + 1}</small>{t}</span>
            </li>
          );
        })}
      </ol>

      {pesanGalat && (
        <div className="alert-box bad mb" role="alert">
          <span className="alert-ikon" aria-hidden>✕</span>
          <span><b>Gagal memproses data.</b> {pesanGalat}</span>
          <button className="alert-tutup" aria-label="Tutup pesan" onClick={() => setPesanGalat(null)}>×</button>
        </div>
      )}

      {sibuk && (
        <div className="card wz-progres" aria-live="polite">
          <div className="wz-progres-atas">
            <span className="wz-berkas-ikon"><Ikon nama="sheet" ukuran={22} /></span>
            <div className="wz-progres-teks">
              <b>{namaFile || "Memproses"}</b>
              <span className="muted small">
                {ukuranFile ? `${ukuranTeks(ukuranFile)} · ` : ""}{sibuk}
              </span>
            </div>
            {progres > 0 && <span className="wz-persen num">{Math.round(progres)}%</span>}
            <span className="wz-spin" aria-hidden />
          </div>
          <div className="wz-bar"><i style={{ width: `${progres || 8}%` }} className={progres ? "" : "jalan"} /></div>
          <p className="faint small">Mohon tunggu hingga proses selesai. Data karyawan belum berubah sampai langkah terakhir.</p>
        </div>
      )}

      {/* langkah 1 */}
      {step === 0 && !sibuk && (
        <div className="card wz-kartu">
          <div className="wz-kartu-kepala">
            <h3>Pilih berkas & periode</h3>
            <p className="muted small">Periode dan jenis data menentukan ke mana baris-baris ini diterbitkan.</p>
          </div>
          <div className="wz-kartu-isi">
            <div className="wz-pengaturan">
              <label className="field">
                <span>Periode data</span>
                <input type="month" value={periode.slice(0, 7)}
                       onChange={(e) => setPeriode(e.target.value + "-01")} />
              </label>
              <div className="field">
                <span>Jenis data</span>
                <div className="wz-segmen" role="radiogroup" aria-label="Jenis data">
                  {([["kpi", "Perhitungan KPI"], ["insentif", "Perhitungan insentif"]] as const).map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={tipe === v}
                            className={tipe === v ? "on" : ""} onClick={() => setTipe(v)}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            {tolak && (
              <div className="wz-tolak" role="alert">
                <span className="wz-tolak-ikon"><Ikon nama="alert" ukuran={20} /></span>
                <div className="wz-tolak-teks">
                  <div className="wz-tolak-judul">
                    <h4>{tolak.jenis === "format" ? "Format berkas tidak didukung" : "Ukuran berkas terlalu besar"}</h4>
                    <span className="wz-tolak-lencana num">
                      {tolak.jenis === "format" ? `.${ekstensi(tolak.nama) || "?"} ditolak` : ukuranTeks(tolak.ukuran)}
                    </span>
                  </div>
                  <p>
                    Berkas <b>{tolak.nama}</b>{" "}
                    {tolak.jenis === "format"
                      ? "tidak dapat diunggah. Sistem hanya menerima berkas Excel .xlsx atau .xls."
                      : `berukuran ${ukuranTeks(tolak.ukuran)}, melebihi batas ${BATAS_MB} MB.`}
                  </p>
                </div>
                <button className="alert-tutup" aria-label="Tutup pemberitahuan" onClick={() => setTolak(null)}>×</button>
              </div>
            )}

            <label className={"wz-drop" + (tolak ? " galat" : "")}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => {
                     e.preventDefault();
                     const f = e.dataTransfer.files?.[0];
                     if (f) pilihBerkas(f);
                   }}>
              <input type="file" accept=".xlsx,.xls" hidden
                     onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pilihBerkas(f); }} />
              <span className="wz-drop-ikon"><Ikon nama="upload" ukuran={26} /></span>
              <h3>{tolak ? "Pilih berkas lain" : "Tarik berkas Excel ke sini"}</h3>
              <p className="muted">atau <b className="lnk">klik untuk memilih</b> dari komputer</p>
              <div className="wz-format">
                <span>.XLSX</span><span>.XLS</span><span>Maks. {BATAS_MB} MB</span>
              </div>
              <p className="faint small">Gunakan sheet <code>KPI Calculation</code> seperti biasa. Sheet dikenali otomatis.</p>
            </label>
          </div>
        </div>
      )}

      {/* langkah 2 */}
      {step === 1 && !sibuk && (
        <div>
          <div className="wz-sukses-berkas">
            <span className="wz-berkas-ikon good"><Ikon nama="checkCircle" ukuran={22} /></span>
            <div>
              <h4>Berkas berhasil dibaca <span className="wz-lencana good">Siap dicocokkan</span></h4>
              <p>
                <b>{namaFile}</b>{ukuranFile ? ` (${ukuranTeks(ukuranFile)})` : ""} — terbaca{" "}
                <b className="num">{totalRows.toLocaleString("id-ID")}</b> baris. Kolom yang dikenali sudah terisi otomatis.
              </p>
            </div>
          </div>

          <div className="card wz-kartu">
            <div className="wz-kartu-kepala baris">
              <div>
                <h3>Cocokkan kolom</h3>
                <p className="muted small">Pasangkan kolom di berkas Excel dengan kolom sistem.</p>
              </div>
              <div className="wz-ringkas-cocok">
                <span className="wz-lencana good num">{cocok}/{fields.length} cocok</span>
                {wajibKosong > 0 && <span className="wz-lencana bad num">{wajibKosong} wajib kosong</span>}
              </div>
            </div>
            <div className="tabel-scroll">
              <table className="wz-map">
                <thead>
                  <tr><th>Kolom sistem</th><th aria-label="arah" /><th>Kolom di berkas Excel</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {fields.map((f) => {
                    const terisi = !!mapping[f.key];
                    return (
                      <tr key={f.key} className={f.required && !terisi ? "kosong" : ""}>
                        <td>
                          <span className="wz-map-lbl">{f.label}</span>
                          {f.required && <span className="wz-wajib">wajib</span>}
                        </td>
                        <td className="wz-map-panah"><Ikon nama="arrowRight" ukuran={16} /></td>
                        <td>
                          <select value={mapping[f.key] ?? ""}
                                  className={f.required && !terisi ? "kosong" : ""}
                                  aria-label={`Kolom Excel untuk ${f.label}`}
                                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                            <option value="">Belum dicocokkan</option>
                            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </td>
                        <td>
                          {terisi
                            ? <span className="chip k5">Cocok</span>
                            : f.required ? <span className="chip k0">Belum dicocokkan</span>
                            : <span className="chip">Opsional</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="wz-kaki">
              <button className="btn ghost" onClick={ulangi}>Batalkan</button>
              <button className="btn" onClick={jalankanPemeriksaan}>
                Periksa {totalRows.toLocaleString("id-ID")} baris <Ikon nama="arrowRight" ukuran={16} tebal={2.2} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* langkah 3 */}
      {step === 2 && !sibuk && tally && (
        <div>
          <div className="wz-tally">
            <div className="wz-tally-k good">
              <span className="km-ikon good"><Ikon nama="checkCircle" ukuran={20} /></span>
              <div>
                <span className="km-label">Valid · siap terbit</span>
                <b className="num">{Number(tally.baris_valid).toLocaleString("id-ID")}</b>
                <small>baris lolos pemeriksaan</small>
              </div>
            </div>
            <div className="wz-tally-k warn">
              <span className="km-ikon warn"><Ikon nama="alert" ukuran={20} /></span>
              <div>
                <span className="km-label">Perlu dicek</span>
                <b className="num">{Number(tally.baris_warning).toLocaleString("id-ID")}</b>
                <small>tetap terbit, tandai jika perlu</small>
              </div>
            </div>
            <div className="wz-tally-k bad">
              <span className="km-ikon bad"><Ikon nama="trash" ukuran={20} /></span>
              <div>
                <span className="km-label">Ditolak</span>
                <b className="num">{Number(tally.baris_ditolak).toLocaleString("id-ID")}</b>
                <small>tidak ikut terbit</small>
              </div>
            </div>
          </div>

          <div className="card wz-kartu">
            <div className="wz-kartu-kepala">
              <h3>Temuan pemeriksaan</h3>
              <p className="muted small">Nomor baris merujuk ke baris di berkas Excel Anda.</p>
            </div>
            {issues.length === 0
              ? <div className="wz-bersih"><Ikon nama="checkCircle" ukuran={22} /> Tidak ada temuan. Semua baris bersih.</div>
              : <IssuePager issues={issues} batchId={batchId} />}
            <div className="wz-kaki">
              <button className="btn ghost" onClick={ulangi}>Perbaiki berkas dulu</button>
              <button className="btn" onClick={() => setStep(3)}
                      disabled={Number(tally.baris_valid) === 0}>
                Lanjut ke penerbitan <Ikon nama="arrowRight" ukuran={16} tebal={2.2} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* langkah 4 */}
      {step === 3 && !sibuk && !hasilTerbit && tally && (
        <div className="card wz-kartu wz-terbit">
          <span className="wz-terbit-ikon"><Ikon nama="upload" ukuran={26} /></span>
          <h3>Terbitkan data periode {namaPeriode(periode)}</h3>
          <p className="muted">
            Setelah diterbitkan, <b className="num">{Number(tally.baris_valid).toLocaleString("id-ID")}</b> baris ini
            menjadi data yang dilihat karyawan. Batch sebelumnya tetap tersimpan dan bisa
            diaktifkan kembali kapan saja.
          </p>
          <dl className="wz-terbit-rinci">
            <div><dt>Berkas</dt><dd>{namaFile || "—"}</dd></div>
            <div><dt>Jenis</dt><dd>{tipe === "kpi" ? "Perhitungan KPI" : "Perhitungan insentif"}</dd></div>
            <div><dt>Perlu dicek</dt><dd className="num">{Number(tally.baris_warning).toLocaleString("id-ID")}</dd></div>
            <div><dt>Ditolak</dt><dd className="num">{Number(tally.baris_ditolak).toLocaleString("id-ID")}</dd></div>
          </dl>
          <div className="wz-kaki tengah">
            <button className="btn ghost" onClick={() => setStep(2)}>Kembali ke temuan</button>
            <button className="btn good" onClick={terbitkan}>
              <Ikon nama="check" ukuran={16} tebal={2.4} /> Terbitkan sekarang
            </button>
          </div>
        </div>
      )}

      {hasilTerbit && (
        <div className="card wz-kartu wz-terbit sukses" role="status">
          <span className="wz-terbit-ikon good"><Ikon nama="checkCircle" ukuran={30} /></span>
          <span className="wz-lencana good">Batch aktif</span>
          <h3>Data {namaPeriode(periode)} sudah terbit</h3>
          <p className="muted">Perubahan berhasil disimpan: batch baru telah diperbarui dan aktif.</p>
          <div className="wz-hasil">
            <div><b className="num">{hasilTerbit.barisTerbit.toLocaleString("id-ID")}</b><span>baris aktif</span></div>
            <div><b className="num">{hasilTerbit.karyawanTerdampak.toLocaleString("id-ID")}</b><span>karyawan terdampak</span></div>
          </div>
          <div className="wz-kaki tengah">
            <a className="btn ghost" href="/admin/riwayat">Lihat riwayat impor</a>
            <button className="btn" onClick={ulangi}>Unggah berkas lain</button>
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

/* ---------------- daftar temuan dengan paginasi 10 per halaman ---------------- */
function IssuePager({ issues, batchId }: { issues: Issue[]; batchId?: string }) {
  const PER = 10;
  const [hal, setHal] = useState(0);
  const totalHal = Math.ceil(issues.length / PER);
  const mulai = hal * PER;
  const tampil = issues.slice(mulai, mulai + PER);

  return (
    <>
      {tampil.map((i, n) => (
        <div className="issue wz-temuan" key={mulai + n}>
          <span className={i.tingkat === "error" ? "chip k0" : "chip k3"}>
            {i.tingkat === "error" ? "Ditolak" : "Dicek"}
          </span>
          <span className="row num">Baris {i.baris}</span>
          {i.kolom && <code className="wz-kolom">{i.kolom}</code>}
          <span>{i.pesan}</span>
        </div>
      ))}

      <div className="pager">
        <span className="faint">
          Menampilkan {mulai + 1}–{Math.min(mulai + PER, issues.length)} dari {issues.length} temuan
        </span>
        <div className="pager-btns">
          <button className="btn ghost sm" disabled={hal === 0}
                  onClick={() => setHal((h) => Math.max(0, h - 1))}>← Sebelumnya</button>
          <span className="pager-num">Hal {hal + 1}/{totalHal}</span>
          <button className="btn ghost sm" disabled={hal >= totalHal - 1}
                  onClick={() => setHal((h) => Math.min(totalHal - 1, h + 1))}>Berikutnya →</button>
          {batchId && (
            <a className="btn ghost sm" href={`/api/import/batches?batchId=${batchId}`} download>
              Unduh semua (CSV)
            </a>
          )}
        </div>
      </div>
    </>
  );
}
