"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Pilih from "@/components/Pilih";

type Sumber = {
  kode: string; nama: string; jenis: "utama" | "api" | "unggah";
  tabel: string; kunci_gabung: string; field_kunci: string | null;
  url: string | null; metode: string; header: Record<string, string>;
  per_cabang: boolean;
  param_cabang: string | null; param_tanggal: string | null;
  param_halaman: string | null; param_ukuran: string | null;
  ukuran_halaman: number; jalur_data: string | null;
  aktif: boolean; urutan: number; keterangan: string | null;
  ditarik_pada: string | null; baris_terakhir: number | null; galat: string | null;
  jumlahKolom: number; jumlahBaris: number;
};

type Form = {
  baru: boolean; kode: string; nama: string; jenis: "api" | "unggah";
  kunci_gabung: string; field_kunci: string; url: string; metode: string;
  header: string; per_cabang: boolean;
  param_cabang: string; param_tanggal: string; param_halaman: string;
  param_ukuran: string; ukuran_halaman: string; jalur_data: string;
  aktif: boolean; urutan: string; keterangan: string;
};

const kosong = (): Form => ({
  baru: true, kode: "", nama: "", jenis: "api",
  kunci_gabung: "agreement_no", field_kunci: "", url: "", metode: "GET",
  header: "", per_cabang: true,
  param_cabang: "BranchID", param_tanggal: "", param_halaman: "page",
  param_ukuran: "page_size", ukuran_halaman: "300", jalur_data: "data",
  aktif: true, urutan: "100", keterangan: "",
});

const dariSumber = (s: Sumber): Form => ({
  baru: false, kode: s.kode, nama: s.nama,
  jenis: s.jenis === "unggah" ? "unggah" : "api",
  kunci_gabung: s.kunci_gabung, field_kunci: s.field_kunci ?? "",
  url: s.url ?? "", metode: s.metode,
  header: Object.keys(s.header ?? {}).length ? JSON.stringify(s.header, null, 2) : "",
  per_cabang: s.per_cabang,
  param_cabang: s.param_cabang ?? "", param_tanggal: s.param_tanggal ?? "",
  param_halaman: s.param_halaman ?? "", param_ukuran: s.param_ukuran ?? "",
  ukuran_halaman: String(s.ukuran_halaman), jalur_data: s.jalur_data ?? "",
  aktif: s.aktif, urutan: String(s.urutan), keterangan: s.keterangan ?? "",
});

/**
 * Registri sumber data.
 *
 * Dulu daftar sumber tertanam di kode dan hanya ada dua. Layar ini
 * memindahkannya jadi data: API kedua, ketiga, dan seterusnya cukup
 * didaftarkan di sini, lalu kolom-kolomnya ditambahkan lewat CRUD Kolom
 * API seperti kolom lain.
 *
 * Urutan kerjanya sengaja dibuat terlihat di layar — daftar, kolom, tarik
 * — karena tiga langkah itu mudah terlupa salah satunya, dan sumber yang
 * sudah terdaftar tapi belum punya kolom akan diam saja tanpa memberi
 * tahu apa yang kurang.
 */
export default function Client() {
  const [daftar, setDaftar] = useState<Sumber[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [uji, setUji] = useState<{ kode: string; field: string[]; jumlah: number; pesan: string | null } | null>(null);

  const segarkan = useCallback(async () => {
    const r = await fetch("/api/admin/sumber", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat."); return; }
    setDaftar(j.sumber ?? []);
  }, []);

  useEffect(() => { segarkan(); }, [segarkan]);

  const ubah = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));

  async function kirim(cara: string, badan?: unknown, url = "/api/admin/sumber") {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch(url, {
        method: cara,
        headers: badan ? { "content-type": "application/json" } : undefined,
        body: badan ? JSON.stringify(badan) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal."); return null; }
      await segarkan();
      return j;
    } finally { setSibuk(false); }
  }

  async function simpan() {
    if (!form) return;
    let header: Record<string, string> = {};
    if (form.header.trim()) {
      try {
        header = JSON.parse(form.header);
        if (typeof header !== "object" || Array.isArray(header)) throw new Error();
      } catch {
        setPesan('Header harus JSON objek, mis. {"Authorization": "Bearer xxx"}.');
        return;
      }
    }
    const badan = {
      ...form, header,
      ukuran_halaman: Number(form.ukuran_halaman) || 300,
      urutan: Number(form.urutan) || 100,
    };
    const j = await kirim(form.baru ? "POST" : "PUT", badan);
    if (j) {
      setPesan(form.baru
        ? `Sumber "${form.kode}" terdaftar. Tabelnya dibuat: ${j.tabel}. Langkah berikutnya: tambahkan kolomnya di CRUD Kolom API.`
        : "Tersimpan.");
      setForm(null);
    }
  }

  async function ujiKoneksi(kode: string) {
    setSibuk(true); setPesan(null); setUji(null);
    try {
      const r = await fetch("/api/admin/sumber", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kode, aksi: "uji" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Uji koneksi gagal."); return; }
      setUji({ kode, field: j.field ?? [], jumlah: j.jumlah ?? 0, pesan: j.pesan });
    } finally { setSibuk(false); }
  }

  async function tarik(kode: string) {
    if (!confirm(`Tarik data dari sumber "${kode}" sekarang?`)) return;
    const j = await kirim("PATCH", { kode, aksi: "tarik" });
    if (j) {
      setPesan(j.berhasil
        ? `Berhasil — ${Number(j.baris).toLocaleString("id-ID")} kontrak tersimpan dari ${j.cabangSukses}/${j.cabangDiminta} cabang.`
        : `Gagal: ${j.pesan}`);
    }
  }

  const waktu = (t: string | null) =>
    t ? new Date(t).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <>
      <div className="sectionhead rowbetween">
        <div>
          <h2>Sumber Data</h2>
          <p>
            Daftar sumber yang boleh dipakai indikator. Sumber tambahan digabung
            ke data utama lewat nomor kontrak, satu baris per kontrak.
          </p>
        </div>
        <button className="btn" onClick={() => { setForm(kosong()); setUji(null); }}>
          + Sumber
        </button>
      </div>

      {pesan && (
        <div className={"alert mb " + (/Berhasil|Tersimpan|terdaftar/.test(pesan) ? "ok" : "bad")}>
          {pesan}
        </div>
      )}

      {form && (
        <section className="card card-pad mb">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>
            {form.baru ? "Sumber baru" : `Ubah ${form.kode}`}
          </h3>

          <div className="kolom-form">
            {form.baru && (
              <label className="field">
                <span>Kode</span>
                <input value={form.kode} placeholder="mis. api_bayar"
                       onChange={(e) => ubah({ kode: e.target.value.toLowerCase() })} />
              </label>
            )}
            <label className="field">
              <span>Nama</span>
              <input value={form.nama} placeholder="mis. API Pembayaran"
                     onChange={(e) => ubah({ nama: e.target.value })} />
            </label>
            <label className="field">
              <span>Jenis</span>
              <Pilih nilai={form.jenis} cari={false}
                     onPilih={(v) => ubah({ jenis: v as Form["jenis"] })}
                     opsi={[
                       { nilai: "api", label: "API", ket: "ditarik berkala dari endpoint" },
                       { nilai: "unggah", label: "Unggahan", ket: "diisi dari berkas Excel" },
                     ]} />
            </label>
            {form.baru && (
              <label className="field">
                <span>Kunci gabung</span>
                <input value={form.kunci_gabung}
                       onChange={(e) => ubah({ kunci_gabung: e.target.value.toLowerCase() })} />
                <small className="faint">Kolom penghubung ke data utama. Tidak bisa diubah setelah tabelnya dibuat.</small>
              </label>
            )}
          </div>

          {form.jenis === "api" && (
            <>
              <div className="kolom-form mt">
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Alamat API</span>
                  <input value={form.url} placeholder="https://contoh.co.id/api/v1/pembayaran"
                         onChange={(e) => ubah({ url: e.target.value })} />
                </label>
                <label className="field">
                  <span>Metode</span>
                  <Pilih nilai={form.metode} cari={false} onPilih={(v) => ubah({ metode: v })}
                         opsi={[{ nilai: "GET", label: "GET" }, { nilai: "POST", label: "POST" }]} />
                </label>
                <label className="field">
                  <span>Field kunci di respons</span>
                  <input value={form.field_kunci} placeholder="mis. AgreementNo"
                         onChange={(e) => ubah({ field_kunci: e.target.value })} />
                  <small className="faint">Kosong = sama dengan nama kunci gabung.</small>
                </label>
                <label className="field">
                  <span>Jalur data di respons</span>
                  <input value={form.jalur_data} placeholder="data"
                         onChange={(e) => ubah({ jalur_data: e.target.value })} />
                  <small className="faint">Pakai titik untuk yang bersarang, mis. result.rows.</small>
                </label>
              </div>

              <div className="kolom-form mt">
                <label className="field">
                  <span>Param halaman</span>
                  <input value={form.param_halaman} placeholder="page"
                         onChange={(e) => ubah({ param_halaman: e.target.value })} />
                </label>
                <label className="field">
                  <span>Param ukuran</span>
                  <input value={form.param_ukuran} placeholder="page_size"
                         onChange={(e) => ubah({ param_ukuran: e.target.value })} />
                </label>
                <label className="field">
                  <span>Baris per halaman</span>
                  <input value={form.ukuran_halaman} inputMode="numeric"
                         onChange={(e) => ubah({ ukuran_halaman: e.target.value })} />
                </label>
                <label className="field">
                  <span>Param tanggal</span>
                  <input value={form.param_tanggal} placeholder="kosongkan bila tidak perlu"
                         onChange={(e) => ubah({ param_tanggal: e.target.value })} />
                </label>
              </div>

              <label className="ind-cek mt">
                <input type="checkbox" checked={form.per_cabang}
                       onChange={(e) => ubah({ per_cabang: e.target.checked })} />
                Diminta per cabang (mengulang permintaan untuk tiap kode cabang aktif)
              </label>

              {form.per_cabang && (
                <label className="field mt" style={{ maxWidth: 320 }}>
                  <span>Param cabang</span>
                  <input value={form.param_cabang} placeholder="BranchID"
                         onChange={(e) => ubah({ param_cabang: e.target.value })} />
                </label>
              )}

              <label className="field mt">
                <span>Header tambahan (JSON)</span>
                <textarea rows={3} value={form.header}
                          placeholder={'{\n  "Authorization": "Bearer xxxxx"\n}'}
                          onChange={(e) => ubah({ header: e.target.value })} />
                <small className="faint">
                  Kosongkan bila API-nya terbuka. Nilai di sini ikut terkirim pada setiap permintaan.
                </small>
              </label>
            </>
          )}

          <label className="field mt">
            <span>Keterangan</span>
            <input value={form.keterangan} placeholder="untuk apa sumber ini dipakai"
                   onChange={(e) => ubah({ keterangan: e.target.value })} />
          </label>

          <label className="ind-cek mt">
            <input type="checkbox" checked={form.aktif}
                   onChange={(e) => ubah({ aktif: e.target.checked })} />
            Aktif
          </label>

          <div className="mt" style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={sibuk} onClick={simpan}>Simpan</button>
            <button className="btn ghost" disabled={sibuk} onClick={() => setForm(null)}>Batal</button>
          </div>
        </section>
      )}

      <div className="daftar-target">
        {daftar.map((s) => (
          <div className={"trow" + (s.aktif ? "" : " kurang")} key={s.kode}>
            <div className="trow-atas">
              <div className="trow-field trow-jabatan">
                <span className="trow-label">Sumber</span>
                <span className="trow-ringkas-teks" style={{ fontWeight: 600 }}>
                  {s.nama}
                  <span className={"tag-" + (s.jenis === "utama" ? "ok" : "warn")}>
                    {s.jenis === "utama" ? "utama" : s.jenis}
                  </span>
                </span>
                <span className="faint num">{s.kode} · {s.tabel}</span>
              </div>

              <div className="trow-field trow-produk">
                <span className="trow-label">Kolom</span>
                <span className="trow-ringkas-teks num">{s.jumlahKolom}</span>
              </div>

              <div className="trow-field trow-produk">
                <span className="trow-label">Kontrak</span>
                <span className="trow-ringkas-teks num">
                  {s.jumlahBaris < 0 ? "—" : s.jumlahBaris.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="trow-ringkas">
                <span className="trow-label">Penarikan terakhir</span>
                <span className="trow-ringkas-teks">
                  {s.jenis === "unggah" ? "diisi dari Excel" : waktu(s.ditarik_pada)}
                  {s.galat && <b style={{ color: "var(--bad)" }}> · gagal</b>}
                </span>
              </div>

              <div className="trow-aksi">
                {s.jenis === "api" && (
                  <>
                    <button className="btn ghost sm" disabled={sibuk}
                            onClick={() => ujiKoneksi(s.kode)}>Uji</button>
                    <button className="btn ghost sm" disabled={sibuk}
                            onClick={() => tarik(s.kode)}>Tarik</button>
                  </>
                )}
                <button className="btn ghost sm"
                        onClick={() => { setForm(dariSumber(s)); setUji(null); }}>Ubah</button>
                {s.jenis !== "utama" && (
                  <button className="btn ghost sm bahaya" disabled={sibuk}
                          onClick={async () => {
                            if (!confirm(`Hapus sumber "${s.kode}" dari daftar? Tabel datanya tidak ikut dihapus.`)) return;
                            const j = await kirim("DELETE", undefined,
                              `/api/admin/sumber?kode=${encodeURIComponent(s.kode)}`);
                            if (j) setPesan(`Sumber "${s.kode}" dihapus. Tabel ${j.tabelTersisa} dibiarkan apa adanya.`);
                          }}>Hapus</button>
                )}
              </div>
            </div>

            {s.galat && (
              <div className="alert bad" style={{ margin: "0 14px 12px" }}>
                Penarikan terakhir gagal: {s.galat}
              </div>
            )}

            {uji?.kode === s.kode && (
              <div className="trow-uji">
                <b>Hasil uji koneksi</b>
                {uji.pesan
                  ? <p className="muted small">{uji.pesan}</p>
                  : <p className="muted small">{uji.jumlah} baris terbaca pada halaman pertama.</p>}
                {uji.field.length > 0 && (
                  <>
                    <p className="faint small" style={{ marginBottom: 4 }}>
                      Nama field yang tersedia — pakai persis seperti ini pada isian
                      &quot;Field API&quot; tiap kolom di CRUD Kolom API:
                    </p>
                    <div className="chiprow">
                      {uji.field.map((f) => <code className="uji-field" key={f}>{f}</code>)}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {!daftar.length && (
          <div className="trow-kosong">
            Registri sumber belum terisi — jalankan migrasi v21 dulu.
          </div>
        )}
      </div>

      <p className="faint small mt">
        Setelah sumber didaftarkan, tambahkan kolomnya di{" "}
        <Link className="lnk" href="/admin/kolom-api">CRUD Kolom API</Link> dengan memilih
        sumber ini, lalu pilih sumbernya saat membuat indikator di{" "}
        <Link className="lnk" href="/admin/indikator">Create Indicator</Link>.
      </p>
    </>
  );
}
