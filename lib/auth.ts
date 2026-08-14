import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { q } from "./db";

export { COOKIE } from "./session-const";
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export type Session = {
  sub: string;      // app_user.id
  nik: string;
  nama: string;
  peran: "karyawan" | "atasan" | "admin";
};

export async function signSession(s: Session) {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

export async function readSession(token?: string): Promise<Session | null> {
  const t = token ?? (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

/** Dipakai di setiap route handler. Middleware hanya lapisan kenyamanan. */
export async function requireAdmin(): Promise<Session> {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");
  if (s.peran !== "admin") throw new HttpError(403, "Halaman ini hanya untuk admin data.");
  return s;
}

export async function verifyLogin(nik: string, password: string) {
  const rows = await q<{
    id: string; nik: string; nama: string; peran: Session["peran"];
    password_hash: string; aktif: boolean; must_change_password: boolean;
  }>(`SELECT id, nik, nama, peran, password_hash, aktif, must_change_password
        FROM app_user WHERE nik = $1`, [nik.trim()]);

  const u = rows[0];
  if (!u || !u.aktif) return null;
  if (!(await bcrypt.compare(password, u.password_hash))) return null;

  await q(`UPDATE app_user SET last_login_at = now() WHERE id = $1`, [u.id]);
  return u;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Bungkus route handler agar pesan error selalu ramah, bukan stack trace. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return Response.json(
        { error: e instanceof HttpError ? e.message : "Terjadi gangguan di server. Coba lagi sebentar." },
        { status },
      );
    }
  };
}
