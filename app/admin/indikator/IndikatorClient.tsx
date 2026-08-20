"use client";

import { Fragment, useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import Kartu, { type Komponen, type Kolom } from "./Kartu";

type Ringkas = {
  id: string; nama: string; satuan: string; kali_seratus: boolean;
  peran_pic: string; aktif: boolean; komponen: number; terdaftar: number;
};
type Pita = { nilai_min: string; nilai_max: string; poin_min: string; poin_max: string };
type Target = {
  alias: string; produk: string;
  /** kpi/reguler ikut skor tertimbang; reward/penalty menambah/mengurangi
   *  nominal; tier menentukan tier lewat pita, tidak ikut skor mana pun. */
  peran: string;
  /** Hanya dipakai peran reward/penalty. */
  jenis_nilai: string; nilai_efek: string;
  /** Kosong berarti indikator ini tidak ikut skema bersangkutan. */
  bobot_kpi: string; bobot_insentif: string;
  target_kpi3: string; target_kpi4: string; target_kpi5: string;
  /** Pita menggantikan tiga ambang di atas kalau diisi; boleh berapa pun
   *  tingkatnya, dan untuk peran tier poin-nya adalah nomor tier itu sendiri. */
  pita: Pita[];
  aktif: boolean;
};

const PERAN_OPSI = [
  { nilai: "kpi", label: "Skor KPI", ket: "ikut bobot KPI dan/atau insentif reguler" },
  { nilai: "reward", label: "Reward", ket: "menambah nominal insentif" },
  { nilai: "penalty", label: "Penalty", ket: "mengurangi nominal insentif" },
  { nilai: "tier", label: "Penentu tier", ket: "menentukan tier lewat pita, tidak ikut skor" },
];

const pitaKosong = (): Pita => ({ nilai_min: "", nilai_max: "", poin_min: "", poin_max: "" });
type Contoh = { nik: string; nama: string; cabang: string | null; baris: number; nilai: number | null };

const kartuKosong = (pertama: boolean): Komponen => ({
  agregat: "SUM", kolom: null,
  operator_sebelum: pertama ? null : "/",
  gabung_syarat: "dan", syarat: [],
});

const angkaStr = (v: any) => (v === null || v === undefined ? "" : String(v));

/**
 * Editor pita: baris nilai_min–nilai_max → poin_min–poin_max.
 *
 * Batas bawah inklusif, batas atas eksklusif — pita berikutnya dimulai
 * persis di nilai_max pita sebelumnya, supaya tidak ada celah maupun
 * tumpang tindih antar pita. Baris pertama dan terakhir boleh dikosongkan
 * batasnya (terbuka ke bawah / ke atas).
 */
function EditorPita({ pita, ubah, labelPoin }: {
  pita: Pita[]; ubah: (pita: Pita[]) => void; labelPoin: string;
}) {
  return (
    <div className="pita-editor">
      {pita.length > 0 && (
        <table className="rapat tbl-pita">
          <thead>
            <tr>
              <th className="r">Dari (≥)</th>
              <th className="r">Sampai (&lt;)</th>
              <th className="r">{labelPoin} dari</th>
              <th className="r">{labelPoin} sampai</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pita.map((p, i) => (
              <tr key={i}>
                {(["nilai_min", "nilai_max", "poin_min", "poin_max"] as const).map((f) => (
                  <td key={f}>
                    <input className="num r" inputMode="decimal"
                           placeholder={f === "nilai_min" && i === 0 ? "− tak terbatas" :
                                        f === "nilai_max" && i === pita.length - 1 ? "tak terbatas" : "—"}
                           value={p[f]}
                           onChange={(e) => {
                             const baru = [...pita];
                             baru[i] = { ...baru[i], [f]: e.target.value };
                             ubah(baru);
                           }} />
                  </td>
                ))}
                <td className="r">
                  <button className="isyarat-x" title="Hapus pita ini"
                          onClick={() => ubah(pita.filter((_, y) => y !== i))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn ghost sm" onClick={() => ubah([...pita, pitaKosong()])}>
        + Tambah pita
      </button>
    </div>
  );
}

/** Panel detail satu baris pendaftaran, isinya menyesuaikan peran yang dipilih. */
function DetailTarget({ t, ubah }: { t: Target; ubah: (patch: Partial<Target>) => void }) {
  if (t.peran === "reward" || t.peran === "penalty") {
    const label = t.peran === "reward" ? "menambah" : "mengurangi";
    return (
      <div className="target-detail">
        <p className="faint small">
          Nilai efeknya mengikuti hasil hitungan indikator ini, bukan nilai tetap:
          tiap 1 satuan hasil hitung {label} nominal insentif sebesar angka di
          bawah — dikalikan langsung, bukan dijumlah sekali saja.
        </p>
        <div className="target-detail-baris">
          <label>
            <span className="faint small">Jenis nilai</span>
            <Pilih nilai={t.jenis_nilai} cari={false}
                   onPilih={(v) => ubah({ jenis_nilai: v })}
                   opsi={[
                     { nilai: "nominal", label: "Rupiah tetap", ket: "Rp per satuan hasil hitung" },
                     { nilai: "persen", label: "Persen", ket: "% dari nominal insentif reguler, per satuan" },
                   ]} />
          </label>
          <label>
            <span className="faint small">Nilai efek per satuan</span>
            <input className="num" inputMode="decimal" value={t.nilai_efek}
                   placeholder={t.jenis_nilai === "persen" ? "mis. 1 (=1%)" : "mis. 50000"}
                   onChange={(e) => ubah({ nilai_efek: e.target.value })} />
          </label>
        </div>
      </div>
    );
  }

  if (t.peran === "tier") {
    return (
      <div className="target-detail">
        <p className="faint small">
          Poin di sini adalah nomor tier itu sendiri (1, 2, 3, …), bukan skor.
          Tier hasil pita ini disilang kelas cabang untuk mencari nominal di
          halaman Tabel Tier Insentif.
        </p>
        <EditorPita pita={t.pita} ubah={(pita) => ubah({ pita })} labelPoin="Tier" />
      </div>
    );
  }

  return (
    <div className="target-detail">
      <div className="target-detail-baris">
        {(["bobot_kpi", "bobot_insentif"] as const).map((f) => (
          <label key={f}>
            <span className="faint small">
              {f === "bobot_kpi" ? "Bobot KPI" : "Bobot insentif"}
            </span>
            <div className="bobot-isi">
              <input className="num" inputMode="decimal" value={t[f]}
                     placeholder="—"
                     title={t[f] ? undefined : "Kosong = tidak ikut skema ini"}
                     onChange={(e) => ubah({ [f]: e.target.value } as Partial<Target>)} />
              <span className={t[f] ? "" : "kosong"}>%</span>
            </div>
          </label>
        ))}
      </div>

      <p className="faint small mt">
        Pita menggantikan tiga ambang di bawah kalau diisi — cocok untuk target
        bertingkat lebih dari tiga. Kosongkan pita untuk memakai tiga ambang
        biasa.
      </p>
      <EditorPita pita={t.pita} ubah={(pita) => ubah({ pita })} labelPoin="Skor" />

      {!t.pita.length && (
        <div className="target-detail-baris mt">
          {(["target_kpi3", "target_kpi4", "target_kpi5"] as const).map((f) => (
            <label key={f}>
              <span className="faint small">
                {f === "target_kpi3" ? "KPI 3" : f === "target_kpi4" ? "KPI 4" : "KPI 5"}
              </span>
              <input className="num" inputMode="decimal" value={t[f]} placeholder="—"
                     onChange={(e) => ubah({ [f]: e.target.value } as Partial<Target>)} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Pembangun indikator.
 *
 * Kiri daftar indikator, kanan perakit rumusnya. Perakitnya berbentuk
 * susunan kartu yang bisa diseret: tiap kartu satu agregasi bersyarat,
 * dan di antara dua kartu ada operator penghubung. Rumus dijalankan dari
 * atas ke bawah persis seperti terbacanya, tanpa aturan prioritas
 * tersembunyi yang membuat hasilnya berbeda dari yang terlihat.
 *
 * Tombol "Uji rumus" menjalankan rumus atas data mentah sungguhan tanpa
 * menyimpan apa pun. Tanpa itu, rumus yang keliru baru ketahuan setelah
 * angkanya muncul di dasbor semua orang.
 */
export default function IndikatorClient() {
  const [daftar, setDaftar] = useState<Ringkas[]>([]);
  const [kolom, setKolom] = useState<Kolom[]>([]);
  const [produk, setProduk] = useState<{ kode: string; nama: string }[]>([]);
  const [jabatan, setJabatan] = useState<string[]>([]);
  const [nilaiUnik, setNilaiUnik] = useState<Record<string, string[]>>({});

  const [pilihId, setPilihId] = useState<string | null>(null);
  const [nama, setNama] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [satuan, setSatuan] = useState("persen");
  const [kaliSeratus, setKaliSeratus] = useState(true);
  const [peranPic, setPeranPic] = useState("staff");
  const [komponen, setKomponen] = useState<Komponen[]>([kartuKosong(true)]);
  const [target, setTarget] = useState<Target[]>([]);

  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [uji, setUji] = useState<{ rumus: string; contoh: Contoh[] } | null>(null);
  const [seret, setSeret] = useState<number | null>(null);
  const [lewat, setLewat] = useState<number | null>(null);
  /** Indeks baris pendaftaran yang detailnya sedang terbuka, atau null. */
  const [detailBuka, setDetailBuka] = useState<number | null>(null);

  async function muatDaftar() {
    const r = await fetch("/api/admin/indikator", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat daftar indikator."); return; }
    setDaftar(j.daftar ?? []);
    setKolom(j.kolom ?? []);
    setProduk(j.produk ?? []);
    setJabatan((j.jabatan ?? []).map((x: any) => x.alias));
  }
  useEffect(() => { muatDaftar(); }, []);

  /**
   * Nilai yang benar-benar pernah muncul di data mentah, untuk mengisi
   * dropdown syarat. Admin memilih dari yang ada alih-alih mengetik —
   * mengetik "Btc" saat datanya "BTC" menghasilkan nol tanpa pesan galat.
   */
  useEffect(() => {
    const perlu = new Set<string>();
    for (const k of komponen) for (const s of k.syarat) if (s.kolom) perlu.add(s.kolom);
    const belum = [...perlu].filter((c) => !(c in nilaiUnik));
    if (!belum.length) return;

    (async () => {
      const r = await fetch(`/api/admin/nilai-kolom?kolom=${belum.map(encodeURIComponent).join(",")}`);
      if (!r.ok) return;
      const j = await r.json();
      setNilaiUnik((n) => ({ ...n, ...j.nilai }));
    })();
  }, [komponen, nilaiUnik]);

  function kosongkan() {
    setPilihId(null); setNama(""); setDeskripsi("");
    setSatuan("persen"); setKaliSeratus(true); setPeranPic("staff");
    setKomponen([kartuKosong(true)]); setTarget([]); setUji(null); setPesan(null);
    setDetailBuka(null);
  }

  async function buka(id: string) {
    setSibuk(true); setPesan(null); setUji(null);
    try {
      const r = await fetch(`/api/admin/indikator?id=${id}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPesan(j.error ?? "Gagal membuka indikator ini."); return; }
      setPilihId(id);
      setNama(j.def.nama); setDeskripsi(j.def.deskripsi ?? "");
      setSatuan(j.def.satuan); setKaliSeratus(j.def.kali_seratus);
      setPeranPic(j.def.peran_pic);
      setKomponen((j.komponen ?? []).map((k: any) => ({
        agregat: k.agregat, kolom: k.kolom,
        operator_sebelum: k.operator_sebelum,
        gabung_syarat: k.gabung_syarat,
        syarat: (k.syarat ?? []).map((s: any) => ({
          kolom: s.kolom, operator: s.operator, nilai: s.nilai ?? [],
        })),
      })));
      setTarget((j.target ?? []).map((t: any) => ({
        alias: t.alias, produk: t.produk,
        peran: t.peran === "reguler" ? "kpi" : (t.peran || "kpi"),
        jenis_nilai: t.jenis_nilai ?? "nominal",
        nilai_efek: angkaStr(t.nilai_efek),
        bobot_kpi: angkaStr(t.bobot_kpi),
        bobot_insentif: angkaStr(t.bobot_insentif),
        target_kpi3: angkaStr(t.target_kpi3),
        target_kpi4: angkaStr(t.target_kpi4),
        target_kpi5: angkaStr(t.target_kpi5),
        pita: (t.pita ?? []).map((p: any) => ({
          nilai_min: angkaStr(p.nilai_min), nilai_max: angkaStr(p.nilai_max),
          poin_min: angkaStr(p.poin_min), poin_max: angkaStr(p.poin_max),
        })),
        aktif: t.aktif,
      })));
      setDetailBuka(null);
    } finally { setSibuk(false); }
  }

  const badan = () => ({
    id: pilihId, nama, deskripsi, satuan,
    kali_seratus: kaliSeratus, peran_pic: peranPic,
    komponen, target,
  });

  async function simpan() {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/indikator", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(badan()),
      });
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? "Gagal menyimpan."); return; }
      await muatDaftar();
      setPilihId(j.id);
      setPesan("Tersimpan.");
    } finally { setSibuk(false); }
  }

  async function jalankanUji() {
    setSibuk(true); setPesan(null); setUji(null);
    try {
      const r = await fetch("/api/admin/indikator", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          komponen, kali_seratus: kaliSeratus, peran_pic: peranPic,
          produk: target[0]?.produk ?? null,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? "Rumus belum bisa dijalankan."); return; }
      setUji(j);
    } finally { setSibuk(false); }
  }

  function jatuhkan(ke: number) {
    if (seret === null || seret === ke) { setSeret(null); setLewat(null); return; }
    const baru = [...komponen];
    const [item] = baru.splice(seret, 1);
    baru.splice(ke, 0, item);
    // Kartu pertama tidak boleh punya operator penghubung, dan kartu
    // yang pindah ke bawah harus punya. Diperbaiki setelah tiap seretan
    // supaya admin tidak pernah melihat rumus yang bentuknya mustahil.
    baru.forEach((k, i) => {
      k.operator_sebelum = i === 0 ? null : (k.operator_sebelum ?? "+");
    });
    setKomponen(baru); setSeret(null); setLewat(null);
  }

  const labelKolom = (k: string | null) =>
    kolom.find((c) => c.kolom === k)?.label ?? k ?? "—";

  /** Rumus sebagai kalimat, dihitung ulang tiap kali kartu berubah. */
  const ringkasRumus = komponen.map((k, i) => {
    const inti = k.kolom ? `${k.agregat}(${labelKolom(k.kolom)})` : "COUNT(baris)";
    const s = k.syarat.length ? ` [${k.syarat.length} syarat]` : "";
    return (i === 0 ? "" : ` ${k.operator_sebelum ?? "?"} `) + inti + s;
  }).join("") + (kaliSeratus ? " × 100%" : "");

  return (
    <div className="ind-tata">
      {/* --- daftar indikator --- */}
      <aside className="card ind-samping">
        <div className="cardhead rowbetween">
          <h3 style={{ fontSize: 14 }}>Indikator</h3>
          <button className="btn sm" onClick={kosongkan}>+ Baru</button>
        </div>
        <div className="ind-daftar">
          {daftar.map((d) => (
            <button key={d.id}
                    className={"ind-item" + (d.id === pilihId ? " on" : "")}
                    onClick={() => buka(d.id)}>
              <b>{d.nama}</b>
              <span className="faint">
                {d.komponen} komponen · {d.terdaftar} pendaftaran
                {!d.aktif && " · nonaktif"}
              </span>
            </button>
          ))}
          {!daftar.length && <p className="empty">Belum ada indikator.</p>}
        </div>
      </aside>

      {/* --- perakit --- */}
      <section className="ind-utama">
        <div className="ind-kepala">
          <input className="ind-nama" value={nama} placeholder="Nama indikator"
                 onChange={(e) => setNama(e.target.value)} />
          <div className="ind-aksi">
            <button className="btn ghost sm" disabled={sibuk} onClick={jalankanUji}>Uji rumus</button>
            <button className="btn sm" disabled={sibuk || !nama.trim()} onClick={simpan}>Simpan</button>
            {pilihId && (
              <button className="btn ghost sm bahaya" disabled={sibuk}
                      onClick={async () => {
                        await fetch(`/api/admin/indikator?id=${pilihId}`, { method: "DELETE" });
                        kosongkan(); await muatDaftar();
                      }}>Hapus</button>
            )}
          </div>
        </div>

        <input className="ind-desk" value={deskripsi} placeholder="Keterangan singkat (opsional)"
               onChange={(e) => setDeskripsi(e.target.value)} />

        {pesan && <div className={"alert mb " + (pesan === "Tersimpan." ? "ok" : "bad")}>{pesan}</div>}

        <div className="ind-atur">
          <label>
            <span className="faint small">Dihitung untuk</span>
            <Pilih nilai={peranPic} cari={false} onPilih={setPeranPic}
                   opsi={[
                     { nilai: "staff", label: "Staf pelaksana", ket: "kolom staff_pic" },
                     { nilai: "spv", label: "Supervisor", ket: "kolom spv_pic" },
                     { nilai: "bch", label: "Kepala cabang", ket: "kolom bch_pic" },
                   ]} />
          </label>
          <label>
            <span className="faint small">Satuan</span>
            <Pilih nilai={satuan} cari={false} onPilih={setSatuan}
                   opsi={[
                     { nilai: "persen", label: "Persen" },
                     { nilai: "rupiah", label: "Rupiah" },
                     { nilai: "unit", label: "Unit" },
                   ]} />
          </label>
          <label className="ind-cek">
            <input type="checkbox" checked={kaliSeratus}
                   onChange={(e) => setKaliSeratus(e.target.checked)} />
            Kalikan 100 (rasio jadi persen)
          </label>
        </div>

        {/* --- kartu komponen --- */}
        {komponen.map((k, i) => (
          <div key={i}>
            {i > 0 && (
              /* Operator penghubung, ditaruh di tengah antara dua kartu.
                 Tombol berdampingan, bukan dropdown: dengan hanya empat
                 pilihan, satu klik lebih cepat daripada buka-pilih-tutup,
                 dan keempatnya terlihat sekaligus sehingga jelas bahwa
                 pembagian memang tersedia. */
              <div className="ind-operator">
                <span className="ind-op-garis" />
                <div className="ind-op-pilih">
                  {[["+", "+", "tambah"], ["-", "−", "kurang"],
                    ["*", "×", "kali"], ["/", "÷", "bagi"]].map(([v, simbol, nama]) => (
                    <button key={v} title={nama}
                            className={"ind-op-btn" + ((k.operator_sebelum ?? "+") === v ? " on" : "")}
                            onClick={() => setKomponen(komponen.map((x, y) =>
                              y === i ? { ...x, operator_sebelum: v } : x))}>
                      {simbol}
                    </button>
                  ))}
                </div>
                <span className="ind-op-garis" />
              </div>
            )}
            <Kartu
              k={k} indeks={i} kolom={kolom} sibuk={sibuk} nilaiUnik={nilaiUnik}
              diangkat={seret === i} sasaran={lewat === i && seret !== null && seret !== i}
              onSeretMulai={() => setSeret(i)}
              onSeretLewat={() => setLewat(i)}
              onJatuh={() => jatuhkan(i)}
              onUbah={(patch) => setKomponen(komponen.map((x, y) => (y === i ? { ...x, ...patch } : x)))}
              onHapus={() => {
                const baru = komponen.filter((_, y) => y !== i);
                if (baru.length) baru[0].operator_sebelum = null;
                setKomponen(baru.length ? baru : [kartuKosong(true)]);
              }} />
          </div>
        ))}

        <div className="ind-tambah">
          <button className="btn ghost sm"
                  onClick={() => setKomponen([...komponen, kartuKosong(false)])}>
            + Tambah komponen
          </button>
          {komponen.length === 1 && (
            /* Petunjuk khusus saat baru satu kartu: rasio adalah bentuk
               indikator paling umum di sini, dan tanpa kartu kedua tidak
               ada tempat operator pembagian muncul — mudah disangka
               fiturnya tidak ada. */
            <span className="faint small">
              Tambahkan komponen kedua untuk membuat pembagian — mis. Success
              Rate = komponen A ÷ komponen B.
            </span>
          )}
        </div>

        <div className="ind-ringkas">
          <span className="ind-ringkas-label">Rumus</span>
          <code>{ringkasRumus}</code>
        </div>

        {/* --- hasil uji --- */}
        {uji && (
          <section className="card mt">
            <div className="cardhead">
              <h3 style={{ fontSize: 14 }}>Hasil uji atas data mentah</h3>
              <p className="muted num small">{uji.rumus}</p>
            </div>
            <table className="rapat">
              <thead>
                <tr><th>NIK</th><th>Nama</th><th className="r">Baris</th><th className="r">Nilai</th></tr>
              </thead>
              <tbody>
                {uji.contoh.map((c) => (
                  <tr key={c.nik}>
                    <td className="num faint">{c.nik}</td>
                    <td>{c.nama}<div className="faint small">{c.cabang ?? "—"}</div></td>
                    <td className="r num faint">{c.baris}</td>
                    <td className="r num"><b>
                      {c.nilai === null ? "—" : c.nilai.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    </b></td>
                  </tr>
                ))}
                {!uji.contoh.length && (
                  <tr><td colSpan={4} className="empty">
                    Tidak ada baris data mentah yang cocok. Pastikan data API sudah ditarik.
                  </td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {/* --- pendaftaran ke jabatan + produk --- */}
        <section className="card mt">
          <div className="cardhead rowbetween">
            <div>
              <h3 style={{ fontSize: 14 }}>Didaftarkan ke jabatan · produk</h3>
              <p className="muted small">
                Indikator hanya dihitung untuk pasangan yang terdaftar di sini.
                Bobot KPI dan bobot insentif berdiri sendiri — kosongkan salah
                satu bila indikator ini tidak ikut skema tersebut.
              </p>
            </div>
            <button className="btn ghost sm"
                    onClick={() => {
                      setTarget([...target, {
                        alias: "", produk: produk[0]?.kode ?? "",
                        peran: "kpi", jenis_nilai: "nominal", nilai_efek: "",
                        bobot_kpi: "", bobot_insentif: "",
                        target_kpi3: "", target_kpi4: "", target_kpi5: "",
                        pita: [], aktif: true,
                      }]);
                      setDetailBuka(target.length);
                    }}>
              + Daftarkan
            </button>
          </div>

          {/* Lebar kolom dipatok lewat <colgroup> dengan table-layout tetap.
              Tanpa itu browser menawar sendiri lebar tiap kolom mengikuti
              isinya, dan kotak isian angka yang tidak punya lebar bawaan
              yang wajar mendorong kolom jabatan jadi sempit sampai
              tulisannya terpotong dua baris. */}
          <table className="rapat tbl-target">
            <colgroup>
              <col /><col style={{ width: 96 }} />
              <col style={{ width: 150 }} /><col />
              <col style={{ width: 72 }} /><col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Jabatan</th>
                <th>Produk</th>
                <th>Peran</th>
                <th>Ringkasan</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {target.map((t, i) => {
                const ubah = (patch: Partial<Target>) =>
                  setTarget(target.map((x, y) => (y === i ? { ...x, ...patch } : x)));
                const adaPita = t.pita.length > 0;
                const ringkasan =
                  t.peran === "reward" || t.peran === "penalty"
                    ? (t.nilai_efek
                        ? `${t.jenis_nilai === "persen" ? t.nilai_efek + "%" : "Rp" + Number(t.nilai_efek).toLocaleString("id-ID")} per satuan hasil hitung`
                        : "Belum diisi nilai efeknya")
                    : t.peran === "tier"
                    ? (adaPita ? `${t.pita.length} pita tier` : "Belum ada pita")
                    : [
                        t.bobot_kpi && `KPI ${t.bobot_kpi}%`,
                        t.bobot_insentif && `Insentif ${t.bobot_insentif}%`,
                        adaPita && `${t.pita.length} pita`,
                      ].filter(Boolean).join(" · ") || "Belum diisi";
                return (
                  <Fragment key={i}>
                    <tr className={detailBuka === i ? "baris-buka" : undefined}>
                      <td>
                        <Pilih nilai={t.alias} bebas placeholder="Pilih jabatan"
                               onPilih={(v) => ubah({ alias: v.toUpperCase() })}
                               opsi={jabatan.map((a) => ({ nilai: a, label: a }))} />
                      </td>
                      <td>
                        <Pilih nilai={t.produk} cari={false} onPilih={(v) => ubah({ produk: v })}
                               opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
                      </td>
                      <td>
                        <Pilih nilai={t.peran} cari={false} onPilih={(v) => ubah({ peran: v })}
                               opsi={PERAN_OPSI} />
                      </td>
                      <td className="faint small">{ringkasan}</td>
                      <td className="r">
                        <button className="btn ghost sm"
                                onClick={() => setDetailBuka(detailBuka === i ? null : i)}>
                          {detailBuka === i ? "Tutup" : "Atur"}
                        </button>
                      </td>
                      <td className="r">
                        <button className="isyarat-x" title={`Lepaskan ${t.alias || "baris ini"}`}
                                onClick={() => {
                                  setTarget(target.filter((_, y) => y !== i));
                                  if (detailBuka === i) setDetailBuka(null);
                                }}>×</button>
                      </td>
                    </tr>
                    {detailBuka === i && (
                      <tr className="baris-detail">
                        <td colSpan={6}>
                          <DetailTarget t={t} ubah={ubah} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!target.length && (
                <tr><td colSpan={6} className="empty">
                  Belum didaftarkan ke jabatan mana pun, jadi belum akan dihitung.
                </td></tr>
              )}
            </tbody>
          </table>

          {target.some((t) => t.alias && !jabatan.includes(t.alias)) && (
            <p className="alert warn">
              Ada jabatan yang belum punya pemetaan produk di Master Produk.
              Indikator tidak akan dihitung untuk jabatan itu sampai dipetakan.
            </p>
          )}
        </section>
      </section>
    </div>
  );
}
