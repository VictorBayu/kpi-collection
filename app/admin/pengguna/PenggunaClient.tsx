"use client";

import { useEffect, useState, useCallback } from "react";
import Pilih from "@/components/Pilih";
import KotakCari from "@/components/KotakCari";
import Penyaring, { type Aturan, type Skema } from "./Penyaring";
import ImporPengguna from "./ImporPengguna";
import Ikon from "@/components/Ikon";
import JudulHalaman from "@/components/JudulHalaman";

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
  const [lihatPw, setLihatPw] = useState(false);

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
  const inisial = (nama: string) => {
    const k = nama.trim().split(/\s+/).filter(Boolean);
    return ((k[0]?.[0] ?? "") + (k.length > 1 ? k[k.length - 1][0] : k[0]?.[1] ?? "")).toUpperCase();
  };
  const persen = (n: number) => stat.total ? `${(n / stat.total * 100).toFixed(1).replace(".", ",")}%` : "—";

  /** Nomor halaman yang ditampilkan: awal, akhir, dan tetangga halaman aktif. */
  const nomorHal = Array.from({ length: totalHal }, (_, i) => i)
    .filter((i) => i === 0 || i === totalHal - 1 || Math.abs(i - hal) <= 1);

  const STAT = [
    { kunci: "", label: "Total pengguna", nilai: stat.total, satuan: "akun", catatan: "Seluruh akun terdaftar", ikon: "users", nada: "accent" },
    { kunci: "aktif", label: "Aktif", nilai: stat.aktif, satuan: "akun", catatan: `${persen(stat.aktif)} dari total`, ikon: "checkCircle", nada: "good" },
    { kunci: "jarang", label: "Jarang akses (30h < 3)", nilai: stat.jarang, satuan: "akun", catatan: "Perlu verifikasi supervisi", ikon: "alert", nada: "warn", lencana: stat.jarang ? "Perhatian" : undefined },
    { kunci: "suspend", label: "Dinonaktifkan", nilai: stat.suspend, satuan: "akun", catatan: "Login dibekukan", ikon: "lock", nada: "bad" },
  ] as const;

  return (
    <>
      <JudulHalaman
        eyebrow="Master data & keamanan"
        meta={`${stat.total.toLocaleString("id-ID")} akun terdaftar`}
        judul="Pengguna & Akses"
        deskripsi="Kelola akun login, penempatan jabatan, dan pantau seberapa sering tiap akun dipakai."
        aksi={
          <>
            <button className={"btn " + (impor ? "tint" : "ghost")} onClick={() => setImpor(!impor)} disabled={sibuk}>
              <Ikon nama={impor ? "chevronDown" : "upload"} ukuran={16} /> {impor ? "Tutup impor" : "Impor Excel (.xlsx)"}
            </button>
            <button className="btn nowrap" onClick={bukaTambah} disabled={sibuk}>
              <Ikon nama="plus" ukuran={16} tebal={2.2} /> Tambah pengguna
            </button>
          </>
        }
      />

      {impor && <ImporPengguna onSelesai={muat} />}

      <div className="pa-stat-grid">
        {STAT.map((k) => (
          <button key={k.kunci || "semua"} type="button"
                  className={"pa-stat" + (status === k.kunci ? " on" : "")}
                  aria-pressed={status === k.kunci}
                  onClick={() => setStatus(k.kunci)}>
            <span className="pa-stat-isi">
              <span className="km-label">
                {k.label}
                {"lencana" in k && k.lencana && <span className="km-lencana warn">{k.lencana}</span>}
              </span>
              <span className="km-nilai">
                <b className={"num " + (k.kunci ? k.nada : "")}>{k.nilai.toLocaleString("id-ID")}</b>
                <span className="km-satuan">{k.satuan}</span>
              </span>
              <span className="km-catatan">{k.catatan}</span>
            </span>
            <span className={"km-ikon " + k.nada}><Ikon nama={k.ikon} ukuran={20} /></span>
          </button>
        ))}
      </div>

      {galat && (
        <div className="alert-box bad mb" role="alert">
          <span className="alert-ikon" aria-hidden>✕</span>
          <span><b>Gagal.</b> {galat}</span>
          <button className="alert-tutup" aria-label="Tutup pesan" onClick={() => setGalat(null)}>×</button>
        </div>
      )}
      {kabar && (
        <div className="alert-box good mb" role="status">
          <span className="alert-ikon" aria-hidden>✓</span>
          <span><b>Perubahan berhasil disimpan.</b> {kabar}</span>
          <button className="alert-tutup" aria-label="Tutup pesan" onClick={() => setKabar(null)}>×</button>
        </div>
      )}

      {form && (
        <section className="card pa-form mb">
          <div className="sd-form-kepala">
            <span className="sd-ikon accent"><Ikon nama={form.id === null ? "userCog" : "pencil"} ukuran={20} /></span>
            <div className="pa-form-judul">
              <h3>{form.id === null ? "Tambah pengguna baru" : `Ubah data ${form.nama || "pengguna"}`}</h3>
              <p className="muted small">Lengkapi formulir untuk membuat kredensial akun dan hak akses.</p>
            </div>
            <button type="button" className="pa-tutup" aria-label="Tutup formulir" onClick={() => setForm(null)}>×</button>
          </div>
          <form onSubmit={simpan}>
            <div className="card-pad">
              <div className="pa-form-grid">
                <label className="field">
                  <span>NIK (nomor induk) *</span>
                  <input className="num" inputMode="numeric" required value={form.nik}
                         placeholder="contoh: 20240117"
                         onChange={(e) => setForm({ ...form, nik: e.target.value })} />
                  <small className="faint">Dipakai sebagai username login</small>
                </label>
                <label className="field">
                  <span>Nama lengkap *</span>
                  <input required value={form.nama} placeholder="Nama staf sesuai HRIS"
                         onChange={(e) => setForm({ ...form, nama: e.target.value })} />
                  <small className="faint">Nama resmi sesuai SK</small>
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
                  <small className="faint">Menentukan KPI siapa saja yang bisa dilihat</small>
                </label>
                <label className="field">
                  <span>Peran aplikasi *</span>
                  <Pilih
                    nilai={form.peran}
                    onPilih={(v) => setForm({ ...form, peran: v })}
                    opsi={peranOpsi.map((p) => ({
                      nilai: p.kode, label: p.nama,
                      ket: p.keterangan ?? `${p.menu} menu`,
                    }))}
                  />
                  <small className="faint">Level otorisasi menu</small>
                </label>
                <label className="field">
                  <span>Kantor cabang</span>
                  <input value={form.cabang} placeholder="AMBON"
                         onChange={(e) => setForm({ ...form, cabang: e.target.value })} />
                </label>
                <label className="field">
                  <span>Wilayah / area</span>
                  <input value={form.area} placeholder="AREA MALUKU-PAPUA"
                         onChange={(e) => setForm({ ...form, area: e.target.value })} />
                </label>
                <label className="field">
                  <span>{form.id === null ? "Password awal *" : "Password baru"}</span>
                  <span className="pa-pw">
                    <input type={lihatPw ? "text" : "password"} value={form.password}
                           required={form.id === null} autoComplete="new-password"
                           placeholder={form.id === null ? "minimal 8 karakter" : "kosongkan bila tidak diganti"}
                           onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    <button type="button" className="pa-pw-lihat" onClick={() => setLihatPw(!lihatPw)}
                            aria-label={lihatPw ? "Sembunyikan password" : "Tampilkan password"}>
                      <Ikon nama={lihatPw ? "eyeOff" : "eye"} ukuran={16} />
                    </button>
                  </span>
                  <small className="faint">Minimal 8 karakter</small>
                </label>
              </div>

              <div className="pa-cek">
                <label>
                  <input type="checkbox" checked={form.aktif}
                         onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
                  Akun aktif (boleh login ke sistem)
                </label>
                <label>
                  <input type="checkbox" checked={form.mustChange}
                         onChange={(e) => setForm({ ...form, mustChange: e.target.checked })} />
                  Wajib ganti password saat login berikutnya
                </label>
              </div>

              <div className="alert-box info">
                <span className="alert-ikon" aria-hidden>i</span>
                <span>
                  <b>Ketentuan akses:</b> peran menentukan menu yang tampil. Yang menentukan KPI siapa saja
                  yang bisa dilihat adalah <b>jabatan</b> — diatur lewat rantai hierarki di menu Master Hierarki.
                </span>
              </div>
            </div>
            <div className="sd-form-kaki">
              <button className="btn ghost" type="button" onClick={() => setForm(null)}>Batal</button>
              <button className="btn" type="submit" disabled={sibuk}>
                <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Menyimpan…" : form.id === null ? "Simpan pengguna" : "Simpan perubahan"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card pa-tabel-kartu">
        <div className="pa-alat">
          <div className="pa-alat-cari">
            <KotakCari nilai={cari} onUbah={setCari} lebar={420}
                       placeholder="Cari NIK atau nama staf…" />
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

        <div className="pa-penyaring">
          <Penyaring
            skema={skema} aturan={aturan} gabung={gabung}
            onUbah={setAturan} onGabung={setGabung}
            hasil={cocok} total={stat.total}
          />
        </div>

        <div className="tabel-scroll">
          <table className="pa-tabel">
            <thead>
              <tr>
                <th>Pengguna</th>
                <th>Jabatan &amp; penempatan</th>
                <th style={{ width: 120 }}>Peran</th>
                <th className="r" style={{ width: 130 }}>Akses 30h</th>
                <th style={{ width: 110 }}>Status</th>
                <th className="r" style={{ width: 88 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((u) => {
                const suspended = !u.aktif || !!u.suspended_at;
                const jarang = u.akses_30h < 3 && !suspended;
                return (
                  <tr key={u.id} className={suspended ? "mati" : ""}>
                    <td>
                      <div className="pa-orang">
                        <span className="pa-avatar" aria-hidden>{inisial(u.nama)}</span>
                        <div>
                          <div className="pa-nama">{u.nama}</div>
                          <div className="pa-sub num">{u.nik}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="pa-jab">
                        {u.jabatan ?? <span className="faint">tanpa jabatan</span>}
                        {u.jabatan && !u.level && (
                          <span className="tag-warn" title="Belum terdaftar di Master Hierarki">belum di hierarki</span>
                        )}
                      </div>
                      <div className="pa-sub">
                        {u.cabang ?? "—"}{u.area ? ` • ${u.area}` : ""}
                      </div>
                    </td>
                    <td><span className={"pa-peran " + u.peran}>{labelPeran(u.peran)}</span></td>
                    <td className="r">
                      <span className={"pa-akses num" + (jarang ? " jarang" : "")}>{u.akses_30h}</span>
                      <div className="pa-sub">{fmt(u.last_access_at)}</div>
                    </td>
                    <td>
                      {suspended
                        ? <span className="pa-status bad" title={u.suspended_reason ?? "Nonaktif"}>Nonaktif</span>
                        : jarang
                          ? <span className="pa-status warn">Jarang</span>
                          : <span className="pa-status good">Aktif</span>}
                    </td>
                    <td className="r">
                      <div className="pa-aksi">
                        <button className="pa-ikon-btn" title="Ubah data" aria-label={`Ubah data ${u.nama}`}
                                onClick={() => bukaEdit(u)}>
                          <Ikon nama="pencil" ukuran={16} />
                        </button>
                        {/* Tindakan lain di balik satu tombol supaya baris tetap pendek. */}
                        <details className="menu">
                          <summary title="Tindakan lain" aria-label={`Tindakan lain untuk ${u.nama}`}>⋯</summary>
                          <div className="menu-isi">
                            <button onClick={() => resetPassword(u)}>Reset password</button>
                            {suspended
                              ? <button className="baik" onClick={() => aksi(u.id, "aktifkan", u.nama)}>Aktifkan</button>
                              : <button className="hati" onClick={() => aksi(u.id, "suspend", u.nama)}>Nonaktifkan</button>}
                            <button className="bahaya" onClick={() => hapus(u)}>Hapus</button>
                          </div>
                        </details>
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
        </div>

        <div className="pa-pager">
          <span className="faint">
            {list.length
              ? <>Menampilkan <b>{hal * PER + 1}–{Math.min(hal * PER + PER, list.length)}</b> dari <b>{list.length.toLocaleString("id-ID")}</b> pengguna</>
              : "Tidak ada data"}
          </span>
          {totalHal > 1 && (
            <div className="pa-pager-btn">
              <button className="btn ghost sm" disabled={hal === 0} onClick={() => setHal((h) => h - 1)}>← Sebelumnya</button>
              {nomorHal.map((i, idx) => (
                <span key={i} className="pa-hal-wrap">
                  {idx > 0 && i - nomorHal[idx - 1] > 1 && <span className="pa-elipsis">…</span>}
                  <button className={"pa-hal num" + (i === hal ? " on" : "")}
                          aria-current={i === hal ? "page" : undefined}
                          onClick={() => setHal(i)}>{i + 1}</button>
                </span>
              ))}
              <button className="btn ghost sm" disabled={hal >= totalHal - 1} onClick={() => setHal((h) => h + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      </section>

      <p className="pa-catatan">
        <Ikon nama="shield" ukuran={16} />
        <span>
          “Akses 30h” menghitung berapa kali akun membuka halaman dalam 30 hari terakhir, bukan sekadar login.
          Akun dengan akses di bawah 3 ditandai “Jarang”.
        </span>
      </p>
    </>
  );
}
