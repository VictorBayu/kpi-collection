"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Pilih from "@/components/Pilih";
import Ikon from "@/components/Ikon";
import JudulHalaman, { KartuMetrik, TitikStatus } from "@/components/JudulHalaman";

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

  const aktifN = daftar.filter((d) => d.aktif).length;
  const totalKolom = daftar.reduce((n, d) => n + (d.jumlahKolom || 0), 0);
  const nApi = daftar.filter((d) => d.jenis !== "unggah").length;
  const nUnggah = daftar.filter((d) => d.jenis === "unggah").length;
  const nGagal = daftar.filter((d) => d.galat).length;
  const berhasil = (t: string) => /Berhasil|Tersimpan|terdaftar|dihapus/.test(t);

  const LABEL_JENIS = { utama: "Utama", api: "API", unggah: "Unggah" } as const;

  return (
    <>
      <JudulHalaman
        eyebrow="Integrasi indikator"
        meta={<><TitikStatus nada={aktifN ? "good" : "netral"} /> {aktifN} sumber aktif</>}
        judul="Sumber Data"
        deskripsi="Daftar sumber yang boleh dipakai untuk kalkulasi indikator. Sumber tambahan otomatis digabung ke data utama melalui nomor kontrak — satu baris per kontrak."
        aksi={
          <button className="btn" onClick={() => { setForm(kosong()); setUji(null); }}>
            <Ikon nama="plus" ukuran={16} tebal={2.2} /> Sumber
          </button>
        }
      />

      {pesan && (
        <div className={"alert-box mb " + (berhasil(pesan) ? "good" : "bad")} role="status">
          <span className="alert-ikon" aria-hidden>{berhasil(pesan) ? "✓" : "✕"}</span>
          <span>{pesan}</span>
          <button className="alert-tutup" aria-label="Tutup pesan" onClick={() => setPesan(null)}>×</button>
        </div>
      )}

      {form && (
        <section className="card sd-form mb">
          <div className="sd-form-kepala">
            <span className="sd-ikon accent"><Ikon nama={form.baru ? "plus" : "pencil"} ukuran={18} /></span>
            <div>
              <h3>{form.baru ? "Daftarkan sumber baru" : `Ubah sumber ${form.kode}`}</h3>
              <p className="muted small">
                {form.jenis === "api"
                  ? "Endpoint ditarik berkala lalu digabung ke data utama lewat kunci gabung."
                  : "Tabel diisi dari berkas Excel lewat menu Data Pendukung."}
              </p>
            </div>
          </div>
          <div className="card-pad">

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

          </div>
          <div className="sd-form-kaki">
            <button className="btn ghost" disabled={sibuk} onClick={() => setForm(null)}>Batal</button>
            <button className="btn" disabled={sibuk} onClick={simpan}>
              <Ikon nama="check" ukuran={16} tebal={2.2} /> {form.baru ? "Daftarkan sumber" : "Simpan perubahan"}
            </button>
          </div>
        </section>
      )}

      <div className="sd-daftar">
        {daftar.map((s) => (
          <article className={"sd-kartu" + (s.aktif ? "" : " nonaktif") + (s.galat ? " galat" : "")} key={s.kode}>
            <div className="sd-baris">
              <div className="sd-identitas">
                <span className={"sd-ikon " + (s.jenis === "unggah" ? "warn" : "accent")}>
                  <Ikon nama={s.jenis === "unggah" ? "sheet" : "database"} ukuran={22} />
                </span>
                <div className="sd-nama">
                  <div className="sd-nama-atas">
                    <h3>{s.nama}</h3>
                    <span className={"sd-jenis " + s.jenis}>{LABEL_JENIS[s.jenis]}</span>
                    {!s.aktif && <span className="sd-jenis mati">Nonaktif</span>}
                  </div>
                  <div className="sd-kode num">
                    <span>{s.kode}</span><span className="sd-sep">•</span><span>{s.tabel}</span>
                    <span className="sd-pk">{s.jenis === "utama" ? "PK" : "Lookup"}: {s.kunci_gabung}</span>
                  </div>
                </div>
              </div>

              <dl className="sd-metrik">
                <div>
                  <dt>Kolom</dt>
                  <dd><b className="num">{s.jumlahKolom}</b> atribut</dd>
                </div>
                <div>
                  <dt>Kontrak</dt>
                  <dd>
                    <b className="num">{s.jumlahBaris < 0 ? "—" : s.jumlahBaris.toLocaleString("id-ID")}</b>
                    {s.jumlahBaris >= 0 && " baris"}
                  </dd>
                </div>
                <div>
                  <dt>Penarikan terakhir</dt>
                  <dd className="sd-tarik">
                    {s.jenis === "unggah"
                      ? <><Ikon nama="file" ukuran={14} /> diisi dari Excel</>
                      : s.galat
                        ? <><TitikStatus nada="bad" /> <span className="num">{waktu(s.ditarik_pada)}</span> <span className="sd-gagal">· gagal</span></>
                        : <><TitikStatus nada={s.ditarik_pada ? "good" : "netral"} /> <span className="num">{waktu(s.ditarik_pada)}</span></>}
                  </dd>
                </div>
              </dl>

              <div className="sd-aksi">
                {s.jenis === "api" && (
                  <>
                    <button className="btn tint sm" disabled={sibuk}
                            onClick={() => ujiKoneksi(s.kode)}><Ikon nama="plug" ukuran={15} /> Uji</button>
                    <button className="btn tint sm" disabled={sibuk}
                            onClick={() => tarik(s.kode)}><Ikon nama="refresh" ukuran={15} /> Tarik</button>
                  </>
                )}
                <button className="btn tint sm"
                        onClick={() => { setForm(dariSumber(s)); setUji(null); }}><Ikon nama="pencil" ukuran={15} /> Ubah</button>
                {s.jenis !== "utama" && (
                  <button className="btn tint-bad sm" disabled={sibuk}
                          onClick={async () => {
                            if (!confirm(`Hapus sumber "${s.kode}" dari daftar? Tabel datanya tidak ikut dihapus.`)) return;
                            const j = await kirim("DELETE", undefined,
                              `/api/admin/sumber?kode=${encodeURIComponent(s.kode)}`);
                            if (j) setPesan(`Sumber "${s.kode}" dihapus. Tabel ${j.tabelTersisa} dibiarkan apa adanya.`);
                          }}><Ikon nama="trash" ukuran={15} /> Hapus</button>
                )}
              </div>
            </div>

            {s.keterangan && <p className="sd-ket">{s.keterangan}</p>}

            {s.galat && (
              <div className="alert-box bad sd-sisip">
                <span className="alert-ikon" aria-hidden>✕</span>
                <span><b>Penarikan terakhir gagal.</b> {s.galat}</span>
              </div>
            )}

            {uji?.kode === s.kode && (
              <div className="sd-uji">
                <div className="sd-uji-kepala">
                  <Ikon nama="plug" ukuran={16} /> <b>Hasil uji koneksi</b>
                  <span className="muted small">
                    {uji.pesan ?? `${uji.jumlah} baris terbaca pada halaman pertama.`}
                  </span>
                </div>
                {uji.field.length > 0 && (
                  <>
                    <p className="faint small">
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
          </article>
        ))}
        {!daftar.length && (
          <div className="sd-kosong">
            <Ikon nama="database" ukuran={28} />
            <b>Registri sumber belum terisi</b>
            <span className="muted">Jalankan migrasi v21 dulu, lalu muat ulang halaman ini.</span>
          </div>
        )}
      </div>

      <section className="sd-panduan">
        <span className="sd-ikon accent"><Ikon nama="bulb" ukuran={20} /></span>
        <div className="sd-panduan-teks">
          <h3>Panduan relasi dan pembuatan indikator</h3>
          <p>
            Setelah sumber didaftarkan, tambahkan kolomnya di{" "}
            <Link className="lnk" href="/admin/kolom-api">CRUD Kolom API</Link> dengan memilih
            sumber ini, lalu pilih sumbernya saat membuat indikator di{" "}
            <Link className="lnk" href="/admin/indikator">Create Indicator</Link>.
          </p>
        </div>
        <div className="sd-panduan-aksi">
          <Link className="btn sekunder" href="/admin/kolom-api">Kelola kolom</Link>
          <Link className="btn" href="/admin/indikator">Buat indikator</Link>
        </div>
      </section>

      <div className="km-grid tiga">
        <KartuMetrik label="Total sumber terdaftar" nilai={daftar.length} satuan="unit"
                     catatan={`${nApi} API/utama · ${nUnggah} tabel unggah`}
                     ikon={<Ikon nama="network" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Kolom siap pakai" nilai={totalKolom.toLocaleString("id-ID")} satuan="kolom"
                     catatan="Terdaftar di seluruh sumber"
                     ikon={<Ikon nama="columns" ukuran={20} />} nada="accent" />
        <KartuMetrik label="Kesehatan penarikan" nilai={`${daftar.length - nGagal}/${daftar.length}`} satuan="sehat"
                     catatan={nGagal ? `${nGagal} sumber gagal pada penarikan terakhir` : "Tidak ada penarikan yang gagal"}
                     ikon={<Ikon nama={nGagal ? "alert" : "checkCircle"} ukuran={20} />}
                     nada={nGagal ? "bad" : "good"} />
      </div>
    </>
  );
}
