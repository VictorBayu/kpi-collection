"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Pilih from "@/components/Pilih";
import { rp, angka, nilai, namaPeriode, toISODate, tebakSatuan } from "@/lib/format";

/**
 * Tracing KPI — membongkar perhitungan satu NIK dari data mentah sampai
 * rupiah, untuk memeriksa apakah indikator dan target yang disusun untuk
 * suatu jabatan sudah masuk akal.
 *
 * Layar Data KPI menjawab "berapa angkanya". Layar ini menjawab pertanyaan
 * yang lebih sulit: "kenapa angkanya segitu". Angka yang ditampilkan
 * DIBACA dari kpi_row/insentif_row (hasil mesin hitung), bukan dihitung
 * ulang di sini — supaya yang diperiksa adalah angka yang betul-betul
 * dipakai, bukan salinan kedua yang kebetulan sama.
 */

const NF2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Angka polos, apa adanya -- dipakai KHUSUS untuk batas pita nominal.
 *
 * Batas pita nominal (indikator_nominal) dicocokkan ke nilai indikator
 * "pemilih" yang skalanya bisa berbeda-beda -- bukan selalu skala
 * indikator yang barisnya sedang ditampilkan. Menebak satuannya di sini
 * pernah salah memberi akhiran "%" pada batas yang sebenarnya rupiah
 * (mis. "100.000.000,00%"), padahal layar Create Indicator sendiri
 * menampilkannya sebagai angka polos tanpa satuan.
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

  useEffect(() => { void ambil("", ""); }, []);

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
      setData(j.kosong ? { ...j, jejak: null } : j);
    } finally { setSibuk(false); }
  }

  function cari(e: React.FormEvent) {
    e.preventDefault();
    if (!nik.trim()) { setPesan("Isi NIK dulu."); return; }
    void ambil(nik.trim(), periode);
  }

  const opsiPeriode = (data?.periodeList ?? []).map((p: any) => {
    const iso = toISODate(p.periode);
    return { nilai: iso, label: namaPeriode(iso) };
  });

  const jejak: any[] = data?.jejak ?? [];
  const produkList: string[] = [...new Set(jejak.map((j) => j.produk))];
  const temuan: Temuan[] = data?.temuan ?? [];
  const parah = temuan.filter((t) => t.nada === "bad").length;

  return (
    <>
      <div className="dk-bar">
        <div className="dk-id">
          <h2>Tracing KPI</h2>
          <p className="faint">
            {data?.orang ? `${data.orang.nama} · ${data.orang.jabatan ?? "—"}` : "Telusuri perhitungan satu NIK, langkah demi langkah"}
          </p>
        </div>
      </div>

      <form className="card card-pad trc-cari" onSubmit={cari}>
        <label className="field">
          <span>NIK karyawan</span>
          <input className="num" placeholder="mis. 20250733"
                 value={nik} onChange={(e) => setNik(e.target.value)} autoComplete="off" />
        </label>
        <div className="field">
          <span>Periode</span>
          <Pilih opsi={opsiPeriode} nilai={periode}
                 onPilih={(v) => { setPeriode(v); if (nik.trim()) void ambil(nik.trim(), v); }}
                 placeholder="Periode…" />
        </div>
        <button className="btn" disabled={sibuk}>{sibuk ? "Menelusuri…" : "Telusuri"}</button>
      </form>

      {pesan && <div className="card card-pad narrow"><p className="muted">{pesan}</p></div>}

      {data?.orang && (
        <div className="card card-pad trc-orang">
          <div><span className="faint">Karyawan</span><b>{data.orang.nama}</b><span className="faint num">NIK {data.orang.nik}</span></div>
          <div><span className="faint">Jabatan</span><b>{data.orang.jabatan ?? "—"}</b><span className="faint">alias target: <code>{data.orang.alias ?? "—"}</code></span></div>
          <div><span className="faint">Wilayah</span><b>{data.orang.cabang ?? "—"}</b><span className="faint">{data.orang.area ?? "—"}</span></div>
          <div><span className="faint">Periode</span><b>{periode ? namaPeriode(periode) : "—"}</b><span className="faint">{jejak.length} baris indikator</span></div>
          <Link className="btn ghost sm" href={`/admin/kpi/${data.orang.nik}?periode=${periode}`}>Lihat ringkasnya</Link>
        </div>
      )}

      {data?.orang && (
        <div className={"card trc-temuan" + (parah ? " parah" : "")}>
          <div className="dk-judul">
            <h3>Pemeriksaan kewajaran susunan</h3>
            <span className="faint">
              {temuan.length
                ? `${temuan.length} hal perlu dilihat${parah ? ` · ${parah} menghentikan angka` : ""}`
                : "Tidak ada kejanggalan pada susunan indikator, target, dan pagu jabatan ini"}
            </span>
          </div>
          {temuan.length > 0 && (
            <ul className="trc-daftar-temuan">
              {temuan.map((t, i) => (
                <li key={i} className={t.nada}>
                  <span className="trc-bulat" aria-hidden>{t.nada === "bad" ? "!" : t.nada === "warn" ? "?" : "i"}</span>
                  <span>{t.pesan}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {data?.orang && !jejak.length && (
        <div className="card card-pad narrow">
          <h3>Tidak ada baris KPI</h3>
          <p className="muted">NIK ini tidak punya baris KPI di periode {periode ? namaPeriode(periode) : "tersebut"}.</p>
        </div>
      )}

      {produkList.map((produk) => {
        const rows = jejak.filter((j) => j.produk === produk);
        const ins = (data.insentif ?? []).find((i: any) => i.produk === produk);
        const tierProduk = (data.tier_tabel ?? []).filter((t: any) => t.produk === produk);
        return (
          <section className="card trc-produk" key={produk}>
            <div className="dk-judul">
              <h3>Produk {produk}</h3>
              <span className="faint">{rows.length} indikator dinilai</span>
            </div>
            <div className="trc-rantai">
              {rows.map((j) => (
                <BarisJejak key={j.id} j={j} berjalan={!!data.periode_berjalan} />
              ))}
            </div>
            {ins ? <KartuInsentif ins={ins} tier={tierProduk} /> : (
              <div className="card card-pad narrow trc-ins-kosong">
                <p className="muted">Tidak ada baris insentif untuk produk {produk} — biasanya karena jabatan ini belum punya baris di Pagu Insentif.</p>
              </div>
            )}
          </section>
        );
      })}

      {(data?.yatim ?? []).length > 0 && (
        <div className="card card-pad">
          <div className="dk-judul">
            <h3>Terdaftar tapi tidak terhitung</h3>
            <span className="faint">Punya target aktif untuk jabatan {data.orang?.alias}, tapi tidak menghasilkan baris KPI di periode ini</span>
          </div>
          <ul className="trc-yatim">
            {data.yatim.map((y: any, i: number) => (
              <li key={i}><b>{y.indikator}</b><span className="trc-chip">{y.produk}</span><span className="trc-chip">{y.peran}</span></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function BarisJejak({ j, berjalan }: { j: any; berjalan: boolean }) {
  const [buka, setBuka] = useState(false);
  const skor = j.skor_kpi === null || j.skor_kpi === undefined ? null : Number(j.skor_kpi);
  const nada = skor === null ? "" : skor < 3 ? "bad" : skor >= 4 ? "good" : "mid";
  // Ditebak ulang dari nama indikator + nilainya — sama seperti layar
  // Data KPI — bukan dipercaya mentah dari kolom `satuan`. Kolom itu
  // sering diisi "persen" untuk indikator yang pencapaiannya ternyata
  // tersimpan sebagai angka 0-100 (bukan rasio 0-1), dan nilai()
  // mengalikannya lagi dengan 100 -- itulah sumber "1082%".
  const pencapaianNum = j.pencapaian === null || j.pencapaian === undefined ? null : Number(j.pencapaian);
  const sat = tebakSatuan(j.indikator, pencapaianNum);
  // kali_seratus sudah pasti (bukan tebakan): rumus indikator ini secara
  // eksplisit dikalikan 100 di mesin hitung, jadi nilainya SUDAH berskala
  // 0-100 -- cukup ditambah "%", tidak boleh dikalikan 100 lagi lewat
  // nilai(v,"persen") (itu mengasumsikan rasio 0-1, hasilnya jadi
  // "4316%"). Dipakai lewat helper tampilkanNilai() untuk semua angka
  // pada skala yang sama: pencapaian, pita, dan ambang KPI3/4/5.
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

  return (
    <article className={"trc-baris " + nada}>
      <header onClick={() => setBuka(!buka)}>
        <span className={"trc-panah" + (buka ? " buka" : "")} aria-hidden>▸</span>
        <b className="trc-nama">{j.indikator}</b>
        <span className="trc-chip">{j.peran ?? "kpi"}</span>
        {j.sumber !== "api" && <span className="trc-chip">dari Excel</span>}
        <span className="trc-sela" />
        <span className="trc-angka"><small>Pencapaian</small><b className="num">{tampilkanNilai(pencapaianNum)}</b></span>
        <span className="trc-angka"><small>Skor</small><b className={"num " + nada}>{skor === null ? "—" : angka(skor)}</b></span>
      </header>

      {buka && (
        <div className="trc-isi">
          <div className="trc-langkah">
            <span className="trc-no">1</span>
            <div>
              <span className="faint">Bahan — apa yang dihitung</span>
              <p className="trc-rumus">{j.catatan ?? "(rumus tidak tercatat di baris ini)"}</p>
              <ul className="trc-komponen">
                {j.komponen.map((k: any, i: number) => (
                  <li key={i}>
                    <code>{k.agregat}{k.kolom ? `(${k.kolom_label})` : "(baris)"}</code>
                    {k.kolom_sumber !== "api" && <span className="trc-chip">{k.kolom_sumber}</span>}
                    {k.pengakuan_kolom && <span className="trc-chip">pengakuan: {k.pengakuan_kolom}</span>}
                    {(k.syarat ?? []).length > 0 && (
                      <span className="faint">
                        hanya baris dengan{" "}
                        {(k.syarat ?? []).map((s: any, x: number) => (
                          <span key={x}>
                            {x > 0 && <em> {k.gabung_syarat} </em>}
                            <b>{s.label}</b> {OP[s.operator] ?? s.operator} <b>{(s.nilai ?? []).join(", ") || "—"}</b>
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
                {!j.komponen.length && <li className="muted">Komponen rumus tidak ditemukan — indikatornya mungkin sudah dihapus.</li>}
              </ul>
              <p className="muted small">
                {berjalan ? (
                  <>Diambil dari <b>{j.baris_mentah}</b> baris data mentah produk {j.produk} atas nama NIK ini
                  {" "}(kolom PIC: <code>nik_{j.peran_pic ?? "staff"}</code>)
                  {j.baris_mentah === 0 && " — nol baris berarti pencapaian pasti kosong, apa pun rumusnya."}</>
                ) : (
                  <>Kolom PIC: <code>nik_{j.peran_pic ?? "staff"}</code>. Jumlah baris mentahnya tidak ditampilkan
                  untuk periode lampau — data mentah hanya menyimpan tarikan terkini.</>
                )}
              </p>
              <ContohBahan c={j.contoh_bahan} berjalan={berjalan} />
            </div>
          </div>

          <div className="trc-langkah">
            <span className="trc-no">2</span>
            <div>
              <span className="faint">Target — dibandingkan dengan apa</span>
              {j.pita.length > 0 ? (
                <table className="trc-pita">
                  <thead><tr><th>Dari</th><th>Sampai</th><th className="r">Poin</th></tr></thead>
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
                          <td className="r num">
                            {angka(Number(p.poin_min))}
                            {Number(p.poin_min) !== Number(p.poin_max) && ` – ${angka(Number(p.poin_max))}`}
                            {kena && <span className="trc-chip">nilai jatuh di sini</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : j.target_kpi3 !== null ? (
                <div className="trc-ambang">
                  <span>KPI 3 <b className="num">{angka(Number(j.target_kpi3))}</b></span>
                  <span>KPI 4 <b className="num">{j.target_kpi4 === null ? "—" : angka(Number(j.target_kpi4))}</b></span>
                  <span>KPI 5 <b className="num">{j.target_kpi5 === null ? "—" : angka(Number(j.target_kpi5))}</b></span>
                  <span className="faint">Skor diinterpolasi lurus di antara ambang.</span>
                </div>
              ) : (
                <p className="muted small">Tidak ada pita maupun ambang KPI 3 — indikator ini memang tidak dinilai lewat skor.</p>
              )}
            </div>
          </div>

          <div className="trc-langkah">
            <span className="trc-no">3</span>
            <div>
              <span className="faint">Skor & sumbangannya ke nilai akhir</span>
              <div className="trc-hitung">
                <span>Skor <b className={"num " + nada}>{skor === null ? "—" : angka(skor)}</b></span>
                <span aria-hidden>×</span>
                <span>Bobot KPI <b className="num">{j.bobot === null ? "—" : angka(Number(j.bobot)) + "%"}</b></span>
                <span aria-hidden>=</span>
                <span>Skor terbobot <b className="num">{j.skor_terbobot === null ? "—" : angka(Number(j.skor_terbobot))}</b></span>
              </div>
              <div className="trc-hitung">
                <span>Skor <b className="num">{skor === null ? "—" : angka(skor)}</b></span>
                <span aria-hidden>×</span>
                <span>Bobot insentif <b className="num">{j.bobot_insentif === null ? "—" : angka(Number(j.bobot_insentif)) + "%"}</b></span>
                <span aria-hidden>=</span>
                <span>Skor insentif <b className="num">{j.skor_terbobot_ins === null ? "—" : angka(Number(j.skor_terbobot_ins))}</b></span>
              </div>
              {j.peran && !["kpi", "reguler"].includes(j.peran) && (
                <p className="muted small">Peran <b>{j.peran}</b> tidak pernah menyumbang lewat bobot — sumbangannya ke rupiah dihitung di kartu insentif di bawah.</p>
              )}
            </div>
          </div>

          {(j.peran === "nominal" || j.gerbang.length > 0 || j.nominal_pita.length > 0) && (
            <div className="trc-langkah">
              <span className="trc-no">4</span>
              <div>
                <span className="faint">Syarat kelayakan & nominal baris</span>
                {j.gerbang.length > 0 ? (
                  <ul className="trc-gerbang">
                    {j.gerbang.map((g: any, i: number) => {
                      const ok = gerbangLulus(g);
                      // Satuan gerbang ikut indikator yang DIUJI olehnya --
                      // bisa indikator lain (g.sumber_id terisi), bukan
                      // selalu indikator baris ini.
                      const ukurNum = g.ukur === null || g.ukur === undefined ? null : Number(g.ukur);
                      const tampil = (v: number | null) =>
                        v === null ? "tidak ada" : g.kali_seratus ? angka(v) + "%" : angkaPolos(v);
                      return (
                        <li key={i} className={ok ? "lulus" : "gagal"}>
                          <span className="trc-bulat" aria-hidden>{ok ? "✓" : "✕"}</span>
                          <b>{g.nama}</b> {OP[g.operator] ?? g.operator} <b className="num">{tampil(Number(g.nilai))}</b>
                          <span className="faint">— nilai terbaca <b className="num">{tampil(ukurNum)}</b></span>
                          {g.sumber_tak_terdaftar && <span className="trc-chip">indikator sumber tidak terdaftar</span>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="muted small">Tidak ada gerbang — tidak ada yang menahan pencairan baris ini.</p>
                )}
                {j.nominal_pita.length > 0 && (
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
                )}
                <div className={"trc-hasil " + (Number(j.nominal_baris ?? 0) > 0 ? "good" : "bad")}>
                  Nominal baris ini: <b className="num">{rp(Number(j.nominal_baris ?? 0))}</b>
                  {j.gerbang_gagal && <span className="faint"> — {j.gerbang_gagal}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function KartuInsentif({ ins, tier }: { ins: any; tier: any[] }) {
  const n = (v: any) => (v === null || v === undefined ? 0 : Number(v));
  const mek = ins.mekanisme ?? "—";

  return (
    <div className="trc-insentif">
      <div className="dk-judul">
        <h3>Perakitan insentif {ins.produk}</h3>
        <span className="faint">Mekanisme <b>{mek}</b> · {ins.jabatan} · {ins.cabang}</span>
      </div>

      {mek === "tier" ? (
        <>
          <div className="trc-hitung besar">
            <span>Tier <b className="num">{ins.tier ?? "—"}</b></span>
            <span aria-hidden>×</span>
            <span>Kelas cabang <b>{ins.kelas_cabang ?? "—"}</b></span>
            <span aria-hidden>=</span>
            <span>Nominal dasar <b className="num">{rp(n(ins.nominal_dasar))}</b></span>
          </div>
          {tier.length > 0 && (
            <details className="trc-tabel-tier">
              <summary>Tabel tier yang berlaku untuk jabatan ini ({tier.length} sel)</summary>
              <table className="trc-pita">
                <thead><tr><th>Tier</th><th>Kelas</th><th className="r">Nominal</th></tr></thead>
                <tbody>
                  {tier.map((t, i) => {
                    const kena = String(t.tier) === String(ins.tier) && t.kelas === ins.kelas_cabang;
                    return (
                      <tr key={i} className={kena ? "kena" : ""}>
                        <td className="num">{t.tier}</td>
                        <td>{t.kelas}</td>
                        <td className="r num">{rp(Number(t.nominal))}{kena && <span className="trc-chip">terpakai</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          )}
        </>
      ) : mek === "bersyarat" ? (
        <div className="trc-hitung besar">
          <span>Jumlah nominal baris yang lolos syarat</span>
          <span aria-hidden>=</span>
          <span>Nominal dasar <b className="num">{rp(n(ins.nominal_dasar))}</b></span>
        </div>
      ) : (
        <div className="trc-hitung besar">
          <span>Skor insentif <b className="num">{angka(n(ins.skor_insentif))}</b></span>
          <span aria-hidden>÷</span>
          <span>Pembagi <b className="num">{angka(n(ins.pembagi))}</b></span>
          <span aria-hidden>×</span>
          <span>Pagu <b className="num">{rp(n(ins.pagu_nominal))}</b></span>
          <span aria-hidden>=</span>
          <span>Nominal dasar <b className="num">{rp(n(ins.nominal_dasar))}</b></span>
        </div>
      )}

      {mek === "pagu" && (
        <p className="muted small">Ambang minimal <b className="num">{angka(n(ins.skor_minimal))}</b> — di bawah itu nominal dasar dipaksa nol.</p>
      )}

      <div className="trc-akhir">
        <span>Dasar <b className="num">{rp(n(ins.nominal_dasar))}</b></span>
        <span className="plus">+ Reward <b className="num">{rp(n(ins.nominal_reward))}</b></span>
        <span className="minus">− Penalty <b className="num">{rp(n(ins.nominal_penalty))}</b></span>
        <span className="total">Diterima <b className="num">{rp(n(ins.nominal))}</b></span>
      </div>
      {ins.keterangan && <p className="muted small trc-ket">Catatan mesin: {ins.keterangan}</p>}
    </div>
  );
}

/**
 * Contoh baris data_mentah di balik komponen pertama satu indikator.
 *
 * Menjawab langsung "bahan apa yang masuk" — bukan cuma kalimat rumus,
 * tapi kontrak sungguhan: nomor, nilai kolomnya, dan apakah baris itu
 * lolos syarat komponen. Baris yang GAGAL syarat sengaja tetap
 * ditampilkan (dicoret), supaya kelihatan mana yang tersaring dan
 * kenapa — bukan cuma mana yang lolos.
 */
function ContohBahan({ c, berjalan }: { c: any; berjalan: boolean }) {
  if (!berjalan) return null;
  if (!c || !c.baris?.length) {
    return (
      <p className="muted small">
        Tidak ada contoh baris untuk ditampilkan — kolom komponennya tanpa nama (COUNT baris) atau tidak ada baris yang cocok.
      </p>
    );
  }

  const kolomLain = [...new Set([c.kolom, ...(c.syarat_kolom ?? [])].filter(Boolean))] as string[];

  return (
    <details className="trc-contoh">
      <summary>Lihat {c.baris.length} contoh baris data mentah (komponen pertama)</summary>
      <div className="trc-contoh-scroll">
        <table className="trc-pita">
          <thead>
            <tr>
              <th>Kontrak</th>
              {kolomLain.map((k) => <th key={k}>{k}</th>)}
              <th className="r">Syarat</th>
            </tr>
          </thead>
          <tbody>
            {c.baris.map((r: any, i: number) => (
              <tr key={i} className={r.lulus_syarat ? "" : "trc-gagal-row"}>
                <td className="num">{r.agreement_no ?? "—"}</td>
                {kolomLain.map((k) => <td key={k} className="num">{r[k] === null || r[k] === undefined ? "—" : String(r[k])}</td>)}
                <td className="r">{r.lulus_syarat ? <span className="trc-chip">lolos</span> : <span className="trc-chip">tersaring</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
