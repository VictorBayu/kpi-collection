"use client";

import { useEffect, useState, useCallback } from "react";

type User = {
  id: string; nik: string; nama: string; peran: string; cabang: string | null;
  aktif: boolean; login_count: number; access_count: number;
  akses_7h: number; akses_30h: number;
  last_login_at: string | null; last_access_at: string | null;
  suspended_at: string | null; suspended_reason: string | null;
};

const PER = 10;

export default function PenggunaClient() {
  const [list, setList] = useState<User[]>([]);
  const [stat, setStat] = useState({ total: 0, aktif: 0, suspend: 0, jarang: 0 });
  const [cari, setCari] = useState("");
  const [peran, setPeran] = useState("");
  const [status, setStatus] = useState("");
  const [urut, setUrut] = useState("akses");
  const [hal, setHal] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    const p = new URLSearchParams({ cari, peran, status, urut });
    const d = await fetch(`/api/admin/pengguna?${p}`).then((r) => r.json());
    setList(d.list ?? []);
    setStat(d.stat ?? stat);
    setHal(0);
  }, [cari, peran, status, urut]);

  useEffect(() => { muat(); }, [muat]);

  async function aksi(userId: string, aksi: "suspend" | "aktifkan", nama: string) {
    let alasan = "";
    if (aksi === "suspend") {
      const a = prompt(`Nonaktifkan login ${nama}?\nTulis alasan (opsional):`, "Jarang mengakses aplikasi");
      if (a === null) return;
      alasan = a;
    } else {
      if (!confirm(`Aktifkan kembali login ${nama}?`)) return;
    }
    setSibuk(true); setGalat(null);
    const res = await fetch("/api/admin/pengguna", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, aksi, alasan }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    muat();
  }

  const totalHal = Math.ceil(list.length / PER);
  const tampil = list.slice(hal * PER, hal * PER + PER);

  const fmt = (v: string | null) =>
    v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const labelPeran = (p: string) => p === "admin" ? "Admin" : p === "atasan" ? "Atasan" : "Karyawan";

  return (
    <>
      <div className="sectionhead">
        <div>
          <h2>Pengguna & Akses</h2>
          <p>Pantau seberapa sering tiap akun mengakses aplikasi. Akun yang jarang dipakai bisa dinonaktifkan.</p>
        </div>
      </div>

      <div className="statgrid">
        <button className={"statcard" + (status === "" ? " on" : "")} onClick={() => setStatus("")}>
          <span className="eyebrow">Total pengguna</span><b className="num">{stat.total}</b>
        </button>
        <button className={"statcard" + (status === "aktif" ? " on" : "")} onClick={() => setStatus("aktif")}>
          <span className="eyebrow">Aktif</span><b className="num" style={{ color: "var(--good)" }}>{stat.aktif}</b>
        </button>
        <button className={"statcard" + (status === "jarang" ? " on" : "")} onClick={() => setStatus("jarang")}>
          <span className="eyebrow">Jarang akses (30h &lt; 3)</span><b className="num" style={{ color: "var(--warn)" }}>{stat.jarang}</b>
        </button>
        <button className={"statcard" + (status === "suspend" ? " on" : "")} onClick={() => setStatus("suspend")}>
          <span className="eyebrow">Dinonaktifkan</span><b className="num" style={{ color: "var(--bad)" }}>{stat.suspend}</b>
        </button>
      </div>

      {galat && <div className="banner warn"><b>Gagal</b>{galat}</div>}

      <div className="filterbar">
        <input className="cari" placeholder="Cari NIK atau nama" value={cari}
               onChange={(e) => setCari(e.target.value)} style={{ marginLeft: 0 }} />
        <select className="select" value={peran} onChange={(e) => setPeran(e.target.value)}>
          <option value="">Semua peran</option>
          <option value="karyawan">Karyawan</option>
          <option value="atasan">Atasan</option>
          <option value="admin">Admin</option>
        </select>
        <select className="select" value={urut} onChange={(e) => setUrut(e.target.value)}>
          <option value="akses">Urut: akses tersedikit</option>
          <option value="login">Urut: login tersedikit</option>
          <option value="nama">Urut: nama</option>
        </select>
      </div>

      <section className="card">
        <table>
          <thead>
            <tr>
              <th>Pengguna</th><th style={{ width: 90 }}>Peran</th>
              <th className="r" style={{ width: 80 }}>Login</th>
              <th className="r" style={{ width: 90 }}>Akses 30h</th>
              <th style={{ width: 130 }}>Terakhir akses</th>
              <th style={{ width: 110 }}>Status</th>
              <th className="r" style={{ width: 130 }}>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((u) => {
              const suspended = !u.aktif || !!u.suspended_at;
              const jarang = u.akses_30h < 3 && !suspended;
              return (
                <tr key={u.id}>
                  <td><b>{u.nama}</b><div className="faint num">{u.nik} · {u.cabang ?? "—"}</div></td>
                  <td style={{ fontSize: 12.5 }}>{labelPeran(u.peran)}</td>
                  <td className="r num">{u.login_count}</td>
                  <td className="r num">
                    <span className={jarang ? "warnnum" : ""}>{u.akses_30h}</span>
                    <div className="faint" style={{ fontSize: 11 }}>7h: {u.akses_7h}</div>
                  </td>
                  <td className="faint" style={{ fontSize: 12 }}>{fmt(u.last_access_at)}</td>
                  <td>
                    {suspended
                      ? <span className="chip c-tolak" title={u.suspended_reason ?? ""}>Nonaktif</span>
                      : jarang
                        ? <span className="chip c-proses">Jarang</span>
                        : <span className="chip c-selesai">Aktif</span>}
                  </td>
                  <td className="r nowrap">
                    {suspended
                      ? <button className="btn ghost sm" disabled={sibuk}
                                onClick={() => aksi(u.id, "aktifkan", u.nama)}>Aktifkan</button>
                      : <button className="btn danger sm" disabled={sibuk}
                                onClick={() => aksi(u.id, "suspend", u.nama)}>Nonaktifkan</button>}
                  </td>
                </tr>
              );
            })}
            {!tampil.length && (
              <tr><td colSpan={7} className="empty">Tidak ada pengguna yang cocok dengan penyaringan.</td></tr>
            )}
          </tbody>
        </table>

        {totalHal > 1 && (
          <div className="pager">
            <span className="faint">
              {hal * PER + 1}–{Math.min(hal * PER + PER, list.length)} dari {list.length} pengguna
            </span>
            <div className="pager-btns">
              <button className="btn ghost sm" disabled={hal === 0} onClick={() => setHal((h) => h - 1)}>← Sebelumnya</button>
              <span className="pager-num">Hal {hal + 1}/{totalHal}</span>
              <button className="btn ghost sm" disabled={hal >= totalHal - 1} onClick={() => setHal((h) => h + 1)}>Berikutnya →</button>
            </div>
          </div>
        )}
      </section>

      <p className="faint mt">
        “Akses 30h” menghitung berapa kali akun membuka halaman dalam 30 hari terakhir, bukan sekadar login.
        Akun dengan akses di bawah 3 ditandai “Jarang”.
      </p>
    </>
  );
}
