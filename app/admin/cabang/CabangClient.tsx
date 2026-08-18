"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import Pager from "@/components/Pager";
import KotakCari from "@/components/KotakCari";

type Cabang = { branch_id: string; cabang: string; area: string | null; aktif: boolean };

const PER = 25;

/**
 * Master kode cabang API.
 *
 * Sebelumnya daftar ini hidup sebagai kolom sempit di dalam halaman Data
 * API, berdesakan di sisa ruang samping riwayat penarikan — cukup untuk
 * satu dua baris, tapi 65 cabang berarti menggulir terus-menerus di ruang
 * yang sengaja dibuat kecil. Dipindah ke halaman sendiri supaya tabelnya
 * bisa memakai lebar penuh, dicari, dan dibagi per halaman.
 *
 * Pengelompokan per area tetap dipertahankan di dalam tiap halaman: kode
 * BranchID tidak berpola, jadi tanpa nama area sebagai penanda, mencari
 * satu cabang di antara 65 baris angka berarti membaca satu per satu.
 */
export default function CabangClient() {
  const [cabang, setCabang] = useState<Cabang[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [hal, setHal] = useState(0);
  const [panel, setPanel] = useState<"tempel" | "satu" | null>(null);
  const [tempel, setTempel] = useState("");
  const [baru, setBaru] = useState<Cabang>({ branch_id: "", cabang: "", area: "", aktif: true });

  async function segarkan() {
    const r = await fetch("/api/admin/data-api", { cache: "no-store" });
    const j = await r.json();
    setCabang(j.cabang ?? []);
    setMuat(false);
  }
  useEffect(() => { segarkan(); }, []);

  /** Hasil penyaringan, diurutkan area lalu nama cabang. */
  const tersaring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return cabang
      .filter((c) => !k ||
        c.branch_id.includes(k) ||
        c.cabang.toLowerCase().includes(k) ||
        (c.area ?? "").toLowerCase().includes(k))
      .sort((a, b) =>
        (a.area ?? "zzz").localeCompare(b.area ?? "zzz", "id") ||
        a.cabang.localeCompare(b.cabang, "id"));
  }, [cabang, cari]);

  const totalHal = Math.max(1, Math.ceil(tersaring.length / PER));
  const halaman = tersaring.slice(hal * PER, hal * PER + PER);

  /** Pengelompokan hanya atas baris yang tampil di halaman ini. */
  const perArea = useMemo(() => {
    const peta = new Map<string, Cabang[]>();
    for (const c of halaman) {
      const k = c.area ?? "(tanpa area)";
      peta.set(k, [...(peta.get(k) ?? []), c]);
    }
    return Array.from(peta.entries());
  }, [halaman]);

  const aktif = cabang.filter((c) => c.aktif).length;
  const jmlArea = new Set(cabang.map((c) => c.area ?? "(tanpa area)")).size;

  async function simpanSatu() {
    setSibuk(true);
    try {
      await fetch("/api/admin/data-api", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(baru),
      });
      setBaru({ branch_id: "", cabang: "", area: "", aktif: true });
      setPanel(null);
      setPesan("Cabang tersimpan.");
      await segarkan();
    } finally { setSibuk(false); }
  }

  async function simpanTempel() {
    setSibuk(true);
    try {
      const r = await fetch("/api/admin/data-api", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ teks: tempel }),
      });
      const j = await r.json();
      setPesan(`${j.masuk} kode cabang tersimpan.` +
        (j.ditolak?.length ? ` ${j.ditolak.length} baris dilewati karena formatnya tidak lengkap.` : ""));
      setTempel(""); setPanel(null);
      await segarkan();
    } finally { setSibuk(false); }
  }

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Master Cabang API</h2>
          <p>
            Kode BranchID yang dipakai API collection, dipetakan ke nama cabang
            internal. Hanya cabang berstatus aktif yang ikut ditarik tiap jam.
          </p>
        </div>
        <div className="ind-aksi">
          <button className={"btn ghost sm" + (panel === "tempel" ? " ada" : "")}
                  onClick={() => setPanel(panel === "tempel" ? null : "tempel")}>
            Tempel banyak
          </button>
          <button className="btn sm"
                  onClick={() => setPanel(panel === "satu" ? null : "satu")}>
            + Satu cabang
          </button>
        </div>
      </div>

      {pesan && (
        <div className="alert ok mb">
          {pesan}
          <button className="alert-x" onClick={() => setPesan(null)}>×</button>
        </div>
      )}

      <div className="api-metrik mb" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="api-kotak"><b>{cabang.length}</b><span>total kode terdaftar</span></div>
        <div className={"api-kotak" + (aktif === 0 ? " bahaya" : "")}>
          <b>{aktif}</b><span>aktif ditarik tiap jam</span>
        </div>
        <div className="api-kotak"><b>{jmlArea}</b><span>area</span></div>
      </div>

      {/* --- panel tambah satu --- */}
      {panel === "satu" && (
        <section className="panel-isi mb">
          <div className="panel-kepala">
            <b>Tambah satu cabang</b>
            <button className="panel-x" onClick={() => setPanel(null)}>×</button>
          </div>
          <div className="panel-badan">
            <div className="panel-medan">
              <label>
                <span className="faint small">Kode BranchID</span>
                <input value={baru.branch_id} placeholder="451" className="num"
                       onChange={(e) => setBaru({ ...baru, branch_id: e.target.value.trim() })} />
              </label>
              <label>
                <span className="faint small">Nama cabang</span>
                <input value={baru.cabang} placeholder="MANADO"
                       onChange={(e) => setBaru({ ...baru, cabang: e.target.value.toUpperCase() })} />
              </label>
              <label>
                <span className="faint small">Area <span className="faint">(opsional)</span></span>
                <input value={baru.area ?? ""} placeholder="AREA SULUT-TENG-GO"
                       onChange={(e) => setBaru({ ...baru, area: e.target.value.toUpperCase() })} />
              </label>
            </div>
            <p className="faint small">
              Nama cabang sebaiknya sama persis dengan yang dipakai di data pengguna,
              supaya baris KPI dari API tergabung dengan data cabang yang sudah ada.
            </p>
            <div className="formact">
              <button className="btn sm" disabled={sibuk || !baru.branch_id || !baru.cabang}
                      onClick={simpanSatu}>Simpan cabang</button>
              <button className="btn ghost sm" onClick={() => setPanel(null)}>Batal</button>
            </div>
          </div>
        </section>
      )}

      {/* --- panel tempel banyak --- */}
      {panel === "tempel" && (
        <section className="panel-isi mb">
          <div className="panel-kepala">
            <b>Tempel banyak kode sekaligus</b>
            <button className="panel-x" onClick={() => setPanel(null)}>×</button>
          </div>
          <div className="panel-badan">
            <p className="faint small">
              Satu baris per cabang, dipisah koma. Kolom ketiga (area) boleh
              dikosongkan. Kode yang sudah terdaftar akan diperbarui, bukan digandakan —
              jadi aman menempelkan ulang seluruh daftar.
            </p>
            <div className="panel-contoh">
              <span className="faint small">Bentuknya:</span>
              <code>451, MANADO, AREA SULUT-TENG-GO</code>
            </div>
            <textarea rows={9} value={tempel} onChange={(e) => setTempel(e.target.value)}
                      placeholder={"451, MANADO, AREA SULUT-TENG-GO\n452, GORONTALO, AREA SULUT-TENG-GO\n403, JAKARTA, AREA JADETABEK"} />
            <div className="formact">
              <button className="btn sm" disabled={sibuk || !tempel.trim()}
                      onClick={simpanTempel}>
                Simpan {tempel.split("\n").filter((l) => l.trim()).length || ""} baris
              </button>
              <button className="btn ghost sm" onClick={() => setPanel(null)}>Batal</button>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="saring-bar-rapi">
          <KotakCari nilai={cari} onUbah={(v) => { setCari(v); setHal(0); }} lebar={340}
                     placeholder="Cari kode, nama cabang, atau area" />
          {cari && (
            <span className="faint small">
              {tersaring.length} dari {cabang.length} cabang
            </span>
          )}
        </div>

        <table className="rapat">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Kode</th>
              <th>Cabang</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {perArea.map(([area, isi]) => (
              <Fragment key={area}>
                <tr className="cabang-area-baris">
                  <td colSpan={4}>
                    {area} <span className="faint">· {isi.length} cabang di halaman ini</span>
                  </td>
                </tr>
                {isi.map((c) => (
                  <tr key={c.branch_id} className={c.aktif ? "" : "kurang"}>
                    <td className="num"><b>{c.branch_id}</b></td>
                    <td>{c.cabang}</td>
                    <td>
                      <span className={"tag " + (c.aktif ? "ok" : "bad")}>
                        {c.aktif ? "aktif" : "nonaktif"}
                      </span>
                    </td>
                    <td className="r">
                      <button className="isyarat-x" title={`Hapus ${c.cabang}`} disabled={sibuk}
                              onClick={async () => {
                                if (!confirm(`Hapus kode ${c.branch_id} (${c.cabang})?`)) return;
                                setSibuk(true);
                                try {
                                  await fetch(`/api/admin/data-api?branch_id=${encodeURIComponent(c.branch_id)}`,
                                    { method: "DELETE" });
                                  await segarkan();
                                } finally { setSibuk(false); }
                              }}>×</button>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!halaman.length && (
              <tr><td colSpan={4} className="empty">
                {muat ? "Memuat…" : cari ? "Tidak ada yang cocok." : "Belum ada kode cabang."}
              </td></tr>
            )}
          </tbody>
        </table>

        {tersaring.length > 0 && (
          <Pager hal={hal} totalHal={totalHal} totalBaris={tersaring.length}
                 dariBaris={hal * PER + 1}
                 sampaiBaris={Math.min(hal * PER + PER, tersaring.length)}
                 satuan="cabang" onPindah={setHal} />
        )}
      </section>

      <p className="faint small mt">
        Lihat hasil tarikan dan riwayatnya di{" "}
        <Link className="lnk" href="/admin/data-api">Data API</Link>, atau contoh
        isi datanya di{" "}
        <Link className="lnk" href="/admin/sampel-data">Sampel data mentah</Link>.
      </p>
    </>
  );
}
