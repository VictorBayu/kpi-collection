import bcrypt from "bcryptjs";
import { readSession, hashPassword, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");

  const { lama, baru } = await req.json();
  if (!baru || baru.length < 8) throw new HttpError(400, "Password baru minimal 8 karakter.");
  if (baru === lama) throw new HttpError(400, "Password baru harus berbeda dari yang lama.");
  if (!/[a-zA-Z]/.test(baru) || !/[0-9]/.test(baru)) {
    throw new HttpError(400, "Gabungkan huruf dan angka agar lebih sulit ditebak.");
  }

  const [u] = await q<{ password_hash: string }>(
    `SELECT password_hash FROM app_user WHERE id = $1`, [s.sub]);
  if (!u || !(await bcrypt.compare(lama, u.password_hash))) {
    throw new HttpError(400, "Password saat ini tidak cocok.");
  }

  await q(`UPDATE app_user SET password_hash = $2, must_change_password = FALSE WHERE id = $1`,
    [s.sub, await hashPassword(baru)]);
  await auditLog(s.sub, "ganti_password");

  return Response.json({ ok: true });
});
