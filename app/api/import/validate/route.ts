import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { toISODate } from "@/lib/format";
import { q } from "@/lib/db";
import { validasiBaris, type Issue } from "@/lib/import/validate";
import { FIELDS } from "@/lib/import/fields";

export const runtime = "nodejs";
export const maxDuration = 60;

const UKURAN_POTONGAN = 1000;

/**
 * Langkah 3: periksa baris per potongan. Dipanggil berulang oleh browser
 * dengan offset yang dikembalikan, sambil menampilkan progres.
 */
export const POST = handler(async (req) => {
  const s = await requireAdmin();
  const { batchId, mapping, offset = 0, limit = UKURAN_POTONGAN } = await req.json();

  const [batch] = await q<any>(
    `SELECT id, tipe, periode, status FROM import_batch WHERE id = $1`, [batchId]);
  if (!batch) throw new HttpError(404, "Batch tidak ditemukan. Ulangi dari langkah unggah.");
  if (batch.status === "published") throw new HttpError(409, "Batch ini sudah terbit dan tidak bisa diperiksa ulang.");

  const defs = FIELDS[batch.tipe];
  const kurang = defs.filter((d) => d.required && !mapping?.[d.key]).map((d) => d.label);
  if (kurang.length) {
    throw new HttpError(400, `Kolom wajib belum dicocokkan: ${kurang.join(", ")}.`);
  }

  // Mulai dari nol: bersihkan hasil pemeriksaan sebelumnya
  if (offset === 0) {
    await q(`DELETE FROM import_issue WHERE batch_id = $1`, [batchId]);
    await q(`DELETE FROM kpi_row WHERE batch_id = $1`, [batchId]);
    await q(`DELETE FROM insentif_row WHERE batch_id = $1`, [batchId]);
    await q(`UPDATE import_batch
                SET baris_valid = 0, baris_warning = 0, baris_ditolak = 0,
                    mapping = $2, status = 'draft'
              WHERE id = $1`, [batchId, JSON.stringify(mapping)]);
  }

  // Daftar karyawan untuk pengecekan NIK
  const karyawan = await q<{ nik: string; nama: string }>(
    `SELECT nik, nama FROM app_user WHERE aktif`);
  const ctx = {
    tipe: batch.tipe as "kpi" | "insentif",
    mapping,
    nikDikenal: new Set(karyawan.map((k) => k.nik)),
    namaByNik: new Map(karyawan.map((k) => [k.nik, k.nama])),
    periode: toISODate(batch.periode),
  };

  const staging = await q<{ row_no: number; data: Record<string, any> }>(
    `SELECT row_no, data FROM import_staging_row
      WHERE batch_id = $1 AND row_no > $2
      ORDER BY row_no LIMIT $3`, [batchId, offset, limit]);

  let valid = 0, warning = 0, ditolak = 0;
  const issues: Issue[] = [];
  const rekamKpi: any[] = [], rekamIns: any[] = [];
  let rowTerakhir = offset;

  for (const st of staging) {
    const hasil = validasiBaris({ ...st.data, __row: st.row_no }, ctx);
    rowTerakhir = st.row_no;
    issues.push(...hasil.issues);

    if (!hasil.record) { ditolak++; continue; }
    if (hasil.issues.length) warning++;
    valid++;

    if (ctx.tipe === "kpi") rekamKpi.push(hasil.record);
    else rekamIns.push(hasil.record);
  }

  if (rekamKpi.length) {
    await q(
      `INSERT INTO kpi_row
         (batch_id, periode, nik, nama, jabatan, cabang, produk, indikator, bobot,
          saldo_awal, pencapaian, rasio, skor_kpi, skor_terbobot,
          target_kpi3, target_kpi4, target_kpi5, catatan)
       SELECT $1, (r->>'periode')::date, r->>'nik', r->>'nama', r->>'jabatan',
              r->>'cabang', r->>'produk', r->>'indikator', (r->>'bobot')::numeric,
              (r->>'saldo_awal')::numeric, (r->>'pencapaian')::numeric, (r->>'rasio')::numeric,
              (r->>'skor_kpi')::numeric, (r->>'skor_terbobot')::numeric,
              (r->>'target_kpi3')::numeric, (r->>'target_kpi4')::numeric,
              (r->>'target_kpi5')::numeric, r->>'catatan'
         FROM jsonb_array_elements($2::jsonb) r`,
      [batchId, JSON.stringify(rekamKpi)]);
  }
  if (rekamIns.length) {
    await q(
      `INSERT INTO insentif_row
         (batch_id, periode, nik, kategori, produk, saldo_awal, pencapaian, rasio, nominal, keterangan)
       SELECT $1, (r->>'periode')::date, r->>'nik', r->>'kategori', r->>'produk',
              (r->>'saldo_awal')::numeric, (r->>'pencapaian')::numeric, (r->>'rasio')::numeric,
              COALESCE((r->>'nominal')::numeric, 0), r->>'keterangan'
         FROM jsonb_array_elements($2::jsonb) r`,
      [batchId, JSON.stringify(rekamIns)]);
  }
  if (issues.length) {
    await q(
      `INSERT INTO import_issue (batch_id, baris, kolom, tingkat, pesan, nilai_asli)
       SELECT $1, (r->>'row')::int, r->>'kolom', r->>'tingkat', r->>'pesan', r->>'nilai'
         FROM jsonb_array_elements($2::jsonb) r`,
      [batchId, JSON.stringify(issues)]);
  }

  await q(
    `UPDATE import_batch
        SET baris_valid = baris_valid + $2,
            baris_warning = baris_warning + $3,
            baris_ditolak = baris_ditolak + $4
      WHERE id = $1`, [batchId, valid, warning, ditolak]);

  const selesai = staging.length < limit;
  if (selesai) {
    await q(`UPDATE import_batch SET status = 'validated' WHERE id = $1`, [batchId]);
    await q(
      `INSERT INTO import_preset (tipe, mapping, updated_by)
       VALUES ($1,$2,$3)
       ON CONFLICT (tipe) DO UPDATE SET mapping = $2, updated_by = $3, updated_at = now()`,
      [batch.tipe, JSON.stringify(mapping), s.sub]);
  }

  const [tally] = await q<any>(
    `SELECT total_baris, baris_valid, baris_warning, baris_ditolak
       FROM import_batch WHERE id = $1`, [batchId]);

  return Response.json({
    diproses: staging.length,
    nextOffset: rowTerakhir,
    selesai,
    tally,
  });
});