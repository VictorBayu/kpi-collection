/**
 * Memindahkan akun dari sheet "login" lama ke tabel app_user.
 * Password lama di-hash, lalu user dipaksa menggantinya saat login pertama.
 *
 * Ekspor sheet login menjadi db/login.csv dengan kolom:
 *   nik,password,nama,level,cabang,area,status
 * Lalu jalankan: npm run db:seed
 */
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const PETA_PERAN: Record<string, string> = {
  admin: "admin", superadmin: "admin",
  manager: "atasan", spv: "atasan", supervisor: "atasan",
};

async function main() {
  const baris = readFileSync("db/login.csv", "utf8").trim().split("\n").slice(1);
  let masuk = 0, lewat = 0;

  for (const b of baris) {
    const [nik, password, nama, level, cabang, area, status] = b.split(",").map((s) => s.trim());
    if (!nik || !password) { lewat++; continue; }

    const hash = await bcrypt.hash(password, 12);
    const peran = PETA_PERAN[(level ?? "").toLowerCase()] ?? "karyawan";

    await sql`
      INSERT INTO app_user (nik, nama, password_hash, cabang, area, peran, aktif, must_change_password)
      VALUES (${nik}, ${nama ?? nik}, ${hash}, ${cabang || null}, ${area || null},
              ${peran}, ${(status ?? "active").toLowerCase() === "active"}, TRUE)
      ON CONFLICT (nik) DO UPDATE
        SET nama = EXCLUDED.nama, cabang = EXCLUDED.cabang,
            area = EXCLUDED.area, peran = EXCLUDED.peran, aktif = EXCLUDED.aktif`;
    masuk++;
  }
  console.log(`Selesai. ${masuk} akun tersimpan, ${lewat} baris dilewati.`);
}

main();
