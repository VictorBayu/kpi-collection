import { readSession, handler } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await readSession();
  if (!s) return Response.json({ n: 0 });
  try {
    const admin = s.peran === "admin";
    const [r] = await q<{ n: number }>(
      admin
        ? `SELECT COUNT(*)::int AS n FROM request
            WHERE status NOT IN ('selesai','ditolak')
              AND updated_at > COALESCE(dilihat_admin_at, 'epoch')`
        : `SELECT COUNT(*)::int AS n FROM request
            WHERE user_id = $1
              AND updated_at > COALESCE(dilihat_user_at, 'epoch')`,
      admin ? [] : [s.sub]);
    return Response.json({ n: r?.n ?? 0 });
  } catch {
    return Response.json({ n: 0 });
  }
});
