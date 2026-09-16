"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Pilih from "@/components/Pilih";
import Ikon from "@/components/Ikon";
import JudulHalaman from "@/components/JudulHalaman";
import { rp, angka, nilai, namaPeriode, toISODate } from "@/lib/format";

/**
 * Tracing KPI — membongkar satu NIK dari data mentah sampai rupiah.
 *
 * Layar ini sengaja tidak meringkas. Ringkasan sudah ada di Data KPI, dan
 * ringkasan justru yang menyembunyikan kekeliruan susunan: indikator yang
 * pitanya bolong tetap menampilkan skor yang tampak wajar, bobot yang
 * berjumlah 97 tetap memberi angka akhir yang enak dibaca. Yang dicari
 * admin di sini adalah rantai sebab-akibatnya — bahan, pencapaian,
 * target, skor, bobot, lalu nominal — berikut tempat rantai itu putus.
 */

const NADA_PERAN: Record<string, string> = {
  kpi: "accent", reguler: "accent", tier: "warn",
  reward: "good", penalty: "bad", nominal: "warn", pendukung: "netral",
};

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

  // Muat awal tanpa NIK: hanya untuk mengisi daftar periode.
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
      <JudulHalaman
        eyebrow="Tracing KPI"
        meta={data?.orang ? `${data.orang.nama} · ${data.orang.jabatan ?? "—"}` : "Pilih satu NIK"}
        judul="Telusuri skor & insentif satu karyawan"
        deskripsi="Membongkar perhitungan satu NIK langkah demi langkah — bahan, pencapaian, target, skor, sampai nominal — untuk memeriksa apakah indikator dan target yang disusun untuk jabatan itu sudah masuk akal."
      />

      <form className="card trc-cari" onSubmit={cari}>
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
        <button className="btn primary" disabled={sibuk}>
          <Ikon nama="search" ukuran={16} /> {sibuk ? "Menelusuri…" : "Telusuri"}
        </button>
      </form>

      {pesan && <div className="alert-box warn"><span className="alert-ikon">!</span><span>{pesan}</span></div>}

      {data?.orang && (
        <section className="card trc-orang">
          <div>
            <span className="km-label">Karyawan</span>
            <b>{data.orang.nama}</b>
            <span className="muted small num">NIK {data.orang.nik}</span>
          </div>
          <div>
            <span className="km-label">Jabatan</span>
            <b>{data.orang.jabatan ?? "—"}</b>
            <span className="muted small">alias target: <code>{data.orang.alias ?? "—"}</code></span>
          </div>
          <div>
            <span className="km-label">Wilayah</span>
            <b>{data.orang.cabang ?? "—"}</b>
            <span className="muted small">{data.orang.area ?? "—"}</span>
          </div>
          <div>
            <span className="km-label">Periode</span>
            <b>{periode ? namaPeriode(periode) : "—"}</b>
            <span className="muted small">{jejak.length} baris indikator</span>
          </div>
          <Link className="btn tint sm" href={`/admin/kpi/${data.orang.nik}?periode=${periode}`}>
            <Ikon nama="table" ukuran={15} /> Lihat ringkasnya
          </Link>
        </section>
      )}

      {/* Temuan didahulukan. Kalau ditaruh di bawah, ia baru terbaca
          setelah admin sempat menyimpulkan sendiri dari angka di atasnya. */}
      {data?.orang && (
        <section className={"card trc-temuan" + (parah ? " parah" : "")}>
          <div className="rk-kartu-kepala">
            <span className={"km-ikon " + (parah ? "bad" : temuan.length ? "warn" : "good")}>
              <Ikon nama={parah ? "alert" : temuan.length ? "bulb" : "checkCircle"} ukuran={20} />
            </span>
            <div>
              <h2>Pemeriksaan kewajaran susunan</h2>
              <p className="muted small">
                {temuan.length
                  ? `${temuan.length} hal perlu dilihat${parah ? ` · ${parah} menghentikan angka` : ""}`
                  : "Tidak ada kejanggalan pada susunan indikator, target, dan pagu jabatan ini"}
              </p>
            </div>
          </div>
          {temuan.length > 0 && (
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

      {data?.orang && !jejak.length && (
        <div className="sd-kosong">
          <Ikon nama="search" ukuran={28} />
          <b>Tidak ada baris KPI</b>
          <span className="muted">
            NIK ini tidak punya baris KPI di periode {periode ? namaPeriode(periode) : "tersebut"}.
          </span>
        </div>
      )}

      {produkList.map((produk) => {
        const rows = jejak.filter((j) => j.produk === produk);
        const ins = (data.insentif ?? []).find((i: any) => i.produk === produk);
        const tierProduk = (data.tier_tabel ?? []).filter((t: any) => t.produk === produk);
        return (
          <section className="card trc-produk" key={produk}>
            <div className="rk-kartu-kepala">
              <span className="km-ikon accent"><Ikon nama="box" ukuran={20} /></span>
              <div>
                <h2>Produk {produk}</h2>
                <p className="muted small">{rows.length} indikator dinilai</p>
              </div>
            </div>

            <div className="trc-rantai">
              {rows.map((j) => (
                <BarisJejak key={j.id} j={j} berjalan={!!data.periode_berjalan} />
              ))}
            </div>

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
        <section className="card">
          <div className="rk-kartu-kepala">
            <span className="km-ikon bad"><Ikon nama="alert" ukuran={20} /></span>
            <div>
              <h2>Terdaftar tapi tidak terhitung</h2>
              <p className="muted small">
                Indikator ini punya target aktif untuk jabatan {data.orang?.alias}, tapi tidak menghasilkan baris KPI di periode ini
              </p>
            </div>
          </div>
          <ul className="trc-yatim">
            {data.yatim.map((y: any, i: number) => (
              <li key={i}>
                <b>{y.indikator}</b>
                <span className="chip">{y.produk}</span>
                <span className={"km-lencana " + (NADA_PERAN[y.peran] ?? "netral")}>{y.peran}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Satu indikator, dibentangkan sebagai rantai bahan → skor. */
function BarisJejak({ j, berjalan }: { j: any; berjalan: boolean }) {
  const [buka, setBuka] = useState(false);
  const skor = j.skor_kpi === null || j.skor_kpi === undefined ? null : Number(j.skor_kpi);
  const nada = skor === null ? "kosong" : skor < 3 ? "bad" : skor >= 4 ? "good" : "mid";
  const sat = j.satuan ?? "unit";

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
        <Ikon nama="chevronRight" ukuran={15}
              className={"trc-panah" + (buka ? " buka" : "")} />
        <b className="trc-nama">{j.indikator}</b>
        <span className={"km-lencana " + (NADA_PERAN[j.peran] ?? "netral")}>{j.peran ?? "kpi"}</span>
        {j.sumber !== "api" && <span className="chip">dari Excel</span>}
        <span className="trc-sela" />
        <span className="trc-angka">
          <small>Pencapaian</small>
          <b className="num">{j.pencapaian === null ? "—" : nilai(Number(j.pencapaian), sat)}</b>
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
            <span className="trc-no">1</span>
            <div>
              <span className="km-label">Bahan — apa yang dihitung</span>
              <p className="trc-rumus">{j.catatan ?? "(rumus tidak tercatat di baris ini)"}</p>
              <ul className="trc-komponen">
                {j.komponen.map((k: any, i: number) => (
                  <li key={i}>
                    <code>{k.agregat}{k.kolom ? `(${k.kolom_label})` : "(baris)"}</code>
                    {k.kolom_sumber !== "api" && <span className="chip">{k.kolom_sumber}</span>}
                    {k.pengakuan_kolom && <span className="chip">pengakuan: {k.pengakuan_kolom}</span>}
                    {(k.syarat ?? []).length > 0 && (
                      <span className="trc-syarat">
                        hanya baris dengan{" "}
                        {(k.syarat ?? []).map((s: any, x: number) => (
                          <span key={x}>
                            {x > 0 && <em> {k.gabung_syarat} </em>}
                            <b>{s.label}</b> {OP[s.operator] ?? s.operator}{" "}
                            <b>{(s.nilai ?? []).join(", ") || "—"}</b>
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
                  <>
                    Diambil dari <b>{j.baris_mentah}</b> baris data mentah produk {j.produk} atas nama NIK ini
                    {" "}(kolom PIC: <code>nik_{j.peran_pic ?? "staff"}</code>)
                    {j.baris_mentah === 0 && " — nol baris berarti pencapaian pasti kosong, apa pun rumusnya."}
                  </>
                ) : (
                  <>
                    Kolom PIC: <code>nik_{j.peran_pic ?? "staff"}</code>. Jumlah baris mentahnya tidak
                    ditampilkan untuk periode lampau — data mentah hanya menyimpan tarikan terkini,
                    jadi angkanya akan menggambarkan keadaan hari ini, bukan bahan yang dulu dipakai.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* 2. Target */}
          <div className="trc-langkah">
            <span className="trc-no">2</span>
            <div>
              <span className="km-label">Target — dibandingkan dengan apa</span>
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
                          <td className="num">{p.nilai_min === null ? "−∞" : nilai(Number(p.nilai_min), sat)}</td>
                          <td className="num">{p.nilai_max === null ? "∞" : nilai(Number(p.nilai_max), sat)}</td>
                          <td className="r num">
                            {angka(Number(p.poin_min))}
                            {Number(p.poin_min) !== Number(p.poin_max) && ` – ${angka(Number(p.poin_max))}`}
                            {kena && <span className="chip good">nilai jatuh di sini</span>}
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
                  <span className="muted small">Skor diinterpolasi lurus di antara ambang.</span>
                </div>
              ) : (
                <p className="muted small">Tidak ada pita maupun ambang KPI 3 — indikator ini memang tidak dinilai lewat skor.</p>
              )}
            </div>
          </div>

          {/* 3. Skor & bobot */}
          <div className="trc-langkah">
            <span className="trc-no">3</span>
            <div>
              <span className="km-label">Skor & sumbangannya ke nilai akhir</span>
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
                <p className="muted small">
                  Peran <b>{j.peran}</b> tidak pernah menyumbang lewat bobot — sumbangannya ke rupiah dihitung di kartu insentif di bawah.
                </p>
              )}
            </div>
          </div>

          {/* 4. Gerbang & nominal — hanya untuk indikator berperan nominal */}
          {(j.peran === "nominal" || j.gerbang.length > 0 || j.nominal_pita.length > 0) && (
            <div className="trc-langkah">
              <span className="trc-no">4</span>
              <div>
                <span className="km-label">Syarat kelayakan & nominal baris</span>
                {j.gerbang.length > 0 ? (
                  <ul className="trc-gerbang">
                    {j.gerbang.map((g: any, i: number) => {
                      const ok = gerbangLulus(g);
                      return (
                        <li key={i} className={ok ? "lulus" : "gagal"}>
                          <span className="trc-bulat" aria-hidden>{ok ? "✓" : "✕"}</span>
                          <b>{g.nama}</b> {OP[g.operator] ?? g.operator} <b className="num">{angka(Number(g.nilai))}</b>
                          <span className="muted">
                            — nilai terbaca{" "}
                            <b className="num">{g.ukur === null ? "tidak ada" : angka(Number(g.ukur))}</b>
                          </span>
                          {g.sumber_tak_terdaftar && (
                            <span className="km-lencana bad">indikator sumber tidak terdaftar</span>
                          )}
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
                          <td className="num">{p.nilai_min === null ? "−∞" : nilai(Number(p.nilai_min), sat)}</td>
                          <td className="num">{p.nilai_max === null ? "∞" : nilai(Number(p.nilai_max), sat)}</td>
                          <td className="r num">{rp(Number(p.nominal))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className={"trc-hasil " + (Number(j.nominal_baris ?? 0) > 0 ? "good" : "bad")}>
                  Nominal baris ini: <b className="num">{rp(Number(j.nominal_baris ?? 0))}</b>
                  {j.gerbang_gagal && <span className="muted"> — {j.gerbang_gagal}</span>}
                </div>
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

  return (
    <div className="trc-insentif">
      <div className="rk-kartu-kepala">
        <span className="km-ikon good"><Ikon nama="wallet" ukuran={20} /></span>
        <div>
          <h2>Perakitan insentif {ins.produk}</h2>
          <p className="muted small">Mekanisme <b>{mek}</b> · {ins.jabatan} · {ins.cabang}</p>
        </div>
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
                        <td className="r num">{rp(Number(t.nominal))}{kena && <span className="chip good">terpakai</span>}</td>
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
        <p className="muted small">
          Ambang minimal <b className="num">{angka(n(ins.skor_minimal))}</b> — di bawah itu nominal dasar dipaksa nol.
        </p>
      )}

      <div className="trc-akhir">
        <span>Dasar <b className="num">{rp(n(ins.nominal_dasar))}</b></span>
        <span className="plus">+ Reward <b className="num">{rp(n(ins.nominal_reward))}</b></span>
        <span className="minus">− Penalty <b className="num">{rp(n(ins.nominal_penalty))}</b></span>
        <span className="total">
          Diterima <b className="num">{rp(n(ins.nominal))}</b>
        </span>
      </div>
      {ins.keterangan && <p className="muted small trc-ket">Catatan mesin: {ins.keterangan}</p>}
    </div>
  );
}
