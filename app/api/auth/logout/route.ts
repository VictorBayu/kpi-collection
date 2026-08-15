import { cookies } from "next/headers";
import { handler, COOKIE } from "@/lib/auth";

// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
});
