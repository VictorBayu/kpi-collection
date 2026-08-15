"use client";

import { useRef, useState } from "react";

type Baris = {
  baris: number; nik: string; nama: string;
  jabatan: string | null; cabang: string | null; area: string | null;
  peran: string; aktif: boolean; adaSebelumnya: boolean;
  masalah: string[]; peringatan: string[];
};

type Ringkas = {
  total: number; baru: number; diperbarui: number;
  bermasalah: number; berperingatan: number;
};

/**
 * Impor pengguna dari Excel, dua langkah: periksa dulu, simpan kemudian.
 *
 * Berkas yang sama dikirim dua kali — sekali untuk pratinjau, sekali untuk
 * menyimpan. Terlihat boros, tapi memastikan yang tersimpan benar-benar isi
 * berkas yang barusan diperiksa, bukan hasil parsing yang disimpan sementara
 * di server dan bisa kedaluwarsa.
 */
export default function ImporPengguna({ onSelesai }: { onSelesai?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [baris, setBaris] = useState<Baris[] | null>(null);
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [timpa, setTimpa] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [lihatSemua, setLihatSemua] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function periksa(f: File) {
    setSibuk(true); setGalat(null); setKabar(null); setBaris(null);
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/admin/pengguna/impor", { method: "POST", body: fd });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setBaris(d.baris); setRingkas(d.ringkas);
  }

  async function simpan() {
    if (!file) return;
    setSibuk(true); setGalat(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("timpa", timpa ? "1" : "0");
    const res = await fetch("/api/admin/pengguna/impor", { method: "PUT", body: fd });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(
      `${d.baru} akun baru dibuat, ${d.diperbarui} diperbarui` +
      (d.dilewati ? `, ${d.dilewati} dilewati karena sudah ada.` : "."));
    setBaris(null); setFile(null); setRingkas(null);
    if (input.current) input.current.value = "";
    onSelesai?.();
  }

  function pilihFile(f: File | null) {
    setFile(f); setBaris(null); setRingkas(null); setGalat(null); setKabar(null);
    if (f) periksa(f);
  }

  const bermasalah = (baris ?? []).filter((b) => b.masalah.length);
  const berperingatan = (baris ?? []).filter((b) => !b.masalah.length && b.peringatan.length);
  const tampil = lihatSemua ? (baris ?? []) : [...bermasalah, ...berperingatan];

  return (
    <section className="card card-pad mb">
      <div className="rowbetween" style={{ marginBottom: 12 }}>
        <div>
          <h3 className="formtitle" style={{ margin: 0 }}>Impor pengguna dari Excel</h3>
          <p className="faint small nomargin">
            Unduh contoh berkasnya dulu supaya susunan kolomnya pasti cocok.
          </p>
        </div>
        <a className="btn ghost sm nowrap" href="/api/admin/pengguna/template">
          ↓ Unduh contoh Excel
        </a>
      </div>

      {galat && <div className="banner warn"><b>Gagal</b>{galat}</div>}
      {kabar && <div className="banner good"><b>Impor selesai</b>{kabar}</div>}

      <label className="drop impor-drop">
        <input ref={input} type="file" accept=".xlsx,.xls" hidden
               onChange={(e) => pilihFile(e.target.files?.[0] ?? null)} />
        <h3>{file ? file.name : "Pilih berkas Excel"}</h3>
        <p className="faint">
          {sibuk && !baris ? "Memeriksa isi berkas…"
            : file ? "Klik untuk mengganti berkas"
            : "Kolom wajib: NIK dan NAMA. Sisanya boleh dikosongkan."}
        </p>
      </label>

      {ringkas && (
        <>
          <div className="impor-ringkas">
            <div><b>{ringkas.total}</b><span>baris dibaca</span></div>
            <div className="baik"><b>{ringkas.baru}</b><span>akun baru</span></div>
            <div><b>{ringkas.diperbarui}</b><span>akan diperbarui</span></div>
            <div className={ringkas.berperingatan ? "hati" : ""}>
              <b>{ringkas.berperingatan}</b><span>perlu dicek</span>
            </div>
            <div className={ringkas.bermasalah ? "bahaya" : ""}>
              <b>{ringkas.bermasalah}</b><span>ditolak</span>
            </div>
          </div>

          {tampil.length > 0 && (
            <div className="card tabel-responsif mt">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Baris</th>
                    <th>Pengguna</th><th>Penempatan</th><th>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.slice(0, 100).map((b) => (
                    <tr key={b.baris} className={b.masalah.length ? "kurang" : ""}>
                      <td className="num faint" data-label="Baris">{b.baris}</td>
                      <td data-label="Pengguna">
                        <b>{b.nama || <span className="faint">(tanpa nama)</span>}</b>
                        <div className="faint num">
                          {b.nik || "—"} · {b.peran}
                          {b.adaSebelumnya && <span className="tag-warn">sudah ada</span>}
                        </div>
                      </td>
                      <td data-label="Penempatan" className="faint num" style={{ fontSize: 11.5 }}>
                        {b.jabatan ?? "—"}<br />{b.cabang ?? b.area ?? "—"}
                      </td>
                      <td data-label="Catatan">
                        {b.masalah.map((m) => (
                          <div key={m} className="impor-tolak">✕ {m}</div>
                        ))}
                        {b.peringatan.map((p) => (
                          <div key={p} className="impor-cek">! {p}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tampil.length > 100 && (
                <p className="faint pad">
                  Menampilkan 100 dari {tampil.length} baris yang perlu diperhatikan.
                </p>
              )}
            </div>
          )}

          {!tampil.length && (
            <div className="banner good mt">
              <b>Semua baris bersih</b>
              Tidak ada yang perlu diperbaiki. Lanjutkan menyimpan.
            </div>
          )}

          <div className="formcheck">
            <label>
              <input type="checkbox" checked={timpa}
                     onChange={(e) => setTimpa(e.target.checked)} />
              <span>
                Perbarui data akun yang NIK-nya sudah terdaftar
                {!timpa && " (sekarang: akun lama dilewati)"}
              </span>
            </label>
            <label>
              <input type="checkbox" checked={lihatSemua}
                     onChange={(e) => setLihatSemua(e.target.checked)} />
              <span>Tampilkan semua baris, bukan hanya yang bermasalah</span>
            </label>
          </div>

          <div className="formact">
            <button className="btn" onClick={simpan}
                    disabled={sibuk || ringkas.total === ringkas.bermasalah}>
              {sibuk ? "Menyimpan…"
                : `Simpan ${ringkas.baru + (timpa ? ringkas.diperbarui : 0)} pengguna`}
            </button>
            <button className="btn ghost" onClick={() => pilihFile(null)}>Batal</button>
          </div>

          {ringkas.bermasalah > 0 && (
            <p className="faint small">
              {ringkas.bermasalah} baris bermasalah tidak akan disimpan. Perbaiki di
              berkas Excel lalu unggah ulang bila memang diperlukan.
            </p>
          )}
        </>
      )}
    </section>
  );
}
