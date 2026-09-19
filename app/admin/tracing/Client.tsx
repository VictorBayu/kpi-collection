"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Pilih from "@/components/Pilih";
import Ikon from "@/components/Ikon";
import JudulHalaman from "@/components/JudulHalaman";
import KotakCari from "@/components/KotakCari";
import { rp, angka, nilai, namaPeriode, toISODate, tebakSatuan } from "@/lib/format";

/**
 * Tracing KPI — membongkar satu NIK dari data mentah sampai rupiah.
 *
 * Layar ini sengaja tidak meringkas. Ringkasan sudah ada di Data KPI, dan
 * ringkasan justru yang menyembunyikan kekeliruan susunan: indikator yang
 * pitanya bolong tetap menampilkan skor yang tampak wajar, bobot yang
 * berjumlah 97 tetap memberi angka akhir yang enak dibaca. Yang dicari
 * admin di sini adalah rantai sebab-akibatnya — bahan, pencapaian,
 * target, skor, bobot, lalu nominal — berikut tempat rantai itu putus.
 *
 * Tampilan mengikuti mockup "tracing_kpi_system_redesign": layar awal
 * dengan contoh NIK + panduan langkah, kartu indikator bergaya akordeon
 * dengan rumus di kotak kode gelap, dan panel audit data mentah dengan
 * penyaring kontrak/status syarat.
 */

const NADA_PERAN: Record<string, string> = {
  kpi: "netral", reguler: "netral", tier: "warn",
  reward: "good", penalty: "bad", nominal: "info", pendukung: "netral",
};

const NF2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/**
 * Angka polos, apa adanya — dipakai KHUSUS untuk batas pita nominal.
 *
 * Batas pita nominal (indikator_nominal) dicocokkan ke nilai indikator
 * "pemilih" yang skalanya bisa berbeda-beda — bukan selalu skala
 * indikator yang barisnya sedang ditampilkan. Menebak satuannya di sini
 * pernah salah memberi akhiran "%" pada batas yang sebenarnya rupiah
 * (mis. "100.000.000,00%"), padahal layar Create Indicator sendiri
 * menampilkannya sebagai angka polos tanpa satuan. Jadi di sini pun
 * angka polos — tidak menebak sama sekali.
 */
const angkaPolos = (v: number | null) => (v === null || v === undefined ? "—" : NF2.format(v));

const OP: Record<string, string> = {
  lebih: ">", lebih_sama: "≥", kurang: "<", kurang_sama: "≤", sama: "=",
  tidak_sama: "≠", termasuk: "salah satu dari", tidak_termasuk: "bukan",
  mengandung: "mengandung", kosong: "kosong", terisi: "terisi",
};

type Temuan = { nada: "bad" | "warn" | "info"; pesan: string };

export default function Client() {
  const [nik, setNik] = useState("");
  const [periode, setPeriode] = useState("");
  const [data, setData] = useState<any>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [dimuat, setDimuat] = useState<{ nik: string; periode: string }>({ nik: "", periode: "" });
  // Saat mencetak, semua indikator dibentangkan — log yang tercetak
  // dengan akordeon tertutup hanya berisi judul, bukan jejaknya.
  const [cetak, setCetak] = useState(false);
  const [contoh, setContoh] = useState<any[]>([]);
  const inputNik = useRef<HTMLInputElement>(null);

  // Muat awal tanpa NIK: hanya untuk mengisi daftar periode.
  useEffect(() => { void ambil("", ""); }, []);

  useEffect(() => {
    const selesai = () => setCetak(false);
    window.addEventListener("afterprint", selesai);
    return () => window.removeEventListener("afterprint", selesai);
  }, []);

  async function ambil(n: string, p: string) {
    setSibuk(true); setPesan(null);
    try {
      const u = new URL("/api/admin/tracing", location.origin);
      if (n) u.searchParams.set("nik", n);
      if (p) u.searchParams.set("periode", p);
      const r = await fetch(u, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal memuat."); setData(null); return; }
      if (!periode && j.periode) setPeriode(toISODate(j.periode));
      if (Array.isArray(j.contoh)) setContoh(j.contoh);
      setData(j.kosong ? { ...j, jejak: null } : j);
      // Yang tampil sekarang berasal dari NIK+periode ini; dipakai untuk
      // menandai bila isian di atas sudah diubah tapi belum ditelusuri.
      setDimuat({ nik: n, periode: p || (j.periode ? toISODate(j.periode) : "") });
    } finally { setSibuk(false); }
  }

  function cari(e: React.FormEvent) {
    e.preventDefault();
    if (!nik.trim()) { setPesan("Isi NIK dulu."); inputNik.current?.focus(); return; }
    void ambil(nik.trim(), periode);
  }

  function gantiNik() {
    setNik(""); setPesan(null);
    setData((d: any) => (d ? { periodeList: d.periodeList, periode: d.periode, kosong: true, jejak: null } : d));
    setDimuat({ nik: "", periode });
    requestAnimationFrame(() => inputNik.current?.focus());
  }

  function cetakLog() {
    setCetak(true);
    // Beri React satu putaran untuk membentangkan semua kartu dulu.
    setTimeout(() => window.print(), 120);
  }

  // Isian sudah berubah dari yang sedang tampil. Tanpa penanda ini, data
  // periode lama terbaca sebagai data periode yang baru dipilih — persis
  // kekeliruan yang paling mahal di layar pemeriksaan.
  const basi = !!data?.orang &&
    (dimuat.nik !== nik.trim() || dimuat.periode !== periode);

  const opsiPeriode = (data?.periodeList ?? []).map((p: any) => {
    const iso = toISODate(p.periode);
    return { nilai: iso, label: namaPeriode(iso) };
  });

  const jejak: any[] = data?.jejak ?? [];
  const produkList: string[] = [...new Set(jejak.map((j) => j.produk))];
  const temuan: Temuan[] = data?.temuan ?? [];
  const parah = temuan.filter((t) => t.nada === "bad").length;
  const waspada = temuan.filter((t) => t.nada === "warn").length;
  const nadaTemuan = parah ? "bad" : waspada ? "warn" : temuan.length ? "info" : "good";
  const orang = data?.orang;
  const periodeTampil = dimuat.periode || periode;

  return (
    <div className={"trc" + (cetak ? " trc-mencetak" : "")}>
      <JudulHalaman
        eyebrow="Audit perhitungan"
        meta={orang
          ? <span className="trc-meta-orang">{[orang.nama, orang.jabatan, `NIK ${orang.nik}`, orang.cabang].filter(Boolean).join(" • ")}</span>
          : "Data & indikator"}
        judul="Tracing KPI"
        deskripsi="Telusuri perhitungan satu NIK, langkah demi langkah — bahan, target, skor, sampai nominal yang diterima."
        aksi={orang ? (
          <div className="trc-status">
            <span className={"trc-lencana " + nadaTemuan}>
              <Ikon nama={nadaTemuan === "good" ? "checkCircle" : nadaTemuan === "bad" ? "alert" : "bulb"} ukuran={14} />
              {nadaTemuan === "good" ? "Susunan wajar"
                : parah ? `${parah} menghentikan angka` : `${temuan.length} hal perlu dilihat`}
            </span>
            <span className={"trc-lencana " + (data.periode_berjalan ? "accent" : "netral")}>
              <Ikon nama="calendar" ukuran={14} />
              {data.periode_berjalan ? "Periode berjalan" : "Periode lampau"}
            </span>
          </div>
        ) : undefined}
      />

      <form className={"card trc-cari tanpa-cetak" + (orang ? "" : " awal")} onSubmit={cari}>
        <label className="field trc-field-nik">
          <span>NIK karyawan</span>
          <span className="trc-input-ikon">
            <Ikon nama="badge" ukuran={16} />
            <input ref={inputNik} className="num" placeholder="mis. 20250733" inputMode="numeric"
                   value={nik} onChange={(e) => setNik(e.target.value)} autoComplete="off" />
            {orang && !basi && <Ikon nama="check" ukuran={15} className="trc-input-ok" />}
          </span>
        </label>
        <div className="field trc-field-periode">
          <span>Periode</span>
          <Pilih opsi={opsiPeriode} nilai={periode}
                 onPilih={(v) => setPeriode(v)}
                 placeholder="Periode…" />
        </div>
        <div className="trc-cari-aksi">
          <button className="btn primary" disabled={sibuk}>
            <Ikon nama="search" ukuran={16} /> {sibuk ? "Menelusuri…" : "Telusuri"}
          </button>
          {orang && (
            <button type="button" className="btn sekunder" onClick={gantiNik}>Ganti NIK</button>
          )}
        </div>
      </form>

      {pesan && <div className="alert-box warn"><span className="alert-ikon">!</span><span>{pesan}</span></div>}

      {basi && (
        <div className="alert-box info tanpa-cetak">
          <span className="alert-ikon">i</span>
          <span>
            Isian di atas sudah diubah. Yang tampil di bawah masih hasil penelusuran
            sebelumnya — tekan <b>Telusuri</b> untuk memuat yang baru.
          </span>
        </div>
      )}

      {/* Layar awal: contoh NIK sungguhan + panduan singkat. */}
      {!orang && (
        <div className="trc-awal">
          {contoh.length > 0 && (
            <div className="trc-contoh-nik">
              <span className="trc-contoh-judul"><Ikon nama="bulb" ukuran={15} /> Contoh NIK untuk dicoba:</span>
              <div className="trc-contoh-daftar">
                {contoh.map((c) => (
                  <button key={c.nik} type="button" disabled={sibuk}
                          onClick={() => { setNik(c.nik); void ambil(c.nik, periode); }}>
                    <b className="num">{c.nik}</b>
                    <span>• {[c.nama, [c.jabatan, c.cabang].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="card trc-panduan">
            <div className="trc-panduan-kepala">
              <span className="trc-kotak-ikon"><Ikon nama="formula" ukuran={17} /></span>
              <div>
                <h2>Langkah penelusuran formula &amp; bukti data</h2>
                <p>Angka yang tampil dibaca dari hasil mesin hitung, bukan dihitung ulang</p>
              </div>
            </div>
            <div className="trc-panduan-grid">
              <div>
                <span className="trc-no">1</span>
                <h3>Ketik NIK karyawan</h3>
                <p>NIK yang terdaftar di Pengguna &amp; Akses. Jabatannya menentukan target dan pagu yang dibaca.</p>
              </div>
              <div>
                <span className="trc-no">2</span>
                <h3>Pilih periode</h3>
                <p>Periode berjalan ikut menampilkan baris data mentahnya; periode lampau hanya angka yang tersimpan.</p>
              </div>
              <div>
                <span className="trc-no">3</span>
                <h3>Periksa rantainya</h3>
                <p>Bahan → target → skor → bobot → rupiah, lengkap dengan temuan susunan yang janggal.</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {orang && (
        <section className="card trc-orang">
          <div className="trc-orang-grid">
            <div>
              <span className="trc-label">Karyawan</span>
              <b>{orang.nama}</b>
              <span className="muted small num">NIK {orang.nik}</span>
            </div>
            <div>
              <span className="trc-label">Jabatan</span>
              <b>{orang.jabatan ?? "—"}</b>
              <span className="muted small">alias target: <code>{orang.alias ?? "—"}</code></span>
            </div>
            <div>
              <span className="trc-label">Wilayah</span>
              <b>{orang.cabang ?? "—"}</b>
              <span className="muted small">{orang.area ?? "—"}</span>
            </div>
            <div>
              <span className="trc-label">Periode</span>
              <b>{periodeTampil ? namaPeriode(periodeTampil) : "—"}</b>
              <span className="muted small">{jejak.length} baris indikator terdaftar</span>
            </div>
          </div>
          <div className="trc-orang-aksi tanpa-cetak">
            <Link className="btn sekunder sm" href={`/admin/kpi/${orang.nik}?periode=${periodeTampil}`}>
              <Ikon nama="table" ukuran={15} /> Lihat ringkasnya
            </Link>
            <button type="button" className="btn tint sm" onClick={cetakLog} disabled={!jejak.length}>
              <Ikon nama="file" ukuran={15} /> Cetak log tracing
            </button>
          </div>
        </section>
      )}

      {/* Temuan didahulukan. Kalau ditaruh di bawah, ia baru terbaca
          setelah admin sempat menyimpulkan sendiri dari angka di atasnya. */}
      {orang && (
        <section className={"trc-temuan " + nadaTemuan}>
          <div className="trc-temuan-kepala">
            <span className="trc-kotak-ikon">
              <Ikon nama={nadaTemuan === "bad" ? "alert" : nadaTemuan === "good" ? "checkCircle" : "bulb"} ukuran={17} />
            </span>
            <div className="trc-temuan-teks">
              <b>Pemeriksaan kewajaran susunan</b>
              <p>
                {temuan.length === 1
                  ? temuan[0].pesan
                  : temuan.length
                    ? `Ada ${temuan.length} hal pada susunan indikator, target, dan pagu jabatan ini yang perlu dilihat${parah ? ` — ${parah} di antaranya menghentikan angka` : ""}.`
                    : "Tidak ada kejanggalan pada susunan indikator, target, dan pagu jabatan ini."}
              </p>
            </div>
            <span className="trc-temuan-hitung">
              {temuan.length ? `${temuan.length} hal perlu dilihat` : "Semua wajar"}
            </span>
          </div>
          {temuan.length > 1 && (
            <ul className="trc-daftar-temuan">
              {temuan.map((t, i) => (
                <li key={i} className={t.nada}>
                  <span className="trc-bulat" aria-hidden>
                    {t.nada === "bad" ? "!" : t.nada === "warn" ? "?" : "i"}
                  </span>
                  <span>{t.pesan}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {orang && !jejak.length && (
        <div className="sd-kosong">
          <Ikon nama="search" ukuran={28} />
          <b>Tidak ada baris KPI</b>
          <span className="muted">
            NIK ini tidak punya baris KPI di periode {periodeTampil ? namaPeriode(periodeTampil) : "tersebut"}.
          </span>
        </div>
      )}

      {produkList.map((produk) => {
        const rows = jejak.filter((j) => j.produk === produk);
        const ins = (data.insentif ?? []).find((i: any) => i.produk === produk);
        const tierProduk = (data.tier_tabel ?? []).filter((t: any) => t.produk === produk);
        return (
          <section className="trc-produk" key={produk}>
            <div className="trc-produk-kepala">
              <div>
                <h2>Produk {produk}</h2>
                <span className="trc-pil">{rows.length} indikator dinilai</span>
              </div>
            </div>

            <div className="trc-rantai">
              {rows.map((j) => (
                <BarisJejak key={j.id} j={j} berjalan={!!data.periode_berjalan} paksaBuka={cetak} />
              ))}
            </div>

            <TotalSkor rows={rows} />

            {ins ? <KartuInsentif ins={ins} tier={tierProduk} /> : (
              <div className="alert-box warn trc-ins-kosong">
                <span className="alert-ikon">!</span>
                <span>Tidak ada baris insentif untuk produk {produk} — biasanya karena jabatan ini belum punya baris di Pagu Insentif.</span>
              </div>
            )}
          </section>
        );
      })}

      {(data?.yatim ?? []).length > 0 && (
        <section className="card trc-kartu trc-yatim-kartu">
          <div className="trc-kartu-kepala">
            <span className="trc-kotak-ikon bad"><Ikon nama="alert" ukuran={17} /></span>
            <div>
              <h2>Terdaftar tapi tidak terhitung</h2>
              <p>
                Indikator ini punya target aktif untuk jabatan {orang?.alias}, tapi tidak menghasilkan baris KPI di periode ini
              </p>
            </div>
          </div>
          <ul className="trc-yatim">
            {data.yatim.map((y: any, i: number) => (
              <li key={i}>
                <b>{y.indikator}</b>
                <span className="trc-pil">{y.produk}</span>
                <span className={"trc-peran " + (NADA_PERAN[y.peran] ?? "netral")}>{y.peran}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Penjumlahan skor indikator — jembatan antara skor dan rupiah.
 *
 * Tanpa baris ini, hubungan antara "Repeat Roll 5,00" di atas dan
 * "Skor insentif 0,00" di kartu insentif di bawah tidak kelihatan sama
 * sekali; keduanya seolah dua angka yang tidak berhubungan. Yang
 * menjembataninya adalah penjumlahan skor TERBOBOT, dan justru di situ
 * kesalahan susunan paling sering bersembunyi: bobot insentif yang
 * kosong membuat indikator berskor 5 tetap menyumbang nol rupiah,
 * dan itu tidak terlihat dari mana pun kecuali dijumlahkan di sini.
 */
function TotalSkor({ rows }: { rows: any[] }) {
  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  const ikut = rows.filter((r) => r.peran === "kpi" || r.peran === "reguler");
  if (!ikut.length) return null;

  const jumlah = (kol: string) => {
    const ada = ikut.filter((r) => num(r[kol]) !== null);
    return { ada: ada.length, nilai: ada.reduce((a, r) => a + Number(r[kol]), 0) };
  };
  const kpi = jumlah("skor_terbobot");
  const ins = jumlah("skor_terbobot_ins");
  const bobotKpi = jumlah("bobot");
  const bobotIns = jumlah("bobot_insentif");

  const barisTotal = (
    label: string, hasil: { ada: number; nilai: number },
    bobot: { ada: number; nilai: number }, keterangan: string, aksen: boolean,
  ) => (
    <div className="trc-total-baris">
      <span className="trc-total-label">{label}</span>
      <span className="trc-total-meta">
        {hasil.ada} dari {ikut.length} indikator · total bobot{" "}
        <b className={"num " + (Math.abs(bobot.nilai - 100) > 0.01 ? "bad" : "")}>
          {angka(bobot.nilai)}%
        </b>
      </span>
      {hasil.ada < ikut.length && <span className="trc-peran warn">{keterangan}</span>}
      <b className={"num trc-total-angka" + (hasil.ada ? (aksen ? " aksen" : "") : " kosong")}>
        {hasil.ada ? angka(hasil.nilai) : "—"}
      </b>
    </div>
  );

  return (
    <div className="card trc-kartu trc-total">
      <h3 className="trc-kartu-judul">Penjumlahan skor indikator produk ini</h3>
      {barisTotal("Total skor KPI", kpi, bobotKpi,
        `${ikut.length - kpi.ada} tanpa bobot KPI`, false)}
      {barisTotal("Total skor insentif", ins, bobotIns,
        `${ikut.length - ins.ada} tanpa bobot insentif`, true)}
      <p className="trc-catatan">
        Angka <b>total skor insentif</b> inilah yang dipakai kartu insentif di bawah —
        bukan skor KPI. Kalau bobot insentif kosong, indikator itu tidak menyumbang
        rupiah sama sekali betapapun tinggi skornya.
      </p>
    </div>
  );
}

/**
 * Rumus dari kolom `catatan`, diberi warna seperlunya di kotak kode.
 *
 * Hanya penanda yang pasti yang diwarnai — nama agregat, operator
 * antarkomponen, isi kurung syarat, dan persen. Nilai syarat tidak
 * ditebak dari kalimat, karena kata seperti "sama" atau "bukan" bisa
 * juga muncul di nama kolom. Baris baru disisipkan sebelum operator
 * yang menyambung dua komponen supaya pembilang dan penyebut terbaca
 * sebagai dua baris, persis urutan mesin menghitungnya.
 */
function RumusBerwarna({ teks }: { teks: string }) {
  const pola = /(\b(?:SUM|COUNT|AVG|MIN|MAX|DISTINCT|COUNT_DISTINCT)\b)|(\]\s*[÷/+\-−]\s)|([[\]])|(\d+(?:[.,]\d+)?\s?%)/g;
  const hasil: React.ReactNode[] = [];
  let akhir = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = pola.exec(teks))) {
    if (m.index > akhir) hasil.push(<Fragment key={k++}>{teks.slice(akhir, m.index)}</Fragment>);
    if (m[1]) hasil.push(<span key={k++} className="rw-agregat">{m[1]}</span>);
    else if (m[2]) {
      const op = m[2].replace("]", "").trim();
      hasil.push(<span key={k++} className="rw-kurung">]</span>, <br key={k++} />,
                 <span key={k++} className="rw-op">{op} </span>);
    } else if (m[3]) hasil.push(<span key={k++} className="rw-kurung">{m[3]}</span>);
    else if (m[4]) hasil.push(<span key={k++} className="rw-persen">{m[4]}</span>);
    akhir = m.index + m[0].length;
  }
  if (akhir < teks.length) hasil.push(<Fragment key={k++}>{teks.slice(akhir)}</Fragment>);
  return <>{hasil}</>;
}

/** Satu indikator, dibentangkan sebagai rantai bahan → skor. */
function BarisJejak({ j, berjalan, paksaBuka }: { j: any; berjalan: boolean; paksaBuka: boolean }) {
  const [bukaSendiri, setBuka] = useState(false);
  const buka = bukaSendiri || paksaBuka;
  const skor = j.skor_kpi === null || j.skor_kpi === undefined ? null : Number(j.skor_kpi);
  const nada = skor === null ? "kosong" : skor < 3 ? "bad" : skor >= 4 ? "good" : "mid";
  // Ditebak ulang dari nama indikator + nilainya — sama seperti yang
  // dipakai layar Data KPI — bukan dipercaya mentah dari kolom `satuan`.
  // Kolom itu sering diisi "persen" untuk indikator yang pencapaiannya
  // ternyata tersimpan sebagai angka 0–100 (bukan rasio 0–1), dan
  // nilai() mengalikannya lagi dengan 100 — itulah sumber "1082%".
  const pencapaianNum = j.pencapaian === null || j.pencapaian === undefined ? null : Number(j.pencapaian);
  const sat = tebakSatuan(j.indikator, pencapaianNum);
  // kali_seratus sudah pasti (bukan tebakan): rumus indikator ini secara
  // eksplisit dikalikan 100 di mesin hitung, jadi nilainya SUDAH berskala
  // 0–100 — cukup ditambah "%", tidak boleh dikalikan 100 lagi lewat
  // nilai(v,"persen") (itu mengasumsikan rasio 0–1, hasilnya jadi
  // "4316%"). Dipakai lewat helper tampilkanNilai() di bawah, bukan
  // langsung nilai(), untuk semua angka pada skala yang sama: pencapaian,
  // pita, dan ambang KPI3/4/5.
  const kaliSeratus = !!j.kali_seratus;
  const tampilkanNilai = (v: number | null) =>
    v === null || v === undefined ? "—" : kaliSeratus ? angka(v) + "%" : nilai(v, sat);

  const gerbangLulus = (g: any) => {
    const u = g.ukur === null || g.ukur === undefined ? null : Number(g.ukur);
    if (u === null) return false;
    const v = Number(g.nilai);
    switch (g.operator) {
      case "lebih": return u > v;
      case "lebih_sama": return u >= v;
      case "kurang": return u < v;
      case "kurang_sama": return u <= v;
      default: return u === v;
    }
  };

  const bentukRasio = j.komponen.length === 2 && kaliSeratus &&
    j.komponen[1]?.operator_sebelum === "/";

  return (
    <article className={"card trc-baris " + nada + (buka ? " buka" : "")}>
      <header>
        <button type="button" className="trc-kepala-tombol" aria-expanded={buka}
                onClick={() => setBuka(!bukaSendiri)}>
          <span className="trc-panah" aria-hidden><Ikon nama="chevronDown" ukuran={15} /></span>
          <span className="trc-nama">{j.indikator}</span>
          <span className={"trc-peran " + (NADA_PERAN[j.peran] ?? "netral")}>{j.peran ?? "kpi"}</span>
          {j.sumber !== "api" && <span className="trc-peran netral">dari Excel</span>}
        </button>
        <span className="trc-angka">
          <small>Pencapaian</small>
          <b className="num">{tampilkanNilai(pencapaianNum)}</b>
        </span>
        <span className="trc-angka">
          <small>Skor</small>
          <b className={"num " + nada}>{skor === null ? "—" : angka(skor)}</b>
        </span>
      </header>

      {buka && (
        <div className="trc-isi">
          {/* 1. Bahan */}
          <div className="trc-langkah">
            <h3 className="trc-langkah-judul"><span className="trc-no">1</span>Bahan — apa yang dihitung</h3>
            <div className="trc-rumus">
              {j.catatan ? <RumusBerwarna teks={j.catatan} /> : <span className="rw-kosong">(rumus tidak tercatat di baris ini)</span>}
            </div>
            {Number(j.faktor_pengakuan ?? 100) !== 100 && (
              <p className="trc-catatan">
                Diakui <b>{angka(Number(j.faktor_pengakuan))}%</b> dari pencapaian mentah — pendaftaran
                jabatan ini diberi faktor pengakuan sebagian (mis. karena jabatannya juga menghandle
                produk lain), diterapkan sebelum dicocokkan ke target/pita di bawah.
              </p>
            )}
            <ul className="trc-komponen">
              {j.komponen.map((k: any, i: number) => (
                <li key={i}>
                  <code>{k.agregat}{k.kolom ? `(${k.kolom_label})` : "(baris)"}</code>
                  <span className="trc-komponen-teks">
                    {k.kolom_sumber !== "api" && <span className="trc-pil">{k.kolom_sumber}</span>}
                    {k.pengakuan_kolom && <span className="trc-pil">pengakuan: {k.pengakuan_kolom}</span>}
                    {(k.syarat ?? []).length > 0 ? (
                      <span className="trc-syarat">
                        hanya baris dengan{" "}
                        {(k.syarat ?? []).map((s: any, x: number) => (
                          <span key={x}>
                            {x > 0 && <em> {k.gabung_syarat} </em>}
                            <b>{s.label}</b> {OP[s.operator] ?? s.operator}{" "}
                            <span className={"trc-nilai-syarat" + (s.operator === "tidak_termasuk" || s.operator === "tidak_sama" ? " bukan" : "")}>
                              {(s.nilai ?? []).join(", ") || "—"}
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : <span className="trc-syarat">semua baris, tanpa syarat</span>}
                  </span>
                </li>
              ))}
              {!j.komponen.length && <li className="muted">Komponen rumus tidak ditemukan — indikatornya mungkin sudah dihapus.</li>}
            </ul>

            <AuditBahan berjalan={berjalan} nik={j.nik} produk={j.produk}
                        indikatorId={j.indikator_id} jumlahKomponen={j.komponen.length}
                        rasio={bentukRasio}
                        keterangan={berjalan ? (
                          <>
                            Diambil dari <b>{NF0.format(j.baris_mentah)} baris data mentah</b> produk {j.produk} atas nama NIK ini
                            {" "}(kolom PIC: <code>nik_{j.peran_pic ?? "staff"}</code>)
                            {j.baris_mentah === 0 && " — nol baris berarti pencapaian pasti kosong, apa pun rumusnya."}
                          </>
                        ) : (
                          <>
                            Kolom PIC: <code>nik_{j.peran_pic ?? "staff"}</code>. Jumlah baris mentahnya tidak
                            ditampilkan untuk periode lampau — data mentah hanya menyimpan tarikan terkini,
                            jadi angkanya akan menggambarkan keadaan hari ini, bukan bahan yang dulu dipakai.
                          </>
                        )} />
          </div>

          {/* 2. Target */}
          <div className="trc-langkah">
            <h3 className="trc-langkah-judul"><span className="trc-no">2</span>Target — dibandingkan dengan apa</h3>
            {j.pita.length > 0 ? (
              <div className="trc-tabel-bingkai">
                <table className="trc-pita">
                  <thead><tr><th>Dari</th><th>Sampai</th><th className="r">Poin</th><th>Keterangan hasil</th></tr></thead>
                  <tbody>
                    {j.pita.map((p: any, i: number) => {
                      const v = j.pencapaian === null ? null : Number(j.pencapaian);
                      const kena = v !== null &&
                        (p.nilai_min === null || v >= Number(p.nilai_min)) &&
                        (p.nilai_max === null || v < Number(p.nilai_max));
                      return (
                        <tr key={i} className={kena ? "kena" : ""}>
                          <td className="num">{p.nilai_min === null ? "−∞" : tampilkanNilai(Number(p.nilai_min))}</td>
                          <td className="num">{p.nilai_max === null ? "∞" : tampilkanNilai(Number(p.nilai_max))}</td>
                          <td className="r num trc-poin">
                            {angka(Number(p.poin_min))}
                            {Number(p.poin_min) !== Number(p.poin_max) && ` – ${angka(Number(p.poin_max))}`}
                          </td>
                          <td>{kena
                            ? <span className="trc-jatuh">Nilai jatuh di sini · {tampilkanNilai(v)}</span>
                            : <span className="muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : j.target_kpi3 !== null ? (
              <div className="trc-ambang">
                <span><small>KPI 3</small><b className="num">{angka(Number(j.target_kpi3))}</b></span>
                <span><small>KPI 4</small><b className="num">{j.target_kpi4 === null ? "—" : angka(Number(j.target_kpi4))}</b></span>
                <span><small>KPI 5</small><b className="num">{j.target_kpi5 === null ? "—" : angka(Number(j.target_kpi5))}</b></span>
                <p className="trc-catatan">Skor diinterpolasi lurus di antara ambang.</p>
              </div>
            ) : (
              <p className="trc-catatan">Tidak ada pita maupun ambang KPI 3 — indikator ini memang tidak dinilai lewat skor.</p>
            )}
          </div>

          {/* 3. Skor & bobot */}
          <div className="trc-langkah">
            <h3 className="trc-langkah-judul"><span className="trc-no">3</span>Skor &amp; sumbangannya ke nilai akhir</h3>
            <div className="trc-sumbang">
              <div>
                <div>
                  <span className="trc-label">Bobot KPI</span>
                  <span className="trc-sumbang-rumus num">
                    Skor <b className={nada}>{skor === null ? "—" : angka(skor)}</b> × Bobot <b>{j.bobot === null ? "—" : angka(Number(j.bobot)) + "%"}</b>
                  </span>
                </div>
                <div className="r">
                  <span className="trc-label">Skor terbobot</span>
                  <b className="num trc-sumbang-hasil">{j.skor_terbobot === null ? "—" : angka(Number(j.skor_terbobot))}</b>
                </div>
              </div>
              <div>
                <div>
                  <span className="trc-label">Bobot insentif</span>
                  <span className="trc-sumbang-rumus num">
                    Skor <b className={nada}>{skor === null ? "—" : angka(skor)}</b> × Bobot <b>{j.bobot_insentif === null ? "—" : angka(Number(j.bobot_insentif)) + "%"}</b>
                  </span>
                </div>
                <div className="r">
                  <span className="trc-label">Skor insentif</span>
                  <b className="num trc-sumbang-hasil aksen">{j.skor_terbobot_ins === null ? "—" : angka(Number(j.skor_terbobot_ins))}</b>
                </div>
              </div>
            </div>
            {j.peran && !["kpi", "reguler"].includes(j.peran) && (
              <p className="trc-catatan">
                Peran <b>{j.peran}</b> tidak pernah menyumbang lewat bobot — sumbangannya ke rupiah dihitung di kartu insentif di bawah.
              </p>
            )}
          </div>

          {/* 4. Gerbang & nominal — hanya untuk indikator berperan nominal */}
          {(j.peran === "nominal" || j.gerbang.length > 0 || j.nominal_pita.length > 0) && (
            <div className="trc-langkah">
              <h3 className="trc-langkah-judul"><span className="trc-no">4</span>Syarat kelayakan &amp; nominal baris</h3>
              {j.gerbang.length > 0 ? (
                <ul className="trc-gerbang">
                  {j.gerbang.map((g: any, i: number) => {
                    const ok = gerbangLulus(g);
                    // Satuan gerbang ikut indikator yang DIUJI olehnya —
                    // bisa indikator lain (g.sumber_id terisi), bukan
                    // selalu indikator baris ini. Dicampur akan salah
                    // baca seperti bug "%" pada pita nominal di atas.
                    const ukurNum = g.ukur === null || g.ukur === undefined ? null : Number(g.ukur);
                    const tampil = (v: number | null) =>
                      v === null ? "tidak ada" : g.kali_seratus ? angka(v) + "%" : angkaPolos(v);
                    return (
                      <li key={i} className={ok ? "lulus" : "gagal"}>
                        <span className="trc-bulat" aria-hidden>{ok ? "✓" : "✕"}</span>
                        <span>
                          <b>{g.nama}</b> {OP[g.operator] ?? g.operator} <b className="num">{tampil(Number(g.nilai))}</b>
                          <span className="muted"> — nilai terbaca <b className="num">{tampil(ukurNum)}</b></span>
                        </span>
                        {g.sumber_tak_terdaftar && (
                          <span className="trc-peran bad">indikator sumber tidak terdaftar</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="trc-catatan">Tidak ada gerbang — tidak ada yang menahan pencairan baris ini.</p>
              )}

              {j.nominal_pita.length > 0 && (
                <div className="trc-tabel-bingkai">
                  <table className="trc-pita">
                    <thead><tr><th>Dari</th><th>Sampai</th><th className="r">Nominal</th></tr></thead>
                    <tbody>
                      {j.nominal_pita.map((p: any, i: number) => (
                        <tr key={i}>
                          <td className="num">{p.nilai_min === null ? "−∞" : angkaPolos(Number(p.nilai_min))}</td>
                          <td className="num">{p.nilai_max === null ? "∞" : angkaPolos(Number(p.nilai_max))}</td>
                          <td className="r num">{rp(Number(p.nominal))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className={"trc-hasil " + (Number(j.nominal_baris ?? 0) > 0 ? "good" : "bad")}>
                <span>Nominal baris ini{j.gerbang_gagal && <span className="trc-hasil-sebab"> — {j.gerbang_gagal}</span>}</span>
                <b className="num">{rp(Number(j.nominal_baris ?? 0))}</b>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** Perakitan rupiah: mekanisme, angka dasarnya, lalu reward/penalty. */
function KartuInsentif({ ins, tier }: { ins: any; tier: any[] }) {
  const n = (v: any) => (v === null || v === undefined ? 0 : Number(v));
  const mek = ins.mekanisme ?? "—";
  // Jabatan yang menghandle >1 produk dengan mekanisme 'pagu' (mis. MBS
  // MIX R2+R4): yang digabung hanya SKOR-nya, sementara pembagi dan pagu
  // tetap milik jabatan (lihat gabung_pagu di lib/hitung-indikator.ts).
  // Rumus per-produk lama tidak lagi utuh menjelaskan nominal_dasar produk
  // ini sendirian, jadi kartunya perlu menunjukkan langkah gabungannya
  // dulu, baru porsi produk ini.
  const gabungan = mek === "pagu" && Number(ins.jml_produk_gabungan ?? 1) > 1;
  const nominalJabatan = n(ins.skor_gabungan) < n(ins.ambang_gabungan) ? 0
    : Math.round((n(ins.skor_gabungan) / (n(ins.pembagi_gabungan) || 1)) * n(ins.pagu_gabungan));

  return (
    <div className="card trc-kartu trc-insentif">
      <div className="trc-insentif-kepala">
        <h3 className="trc-kartu-judul"><Ikon nama="wallet" ukuran={16} /> Perakitan insentif {ins.produk}</h3>
        <span className="trc-insentif-meta">Mekanisme <b>{mek}</b> • {ins.jabatan} • {ins.cabang}</span>
      </div>

      <div className="trc-rumus-terang num">
        {mek === "tier" ? (
          <>
            <span>Tier <b>{ins.tier ?? "—"}</b></span>
            <i>×</i>
            <span>Kelas cabang <b>{ins.kelas_cabang ?? "—"}</b></span>
            <i>=</i>
            <span>Nominal dasar <b>{rp(n(ins.nominal_dasar))}</b></span>
          </>
        ) : mek === "bersyarat" ? (
          <>
            <span>Jumlah nominal baris yang lolos syarat</span>
            <i>=</i>
            <span>Nominal dasar <b>{rp(n(ins.nominal_dasar))}</b></span>
          </>
        ) : gabungan ? (
          <>
            <span>Skor gabungan <b>{angka(n(ins.skor_gabungan))}</b></span>
            <i>÷</i>
            <span>Pembagi <b>{angka(n(ins.pembagi_gabungan))}</b></span>
            <i>×</i>
            <span>Pagu jabatan <b>{rp(n(ins.pagu_gabungan))}</b></span>
            <i>=</i>
            <span>Nominal jabatan <b>{rp(nominalJabatan)}</b></span>
          </>
        ) : (
          <>
            <span>Skor insentif <b>{angka(n(ins.skor_insentif))}</b></span>
            <i>÷</i>
            <span>Pembagi <b>{angka(n(ins.pembagi))}</b></span>
            <i>×</i>
            <span>Pagu <b>{rp(n(ins.pagu_nominal))}</b></span>
            <i>=</i>
            <span>Nominal dasar <b>{rp(n(ins.nominal_dasar))}</b></span>
          </>
        )}
      </div>

      {gabungan && (
        <p className="trc-catatan">
          Jabatan ini menghandle <b>{ins.jml_produk_gabungan}</b> produk dengan mekanisme pagu, jadi
          skor seluruh produknya dijumlahkan dulu (<b>{angka(n(ins.skor_gabungan))}</b>) dan dinilai
          terhadap ambang minimal <b className="num">{angka(n(ins.ambang_gabungan))}</b> — bukan produk
          ini sendirian yang harus menembus ambang. Pembagi dan pagunya tidak ikut dijumlahkan karena
          satu orang hanya punya satu pagu. Nominal jabatan <b>{rp(nominalJabatan)}</b> lalu dibagi ke
          tiap produk sesuai porsi skornya; bagian <b>{ins.produk}</b> ={" "}
          <b>{angka(n(ins.skor_insentif))}</b>/<b>{angka(n(ins.skor_gabungan))}</b> ={" "}
          <b>{rp(n(ins.nominal_dasar))}</b>.
        </p>
      )}

      {mek === "tier" && tier.length > 0 && (
        <details className="trc-tabel-tier">
          <summary><Ikon nama="chevronRight" ukuran={14} /> Tabel tier yang berlaku untuk jabatan ini ({tier.length} sel)</summary>
          <div className="trc-tabel-bingkai">
            <table className="trc-pita">
              <thead><tr><th>Tier</th><th>Kelas</th><th className="r">Nominal</th><th>Keterangan</th></tr></thead>
              <tbody>
                {tier.map((t, i) => {
                  const kena = String(t.tier) === String(ins.tier) && t.kelas === ins.kelas_cabang;
                  return (
                    <tr key={i} className={kena ? "kena" : ""}>
                      <td className="num">{t.tier}</td>
                      <td>{t.kelas}</td>
                      <td className="r num">{rp(Number(t.nominal))}</td>
                      <td>{kena ? <span className="trc-jatuh">Terpakai</span> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {mek === "pagu" && !gabungan && (
        <p className="trc-catatan">
          Ambang minimal <b className="num">{angka(n(ins.skor_minimal))}</b> — di bawah itu nominal dasar dipaksa nol.
        </p>
      )}

      <div className="trc-akhir">
        <div className="trc-akhir-urai num">
          <span>Dasar <b>{rp(n(ins.nominal_dasar))}</b></span>
          <span className="plus">+ Reward <b>{rp(n(ins.nominal_reward))}</b></span>
          <span className="minus">− Penalty <b>{rp(n(ins.nominal_penalty))}</b></span>
        </div>
        <div className="trc-akhir-total">
          <small>Diterima</small>
          <b className="num">{rp(n(ins.nominal))}</b>
        </div>
      </div>
      {ins.keterangan && (
        <p className="trc-ket"><Ikon nama="code" ukuran={13} /> Catatan mesin: {ins.keterangan}</p>
      )}
    </div>
  );
}

/**
 * Baris data mentah di balik satu komponen rumus — dimuat saat dibuka.
 *
 * Tidak ikut muatan jejak utama: seorang BCH bisa memegang ribuan
 * kontrak, dan memuatnya untuk setiap indikator sekaligus membuat
 * layar menunggu data yang belum tentu dibuka. Totalnya tetap dihitung
 * dari SELURUH baris di server — kalau dihitung dari halaman yang
 * tampil, "15 baris tersaring" akan terbaca sebagai "semua tersaring".
 * Penyaring kontrak/status hanya mengubah daftar, tidak mengubah rekap.
 */
function AuditBahan({
  berjalan, nik, produk, indikatorId, jumlahKomponen, rasio, keterangan,
}: {
  berjalan: boolean; nik: string; produk: string;
  indikatorId: string; jumlahKomponen: number;
  /**
   * Rumus berbentuk pembilang÷penyebut×100% (dua komponen, kali_seratus).
   * Hanya bentuk ini yang punya makna "Achievement"/"Workload" yang
   * konsisten — rumus lain (mis. A - B, atau lebih dari 2 komponen)
   * tetap diberi label posisi biasa supaya tidak menyesatkan.
   */
  rasio: boolean;
  keterangan: React.ReactNode;
}) {
  const [buka, setBuka] = useState(false);
  const [komponen, setKomponen] = useState(0);
  const [hal, setHal] = useState(1);
  const [cariKetik, setCariKetik] = useState("");
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState("semua");
  const [data, setData] = useState<any>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Kotak cari diterapkan setelah jeda singkat, supaya satu kontrak yang
  // diketik tidak memicu delapan permintaan berturut-turut.
  useEffect(() => {
    const t = setTimeout(() => { setCari(cariKetik.trim()); setHal(1); }, 350);
    return () => clearTimeout(t);
  }, [cariKetik]);

  useEffect(() => {
    if (!buka || !berjalan) return;
    let batal = false;
    (async () => {
      setSibuk(true); setGalat(null);
      try {
        const u = new URL("/api/admin/tracing/bahan", location.origin);
        u.searchParams.set("nik", nik);
        u.searchParams.set("produk", produk);
        u.searchParams.set("indikator_id", indikatorId);
        u.searchParams.set("komponen", String(komponen));
        u.searchParams.set("hal", String(hal));
        if (cari) u.searchParams.set("cari", cari);
        if (status !== "semua") u.searchParams.set("status", status);
        const r = await fetch(u, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (batal) return;
        if (!r.ok) { setGalat(j.error ?? "Gagal memuat baris."); setData(null); return; }
        setData(j);
      } finally { if (!batal) setSibuk(false); }
    })();
    return () => { batal = true; };
  }, [buka, berjalan, nik, produk, indikatorId, komponen, hal, cari, status]);

  const labelKomponen = (i: number) => (rasio ? (i === 0 ? "Achievement" : "Workload") : `Komponen ${i + 1}`);
  const pilihKomponen = jumlahKomponen > 1 && (
    <div className="trc-segmen" role="tablist" aria-label="Sisi rumus">
      {Array.from({ length: jumlahKomponen }, (_, i) => (
        <button key={i} type="button" role="tab" aria-selected={i === komponen}
                className={i === komponen ? "aktif" : ""}
                onClick={() => { setKomponen(i); setHal(1); if (!buka) setBuka(true); }}>
          {labelKomponen(i)}
        </button>
      ))}
    </div>
  );

  const jumlahTampil = data ? Number(data.jumlah_tampil ?? data.jumlah) : 0;
  const totalHal = data ? Math.max(1, Math.ceil(jumlahTampil / data.per_hal)) : 1;
  const kolomSyarat: string[] = data
    ? [...new Set((data.syarat_kolom ?? []).filter((k: string) => k && k !== data.kolom))] as string[]
    : [];
  const dari = data && data.baris.length ? (hal - 1) * data.per_hal + 1 : 0;
  const sampai = data ? (hal - 1) * data.per_hal + data.baris.length : 0;
  const tersaring = data ? data.jumlah - data.jumlah_lolos : 0;

  const opsiStatus = data ? [
    { nilai: "semua", label: `Semua status syarat (${NF0.format(data.jumlah)})` },
    { nilai: "lolos", label: `Lolos syarat (${NF0.format(data.jumlah_lolos)})` },
    { nilai: "tersaring", label: `Tersaring (${NF0.format(tersaring)})` },
  ] : [{ nilai: "semua", label: "Semua status syarat" }];

  // Nilai kolom utama berupa angka ditampilkan berformat; teks apa adanya.
  const format = (v: any) => {
    if (v === null || v === undefined || v === "") return "—";
    const x = typeof v === "number" ? v : /^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : null;
    return x === null ? String(v) : NF2.format(x);
  };

  return (
    <>
      <div className="trc-bahan-kaki">
        <p className="trc-catatan">{keterangan}</p>
        {berjalan && (
          <div className="trc-bahan-tombol tanpa-cetak">
            <button type="button" className="trc-tautan" aria-expanded={buka} onClick={() => setBuka(!buka)}>
              <Ikon nama={buka ? "eyeOff" : "eye"} ukuran={15} />
              {buka ? "Tutup" : "Lihat"} baris data mentah yang dipegang NIK ini
            </button>
            {!buka && pilihKomponen}
          </div>
        )}
      </div>

      {buka && berjalan && (
        <div className="trc-audit tanpa-cetak">
          <div className="trc-audit-alat">
            {pilihKomponen || <span className="trc-audit-judul"><Ikon nama="database" ukuran={15} /> Audit data mentah</span>}
            <div className="trc-audit-saring">
              <KotakCari nilai={cariKetik} onUbah={setCariKetik} placeholder="Cari no. kontrak…" lebar={260} />
              <div className="trc-audit-status">
                <Pilih opsi={opsiStatus} nilai={status} onPilih={(v) => { setStatus(v); setHal(1); }} />
              </div>
            </div>
          </div>

          {galat && <div className="alert-box warn"><span className="alert-ikon">!</span><span>{galat}</span></div>}
          {sibuk && !data && <p className="trc-catatan trc-memuat">Memuat baris data mentah…</p>}
          {data?.kosong && <p className="trc-catatan">{data.pesan}</p>}

          {data && !data.kosong && (
            <>
              {/* Total dihitung server atas seluruh baris, bukan atas halaman ini. */}
              <div className={"trc-audit-rekap" + (data.kolom ? "" : " tiga")}>
                <div>
                  <span>Baris dipegang NIK ini</span>
                  <b className="num">{NF0.format(data.jumlah)}</b>
                </div>
                <div>
                  <span>Lolos syarat <i className="trc-pil good">{NF0.format(data.jumlah_lolos)} baris</i></span>
                  <b className="num good">{NF0.format(data.jumlah_lolos)}</b>
                </div>
                {data.kolom ? (
                  <>
                    <div>
                      <span>Total {data.kolom_label ?? data.kolom}</span>
                      <b className="num">{angkaPolos(data.total)}</b>
                    </div>
                    <div className="pakai">
                      <span>Yang terpakai rumus ({data.agregat})</span>
                      <b className="num">{angkaPolos(data.total_lolos)}</b>
                    </div>
                  </>
                ) : (
                  <div className="pakai">
                    <span>Yang terpakai rumus ({data.agregat})</span>
                    <b className="num">{NF0.format(data.jumlah_lolos)} baris</b>
                  </div>
                )}
              </div>

              <div className={"trc-audit-tabel" + (sibuk ? " sibuk" : "")}>
                <table>
                  <thead>
                    <tr>
                      <th>Kontrak</th>
                      {data.kolom && <th className="r">{data.kolom_label ?? data.kolom}</th>}
                      {kolomSyarat.map((k) => <th key={k}>{k}</th>)}
                      <th className="c">Syarat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.baris.map((r: any, i: number) => (
                      <tr key={i} className={r.lulus_syarat ? "lolos" : "gagal"}>
                        <td className="num">{r.agreement_no ?? "—"}</td>
                        {data.kolom && <td className="r num">{format(r[data.kolom])}</td>}
                        {kolomSyarat.map((k) => (
                          <td key={k}>
                            {r[k] === null || r[k] === undefined || r[k] === ""
                              ? <span className="muted">—</span>
                              : <span className="trc-sel">{String(r[k])}</span>}
                          </td>
                        ))}
                        <td className="c">
                          <span className={"trc-status-syarat " + (r.lulus_syarat ? "lolos" : "gagal")}>
                            {r.lulus_syarat ? "Lolos syarat" : "Tersaring"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!data.baris.length && (
                      <tr><td colSpan={kolomSyarat.length + (data.kolom ? 3 : 2)} className="trc-tabel-kosong">
                        {cari || status !== "semua"
                          ? "Tidak ada baris yang cocok dengan penyaring ini."
                          : `Tidak ada baris data mentah produk ${produk} atas nama NIK ini.`}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="trc-audit-kaki">
                <span>
                  Menampilkan baris <b className="num">{dari}–{sampai}</b> dari{" "}
                  <b className="num">{NF0.format(jumlahTampil)}</b>
                  {jumlahTampil !== data.jumlah ? ` yang cocok (total ${NF0.format(data.jumlah)})` : " baris data mentah"}
                </span>
                {totalHal > 1 && (
                  <div className="trc-hal">
                    <button type="button" className="btn ghost sm" disabled={hal <= 1 || sibuk}
                            onClick={() => setHal((h) => Math.max(1, h - 1))}>← Sebelumnya</button>
                    <span>Halaman <b>{hal}</b> dari <b>{totalHal}</b></span>
                    <button type="button" className="btn ghost sm" disabled={hal >= totalHal || sibuk}
                            onClick={() => setHal((h) => Math.min(totalHal, h + 1))}>Berikutnya →</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
