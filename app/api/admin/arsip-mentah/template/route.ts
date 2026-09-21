import { requireAdmin, handler } from "@/lib/auth";
import { buatTemplateXlsx } from "@/lib/arsip-mentah";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mengunduh template .xlsx sesuai katalog kolom data mentah saat ini. */
export const GET = handler(async () => {
  await requireAdmin();
  const buf = await buatTemplateXlsx();

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-arsip-data-mentah.xlsx"',
    },
  });
});
