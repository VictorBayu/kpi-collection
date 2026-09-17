import { handler } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

/** Kapan data mentah terakhir ditarik dari API, untuk pil "Data diperbarui" di topbar. */
export const GET = handler(async () => {
  try {
    const [r] = await q<{ ditarik: string | null }>(
      `SELECT MAX(ditarik_pada) AS ditarik FROM data_mentah`);
    return Response.json({ ditarik: r?.ditarik ?? null });
  } catch {
    return Response.json({ ditarik: null });
  }
});
