import { requireMenu, handler } from "@/lib/auth";
import { periodeSah } from "@/lib/periode-indikator";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import { buatTemplate } from "@/lib/grading-cabang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Template Grading & Tier Cabang; formatnya dibangun dari daftar KOLOM. */
export const GET = handler(async (req) => {
  await requireMenu("admin_kelas_cabang");
  const periode = periodeSah(new URL(req.url).searchParams.get("periode")) ?? periodeBerjalan();
  const buf = await buatTemplate(periode);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-grading-cabang-${periode.slice(0, 7)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
