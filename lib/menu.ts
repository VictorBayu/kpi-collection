/**
 * Katalog menu — satu-satunya sumber kebenaran daftar menu aplikasi.
 *
 * Dipakai bersama oleh tiga tempat: bilah navigasi (AppShell), layar
 * pengaturan hak akses peran, dan penjagaan rute. Menaruhnya di kode,
 * bukan di database, disengaja: menu adalah bagian dari aplikasi — sebuah
 * baris database tidak bisa memunculkan halaman yang belum ditulis. Yang
 * disimpan di database hanyalah *peran mana boleh membuka kode menu yang
 * mana* (tabel `peran_menu`).
 *
 * Menambah menu baru: tambahkan satu entri di sini, lalu centangkan untuk
 * peran yang berhak lewat layar Manajemen Peran.
 */

export type Menu = {
  /** Kode stabil yang disimpan di peran_menu. Jangan diubah setelah dipakai. */
  kode: string;
  label: string;
  href: string;
  /** Judul dropdown di navigasi. Kosong berarti tautan langsung. */
  grup?: string;
  /** Menampilkan lencana jumlah belum dibaca (khusus Request/Supporting). */
  lencana?: boolean;
  /** Nama ikon di components/Ikon.tsx untuk navigasi dan remah roti. */
  ikon?: string;
  /** Ditempatkan setelah dropdown, bukan sebelum — menjaga urutan lama. */
  akhir?: boolean;
};

export const MENU: Menu[] = [
  // — untuk semua orang —
  //
  // Dashboard Tim ditaruh paling depan untuk atasan: yang pertama ingin ia
  // ketahui tiap pagi adalah keadaan timnya, bukan skornya sendiri. Bagi
  // karyawan menu ini tidak muncul sama sekali, jadi urutan ini tidak
  // merugikan mereka — "Dasbor saya" tetap menu pertama yang mereka lihat.
  { kode: "tim_dashboard", label: "Dashboard Tim", href: "/tim/dashboard", ikon: "chart" },
  { kode: "dashboard",   label: "Dasbor saya",     href: "/dashboard", ikon: "dashboard" },
  { kode: "harian_saya", label: "Progres harian",  href: "/harian", ikon: "calendar" },
  { kode: "tim",         label: "Tim saya",        href: "/tim", ikon: "users" },
  { kode: "request",     label: "Request",         href: "/request", lencana: true, ikon: "message" },

  // — pemantauan (admin area, tautan langsung) —
  { kode: "admin_analitik", label: "Dashboard",  href: "/admin/analitik", ikon: "dashboard" },
  { kode: "admin_kpi",      label: "Data KPI",   href: "/admin/kpi", ikon: "table" },
  { kode: "admin_harian",   label: "KPI Harian", href: "/admin/harian", ikon: "calendar" },
  { kode: "admin_request",  label: "Supporting", href: "/admin/request", lencana: true, akhir: true, ikon: "message" },

  // — grup: Data & indikator —
  { kode: "admin_indikator", label: "Create Indicator",     href: "/admin/indikator",   grup: "Data & indikator", ikon: "formula" },
  { kode: "admin_tracing",   label: "Tracing KPI",          href: "/admin/tracing",     grup: "Data & indikator", ikon: "search" },
  { kode: "admin_data_api",  label: "Data API",             href: "/admin/data-api",    grup: "Data & indikator", ikon: "api" },
  { kode: "admin_sumber",    label: "Sumber Data",          href: "/admin/sumber",      grup: "Data & indikator", ikon: "database" },
  { kode: "admin_kolom_api", label: "CRUD Kolom API",       href: "/admin/kolom-api",   grup: "Data & indikator", ikon: "columns" },
  { kode: "admin_turunan",   label: "Kolom Turunan",        href: "/admin/turunan",     grup: "Data & indikator", ikon: "branch" },
  { kode: "admin_pendukung", label: "Data Pendukung",       href: "/admin/pendukung",   grup: "Data & indikator", ikon: "file" },
  { kode: "admin_sampel",    label: "Sample Data API",      href: "/admin/sampel-data", grup: "Data & indikator", ikon: "code" },
  { kode: "admin_riwayat",   label: "Riwayat impor Excel",  href: "/admin/riwayat",     grup: "Data & indikator", ikon: "history" },
  { kode: "admin_arsip_mentah", label: "Arsip Data Mentah", href: "/admin/arsip-mentah", grup: "Data & indikator", ikon: "sheet" },

  // — grup: Master —
  { kode: "admin_import",       label: "Unggah data",         href: "/admin/import",       grup: "Master", ikon: "upload" },
  { kode: "admin_hierarki",     label: "Master Hierarki",     href: "/admin/hierarki",     grup: "Master", ikon: "hierarchy" },
  { kode: "admin_produk",       label: "Master Produk",       href: "/admin/produk",       grup: "Master", ikon: "box" },
  { kode: "admin_pagu",         label: "Pagu Insentif",       href: "/admin/pagu",         grup: "Master", ikon: "wallet" },
  { kode: "admin_tier",         label: "Tabel Tier Insentif", href: "/admin/tier",         grup: "Master", ikon: "layers" },
  { kode: "admin_kelas_cabang", label: "Tier Cabang",         href: "/admin/kelas-cabang", grup: "Master", ikon: "building" },
  { kode: "admin_cabang",       label: "Master Cabang API",   href: "/admin/cabang",       grup: "Master", ikon: "server" },
  { kode: "admin_pengguna",     label: "Pengguna & Akses",    href: "/admin/pengguna",     grup: "Master", ikon: "userCog" },
  { kode: "admin_peran",        label: "Peran & Hak Akses",   href: "/admin/peran",        grup: "Master", ikon: "shield" },
];

/** Urutan grup dropdown di navigasi. */
export const URUT_GRUP = ["Data & indikator", "Master"];

/** Kode menu -> definisinya, untuk pencarian cepat. */
export const PETA_MENU = new Map(MENU.map((m) => [m.kode, m]));

/**
 * Hak bawaan per peran, dipakai sebagai cadangan bila sesi lama belum
 * membawa daftar menu (token yang diterbitkan sebelum fitur ini ada).
 * Tanpa ini, pengguna yang sedang login akan melihat navigasi kosong
 * sampai tokennya kedaluwarsa.
 */
export const MENU_BAWAAN: Record<string, string[]> = {
  karyawan: ["dashboard", "harian_saya", "request"],
  atasan: ["dashboard", "harian_saya", "tim_dashboard", "tim", "request"],
  manager: ["dashboard", "harian_saya", "tim_dashboard", "tim", "request",
            "admin_analitik", "admin_kpi", "admin_harian"],
  manajemen_ho: ["dashboard", "harian_saya", "tim_dashboard", "tim", "request",
                 "admin_analitik", "admin_kpi", "admin_harian", "admin_riwayat"],
  // Admin sengaja tidak diberi menu sisi karyawan (Dasbor saya, Progres
  // harian, Tim saya, Request): akun admin data tidak punya KPI sendiri,
  // dan menampilkannya hanya menambah menu yang selalu kosong.
  admin: MENU.filter((m) => !["dashboard", "harian_saya", "tim", "request"].includes(m.kode))
             .map((m) => m.kode),
};

/**
 * Menu yang boleh dibuka satu sesi. Mengembalikan daftar kode.
 * Sesi lama tanpa `menu` jatuh ke hak bawaan perannya.
 */
export function menuSesi(peran: string, menu?: string[] | null): string[] {
  if (Array.isArray(menu) && menu.length) return menu;
  return MENU_BAWAAN[peran] ?? MENU_BAWAAN.karyawan;
}

/**
 * Apakah sebuah path boleh dibuka dengan daftar menu tertentu.
 *
 * Dicocokkan dengan awalan href supaya halaman turunan ikut terbuka:
 * pemegang `admin_kpi` (/admin/kpi) juga boleh membuka /admin/kpi/20250733.
 * Href terpanjang diperiksa lebih dulu agar /admin/kpi tidak salah
 * mengizinkan rute lain yang kebetulan berawalan sama.
 */
export function bolehBuka(path: string, kodeMenu: string[]): boolean {
  const izin = new Set(kodeMenu);
  const cocok = MENU
    .filter((m) => path === m.href || path.startsWith(m.href + "/"))
    .sort((a, b) => b.href.length - a.href.length);
  if (!cocok.length) return true;   // rute di luar katalog tidak dijaga di sini
  return izin.has(cocok[0].kode);
}

/** Halaman pertama yang boleh dibuka — tujuan setelah login. */
export function berandaUntuk(kodeMenu: string[]): string {
  const izin = new Set(kodeMenu);
  // Admin dan manajemen mendarat di dashboard analitik bila berhak;
  // selain itu ke halaman pertama yang tersedia baginya.
  if (izin.has("admin_analitik")) return "/admin/analitik";
  const pertama = MENU.find((m) => izin.has(m.kode));
  return pertama?.href ?? "/dashboard";
}
