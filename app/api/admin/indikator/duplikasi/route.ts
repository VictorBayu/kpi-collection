import { requireMenu, handler, HttpError } from "@/lib/auth";
import { auditLog } from "@/lib/db";
import { periodeSah, duplikasiPeriode } from "@/lib/periode-indikator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Menyalin seluruh pendaftaran indikator dari satu bulan ke bulan lain. */
export const POST = handler(async (req) => {
  const admin = await requireMenu("admin_indikator");
  const b = await req.json();
  const dari = periodeSah(b.dari);
  const ke = periodeSah(b.ke);
  if (!dari || !ke) throw new HttpError(400, "Periode asal dan tujuan harus berupa bulan yang sah.");
  try {
    const hasil = await duplikasiPeriode(dari, ke, !!b.timpa);
    await auditLog(admin.sub, "indikator.duplikasi_periode", `${dari} -> ${ke}`, hasil);
    return Response.json({ ok: true, ...hasil });
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Gagal menduplikasi.");
  }
});
