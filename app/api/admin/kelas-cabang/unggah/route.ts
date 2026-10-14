import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { auditLog } from "@/lib/db";
import { periodeSah } from "@/lib/periode-indikator";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import { bacaFile, simpanBaris } from "@/lib/grading-cabang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** mode "pratinjau" hanya membaca & memvalidasi; "simpan" menulis ke cabang_kelas. */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const fd = await req.formData();
  const file = fd.get("file");
  const mode = String(fd.get("mode") ?? "pratinjau");
  const periode = periodeSah(fd.get("periode")) ?? periodeBerjalan();
  if (!(file instanceof File)) throw new HttpError(400, "Berkas belum dipilih.");
  if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "Berkas terlalu besar (maks 5MB).");

  let hasil;
  try { hasil = await bacaFile(await file.arrayBuffer(), periode); }
  catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Berkas tidak terbaca."); }

  if (mode === "simpan") {
    if (hasil.galat.length) throw new HttpError(400, `Masih ada ${hasil.galat.length} galat. Perbaiki berkas lalu unggah lagi.`);
    if (!hasil.baris.length) throw new HttpError(400, "Tidak ada baris yang terbaca.");
    const n = await simpanBaris(hasil.baris);
    await auditLog(admin.sub, "tier-cabang.unggah", periode,
      { berkas: file.name, ...hasil.ringkas, disimpan: n });
    return Response.json({ ok: true, disimpan: n, ringkas: hasil.ringkas });
  }
  return Response.json({
    ok: true, ringkas: hasil.ringkas, galat: hasil.galat, jumlahGalat: hasil.galat.length,
    peringatan: hasil.peringatan, contoh: hasil.contoh,
    kolomDikenal: hasil.kolomDikenal, kolomAbaikan: hasil.kolomAbaikan,
  });
});
