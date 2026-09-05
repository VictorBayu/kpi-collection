import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Katalog kolom data mentah — tambah, ubah, nonaktifkan, hapus.
 *
 * Bagian paling berbahaya di berkas ini adalah membuat kolom fisik baru:
 * nama kolom tidak bisa dilewatkan sebagai parameter, ia harus ditempel ke
 * teks DDL. Karena itu namanya disaring dengan pola ketat DUA KALI —
 * di sini sebelum dipakai, dan oleh CHECK di database sebelum tersimpan —
 * lalu dibungkus tanda kutip ganda saat ditempel.
 *
 * Aturan ubah/hapus:
 *   - Kolom inti: label, kelompok, urutan, keterangan, dan penanda agregat
 *     boleh diubah. Kode kolom, jenis, dan penghapusan dikunci.
 *   - Kolom kustom: semuanya boleh diubah selama belum dipakai indikator.
 *   - Menghapus kolom yang dipakai indikator selalu ditolak — angkanya
 *     akan hilang diam-diam, bukan memunculkan galat yang terlihat.
 */

const JENIS = ["angka", "teks", "tanggal"];
const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;

/**
 * Tabel fisik tiap sumber. Dipetakan dari daftar tetap, tidak pernah
 * dirangkai dari masukan pengguna — nama tabel ditempel ke DDL.
 */
const TABEL: Record<string, [string, string]> = {
  api: ["data_mentah", "data_mentah_staging"],
  pendukung: ["data_pendukung", "data_pendukung_staging"],
};

const TIPE_SQL: Record<string, string> = {
  angka: "NUMERIC(18,2)",
  teks: "TEXT",
  tanggal: "DATE",
};

/** Indikator yang memakai satu kolom — sebagai sumber, syarat, atau penentu pengakuan. */
async function pemakai(kolom: string) {
  const rows = await q<{ nama: string }>(
    `SELECT DISTINCT d.nama
       FROM indikator_def d
       JOIN indikator_komponen k ON k.indikator_id = d.id
       LEFT JOIN indikator_syarat s ON s.komponen_id = k.id
      WHERE k.kolom = $1 OR k.pengakuan_kolom = $1 OR s.kolom = $1
      ORDER BY d.nama`, [kolom]);
  return rows.map((r) => r.nama);
}

export const GET = handler(async () => {
  await requireAdmin();

  const [kolom, dipakai] = await Promise.all([
    q<any>(`SELECT kolom, label, jenis, agregat, kelompok, urutan,
                   field_api, bawaan, aktif, keterangan,
                   COALESCE(sumber,'api') AS sumber
              FROM mentah_kolom ORDER BY sumber, urutan, label`),
    q<any>(
      `SELECT kolom, COUNT(*)::int AS jml FROM (
         SELECT kolom FROM indikator_komponen WHERE kolom IS NOT NULL
         UNION ALL
         SELECT pengakuan_kolom FROM indikator_komponen WHERE pengakuan_kolom IS NOT NULL
         UNION ALL
         SELECT kolom FROM indikator_syarat WHERE kolom IS NOT NULL
       ) x GROUP BY kolom`),
  ]);

  const jml = new Map(dipakai.map((d) => [d.kolom, d.jml]));
  return Response.json({
    kolom: kolom.map((k) => ({ ...k, dipakai: jml.get(k.kolom) ?? 0 })),
  });
});

/** Tambah kolom baru: catat di katalog lalu buat kolom fisiknya. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const kolom = String(b.kolom ?? "").trim().toLowerCase();
  const label = String(b.label ?? "").trim();
  const jenis = String(b.jenis ?? "teks");

  if (!POLA_KOLOM.test(kolom)) {
    throw new HttpError(400,
      "Nama kolom hanya boleh huruf kecil, angka, dan garis bawah, diawali huruf (mis. contract_prepaid).");
  }
  if (label.length < 2) throw new HttpError(400, "Label kolom belum diisi.");
  if (!JENIS.includes(jenis)) throw new HttpError(400, "Jenis kolom tidak dikenal.");

  const sumber = String(b.sumber ?? "api");
  if (!TABEL[sumber]) throw new HttpError(400, "Sumber data tidak dikenal.");

  // Nama kolom wajib unik lintas sumber. Kalau tidak, rumus yang menyebut
  // "prepaid" jadi ambigu — dan yang paling merepotkan, ambiguitasnya baru
  // ketahuan saat angkanya salah, bukan saat rumusnya disusun.
  const [ada] = await q<any>(
    `SELECT kolom, COALESCE(sumber,'api') AS sumber FROM mentah_kolom WHERE kolom = $1`,
    [kolom]);
  if (ada) {
    throw new HttpError(400,
      `Kolom "${kolom}" sudah terdaftar pada sumber ${ada.sumber}. Pakai nama lain.`);
  }

  // Nama sudah lolos pola di atas; tanda kutip ganda mencegah nama yang
  // kebetulan sama dengan kata kunci SQL diperlakukan sebagai perintah.
  const tipe = TIPE_SQL[jenis];
  for (const t of TABEL[sumber]) {
    await q(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS "${kolom}" ${tipe}`);
  }

  await q(
    `INSERT INTO mentah_kolom
       (kolom, label, jenis, agregat, kelompok, urutan, field_api, keterangan,
        bawaan, aktif, sumber)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,true,$9)`,
    [kolom, label, jenis,
     b.agregat === true, b.kelompok ? String(b.kelompok).trim() : null,
     Number.isFinite(Number(b.urutan)) ? Number(b.urutan) : 900,
     b.field_api ? String(b.field_api).trim() : null,
     b.keterangan ? String(b.keterangan).trim() : null,
     sumber]);

  await auditLog(admin.sub, "kolom_api.tambah", kolom, { jenis, sumber });
  return Response.json({ ok: true, kolom });
});

/** Ubah keterangan kolom. Kolom inti hanya boleh diubah sebagian. */
export const PUT = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();
  const kolom = String(b.kolom ?? "");

  const [k] = await q<any>(
    `SELECT kolom, bawaan, jenis, COALESCE(sumber,'api') AS sumber
       FROM mentah_kolom WHERE kolom = $1`, [kolom]);
  if (!k) throw new HttpError(404, "Kolom tidak ditemukan.");
  if (!TABEL[k.sumber]) throw new HttpError(400, "Sumber data tidak dikenal.");

  const label = String(b.label ?? "").trim();
  if (label.length < 2) throw new HttpError(400, "Label kolom belum diisi.");

  // Jenis kolom inti dikunci: mengubahnya berarti mengubah tipe kolom
  // fisik yang sudah berisi puluhan ribu baris, dan itu bukan sesuatu
  // yang boleh terjadi karena satu klik di layar.
  const jenis = k.bawaan ? k.jenis : String(b.jenis ?? k.jenis);
  if (!JENIS.includes(jenis)) throw new HttpError(400, "Jenis kolom tidak dikenal.");
  if (!k.bawaan && jenis !== k.jenis) {
    const dipakai = await pemakai(kolom);
    if (dipakai.length) {
      throw new HttpError(400,
        `Jenis kolom tidak bisa diubah karena sudah dipakai indikator: ${dipakai.join(", ")}.`);
    }
    for (const t of TABEL[k.sumber]) {
      await q(`ALTER TABLE ${t} ALTER COLUMN "${kolom}" TYPE ${TIPE_SQL[jenis]} USING NULL`);
    }
  }

  await q(
    `UPDATE mentah_kolom
        SET label=$2, jenis=$3, agregat=$4, kelompok=$5, urutan=$6,
            field_api=$7, keterangan=$8, aktif=$9
      WHERE kolom=$1`,
    [kolom, label, jenis, b.agregat === true,
     b.kelompok ? String(b.kelompok).trim() : null,
     Number.isFinite(Number(b.urutan)) ? Number(b.urutan) : 0,
     k.bawaan ? (b.field_api ? String(b.field_api).trim() : null)
              : (b.field_api ? String(b.field_api).trim() : null),
     b.keterangan ? String(b.keterangan).trim() : null,
     b.aktif !== false]);

  await auditLog(admin.sub, "kolom_api.ubah", kolom);
  return Response.json({ ok: true });
});

/**
 * Hapus kolom kustom beserta kolom fisiknya.
 *
 * Dua penjagaan: kolom inti tidak pernah bisa dihapus, dan kolom yang
 * dipakai indikator ditolak dengan menyebut indikator mana — supaya admin
 * tahu apa yang harus diperbaiki dulu, bukan sekadar ditolak.
 */
export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const kolom = new URL(req.url).searchParams.get("kolom") ?? "";

  const [k] = await q<any>(
    `SELECT kolom, label, bawaan, COALESCE(sumber,'api') AS sumber
       FROM mentah_kolom WHERE kolom = $1`, [kolom]);
  if (!k) throw new HttpError(404, "Kolom tidak ditemukan.");
  if (k.bawaan) {
    throw new HttpError(400,
      `"${k.label}" adalah kolom inti dan tidak bisa dihapus. ` +
      `Bila tidak dipakai lagi, nonaktifkan saja supaya tidak muncul saat menyusun rumus.`);
  }

  const dipakai = await pemakai(kolom);
  if (dipakai.length) {
    throw new HttpError(400,
      `Kolom ini dipakai indikator: ${dipakai.join(", ")}. Lepaskan dulu dari indikator tersebut.`);
  }

  if (!POLA_KOLOM.test(kolom)) throw new HttpError(400, "Nama kolom tidak sah.");
  if (!TABEL[k.sumber]) throw new HttpError(400, "Sumber data tidak dikenal.");
  for (const t of TABEL[k.sumber]) {
    await q(`ALTER TABLE ${t} DROP COLUMN IF EXISTS "${kolom}"`);
  }
  await q(`DELETE FROM mentah_kolom WHERE kolom = $1`, [kolom]);

  await auditLog(admin.sub, "kolom_api.hapus", kolom);
  return Response.json({ ok: true });
});
