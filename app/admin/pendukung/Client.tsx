"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import KotakCari from "@/components/KotakCari";

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

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Data Pendukung</h2>
          <p>
            Data tambahan yang digabung ke data API lewat <b>agreement_no</b>.
            Baris yang dinonaktifkan berhenti dipakai perhitungan.
          </p>
        </div>
      </div>

      {pesan && (
        <div className={"alert mb " + (/Berhasil|Tersimpan|dihapus/.test(pesan) ? "ok" : "bad")}>
          {pesan}
        </div>
      )}

      <div className="kartu-angka mb">
        <div className="angka-kotak">
          <span>Kontrak tersimpan</span>
          <b>{(ringkas.baris ?? 0).toLocaleString("id-ID")}</b>
          <i>{(ringkas.aktif ?? 0).toLocaleString("id-ID")} dipakai</i>
        </div>
        <div className="angka-kotak">
          <span>Tidak dipakai</span>
          <b className={(ringkas.baris ?? 0) - (ringkas.aktif ?? 0) ? "buruk" : ""}>
            {((ringkas.baris ?? 0) - (ringkas.aktif ?? 0)).toLocaleString("id-ID")}
          </b>
          <i>dinonaktifkan</i>
        </div>
        <div className="angka-kotak">
          <span>Pembaruan terakhir</span>
          <b style={{ fontSize: 15 }}>
            {ringkas.terakhir
              ? new Date(ringkas.terakhir).toLocaleDateString("id-ID",
                  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
              : "—"}
          </b>
          <i>waktu unggah</i>
        </div>
        <div className="angka-kotak">
          <span>Kolom terdaftar</span>
          <b>{kolom.length}</b>
          <i>selain nomor kontrak</i>
        </div>
      </div>

      {!kolom.length ? (
        <section className="card card-pad mb">
          <h3 style={{ fontSize: 14, marginBottom: 6 }}>Belum siap menerima berkas</h3>
          <p className="muted">
            Belum ada kolom data pendukung yang terdaftar. Tambahkan dulu di{" "}
            <Link className="lnk" href="/admin/kolom-api">CRUD Kolom API</Link> dengan
            memilih Sumber = &quot;Data pendukung&quot;.
          </p>
        </section>
      ) : (
        <section className="card card-pad mb">
          <div className="rowbetween" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 14 }}>Unggah berkas</h3>
            <span className="faint small">
              Kolom dikenali: {kolom.map((k) => k.label).join(", ")}
            </span>
          </div>

          {/* Area seret-lepas: cara yang paling sering dipakai orang untuk
              berkas, dan tetap menyediakan tombol bagi yang tidak menyeret. */}
          <div className={"dropzone" + (seret ? " aktif" : "") + (berkas ? " terisi" : "")}
               onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
               onDragLeave={() => setSeret(false)}
               onDrop={(e) => {
                 e.preventDefault(); setSeret(false);
                 const f = e.dataTransfer.files?.[0];
                 if (f) setBerkas(f);
               }}
               onClick={() => input.current?.click()}
               role="button" tabIndex={0}>
            {berkas ? (
              <>
                <b>{berkas.name}</b>
                <span className="faint small">
                  {(berkas.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB
                  · klik untuk mengganti
                </span>
              </>
            ) : (
              <>
                <b>Seret berkas ke sini</b>
                <span className="faint small">atau klik untuk memilih · .xlsx, .xls, .csv</span>
              </>
            )}
          </div>

          <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden
                 onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />

          <div className="mt" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" disabled={sibuk || !berkas} onClick={unggah}>
              {sibuk ? "Mengunggah…" : "Unggah dan simpan"}
            </button>
            {berkas && (
              <button className="btn ghost" disabled={sibuk}
                      onClick={() => { setBerkas(null); if (input.current) input.current.value = ""; }}>
                Batal
              </button>
            )}
            <span className="faint small">
              Berkas wajib punya kolom <b>AGREEMENT_NO</b>. Nomor kontrak yang sudah ada
              diperbarui, bukan digandakan.
            </span>
          </div>
        </section>
      )}

      {sunting && (
        <section className="card card-pad mb">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>
            Ubah kontrak {sunting.agreement_no}
          </h3>
          <div className="kolom-form">
            {kolom.map((k) => (
              <label className="field" key={k.kolom}>
                <span>{k.label}</span>
                <input value={sunting[k.kolom] ?? ""}
                       type={k.jenis === "angka" ? "number" : "text"}
                       onChange={(e) =>
                         setSunting({ ...sunting, [k.kolom]: e.target.value })} />
              </label>
            ))}
          </div>
          <label className="field mt">
            <span>Catatan (opsional)</span>
            <input value={sunting.catatan ?? ""} placeholder="mis. koreksi dari tim data"
                   onChange={(e) => setSunting({ ...sunting, catatan: e.target.value })} />
          </label>
          <label className="ind-cek mt">
            <input type="checkbox" checked={sunting.aktif}
                   onChange={(e) => setSunting({ ...sunting, aktif: e.target.checked })} />
            Dipakai dalam perhitungan
          </label>
          <div className="mt" style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={sibuk}
                    onClick={async () => {
                      const nilai: Record<string, any> = {};
                      for (const k of kolom) nilai[k.kolom] = sunting[k.kolom];
                      const ok = await kirim("PUT", {
                        id: sunting.id, aktif: sunting.aktif,
                        catatan: sunting.catatan, nilai,
                      });
                      if (ok) { setSunting(null); setPesan("Tersimpan."); }
                    }}>Simpan</button>
            <button className="btn ghost" disabled={sibuk}
                    onClick={() => setSunting(null)}>Batal</button>
          </div>
        </section>
      )}

      <section className="card mb">
        <div className="cardhead rowbetween">
          <div>
            <h3 style={{ fontSize: 14 }}>Isi data pendukung</h3>
            <p className="muted small">{total.toLocaleString("id-ID")} kontrak.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <KotakCari nilai={cari} onUbah={setCari} placeholder="Cari nomor kontrak…" />
            <span className="faint">·</span>
            <input value={hapusNomor} placeholder="Hapus nomor kontrak…"
                   style={{ width: 180 }}
                   onChange={(e) => setHapusNomor(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") hapusPerNomor(); }} />
            <button className="btn ghost sm bahaya" disabled={sibuk || !hapusNomor.trim()}
                    onClick={hapusPerNomor}>Hapus</button>
          </div>
        </div>

        <div className="filterbar">
          {[["", "Semua"], ["aktif", "Dipakai"], ["nonaktif", "Tidak dipakai"]].map(([v, t]) => (
            <button key={v} aria-pressed={saring === v} onClick={() => setSaring(v)}>{t}</button>
          ))}
        </div>

        <table>
          <thead>
            <tr>
              <th>Nomor kontrak</th>
              {kolom.map((k) => <th key={k.kolom} className="r">{k.label}</th>)}
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => (
              <tr key={b.id} className={b.aktif ? "" : "kurang"}>
                <td>
                  <b className="num">{b.agreement_no}</b>
                  {b.catatan && <div className="faint">{b.catatan}</div>}
                </td>
                {kolom.map((k) => (
                  <td key={k.kolom} className="r num">{fmtNilai(b[k.kolom], k.jenis)}</td>
                ))}
                <td>
                  {b.aktif
                    ? <span className="tag-ok">dipakai</span>
                    : <span className="tag-warn">tidak dipakai</span>}
                </td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" disabled={sibuk}
                          onClick={() => kirim("PUT", {
                            id: b.id, aktif: !b.aktif, catatan: b.catatan, nilai: {},
                          })}>
                    {b.aktif ? "Nonaktifkan" : "Aktifkan"}
                  </button>{" "}
                  <button className="btn ghost sm"
                          onClick={() => setSunting({ ...b })}>Ubah</button>{" "}
                  <button className="btn ghost sm bahaya" disabled={sibuk}
                          onClick={() => kirim("DELETE", undefined,
                            `/api/admin/pendukung?id=${b.id}`)}>Hapus</button>
                </td>
              </tr>
            ))}
            {!baris.length && (
              <tr><td colSpan={kolom.length + 3} className="empty">
                {cari || saring ? "Tidak ada kontrak yang cocok."
                  : "Belum ada data. Unggah berkas di atas."}
              </td></tr>
            )}
          </tbody>
        </table>

        {total > perHal && (
          <div className="paging">
            <button className="btn ghost sm" disabled={hal === 0}
                    onClick={() => setHal(hal - 1)}>← Sebelumnya</button>
            <span className="faint small">Halaman {hal + 1} dari {halTotal}</span>
            <button className="btn ghost sm" disabled={hal >= halTotal - 1}
                    onClick={() => setHal(hal + 1)}>Berikutnya →</button>
          </div>
        )}
      </section>

      <section className="card">
        <div className="cardhead">
          <h3 style={{ fontSize: 14 }}>Riwayat unggah</h3>
        </div>
        <table>
          <thead>
            <tr><th>Berkas</th><th>Kolom terisi</th>
                <th className="r">Masuk</th><th className="r">Diabaikan</th>
                <th className="r">Masih aktif</th><th>Waktu</th><th></th></tr>
          </thead>
          <tbody>
            {riwayat.map((r) => (
              <tr key={r.id}>
                <td><b>{r.nama_file ?? "—"}</b></td>
                <td className="faint">{(r.kolom_diisi ?? []).join(", ") || "—"}</td>
                <td className="r num">{r.baris_masuk.toLocaleString("id-ID")}</td>
                <td className={"r num " + (r.baris_tolak ? "" : "faint")}>{r.baris_tolak}</td>
                <td className={"r num " + (r.baris_aktif ? "" : "faint")}
                    title="Baris yang isinya masih berasal dari unggahan ini, belum ditimpa unggahan berikutnya">
                  {r.baris_aktif.toLocaleString("id-ID")}
                </td>
                <td className="faint">{new Date(r.dibuat_pada).toLocaleString("id-ID")}</td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm bahaya" disabled={sibuk || !r.baris_aktif}
                          onClick={() => hapusBatch(r)}>Hapus batch ini</button>
                </td>
              </tr>
            ))}
            {!riwayat.length && (
              <tr><td colSpan={7} className="empty">Belum ada unggahan.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
