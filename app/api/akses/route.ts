import { readSession, catatAkses, handler } from "@/lib/auth";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const s = await readSession();
  if (!s) return Response.json({ ok: false }); // tak login: abaikan diam-diam
  let path = "/";
  try { path = (await req.json())?.path || "/"; } catch {}
  await catatAkses(s.sub, path);
  return Response.json({ ok: true });
});

/**
 * Denyut ringan untuk memastikan server masih menjawab.
 *
 * Dipakai penanda loading saat perpindahan halaman terasa macet: yang
 * ditanyakan hanya "kamu masih di sana?", jadi sengaja tidak menyentuh
 * database sama sekali supaya jawabannya cepat dan tidak menambah beban
 * saat server memang sedang sibuk.
 */
export async function HEAD() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
