"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import KotakCari from "@/components/KotakCari";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

type Kolom = { kolom: string; label: string; jenis: string };
type Baris = {
  id: number; agreement_no: string; aktif: boolean;
  catatan: string | null; ditarik_pada: string; [k: string]: any;
};
type Riwayat = {
  id: number; nama_file: string | null; kolom_diisi: string[] | null;
  baris_masuk: number; baris_tolak: number; dibuat_pada: string;
  baris_aktif: number;
};

/**
 * Data pendukung — unggah dan kelola.
 *
 * Data ini masuk lewat berkas yang disiapkan manusia, jadi keliru itu
 * wajar: berkas tertukar, angka salah kolom, atau data lama yang seharusnya
 * berhenti dipakai. Karena itu barisnya bisa dinonaktifkan, bukan hanya
 * dihapus — menonaktifkan menghentikan angkanya dipakai perhitungan sambil
 * menyisakan jejak apa yang pernah masuk, dan itu yang dibutuhkan saat
 * seseorang bertanya kenapa angkanya berubah.
 */
export default function Client() {
  const [kolom, setKolom] = useState<Kolom[]>([]);
  const [baris, setBaris] = useState<Baris[]>([]);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [ringkas, setRingkas] = useState<{ baris?: number; aktif?: number; terakhir?: string }>({});
  const [total, setTotal] = useState(0);
  const [perHal, setPerHal] = useState(5);

  const [hal, setHal] = useState(0);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [seret, setSeret] = useState(false);
  const [sunting, setSunting] = useState<Baris | null>(null);
  const [hapusNomor, setHapusNomor] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const segarkan = useCallback(async () => {
    const p = new URLSearchParams({ hal: String(hal), cari, saring });
    const r = await fetch(`/api/admin/pendukung?${p}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat."); return; }
    setKolom(j.kolom ?? []); setBaris(j.baris ?? []);
    setRiwayat(j.riwayat ?? []); setRingkas(j.ringkas ?? {});
    setTotal(j.total ?? 0); setPerHal(j.perHal ?? 5);
  }, [hal, cari, saring]);

  useEffect(() => { segarkan(); }, [segarkan]);
  useEffect(() => { setHal(0); }, [cari, saring]);

  const halTotal = Math.max(1, Math.ceil(total / perHal));

  async function kirim(cara: string, badan?: unknown, url = "/api/admin/pendukung") {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(url, {
        method: cara,
        headers: badan ? { "content-type": "application/json" } : undefined,
        body: badan ? JSON.stringify(badan) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return false; }
      await segarkan();
      return true;
    } finally { setSibuk(false); }
  }

  async function unggah() {
    if (!berkas) return;
    setSibuk(true); setPesan(null);
    try {
      const fd = new FormData();
      fd.append("file", berkas);
      const r = await fetch("/api/admin/pendukung", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal mengunggah."); return; }
      setPesan(
        `Berhasil — ${j.masuk} kontrak masuk` +
        (j.ditolak ? `, ${j.ditolak} baris tanpa nomor kontrak diabaikan` : "") +
        `. Kolom terisi: ${(j.kolom ?? []).join(", ")}.`);
      setBerkas(null);
      if (input.current) input.current.value = "";
      setHal(0);
      await segarkan();
    } finally { setSibuk(false); }
  }

  async function hapusPerNomor() {
    const nomor = hapusNomor.trim();
    if (!nomor) return;
    if (!confirm(`Hapus kontrak "${nomor}" dari data pendukung?`)) return;
    const ok = await kirim("DELETE", undefined,
      `/api/admin/pendukung?agreement_no=${encodeURIComponent(nomor)}`);
    if (ok) { setHapusNomor(""); setPesan(`Kontrak "${nomor}" dihapus.`); }
  }

  async function hapusBatch(r: Riwayat) {
    const label = r.nama_file ?? `unggahan #${r.id}`;
    if (!r.baris_aktif) {
      setPesan(`Tidak ada baris yang masih berasal dari "${label}" — sudah ditimpa unggahan lain atau sudah dihapus.`);
      return;
    }
    if (!confirm(
      `Hapus ${r.baris_aktif} baris dari "${label}"?\n\n` +
      `Hanya kontrak yang isinya masih berasal dari unggahan ini yang terhapus — ` +
      `kontrak yang sudah ditimpa unggahan berikutnya tidak ikut terhapus.`)) return;
    const ok = await kirim("DELETE", undefined, `/api/admin/pendukung?unggah_id=${r.id}`);
    if (ok) setPesan(`${r.baris_aktif} baris dari "${label}" dihapus.`);
  }

  const fmtNilai = (v: any, jenis: string) => {
    if (v === null || v === undefined || v === "") return "—";
    if (jenis === "angka") return Number(v).toLocaleString("id-ID");
    if (jenis === "tanggal") return new Date(v).toLocaleDateString("id-ID");
    return String(v);
  };

  const pesanOk = !!pesan && /Berhasil|Tersimpan|dihapus/.test(pesan);
  const tidakDipakai = (ringkas.baris ?? 0) - (ringkas.aktif ?? 0);
  const nomorHal = Array.from(new Set([0, hal - 1, hal, hal + 1, halTotal - 1]))
    .filter((i) => i >= 0 && i < halTotal).sort((a, b) => a - b);
  const ukuran = (n: number) => n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024)).toLocaleString("id-ID")} KB`
    : `${(n / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;

  async function simpanSunting() {
    if (!sunting) return;
    const nilai: Record<string, any> = {};
    for (const k of kolom) nilai[k.kolom] = sunting[k.kolom];
    const ok = await kirim("PUT", { id: sunting.id, aktif: sunting.aktif, catatan: sunting.catatan, nilai });
    if (ok) { setSunting(null); setPesan("Tersimpan."); }
  }

  return (
    <>
      <JudulHalaman
        eyebrow="Data & indikator"
        meta={<><TitikStatus nada={kolom.length ? "good" : "warn"} /> digabung lewat <span className="num">agreement_no</span></>}
        judul="Data Pendukung"
        deskripsi={<>Data tambahan yang digabung ke data API lewat <code className="ka-field">agreement_no</code>.
          Baris yang dinonaktifkan berhenti dipakai perhitungan.</>}
      />

      {pesan && !sunting && (
        <div className={"alert-box dp-pesan " + (pesanOk ? "good" : "bad")} role="status">
          <span className="alert-ikon">{pesanOk ? "✓" : "!"}</span>
          <span>{pesan}</span>
          <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
        </div>
      )}

      <div className="km-grid">
        <KartuMetrik label="Kontrak tersimpan" nilai={(ringkas.baris ?? 0).toLocaleString("id-ID")}
                     catatan={`${(ringkas.aktif ?? 0).toLocaleString("id-ID")} dipakai perhitungan`}
                     ikon={<Ikon nama="file" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Tidak dipakai" nilai={<span className={tidakDipakai ? "teks-bad" : ""}>{tidakDipakai.toLocaleString("id-ID")}</span>}
                     catatan="Dinonaktifkan dari perhitungan"
                     ikon={<Ikon nama="eyeOff" ukuran={20} />} nada={tidakDipakai ? "warn" : "netral"} />
        <KartuMetrik label="Pembaruan terakhir"
                     nilai={<span className="km-teks">{ringkas.terakhir
                       ? new Date(ringkas.terakhir).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                       : "—"}</span>}
                     catatan="Waktu unggah terakhir"
                     ikon={<Ikon nama="clock" ukuran={20} />} nada="good" />
        <KartuMetrik label="Kolom terdaftar" nilai={kolom.length} satuan="kolom"
                     catatan="Selain nomor kontrak"
                     ikon={<Ikon nama="columns" ukuran={20} />} nada={kolom.length ? "netral" : "warn"} />
      </div>

      {!kolom.length ? (
        <div className="sd-panduan dp-belum">
          <span className="sd-ikon warn"><Ikon nama="alert" ukuran={20} /></span>
          <div className="sd-panduan-teks">
            <h3>Belum siap menerima berkas</h3>
            <p>Belum ada kolom data pendukung yang terdaftar. Tambahkan dulu di CRUD Kolom API dengan memilih
              Sumber = “Data pendukung”.</p>
          </div>
          <div className="sd-panduan-aksi">
            <Link className="btn" href="/admin/kolom-api"><Ikon nama="columns" ukuran={16} /> Buka CRUD Kolom API</Link>
          </div>
        </div>
      ) : (
        <section className="card dp-unggah">
          <div className="rk-kartu-kepala">
            <span className="km-ikon accent"><Ikon nama="upload" ukuran={20} /></span>
            <div>
              <h2>Unggah berkas</h2>
              <p className="faint small">Nomor kontrak yang sudah ada diperbarui, bukan digandakan.</p>
            </div>
            <span className="dp-dikenali">Kolom dikenali: <b>{kolom.map((k) => k.label).join(", ")}</b></span>
          </div>

          <div className="dp-unggah-isi">
            {/* Area seret-lepas: cara yang paling sering dipakai orang untuk
                berkas, dan tetap menyediakan tombol bagi yang tidak menyeret. */}
            <div className={"dp-drop" + (seret ? " aktif" : "") + (berkas ? " terisi" : "")}
                 onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
                 onDragLeave={() => setSeret(false)}
                 onDrop={(e) => {
                   e.preventDefault(); setSeret(false);
                   const f = e.dataTransfer.files?.[0];
                   if (f) setBerkas(f);
                 }}
                 onClick={() => input.current?.click()}
                 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
                 role="button" tabIndex={0}>
              {berkas ? (
                <>
                  <span className="ri-xls" aria-hidden>{berkas.name.split(".").pop()?.toUpperCase().slice(0, 4)}</span>
                  <div className="dp-drop-teks">
                    <b>{berkas.name}</b>
                    <span className="num">{ukuran(berkas.size)} · klik untuk mengganti</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="dp-drop-ikon"><Ikon nama="upload" ukuran={22} /></span>
                  <b>Seret berkas ke sini</b>
                  <span>atau klik untuk memilih · <span className="num">.xlsx, .xls, .csv</span></span>
                </>
              )}
            </div>

            <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden
                   onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />

            <div className="dp-unggah-kaki">
              <span className="faint small">
                Berkas wajib punya kolom <b className="num">AGREEMENT_NO</b>. Baris tanpa nomor kontrak diabaikan.
              </span>
              <div className="dp-unggah-aksi">
                {berkas && (
                  <button className="btn ghost" disabled={sibuk}
                          onClick={() => { setBerkas(null); if (input.current) input.current.value = ""; }}>
                    Batal
                  </button>
                )}
                <button className="btn" disabled={sibuk || !berkas} onClick={unggah}>
                  <Ikon nama="upload" ukuran={16} /> {sibuk && berkas ? "Mengunggah…" : "Unggah dan simpan"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card pa-tabel-kartu dp-isi">
        <div className="pa-alat dp-alat">
          <div className="dp-alat-judul">
            <h2>Isi data pendukung</h2>
            <p className="pa-sub"><span className="num">{total.toLocaleString("id-ID")}</span> kontrak {cari || saring ? "cocok dengan penyaring" : "terdaftar"}.</p>
          </div>
          <div className="dp-alat-kanan">
            <KotakCari nilai={cari} onUbah={setCari} lebar={240} placeholder="Cari nomor kontrak…" />
            <div className="dp-hapus">
              <input value={hapusNomor} placeholder="Hapus nomor kontrak…" className="num"
                     onChange={(e) => setHapusNomor(e.target.value)}
                     onKeyDown={(e) => { if (e.key === "Enter") hapusPerNomor(); }} />
              <button className="btn tint-bad sm" disabled={sibuk || !hapusNomor.trim()} onClick={hapusPerNomor}>
                <Ikon nama="trash" ukuran={14} /> Hapus
              </button>
            </div>
          </div>
        </div>

        <div className="dp-tab" role="tablist">
          {[["", "Semua"], ["aktif", "Dipakai"], ["nonaktif", "Tidak dipakai"]].map(([v, t]) => (
            <button key={v} role="tab" aria-selected={saring === v} className={saring === v ? "on" : ""}
                    onClick={() => setSaring(v)}>{t}</button>
          ))}
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel dp-tabel">
            <thead>
              <tr>
                <th>Nomor kontrak</th>
                {kolom.map((k) => <th key={k.kolom} className={k.jenis === "angka" ? "r" : undefined}>{k.label}</th>)}
                <th>Status</th><th className="r">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.id} className={b.aktif ? "" : "mati"}>
                  <td>
                    <span className="dp-kontrak num">{b.agreement_no}</span>
                    {b.catatan && <div className="pa-sub">{b.catatan}</div>}
                  </td>
                  {kolom.map((k) => (
                    <td key={k.kolom} className={"num " + (k.jenis === "angka" ? "r" : "")}>{fmtNilai(b[k.kolom], k.jenis)}</td>
                  ))}
                  <td>
                    {b.aktif
                      ? <span className="pa-status good">dipakai</span>
                      : <span className="pa-status warn">tidak dipakai</span>}
                  </td>
                  <td className="r">
                    <div className="ri-aksi">
                      <button className={"btn sm " + (b.aktif ? "hati" : "pulih")} disabled={sibuk}
                              onClick={() => kirim("PUT", { id: b.id, aktif: !b.aktif, catatan: b.catatan, nilai: {} })}>
                        {b.aktif ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <button className="btn ghost sm" onClick={() => { setPesan(null); setSunting({ ...b }); }}>
                        <Ikon nama="pencil" ukuran={14} /> Ubah
                      </button>
                      <button className="btn danger sm" disabled={sibuk} title="Hapus kontrak ini"
                              onClick={() => { if (confirm(`Hapus kontrak "${b.agreement_no}" dari data pendukung?`)) kirim("DELETE", undefined, `/api/admin/pendukung?id=${b.id}`); }}>
                        <Ikon nama="trash" ukuran={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!baris.length && (
                <tr><td colSpan={kolom.length + 3} className="empty">
                  {cari || saring ? "Tidak ada kontrak yang cocok." : "Belum ada data. Unggah berkas di atas."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pa-pager">
          <span className="faint">
            {total
              ? <>Menampilkan <b>{(hal * perHal + 1).toLocaleString("id-ID")}–{Math.min(hal * perHal + perHal, total).toLocaleString("id-ID")}</b> dari <b>{total.toLocaleString("id-ID")}</b> kontrak</>
              : "Tidak ada data"}
          </span>
          {halTotal > 1 && (
            <div className="pa-pager-btn">
              <button className="btn ghost sm" disabled={hal === 0} onClick={() => setHal(hal - 1)}>← Sebelumnya</button>
              {nomorHal.map((i, idx) => (
                <span key={i} className="pa-hal-wrap">
                  {idx > 0 && i - nomorHal[idx - 1] > 1 && <span className="pa-elipsis">…</span>}
                  <button className={"pa-hal num" + (i === hal ? " on" : "")}
                          aria-current={i === hal ? "page" : undefined}
                          onClick={() => setHal(i)}>{(i + 1).toLocaleString("id-ID")}</button>
                </span>
              ))}
              <button className="btn ghost sm" disabled={hal >= halTotal - 1} onClick={() => setHal(hal + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      </section>

      <section className="card dp-riwayat">
        <div className="rk-kartu-kepala">
          <span className="km-ikon"><Ikon nama="history" ukuran={20} /></span>
          <div>
            <h2>Riwayat unggah</h2>
            <p className="faint small">“Masih aktif” = baris yang isinya belum ditimpa unggahan berikutnya.</p>
          </div>
        </div>
        <div className="tabel-scroll">
          <table className="rk-tabel dp-riwayat-tabel">
            <thead>
              <tr><th>Berkas</th><th>Kolom terisi</th>
                  <th className="r">Masuk</th><th className="r">Diabaikan</th>
                  <th className="r">Masih aktif</th><th>Waktu</th><th className="r">Aksi</th></tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="ri-berkas">
                      <span className="ri-xls" aria-hidden>{(r.nama_file ?? "").split(".").pop()?.toUpperCase().slice(0, 4) || "—"}</span>
                      <span className="ri-nama" title={r.nama_file ?? undefined}>{r.nama_file ?? "—"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="dp-kolom">
                      {(r.kolom_diisi ?? []).length
                        ? (r.kolom_diisi ?? []).map((k) => <span key={k} className="sp-produk">{k}</span>)
                        : <span className="faint">—</span>}
                    </div>
                  </td>
                  <td className="r num">{r.baris_masuk.toLocaleString("id-ID")}</td>
                  <td className={"r num " + (r.baris_tolak ? "teks-bad" : "faint")}>{r.baris_tolak.toLocaleString("id-ID")}</td>
                  <td className={"r num " + (r.baris_aktif ? "" : "faint")}
                      title="Baris yang isinya masih berasal dari unggahan ini, belum ditimpa unggahan berikutnya">
                    {r.baris_aktif ? <b>{r.baris_aktif.toLocaleString("id-ID")}</b> : 0}
                  </td>
                  <td className="num faint dp-waktu">{new Date(r.dibuat_pada).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="r">
                    <button className="btn danger sm" disabled={sibuk || !r.baris_aktif} onClick={() => hapusBatch(r)}>
                      Hapus batch ini
                    </button>
                  </td>
                </tr>
              ))}
              {!riwayat.length && (
                <tr><td colSpan={7} className="empty">Belum ada unggahan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {sunting && (
        <div className="modal-latar" onMouseDown={(e) => { if (e.target === e.currentTarget && !sibuk) setSunting(null); }}>
          <div className="modal dp-modal" role="dialog" aria-modal="true" aria-labelledby="dp-judul">
            <div className="modal-kepala">
              <span className="sd-ikon accent"><Ikon nama="pencil" ukuran={20} /></span>
              <div className="modal-judul">
                <h2 id="dp-judul">Ubah kontrak <span className="num">{sunting.agreement_no}</span></h2>
                <p>Perubahan langsung dipakai pada perhitungan berikutnya.</p>
              </div>
              <button className="pa-tutup" onClick={() => setSunting(null)} disabled={sibuk} aria-label="Tutup">×</button>
            </div>
            <div className="modal-isi">
              {pesan && <div className="alert-box bad"><span className="alert-ikon">!</span><span>{pesan}</span></div>}
              <div className="pa-form-grid dp-form-grid">
                {kolom.map((k) => (
                  <label className="field" key={k.kolom}>
                    <span>{k.label}</span>
                    <input value={sunting[k.kolom] ?? ""} className={k.jenis === "angka" ? "num" : undefined}
                           type={k.jenis === "angka" ? "number" : "text"}
                           onChange={(e) => setSunting({ ...sunting, [k.kolom]: e.target.value })} />
                  </label>
                ))}
              </div>
              <label className="field">
                <span>Catatan (opsional)</span>
                <input value={sunting.catatan ?? ""} placeholder="mis. koreksi dari tim data"
                       onChange={(e) => setSunting({ ...sunting, catatan: e.target.value })} />
              </label>
              <label className={"ka-opsi-item" + (sunting.aktif ? " on" : "")}>
                <input type="checkbox" checked={sunting.aktif}
                       onChange={(e) => setSunting({ ...sunting, aktif: e.target.checked })} />
                <span><b>Dipakai dalam perhitungan</b><small>Hilangkan centang untuk menghentikan angkanya dipakai tanpa menghapus jejaknya</small></span>
              </label>
            </div>
            <div className="modal-kaki">
              <button className="btn ghost" disabled={sibuk} onClick={() => setSunting(null)}>Batal</button>
              <button className="btn" disabled={sibuk} onClick={simpanSunting}>
                <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
