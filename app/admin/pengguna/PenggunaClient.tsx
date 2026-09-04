"use client";

import { useEffect, useState, useCallback } from "react";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";
import Penyaring, { type Aturan, type Skema } from "./Penyaring";
import ImporPengguna from "./ImporPengguna";

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
  const [status, setStatus] = useState("");
  const [urut, setUrut] = useState("akses");
  const [aturan, setAturan] = useState<Aturan[]>([]);
  const [gabung, setGabung] = useState<"dan" | "atau">("dan");
  const [skema, setSkema] = useState<Skema | null>(null);
  const [cocok, setCocok] = useState(0);
  const [impor, setImpor] = useState(false);
  const [hal, setHal] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // null = form tertutup. { id: null } = tambah baru, { id: "..." } = edit.
  const [form, setForm] = useState<(FormUser & { id: string | null }) | null>(null);

  // Daftar jabatan diambil dari master hierarki supaya admin memilih, bukan
  // mengetik bebas — salah ketik satu huruf membuat KPI orang itu tak terlihat.
  const [jabatanOpsi, setJabatanOpsi] = useState<
    { nilai: string; label: string; ket?: string; grup?: string }[]>([]);

  // Peran juga dibaca dari master, bukan daftar tetap: peran yang baru
  // dibuat lewat layar Peran & Hak Akses harus langsung bisa dipilih.
  const [peranOpsi, setPeranOpsi] = useState<
    { kode: string; nama: string; keterangan: string | null; menu: number }[]>([]);

  useEffect(() => {
    fetch("/api/admin/peran", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPeranOpsi(
        (d.peran ?? [])
          .filter((p: any) => p.aktif)
          .map((p: any) => ({
            kode: p.kode, nama: p.nama,
            keterangan: p.keterangan, menu: (p.menu ?? []).length,
          }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/hierarki").then((r) => r.json()).then((d) => {
      const urutLevel = ["manager_1","manager_2","manager_3","spv_level_2","spv_level_1","staff","admin"];
      const namaLevel: Record<string,string> = {
        manager_1:"Manager 1", manager_2:"Manager 2", manager_3:"Manager 3",
        spv_level_2:"SPV level 2", spv_level_1:"SPV level 1", staff:"Staff", admin:"Admin",
      };
      const list = (d.jabatan ?? [])
        .slice()
        .sort((a: any, b: any) =>
          urutLevel.indexOf(a.level) - urutLevel.indexOf(b.level) ||
          a.jabatan.localeCompare(b.jabatan))
        .map((j: any) => ({
          nilai: j.jabatan,
          label: j.jabatan,
          ket: j.alias?.length ? `alias: ${j.alias.join(", ")}` : undefined,
          grup: namaLevel[j.level] ?? j.level,
        }));
      setJabatanOpsi(list);
    }).catch(() => {});
  }, []);

  const muat = useCallback(async () => {
    // Kartu status di atas tetap bekerja sebagai jalan pintas: nilainya
    // diterjemahkan menjadi satu aturan filter, jadi hanya ada satu
    // mekanisme penyaringan di server.
    const semua: Aturan[] = [...aturan];
    if (status) semua.push({ kolom: "status", operator: "sama", nilai: status });

    const p = new URLSearchParams({
      cari, urut, gabung, filter: JSON.stringify(semua),
    });
    const d = await fetch(`/api/admin/pengguna?${p}`).then((r) => r.json());
    setList(d.list ?? []);
    setStat(d.stat ?? stat);
    setSkema(d.skema ?? null);
    setCocok(d.cocok ?? (d.list?.length ?? 0));
    setHal(0);
  }, [cari, status, urut, aturan, gabung]);

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
  // Nama peran dibaca dari master peran; kode yang belum punya nama
  // ditampilkan apa adanya agar tetap terbaca, bukan jadi "Karyawan" keliru.
  const labelPeran = (p: string) =>
    peranOpsi.find((x) => x.kode === p)?.nama ?? p;

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Pengguna & Akses</h2>
          <p>Kelola akun login dan pantau seberapa sering tiap akun dipakai.</p>
        </div>
        <div className="rowact">
          <button className="btn ghost" onClick={() => setImpor(!impor)} disabled={sibuk}>
            {impor ? "Tutup impor" : "↑ Impor Excel"}
          </button>
          <button className="btn nowrap" onClick={bukaTambah} disabled={sibuk}>+ Tambah pengguna</button>
        </div>
      </div>

      {impor && <ImporPengguna onSelesai={muat} />}

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
                <Pilih
                  nilai={form.jabatan}
                  onPilih={(v) => setForm({ ...form, jabatan: v })}
                  opsi={jabatanOpsi}
                  placeholder="Pilih jabatan"
                  bebas
                />
              </label>
              <label className="field">
                <span>Peran aplikasi</span>
                <Pilih
                  nilai={form.peran}
                  onPilih={(v) => setForm({ ...form, peran: v })}
                  opsi={peranOpsi.map((p) => ({
                    nilai: p.kode, label: p.nama,
                    ket: p.keterangan ?? `${p.menu} menu`,
                  }))}
                />
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
        <div className="filter-cari">
          <KotakCari nilai={cari} onUbah={setCari} lebar={260}
                     placeholder="Cari NIK atau nama" />
        </div>
        <div className="filter-pilih">
          <Pilih nilai={urut} onPilih={setUrut} cari={false}
                 opsi={[
                   { nilai: "akses", label: "Urut: akses tersedikit" },
                   { nilai: "akses_turun", label: "Urut: akses terbanyak" },
                   { nilai: "login", label: "Urut: login tersedikit" },
                   { nilai: "nama",  label: "Urut: nama" },
                   { nilai: "cabang", label: "Urut: cabang" },
                 ]} />
        </div>
      </div>

      <Penyaring
        skema={skema} aturan={aturan} gabung={gabung}
        onUbah={setAturan} onGabung={setGabung}
        hasil={cocok} total={stat.total}
      />

      <section className="card">
        <table className="tabel-padat">
          <thead>
            <tr>
              <th>Pengguna</th>
              <th>Jabatan &amp; penempatan</th>
              <th style={{ width: 88 }}>Peran</th>
              <th className="r" style={{ width: 96 }}>Akses 30h</th>
              <th style={{ width: 88 }}>Status</th>
              <th className="r" style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((u) => {
              const suspended = !u.aktif || !!u.suspended_at;
              const jarang = u.akses_30h < 3 && !suspended;
              return (
                <tr key={u.id}>
                  <td>
                    <div className="pg-nama">{u.nama}</div>
                    <div className="pg-sub num">{u.nik}</div>
                  </td>
                  <td>
                    <div className="pg-jab">
                      {u.jabatan ?? <span className="faint">tanpa jabatan</span>}
                      {u.jabatan && !u.level && (
                        <span className="tag-warn" title="Belum terdaftar di Master Hierarki">?</span>
                      )}
                    </div>
                    <div className="pg-sub">{u.cabang ?? u.area ?? "—"}</div>
                  </td>
                  <td><span className={"pg-peran " + u.peran}>{labelPeran(u.peran)}</span></td>
                  <td className="r">
                    <span className={"pg-akses num" + (jarang ? " jarang" : "")}>{u.akses_30h}</span>
                    <div className="pg-sub">{fmt(u.last_access_at)}</div>
                  </td>
                  <td>
                    {suspended
                      ? <span className="titik bad" title={u.suspended_reason ?? "Nonaktif"}>Nonaktif</span>
                      : jarang
                        ? <span className="titik warn">Jarang</span>
                        : <span className="titik good">Aktif</span>}
                  </td>
                  <td className="r">
                    {/* Tindakan disembunyikan di balik satu tombol: empat tombol
                        sejajar membuat tiap baris jadi tinggi, dan yang sering
                        dipakai sebenarnya cuma satu-dua. */}
                    <details className="menu">
                      <summary title="Tindakan">⋯</summary>
                      <div className="menu-isi">
                        <button onClick={() => bukaEdit(u)}>Ubah data</button>
                        <button onClick={() => resetPassword(u)}>Reset password</button>
                        {suspended
                          ? <button className="baik" onClick={() => aksi(u.id, "aktifkan", u.nama)}>Aktifkan</button>
                          : <button className="hati" onClick={() => aksi(u.id, "suspend", u.nama)}>Nonaktifkan</button>}
                        <button className="bahaya" onClick={() => hapus(u)}>Hapus</button>
                      </div>
                    </details>
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
