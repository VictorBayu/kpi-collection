"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Pilih from "@/components/Pilih";
import InputAngka from "@/components/InputAngka";
import Kartu, { type Komponen, type Kolom } from "./Kartu";
import Ikon from "@/components/Ikon";
import JudulHalaman, { TitikStatus } from "@/components/JudulHalaman";

type Ringkas = {
  id: string; nama: string; satuan: string; kali_seratus: boolean;
  peran_pic: string; aktif: boolean; komponen: number; terdaftar: number;
};
type Pita = { nilai_min: string; nilai_max: string; poin_min: string; poin_max: string };
/** Pita rupiah: nilai pemilih → nominal datar, tanpa interpolasi. */
type PitaNominal = { nilai_min: string; nilai_max: string; nominal: string };
/** Gerbang kelayakan. sumber_id kosong = diuji pada nilai indikator ini sendiri. */
type Gerbang = { label: string; sumber_id: string; operator: string; nilai: string };
type IndikatorLain = { id: string; nama: string; satuan: string };
type SumberRingkas = {
  kode: string; nama: string; jenis: string; keterangan: string | null;
};
type Target = {
  alias: string; produk: string;
  /** kpi/reguler ikut skor tertimbang; reward/penalty menambah/mengurangi
   *  nominal; tier menentukan tier lewat pita; nominal membayar datar bila
   *  semua gerbang lolos; pendukung hanya dihitung sebagai bahan gerbang. */
  peran: string;
  /** Hanya dipakai peran reward/penalty. */
  jenis_nilai: string; nilai_efek: string;
  /** Kosong berarti indikator ini tidak ikut skema bersangkutan. */
  bobot_kpi: string; bobot_insentif: string;
  /** 100 = pencapaian mentah diakui penuh. Dipakai saat jabatan ini juga
   *  menghandle produk lain, jadi porsi kerjanya di produk ini cuma
   *  sebagian — mis. 50 untuk jabatan yang menghandle 2 produk. */
  faktor_pengakuan: string;
  target_kpi3: string; target_kpi4: string; target_kpi5: string;
  /** Pita menggantikan tiga ambang di atas kalau diisi; boleh berapa pun
   *  tingkatnya, dan untuk peran tier poin-nya adalah nomor tier itu sendiri. */
  pita: Pita[];
  /** Peran 'nominal': indikator yang nilainya memilih pita rupiah. Kosong
   *  berarti dipilih oleh nilai indikator ini sendiri. */
  pemilih_id: string;
  nominal: PitaNominal[];
  gerbang: Gerbang[];
  aktif: boolean;
};

const PERAN_OPSI = [
  { nilai: "kpi", label: "KPI / Insentif", ket: "diatur lewat bobot KPI dan bobot insentif" },
  { nilai: "reward", label: "Reward", ket: "menambah nominal insentif" },
  { nilai: "penalty", label: "Penalty", ket: "mengurangi nominal insentif" },
  { nilai: "tier", label: "Penentu tier", ket: "menentukan tier lewat pita, tidak ikut skor" },
  { nilai: "nominal", label: "Nominal bersyarat",
    ket: "bayar datar bila semua syarat lolos; besarnya dari pita rupiah" },
  { nilai: "pendukung", label: "Pendukung",
    ket: "hanya dihitung sebagai bahan syarat, tidak dinilai dan tidak dibayar" },
];

/** Warna penanda tiap peran — dipakai sebagai titik warna di ringkasan
 *  baris pendaftaran, supaya jenis baris terbaca sekilas tanpa harus
 *  membaca teksnya dulu. */
const PERAN_WARNA: Record<string, string> = {
  kpi: "accent", reward: "good", penalty: "bad", tier: "warn",
  nominal: "ungu", pendukung: "netral",
};

const OP_GERBANG = [
  { nilai: "kurang", label: "kurang dari  <" },
  { nilai: "kurang_sama", label: "maksimal  ≤" },
  { nilai: "lebih", label: "lebih dari  >" },
  { nilai: "lebih_sama", label: "minimal  ≥" },
  { nilai: "sama", label: "sama dengan  =" },
];

const pitaKosong = (): Pita => ({ nilai_min: "", nilai_max: "", poin_min: "", poin_max: "" });
const nominalKosong = (): PitaNominal => ({ nilai_min: "", nilai_max: "", nominal: "" });
const gerbangKosong = (): Gerbang =>
  ({ label: "", sumber_id: "", operator: "lebih_sama", nilai: "" });
type Contoh = { nik: string; nama: string; cabang: string | null; baris: number; nilai: number | null };

const kartuKosong = (pertama: boolean): Komponen => ({
  agregat: "SUM", kolom: null,
  operator_sebelum: pertama ? null : "/",
  gabung_syarat: "dan", syarat: [],
  pengakuan_kolom: null, pengakuan: [],
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
                    <InputAngka className="num r" desimal
                           placeholder={f === "nilai_min" && i === 0 ? "− tak terbatas" :
                                        f === "nilai_max" && i === pita.length - 1 ? "tak terbatas" : "—"}
                           value={p[f]}
                           onChange={(v) => {
                             const baru = [...pita];
                             baru[i] = { ...baru[i], [f]: v };
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

/**
 * Editor pita nominal: rentang nilai → rupiah datar.
 *
 * Sengaja dipisah dari EditorPita walau tampak mirip. Di sana hasilnya
 * poin dan diinterpolasi di dalam pita; di sini hasilnya rupiah dan justru
 * tidak boleh diinterpolasi — bahan kerja 150 JT dapat 750.000 penuh, bukan
 * sebagian karena belum sampai batas atas. Menggabungkan keduanya akan
 * menyembunyikan perbedaan yang justru paling perlu disadari admin.
 */
function EditorNominal({ pita, ubah }: {
  pita: PitaNominal[]; ubah: (pita: PitaNominal[]) => void;
}) {
  return (
    <div className="pita-editor">
      {pita.length > 0 && (
        <table className="rapat tbl-pita">
          <thead>
            <tr>
              <th className="r">Dari (≥)</th>
              <th className="r">Sampai (&lt;)</th>
              <th className="r">Nominal (Rp)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pita.map((p, i) => (
              <tr key={i}>
                {(["nilai_min", "nilai_max", "nominal"] as const).map((f) => (
                  <td key={f}>
                    <InputAngka className="num r" desimal={f !== "nominal"}
                           placeholder={f === "nilai_min" && i === 0 ? "− tak terbatas" :
                                        f === "nilai_max" && i === pita.length - 1 ? "tak terbatas" :
                                        f === "nominal" ? "mis. 750.000" : "—"}
                           value={p[f]}
                           onChange={(v) => {
                             const baru = [...pita];
                             baru[i] = { ...baru[i], [f]: v };
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
      <button className="btn ghost sm" onClick={() => ubah([...pita, nominalKosong()])}>
        + Tambah pita nominal
      </button>
    </div>
  );
}

/**
 * Editor gerbang — "komponen di dalam komponen".
 *
 * Tiap baris satu syarat yang harus lolos. Sumber kosong berarti syaratnya
 * diuji pada nilai indikator ini sendiri; itulah cara menulis "Flowrate <
 * 4,5%" tanpa perlu indikator bantu.
 */
function EditorGerbang({ gerbang, ubah, lain, namaSendiri }: {
  gerbang: Gerbang[];
  ubah: (g: Gerbang[]) => void;
  lain: IndikatorLain[];
  namaSendiri: string;
}) {
  const set = (i: number, patch: Partial<Gerbang>) => {
    const baru = [...gerbang];
    baru[i] = { ...baru[i], ...patch };
    ubah(baru);
  };
  return (
    <div className="gerbang-editor">
      {gerbang.map((g, i) => (
        <div className="gerbang-baris" key={i}>
          <span className="gerbang-no">{i + 1}</span>
          <div className="gerbang-isi">
            <Pilih nilai={g.sumber_id} cari
                   onPilih={(v) => set(i, { sumber_id: v })}
                   opsi={[
                     { nilai: "", label: `Indikator ini sendiri`, ket: namaSendiri || undefined },
                     ...lain.map((l) => ({ nilai: l.id, label: l.nama, ket: l.satuan })),
                   ]} />
          </div>
          <div className="gerbang-op">
            <Pilih nilai={g.operator} cari={false}
                   onPilih={(v) => set(i, { operator: v })}
                   opsi={OP_GERBANG} />
          </div>
          <InputAngka className="num r gerbang-nilai" desimal placeholder="nilai"
                 value={g.nilai} onChange={(v) => set(i, { nilai: v })} />
          <button className="isyarat-x" title="Hapus syarat ini"
                  onClick={() => ubah(gerbang.filter((_, y) => y !== i))}>×</button>
        </div>
      ))}
      <button className="btn ghost sm" onClick={() => ubah([...gerbang, gerbangKosong()])}>
        + Tambah syarat
      </button>
    </div>
  );
}

/** Panel detail satu baris pendaftaran, isinya menyesuaikan peran yang dipilih. */
/**
 * Tombol "salin pita ke pendaftaran lain" — dipasang di bawah tiap editor
 * pita/nominal supaya jabatan yang polanya sama (mis. RE R2, RE R4, RE MIX
 * untuk kedua produknya) tidak perlu mengetik ulang tabel yang identik.
 *
 * Hasil salinnya LEPAS, bukan tertaut: begitu disalin, tiap pendaftaran
 * bebas diedit sendiri-sendiri tanpa memengaruhi yang lain. Cuma tabel
 * pita/nominal itu sendiri yang disalin — bobot, faktor pengakuan, dan
 * peran tetap diisi manual karena biasanya memang berbeda per jabatan.
 */
function SalinPita({ opsi, ke }: {
  opsi: { label: string; index: number }[];
  ke: (tujuan: number[]) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState<number[]>([]);
  if (!opsi.length) return null;

  if (!buka) {
    return (
      <button type="button" className="btn ghost sm salin-pita-tombol" onClick={() => setBuka(true)}>
        <Ikon nama="copy" ukuran={14} /> Salin ke pendaftaran lain
      </button>
    );
  }

  return (
    <div className="salin-pita-panel">
      <p className="faint small">
        Salin tabel ini ke pendaftaran lain pada indikator yang sama — isi yang
        sudah ada di sana akan ditimpa. Setelah disalin, tiap pendaftaran tetap
        bisa diedit sendiri-sendiri.
      </p>
      <div className="salin-pita-daftar">
        {opsi.map((o) => (
          <label key={o.index} className="salin-pita-opsi">
            <input type="checkbox" checked={pilih.includes(o.index)}
                   onChange={(e) => setPilih(e.target.checked
                     ? [...pilih, o.index]
                     : pilih.filter((x) => x !== o.index))} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="salin-pita-aksi">
        <button type="button" className="btn ghost sm"
                onClick={() => { setBuka(false); setPilih([]); }}>
          Batal
        </button>
        <button type="button" className="btn tint sm" disabled={!pilih.length}
                onClick={() => { ke(pilih); setBuka(false); setPilih([]); }}>
          Salin ke {pilih.length} pendaftaran
        </button>
      </div>
    </div>
  );
}

function DetailTarget({ t, ubah, lain, namaSendiri, opsiSalin, salinKe }: {
  t: Target;
  ubah: (patch: Partial<Target>) => void;
  lain: IndikatorLain[];
  namaSendiri: string;
  /** Pendaftaran lain pada indikator yang sama -- sumber pilihan tombol
   *  "Salin ke pendaftaran lain" di bawah tiap editor pita/nominal. */
  opsiSalin: { label: string; index: number }[];
  salinKe: (tujuan: number[], bidang: "pita" | "nominal") => void;
}) {
  if (t.peran === "pendukung") {
    return (
      <div className="target-detail">
      <div className="target-detail-baris">
        <label>
          <span className="faint small">Faktor pengakuan</span>
          <div className="bobot-isi">
            <input className="num" inputMode="decimal" value={t.faktor_pengakuan}
                   placeholder="100"
                   onChange={(e) => ubah({ faktor_pengakuan: e.target.value })} />
            <span>%</span>
          </div>
        </label>
      </div>
      <p className="faint small mt">
        Pencapaian mentah dikali faktor ini sebelum dicocokkan ke target/pita —
        pakai kalau jabatan ini juga menghandle produk lain, jadi porsi
        kerjanya di sini cuma sebagian (mis. 50 untuk yang menghandle 2
        produk). 100 = diakui penuh, tidak mengubah apa pun.
      </p>
        <p className="faint small">
          Indikator ini dihitung dan disimpan, tapi tidak dinilai dan tidak
          membayar apa pun. Gunanya semata supaya angkanya bisa dibaca sebagai
          syarat atau pemilih pita oleh indikator berperan{" "}
          <b>Nominal bersyarat</b> — misalnya jumlah kontrak atau rupiah bahan
          kerja. Tidak ada yang perlu diisi di sini.
        </p>
      </div>
    );
  }

  if (t.peran === "nominal") {
    const pemilihSendiri = !t.pemilih_id;
    return (
      <div className="target-detail">
      <div className="target-detail-baris">
        <label>
          <span className="faint small">Faktor pengakuan</span>
          <div className="bobot-isi">
            <input className="num" inputMode="decimal" value={t.faktor_pengakuan}
                   placeholder="100"
                   onChange={(e) => ubah({ faktor_pengakuan: e.target.value })} />
            <span>%</span>
          </div>
        </label>
      </div>
      <p className="faint small mt">
        Pencapaian mentah dikali faktor ini sebelum dicocokkan ke target/pita —
        pakai kalau jabatan ini juga menghandle produk lain, jadi porsi
        kerjanya di sini cuma sebagian (mis. 50 untuk yang menghandle 2
        produk). 100 = diakui penuh, tidak mengubah apa pun.
      </p>
        <p className="faint small">
          Nominal datar: cair penuh bila <b>semua</b> syarat di bawah lolos,
          nol bila ada satu saja yang gagal. Besarnya tidak mengikuti skor,
          melainkan diambil dari pita rupiah.
        </p>

        <div className="detail-sub">
          <h5>Syarat kelayakan</h5>
          <p className="faint small">
            Kosong berarti tidak ada yang menahan — nominalnya selalu cair.
          </p>
          <EditorGerbang gerbang={t.gerbang} lain={lain} namaSendiri={namaSendiri}
                         ubah={(gerbang) => ubah({ gerbang })} />
        </div>

        <div className="detail-sub">
          <h5>Besar nominal</h5>
          <label className="blok">
            <span className="faint small">Dipilih berdasarkan nilai</span>
            <Pilih nilai={t.pemilih_id} cari
                   onPilih={(v) => ubah({ pemilih_id: v })}
                   opsi={[
                     { nilai: "", label: "Indikator ini sendiri", ket: namaSendiri || undefined },
                     ...lain.map((l) => ({ nilai: l.id, label: l.nama, ket: l.satuan })),
                   ]} />
          </label>
          <p className="faint small mt">
            {pemilihSendiri
              ? "Pita dicocokkan ke hasil hitung indikator ini sendiri."
              : "Pita dicocokkan ke hasil hitung indikator di atas, milik orang dan produk yang sama."}
            {" "}Batas bawah termasuk, batas atas tidak — pita “≥ 100.000.000”
            berarti 100 JT pas ikut masuk.
          </p>
          <EditorNominal pita={t.nominal} ubah={(nominal) => ubah({ nominal })} />
          {t.nominal.length > 0 && (
            <SalinPita opsi={opsiSalin} ke={(tujuan) => salinKe(tujuan, "nominal")} />
          )}
        </div>

        {!t.gerbang.length && !t.nominal.length && (
          <p className="banner warn small mt">
            Belum ada syarat maupun pita nominal — indikator ini belum akan
            membayar apa pun.
          </p>
        )}
      </div>
    );
  }

  if (t.peran === "reward" || t.peran === "penalty") {
    const label = t.peran === "reward" ? "menambah" : "mengurangi";
    return (
      <div className="target-detail">
      <div className="target-detail-baris">
        <label>
          <span className="faint small">Faktor pengakuan</span>
          <div className="bobot-isi">
            <input className="num" inputMode="decimal" value={t.faktor_pengakuan}
                   placeholder="100"
                   onChange={(e) => ubah({ faktor_pengakuan: e.target.value })} />
            <span>%</span>
          </div>
        </label>
      </div>
      <p className="faint small mt">
        Pencapaian mentah dikali faktor ini sebelum dicocokkan ke target/pita —
        pakai kalau jabatan ini juga menghandle produk lain, jadi porsi
        kerjanya di sini cuma sebagian (mis. 50 untuk yang menghandle 2
        produk). 100 = diakui penuh, tidak mengubah apa pun.
      </p>
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
            <InputAngka className="num" desimal value={t.nilai_efek}
                   placeholder={t.jenis_nilai === "persen" ? "mis. 1 (=1%)" : "mis. 50.000"}
                   onChange={(v) => ubah({ nilai_efek: v })} />
          </label>
        </div>
      </div>
    );
  }

  if (t.peran === "tier") {
    return (
      <div className="target-detail">
      <div className="target-detail-baris">
        <label>
          <span className="faint small">Faktor pengakuan</span>
          <div className="bobot-isi">
            <input className="num" inputMode="decimal" value={t.faktor_pengakuan}
                   placeholder="100"
                   onChange={(e) => ubah({ faktor_pengakuan: e.target.value })} />
            <span>%</span>
          </div>
        </label>
      </div>
      <p className="faint small mt">
        Pencapaian mentah dikali faktor ini sebelum dicocokkan ke target/pita —
        pakai kalau jabatan ini juga menghandle produk lain, jadi porsi
        kerjanya di sini cuma sebagian (mis. 50 untuk yang menghandle 2
        produk). 100 = diakui penuh, tidak mengubah apa pun.
      </p>
        <p className="faint small">
          Poin di sini adalah nomor tier itu sendiri (1, 2, 3, …), bukan skor.
          Tier hasil pita ini disilang grading cabang untuk mencari nominal di
          halaman Tabel Tier Insentif.
        </p>
        <EditorPita pita={t.pita} ubah={(pita) => ubah({ pita })} labelPoin="Tier" />
        {t.pita.length > 0 && (
          <SalinPita opsi={opsiSalin} ke={(tujuan) => salinKe(tujuan, "pita")} />
        )}
      </div>
    );
  }

  return (
    <div className="target-detail">
      <div className="target-detail-baris">
        <label>
          <span className="faint small">Faktor pengakuan</span>
          <div className="bobot-isi">
            <input className="num" inputMode="decimal" value={t.faktor_pengakuan}
                   placeholder="100"
                   onChange={(e) => ubah({ faktor_pengakuan: e.target.value })} />
            <span>%</span>
          </div>
        </label>
      </div>
      <p className="faint small mt">
        Pencapaian mentah dikali faktor ini sebelum dicocokkan ke target/pita —
        pakai kalau jabatan ini juga menghandle produk lain, jadi porsi
        kerjanya di sini cuma sebagian (mis. 50 untuk yang menghandle 2
        produk). 100 = diakui penuh, tidak mengubah apa pun.
      </p>
      <p className="faint small">
        Isi Bobot KPI kalau indikator ini ikut skor KPI, Bobot insentif kalau
        ikut skor insentif reguler — boleh salah satu, boleh dua-duanya dengan
        angka berbeda. Yang dikosongkan berarti tidak ikut skema itu.
      </p>
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
      {t.pita.length > 0 && (
        <SalinPita opsi={opsiSalin} ke={(tujuan) => salinKe(tujuan, "pita")} />
      )}

      {!t.pita.length && (
        <div className="target-detail-baris mt">
          {(["target_kpi3", "target_kpi4", "target_kpi5"] as const).map((f) => (
            <label key={f}>
              <span className="faint small">
                {f === "target_kpi3" ? "KPI 3" : f === "target_kpi4" ? "KPI 4" : "KPI 5"}
              </span>
              <InputAngka className="num" desimal value={t[f]} placeholder="—"
                     onChange={(v) => ubah({ [f]: v } as Partial<Target>)} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Create Indicator — pembangun indikator.
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
  const [sumber, setSumber] = useState<SumberRingkas[]>([]);
  const [nilaiUnik, setNilaiUnik] = useState<Record<string, string[]>>({});

  const [pilihId, setPilihId] = useState<string | null>(null);
  const [nama, setNama] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [satuan, setSatuan] = useState("persen");
  const [kaliSeratus, setKaliSeratus] = useState(true);
  const [peranPic, setPeranPic] = useState("staff");
  const [aktif, setAktif] = useState(true);
  /** Sumber TAMBAHAN yang dipakai indikator ini. Kosong = hanya data utama. */
  const [sumberKode, setSumberKode] = useState("");
  const [komponen, setKomponen] = useState<Komponen[]>([kartuKosong(true)]);
  const [target, setTarget] = useState<Target[]>([]);

  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [uji, setUji] = useState<{ rumus: string; contoh: Contoh[] } | null>(null);
  const [seret, setSeret] = useState<number | null>(null);
  const [lewat, setLewat] = useState<number | null>(null);
  /** Indeks baris pendaftaran yang detailnya sedang terbuka, atau null. */
  const [detailBuka, setDetailBuka] = useState<number | null>(null);
  const [cariInd, setCariInd] = useState("");
  const [tersalin, setTersalin] = useState(false);

  /**
   * Indikator lain, bahan isian gerbang dan pemilih pita nominal.
   *
   * Diturunkan dari daftar di panel kiri, bukan diambil terpisah, supaya
   * selalu terisi — termasuk saat menyusun indikator baru yang belum
   * tersimpan. Diri sendiri dikeluarkan: untuk menguji nilai sendiri,
   * gerbang cukup dibiarkan tanpa sumber ("Indikator ini sendiri").
   */
  /**
   * Kode sumber utama — tempat NIK PIC, cabang, dan produk berada.
   * Kolomnya SELALU tersedia; yang dipilih admin hanyalah sumber
   * tambahan di sampingnya.
   */
  const kodeUtama = useMemo(
    () => sumber.find((s) => s.jenis === "utama")?.kode ?? "api",
    [sumber]);

  /**
   * Kolom yang boleh dipakai rumus: seluruh kolom data utama, ditambah
   * kolom milik sumber tambahan yang sedang dipilih.
   *
   * Penyaringan ini yang membuat satu indikator tidak pernah mencampur
   * dua sumber tambahan sekaligus — begitu dua tabel digabung ke satu
   * rumus, kontrak yang tidak berpasangan di salah satunya jadi sangat
   * sulit ditelusuri saat angkanya terlihat ganjil.
   */
  const kolomTerpakai = useMemo(
    () => kolom.filter((k) => {
      const s = k.sumber ?? kodeUtama;
      return s === kodeUtama || s === sumberKode;
    }),
    [kolom, kodeUtama, sumberKode]);

  /** Kolom dari sumber lain yang masih tersangkut di rumus yang dibuka. */
  const kolomAsing = useMemo(() => {
    const sah = new Set(kolomTerpakai.map((k) => k.kolom));
    const dipakai = new Set<string>();
    for (const k of komponen) {
      if (k.kolom) dipakai.add(k.kolom);
      if (k.pengakuan_kolom) dipakai.add(k.pengakuan_kolom);
      for (const y of k.syarat) if (y.kolom) dipakai.add(y.kolom);
    }
    return [...dipakai].filter((c) => c && !sah.has(c));
  }, [komponen, kolomTerpakai]);

  const lain: IndikatorLain[] = useMemo(
    () => daftar
      .filter((d) => d.id !== pilihId)
      .map((d) => ({ id: d.id, nama: d.nama, satuan: d.satuan })),
    [daftar, pilihId]);

  async function muatDaftar() {
    const r = await fetch("/api/admin/indikator", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPesan(j.error ?? "Gagal memuat daftar indikator."); return; }
    setDaftar(j.daftar ?? []);
    setKolom(j.kolom ?? []);
    setProduk(j.produk ?? []);
    setJabatan((j.jabatan ?? []).map((x: any) => x.alias));
    setSumber(j.sumber ?? []);
  }
  useEffect(() => { muatDaftar(); }, []);

  /**
   * Nilai yang benar-benar pernah muncul di data mentah, untuk mengisi
   * dropdown syarat. Admin memilih dari yang ada alih-alih mengetik —
   * mengetik "Btc" saat datanya "BTC" menghasilkan nol tanpa pesan galat.
   */
  useEffect(() => {
    const perlu = new Set<string>();
    for (const k of komponen) {
      for (const s of k.syarat) if (s.kolom) perlu.add(s.kolom);
      // Kolom penentu pengakuan juga butuh daftar nilainya, supaya admin
      // memilih "BTC" dari data alih-alih mengetiknya dan salah huruf.
      if (k.pengakuan_kolom) perlu.add(k.pengakuan_kolom);
    }
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
    setSatuan("persen"); setKaliSeratus(true); setPeranPic("staff"); setAktif(true);
    setSumberKode("");
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
      setAktif(j.def.aktif !== false);
      setSumberKode(j.def.sumber_kode ?? "");
      setKomponen((j.komponen ?? []).map((k: any) => ({
        agregat: k.agregat, kolom: k.kolom,
        operator_sebelum: k.operator_sebelum,
        gabung_syarat: k.gabung_syarat,
        syarat: (k.syarat ?? []).map((s: any) => ({
          kolom: s.kolom, operator: s.operator, nilai: s.nilai ?? [],
        })),
        pengakuan_kolom: k.pengakuan_kolom ?? null,
        pengakuan: (k.pengakuan ?? []).map((b: any) => ({
          nilai: b.nilai, persen: angkaStr(b.persen),
        })),
      })));
      setTarget((j.target ?? []).map((t: any) => ({
        alias: t.alias, produk: t.produk,
        peran: t.peran === "reguler" ? "kpi" : (t.peran || "kpi"),
        jenis_nilai: t.jenis_nilai ?? "nominal",
        nilai_efek: angkaStr(t.nilai_efek),
        bobot_kpi: angkaStr(t.bobot_kpi),
        bobot_insentif: angkaStr(t.bobot_insentif),
        faktor_pengakuan: t.faktor_pengakuan === null || t.faktor_pengakuan === undefined
          ? "100" : angkaStr(t.faktor_pengakuan),
        target_kpi3: angkaStr(t.target_kpi3),
        target_kpi4: angkaStr(t.target_kpi4),
        target_kpi5: angkaStr(t.target_kpi5),
        pita: (t.pita ?? []).map((p: any) => ({
          nilai_min: angkaStr(p.nilai_min), nilai_max: angkaStr(p.nilai_max),
          poin_min: angkaStr(p.poin_min), poin_max: angkaStr(p.poin_max),
        })),
        pemilih_id: t.pemilih_id ?? "",
        nominal: (t.nominal ?? []).map((n: any) => ({
          nilai_min: angkaStr(n.nilai_min), nilai_max: angkaStr(n.nilai_max),
          nominal: angkaStr(n.nominal),
        })),
        gerbang: (t.gerbang ?? []).map((g: any) => ({
          label: g.label ?? "", sumber_id: g.sumber_id ?? "",
          operator: g.operator ?? "lebih_sama", nilai: angkaStr(g.nilai),
        })),
        aktif: t.aktif,
      })));
      setDetailBuka(null);
    } finally { setSibuk(false); }
  }

  const badan = () => ({
    id: pilihId, nama, deskripsi, satuan,
    kali_seratus: kaliSeratus, peran_pic: peranPic, aktif,
    sumber_kode: sumberKode || null,
    komponen, target,
  });

  async function hitungUlang() {
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/data-api", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ hanyaHitung: true }),
      });
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? "Gagal menghitung ulang."); return; }
      setPesan(
        `Hitung ulang selesai — ${j.hitung?.indikator ?? 0} indikator, ` +
        `${j.hitung?.baris ?? 0} baris KPI.`
      );
    } finally { setSibuk(false); }
  }

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

  const daftarTampil = useMemo(() => {
    const c = cariInd.trim().toLowerCase();
    return c ? daftar.filter((d) => d.nama.toLowerCase().includes(c)) : daftar;
  }, [daftar, cariInd]);
  const jmlAktif = daftar.filter((d) => d.aktif).length;
  const jmlDaftar = daftar.reduce((a, d) => a + Number(d.terdaftar || 0), 0);
  const pesanOk = !!pesan && (pesan === "Tersimpan." || pesan.startsWith("Hitung ulang selesai") ||
    pesan === "Indikator diaktifkan kembali." || pesan === "Indikator dinonaktifkan.");
  const indikatorIni = daftar.find((d) => d.id === pilihId);

  function tambahTarget() {
    setTarget([...target, {
      alias: "", produk: produk[0]?.kode ?? "",
      peran: "kpi", jenis_nilai: "nominal", nilai_efek: "",
      bobot_kpi: "", bobot_insentif: "", faktor_pengakuan: "100",
      target_kpi3: "", target_kpi4: "", target_kpi5: "",
      pita: [], pemilih_id: "", nominal: [], gerbang: [],
      aktif: true,
    }]);
    setDetailBuka(target.length);
  }

  async function salinRumus() {
    try {
      await navigator.clipboard.writeText(ringkasRumus);
      setTersalin(true); setTimeout(() => setTersalin(false), 1800);
    } catch { /* clipboard ditolak browser — rumus tetap terlihat */ }
  }

  async function hapusIndikator() {
    if (!pilihId) return;
    if (!confirm(`Hapus indikator "${nama || "tanpa nama"}" beserta seluruh pendaftarannya?`)) return;
    setSibuk(true);
    try {
      await fetch(`/api/admin/indikator?id=${pilihId}`, { method: "DELETE" });
      kosongkan(); await muatDaftar();
    } finally { setSibuk(false); }
  }

  /**
   * Nonaktifkan/aktifkan tanpa menghapus apa pun — komponen, target, dan
   * riwayat pendaftarannya tetap utuh, hanya berhenti ikut dihitung ulang.
   * Memakai jalur simpan yang sama supaya rumus yang sedang diedit di
   * layar tidak diam-diam tertimpa oleh versi lama dari server.
   */
  async function ubahAktif() {
    if (!pilihId) return;
    const nilaiBaru = !aktif;
    const label = nilaiBaru ? "mengaktifkan" : "menonaktifkan";
    if (!nilaiBaru && !confirm(`Nonaktifkan indikator "${nama || "tanpa nama"}"? Indikator ini akan berhenti ikut dihitung sampai diaktifkan kembali.`)) return;
    setSibuk(true); setPesan(null);
    try {
      const r = await fetch("/api/admin/indikator", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...badan(), aktif: nilaiBaru }),
      });
      const j = await r.json();
      if (!r.ok) { setPesan(j.error ?? `Gagal ${label} indikator.`); return; }
      setAktif(nilaiBaru);
      await muatDaftar();
      setPesan(nilaiBaru ? "Indikator diaktifkan kembali." : "Indikator dinonaktifkan.");
    } finally { setSibuk(false); }
  }

  return (
    <div className="fb">
      <JudulHalaman
        eyebrow="Data & indikator"
        meta={<><TitikStatus nada={jmlAktif ? "good" : "netral"} /> {jmlAktif} dari {daftar.length} indikator aktif</>}
        judul="Create Indicator"
        deskripsi="Susun rumus indikator dari kolom data API, uji atas data mentah sungguhan, lalu daftarkan ke jabatan dan produk yang dinilai."
      />

      <div className="ind-tata fb-tata">
        {/* --- daftar indikator --- */}
        <aside className="fb-samping">
          <section className="card fb-panel">
            <div className="fb-panel-kepala">
              <h2><Ikon nama="formula" ukuran={18} /> Indikator</h2>
              <button className="btn sm" onClick={kosongkan}><Ikon nama="plus" ukuran={14} tebal={2.2} /> Baru</button>
            </div>
            <label className="fb-cari">
              <Ikon nama="search" ukuran={15} />
              <input value={cariInd} placeholder="Cari indikator…" onChange={(e) => setCariInd(e.target.value)} />
            </label>
            <div className="ind-daftar fb-daftar">
              {!pilihId && (
                <div className="ind-item fb-item on fb-draf">
                  <span className="ind-item-atas">
                    <b>{nama.trim() || "Indikator baru"}</b>
                    <span className="fb-lencana draf">draf</span>
                  </span>
                  <span className="faint">belum disimpan</span>
                </div>
              )}
              {daftarTampil.map((d) => (
                <button key={d.id}
                        className={"ind-item fb-item" + (d.id === pilihId ? " on" : "") + (d.aktif ? "" : " mati")}
                        onClick={() => buka(d.id)} disabled={sibuk && d.id !== pilihId}>
                  <span className="ind-item-atas">
                    <b title={d.nama}>{d.nama}</b>
                    {!d.aktif && <span className="fb-lencana mati">nonaktif</span>}
                    <span className={"ind-item-satuan s-" + d.satuan}>
                      {d.satuan === "persen" ? "%" : d.satuan === "rupiah" ? "Rp" : "#"}
                    </span>
                  </span>
                  <span className="fb-item-meta num">
                    {d.komponen} komponen <i aria-hidden /> {d.terdaftar} pendaftaran
                  </span>
                </button>
              ))}
              {!daftar.length && <p className="empty">Belum ada indikator.</p>}
              {!!daftar.length && !daftarTampil.length && <p className="empty">Tidak ada yang cocok.</p>}
            </div>
          </section>

          <section className="card fb-panel fb-statistik">
            <span className="eyebrow">STATISTIK PENGGUNAAN</span>
            <div className="fb-stat-grid">
              <div><b className="num">{jmlAktif}</b><span>indikator aktif</span></div>
              <div><b className="num">{jmlDaftar}</b><span>pendaftaran</span></div>
            </div>
          </section>
        </aside>

        {/* --- perakit --- */}
        <section className="ind-utama fb-utama">
          <div className="card fb-editor">
            <div className="fb-editor-kepala">
              <div className="fb-identitas">
                <div className="fb-status">
                  {pilihId
                    ? <span className={"pa-status " + (aktif ? "good" : "warn")}>{aktif ? "tersimpan" : "nonaktif"}</span>
                    : <span className="ri-status accent">indikator baru</span>}
                </div>
                <input className="ind-nama fb-nama" value={nama} placeholder="Nama indikator…"
                       onChange={(e) => setNama(e.target.value)} />
                <input className="ind-desk fb-desk" value={deskripsi} placeholder="Keterangan singkat (opsional)"
                       onChange={(e) => setDeskripsi(e.target.value)} />
              </div>
              <div className="ind-aksi fb-aksi">
                <button className="btn ghost" disabled={sibuk} onClick={jalankanUji}>
                  <Ikon nama="target" ukuran={16} /> Uji rumus
                </button>
                <button className="btn" disabled={sibuk || !nama.trim()} onClick={simpan}>
                  <Ikon nama="check" ukuran={16} tebal={2.2} /> {sibuk ? "Memproses…" : "Simpan"}
                </button>
                <button className="btn polos" disabled={sibuk} onClick={hitungUlang}
                        title="Hitung ulang semua indikator dari data mentah yang sudah ada — tanpa menarik data baru">
                  <Ikon nama="refresh" ukuran={16} /> Hitung ulang
                </button>
                {pilihId && (
                  <button className={"btn " + (aktif ? "tint-bad" : "tint-good")} disabled={sibuk} onClick={ubahAktif}
                          title={aktif
                            ? "Nonaktifkan — berhenti ikut dihitung tanpa menghapus rumus atau pendaftarannya"
                            : "Aktifkan kembali indikator ini"}>
                    <Ikon nama="eye" ukuran={16} /> {aktif ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                )}
                {pilihId && (
                  <button className="btn tint-bad" disabled={sibuk} onClick={hapusIndikator} title="Hapus indikator">
                    <Ikon nama="trash" ukuran={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="fb-editor-isi">
              {pesan && (
                <div className={"alert-box " + (pesanOk ? "good" : "bad")} role="status">
                  <span className="alert-ikon">{pesanOk ? "✓" : "!"}</span>
                  <span>{pesan}</span>
                  <button className="alert-tutup" onClick={() => setPesan(null)} aria-label="Tutup pesan">×</button>
                </div>
              )}

              <div className="fb-atribut">
                <span className="eyebrow">KONFIGURASI ATRIBUT INDIKATOR</span>
                <div className="ind-atur fb-atur">
                  <label className="field">
                    <span>Dihitung untuk</span>
                    <Pilih nilai={peranPic} cari={false} onPilih={setPeranPic}
                           opsi={[
                             { nilai: "staff", label: "Staf pelaksana", ket: "kolom staff_pic" },
                             { nilai: "spv", label: "Supervisor", ket: "kolom spv_pic" },
                             { nilai: "bch", label: "Kepala cabang", ket: "kolom bch_pic" },
                           ]} />
                  </label>
                  <label className="field">
                    <span>Satuan</span>
                    <Pilih nilai={satuan} cari={false} onPilih={setSatuan}
                           opsi={[
                             { nilai: "persen", label: "Persen" },
                             { nilai: "rupiah", label: "Rupiah" },
                             { nilai: "unit", label: "Unit" },
                           ]} />
                  </label>
                  <label className="field">
                    <span>Sumber data tambahan</span>
                    <Pilih nilai={sumberKode} cari={sumber.length > 7}
                           onPilih={setSumberKode}
                           opsi={[
                             { nilai: "", label: "Hanya data utama", ket: "kolom dari API utama saja" },
                             ...sumber
                               .filter((s) => s.jenis !== "utama" && s.kode !== kodeUtama)
                               .map((s) => ({
                                 nilai: s.kode, label: s.nama,
                                 ket: s.jenis === "api" ? "API, digabung lewat nomor kontrak"
                                                        : "unggahan, digabung lewat nomor kontrak",
                               })),
                           ]} />
                  </label>
                </div>
                <label className="fb-kali">
                  <input type="checkbox" checked={kaliSeratus}
                         onChange={(e) => setKaliSeratus(e.target.checked)} />
                  Kalikan 100 <span className="faint">(rasio otomatis jadi persen)</span>
                </label>
              </div>

              {/* Kolom data utama tidak pernah disembunyikan: di sanalah NIK PIC,
                  cabang, dan produk berada, dan tanpa ketiganya tidak ada
                  indikator yang bisa dihitung untuk siapa pun. Yang dipilih di
                  atas adalah sumber KEDUA yang ikut digabung. */}
              {kolomAsing.length > 0 && (
                <div className="alert-box warn">
                  <span className="alert-ikon">!</span>
                  <span>
                    Rumus ini masih memakai kolom dari sumber lain: <b>{kolomAsing.join(", ")}</b>. Ganti kolomnya atau
                    pilih kembali sumber yang sesuai — kalau disimpan begini, perhitungannya akan gagal karena tabelnya
                    tidak ikut digabung.
                  </span>
                </div>
              )}

              {/* --- kartu komponen --- */}
              <div className="fb-komponen">
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
                            ["*", "×", "kali"], ["/", "÷", "bagi"]].map(([v, simbol, namaOp]) => (
                            <button key={v} title={namaOp}
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
                      k={k} indeks={i} kolom={kolomTerpakai} sibuk={sibuk} nilaiUnik={nilaiUnik}
                      peranLabel={komponen[i + 1]?.operator_sebelum === "/" ? "Pembilang"
                        : k.operator_sebelum === "/" ? "Penyebut" : undefined}
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
              </div>

              <div className="ind-tambah fb-tambah">
                <button className="btn ghost sm" onClick={() => setKomponen([...komponen, kartuKosong(false)])}>
                  <Ikon nama="plus" ukuran={14} /> Tambah komponen
                </button>
                {komponen.length === 1 && (
                  /* Petunjuk khusus saat baru satu kartu: rasio adalah bentuk
                     indikator paling umum di sini, dan tanpa kartu kedua tidak
                     ada tempat operator pembagian muncul — mudah disangka
                     fiturnya tidak ada. */
                  <span className="fb-petunjuk">
                    <Ikon nama="bulb" ukuran={14} />
                    Tambahkan komponen kedua untuk membuat pembagian — mis. <code>Success Rate = A ÷ B</code>
                  </span>
                )}
              </div>

              <div className="fb-rumus">
                <div className="fb-rumus-atas">
                  <span className="eyebrow">RUMUS YANG DIJALANKAN</span>
                  <span className="faint small">dihitung dari atas ke bawah, persis seperti terbaca</span>
                </div>
                <div className="ind-ringkas fb-ringkas">
                  <span className="fb-f" aria-hidden>ƒ</span>
                  <code>{ringkasRumus}</code>
                  <button className="pa-ikon-btn" onClick={salinRumus} title="Salin rumus">
                    <Ikon nama={tersalin ? "check" : "copy"} ukuran={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* --- hasil uji --- */}
          {uji && (
            <section className="card fb-uji">
              <div className="rk-kartu-kepala">
                <span className="km-ikon good"><Ikon nama="target" ukuran={20} /></span>
                <div>
                  <h2>Hasil uji atas data mentah</h2>
                  <p className="faint small num fb-uji-rumus">{uji.rumus}</p>
                </div>
                <button className="pa-tutup" onClick={() => setUji(null)} aria-label="Tutup hasil uji">×</button>
              </div>
              <div className="tabel-scroll">
                <table className="rk-tabel">
                  <thead>
                    <tr><th>NIK</th><th>Nama</th><th className="r">Baris</th><th className="r">Nilai</th></tr>
                  </thead>
                  <tbody>
                    {uji.contoh.map((c) => (
                      <tr key={c.nik}>
                        <td className="num faint">{c.nik}</td>
                        <td><div className="pa-nama">{c.nama}</div><div className="pa-sub">{c.cabang ?? "—"}</div></td>
                        <td className="r num faint">{c.baris.toLocaleString("id-ID")}</td>
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
              </div>
            </section>
          )}

          {/* --- pendaftaran ke jabatan + produk --- */}
          <section className="card fb-daftarkan">
            <div className="rk-kartu-kepala">
              <span className="km-ikon accent"><Ikon nama="badge" ukuran={20} /></span>
              <div>
                <h2>Didaftarkan ke jabatan · produk <span className="da-hitung num">{target.length}</span></h2>
                <p className="faint small">
                  Indikator hanya dihitung untuk pasangan yang terdaftar di sini. Bobot KPI dan bobot insentif berdiri
                  sendiri — kosongkan salah satu bila indikator ini tidak ikut skema tersebut.
                </p>
              </div>
              {!!target.length && (
                <button className="btn sm" onClick={tambahTarget}>
                  <Ikon nama="plus" ukuran={14} tebal={2.2} /> Daftarkan
                </button>
              )}
            </div>

            {/* Tiap pendaftaran adalah kartu baris sendiri, bukan baris tabel.
                Empat kotak pilih berdampingan dulu terasa seperti formulir
                yang dipaksa masuk ke tabel — lebar kolom kaku, dan baris yang
                mekar jadi panel tidak terasa menyambung ke baris pemicunya.
                Sebagai kartu, panel detail bisa menempel langsung di bawah
                kepala kartu yang sama alih-alih jadi tempelan terpisah. */}
            <div className="daftar-target fb-target">
              {target.map((t, i) => {
                const ubah = (patch: Partial<Target>) =>
                  setTarget(target.map((x, y) => (y === i ? { ...x, ...patch } : x)));
                // Pendaftaran lain pada indikator yang sama -- bahan tombol
                // "Salin ke pendaftaran lain" di editor pita/nominal.
                const opsiSalin = target
                  .map((x, y) => ({
                    label: `${x.alias || "(jabatan kosong)"} · ${x.produk || "(produk kosong)"}`,
                    index: y,
                  }))
                  .filter((o) => o.index !== i);
                const salinKe = (tujuan: number[], bidang: "pita" | "nominal") =>
                  setTarget(target.map((x, y) =>
                    tujuan.includes(y) ? { ...x, [bidang]: t[bidang].map((p) => ({ ...p })) } : x));
                const adaPita = t.pita.length > 0;
                const ringkasan =
                  t.peran === "reward" || t.peran === "penalty"
                    ? (t.nilai_efek
                        ? `${t.jenis_nilai === "persen" ? t.nilai_efek + "%" : "Rp" + Number(t.nilai_efek).toLocaleString("id-ID")} per satuan hasil hitung`
                        : "Belum diisi nilai efeknya")
                    : t.peran === "tier"
                    ? (adaPita ? `${t.pita.length} pita tier` : "Belum ada pita")
                    : t.peran === "pendukung"
                    ? "Bahan syarat, tidak dinilai"
                    : t.peran === "nominal"
                    ? [
                        t.gerbang.length ? `${t.gerbang.length} syarat` : "Tanpa syarat",
                        t.nominal.length ? `${t.nominal.length} pita nominal` : "belum ada pita nominal",
                      ].join(" · ")
                    : [
                        t.bobot_kpi && `KPI ${t.bobot_kpi}%`,
                        t.bobot_insentif && `Insentif ${t.bobot_insentif}%`,
                        adaPita && `${t.pita.length} pita`,
                      ].filter(Boolean).join(" · ") || "Belum diisi";
                const terbuka = detailBuka === i;
                return (
                  <div className={"trow" + (terbuka ? " buka" : "")} key={i}>
                    <div className="trow-atas">
                      <div className="trow-field trow-jabatan">
                        <span className="trow-label">Jabatan</span>
                        <Pilih nilai={t.alias} bebas placeholder="Pilih jabatan"
                               onPilih={(v) => ubah({ alias: v.toUpperCase() })}
                               opsi={jabatan.map((a) => ({ nilai: a, label: a }))} />
                      </div>
                      <div className="trow-field trow-produk">
                        <span className="trow-label">Produk</span>
                        <Pilih nilai={t.produk} cari={false} onPilih={(v) => ubah({ produk: v })}
                               opsi={produk.map((p) => ({ nilai: p.kode, label: p.kode, ket: p.nama }))} />
                      </div>
                      <div className="trow-field trow-peran">
                        <span className="trow-label">Peran</span>
                        <Pilih nilai={t.peran} cari={false} onPilih={(v) => ubah({ peran: v })}
                               opsi={PERAN_OPSI} />
                      </div>
                      <div className={"trow-ringkas warna-" + (PERAN_WARNA[t.peran] ?? "netral")}>
                        <span className="trow-label">Ringkasan</span>
                        <span className="trow-ringkas-teks">
                          <i className="trow-dot" aria-hidden />
                          <span className="trow-ringkas-str" title={ringkasan}>{ringkasan}</span>
                        </span>
                      </div>
                      <div className="trow-aksi">
                        <button className={"btn sm " + (terbuka ? "tint" : "ghost")} onClick={() => setDetailBuka(terbuka ? null : i)}>
                          <Ikon nama={terbuka ? "chevronDown" : "pencil"} ukuran={14} /> {terbuka ? "Tutup" : "Atur"}
                        </button>
                        <button className="pa-ikon-btn fb-lepas" title={`Lepaskan ${t.alias || "baris ini"}`}
                                onClick={() => {
                                  setTarget(target.filter((_, y) => y !== i));
                                  if (terbuka) setDetailBuka(null);
                                }}>×</button>
                      </div>
                    </div>
                    {terbuka && (
                      <div className="trow-detail">
                        <DetailTarget t={t} ubah={ubah} lain={lain} namaSendiri={nama}
                                     opsiSalin={opsiSalin} salinKe={salinKe} />
                      </div>
                    )}
                  </div>
                );
              })}
              {!target.length && (
                <div className="fb-kosong">
                  <span className="fb-kosong-ikon"><Ikon nama="badge" ukuran={24} /></span>
                  <b>Belum didaftarkan</b>
                  <p>Belum didaftarkan ke jabatan mana pun, jadi rumus ini belum akan dihitung untuk skor KPI maupun insentif.</p>
                  <button className="btn tint sm" onClick={tambahTarget}>
                    <Ikon nama="plus" ukuran={14} /> Daftarkan sekarang
                  </button>
                </div>
              )}
            </div>

            {target.some((t) => t.alias && !jabatan.includes(t.alias)) && (
              <div className="alert-box warn fb-peringatan">
                <span className="alert-ikon">!</span>
                <span>
                  Ada jabatan yang belum punya pemetaan produk di Master Produk. Indikator tidak akan dihitung untuk
                  jabatan itu sampai dipetakan.
                </span>
              </div>
            )}
          </section>

          <div className="fb-info">
            <div className="card fb-info-kartu">
              <span className="km-ikon"><Ikon nama="columns" ukuran={18} /></span>
              <div>
                <b>Kolom yang bisa dipakai</b>
                <p>Kolom rumus berasal dari <Link href="/admin/kolom-api">CRUD Kolom API</Link> dan{" "}
                  <Link href="/admin/turunan">Kolom Turunan</Link>. Kolom baru terisi pada tarikan berikutnya.</p>
              </div>
            </div>
            <div className="card fb-info-kartu">
              <span className="km-ikon"><Ikon nama="api" ukuran={18} /></span>
              <div>
                <b>Angka yang dipakai uji</b>
                <p>“Uji rumus” membaca data mentah hasil tarikan terakhir — periksa isinya di{" "}
                  <Link href="/admin/sampel-data">Sample Data API</Link> atau status tarikan di <Link href="/admin/data-api">Data API</Link>.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
