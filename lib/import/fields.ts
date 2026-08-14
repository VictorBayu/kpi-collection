/**
 * Definisi kolom sistem dan alias header Excel yang dikenali otomatis.
 * Tambahkan alias baru di sini kalau tim data memakai judul kolom lain —
 * tidak perlu menyentuh kode pemeriksaan.
 */

export type FieldType = "text" | "number" | "percent" | "nik";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  aliases: string[];
};

export const FIELDS_KPI: FieldDef[] = [
  { key: "nik",         label: "NIK karyawan",   type: "nik",     required: true,
    aliases: ["nik", "nama pic", "pic", "nik nama", "karyawan", "nik/nama"] },
  { key: "nama",        label: "Nama",           type: "text",    required: false,
    aliases: ["nama", "nama karyawan", "nama lengkap"] },
  { key: "jabatan",     label: "Jabatan",        type: "text",    required: false,
    aliases: ["jabatan", "posisi", "level jabatan"] },
  { key: "cabang",      label: "Cabang",         type: "text",    required: false,
    aliases: ["cabang", "branch", "kantor"] },
  { key: "produk",      label: "Produk",         type: "text",    required: false,
    aliases: ["produk", "product", "jenis produk"] },
  { key: "indikator",   label: "Indikator",      type: "text",    required: true,
    aliases: ["indikator", "kpi indikator", "parameter", "item kpi"] },
  { key: "bobot",       label: "Bobot",          type: "number",  required: false,
    aliases: ["bobot", "weight", "bobot kpi"] },
  { key: "saldo_awal",  label: "Saldo awal",     type: "number",  required: false,
    aliases: ["saldo awal", "saldo", "opening balance", "os awal"] },
  { key: "pencapaian",  label: "Pencapaian",     type: "number",  required: true,
    aliases: ["pencapaian", "achievement", "realisasi", "actual"] },
  { key: "rasio",       label: "% pencapaian",   type: "percent", required: false,
    aliases: ["% capai", "persen", "pencapaian ratio", "ratio", "achv", "% pencapaian"] },
  { key: "skor_kpi",    label: "Skor KPI",       type: "number",  required: true,
    aliases: ["kpi", "skor kpi", "score", "nilai kpi"] },
  { key: "skor_terbobot", label: "Skor terbobot", type: "number", required: false,
    aliases: ["score kpi", "skor terbobot", "weighted score", "nilai akhir"] },
  { key: "target_kpi3", label: "Target KPI 3",   type: "number",  required: false,
    aliases: ["target 3", "target kpi3", "kpi 3", "target kpi 3"] },
  { key: "target_kpi4", label: "Target KPI 4",   type: "number",  required: false,
    aliases: ["target 4", "target kpi4", "kpi 4", "target kpi 4"] },
  { key: "target_kpi5", label: "Target KPI 5",   type: "number",  required: false,
    aliases: ["target 5", "target kpi5", "kpi 5", "target kpi 5"] },
  { key: "catatan",     label: "Catatan",        type: "text",    required: false,
    aliases: ["notes", "catatan", "keterangan", "remark"] },
];

export const FIELDS_INSENTIF: FieldDef[] = [
  { key: "nik",        label: "NIK karyawan", type: "nik",     required: true,
    aliases: ["nik", "nama pic", "pic", "karyawan"] },
  { key: "kategori",   label: "Kategori",     type: "text",    required: true,
    aliases: ["kategori", "indikator", "jenis insentif", "item"] },
  { key: "produk",     label: "Produk",       type: "text",    required: false,
    aliases: ["produk", "product"] },
  { key: "saldo_awal", label: "Saldo awal",   type: "number",  required: false,
    aliases: ["saldo awal", "saldo", "os awal"] },
  { key: "pencapaian", label: "Pencapaian",   type: "number",  required: true,
    aliases: ["pencapaian", "realisasi", "achievement"] },
  { key: "rasio",      label: "% pencapaian", type: "percent", required: false,
    aliases: ["% capai", "persen", "ratio", "achv"] },
  { key: "nominal",    label: "Nominal insentif", type: "number", required: true,
    aliases: ["jumlah", "insentif", "nominal", "amount", "reward"] },
  { key: "keterangan", label: "Keterangan",   type: "text",    required: false,
    aliases: ["keterangan", "notes", "catatan"] },
];

export const FIELDS: Record<string, FieldDef[]> = {
  kpi: FIELDS_KPI,
  insentif: FIELDS_INSENTIF,
};

/** "  % Capai (YTD) " -> "capai ytd" */
export function normalize(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[%()\[\]{}.:_\-\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Menebak pemetaan header Excel ke kolom sistem.
 * Cocok persis diutamakan, baru pencocokan sebagian, supaya
 * "target 3" tidak salah tertarik ke "target 30 hari".
 */
export function guessMapping(headers: string[], tipe: string): Record<string, string> {
  const defs = FIELDS[tipe] ?? FIELDS_KPI;
  const norm = headers.map(normalize);
  const mapping: Record<string, string> = {};
  const taken = new Set<number>();

  for (const pass of ["exact", "partial"] as const) {
    for (const def of defs) {
      if (mapping[def.key]) continue;
      for (let i = 0; i < norm.length; i++) {
        if (taken.has(i) || !norm[i]) continue;
        const hit = def.aliases.some((a) =>
          pass === "exact" ? norm[i] === a : norm[i].includes(a) || a.includes(norm[i]),
        );
        if (hit) {
          mapping[def.key] = headers[i];
          taken.add(i);
          break;
        }
      }
    }
  }
  return mapping;
}
