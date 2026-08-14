import { cookies } from "next/headers";
import { verifyLogin, signSession, handler, HttpError, COOKIE } from "@/lib/auth";
import { auditLog } from "@/lib/db";

export const runtime = "nodejs";

export const POST = handler(async (req) => {
  const { nik, password } = await req.json();
  if (!nik || !password) throw new HttpError(400, "Isi NIK dan password.");

  const u = await verifyLogin(nik, password);
  // Pesan sengaja sama untuk NIK salah maupun password salah,
  // supaya tidak bisa dipakai menebak NIK mana yang terdaftar.
  if (!u) throw new HttpError(401, "NIK atau password tidak cocok. Periksa kembali.");

  const token = await signSession({ sub: u.id, nik: u.nik, nama: u.nama, peran: u.peran });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 8 * 60 * 60,
  });

  await auditLog(u.id, "login");

  return Response.json({
    ok: true,
    tujuan: u.must_change_password ? "/ganti-password"
      : u.peran === "admin" ? "/admin/import" : "/dashboard",
  });
});
