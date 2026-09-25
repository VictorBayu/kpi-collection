/**
 * Definisi kolom & operator penyaring Pengguna & Akses, dipakai bersama
 * oleh GET /api/admin/pengguna (daftar di layar) dan
 * GET /api/admin/pengguna/export (unduhan Excel) -- supaya filter yang
 * berlaku di layar dan yang diunduh selalu persis sama, bukan dua salinan
 * yang bisa perlahan berbeda.
 *
 * Dipisah ke sini, bukan ditaruh di route.ts, karena route handler Next.js
 * tidak boleh mengekspor apa pun selain method HTTP dan konfigurasi rute
 * (lihat catatan KATEGORI di lib/request.ts untuk kejadian serupa
 * sebelumnya).
 */

/**
 * Kolom yang boleh disaring, beserta jenis nilainya.
 *
 * Daftar ini juga dikirim ke browser sebagai penentu operator apa yang
 * masuk akal untuk tiap kolom — jadi hanya ada satu sumber kebenaran, dan
 * penyaring di layar tidak pernah menawarkan sesuatu yang tidak didukung
 * server.
 */
export const KOLOM: Record<string, { label: string; jenis: "teks" | "angka" | "pilihan" | "tanggal"; sql: string; opsi?: string[] }> = {
  nama:      { label: "Nama",        jenis: "teks",    sql: "nama" },
  nik:       { label: "NIK",         jenis: "teks",    sql: "nik" },
  jabatan:   { label: "Jabatan",     jenis: "teks",    sql: "COALESCE(jabatan_master, jabatan)" },
  cabang:    { label: "Cabang",      jenis: "teks",    sql: "cabang" },
  area:      { label: "Area",        jenis: "teks",    sql: "area" },
  peran:     { label: "Peran",       jenis: "pilihan", sql: "peran", opsi: ["karyawan", "atasan", "admin"] },
  level:     { label: "Level",       jenis: "teks",    sql: "level" },
  akses_30h: { label: "Akses 30 hari", jenis: "angka", sql: "akses_30h" },
  akses_7h:  { label: "Akses 7 hari",  jenis: "angka", sql: "akses_7h" },
  login_count: { label: "Jumlah login", jenis: "angka", sql: "login_count" },
  status:    { label: "Status akun", jenis: "pilihan", sql: "status_akun",
               opsi: ["aktif", "nonaktif", "jarang"] },
  last_access_at: { label: "Terakhir akses", jenis: "tanggal", sql: "last_access_at" },
};

/** Operator per jenis kolom. */
export const OPERATOR: Record<string, { kode: string; label: string }[]> = {
  teks: [
    { kode: "mengandung", label: "mengandung" },
    { kode: "tidak_mengandung", label: "tidak mengandung" },
    { kode: "sama", label: "sama persis" },
    { kode: "mulai", label: "diawali" },
    { kode: "kosong", label: "kosong" },
    { kode: "terisi", label: "terisi" },
  ],
  angka: [
    { kode: "sama", label: "sama dengan" },
    { kode: "lebih", label: "lebih dari" },
    { kode: "lebih_sama", label: "minimal" },
    { kode: "kurang", label: "kurang dari" },
    { kode: "kurang_sama", label: "maksimal" },
    { kode: "antara", label: "antara" },
  ],
  pilihan: [
    { kode: "sama", label: "adalah" },
    { kode: "bukan", label: "bukan" },
  ],
  tanggal: [
    { kode: "sebelum", label: "sebelum" },
    { kode: "sesudah", label: "sesudah" },
    { kode: "kosong", label: "belum pernah" },
    { kode: "terisi", label: "pernah" },
  ],
};

export type Aturan = { kolom: string; operator: string; nilai?: string; nilai2?: string };

/**
 * Menyusun potongan WHERE dari aturan penyaring.
 *
 * Nilai TIDAK PERNAH disisipkan langsung ke teks kueri — hanya nama kolom
 * dan operator yang berasal dari daftar tetap di atas, sedangkan nilai dari
 * pengguna selalu lewat parameter. Dengan begitu isian apa pun di kotak
 * filter tidak bisa mengubah arti kueri.
 */
export function susunFilter(aturan: Aturan[], params: any[]) {
  const bagian: string[] = [];

  for (const a of aturan) {
    const def = KOLOM[a.kolom];
    if (!def) continue;
    const ops = OPERATOR[def.jenis].map((o) => o.kode);
    if (!ops.includes(a.operator)) continue;

    const kol = def.sql;
    const nilai = String(a.nilai ?? "").trim();

    switch (a.operator) {
      case "kosong":
        bagian.push(`(${kol} IS NULL OR ${kol}::text = '')`); break;
      case "terisi":
        bagian.push(`(${kol} IS NOT NULL AND ${kol}::text <> '')`); break;
      case "mengandung":
        params.push(`%${nilai}%`); bagian.push(`${kol} ILIKE $${params.length}`); break;
      case "tidak_mengandung":
        params.push(`%${nilai}%`);
        bagian.push(`(${kol} IS NULL OR ${kol} NOT ILIKE $${params.length})`); break;
      case "mulai":
        params.push(`${nilai}%`); bagian.push(`${kol} ILIKE $${params.length}`); break;
      case "sama":
        if (def.jenis === "angka") { params.push(Number(nilai) || 0); bagian.push(`${kol} = $${params.length}`); }
        else { params.push(nilai); bagian.push(`${kol} ILIKE $${params.length}`); }
        break;
      case "bukan":
        params.push(nilai); bagian.push(`(${kol} IS NULL OR ${kol} <> $${params.length})`); break;
      case "lebih":       params.push(Number(nilai) || 0); bagian.push(`${kol} > $${params.length}`); break;
      case "lebih_sama":  params.push(Number(nilai) || 0); bagian.push(`${kol} >= $${params.length}`); break;
      case "kurang":      params.push(Number(nilai) || 0); bagian.push(`${kol} < $${params.length}`); break;
      case "kurang_sama": params.push(Number(nilai) || 0); bagian.push(`${kol} <= $${params.length}`); break;
      case "antara":
        params.push(Number(nilai) || 0, Number(a.nilai2) || 0);
        bagian.push(`${kol} BETWEEN $${params.length - 1} AND $${params.length}`); break;
      case "sebelum":
        params.push(nilai); bagian.push(`${kol} < $${params.length}::timestamptz`); break;
      case "sesudah":
        params.push(nilai); bagian.push(`${kol} > $${params.length}::timestamptz`); break;
    }
  }
  return bagian;
}
