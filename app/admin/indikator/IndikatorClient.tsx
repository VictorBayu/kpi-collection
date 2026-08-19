"use client";

import { useEffect, useState } from "react";
import Pilih from "@/components/Pilih";
import Kartu, { type Komponen, type Kolom } from "./Kartu";

type Ringkas = {
  id: string; nama: string; satuan: string; kali_seratus: boolean;
  peran_pic: string; aktif: boolean; komponen: number; terdaftar: number;
};
type Target = {
  alias: string; produk: string;
  bobot: string; target_kpi3: string; target_kpi4: string; target_kpi5: string;
  aktif: boolean;
};
type Contoh = { nik: string; nama: string; cabang: string | null; baris: number; nilai: number | null };

const kartuKosong = (pertama: boolean): Komponen => ({
  agregat: "SUM", kolom: null,
  operator_sebelum: pertama ? null : "/",
  gabung_syarat: "dan", syarat: [],
});

const angkaStr = (v: any) => (v === null || v === undefined ? "" : String(v));

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

  async function muatDaftar() {
    const r = await fetch("/api/admin/indikator", { cache: "no-store" });
    const j = await r.json();
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
  }

  async function buka(id: string) {
    setSibuk(true); setPesan(null); setUji(null);
    try {
      const r = await fetch(`/api/admin/indikator?id=${id}`, { cache: "no-store" });
      const j = await r.json();
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
        bobot: angkaStr(t.bobot),
        target_kpi3: angkaStr(t.target_kpi3),
        target_kpi4: angkaStr(t.target_kpi4),
        target_kpi5: angkaStr(t.target_kpi5),
        aktif: t.aktif,
      })));
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
              </p>
            </div>
            <button className="btn ghost sm"
                    onClick={() => setTarget([...target, {
                      alias: "", produk: produk[0]?.kode ?? "",
                      bobot: "", target_kpi3: "", target_kpi4: "", target_kpi5: "",
                      aktif: true,
                    }])}>
              + Daftarkan
            </button>
          </div>

          <table className="rapat">
            <thead>
              <tr>
                <th>Jabatan</th><th style={{ width: 100 }}>Produk</th>
                <th style={{ width: 80 }} className="r">Bobot</th>
                <th style={{ width: 90 }} className="r">KPI 3</th>
                <th style={{ width: 90 }} className="r">KPI 4</th>
                <th style={{ width: 90 }} className="r">KPI 5</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {target.map((t, i) => {
                const ubah = (patch: Partial<Target>) =>
                  setTarget(target.map((x, y) => (y === i ? { ...x, ...patch } : x)));
                return (
                  <tr key={i}>
                    <td>
                      <Pilih nilai={t.alias} bebas placeholder="pilih jabatan"
                             onPilih={(v) => ubah({ alias: v.toUpperCase() })}
                             opsi={jabatan.map((a) => ({ nilai: a, label: a }))} />
                    </td>
                    <td>
                      <Pilih nilai={t.produk} cari={false} onPilih={(v) => ubah({ produk: v })}
                             opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
                    </td>
                    {(["bobot","target_kpi3","target_kpi4","target_kpi5"] as const).map((f) => (
                      <td key={f}>
                        <input className="num r" inputMode="decimal" value={t[f]}
                               onChange={(e) => ubah({ [f]: e.target.value } as Partial<Target>)} />
                      </td>
                    ))}
                    <td>
                      <button className="isyarat-x" title="Lepaskan"
                              onClick={() => setTarget(target.filter((_, y) => y !== i))}>×</button>
                    </td>
                  </tr>
                );
              })}
              {!target.length && (
                <tr><td colSpan={7} className="empty">
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
