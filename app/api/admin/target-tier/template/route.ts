import { requireMenu, handler } from "@/lib/auth";
import { periodeSah } from "@/lib/periode-indikator";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import { buatTemplate } from "@/lib/target-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Template Excel satu periode, sudah terisi isi periode itu (bila ada) dan Tier Cabang. */
export const GET = handler(async (req) => {
  await requireMenu("admin_target_tier");
  const periode = periodeSah(new URL(req.url).searchParams.get("periode")) ?? periodeBerjalan();
  const buf = await buatTemplate(periode);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-target-tier-${periode.slice(0, 7)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
