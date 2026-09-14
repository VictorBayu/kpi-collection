import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { periksaEkspresi, hitungTurunan, daftarTurunan } from "@/lib/turunan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;
const TIPE_SQL: Record<string, string> = {
  angka: "NUMERIC(18,2)", teks: "TEXT", tanggal: "DATE",
};

export const GET = handler(async () => {
  await requireAdmin();

  const [turunan, kolom] = await Promise.all([
    q<any>(`SELECT t.kolom, t.mode, t.aturan, t.nilai_lain, t.ekspresi_sql,
                   t.dihitung_pada, t.baris_terisi, t.galat,
                   m.label, m.jenis, m.kelompok
              FROM kolom_turunan t
              JOIN mentah_kolom m ON m.kolom = t.kolom
             ORDER BY m.label`),
    q<any>(`SELECT kolom, label, jenis, kelompok, COALESCE(sumber,'api') AS sumber
              FROM mentah_kolom
             WHERE COALESCE(aktif,true) AND NOT COALESCE(turunan,false)
             ORDER BY sumber, urutan, label`),
  ]);

  return Response.json({ turunan, kolom });
});

/**
 * Membuat atau memperbarui satu kolom turunan.
 *
 * Kolom fisiknya dibuat sekalian di sini bila belum ada, supaya admin
 * tidak perlu mendaftarkannya dua kali di dua layar berbeda.
 */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const kolom = String(b.kolom ?? "").trim().toLowerCase();
  const label = String(b.label ?? "").trim();
  const jenis = String(b.jenis ?? "teks");
  const mode = b.mode === "sql" ? "sql" : "visual";

  if (!POLA_KOLOM.test(kolom)) {
    throw new HttpError(400,
      "Nama kolom hanya boleh huruf kecil, angka, dan garis bawah (mis. od_movement_new).");
  }
  if (label.length < 2) throw new HttpError(400, "Label kolom belum diisi.");
  if (!TIPE_SQL[jenis]) throw new HttpError(400, "Jenis kolom tidak dikenal.");

  const sah = new Set(
    (await q<{ kolom: string }>(`SELECT kolom FROM mentah_kolom`)).map((r) => r.kolom));

  if (mode === "sql") {
    const salah = periksaEkspresi(String(b.ekspresi_sql ?? ""), sah);
    if (salah.length) throw new HttpError(400, salah.join(" "));
  } else {
    const aturan = Array.isArray(b.aturan) ? b.aturan : [];
    if (!aturan.length) throw new HttpError(400, "Belum ada satu pun aturan.");
    for (const [i, c] of aturan.entries()) {
      if (!Array.isArray(c.syarat) || !c.syarat.length) {
        throw new HttpError(400, `Aturan ke-${i + 1} belum punya syarat.`);
      }
      for (const s of c.syarat) {
        if (!sah.has(String(s.kolom))) {
          throw new HttpError(400, `Kolom "${s.kolom}" pada aturan ke-${i + 1} tidak dikenal.`);
        }
      }
    }
  }

  // Kolom turunan selalu tinggal di data utama — lihat alasannya di
  // lib/turunan.ts (penggabungan tidak boleh berputar ke dirinya sendiri).
  const [ada] = await q<any>(
    `SELECT kolom, COALESCE(sumber,'api') AS sumber, COALESCE(turunan,false) AS turunan
       FROM mentah_kolom WHERE kolom = $1`, [kolom]);
  if (ada && ada.sumber !== "api") {
    throw new HttpError(400,
      `Kolom "${kolom}" terdaftar pada data pendukung. Kolom turunan harus di data API utama.`);
  }
  if (ada && !ada.turunan) {
    throw new HttpError(400,
      `Kolom "${kolom}" sudah dipakai sebagai kolom biasa. Pakai nama lain untuk kolom turunan.`);
  }

  if (!ada) {
    await q(`ALTER TABLE data_mentah ADD COLUMN IF NOT EXISTS "${kolom}" ${TIPE_SQL[jenis]}`);
    await q(`ALTER TABLE data_mentah_staging ADD COLUMN IF NOT EXISTS "${kolom}" ${TIPE_SQL[jenis]}`);
  }

  await q(
    `INSERT INTO mentah_kolom
       (kolom, label, jenis, agregat, kelompok, urutan, bawaan, aktif, sumber, turunan)
     VALUES ($1,$2,$3,$4,$5,$6,false,true,'api',true)
     ON CONFLICT (kolom) DO UPDATE
       SET label = EXCLUDED.label, agregat = EXCLUDED.agregat,
           kelompok = EXCLUDED.kelompok`,
    [kolom, label, jenis, jenis === "angka" && b.agregat === true,
     b.kelompok ? String(b.kelompok).trim() : "Olahan", 950]);

  await q(
    `INSERT INTO kolom_turunan (kolom, mode, aturan, nilai_lain, ekspresi_sql, diperbarui)
     VALUES ($1,$2,$3::jsonb,$4,$5,now())
     ON CONFLICT (kolom) DO UPDATE
       SET mode = EXCLUDED.mode, aturan = EXCLUDED.aturan,
           nilai_lain = EXCLUDED.nilai_lain, ekspresi_sql = EXCLUDED.ekspresi_sql,
           diperbarui = now()`,
    [kolom, mode, JSON.stringify(b.aturan ?? []),
     b.nilai_lain === "" || b.nilai_lain === undefined ? null : String(b.nilai_lain),
     mode === "sql" ? String(b.ekspresi_sql ?? "") : null]);

  await auditLog(admin.sub, "turunan.simpan", kolom, { mode });
  return Response.json({ ok: true, kolom });
});

/** Menghitung ulang satu kolom turunan sekarang juga. */
export const PATCH = handler(async (req) => {
  const admin = await requireAdmin();
  const { kolom } = await req.json();

  const t = (await daftarTurunan()).find((x) => x.kolom === kolom);
  if (!t) throw new HttpError(404, "Kolom turunan tidak ditemukan.");

  try {
    const baris = await hitungTurunan(t);
    await q(
      `UPDATE kolom_turunan SET dihitung_pada = now(), baris_terisi = $2, galat = NULL
        WHERE kolom = $1`, [kolom, baris]);
    await auditLog(admin.sub, "turunan.hitung", kolom, { baris });
    return Response.json({ ok: true, baris });
  } catch (e: any) {
    const pesan = e?.message ?? "Gagal menghitung.";
    await q(`UPDATE kolom_turunan SET dihitung_pada = now(), galat = $2 WHERE kolom = $1`,
      [kolom, pesan]);
    throw new HttpError(400, pesan);
  }
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const kolom = new URL(req.url).searchParams.get("kolom") ?? "";
  if (!POLA_KOLOM.test(kolom)) throw new HttpError(400, "Nama kolom tidak sah.");

  const dipakai = await q<{ nama: string }>(
    `SELECT DISTINCT d.nama
       FROM indikator_def d
       JOIN indikator_komponen k ON k.indikator_id = d.id
       LEFT JOIN indikator_syarat s ON s.komponen_id = k.id
      WHERE k.kolom = $1 OR k.pengakuan_kolom = $1 OR s.kolom = $1`, [kolom]);
  if (dipakai.length) {
    throw new HttpError(400,
      `Kolom ini dipakai indikator: ${dipakai.map((d) => d.nama).join(", ")}.`);
  }

  await q(`DELETE FROM kolom_turunan WHERE kolom = $1`, [kolom]);
  await q(`DELETE FROM mentah_kolom WHERE kolom = $1`, [kolom]);
  await q(`ALTER TABLE data_mentah DROP COLUMN IF EXISTS "${kolom}"`);
  await q(`ALTER TABLE data_mentah_staging DROP COLUMN IF EXISTS "${kolom}"`);

  await auditLog(admin.sub, "turunan.hapus", kolom);
  return Response.json({ ok: true });
});
