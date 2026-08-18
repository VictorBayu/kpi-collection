"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

type Cabang = { branch_id: string; cabang: string; area: string | null; aktif: boolean };

/**
 * Master kode cabang API.
 *
 * Sebelumnya daftar ini hidup sebagai kolom sempit di dalam halaman Data
 * API, berdesakan di sisa ruang samping riwayat penarikan — cukup untuk
 * satu dua baris, tapi 57 cabang berarti menggulir terus-menerus di ruang
 * yang sengaja dibuat kecil. Dipindah ke halaman sendiri supaya tabelnya
 * bisa memakai lebar penuh, dicari, dan diringkas per area.
 */
export default function CabangClient() {
  const [cabang, setCabang] = useState<Cabang[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [tempel, setTempel] = useState("");
  const [bukaTempel, setBukaTempel] = useState(false);
  const [baru, setBaru] = useState<Cabang | null>(null);

  async function segarkan() {
    const r = await fetch("/api/admin/data-api", { cache: "no-store" });
    const j = await r.json();
    setCabang(j.cabang ?? []);
    setMuat(false);
  }
  useEffect(() => { segarkan(); }, []);

  const perArea = useMemo(() => {
    const peta = new Map<string, Cabang[]>();
    for (const c of cabang) {
      const k = c.area ?? "(tanpa area)";
      const arr = peta.get(k) ?? [];
      arr.push(c);
      peta.set(k, arr);
    }
    return Array.from(peta.entries())
      .map(([area, isi]) => ({
        area,
        isi: isi
          .filter((c) => !cari.trim() ||
            c.branch_id.includes(cari.trim()) ||
            c.cabang.toLowerCase().includes(cari.trim().toLowerCase()))
          .sort((a, b) => a.cabang.localeCompare(b.cabang, "id")),
      }))
      .filter((a) => a.isi.length)
      .sort((a, b) => a.area.localeCompare(b.area, "id"));
  }, [cabang, cari]);

  const aktif = cabang.filter((c) => c.aktif).length;

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
          <button className="btn ghost sm" onClick={() => setBukaTempel(!bukaTempel)}>
            Tempel banyak
          </button>
          <button className="btn sm"
                  onClick={() => setBaru({ branch_id: "", cabang: "", area: "", aktif: true })}>
            + Satu cabang
          </button>
        </div>
      </div>

      {pesan && <div className="alert ok mb">{pesan}</div>}

      <div className="api-metrik mb" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="api-kotak"><b>{cabang.length}</b><span>total kode terdaftar</span></div>
        <div className={"api-kotak" + (aktif === 0 ? " bahaya" : "")}>
          <b>{aktif}</b><span>aktif ditarik tiap jam</span>
        </div>
        <div className="api-kotak"><b>{perArea.length}</b><span>area</span></div>
      </div>

      {bukaTempel && (
        <section className="card card-pad mb">
          <h3 style={{ fontSize: 14 }}>Tempel banyak kode sekaligus</h3>
          <p className="faint small">
            Satu baris per cabang: <span className="num">kode, nama cabang, area</span>.
            Area boleh dikosongkan. Kode yang sudah ada akan diperbarui, bukan digandakan.
          </p>
          <textarea rows={8} value={tempel} onChange={(e) => setTempel(e.target.value)}
                    placeholder={"451, MANADO, AREA SULUT-TENG-GO\n452, GORONTALO, AREA SULUT-TENG-GO\n..."} />
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
                          (j.ditolak?.length ? ` ${j.ditolak.length} baris dilewati karena formatnya tidak lengkap.` : ""));
                        setTempel(""); setBukaTempel(false); await segarkan();
                      } finally { setSibuk(false); }
                    }}>
              Simpan daftar
            </button>
            <button className="btn ghost sm" onClick={() => setBukaTempel(false)}>Batal</button>
          </div>
        </section>
      )}

      {baru && (
        <section className="card card-pad mb narrow">
          <h3 style={{ fontSize: 14 }}>Cabang baru</h3>
          <div className="grid3 mt">
            <input value={baru.branch_id} placeholder="Kode (451)"
                   onChange={(e) => setBaru({ ...baru, branch_id: e.target.value.trim() })} />
            <input value={baru.cabang} placeholder="Nama cabang"
                   onChange={(e) => setBaru({ ...baru, cabang: e.target.value.toUpperCase() })} />
            <input value={baru.area ?? ""} placeholder="Area (opsional)"
                   onChange={(e) => setBaru({ ...baru, area: e.target.value.toUpperCase() })} />
          </div>
          <div className="formact">
            <button className="btn sm" disabled={sibuk || !baru.branch_id || !baru.cabang}
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
        </section>
      )}

      <section className="card">
        <div className="cardhead">
          <input value={cari} placeholder="Cari kode atau nama cabang…"
                 onChange={(e) => setCari(e.target.value)}
                 style={{ maxWidth: 280 }} />
        </div>

        <table className="rapat">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Kode</th>
              <th>Cabang</th>
              <th style={{ width: 90 }}>Status</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {perArea.map((a) => (
              <Fragment key={a.area}>
                <tr className="cabang-area-baris">
                  <td colSpan={4}>
                    {a.area} <span className="faint">· {a.isi.length} cabang</span>
                  </td>
                </tr>
                {a.isi.map((c) => (
                  <tr key={c.branch_id} className={c.aktif ? "" : "kurang"}>
                    <td className="num"><b>{c.branch_id}</b></td>
                    <td>{c.cabang}</td>
                    <td>
                      <span className={"tag " + (c.aktif ? "ok" : "bad")}>
                        {c.aktif ? "aktif" : "nonaktif"}
                      </span>
                    </td>
                    <td className="r">
                      <button className="isyarat-x" title="Hapus" disabled={sibuk}
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
            {!perArea.length && (
              <tr><td colSpan={4} className="empty">
                {muat ? "Memuat…" : cari ? "Tidak ada yang cocok." : "Belum ada kode cabang."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="faint small mt">
        Lihat hasil tarikan dan riwayatnya di{" "}
        <Link className="lnk" href="/admin/data-api">Data API</Link>.
      </p>
    </>
  );
}
