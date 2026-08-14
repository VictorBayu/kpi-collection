import { neon } from "@neondatabase/serverless";

/**
 * Koneksi HTTP ke Neon. Cocok untuk serverless: tanpa pool yang menggantung
 * antar invocation. Untuk beberapa perintah dalam satu transaksi gunakan
 * sql.transaction([...]).
 */
export const sql = neon(process.env.DATABASE_URL!);

/** Kueri berparameter untuk perintah yang dibangun dinamis. */
export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  return (await sql.query(text, params)) as T[];
}

export async function auditLog(
  userId: string | null,
  aksi: string,
  objek?: string,
  detail?: unknown,
) {
  await q(
    `INSERT INTO audit_log (user_id, aksi, objek, detail) VALUES ($1,$2,$3,$4)`,
    [userId, aksi, objek ?? null, detail ? JSON.stringify(detail) : null],
  );
}
