import * as XLSX from "xlsx";
import { requireAdmin, handler, HttpError, hashPassword } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;
// Selalu dijalankan saat ada permintaan, tidak pernah dibekukan saat build.
export const dynamic = "force-dynamic";

const PERAN_SAH = ["karyawan", "atasan", "admin"];
const BATAS_BARIS = 2000;

const teks = (v: unknown) => String(v ?? "").trim();
const wilayah = (v: unknown) =>
  teks(v).replace(/\s+/g, " ").toUpperCase() || null;

type Baris = {
  baris: number;
  nik: string; nama: string;
  jabatan: string | null; cabang: string | null; area: string | null;
  peran: string; password: string; aktif: boolean;
  adaSebelumnya: boolean;
  masalah: string[];
  peringatan: string[];
};

/**
 * Membaca berkas dan memeriksa tiap baris.
 *
 * Pemeriksaan dan penyimpanan sengaja dipisah menjadi dua langkah: admin
 * melihat dulu apa yang akan terjadi — berapa akun baru, berapa yang
 * diperbarui, baris mana yang bermasalah — baru memutuskan menyimpan.
 * Mengimpor ratusan akun tanpa pratinjau terlalu berisiko untuk dibatalkan.
 */
async function baca(file: File): Promise<Baris[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets["PENGGUNA"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new HttpError(400, "Berkas tidak punya lembar data yang bisa dibaca.");

  const mentah = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!mentah.length) throw new HttpError(400, "Lembar data kosong.");
  if (mentah.length > BATAS_BARIS) {
    throw new HttpError(400,
      `Berkas berisi ${mentah.length} baris, melebihi batas ${BATAS_BARIS} per unggahan. ` +
      `Pecah menjadi beberapa berkas.`);
  }

  // Ambil sekaligus: NIK yang sudah ada, dan jabatan yang dikenal master.
  const [sudahAda, jabatanDikenal] = await Promise.all([
    q<{ nik: string }>(`SELECT nik FROM app_user`),
    q<{ nama: string }>(
      `SELECT jabatan AS nama FROM jabatan_level
       UNION SELECT alias FROM jabatan_alias`),
  ]);
  const setNik = new Set(sudahAda.map((x) => x.nik));
  const setJab = new Set(jabatanDikenal.map((x) => x.nama.toUpperCase()));

  // NIK ganda di dalam berkas itu sendiri
  const hitungNik = new Map<string, number>();
  for (const r of mentah) {
    const n = teks(r.NIK ?? r.nik).replace(/\D/g, "");
    if (n) hitungNik.set(n, (hitungNik.get(n) ?? 0) + 1);
  }

  return mentah.map((r, i): Baris => {
    const masalah: string[] = [];
    const peringatan: string[] = [];

    const nik = teks(r.NIK ?? r.nik).replace(/\D/g, "");
    const nama = teks(r.NAMA ?? r.nama);
    const jabatan = teks(r.JABATAN ?? r.jabatan).replace(/\s+/g, " ").toUpperCase() || null;
    const cabang = wilayah(r.CABANG ?? r.cabang);
    const area = wilayah(r.AREA ?? r.area);
    const peranAsli = teks(r.PERAN ?? r.peran).toLowerCase();
    const peran = peranAsli || "karyawan";
    const password = teks(r.PASSWORD ?? r.password);
    const aktifTeks = teks(r.AKTIF ?? r.aktif).toLowerCase();
    const aktif = !["tidak", "no", "n", "0", "nonaktif", "false"].includes(aktifTeks);

    if (!/^\d{4,16}$/.test(nik)) masalah.push("NIK harus angka 4–16 digit");
    else if ((hitungNik.get(nik) ?? 0) > 1) masalah.push("NIK ini muncul lebih dari sekali di berkas");
    if (nama.length < 2) masalah.push("Nama belum diisi");
    if (!PERAN_SAH.includes(peran)) masalah.push(`Peran "${peranAsli}" tidak dikenal`);
    if (password && password.length < 8) masalah.push("Password kurang dari 8 karakter");

    if (jabatan && !setJab.has(jabatan)) {
      peringatan.push(`Jabatan "${jabatan}" belum ada di Master Hierarki — KPI-nya belum terlihat atasan`);
    }
    if (!cabang && !area) peringatan.push("Cabang dan area kosong — tidak akan muncul di Tim Saya siapa pun");
    if (!password) peringatan.push("Password dibuat otomatis, wajib diganti saat login pertama");

    return {
      baris: i + 2,   // +2: baris 1 judul kolom, indeks mulai dari 0
      nik, nama, jabatan, cabang, area, peran, password, aktif,
      adaSebelumnya: setNik.has(nik),
      masalah, peringatan,
    };
  });
}

/** Langkah 1 — periksa berkas dan kembalikan pratinjau. */
export const POST = handler(async (req) => {
  await requireAdmin();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Berkas belum dipilih.");

  const baris = await baca(file);
  return Response.json({
    baris,
    ringkas: {
      total: baris.length,
      baru: baris.filter((b) => !b.adaSebelumnya && !b.masalah.length).length,
      diperbarui: baris.filter((b) => b.adaSebelumnya && !b.masalah.length).length,
      bermasalah: baris.filter((b) => b.masalah.length).length,
      berperingatan: baris.filter((b) => !b.masalah.length && b.peringatan.length).length,
    },
  });
});

/** Langkah 2 — simpan baris yang lolos pemeriksaan. */
export const PUT = handler(async (req) => {
  const admin = await requireAdmin();
  const form = await req.formData();
  const file = form.get("file");
  const timpa = form.get("timpa") === "1";
  if (!(file instanceof File)) throw new HttpError(400, "Berkas belum dipilih.");

  const baris = (await baca(file)).filter((b) => !b.masalah.length);
  if (!baris.length) throw new HttpError(400, "Tidak ada baris yang lolos pemeriksaan.");

  let baru = 0, diperbarui = 0, dilewati = 0;

  for (const b of baris) {
    if (b.adaSebelumnya && !timpa) { dilewati++; continue; }

    // Password kosong: dibuatkan acak dan ditandai wajib ganti, supaya
    // tidak ada akun yang lahir dengan kata sandi yang bisa ditebak.
    const pw = b.password || `Smart@${Math.floor(Math.random() * 900000 + 100000)}`;
    const wajibGanti = !b.password;

    if (b.adaSebelumnya) {
      await q(
        `UPDATE app_user
            SET nama = $2, jabatan = $3, cabang = $4, area = $5,
                peran = $6, aktif = $7
          WHERE nik = $1`,
        [b.nik, b.nama, b.jabatan, b.cabang, b.area, b.peran, b.aktif]);
      // Password hanya diganti kalau memang diisi di berkas.
      if (b.password) {
        await q(`UPDATE app_user SET password_hash = $2 WHERE nik = $1`,
          [b.nik, await hashPassword(b.password)]);
      }
      diperbarui++;
    } else {
      await q(
        `INSERT INTO app_user (nik, nama, password_hash, jabatan, cabang, area,
                               peran, aktif, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [b.nik, b.nama, await hashPassword(pw), b.jabatan, b.cabang, b.area,
         b.peran, b.aktif, wajibGanti]);
      baru++;
    }
  }

  await auditLog(admin.sub, "impor_pengguna", (file as File).name, {
    baru, diperbarui, dilewati, timpa,
  });

  return Response.json({ ok: true, baru, diperbarui, dilewati });
});
