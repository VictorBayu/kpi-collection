import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { parseWorkbook } from "@/lib/import/parse";
import { FIELDS } from "@/lib/import/fields";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Langkah 1-2: baca berkas, deteksi sheet & kolom, simpan baris mentah
 * ke staging. Belum ada satu pun data karyawan yang berubah di sini.
 */
export const POST = handler(async (req) => {
  const s = await requireAdmin();
  const { blobUrl, namaFile, periode, tipe, sheetName } = await req.json();

  if (!blobUrl || !periode || !tipe) {
    throw new HttpError(400, "Lengkapi berkas, periode, dan jenis data terlebih dahulu.");
  }
  if (!FIELDS[tipe]) throw new HttpError(400, `Jenis data "${tipe}" belum didukung.`);

  const hasil = await parseWorkbook(blobUrl, tipe, sheetName);

  // Berkas yang sama persis tidak boleh masuk dua kali
  const kembar = await q<{ id: string; diunggah_pada: string; nama_file: string }>(
    `SELECT b.id, b.diunggah_pada, b.nama_file FROM import_batch b
      WHERE b.file_sha256 = $1 AND b.status <> 'failed' LIMIT 1`, [hasil.sha256]);
  if (kembar[0]) {
    throw new HttpError(409,
      `Berkas ini sudah pernah diunggah sebagai "${kembar[0].nama_file}" pada ` +
      `${new Date(kembar[0].diunggah_pada).toLocaleString("id-ID")}. ` +
      `Kalau ini revisi, simpan ulang dengan perubahan Anda lalu unggah lagi.`);
  }

  const maks = Number(process.env.IMPORT_MAX_ROWS ?? 30000);
  if (hasil.rows.length > maks) {
    throw new HttpError(413,
      `Berkas berisi ${hasil.rows.length.toLocaleString("id-ID")} baris, melebihi batas ${maks.toLocaleString("id-ID")}. ` +
      `Pecah per area atau per produk, lalu unggah bergantian.`);
  }

  // Buat batch draf
  const [batch] = await q<{ id: string }>(
    `INSERT INTO import_batch
       (periode, tipe, status, nama_file, blob_url, file_sha256,
        total_baris, sheet_name, mapping, diunggah_oleh)
     VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [periode, tipe, namaFile ?? "tanpa-nama.xlsx", blobUrl, hasil.sha256,
     hasil.rows.length, hasil.sheetName, JSON.stringify(hasil.mapping), s.sub]);

  // Simpan baris mentah, 500 baris per perintah
  for (let i = 0; i < hasil.rows.length; i += 500) {
    const potongan = hasil.rows.slice(i, i + 500).map((r) => ({
      n: Number(r.__row), d: r,
    }));
    await q(
      `INSERT INTO import_staging_row (batch_id, row_no, data)
       SELECT $1, (r->>'n')::int, r->'d'
         FROM jsonb_array_elements($2::jsonb) r
       ON CONFLICT (batch_id, row_no) DO NOTHING`,
      [batch.id, JSON.stringify(potongan)]);
  }

  // Pemetaan yang tersimpan dari bulan lalu, kalau ada
  const [preset] = await q<{ mapping: Record<string, string> }>(
    `SELECT mapping FROM import_preset WHERE tipe = $1`, [tipe]);

  await auditLog(s.sub, "parse_batch", batch.id, { namaFile, baris: hasil.rows.length });

  return Response.json({
    batchId: batch.id,
    sheets: hasil.sheets,
    sheetName: hasil.sheetName,
    headers: hasil.headers,
    headerRow: hasil.headerRow,
    totalRows: hasil.rows.length,
    sample: hasil.sample,
    mapping: { ...hasil.mapping, ...(preset?.mapping ?? {}) },
    fields: FIELDS[tipe],
  });
});
