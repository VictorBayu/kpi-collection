import { neon } from "@neondatabase/serverless";

/**
 * Koneksi HTTP ke Neon. Cocok untuk serverless: tanpa pool yang menggantung
 * antar invocation. Untuk beberapa perintah dalam satu transaksi gunakan
 * sql.transaction([...]).
 *
 * Koneksi dibuat SAAT DIPAKAI, bukan saat berkas ini diimpor.
 *
 * Alasannya: `next build` mengimpor setiap route handler untuk membaca
 * metadatanya. Kalau neon() dipanggil di tingkat modul, impor itu sendiri
 * sudah menuntut DATABASE_URL, sehingga build gagal di komputer yang tidak
 * memegang kredensial produksi — padahal tidak ada kueri yang benar-benar
 * dijalankan saat build.
 */
let koneksi: any = null;

function pakaiKoneksi() {
  if (!koneksi) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL belum diset. Isi di .env.local untuk pengembangan, " +
        "atau di Environment Variables project Vercel untuk produksi.",
      );
    }
    koneksi = neon(url);
  }
  return koneksi;
}

/**
 * Tampil seperti objek `sql` biasa — bisa dipanggil sebagai tagged template
 * (sql`SELECT ...`) maupun lewat metodenya (sql.transaction, sql.query) —
 * tetapi koneksinya baru dibuka pada pemakaian pertama.
 */
export const sql: any = new Proxy(function () {} as any, {
  apply(_target, _thisArg, args: any[]) {
    return (pakaiKoneksi() as any)(...args);
  },
  get(_target, prop: string) {
    const nyata = pakaiKoneksi();
    const nilai = nyata[prop];
    return typeof nilai === "function" ? nilai.bind(nyata) : nilai;
  },
});

/**
 * Kueri berparameter untuk perintah yang dibangun dinamis.
 * Driver Neon menyediakan sql.query(text, params) untuk gaya ini.
 * Sebagian versi menamainya berbeda, jadi kita panggil dengan aman.
 */
export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const fn: any = pakaiKoneksi();
  const rows = typeof fn.query === "function"
    ? await fn.query(text, params)   // @neondatabase/serverless >= 0.9
    : await fn(text, params);        // fallback untuk versi lain
  return (Array.isArray(rows) ? rows : rows?.rows ?? []) as T[];
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
