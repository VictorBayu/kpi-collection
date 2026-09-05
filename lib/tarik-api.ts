import { q, sql } from "./db";

/**
 * Penarikan data mentah dari API collection.
 *
 * Tiga keputusan yang membentuk berkas ini:
 *
 * 1. SEMUA ATAU TIDAK SAMA SEKALI. Data baru ditumpuk ke meja sementara
 *    dulu. Hanya bila seluruh cabang beserta seluruh halamannya berhasil
 *    terambil, isinya dipindah ke tabel resmi. Satu cabang gagal berarti
 *    seluruh tarikan dibatalkan dan angka lama tetap dipakai — lebih baik
 *    data kemarin yang utuh daripada data hari ini yang bolong tanpa ada
 *    yang menyadarinya.
 *
 * 2. EMPAT CABANG SEKALIGUS. Berurutan satu per satu terlalu lama untuk 57
 *    cabang; serentak 57 berisiko dianggap serangan oleh API sumber. Empat
 *    adalah kompromi yang memangkas waktu sekitar seperempatnya tanpa
 *    membanjiri siapa pun.
 *
 * 3. PEMINDAHAN DALAM SATU TRANSAKSI. Hapus-lalu-isi yang terpisah akan
 *    menyisakan jendela waktu berisi tabel kosong; kalau ada yang membuka
 *    dasbor tepat saat itu, dia melihat nol.
 */

const ASAL = "https://api2-collar.smartfinance.co.id/api/v1/getsaldoawalloc";

/** Batas dari sisi API. Lebih besar dari ini ditolak atau diabaikan. */
const UKURAN_HALAMAN = 300;

/** Cabang yang ditarik bersamaan. Lihat alasan 2 di atas. */
const SEKALIGUS = 4;

/** Percobaan ulang per permintaan sebelum dianggap gagal betulan. */
const COBA_ULANG = 2;

/**
 * Jumlah riwayat penarikan yang disimpan.
 *
 * Cukup untuk menutupi beberapa hari terakhir pada jadwal tujuh kali
 * sehari — yang dibutuhkan hanya memastikan tarikan masih berjalan dan
 * melihat galat terbaru bila gagal. Selebihnya hanya menumpuk.
 */
const SIMPAN_RIWAYAT = 50;

const JEDA_MS = 800;

export type HasilTarik = {
  berhasil: boolean;
  jumlahBaris: number;
  cabangSukses: number;
  cabangDiminta: number;
  cabangGagal: string[];
  durasiMs: number;
  pesan: string | null;
};

type Baris = Record<string, any>;

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tanggal hari ini di zona Jakarta — bukan UTC, yang bisa mundur sehari. */
export function tanggalHariIni(): string {
  const kini = new Date();
  const jkt = new Date(kini.getTime() + 7 * 3600 * 1000);
  return jkt.toISOString().slice(0, 10);
}

const angka = (v: any): number | null => {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bulat = (v: any): number | null => {
  const n = angka(v);
  return n === null ? null : Math.trunc(n);
};

const teks = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
};

/** API memakai "-" dan "" untuk tanggal kosong; keduanya bukan tanggal. */
const tanggal = (v: any): string | null => {
  const s = teks(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/**
 * Satu permintaan ke API, dengan percobaan ulang.
 *
 * Kegagalan sesaat (jaringan tersendat, API sibuk) berbeda dari kegagalan
 * sebenarnya, dan kalau tidak dibedakan maka satu kedipan jaringan akan
 * membatalkan seluruh tarikan 57 cabang. Karena itu tiap permintaan diberi
 * kesempatan beberapa kali sebelum menyerah.
 */
async function ambilHalaman(branchId: string, tanggalLoc: string, page: number) {
  const url = `${ASAL}?page=${page}&page_size=${UKURAN_HALAMAN}` +
    `&TanggalLoc=${encodeURIComponent(tanggalLoc)}&BranchID=${encodeURIComponent(branchId)}`;

  let galatTerakhir: unknown = null;
  for (let coba = 0; coba <= COBA_ULANG; coba++) {
    if (coba > 0) await tidur(JEDA_MS * coba);
    try {
      const kendali = AbortSignal.timeout(30_000);
      const res = await fetch(url, { signal: kendali, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      galatTerakhir = e;
    }
  }
  throw new Error(
    `Cabang ${branchId} halaman ${page} gagal setelah ${COBA_ULANG + 1} percobaan: ` +
    (galatTerakhir instanceof Error ? galatTerakhir.message : String(galatTerakhir)),
  );
}

/**
 * Batas jumlah halaman per cabang.
 *
 * Semata pengaman terhadap respons API yang menyebut jumlah halaman
 * keliru. Tanpa batas, satu angka salah bisa membuat penarikan berputar
 * ribuan kali dan menghabiskan waktu eksekusi. Dengan 300 baris per
 * halaman, 500 halaman berarti 150 ribu baris untuk satu cabang — jauh di
 * atas kewajaran, jadi kalau sampai tersentuh memang ada yang salah.
 */
const MAKS_HALAMAN = 500;

/**
 * Membaca baris data dan jumlah halaman dari respons API.
 *
 * Metadata paginasi bersarang di dalam objek `metadata`, bukan di tingkat
 * teratas:
 *
 *   { "data": [...],
 *     "metadata": { page, page_size, total_count, total_pages } }
 *
 * Ini pernah salah dibaca: pencarian hanya dilakukan di tingkat teratas,
 * sehingga jumlah halaman tidak pernah ketemu dan jatuh ke nilai bawaan
 * satu. Akibatnya tiap cabang hanya terambil halaman pertamanya — 16 ribu
 * baris dari 86 ribu yang seharusnya, tanpa satu pun pesan galat karena
 * dari sisi kode semuanya "berhasil".
 *
 * Karena itu jumlah halaman sekarang dihitung sendiri dari total_count
 * dibagi ukuran halaman yang kita minta, bukan sekadar memercayai
 * total_pages — API menghitung total_pages relatif terhadap page_size pada
 * permintaan itu, jadi keduanya harus cocok atau perhitungannya meleset.
 */
function bacaRespons(j: any): {
  baris: Baris[]; totalHalaman: number; totalBaris: number | null;
} {
  const baris: Baris[] =
    (Array.isArray(j) && j) ||
    j?.data ||
    j?.Data ||
    j?.result ||
    j?.rows ||
    [];

  const m = j?.metadata ?? j?.Metadata ?? j?.meta ?? j;

  const angkaDari = (...kandidat: any[]) => {
    for (const k of kandidat) {
      const n = Number(k);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  const totalBaris = angkaDari(m?.total_count, m?.totalCount, m?.total, m?.count);
  const ukuran = angkaDari(m?.page_size, m?.pageSize) ?? UKURAN_HALAMAN;

  // Dihitung dari total baris bila tersedia; total_pages hanya cadangan.
  const dariTotal = totalBaris !== null ? Math.ceil(totalBaris / ukuran) : null;
  const disebut = angkaDari(m?.total_pages, m?.totalPages, m?.page_count, m?.PageCount);

  const totalHalaman = dariTotal ?? disebut ?? 1;

  return {
    baris: Array.isArray(baris) ? baris : [],
    totalHalaman: Math.min(MAKS_HALAMAN, Math.max(1, totalHalaman)),
    totalBaris,
  };
}

/**
 * Seluruh halaman satu cabang. Gagal di halaman mana pun = gagal semua.
 *
 * Setelah semua halaman terkumpul, jumlahnya dicocokkan dengan total_count
 * yang disebut API. Ketidakcocokan dianggap kegagalan, bukan sekadar
 * dicatat: data yang kurang tanpa ada yang tahu jauh lebih berbahaya
 * daripada penarikan yang batal terang-terangan — angkanya tetap tampil di
 * dasbor, hanya saja salah, dan tidak ada yang curiga.
 */
async function ambilCabang(branchId: string, tanggalLoc: string): Promise<Baris[]> {
  const pertama = await ambilHalaman(branchId, tanggalLoc, 1);
  const { baris, totalHalaman, totalBaris } = bacaRespons(pertama);
  const semua = [...baris];

  for (let p = 2; p <= totalHalaman; p++) {
    const j = await ambilHalaman(branchId, tanggalLoc, p);
    const isi = bacaRespons(j).baris;
    semua.push(...isi);

    // Halaman kosong sebelum waktunya berarti jumlah halaman yang disebut
    // API lebih besar dari kenyataan. Berhenti, jangan teruskan memanggil
    // halaman yang pasti kosong.
    if (!isi.length) break;
  }

  // Kelengkapan diperiksa dengan toleransi, bukan kesamaan persis.
  //
  // total_count diambil dari halaman pertama, sementara pengambilan enam
  // halaman berikutnya butuh waktu — dan data di sumber terus berubah. Satu
  // kontrak yang lunas atau masuk di sela-sela itu membuat jumlah akhir
  // meleset satu-dua baris dari hitungan awal, dan itu wajar, bukan tanda
  // ada halaman yang terlewat.
  //
  // Yang benar-benar ingin ditangkap pemeriksaan ini adalah kegagalan
  // paging seperti dulu: hanya satu halaman terambil dari belasan, kurang
  // ribuan baris. Karena itu ambang kegagalan disetel satu halaman penuh —
  // selisih di bawah itu diterima sebagai pergeseran data biasa.
  if (totalBaris !== null && totalBaris - semua.length > UKURAN_HALAMAN) {
    throw new Error(
      `Cabang ${branchId} tidak lengkap: terambil ${semua.length} baris, ` +
      `API menyebut ada ${totalBaris} (${totalHalaman} halaman). ` +
      `Selisihnya terlalu besar untuk sekadar perubahan data.`,
    );
  }

  return semua;
}

/**
 * Satu baris API menjadi satu larik nilai, urut sesuai KOLOM di bawah.
 *
 * Hanya field yang punya kolom sendiri yang diambil. Sisa field respons API
 * sengaja dibuang, bukan disimpan: menampungnya sebagai JSON di satu kolom
 * dulu pernah dicoba, tapi puluhan field tak terpakai per baris — termasuk
 * daftar kontak konsumen — dikali puluhan ribu baris menembus batas
 * penyimpanan. Field yang sungguh diperlukan dipromosikan jadi kolom
 * sendiri lewat migrasi, seperti lima kolom tanggal di v6.
 */
function keNilai(r: Baris, branchId: string): any[] {
  return [
    teks(r.BranchID) ?? branchId,
    teks(r.RYM),
    teks(r.AgreementNo) ?? "",
    teks(r.ApplicationID),
    teks(r.CustomersID),
    teks(r.FullName),
    teks(r.BranchFullName),
    teks(r.AreaFullName),

    teks(r.Product),
    teks(r.ProductID),
    teks(r.DetailProduk),
    teks(r.Model),
    bulat(r.IsSyariah),

    teks(r.staff_pic),
    teks(r.spv_pic),
    teks(r.bch_pic),

    angka(r.OutstandingPrincipal),
    angka(r.SaldoPokokHarian),
    angka(r.PrincipalAmount),
    angka(r.InterestAmount),
    angka(r.SaldoBunga),
    angka(r.InstallmentAmount),
    angka(r.LateChargeAmount),
    angka(r.AmountTobePaid),
    angka(r.Exposure),
    angka(r.ContractPrepaidAmount),

    teks(r.BucketHarian),
    teks(r.BucketAwalBulan),
    teks(r.BucketWiltag),
    teks(r.OdMovement),
    teks(r.Odm1),
    teks(r.FlaggingFlow),
    teks(r.FlagingKuadran),          // ejaan API memang begini
    teks(r.FlaggingSp),
    teks(r.FlaggingRO),
    teks(r.btc_flag),
    teks(r.CategoriBayar),

    teks(r.ContractStatusAwalBulan),
    teks(r.ContractStatusHarian),
    teks(r.StatusAssetAwalbulan),
    teks(r.StatusAssetHarian),
    teks(r.StatusWOAwalBulan),
    teks(r.StatusWOHarian),

    bulat(r.OvdDays),
    bulat(r.OvdAwalBulan),
    bulat(r.OvdMax),
    bulat(r.MaxOvd1),
    bulat(r.Tenor),
    bulat(r.SisaAngke),
    bulat(r.AngkeHarian),
    bulat(r.AngkeAwalBulan),

    bulat(r.TotalAssign),
    bulat(r.TotalVisit),
    bulat(r.TotalPtp),
    bulat(r.TotalPelacakan),
    bulat(r.TotalInteraksi),
    teks(r.HasilAktifitasTerakhir),
    teks(r.TipeAktifitasTerakhir),

    teks(r.AreaTagih),
    teks(r.KdWilayah),
    teks(r.KodeSubPos),
    teks(r.DebtorCity),

    tanggal(r.DueDateHarian),
    tanggal(r.DueDateAwalBulan),
    tanggal(r.PtpDate),
    tanggal(r.TglBayarPertama),
    tanggal(r.TglBayarTerakhirBulanIni),
    tanggal(r.TglBayarTerakhirBulanLalu),
    tanggal(r.TglCair),
    tanggal(r.TanggalAktifitasTerakhir),
    tanggal(r.TglFlow),
    tanggal(r.TglTarik),
    tanggal(r.TanggalRAl),
    tanggal(r.TglValuePertama),
    tanggal(r.TglValueTerakhirBulanIni),
    tanggal(r.TglValueTerakhirBulanLalu),
  ];
}

/**
 * Kolom kustom yang ditambahkan admin lewat layar Kolom Data API.
 *
 * Dibaca dari katalog tiap kali menarik, lalu DITAMBAHKAN di belakang
 * kolom inti — tidak pernah menggantikannya. Kolom inti tetap ditangani
 * larik tetap di bawah karena penarikan puluhan ribu baris bersandar pada
 * urutan yang sudah teruji; menjadikannya dinamis hanya menambah cara
 * untuk gagal. Dengan pemisahan ini, kesalahan pada kolom kustom paling
 * jauh hanya membuat kolom itu kosong.
 */
export type KolomKustom = { kolom: string; jenis: string; field_api: string };

const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;

export async function muatKolomKustom(): Promise<KolomKustom[]> {
  try {
    const rows = await q<KolomKustom>(
      `SELECT kolom, jenis, field_api FROM mentah_kolom
        WHERE NOT bawaan AND aktif
          AND field_api IS NOT NULL AND btrim(field_api) <> ''
        ORDER BY urutan`);
    // Penyaringan ulang di sini bukan berlebihan: nama kolom ditempel ke
    // teks SQL, jadi ia diperiksa di setiap tempat yang memakainya.
    return rows.filter((r) => POLA_KOLOM.test(r.kolom));
  } catch {
    // Katalog belum dimigrasi (kolom bawaan/aktif belum ada) — penarikan
    // tetap berjalan dengan kolom inti saja.
    return [];
  }
}

function nilaiKustom(r: Baris, k: KolomKustom) {
  const v = (r as Record<string, any>)[k.field_api];
  return k.jenis === "angka" ? angka(v)
       : k.jenis === "tanggal" ? tanggal(v)
       : teks(v);
}

/** Nama kolom, urutannya harus sama persis dengan keNilai() di atas. */
const KOLOM = [
  "branch_id","rym","agreement_no","application_id","customers_id","full_name",
  "branch_full_name","area_full_name",
  "product","product_id","detail_produk","model","is_syariah",
  "staff_pic","spv_pic","bch_pic",
  "outstanding_principal","saldo_pokok_harian","principal_amount","interest_amount",
  "saldo_bunga","installment_amount","late_charge_amount","amount_tobe_paid",
  "exposure","contract_prepaid",
  "bucket_harian","bucket_awal_bulan","bucket_wiltag","od_movement","odm1",
  "flagging_flow","flagging_kuadran","flagging_sp","flagging_ro","btc_flag","kategori_bayar",
  "contract_status_awal","contract_status_hari","status_asset_awal","status_asset_harian",
  "status_wo_awal","status_wo_harian",
  "ovd_days","ovd_awal_bulan","ovd_max","max_ovd1","tenor","sisa_angke",
  "angke_harian","angke_awal_bulan",
  "total_assign","total_visit","total_ptp","total_pelacakan","total_interaksi",
  "hasil_aktifitas","tipe_aktifitas",
  "area_tagih","kd_wilayah","kode_sub_pos","debtor_city",
  "due_date_harian","due_date_awal_bulan","ptp_date","tgl_bayar_pertama",
  "tgl_bayar_akhir_ini","tgl_bayar_akhir_lalu","tgl_cair","tanggal_aktifitas","tgl_flow",
  "tgl_tarik","tanggal_ral","tgl_value_pertama","tgl_value_akhir_ini","tgl_value_akhir_lalu",
];

/**
 * Batas baris per satu perintah INSERT.
 *
 * Bukan batas jumlah parameter yang menentukan di sini, melainkan ukuran
 * badan permintaan. Driver HTTP Neon menolak permintaan yang terlalu
 * besar. Pada 779 baris (batas parameter) sekali kirim, badan permintaan
 * membengkak dan ditolak dengan "Database request failed". Seratus baris
 * per perintah menjaganya tetap kecil, dengan ongkos beberapa perjalanan
 * tambahan ke database yang jauh lebih murah daripada gagal.
 */
const BARIS_PER_INSERT = 100;

/**
 * Menyisipkan banyak baris sekaligus.
 *
 * Satu perintah INSERT per baris berarti 91 ribu perjalanan ke Neon dan
 * tidak akan pernah selesai dalam batas waktu. Baris digabung per rombongan
 * sehingga satu perintah membawa banyak baris. Nilainya tetap lewat
 * parameter, tidak pernah ditempel ke teks SQL.
 */
async function sisipkan(baris: Baris[], branchId: string, kustom: KolomKustom[] = []) {
  if (!baris.length) return 0;

  const semuaKolom = [...KOLOM, ...kustom.map((k) => k.kolom)];

  // Ambil yang terkecil antara batas parameter Postgres (65535) dan batas
  // ukuran badan permintaan Neon. Yang kedua hampir selalu yang mengikat.
  const perParam = Math.floor(60000 / semuaKolom.length);
  const perGrup = Math.max(1, Math.min(BARIS_PER_INSERT, perParam));
  let total = 0;

  for (let i = 0; i < baris.length; i += perGrup) {
    const grup = baris.slice(i, i + perGrup);
    const params: any[] = [];
    const tuple: string[] = [];

    for (const r of grup) {
      const nilai = [...keNilai(r, branchId), ...kustom.map((k) => nilaiKustom(r, k))];
      const dasar = params.length;
      tuple.push("(" + nilai.map((_, k) => `$${dasar + k + 1}`).join(",") + ")");
      params.push(...nilai);
    }

    await q(
      `INSERT INTO data_mentah_staging (${semuaKolom.join(",")}) VALUES ${tuple.join(",")}`,
      params,
    );
    total += grup.length;
  }
  return total;
}

/** Membagi daftar menjadi rombongan berukuran tetap. */
function rombongan<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Menjalankan satu putaran penarikan penuh.
 *
 * Mengembalikan hasilnya alih-alih melempar galat, karena pemanggilnya
 * (endpoint cron) perlu mencatat kegagalan ke riwayat, bukan sekadar
 * membalas 500 dan melupakannya.
 */
export async function tarikSemua(
  dipicuOleh: "cron" | "manual" = "cron",
): Promise<HasilTarik> {
  const mulai = Date.now();
  const tanggalLoc = tanggalHariIni();

  const cabang = await q<{ branch_id: string }>(
    `SELECT branch_id FROM cabang_api WHERE aktif ORDER BY branch_id`);

  // Dibaca sekali di awal, bukan per cabang: daftarnya sama untuk seluruh
  // putaran, dan membacanya 57 kali hanya menambah perjalanan ke database.
  const kustom = await muatKolomKustom();

  const [riwayat] = await q<{ id: number }>(
    `INSERT INTO tarik_status (tanggal_loc, cabang_diminta, dipicu_oleh)
     VALUES ($1,$2,$3) RETURNING id`,
    [tanggalLoc, cabang.length, dipicuOleh]);

  const selesaikan = async (h: Omit<HasilTarik, "durasiMs">) => {
    const durasiMs = Date.now() - mulai;
    await q(
      `UPDATE tarik_status
          SET selesai=now(), berhasil=$2, cabang_sukses=$3, cabang_gagal=$4,
              jumlah_baris=$5, durasi_ms=$6, pesan=$7
        WHERE id=$1`,
      [riwayat.id, h.berhasil, h.cabangSukses,
       h.cabangGagal.length ? h.cabangGagal : null,
       h.jumlahBaris, durasiMs, h.pesan]);

    // Riwayat dipangkas otomatis tiap selesai menarik.
    //
    // Dengan tujuh tarikan sehari, setahun berarti dua setengah ribu baris
    // yang tidak pernah dibuka — dan ruang di Neon sudah pernah habis
    // sekali. Yang berguna hanya beberapa terakhir untuk memastikan
    // tarikan masih berjalan; selebihnya cukup dibuang tanpa ditanya,
    // karena tabel ini catatan operasional, bukan data yang perlu diaudit.
    await q(
      `DELETE FROM tarik_status
        WHERE id NOT IN (
          SELECT id FROM tarik_status ORDER BY mulai DESC LIMIT $1)`,
      [SIMPAN_RIWAYAT]);

    return { ...h, durasiMs };
  };

  if (!cabang.length) {
    return selesaikan({
      berhasil: false, jumlahBaris: 0, cabangSukses: 0, cabangDiminta: 0,
      cabangGagal: [],
      pesan: "Belum ada kode cabang aktif di master. Isi dulu di menu Data API.",
    });
  }

  try {
    await q(`TRUNCATE data_mentah_staging`);

    let jumlahBaris = 0;
    let sukses = 0;

    for (const grup of rombongan(cabang.map((c) => c.branch_id), SEKALIGUS)) {
      // Ambil dan sisipkan tiap cabang dalam rombongan secara paralel.
      //
      // Menyisipkan ke staging yang sama dari beberapa cabang sekaligus
      // aman — INSERT tidak saling mengunci baris. Menjadikannya berurutan
      // hanya membuang waktu: dengan paging diperbaiki, jumlah INSERT naik
      // tajam (puluhan ribu baris, seratus per perintah), dan berurutan
      // bisa mendekati batas waktu function.
      //
      // Promise.all sengaja, bukan allSettled: begitu satu cabang gagal —
      // baik saat mengambil maupun menyisipkan — seluruh tarikan memang
      // harus dibatalkan, jadi tidak ada gunanya menunggu sisanya.
      const hasil = await Promise.all(
        grup.map(async (bid) => {
          const baris = await ambilCabang(bid, tanggalLoc);
          return sisipkan(baris, bid, kustom);
        }),
      );
      jumlahBaris += hasil.reduce((a, b) => a + b, 0);
      sukses += grup.length;
    }

    // Pemindahan dalam satu transaksi. Tidak ada jendela waktu berisi
    // tabel kosong di antara hapus dan isi.
    //
    // Kolom ditulis eksplisit, TIDAK memakai SELECT *. Tiga kolom NIK
    // (nik_staff/nik_spv/nik_bch) dihitung otomatis oleh Postgres lewat
    // GENERATED ALWAYS AS ... STORED, dan Postgres menolak menerima nilai
    // untuk kolom begini walau nilainya datang dari SELECT * pada tabel
    // lain yang skemanya identik — pemindahan harus menyebutkan sendiri
    // kolom mana yang boleh diisi, lalu membiarkan Postgres menghitung
    // ulang tiga kolom turunan itu dari kolom aslinya.
    //
    // sql.transaction() hanya menerima query yang dibuat lewat pemanggilan
    // `sql` itu sendiri — baik templat sql`...` maupun bentuk fungsi biasa
    // sql(teks, params). Metode lain seperti sql.query() menghasilkan
    // promise yang bentuknya berbeda dan ditolak oleh transaction().
    const kolomPindah = [...KOLOM, ...kustom.map((k) => k.kolom), "ditarik_pada"].join(",");
    await sql.transaction([
      sql`TRUNCATE data_mentah`,
      sql(`INSERT INTO data_mentah (${kolomPindah}) SELECT ${kolomPindah} FROM data_mentah_staging`),
      sql`TRUNCATE data_mentah_staging`,
    ]);

    return selesaikan({
      berhasil: true, jumlahBaris, cabangSukses: sukses,
      cabangDiminta: cabang.length, cabangGagal: [], pesan: null,
    });
  } catch (e) {
    // Staging dibuang; data resmi tidak pernah tersentuh sejak awal.
    try { await q(`TRUNCATE data_mentah_staging`); } catch { /* diabaikan */ }

    const pesan = e instanceof Error ? e.message : String(e);
    const cocok = pesan.match(/Cabang (\S+)/);
    return selesaikan({
      berhasil: false, jumlahBaris: 0, cabangSukses: 0,
      cabangDiminta: cabang.length,
      cabangGagal: cocok ? [cocok[1]] : [],
      pesan,
    });
  }
}
