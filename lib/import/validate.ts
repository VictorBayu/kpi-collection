import { FIELDS, type FieldDef } from "./fields";

export type Issue = {
  row: number;
  kolom: string | null;
  tingkat: "warning" | "error";
  pesan: string;
  nilai: string | null;
};

export type HasilBaris = {
  row: number;
  record: Record<string, any> | null;   // null kalau ditolak
  issues: Issue[];
};

export type KonteksValidasi = {
  tipe: "kpi" | "insentif";
  mapping: Record<string, string>;
  nikDikenal: Set<string>;
  namaByNik: Map<string, string>;
  periode: string;                       // "2026-08-01"
};

/* ---------------------------------------------------------------- angka */

/** Menerima 1234567, "1.234.567,89", "Rp 1.234.567", "82%", "#N/A". */
export function keAngka(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (/^(na|n\/a|#n\/a|-|nil|null)$/i.test(s)) return null;

  // Nilai berlabel seperti "Penyelesaian : 1,689,239,025" atau
  // "Score KPI : 3.20" -> ambil bagian setelah titik dua terakhir.
  if (s.includes(":")) s = s.slice(s.lastIndexOf(":") + 1).trim();
  if (/^(na|n\/a|#n\/a|-|nil|null)$/i.test(s)) return null;

  const persen = s.includes("%");
  s = s.replace(/rp|idr|\s|%/gi, "");

  // Bedakan pemisah ribuan dari titik desimal:
  //  "1.707.903.780.500" -> titik = ribuan (pola grup 3 digit)
  //  "4,114,968,296"     -> koma  = ribuan
  //  "41.05"             -> titik = desimal
  //  "12,5"              -> koma  = desimal (format Indonesia)
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return persen ? n / 100 : n;
}

/** "20240117 - RIZKY PRATAMA" -> "20240117" */
export function keNik(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/\d{6,16}/);
  return m ? m[0] : null;
}

export function keNama(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/\d{6,16}\s*[-–_]?\s*(.+)$/);
  return (m ? m[1] : s).trim() || null;
}

/* ------------------------------------------------------------ pemeriksa */

export function validasiBaris(
  raw: Record<string, any>,
  ctx: KonteksValidasi,
): HasilBaris {
  const rowNo = Number(raw.__row ?? 0);
  const issues: Issue[] = [];
  const defs = FIELDS[ctx.tipe];
  const rec: Record<string, any> = { periode: ctx.periode };

  const ambil = (key: string) => {
    const kolom = ctx.mapping[key];
    return kolom ? raw[kolom] : null;
  };
  const tolak = (kolom: string | null, pesan: string, nilai?: unknown) =>
    issues.push({ row: rowNo, kolom, tingkat: "error", pesan, nilai: str(nilai) });
  const tandai = (kolom: string | null, pesan: string, nilai?: unknown) =>
    issues.push({ row: rowNo, kolom, tingkat: "warning", pesan, nilai: str(nilai) });

  // --- NIK -------------------------------------------------------------
  const rawNik = ambil("nik");
  const nik = keNik(rawNik);
  if (!nik) {
    tolak(ctx.mapping.nik ?? null, "NIK tidak terbaca di baris ini. Pastikan kolom NIK terisi.", rawNik);
  } else if (!ctx.nikDikenal.has(nik)) {
    tolak(ctx.mapping.nik ?? null,
      `NIK ${nik} tidak ada di daftar karyawan aktif. Baris tidak akan diterbitkan.`, rawNik);
  } else {
    rec.nik = nik;
    const namaFile = keNama(ambil("nama") ?? rawNik);
    const namaDb = ctx.namaByNik.get(nik);
    if (namaFile && namaDb && !miripNama(namaFile, namaDb)) {
      tandai(ctx.mapping.nama ?? ctx.mapping.nik ?? null,
        `Nama berbeda dari data karyawan: "${namaFile}" vs "${namaDb}". Data karyawan yang dipakai.`, namaFile);
    }
    rec.nama = namaDb ?? namaFile;
  }

  // --- kolom lain ------------------------------------------------------
  for (const def of defs) {
    if (def.key === "nik" || def.key === "nama") continue;
    const kolom = ctx.mapping[def.key] ?? null;
    const nilai = kolom ? raw[kolom] : null;

    if (def.type === "text") {
      let s = nilai === null ? null : String(nilai).replace(/\s+/g, " ").trim();
      // Cabang diseragamkan huruf besar agar "Bch f mix" dan "BCH F MIX"
      // terhitung satu cabang yang sama di laporan.
      if (s && def.key === "cabang") s = s.toUpperCase();
      if (def.required && !s) {
        tolak(kolom, `Kolom ${def.label} wajib diisi.`, nilai);
      }
      rec[def.key] = s || null;
      continue;
    }

    const n = keAngka(nilai);
    if (n === null && nilai !== null && String(nilai).trim() !== "") {
      tolak(kolom, `Kolom ${def.label} berisi "${str(nilai)}" yang bukan angka. Isi angka atau kosongkan.`, nilai);
      continue;
    }
    if (n === null && def.required) {
      tolak(kolom, `Kolom ${def.label} kosong. Baris tidak bisa dihitung tanpa nilai ini.`, nilai);
      continue;
    }
    rec[def.key] = n;
  }

  // --- aturan masuk akal ----------------------------------------------
  if (ctx.tipe === "kpi") {
    if (typeof rec.skor_kpi === "number" && (rec.skor_kpi < 0 || rec.skor_kpi > 5)) {
      tolak(ctx.mapping.skor_kpi ?? null,
        `Skor KPI ${rec.skor_kpi} di luar rentang 0–5.`, rec.skor_kpi);
    }
    if (typeof rec.pencapaian === "number" && rec.pencapaian < 0) {
      tandai(ctx.mapping.pencapaian ?? null, "Pencapaian bernilai negatif. Pastikan bukan salah tanda.", rec.pencapaian);
    }
    if (typeof rec.saldo_awal === "number" && rec.saldo_awal > 0 &&
        typeof rec.pencapaian === "number" && rec.pencapaian > rec.saldo_awal * 3) {
      tandai(ctx.mapping.pencapaian ?? null,
        "Pencapaian lebih dari 3x saldo awal. Pastikan bukan salah satuan (ribuan vs rupiah).", rec.pencapaian);
    }
    if (rec.target_kpi5 === null || rec.target_kpi5 === undefined) {
      tandai(ctx.mapping.target_kpi5 ?? null, "Target KPI 5 kosong. Sistem memakai target periode sebelumnya.");
    }
    const t = [rec.target_kpi3, rec.target_kpi4, rec.target_kpi5].filter((x) => typeof x === "number");
    if (t.length === 3 && !(t[0] < t[1] && t[1] < t[2])) {
      tandai(null, "Urutan target tidak menaik (KPI 3 < 4 < 5). Periksa kembali angkanya.");
    }
  } else {
    // Nominal negatif adalah PENALTY yang sah (positif = extra/insentif).
    // Yang perlu diwaspadai hanya nilai ekstrem di kedua arah.
    if (typeof rec.nominal === "number" && rec.nominal > 50_000_000) {
      tandai(ctx.mapping.nominal ?? null,
        "Nominal di atas Rp 50 juta. Butuh persetujuan manager sebelum terbit.", rec.nominal);
    }
    if (typeof rec.nominal === "number" && rec.nominal < -50_000_000) {
      tandai(ctx.mapping.nominal ?? null,
        "Penalty di atas Rp 50 juta. Pastikan angkanya benar.", rec.nominal);
    }
  }

  const ditolak = issues.some((i) => i.tingkat === "error");
  return { row: rowNo, record: ditolak ? null : rec, issues };
}

/* --------------------------------------------------------------- utilitas */

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > 120 ? s.slice(0, 117) + "..." : s;
}

/** Toleran terhadap singkatan dan gelar: "Rizki P." ~ "Rizky Pratama". */
function miripNama(a: string, b: string): boolean {
  const bersih = (x: string) =>
    x.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
  const A = bersih(a), B = bersih(b);
  if (!A.length || !B.length) return true;
  return A[0] === B[0] || A[0].startsWith(B[0].slice(0, 4)) || B[0].startsWith(A[0].slice(0, 4));
}
