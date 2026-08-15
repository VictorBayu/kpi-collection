"use client";

import { useEffect, useState, useCallback } from "react";

type User = {
  id: string; nik: string; nama: string; peran: string;
  jabatan: string | null; jabatan_master: string | null; level: string | null;
  cabang: string | null; area: string | null;
  aktif: boolean; login_count: number; access_count: number;
  akses_7h: number; akses_30h: number;
  last_login_at: string | null; last_access_at: string | null;
  suspended_at: string | null; suspended_reason: string | null;
};

type FormUser = {
  nik: string; nama: string; peran: string; jabatan: string;
  cabang: string; area: string; password: string;
  aktif: boolean; mustChange: boolean;
};

const KOSONG: FormUser = {
  nik: "", nama: "", peran: "karyawan", jabatan: "",
  cabang: "", area: "", password: "", aktif: true, mustChange: true,
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
  const [kabar, setKabar] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // null = form tertutup. { id: null } = tambah baru, { id: "..." } = edit.
  const [form, setForm] = useState<(FormUser & { id: string | null }) | null>(null);

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

  function bukaTambah() {
    setGalat(null); setKabar(null);
    setForm({ ...KOSONG, id: null });
  }

  function bukaEdit(u: User) {
    setGalat(null); setKabar(null);
    setForm({
      id: u.id, nik: u.nik, nama: u.nama, peran: u.peran,
      jabatan: u.jabatan ?? "", cabang: u.cabang ?? "", area: u.area ?? "",
      password: "", aktif: u.aktif && !u.suspended_at, mustChange: false,
    });
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSibuk(true); setGalat(null); setKabar(null);

    const baru = form.id === null;
    const res = await fetch("/api/admin/pengguna", {
      method: baru ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: form.id, nik: form.nik, nama: form.nama, peran: form.peran,
        jabatan: form.jabatan, cabang: form.cabang, area: form.area,
        password: form.password, aktif: form.aktif,
        must_change_password: form.mustChange,
      }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setForm(null);
    setKabar(baru ? `Pengguna ${form.nama} ditambahkan.` : `Perubahan untuk ${form.nama} tersimpan.`);
    muat();
  }

  async function hapus(u: User) {
    if (!confirm(
      `Hapus pengguna ${u.nama} (${u.nik})?\n\n` +
      `Kalau akun ini punya riwayat request atau impor, akun akan ` +
      `dinonaktifkan saja agar riwayatnya tidak ikut hilang.`
    )) return;

    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/pengguna", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(d.pesan ?? `Pengguna ${u.nama} dihapus.`);
    muat();
  }

  async function resetPassword(u: User) {
    const pw = prompt(`Password baru untuk ${u.nama} (minimal 8 karakter):`, "");
    if (pw === null) return;
    setSibuk(true); setGalat(null); setKabar(null);
    const res = await fetch("/api/admin/pengguna", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, aksi: "reset_password", password: pw }),
    });
    const d = await res.json();
    setSibuk(false);
    if (!res.ok) { setGalat(d.error); return; }
    setKabar(`Password ${u.nama} diganti. Dia akan diminta menggantinya saat login.`);
  }

  const totalHal = Math.ceil(list.length / PER);
  const tampil = list.slice(hal * PER, hal * PER + PER);

  const fmt = (v: string | null) =>
    v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const labelPeran = (p: string) => p === "admin" ? "Admin" : p === "atasan" ? "Atasan" : "Karyawan";

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Pengguna & Akses</h2>
          <p>Kelola akun login dan pantau seberapa sering tiap akun dipakai.</p>
        </div>
        <button className="btn" onClick={bukaTambah} disabled={sibuk}>+ Tambah pengguna</button>
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
      {kabar && <div className="banner good"><b>Selesai</b>{kabar}</div>}

      {form && (
        <section className="card card-pad mb">
          <h3 className="formtitle">
            {form.id === null ? "Tambah pengguna" : `Ubah data ${form.nama || "pengguna"}`}
          </h3>
          <form onSubmit={simpan}>
            <div className="formgrid">
              <label className="field">
                <span>NIK</span>
                <input className="num" inputMode="numeric" required value={form.nik}
                       placeholder="20240117"
                       onChange={(e) => setForm({ ...form, nik: e.target.value })} />
              </label>
              <label className="field">
                <span>Nama lengkap</span>
                <input required value={form.nama}
                       onChange={(e) => setForm({ ...form, nama: e.target.value })} />
              </label>
              <label className="field">
                <span>Jabatan</span>
                <input value={form.jabatan} placeholder="FC TT R2"
                       onChange={(e) => setForm({ ...form, jabatan: e.target.value })} />
              </label>
              <label className="field">
                <span>Peran aplikasi</span>
                <select value={form.peran}
                        onChange={(e) => setForm({ ...form, peran: e.target.value })}>
                  <option value="karyawan">Karyawan</option>
                  <option value="atasan">Atasan</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="field">
                <span>Cabang</span>
                <input value={form.cabang} placeholder="AMBON"
                       onChange={(e) => setForm({ ...form, cabang: e.target.value })} />
              </label>
              <label className="field">
                <span>Area</span>
                <input value={form.area} placeholder="AREA MALUKU-PAPUA"
                       onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </label>
              <label className="field">
                <span>{form.id === null ? "Password awal" : "Password baru (kosongkan bila tidak diganti)"}</span>
                <input type="text" value={form.password}
                       required={form.id === null}
                       placeholder={form.id === null ? "minimal 8 karakter" : "biarkan kosong"}
                       onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
            </div>

            <div className="formcheck">
              <label>
                <input type="checkbox" checked={form.aktif}
                       onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
                <span>Akun aktif (boleh login)</span>
              </label>
              <label>
                <input type="checkbox" checked={form.mustChange}
                       onChange={(e) => setForm({ ...form, mustChange: e.target.checked })} />
                <span>Wajib ganti password saat login berikutnya</span>
              </label>
            </div>

            <p className="faint small">
              Peran menentukan menu yang tampil. Yang menentukan KPI siapa saja yang
              bisa dilihat adalah <b>jabatan</b> — diatur di menu Master Hierarki.
            </p>

            <div className="formact">
              <button className="btn" type="submit" disabled={sibuk}>
                {sibuk ? "Menyimpan…" : "Simpan"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setForm(null)}>Batal</button>
            </div>
          </form>
        </section>
      )}

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
              <th>Pengguna</th>
              <th style={{ width: 150 }}>Jabatan</th>
              <th style={{ width: 90 }}>Peran</th>
              <th className="r" style={{ width: 90 }}>Akses 30h</th>
              <th style={{ width: 110 }}>Status</th>
              <th className="r" style={{ width: 200 }}>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((u) => {
              const suspended = !u.aktif || !!u.suspended_at;
              const jarang = u.akses_30h < 3 && !suspended;
              return (
                <tr key={u.id}>
                  <td><b>{u.nama}</b><div className="faint num">{u.nik} · {u.cabang ?? "—"}</div></td>
                  <td style={{ fontSize: 12.5 }}>
                    {u.jabatan ?? <span className="faint">—</span>}
                    {u.jabatan && !u.level && (
                      <div className="faint" style={{ fontSize: 11, color: "var(--warn)" }}>
                        belum ada di master hierarki
                      </div>
                    )}
                    {u.level && <div className="faint" style={{ fontSize: 11 }}>{u.level}</div>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{labelPeran(u.peran)}</td>
                  <td className="r num">
                    <span className={jarang ? "warnnum" : ""}>{u.akses_30h}</span>
                    <div className="faint" style={{ fontSize: 11 }}>
                      login {u.login_count} · {fmt(u.last_access_at)}
                    </div>
                  </td>
                  <td>
                    {suspended
                      ? <span className="chip c-tolak" title={u.suspended_reason ?? ""}>Nonaktif</span>
                      : jarang
                        ? <span className="chip c-proses">Jarang</span>
                        : <span className="chip c-selesai">Aktif</span>}
                  </td>
                  <td className="r">
                    <div className="rowact">
                      <button className="btn ghost sm" disabled={sibuk}
                              onClick={() => bukaEdit(u)}>Ubah</button>
                      <button className="btn ghost sm" disabled={sibuk}
                              onClick={() => resetPassword(u)}>Reset PW</button>
                      {suspended
                        ? <button className="btn ghost sm" disabled={sibuk}
                                  onClick={() => aksi(u.id, "aktifkan", u.nama)}>Aktifkan</button>
                        : <button className="btn ghost sm" disabled={sibuk}
                                  onClick={() => aksi(u.id, "suspend", u.nama)}>Nonaktifkan</button>}
                      <button className="btn danger sm" disabled={sibuk}
                              onClick={() => hapus(u)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!tampil.length && (
              <tr><td colSpan={6} className="empty">Tidak ada pengguna yang cocok dengan penyaringan.</td></tr>
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
