import { requireMenu, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { periodeSah, duplikasiPeriode } from "@/lib/periode-indikator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Indikator yang punya pendaftaran di satu periode, untuk dipilih sebelum disalin. */
export const GET = handler(async (req) => {
  await requireMenu("admin_indikator");
  const dari = periodeSah(new URL(req.url).searchParams.get("dari"));
  if (!dari) throw new HttpError(400, "Periode asal tidak sah.");
  const daftar = await q<any>(
    `SELECT d.id, d.nama, d.aktif, COUNT(t.id)::int AS pendaftaran
       FROM indikator_target t JOIN indikator_def d ON d.id = t.indikator_id
      WHERE t.periode = $1::date GROUP BY d.id, d.nama, d.aktif ORDER BY d.nama`, [dari]);
  return Response.json({ daftar });
});

/** Menyalin pendaftaran indikator (semua, atau hanya yang dipilih) ke bulan lain. */
export const POST = handler(async (req) => {
  const admin = await requireMenu("admin_indikator");
  const b = await req.json();
  const dari = periodeSah(b.dari);
  const ke = periodeSah(b.ke);
  if (!dari || !ke) throw new HttpError(400, "Periode asal dan tujuan harus berupa bulan yang sah.");
  const ids: string[] | null = Array.isArray(b.indikatorIds)
    ? b.indikatorIds.map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x))
    : null;
  try {
    const hasil = await duplikasiPeriode(dari, ke, !!b.timpa, ids);
    await auditLog(admin.sub, "indikator.duplikasi_periode", `${dari} -> ${ke}`,
      { disalin: hasil.disalin, indikator: ids?.length ?? "semua" });
    return Response.json({ ok: true, ...hasil });
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Gagal menduplikasi.");
  }
});
