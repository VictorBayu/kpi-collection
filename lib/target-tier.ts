import * as XLSX from "xlsx";
import { q } from "./db";

/**
 * Target Tier — target Delq/Coll per periode · kelompok produk (MIX/R2/R4)
 * · cabang atau area · bucket. Rancangan: dokumen "Rancangan Menu Target
 * Tiering (Delq)".
 *
 * Template berformat datar: satu kolom satu nilai, nama kolom
 * `TargetT{n}_{bucket}`, mis. TargetT5_Delq0+. tier_aktif per bucket ada di
 * kolom `Tier 0+` .. `Tier 90+` (dan `Tier Coll1-30`). Semua nilai dibaca
 * apa adanya dari file — sistem tidak menurunkan apa pun.
 *
 * Sel kosong = NULL (belum berlaku). 0 = target 0 yang sah.
 */

export const KELOMPOK = ["MIX", "R2", "R4"] as const;
export type Kelompok = (typeof KELOMPOK)[number];

export const BUCKET = [
  { kode: "coll1_30", label: "Coll1-30", kolomTier: "Tier Coll1-30", kecilBaik: false },
  { kode: "delq0",    label: "Delq0+",   kolomTier: "Tier 0+",       kecilBaik: true },
  { kode: "delq30",   label: "Delq30+",  kolomTier: "Tier 30+",      kecilBaik: true },
  { kode: "delq60",   label: "Delq60+",  kolomTier: "Tier 60+",      kecilBaik: true },
  { kode: "delq90",   label: "Delq90+",  kolomTier: "Tier 90+",      kecilBaik: true },
] as const;
export type KodeBucket = (typeof BUCKET)[number]["kode"];

/** Satuan per kelompok: R4 nominal rupiah, MIX & R2 persen. */
export const satuanKelompok = (k: string) => (k === "R4" ? "nominal" : "persen");

const TIER = [5, 4, 3, 2, 1] as const;
const kolomTarget = (n: number, b: (typeof BUCKET)[number]) => `TargetT${n}_${b.label}`;

export const HEADER_TEMPLATE = [
  "Periode", "Product", "Cabang/Area", "Grading",
  ...BUCKET.map((b) => b.kolomTier),
  ...TIER.flatMap((n) => BUCKET.map((b) => kolomTarget(n, b))),
];

export type BarisTarget = {
  kelompok_produk: string;
  tipe_lokasi: "cabang" | "area";
  cabang_atau_area: string;
  bucket: KodeBucket;
  satuan: string;
  tier_aktif: number | null;
  t1: number | null; t2: number | null; t3: number | null; t4: number | null; t5: number | null;
};

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** Daftar cabang & area yang dikenal (master cabang API). */
export async function lokasiDikenal() {
  const rows = await q<{ cabang: string; area: string | null }>(
    `SELECT cabang, area FROM cabang_api WHERE aktif ORDER BY area NULLS LAST, cabang`);
  return {
    rows,
    cabang: new Map(rows.map((r) => [norm(r.cabang), r.cabang])),
    area: new Map(rows.filter((r) => r.area).map((r) => [norm(r.area), r.area as string])),
  };
}

/* ------------------------------------------------------------------ */
/* Template                                                            */
/* ------------------------------------------------------------------ */

/**
 * Template satu periode. Baris = tiap kelompok × tiap cabang aktif.
 * Isinya: nilai periode ini bila sudah ada; Tier per bucket yang masih
 * kosong diisi dari Tier Cabang di Grading Cabang (untuk R2/R4; MIX tidak
 * punya grading sendiri).
 */
export async function buatTemplate(periode: string): Promise<Buffer> {
  const [{ rows: lokasi }, ada, grading] = await Promise.all([
    lokasiDikenal(),
    q<any>(`SELECT * FROM target_tier WHERE periode = $1::date`, [periode]),
    q<any>(
      `SELECT DISTINCT ON (cabang, produk) cabang, produk, kelas, tier
         FROM cabang_kelas WHERE berlaku_mulai <= $1::date
        ORDER BY cabang, produk, berlaku_mulai DESC`, [periode]),
  ]);

  const kunciAda = (k: string, tipe: string, tempat: string, b: string) =>
    `${k}|${tipe}|${norm(tempat)}|${b}`;
  const petaAda = new Map(ada.map((r: any) =>
    [kunciAda(r.kelompok_produk, r.tipe_lokasi, r.cabang_atau_area, r.bucket), r]));
  const petaGrading = new Map(grading.map((g: any) => [`${norm(g.cabang)}|${g.produk}`, g]));

  // Baris area yang sudah ada ikut ditulis di bawah baris cabang.
  const areaAda = [...new Set(ada.filter((r: any) => r.tipe_lokasi === "area")
    .map((r: any) => `${r.kelompok_produk}|${r.cabang_atau_area}`))];

  const isiBaris = (k: string, tipe: "cabang" | "area", tempat: string) => {
    const g = tipe === "cabang" ? petaGrading.get(`${norm(tempat)}|${k}`) : null;
    const o: Record<string, unknown> = {
      Periode: periode.slice(0, 7), Product: k, "Cabang/Area": tempat,
      Grading: g?.kelas ? String(g.kelas).toUpperCase() : "",
    };
    for (const b of BUCKET) {
      const r = petaAda.get(kunciAda(k, tipe, tempat, b.kode));
      o[b.kolomTier] = r?.tier_aktif ?? (b.kode === "coll1_30" ? "" : (g?.tier ?? ""));
      for (const n of TIER) {
        const v = r?.[`t${n}`];
        o[kolomTarget(n, b)] = v === null || v === undefined ? "" : Number(v);
      }
    }
    return o;
  };

  const data: Record<string, unknown>[] = [];
  for (const k of KELOMPOK) {
    for (const c of lokasi) data.push(isiBaris(k, "cabang", c.cabang));
  }
  for (const a of areaAda) {
    const [k, tempat] = a.split("|");
    data.push(isiBaris(k, "area", tempat));
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data, { header: HEADER_TEMPLATE });
  ws["!cols"] = HEADER_TEMPLATE.map((h, i) => ({ wch: i < 3 ? 16 : Math.max(10, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "TARGET TIER");

  const petunjuk = [
    ["Kolom", "Keterangan"],
    ["Periode", "Bulan berlaku target, format YYYY-MM (mis. 2026-10). Satu berkas = satu periode; harus sama dengan periode yang dipilih saat unggah."],
    ["Product", "MIX, R2, atau R4."],
    ["Cabang/Area", "Nama cabang (sesuai master cabang) atau nama area untuk target level area."],
    ["Grading", "Hanya referensi, TIDAK diimpor. Grading dikelola di menu Grading Cabang."],
    ["Tier 0+ .. Tier 90+, Tier Coll1-30", "Tier aktif (1-5) per bucket. Terisi dari Tier Cabang di Grading Cabang; boleh ditimpa per bucket."],
    ["TargetT{n}_{bucket}", "Target tier n untuk bucket itu. MIX & R2 dalam persen (13,74 atau format % Excel), R4 dalam rupiah."],
    ["Sel kosong", "Belum berlaku (disimpan kosong, BUKAN 0). Isi 0 hanya bila target 0 memang sah."],
    ["Arah", "Delq: makin kecil makin baik (T5 paling ketat = paling kecil). Coll: makin besar makin baik."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(petunjuk), "Petunjuk");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* ------------------------------------------------------------------ */
/* Baca & validasi                                                     */
/* ------------------------------------------------------------------ */

export type HasilBaca = {
  baris: BarisTarget[];
  galat: string[];       // menghentikan simpan
  peringatan: string[];  // boleh disimpan
  ringkas: { barisFile: number; barisTarget: number; berubah: number; baru: number };
};

/** Angka dari sel. Persen yang diformat % di Excel (0,1374) dijadikan 13,74. */
function angkaSel(cell: XLSX.CellObject | undefined, satuan: string): number | null | "salah" {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === "") return null;
  let n: number;
  if (typeof cell.v === "number") n = cell.v;
  else {
    const s = String(cell.v).trim().replace(/%$/, "").replace(/\./g, "").replace(",", ".");
    if (!s) return null;
    n = Number(s);
    if (!Number.isFinite(n)) return "salah";
    return n;
  }
  if (satuan === "persen" && typeof cell.z === "string" && cell.z.includes("%")) n = n * 100;
  return Math.round(n * 1e6) / 1e6;
}

/** "2026-10", "2026-10-01", tanggal Excel, atau "10/2026" -> YYYY-MM-01. */
function bacaPeriode(v: unknown): string | null {
  if (v instanceof Date) {
    const j = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/.exec(t);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  return null;
}

export async function bacaFile(buf: ArrayBuffer, periode: string): Promise<HasilBaca> {
  const wb = XLSX.read(buf, { type: "array", cellNF: true, cellDates: true });
  const nama = wb.SheetNames.find((n) => /target/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[nama];
  if (!ws || !ws["!ref"]) throw new Error("Berkas tidak punya lembar data yang bisa dibaca.");

  const rng = XLSX.utils.decode_range(ws["!ref"]);
  const header: string[] = [];
  for (let c = rng.s.c; c <= rng.e.c; c++) {
    const v = ws[XLSX.utils.encode_cell({ r: rng.s.r, c })]?.v;
    header.push(String(v ?? "").trim());
  }
  const idx = (h: string) => header.findIndex((x) => x.toLowerCase() === h.toLowerCase());

  const galat: string[] = [];
  const peringatan: string[] = [];
  for (const wajib of ["Periode", "Product", "Cabang/Area"]) {
    if (idx(wajib) < 0) galat.push(`Kolom "${wajib}" tidak ditemukan di baris judul.`);
  }
  // Kolom target dikenali lewat pola TargetT{n}_{bucket}.
  const petaKolom = new Map<string, number>(); // `${n}|${bucket}` -> kolom
  header.forEach((h, c) => {
    const m = /^TargetT([1-5])_(.+)$/i.exec(h.replace(/\s+/g, ""));
    if (!m) return;
    const b = BUCKET.find((x) => x.label.toLowerCase() === m[2].toLowerCase());
    if (b) petaKolom.set(`${m[1]}|${b.kode}`, c);
  });
  if (!petaKolom.size) galat.push("Tidak ada kolom TargetT{n}_{bucket} yang dikenali (mis. TargetT5_Delq0+).");
  if (galat.length) return { baris: [], galat, peringatan, ringkas: { barisFile: 0, barisTarget: 0, berubah: 0, baru: 0 } };

  const lok = await lokasiDikenal();
  const sel = (r: number, c: number) => (c < 0 ? undefined : ws[XLSX.utils.encode_cell({ r, c })]);

  const hasil: BarisTarget[] = [];
  const kunciTerlihat = new Map<string, number>();
  let barisFile = 0;

  for (let r = rng.s.r + 1; r <= rng.e.r; r++) {
    const no = r + 1; // nomor baris Excel
    const periodeRaw = sel(r, idx("Periode"))?.v;
    const produkRaw = norm(sel(r, idx("Product"))?.v);
    const tempatRaw = norm(sel(r, idx("Cabang/Area"))?.v);
    if (!produkRaw && !tempatRaw) continue;
    barisFile++;

    const pb = bacaPeriode(periodeRaw);
    if (!pb) { galat.push(`Baris ${no}: Periode "${periodeRaw ?? ""}" tidak terbaca (pakai YYYY-MM, mis. ${periode.slice(0, 7)}).`); continue; }
    if (pb !== periode) {
      galat.push(`Baris ${no}: Periode ${pb.slice(0, 7)} berbeda dari periode yang dipilih (${periode.slice(0, 7)}). Satu berkas hanya untuk satu periode.`);
      continue;
    }

    if (!KELOMPOK.includes(produkRaw as Kelompok)) {
      galat.push(`Baris ${no}: Product "${produkRaw || "(kosong)"}" tidak dikenal (MIX/R2/R4).`);
      continue;
    }
    let tipe: "cabang" | "area";
    let tempat: string;
    if (lok.cabang.has(tempatRaw)) { tipe = "cabang"; tempat = lok.cabang.get(tempatRaw)!; }
    else if (lok.area.has(tempatRaw)) { tipe = "area"; tempat = lok.area.get(tempatRaw)!; }
    else { galat.push(`Baris ${no}: Cabang/Area "${tempatRaw || "(kosong)"}" tidak ada di master cabang.`); continue; }

    const kunciBaris = `${produkRaw}|${tipe}|${tempat}`;
    if (kunciTerlihat.has(kunciBaris)) {
      galat.push(`Baris ${no}: ${produkRaw} · ${tempat} ganda (sudah ada di baris ${kunciTerlihat.get(kunciBaris)}).`);
      continue;
    }
    kunciTerlihat.set(kunciBaris, no);
    const satuan = satuanKelompok(produkRaw);

    for (const b of BUCKET) {
      const t: Record<number, number | null> = {};
      let adaIsi = false;
      for (const n of TIER) {
        const c = petaKolom.get(`${n}|${b.kode}`);
        const v = c === undefined ? null : angkaSel(sel(r, c), satuan);
        if (v === "salah") { galat.push(`Baris ${no}: ${kolomTarget(n, b)} bukan angka.`); t[n] = null; continue; }
        t[n] = v;
        if (v !== null) adaIsi = true;
      }
      const tierRaw = sel(r, idx(b.kolomTier))?.v;
      let tier: number | null = null;
      if (tierRaw !== undefined && tierRaw !== null && String(tierRaw).trim() !== "") {
        const n = Number(String(tierRaw).trim());
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          galat.push(`Baris ${no}: ${b.kolomTier} harus 1-5 (terbaca "${tierRaw}").`);
        } else tier = n;
      }
      if (!adaIsi && tier === null) continue; // bucket ini tidak dipakai di baris ini

      const label = `Baris ${no} ${produkRaw} · ${tempat} · ${b.label}`;
      if (tier !== null && t[tier] === null) peringatan.push(`${label}: Tier ${tier} aktif tapi TargetT${tier} kosong — tidak bisa dinilai (standard).`);
      const terisi = TIER.filter((n) => t[n] !== null).map((n) => ({ n, v: t[n] as number }));
      if (terisi.some((x) => x.v === 0)) peringatan.push(`${label}: ada target bernilai 0. Kosongkan sel bila tier itu belum berlaku.`);
      // Urutan: Delq T5 <= T4 <= ... <= T1; Coll sebaliknya.
      for (let i = 0; i + 1 < terisi.length; i++) {
        const atas = terisi[i], bawah = terisi[i + 1]; // atas = tier lebih tinggi
        const salah = b.kecilBaik ? atas.v > bawah.v : atas.v < bawah.v;
        if (salah) {
          peringatan.push(`${label}: urutan tier tidak berurutan (T${atas.n}=${atas.v} vs T${bawah.n}=${bawah.v}).`);
          break;
        }
      }
      hasil.push({
        kelompok_produk: produkRaw, tipe_lokasi: tipe, cabang_atau_area: tempat, bucket: b.kode,
        satuan, tier_aktif: tier,
        t1: t[1] ?? null, t2: t[2] ?? null, t3: t[3] ?? null, t4: t[4] ?? null, t5: t[5] ?? null,
      });
    }
  }

  // Selisih terhadap isi periode ini yang sudah tersimpan.
  const lama = await q<any>(`SELECT * FROM target_tier WHERE periode = $1::date`, [periode]);
  const k = (x: any) => `${x.kelompok_produk}|${x.tipe_lokasi}|${norm(x.cabang_atau_area)}|${x.bucket}`;
  const petaLama = new Map(lama.map((x: any) => [k(x), x]));
  let berubah = 0, baru = 0;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  for (const b of hasil) {
    const l = petaLama.get(k(b));
    if (!l) { baru++; continue; }
    if (num(l.tier_aktif) !== b.tier_aktif || [1, 2, 3, 4, 5].some((n) => num(l[`t${n}`]) !== (b as any)[`t${n}`])) berubah++;
  }

  return { baris: hasil, galat, peringatan, ringkas: { barisFile, barisTarget: hasil.length, berubah, baru } };
}

/** Mengganti seluruh isi satu periode dengan hasil baca. */
export async function simpanPeriode(periode: string, baris: BarisTarget[], oleh: string) {
  await q(`DELETE FROM target_tier WHERE periode = $1::date`, [periode]);
  for (let i = 0; i < baris.length; i += 500) {
    await q(
      `INSERT INTO target_tier
         (periode, kelompok_produk, tipe_lokasi, cabang_atau_area, bucket, satuan,
          tier_aktif, t1, t2, t3, t4, t5, dibuat_oleh)
       SELECT $1::date, r->>'kelompok_produk', r->>'tipe_lokasi', r->>'cabang_atau_area',
              r->>'bucket', r->>'satuan', (r->>'tier_aktif')::smallint,
              (r->>'t1')::numeric, (r->>'t2')::numeric, (r->>'t3')::numeric,
              (r->>'t4')::numeric, (r->>'t5')::numeric, $3
         FROM jsonb_array_elements($2::jsonb) r`,
      [periode, JSON.stringify(baris.slice(i, i + 500)), oleh]);
  }
}

/** Menyalin seluruh target satu periode ke periode lain. */
export async function salinPeriode(dari: string, ke: string, timpa: boolean, oleh: string) {
  const [{ n: nAsal }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM target_tier WHERE periode = $1::date`, [dari]);
  if (!nAsal) throw new Error("Periode asal belum punya target.");
  const [{ n: nTujuan }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM target_tier WHERE periode = $1::date`, [ke]);
  if (nTujuan && !timpa) throw new Error("Periode tujuan sudah berisi target. Centang timpa bila ingin diganti.");
  if (nTujuan) await q(`DELETE FROM target_tier WHERE periode = $1::date`, [ke]);
  await q(
    `INSERT INTO target_tier
       (periode, kelompok_produk, tipe_lokasi, cabang_atau_area, bucket, satuan,
        tier_aktif, t1, t2, t3, t4, t5, dibuat_oleh)
     SELECT $2::date, kelompok_produk, tipe_lokasi, cabang_atau_area, bucket, satuan,
            tier_aktif, t1, t2, t3, t4, t5, $3
       FROM target_tier WHERE periode = $1::date`, [dari, ke, oleh]);
  return { disalin: nAsal };
}
