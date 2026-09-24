import { requireMenu, handler } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kolom bernilai bebas seperti nomor kontrak tidak ada gunanya didaftar. */
const BATAS_NILAI = 200;

/**
 * Nilai-nilai yang benar-benar pernah muncul pada sebuah kolom data mentah.
 *
 * Dipakai mengisi dropdown syarat di pembangun indikator. Tanpa ini admin
 * harus mengetik nilainya sendiri, dan mengetik "Btc" ketika datanya "BTC"
 * menghasilkan angka nol tanpa pesan galat apa pun — kesalahan yang paling
 * sulit ditemukan justru yang tidak menimbulkan keluhan dari sistem.
 *
 * Nama kolom dicocokkan dulu ke katalog `mentah_kolom`. Itu satu-satunya
 * hal yang mencegah nama kolom karangan ikut tertempel ke dalam SQL.
 */
export const GET = handler(async (req) => {
  await requireMenu("admin_indikator");

  const diminta = (new URL(req.url).searchParams.get("kolom") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!diminta.length) return Response.json({ nilai: {} });

  const sah = await q<{ kolom: string; jenis: string }>(
    `SELECT kolom, jenis FROM mentah_kolom WHERE kolom = ANY($1::text[])`,
    [diminta]);

  const nilai: Record<string, string[]> = {};

  for (const k of sah) {
    // Kolom angka dan tanggal tidak ditawarkan sebagai daftar pilihan:
    // nilainya nyaris selalu unik, jadi daftarnya panjang tanpa berguna.
    if (k.jenis !== "teks") { nilai[k.kolom] = []; continue; }

    const rows = await q<{ v: string }>(
      `SELECT DISTINCT ${k.kolom} AS v
         FROM data_mentah
        WHERE ${k.kolom} IS NOT NULL AND btrim(${k.kolom}::text) <> ''
        ORDER BY 1 LIMIT ${BATAS_NILAI + 1}`);

    // Kalau melebihi batas, kolomnya bernilai bebas (nomor kontrak, nama)
    // dan daftar pilihan justru menyesatkan — lebih baik dikosongkan
    // sehingga admin mengetik sendiri.
    nilai[k.kolom] = rows.length > BATAS_NILAI ? [] : rows.map((r) => r.v);
  }

  return Response.json({ nilai });
});
