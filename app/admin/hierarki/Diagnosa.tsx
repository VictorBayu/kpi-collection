"use client";

import { useState } from "react";

type Syarat = { nama: string; lolos: boolean; detail: string };
type Orang = {
  nik: string; nama: string; jabatan_asli: string | null;
  jabatan_master: string | null; cabang: string | null; area: string | null;
  aktif?: boolean; lolos_hierarki?: boolean; lolos_wilayah?: boolean;
};

/**
 * Alat bantu menjawab "kenapa si A tidak muncul di layar Tim Saya si B".
 *
 * Aturan visibilitas punya beberapa syarat yang harus lolos bersamaan, dan
 * kalau salah satu gagal, gejalanya sama saja: orangnya hilang begitu saja.
 * Yang paling sering jadi penyebab adalah hal yang tak terlihat di layar —
 * nama cabang dengan spasi berlebih, atau jabatan yang belum punya alias.
 */
export default function Diagnosa() {
  const [pengamat, setPengamat] = useState("");
  const [target, setTarget] = useState("");
  const [hasil, setHasil] = useState<any>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function periksa(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true); setGalat(null); setHasil(null);
    const p = new URLSearchParams({ pengamat, target });
    const res = await fetch(`/api/admin/diagnosa?${p}`);
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setHasil(d);
  }

  return (
    <section className="card card-pad mb mh-panel">
      <h3 className="formtitle">Uji visibilitas</h3>
      <p className="faint small mh-panel-desk">
        Masukkan NIK atasan, lalu NIK orang yang seharusnya dia lihat.
        Kosongkan NIK kedua untuk melihat seluruh daftar beserta yang tersembunyi.
      </p>

      <form onSubmit={periksa} className="diag-form">
        <label className="field">
          <span>NIK atasan (pengamat)</span>
          <input className="num" inputMode="numeric" required value={pengamat}
                 placeholder="20160477"
                 onChange={(e) => setPengamat(e.target.value)} />
        </label>
        <label className="field">
          <span>NIK yang dicari (opsional)</span>
          <input className="num" inputMode="numeric" value={target}
                 placeholder="20220770"
                 onChange={(e) => setTarget(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={sibuk}>
          {sibuk ? "Memeriksa…" : "Periksa"}
        </button>
      </form>

      {galat && <div className="banner warn mt"><b>Gagal</b>{galat}</div>}

      {hasil?.syarat && (
        <div className="mt">
          <div className={"banner " + (hasil.terlihat ? "good" : "warn")}>
            <b>
              {hasil.target.nama} {hasil.terlihat ? "TERLIHAT" : "TIDAK terlihat"} oleh {hasil.pengamat.nama}
            </b>
            {hasil.catatanWilayah}
          </div>

          <ul className="diag-list">
            {hasil.syarat.map((s: Syarat) => (
              <li key={s.nama} className={s.lolos ? "ok" : "no"}>
                <span className="diag-ikon">{s.lolos ? "✓" : "✕"}</span>
                <span className="diag-isi">
                  <b>{s.nama}</b>
                  <span className="faint">{s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasil?.tersembunyi && (
        <div className="mt">
          <div className="banner info">
            <b>{hasil.pengamat.nama} — {hasil.pengamat.jabatan_master ?? "jabatan tak dikenal"}</b>
            Melihat {hasil.terlihat.length} orang. {hasil.tersembunyi.length} orang sewilayah
            tidak terlihat, alasannya di bawah.
          </div>

          {hasil.tersembunyi.length > 0 && (
            <div className="card tabel-responsif">
              <table>
                <thead>
                  <tr>
                    <th>Tidak terlihat</th><th>Jabatan</th>
                    <th>Cabang / Area</th><th>Sebab</th>
                  </tr>
                </thead>
                <tbody>
                  {hasil.tersembunyi.map((o: Orang) => (
                    <tr key={o.nik}>
                      <td data-label="Orang">
                        <b>{o.nama}</b>
                        <div className="faint num">{o.nik}</div>
                      </td>
                      <td data-label="Jabatan">
                        {o.jabatan_asli ?? "—"}
                        {o.jabatan_master && o.jabatan_master !== o.jabatan_asli && (
                          <div className="faint" style={{ fontSize: 11 }}>→ {o.jabatan_master}</div>
                        )}
                      </td>
                      <td data-label="Wilayah">
                        <span className="num" style={{ fontSize: 11.5 }}>
                          {o.cabang ?? "(kosong)"}
                        </span>
                        <div className="faint" style={{ fontSize: 11 }}>{o.area ?? "(kosong)"}</div>
                      </td>
                      <td data-label="Sebab">
                        {!o.aktif && <span className="tag-warn">nonaktif</span>}
                        {!o.lolos_hierarki && <span className="tag-warn">di luar rantai</span>}
                        {!o.lolos_wilayah && <span className="tag-warn">wilayah beda</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
