"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Kolom = { kolom: string; label: string; jenis: string };
type Riwayat = {
  id: number; nama_file: string | null; kolom_diisi: string[] | null;
  baris_masuk: number; baris_tolak: number; dibuat_pada: string;
};

/**
 * Unggahan data pendukung.
 *
 * Data pendukung digabung ke data utama lewat nomor kontrak, jadi satu
 * hal yang harus jelas sejak awal bagi admin: berkasnya WAJIB punya kolom
 * nomor kontrak. Karena itu daftar kolom yang dikenali ditampilkan di
 * layar, bukan disembunyikan di dokumentasi — admin bisa menyamakan
 * berkasnya sebelum mengunggah alih-alih menebak lalu ditolak.
 */
export default function Client() {
  const [kolom, setKolom] = useState<Kolom[]>([]);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [ringkas, setRingkas] = useState<{ baris?: number; terakhir?: string }>({});
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/pendukung", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat."); return; }
    setKolom(j.kolom ?? []); setRiwayat(j.riwayat ?? []); setRingkas(j.ringkas ?? {});
  }
  useEffect(() => { segarkan(); }, []);

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
      await segarkan();
    } finally { setSibuk(false); }
  }

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Data Pendukung</h2>
          <p>
            Unggah berkas Excel berisi nomor kontrak dan kolom nilai tambahan.
            Digabung ke data API lewat <b>agreement_no</b>.
          </p>
        </div>
      </div>

      {pesan && (
        <div className={"alert mb " + (pesan.startsWith("Berhasil") ? "ok" : "bad")}>{pesan}</div>
      )}

      <div className="kartu-angka mb">
        <div className="angka-kotak">
          <span>Kontrak tersimpan</span>
          <b>{(ringkas.baris ?? 0).toLocaleString("id-ID")}</b>
          <i>di data pendukung</i>
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

      <section className="card card-pad mb">
        <h3 style={{ fontSize: 14, marginBottom: 6 }}>Kolom yang dikenali</h3>
        {kolom.length ? (
          <>
            <p className="muted small">
              Berkas Excel wajib punya kolom <b>AGREEMENT_NO</b>. Kolom di bawah ini
              akan terisi bila judulnya cocok — huruf besar/kecil dan spasi diabaikan.
            </p>
            <div className="pendukung-kolom">
              {kolom.map((k) => (
                <span className="aliaschip" key={k.kolom}>
                  {k.label} <i className="faint">{k.jenis}</i>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">
            Belum ada kolom data pendukung yang terdaftar. Tambahkan dulu di{" "}
            <Link className="lnk" href="/admin/kolom-api">Kolom Data API</Link> dengan
            memilih Sumber = &quot;Data pendukung&quot;.
          </p>
        )}
      </section>

      <section className="card card-pad mb">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Unggah berkas</h3>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" disabled={!kolom.length}
               onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
        <div className="mt">
          <button className="btn" disabled={sibuk || !berkas || !kolom.length}
                  onClick={unggah}>
            {sibuk ? "Mengunggah…" : "Unggah dan simpan"}
          </button>
        </div>
        <p className="muted small mt">
          Nomor kontrak yang sudah ada akan diperbarui, bukan digandakan. Baris tanpa
          nomor kontrak diabaikan karena tidak akan pernah cocok dengan data utama.
        </p>
      </section>

      <section className="card">
        <div className="cardhead">
          <h3 style={{ fontSize: 14 }}>Riwayat unggah</h3>
        </div>
        <table>
          <thead>
            <tr><th>Berkas</th><th>Kolom terisi</th>
                <th className="r">Masuk</th><th className="r">Diabaikan</th><th>Waktu</th></tr>
          </thead>
          <tbody>
            {riwayat.map((r) => (
              <tr key={r.id}>
                <td><b>{r.nama_file ?? "—"}</b></td>
                <td className="faint">{(r.kolom_diisi ?? []).join(", ") || "—"}</td>
                <td className="r num">{r.baris_masuk.toLocaleString("id-ID")}</td>
                <td className={"r num " + (r.baris_tolak ? "" : "faint")}>{r.baris_tolak}</td>
                <td className="faint">{new Date(r.dibuat_pada).toLocaleString("id-ID")}</td>
              </tr>
            ))}
            {!riwayat.length && (
              <tr><td colSpan={5} className="empty">Belum ada unggahan.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
