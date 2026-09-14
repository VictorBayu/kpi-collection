import { cookies } from "next/headers";
import { verifyLogin, signSession, handler, HttpError, COOKIE, menuPeran } from "@/lib/auth";
import { menuSesi, berandaUntuk } from "@/lib/menu";
import { auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const { nik, password } = await req.json();
  if (!nik || !password) throw new HttpError(400, "Isi NIK dan password.");

  const u = await verifyLogin(nik, password);
  // Pesan sengaja sama untuk NIK salah maupun password salah,
  // supaya tidak bisa dipakai menebak NIK mana yang terdaftar.
  if (!u) throw new HttpError(401, "NIK atau password tidak cocok. Periksa kembali.");
  if ("suspended" in u) {
    throw new HttpError(403, "Akun Anda sedang dinonaktifkan. Hubungi admin data untuk mengaktifkannya kembali.");
  }

  // Hak menu disalin ke token saat login supaya navigasi dan middleware
  // tidak perlu memanggil database tiap permintaan.
  const menu = menuSesi(u.peran, await menuPeran(u.peran));

  const token = await signSession({
    sub: u.id, nik: u.nik, nama: u.nama, peran: u.peran, menu,
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 8 * 60 * 60,
  });

  await auditLog(u.id, "login");

  return Response.json({
    ok: true,
    tujuan: u.must_change_password ? "/ganti-password" : berandaUntuk(menu),
  });
});
