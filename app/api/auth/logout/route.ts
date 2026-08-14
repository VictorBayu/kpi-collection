import { cookies } from "next/headers";
import { handler, COOKIE } from "@/lib/auth";

export const POST = handler(async () => {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
});
