import { requireMenu, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { periodeSah } from "@/lib/periode-indikator";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import { bacaFile, simpanPeriode, salinPeriode } from "@/lib/target-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ISO = (v: unknown) => {
  if (v instanceof Date) {
    const j = new Date(v.getTime() + 7 * 3600 * 1000);
    return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  return String(v ?? "").slice(0, 10);
};

/** Bulan sebelumnya dari YYYY-MM-01. */
function bulanLalu(p: string) {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const KOLOM_ANGKA = `id, kelompok_produk, tipe_lokasi, cabang_atau_area, bucket, satuan,
  tier_aktif, t1::float8 AS t1, t2::float8 AS t2, t3::float8 AS t3, t4::float8 AS t4, t5::float8 AS t5`;

/** Isi satu periode + periode sebelumnya (untuk menyorot perubahan). */
export const GET = handler(async (req) => {
  await requireMenu("admin_target_tier");
  const sp = new URL(req.url).searchParams;
  const periodeAda = (await q<any>(
    `SELECT periode, COUNT(*)::int AS n FROM target_tier GROUP BY periode ORDER BY periode DESC`))
    .map((r) => ({ periode: ISO(r.periode), n: r.n }));
  const bawaan = periodeAda.some((x) => x.periode === periodeBerjalan())
    ? periodeBerjalan() : (periodeAda[0]?.periode ?? periodeBerjalan());
  const periode = periodeSah(sp.get("periode")) ?? bawaan;

  const [baris, lalu] = await Promise.all([
    q<any>(`SELECT ${KOLOM_ANGKA} FROM target_tier WHERE periode = $1::date
             ORDER BY kelompok_produk, tipe_lokasi DESC, cabang_atau_area, bucket`, [periode]),
    q<any>(`SELECT ${KOLOM_ANGKA} FROM target_tier WHERE periode = $1::date`, [bulanLalu(periode)]),
  ]);
  return Response.json({ periode, periodeBerjalan: periodeBerjalan(), periodeAda, baris, lalu });
});

/** Unggah: mode "pratinjau" hanya membaca & memvalidasi; "simpan" mengganti isi periode. */
export const POST = handler(async (req) => {
  const s = await requireMenu("admin_target_tier");
  const fd = await req.formData();
  const file = fd.get("file");
  const periode = periodeSah(fd.get("periode"));
  const mode = String(fd.get("mode") ?? "pratinjau");
  if (!(file instanceof File)) throw new HttpError(400, "Berkas belum dipilih.");
  if (!periode) throw new HttpError(400, "Periode belum dipilih.");

  let hasil;
  try { hasil = await bacaFile(await file.arrayBuffer(), periode); }
  catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Berkas tidak terbaca."); }

  if (mode === "simpan") {
    if (hasil.galat.length) throw new HttpError(400, `Masih ada ${hasil.galat.length} galat. Perbaiki berkas lalu unggah lagi.`);
    if (!hasil.baris.length) throw new HttpError(400, "Tidak ada baris target yang terbaca.");
    await simpanPeriode(periode, hasil.baris, s.nik);
    await auditLog(s.sub, "target_tier.unggah", periode,
      { baris: hasil.baris.length, berkas: file.name, peringatan: hasil.peringatan.length });
    return Response.json({ ok: true, disimpan: hasil.baris.length, ringkas: hasil.ringkas });
  }
  return Response.json({
    ok: true, ringkas: hasil.ringkas,
    galat: hasil.galat.slice(0, 200), jumlahGalat: hasil.galat.length,
    peringatan: hasil.peringatan.slice(0, 200), jumlahPeringatan: hasil.peringatan.length,
    contoh: hasil.baris.slice(0, 15),
  });
});

/** Ubah satu sel. */
export const PATCH = handler(async (req) => {
  const s = await requireMenu("admin_target_tier");
  const b = await req.json();
  const id = Number(b.id);
  const kolom = String(b.kolom ?? "");
  if (!Number.isInteger(id)) throw new HttpError(400, "Baris tidak dikenal.");
  if (!["tier_aktif", "t1", "t2", "t3", "t4", "t5"].includes(kolom)) throw new HttpError(400, "Kolom tidak boleh diubah.");
  const mentah = b.nilai === "" || b.nilai === null || b.nilai === undefined ? null
    : Number(String(b.nilai).replace(",", "."));
  if (mentah !== null && !Number.isFinite(mentah)) throw new HttpError(400, "Nilai harus angka atau kosong.");
  if (kolom === "tier_aktif" && mentah !== null && !(Number.isInteger(mentah) && mentah >= 1 && mentah <= 5)) {
    throw new HttpError(400, "Tier harus 1 sampai 5, atau kosong.");
  }
  const [lama] = await q<any>(`SELECT ${KOLOM_ANGKA}, periode FROM target_tier WHERE id = $1`, [id]);
  if (!lama) throw new HttpError(404, "Baris tidak ditemukan.");
  // kolom sudah divalidasi dari daftar tetap di atas.
  await q(`UPDATE target_tier SET ${kolom} = $2, diubah_pada = now() WHERE id = $1`, [id, mentah]);
  await auditLog(s.sub, "target_tier.ubah_sel", String(id), {
    periode: ISO(lama.periode), tempat: lama.cabang_atau_area, kelompok: lama.kelompok_produk,
    bucket: lama.bucket, kolom, sebelum: lama[kolom], sesudah: mentah,
  });
  return Response.json({ ok: true });
});

/** Salin seluruh target satu periode ke periode lain. */
export const PUT = handler(async (req) => {
  const s = await requireMenu("admin_target_tier");
  const b = await req.json();
  const dari = periodeSah(b.dari), ke = periodeSah(b.ke);
  if (!dari || !ke) throw new HttpError(400, "Periode asal dan tujuan harus bulan yang sah.");
  if (dari === ke) throw new HttpError(400, "Periode asal dan tujuan sama.");
  try {
    const hasil = await salinPeriode(dari, ke, !!b.timpa, s.nik);
    await auditLog(s.sub, "target_tier.salin", `${dari} -> ${ke}`, hasil);
    return Response.json({ ok: true, ...hasil });
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Gagal menyalin.");
  }
});

/** Hapus seluruh target satu periode. */
export const DELETE = handler(async (req) => {
  const s = await requireMenu("admin_target_tier");
  const periode = periodeSah(new URL(req.url).searchParams.get("periode"));
  if (!periode) throw new HttpError(400, "Periode tidak sah.");
  const r = await q<any>(`DELETE FROM target_tier WHERE periode = $1::date RETURNING id`, [periode]);
  await auditLog(s.sub, "target_tier.hapus_periode", periode, { baris: r.length });
  return Response.json({ ok: true, dihapus: r.length });
});
