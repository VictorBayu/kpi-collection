import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { q } from "./db";

import { COOKIE } from "./session-const";
export { COOKIE };
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export type Session = {
  sub: string;      // app_user.id
  nik: string;
  nama: string;
  /**
   * Kode peran. Sejak peran bisa dikelola admin (schema-peran-v12), ini
   * tidak lagi terbatas pada tiga nilai tetap — nilainya merujuk
   * peran.kode di database.
   */
  peran: string;
  /**
   * Kode menu yang boleh dibuka, disalin ke token saat login. Ditaruh di
   * token supaya navigasi dan middleware tidak perlu memanggil database
   * pada tiap permintaan. Konsekuensinya: perubahan hak akses berlaku
   * setelah pengguna login ulang (paling lama 8 jam, sesuai masa token).
   */
  menu?: string[];
};

/** Kode menu yang boleh dibuka satu peran, dibaca dari database. */
export async function menuPeran(peran: string): Promise<string[]> {
  const rows = await q<{ menu_kode: string }>(
    `SELECT menu_kode FROM peran_menu WHERE peran_kode = $1`, [peran]);
  return rows.map((r) => r.menu_kode);
}

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

/**
 * Menjaga halaman/endpoint berdasarkan kode menu, bukan nama peran.
 *
 * Dipakai untuk halaman yang kini boleh dibuka lebih dari satu peran
 * (mis. Dashboard analitik oleh manager dan manajemen HO). Peran 'admin'
 * selalu lolos supaya salah konfigurasi tidak pernah mengunci admin
 * keluar dari layar pengaturannya sendiri.
 */
export async function requireMenu(kode: string): Promise<Session> {
  const s = await readSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Masuk kembali untuk melanjutkan.");
  if (s.peran === "admin") return s;
  const { menuSesi } = await import("./menu");
  if (!menuSesi(s.peran, s.menu).includes(kode)) {
    throw new HttpError(403, "Anda tidak punya akses ke halaman ini.");
  }
  return s;
}

export async function verifyLogin(nik: string, password: string) {
  const rows = await q<{
    id: string; nik: string; nama: string; peran: Session["peran"];
    password_hash: string; aktif: boolean; must_change_password: boolean;
    suspended_at: string | null;
  }>(`SELECT id, nik, nama, peran, password_hash, aktif, must_change_password, suspended_at
        FROM app_user WHERE nik = $1`, [nik.trim()]);

  const u = rows[0];
  if (!u) return null;
  // Password salah -> gagal biasa (pesan generik di route)
  if (!(await bcrypt.compare(password, u.password_hash))) return null;
  // Akun nonaktif / disuspend -> tandai khusus agar route bisa memberi pesan tepat
  if (!u.aktif || u.suspended_at) return { suspended: true } as const;

  // Hitung login + catat ke access_log
  await q(
    `UPDATE app_user
        SET last_login_at = now(), last_access_at = now(),
            login_count = login_count + 1, access_count = access_count + 1
      WHERE id = $1`, [u.id]);
  await q(`INSERT INTO access_log (user_id, path, jenis) VALUES ($1, '/login', 'login')`, [u.id]);

  return u;
}

/**
 * Mencatat satu kunjungan halaman (akses web). Dipanggil dari AppShell,
 * sehingga setiap kali user membuka halaman ber-AppShell terhitung.
 * Ringan: dua perintah kecil, tidak memblokir tampilan.
 */
export async function catatAkses(userId: string, path: string) {
  try {
    await q(
      `UPDATE app_user SET last_access_at = now(), access_count = access_count + 1 WHERE id = $1`,
      [userId]);
    await q(`INSERT INTO access_log (user_id, path, jenis) VALUES ($1, $2, 'akses')`, [userId, path]);
  } catch {
    // pencatatan akses tidak boleh menggagalkan halaman
  }
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
