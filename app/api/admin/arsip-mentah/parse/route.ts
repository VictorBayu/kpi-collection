import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { toISODate } from "@/lib/format";
import {
  headerTemplate, bacaWorkbookArsip, uraiBaris, simpanBarisArsip, type BarisArsip,
} from "@/lib/arsip-mentah";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Membaca berkas arsip yang baru diunggah, membuat batch draf, dan
 * menyimpan seluruh barisnya.
 *
 * Beda dengan wizard impor KPI/Insentif (app/admin/import): di sana admin
 * mencocokkan kolom sendiri karena header berkasnya bisa apa saja. Di
 * sini template-nya KITA yang buat (lihat /api/admin/arsip-mentah/template),
 * jadi headernya sudah pasti persis nama kolom sistem — tidak perlu
 * langkah pencocokan kolom terpisah.
 */
export const POST = handler(async (req) => {
  const s = await requireAdmin();
  const { blobUrl, namaFile, periode } = await req.json();

  if (!blobUrl || !periode) {
    throw new HttpError(400, "Lengkapi berkas dan periode terlebih dahulu.");
  }

  const { katalog } = await headerTemplate();
  const { sha256, headers, rows } = await bacaWorkbookArsip(blobUrl);

  if (!headers.includes("agreement_no")) {
    throw new HttpError(400,
      'Berkas ini tidak berisi kolom "agreement_no". Unduh template terbaru dan isi dari situ, ' +
      "jangan menyusun sheet sendiri.");
  }
  if (!rows.length) {
    throw new HttpError(400, "Berkas ini tidak berisi baris data.");
  }

  const maks = Number(process.env.ARSIP_MENTAH_MAX_ROWS ?? 150000);
  if (rows.length > maks) {
    throw new HttpError(413,
      `Berkas berisi ${rows.length.toLocaleString("id-ID")} baris, melebihi batas ${maks.toLocaleString("id-ID")}.`);
  }

  const periodeIso = toISODate(String(periode));

  // Berkas identik (hash sama) yang masih draf/gagal untuk periode ini
  // dibuang, unggahan dilanjutkan — pola sama seperti wizard impor lain.
  const kembar = await q<{ id: string; status: string }>(
    `SELECT id, status FROM arsip_mentah_batch
      WHERE file_sha256 = $1 AND periode = $2 AND status IN ('draft','validated','failed')`,
    [sha256, periodeIso]);
  for (const k of kembar) {
    await q(`DELETE FROM arsip_mentah_batch WHERE id = $1`, [k.id]);
  }

  let valid = 0;
  let ditolak = 0;
  const contohTolak: string[] = [];
  const siapSimpan: BarisArsip[] = [];

  for (const row of rows) {
    const hasil = uraiBaris(row, katalog);
    if (hasil.ok) {
      siapSimpan.push(hasil.baris);
      valid++;
    } else {
      ditolak++;
      if (contohTolak.length < 10) contohTolak.push(hasil.pesan);
    }
  }

  if (!valid) {
    throw new HttpError(400,
      "Tidak ada satu pun baris yang valid (semua baris tidak punya Agreement No).");
  }

  const [batch] = await q<{ id: string }>(
    `INSERT INTO arsip_mentah_batch
       (periode, status, nama_file, blob_url, file_sha256,
        total_baris, baris_valid, baris_ditolak, diunggah_oleh)
     VALUES ($1,'validated',$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [periodeIso, namaFile ?? "tanpa-nama.xlsx", blobUrl, sha256,
     rows.length, valid, ditolak, s.sub]);

  await simpanBarisArsip(batch.id, periodeIso, siapSimpan);

  await auditLog(s.sub, "arsip_mentah.unggah", batch.id,
    { periode: periodeIso, namaFile, totalBaris: rows.length, valid, ditolak });

  return Response.json({
    batchId: batch.id,
    periode: periodeIso,
    totalBaris: rows.length,
    barisValid: valid,
    barisDitolak: ditolak,
    contohTolak,
  });
});
