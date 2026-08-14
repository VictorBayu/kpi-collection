import { readSession, catatAkses, handler } from "@/lib/auth";

export const runtime = "nodejs";

export const POST = handler(async (req) => {
  const s = await readSession();
  if (!s) return Response.json({ ok: false }); // tak login: abaikan diam-diam
  let path = "/";
  try { path = (await req.json())?.path || "/"; } catch {}
  await catatAkses(s.sub, path);
  return Response.json({ ok: true });
});
