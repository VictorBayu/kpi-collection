import { requireMenu, handler, HttpError } from "@/lib/auth";
import { q } from "@/lib/db";
import { periodeBerjalan } from "@/lib/hitung-indikator";
import { toISODate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Jejak perhitungan satu NIK — dari data mentah sampai rupiah.
 *
 * Layar Data KPI menjawab "berapa angkanya". Berkas ini menjawab
 * pertanyaan yang berbeda dan lebih sulit: "kenapa angkanya segitu, dan
 * apakah indikator yang saya susun untuk jabatan ini sudah masuk akal".
 * Keduanya butuh data yang berbeda — yang pertama cukup hasil akhir, yang
 * kedua butuh seluruh bahan yang dipakai mesin hitung: rumusnya, target
 * dan pitanya, gerbangnya, pagunya, sampai baris mentah yang tersedia.
 *
 * Dua keputusan yang membentuk berkas ini:
 *
 * 1. Angkanya DIBACA dari kpi_row/insentif_row, bukan dihitung ulang.
 *    Tracing yang menghitung ulang akan selalu tampak benar terhadap
 *    dirinya sendiri, justru pada saat yang tersimpan salah. Yang perlu
 *    diperiksa admin adalah angka yang betul-betul terpakai, bukan angka
 *    kedua yang kebetulan dihitung ulang dengan cara yang sama.
 *
 * 2. Temuan dirakit di sini, bukan diserahkan ke mata admin. Bobot yang
 *    berjumlah 97, pita yang bolong, gerbang yang menunjuk indikator tak
 *    terdaftar — semuanya tetap menghasilkan angka yang kelihatan wajar
 *    di layar. Kalau tidak ditunjuk, nyaris mustahil terlihat.
 */

type Baris = any;

/** Membaca target aktif satu alias+produk, termasuk yang belum terhitung. */
const SQL_BARIS = `
  SELECT k.id, k.nik, k.indikator_id, k.indikator, k.produk, k.satuan, k.catatan,
         k.pencapaian, k.skor_kpi, k.bobot, k.skor_terbobot,
         k.bobot_insentif, k.skor_terbobot_ins,
         k.target_kpi3, k.target_kpi4, k.target_kpi5,
         k.peran, k.jenis_nilai, k.nilai_efek,
         k.nominal_baris, k.gerbang_gagal,
         k.jabatan, k.cabang, k.sumber, k.dihitung_pada,
         d.peran_pic, d.kali_seratus, d.aktif AS indikator_aktif,
         t.id AS target_id, t.alias, t.aktif AS target_aktif, t.pemilih_id,
         t.faktor_pengakuan,
         pm.nama AS pemilih_nama,
         EXISTS (SELECT 1 FROM indikator_pita p WHERE p.target_id = t.id) AS ada_pita,
         EXISTS (SELECT 1 FROM indikator_nominal n WHERE n.target_id = t.id) AS ada_nominal
    FROM kpi_row k
    LEFT JOIN indikator_def d ON d.id = k.indikator_id
    LEFT JOIN indikator_target t
           ON t.indikator_id = k.indikator_id
          AND t.produk       = k.produk
          AND t.alias        = norm_jabatan(k.jabatan)
    LEFT JOIN indikator_def pm ON pm.id = t.pemilih_id
   WHERE k.nik = $1 AND k.periode = $2::date
   ORDER BY k.produk, k.peran NULLS LAST, k.indikator`;

/**
 * Target terdaftar untuk jabatan orang ini yang TIDAK punya baris KPI.
 *
 * Mesin hitung menerbitkan baris untuk setiap orang terdaftar walau
 * nilainya kosong, jadi target tanpa baris berarti sesuatu tidak jalan:
 * indikatornya baru didaftarkan dan belum dihitung ulang, rumusnya gagal,
 * atau jabatan di baris KPI berbeda dari jabatan pengguna sekarang.
 * Ini justru temuan yang paling mudah terlewat — yang hilang tidak
 * muncul di layar mana pun.
 */
/**
 * Daftar periode, dibaca lewat "loose index scan".
 *
 * Bentuk lamanya `SELECT DISTINCT periode FROM kpi_row ORDER BY periode
 * DESC LIMIT 18`. Postgres tidak punya skip-scan, jadi perintah itu harus
 * membaca SELURUH isi idx_kpi_periode lebih dulu baru menyaring yang
 * kembar -- biayanya tumbuh seiring jumlah baris KPI, padahal jawabannya
 * cuma belasan tanggal. Di layar ini ia dijalankan setiap kali tombol
 * Telusuri ditekan, jadi ongkosnya dibayar terus-menerus.
 *
 * Bentuk rekursif di bawah menempuh indeks yang sama seperti menaiki
 * tangga: ambil periode terbesar, lalu terbesar yang lebih kecil dari
 * itu, dan seterusnya. Biayanya jadi sebanyak bulan yang ada -- belasan
 * pencarian indeks -- bukan satu kali pembacaan seluruh baris KPI, dan
 * tidak ikut membengkak setiap bulan data baru masuk.
 *
 * ORDER BY-nya ditulis walau rekursi ini memang sudah menghasilkan urutan
 * menurun: urutan keluaran CTE bukan sesuatu yang dijanjikan SQL, dan
 * baris pertama di sini dipakai sebagai periode baku saat pemanggil tidak
 * menyebutkan periode. Ongkosnya mengurutkan belasan baris.
 *
 * Hasilnya identik dengan bentuk lama -- kolom periode di kpi_row NOT
 * NULL, jadi tidak ada baris NULL yang perlu diurus berbeda.
 */
const SQL_PERIODE = `
  WITH RECURSIVE tangga AS (
    SELECT MAX(periode) AS periode FROM kpi_row
    UNION ALL
    SELECT (SELECT MAX(k.periode) FROM kpi_row k WHERE k.periode < t.periode)
      FROM tangga t WHERE t.periode IS NOT NULL
  )
  SELECT periode FROM tangga
   WHERE periode IS NOT NULL
   ORDER BY periode DESC
   LIMIT 18`;

const SQL_TARGET_YATIM = `
  SELECT d.nama AS indikator, t.produk, t.alias, t.peran
    FROM indikator_target t
    JOIN indikator_def d ON d.id = t.indikator_id AND d.aktif
    JOIN app_user u ON u.nik = $1
   WHERE t.aktif
     AND t.alias = norm_jabatan(u.jabatan)
     AND NOT EXISTS (
       SELECT 1 FROM kpi_row k
        WHERE k.nik = $1 AND k.periode = $2::date
          AND k.indikator_id = t.indikator_id AND k.produk = t.produk)
   ORDER BY t.produk, d.nama`;

export const GET = handler(async (req) => {
  await requireMenu("admin_tracing");
  const u = new URL(req.url);
  const nik = (u.searchParams.get("nik") ?? "").trim();
  const periodeMinta = (u.searchParams.get("periode") ?? "").trim();

  const t0 = Date.now();

  // Daftar periode selalu dikirim supaya pemilih periode terisi bahkan
  // saat NIK belum diketik. Kueri DIBERANGKATKAN di sini tapi sengaja
  // BELUM ditunggu: begitu pemanggil sudah menyebut periode -- dan itu
  // yang terjadi setiap kali tombol Telusuri ditekan, karena pemilih
  // periode sudah terisi sejak layar pertama -- nilainya tidak dibutuhkan
  // siapa pun untuk menyusun kueri berikutnya. Menunggunya di sini berarti
  // menambah satu perjalanan bolak-balik ke database sebelum kueri yang
  // sebenarnya boleh berangkat.
  const pPeriodeList = q<{ periode: string }>(SQL_PERIODE);
  // toISODate(), bukan String(date).slice(0,10) — driver mengembalikan
  // periode sebagai objek Date, dan String(Date) menghasilkan teks
  // seperti "Tue Sep 01 2026 ..." yang terpotong jadi "Tue Sep 01" tanpa
  // tahun. Teks itu lolos ke Response.json() sebagai string biasa, lalu
  // di klien di-parse ulang oleh `new Date(...)` sebagai fallback —
  // yang oleh mesin JS diperlakukan sebagai tanggal tanpa tahun dan
  // dibulatkan ke tahun rujukan 2001. Bug ini pernah dijaga eksplisit di
  // toISODate() sendiri (lihat komentarnya), tapi di sini kena lagi
  // karena dipanggil manual dengan cara yang salah.
  const periode = periodeMinta ||
    (await pPeriodeList.then((l) => (l[0] ? toISODate(l[0].periode) : "")));

  if (!nik) {
    const periodeList = await pPeriodeList;
    // Contoh NIK untuk layar awal: orang dengan baris indikator terbanyak
    // di periode itu — paling banyak yang bisa ditelusuri, jadi paling
    // berguna untuk mencoba. Diambil dari data sungguhan, bukan NIK
    // karangan yang belum tentu ada di database ini.
    const contoh = periode
      ? await q<any>(
          `SELECT k.nik, MAX(u.nama) AS nama, MAX(u.jabatan) AS jabatan,
                  MAX(u.cabang) AS cabang, COUNT(*)::int AS baris
             FROM kpi_row k JOIN app_user u ON u.nik = k.nik
            WHERE k.periode = $1::date
            GROUP BY k.nik
            ORDER BY COUNT(*) DESC, k.nik
            LIMIT 3`, [periode]).catch(() => [])
      : [];
    return Response.json({ periodeList, periode, kosong: true, contoh });
  }

  // Diperiksa SEBELUM gelombang di bawah berangkat: tanpa periode,
  // parameter $2::date akan berisi teks kosong dan kuerinya gagal.
  if (!periode) throw new HttpError(400, "Belum ada periode KPI sama sekali.");

  // Satu gelombang, bukan tiga.
  //
  // Driver Neon di sini berbicara lewat HTTP: tiap q() adalah satu
  // perjalanan bolak-balik tersendiri, dan ongkos terbesarnya bukan kerja
  // databasenya melainkan jaraknya. Dulu berkas ini menunggu daftar
  // periode, lalu menunggu baris "orang", baru menjalankan sisanya --
  // empat gelombang berurutan, empat kali ongkos jarak, padahal tidak
  // satu pun dari keempatnya memerlukan hasil yang sebelumnya.
  //
  // Satu-satunya yang benar-benar berurutan adalah periode (dipakai
  // sebagai parameter) dan itu sudah diselesaikan di atas. Sisanya
  // berangkat bersama-sama. NIK yang tidak terdaftar memang jadi
  // menjalankan tiga kueri sia-sia, tapi ketiganya tidak menemukan apa
  // pun dan berakhir cepat -- jauh lebih murah daripada membuat setiap
  // penelusuran yang berhasil menunggu satu giliran tambahan.
  const [periodeList, orangRows, baris, yatim] = await Promise.all([
    pPeriodeList,
    q<any>(
      `SELECT u.nik, u.nama, u.jabatan, u.cabang, u.area, u.aktif,
              norm_jabatan(u.jabatan) AS alias
         FROM app_user u WHERE u.nik = $1`, [nik]),
    q<Baris>(SQL_BARIS, [nik, periode]),
    q<any>(SQL_TARGET_YATIM, [nik, periode]),
  ]);
  const t1 = Date.now();

  const orang = orangRows[0];
  if (!orang) throw new HttpError(404, `NIK ${nik} tidak ada di daftar pengguna.`);

  const targetIds = baris.map((b) => b.target_id).filter(Boolean);
  const indikatorIds = [...new Set(baris.map((b) => b.indikator_id).filter(Boolean))];
  const produkList = [...new Set(baris.map((b) => b.produk).filter(Boolean))];

  const [pita, nominalPita, gerbang, komponen, insentif, tierTabel, mentah] =
    await Promise.all([
      targetIds.length
        ? q<any>(
            `SELECT target_id, urutan, nilai_min, nilai_max, poin_min, poin_max
               FROM indikator_pita WHERE target_id = ANY($1::uuid[])
              ORDER BY target_id, urutan`, [targetIds])
        : [],

      targetIds.length
        ? q<any>(
            `SELECT target_id, urutan, nilai_min, nilai_max, nominal
               FROM indikator_nominal WHERE target_id = ANY($1::uuid[])
              ORDER BY target_id, urutan`, [targetIds])
        : [],

      // Tiap gerbang sekalian dicarikan angka ukurnya, dengan aturan yang
      // sama persis seperti saat mesin menilainya — termasuk "tidak ada
      // angka berarti gagal". Menampilkan gerbang tanpa angkanya hanya
      // memindahkan pertanyaan, bukan menjawabnya.
      // kali_seratus dibaca dari indikator SUMBER gerbangnya (bukan
      // selalu indikator ini sendiri): sumber_id kosong berarti gerbang
      // menguji indikator ini sendiri (pakai kali_seratus-nya sendiri
      // lewat `di`), sumber_id terisi berarti menguji indikator lain
      // dan satuannya ikut indikator itu (`d`) — dua kolom rupiah dan
      // persen tidak boleh dibandingkan tanpa tahu yang mana yang mana.
      targetIds.length
        ? q<any>(
            `SELECT g.target_id, g.urutan, g.operator, g.nilai, g.sumber_id,
                    COALESCE(NULLIF(BTRIM(g.label), ''), d.nama, 'Syarat') AS nama,
                    COALESCE(d.kali_seratus, di.kali_seratus, false) AS kali_seratus,
                    (SELECT s.pencapaian FROM kpi_row s
                      WHERE s.sumber = 'api' AND s.periode = $2::date
                        AND s.nik = $1 AND s.produk = tr.produk
                        AND s.indikator_id = COALESCE(g.sumber_id, tr.indikator_id)
                      LIMIT 1) AS ukur,
                    (g.sumber_id IS NOT NULL AND NOT EXISTS (
                       SELECT 1 FROM indikator_target x
                        WHERE x.indikator_id = g.sumber_id
                          AND x.alias = tr.alias AND x.produk = tr.produk
                          AND x.aktif)) AS sumber_tak_terdaftar
               FROM indikator_gerbang g
               JOIN indikator_target tr ON tr.id = g.target_id
               LEFT JOIN indikator_def d  ON d.id = g.sumber_id
               LEFT JOIN indikator_def di ON di.id = tr.indikator_id
              WHERE g.target_id = ANY($3::uuid[])
              ORDER BY g.target_id, g.urutan`, [nik, periode, targetIds])
        : [],

      // Bahan rumus: komponen, kolom, dan syarat penyaring barisnya.
      indikatorIds.length
        ? q<any>(
            `SELECT k.indikator_id, k.id AS komponen_id, k.urutan, k.agregat,
                    k.kolom, k.operator_sebelum, k.gabung_syarat, k.pengakuan_kolom,
                    COALESCE(mk.label, k.kolom) AS kolom_label,
                    COALESCE(mk.sumber, 'api')  AS kolom_sumber,
                    (SELECT json_agg(json_build_object(
                              'kolom', s.kolom,
                              'label', COALESCE(ms.label, s.kolom),
                              'operator', s.operator,
                              'nilai', s.nilai) ORDER BY s.urutan)
                       FROM indikator_syarat s
                       LEFT JOIN mentah_kolom ms ON ms.kolom = s.kolom
                      WHERE s.komponen_id = k.id) AS syarat
               FROM indikator_komponen k
               LEFT JOIN mentah_kolom mk ON mk.kolom = k.kolom
              WHERE k.indikator_id = ANY($1::uuid[])
              ORDER BY k.indikator_id, k.urutan`, [indikatorIds])
        : [],

      q<any>(
        // gabung: skor seluruh produk mekanisme 'pagu' milik jabatan ini
        // dijumlahkan, sementara pembagi/pagu/ambang diambil satu (MAX) --
        // persis seperti CTE gabung_pagu di lib/hitung-indikator.ts, supaya
        // kartu insentif menjelaskan angka yang sama dengan yang dipakai
        // mesin. pembagi_min/pagu_min ikut dibawa hanya untuk mendeteksi
        // baris pagu antarproduk yang tidak seragam, lalu diperingatkan.
        `WITH gabung AS (
           SELECT norm_jabatan(i.jabatan) AS alias,
                  SUM(i.skor_insentif)  AS skor_gabungan,
                  MAX(g.pembagi)        AS pembagi_gabungan,
                  MAX(g.nominal)        AS pagu_gabungan,
                  MIN(g.pembagi)        AS pembagi_min,
                  MIN(g.nominal)        AS pagu_min,
                  MAX(g.skor_minimal)   AS ambang_gabungan,
                  MIN(g.skor_minimal)   AS ambang_min,
                  COUNT(*)::int         AS jml_produk_gabungan
             FROM insentif_row i
             JOIN insentif_pagu g
               ON g.alias = norm_jabatan(i.jabatan) AND g.produk = i.produk AND g.aktif
            WHERE i.nik = $1 AND i.periode = $2::date AND g.mekanisme = 'pagu'
            GROUP BY norm_jabatan(i.jabatan)
         )
         SELECT i.produk, i.kategori, i.jabatan, i.cabang,
                i.skor_insentif, i.tier, i.kelas_cabang,
                i.nominal_dasar, i.nominal_reward, i.nominal_penalty, i.nominal,
                i.keterangan, i.sumber, i.dihitung_pada,
                g.mekanisme, g.nominal AS pagu_nominal,
                g.skor_minimal, g.pembagi, g.aktif AS pagu_aktif,
                gb.skor_gabungan, gb.pembagi_gabungan, gb.pagu_gabungan,
                gb.pembagi_min, gb.pagu_min, gb.ambang_min,
                gb.ambang_gabungan, gb.jml_produk_gabungan
           FROM insentif_row i
           LEFT JOIN insentif_pagu g
                  ON g.alias = norm_jabatan(i.jabatan) AND g.produk = i.produk
           LEFT JOIN gabung gb ON gb.alias = norm_jabatan(i.jabatan)
          WHERE i.nik = $1 AND i.periode = $2::date
          ORDER BY i.produk`, [nik, periode]),

      // Sel tabel tier yang relevan — supaya admin melihat nominal itu
      // memang ada di tabel, bukan menebak kenapa hasilnya nol.
      produkList.length
        ? q<any>(
            `SELECT it.produk, it.tier, it.kelas, it.nominal
               FROM insentif_tier it
               JOIN app_user u ON u.nik = $1
              WHERE it.alias = norm_jabatan(u.jabatan)
                AND it.produk = ANY($2::text[])
              ORDER BY it.produk, it.tier, it.kelas`, [nik, produkList])
        : [],

      // Semesta baris mentah milik orang ini — pembagi tak resmi dari
      // semua pencapaian. Nol di sini menjelaskan sekaligus seluruh
      // indikator yang kosong, dan itu sebab yang sama sekali berbeda
      // dari "rumusnya salah".
      q<any>(
        `SELECT upper(btrim(COALESCE(product,''))) AS produk,
                COUNT(*) FILTER (WHERE nik_staff = $1)::int AS staff,
                COUNT(*) FILTER (WHERE nik_spv   = $1)::int AS spv,
                COUNT(*) FILTER (WHERE nik_bch   = $1)::int AS bch
           FROM data_mentah
          WHERE nik_staff = $1 OR nik_spv = $1 OR nik_bch = $1
          GROUP BY 1 ORDER BY 1`, [nik]),
    ]);
  const t2 = Date.now();

  const perTarget = <T extends { target_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const a = m.get(r.target_id) ?? []; a.push(r); m.set(r.target_id, a);
    }
    return m;
  };
  const petaPita = perTarget(pita);
  const petaNominal = perTarget(nominalPita);
  const petaGerbang = perTarget(gerbang);

  const petaKomponen = new Map<string, any[]>();
  for (const k of komponen) {
    const a = petaKomponen.get(k.indikator_id) ?? []; a.push(k);
    petaKomponen.set(k.indikator_id, a);
  }

  const petaMentah = new Map(mentah.map((m) => [m.produk, m]));
  const KOLOM_PIC: Record<string, "staff" | "spv" | "bch"> = {
    staff: "staff", spv: "spv", bch: "bch",
  };

  // data_mentah hanya menyimpan tarikan TERKINI, bukan arsip per bulan.
  // Untuk periode lampau, jumlah baris mentah di layar menggambarkan
  // keadaan hari ini — bukan bahan yang dulu dipakai menghitung baris
  // itu. Dibiarkan tampil tanpa keterangan, angka itu akan dibaca
  // sebagai bukti dan menuntun ke kesimpulan yang salah.
  const berjalan = periode === periodeBerjalan();

  const jejak = baris.map((b) => {
    const pic = KOLOM_PIC[b.peran_pic] ?? "staff";
    const m = petaMentah.get(String(b.produk ?? "").toUpperCase());
    const komponenIndikator = petaKomponen.get(b.indikator_id) ?? [];
    return {
      ...b,
      pita: petaPita.get(b.target_id) ?? [],
      nominal_pita: petaNominal.get(b.target_id) ?? [],
      gerbang: petaGerbang.get(b.target_id) ?? [],
      komponen: komponenIndikator,
      // Baris mentah yang bisa terbaca rumus ini: dari kolom NIK sesuai
      // peran pemegang indikator, bukan sembarang baris milik orangnya.
      baris_mentah: m ? Number(m[pic] ?? 0) : 0,
    };
  });

  // Server-Timing: dua gelombang kueri itu dilaporkan apa adanya, supaya
  // kalau suatu saat layar ini terasa lambat lagi, jawabannya bisa dibaca
  // di tab Network peramban (kolom Timing) tanpa perlu menebak atau
  // menambal instrumentasi dadakan -- termasuk membedakan "databasenya
  // lambat" dari "fungsinya baru bangun" (selisih total dengan db1+db2).
  return Response.json({
    periodeList, periode, orang, periode_berjalan: berjalan,
    jejak, yatim, insentif, tier_tabel: tierTabel,
    mentah,
    temuan: temuan(jejak, yatim, insentif, tierTabel, berjalan),
  }, {
    headers: {
      "Server-Timing": [
        `db1;desc="periode+orang+baris+yatim";dur=${t1 - t0}`,
        `db2;desc="pita+gerbang+komponen+insentif+tier+mentah";dur=${t2 - t1}`,
        `total;dur=${Date.now() - t0}`,
      ].join(", "),
    },
  });
});

/**
 * Pemeriksaan kewajaran susunan indikator.
 *
 * Isinya bukan galat program — semuanya adalah susunan yang berjalan
 * mulus dan tetap menghasilkan angka. Justru itu masalahnya: bobot yang
 * berjumlah 97 tidak pernah melempar apa pun, ia hanya diam-diam membuat
 * skor maksimal seseorang mustahil menyentuh 5.
 */
function temuan(
  jejak: any[], yatim: any[], insentif: any[], tierTabel: any[],
  berjalan: boolean,
) {
  const out: { nada: "bad" | "warn" | "info"; pesan: string }[] = [];
  const n = (v: any) => (v === null || v === undefined ? null : Number(v));

  for (const y of yatim) {
    out.push({
      nada: "bad",
      pesan: `"${y.indikator}" (${y.produk}) terdaftar untuk jabatan ini tapi tidak punya baris KPI di periode ini — jalankan hitung ulang, atau periksa apakah rumusnya gagal.`,
    });
  }

  // Bobot diperiksa per produk: pemegang jabatan MIX dinilai dua kali
  // dengan dua kumpulan bobot terpisah, jadi menjumlahkan semuanya
  // sekaligus akan selalu memberi angka ganda yang keliru.
  const perProduk = new Map<string, any[]>();
  for (const j of jejak) {
    const a = perProduk.get(j.produk) ?? []; a.push(j); perProduk.set(j.produk, a);
  }

  for (const [produk, rows] of perProduk) {
    const ikut = rows.filter((r) => r.peran === "kpi" || r.peran === "reguler");

    for (const [label, kol] of [["KPI", "bobot"], ["insentif", "bobot_insentif"]] as const) {
      const pakai = ikut.filter((r) => n(r[kol]) !== null);
      if (!pakai.length) continue;
      const total = pakai.reduce((a, r) => a + Number(r[kol]), 0);
      if (Math.abs(total - 100) > 0.01) {
        out.push({
          nada: "warn",
          pesan: `Total bobot ${label} produk ${produk} = ${total.toFixed(2)}, bukan 100. Skor akhir ikut bergeser sebesar selisihnya.`,
        });
      }
      const kosong = ikut.length - pakai.length;
      if (kosong > 0) {
        out.push({
          nada: "info",
          pesan: `${kosong} indikator ${produk} berperan kpi/reguler tanpa bobot ${label} — tidak ikut menyumbang skor.`,
        });
      }
    }

    // Hanya untuk periode berjalan. Di periode lampau, data_mentah sudah
    // tergantikan tarikan bulan-bulan sesudahnya, jadi nol di sana tidak
    // membuktikan apa pun tentang bahan yang dulu dipakai.
    const semuaKosong = rows.length > 0 && rows.every((r) => n(r.pencapaian) === null);
    const mentahNol = rows.every((r) => !r.baris_mentah);
    if (berjalan && semuaKosong && mentahNol) {
      out.push({
        nada: "bad",
        pesan: `Tidak ada satu pun baris data mentah produk ${produk} atas nama NIK ini. Periksa peran PIC indikator (staff/spv/bch) dan pemetaan NIK di data API — bukan rumusnya.`,
      });
    }
  }

  for (const j of jejak) {
    const nm = `"${j.indikator}" (${j.produk})`;

    if (!j.target_id && j.sumber === "api") {
      out.push({
        nada: "bad",
        pesan: `${nm} punya baris KPI tapi targetnya tidak ditemukan untuk jabatan "${j.jabatan}". Biasanya jabatan di baris KPI sudah berubah sejak baris itu dihitung.`,
      });
      continue;
    }

    if (!j.ada_pita && n(j.target_kpi3) === null && (j.peran === "kpi" || j.peran === "reguler")) {
      out.push({
        nada: "bad",
        pesan: `${nm} tidak punya pita maupun target KPI 3 — skornya tidak bisa dihitung sama sekali.`,
      });
    }

    // Pita bolong: nilai yang jatuh di celah antar pita mengembalikan
    // NULL, dan NULL terbaca sebagai "belum terhitung" di seluruh
    // aplikasi — persis menyamar sebagai masalah data.
    if (j.pita.length > 1) {
      const p = [...j.pita].sort((a: any, b: any) => a.urutan - b.urutan);
      for (let i = 1; i < p.length; i++) {
        const atas = n(p[i - 1].nilai_max), bawah = n(p[i].nilai_min);
        if (atas !== null && bawah !== null && Math.abs(atas - bawah) > 1e-9) {
          out.push({
            nada: atas < bawah ? "bad" : "warn",
            pesan: atas < bawah
              ? `${nm}: pita ke-${i} berhenti di ${atas} tapi pita berikutnya baru mulai di ${bawah} — nilai di celah itu tidak dapat skor.`
              : `${nm}: pita ke-${i} dan berikutnya bertumpang tindih di ${bawah}–${atas} — yang terpakai pita pertama yang cocok.`,
          });
        }
      }
    }

    if (j.peran === "nominal") {
      if (!j.ada_nominal) {
        out.push({
          nada: "bad",
          pesan: `${nm} berperan nominal tapi belum punya pita nominal — nominalnya selalu nol.`,
        });
      }
      for (const g of j.gerbang) {
        if (g.sumber_tak_terdaftar) {
          out.push({
            nada: "bad",
            pesan: `${nm}: syarat "${g.nama}" menunjuk indikator yang tidak terdaftar untuk jabatan+produk ini, jadi angkanya tidak akan pernah ada dan syaratnya selalu gagal.`,
          });
        } else if (n(g.ukur) === null) {
          out.push({
            nada: "warn",
            pesan: `${nm}: syarat "${g.nama}" tidak menemukan angka pembanding — dianggap gagal (menahan bayar, bukan meloloskan).`,
          });
        }
      }
    }

    const sk = n(j.skor_kpi);
    if (sk !== null && (sk > 5.0001 || sk < 0)) {
      out.push({
        nada: "warn",
        pesan: `${nm} berskor ${sk} — di luar rentang 0–5. Periksa poin pita; skor di atas 5 ikut menaikkan skor akhir melebihi batas.`,
      });
    }

    if (j.pemilih_id && !jejak.some((x) => x.indikator_id === j.pemilih_id && x.produk === j.produk)) {
      out.push({
        nada: "bad",
        pesan: `${nm} memakai indikator pemilih "${j.pemilih_nama ?? j.pemilih_id}" yang tidak punya baris di produk ini — nominalnya tidak akan ketemu.`,
      });
    }
  }

  for (const i of insentif) {
    const nm = `Insentif ${i.produk}`;
    if (!i.mekanisme) {
      out.push({
        nada: "bad",
        pesan: `${nm}: jabatan ini tidak punya baris Pagu Insentif untuk produk ${i.produk}. Tanpa itu nominalnya tidak pernah terbit.`,
      });
      continue;
    }
    if (i.pagu_aktif === false) {
      out.push({ nada: "warn", pesan: `${nm}: baris pagunya ada tapi nonaktif.` });
    }
    if (i.mekanisme === "tier") {
      if (n(i.tier) === null) {
        out.push({
          nada: "bad",
          pesan: `${nm}: mekanismenya tier, tapi tidak ada indikator berperan 'tier' yang menghasilkan angka tier. Nominalnya nol.`,
        });
      } else if (!i.kelas_cabang) {
        out.push({
          nada: "bad",
          pesan: `${nm}: kelas cabang ${i.cabang} belum ditetapkan untuk periode ini, jadi sel tabel tier tidak ketemu.`,
        });
      } else if (!tierTabel.some((t) =>
        t.produk === i.produk && String(t.tier) === String(i.tier) && t.kelas === i.kelas_cabang)) {
        out.push({
          nada: "bad",
          pesan: `${nm}: tidak ada baris di Tabel Tier untuk tier ${i.tier} × kelas ${i.kelas_cabang}. Nominalnya jatuh ke nol.`,
        });
      }
    }
    // Ambang untuk mekanisme pagu dinilai dari skor GABUNGAN seluruh produk
    // jabatan ini, bukan skor produk ini sendirian — kalau dinilai per produk,
    // orang yang jabatannya menghandle dua produk akan diberi peringatan
    // "di bawah ambang" padahal gabungannya lolos dan insentifnya cair.
    const gabungan = i.mekanisme === "pagu" && Number(i.jml_produk_gabungan ?? 1) > 1;
    const skorDinilai = gabungan ? n(i.skor_gabungan) : n(i.skor_insentif);
    const ambangDinilai = Number((gabungan ? i.ambang_gabungan : i.skor_minimal) ?? 0);

    if (i.mekanisme === "pagu" && skorDinilai !== null && skorDinilai < ambangDinilai) {
      out.push({
        nada: "info",
        pesan: gabungan
          ? `${nm}: skor gabungan ${skorDinilai.toFixed(2)} dari ${i.jml_produk_gabungan} produk di bawah ambang ${ambangDinilai} — nol ini memang sesuai aturan, bukan kesalahan susunan.`
          : `${nm}: skor ${i.skor_insentif} di bawah ambang ${i.skor_minimal} — nol ini memang sesuai aturan, bukan kesalahan susunan.`,
      });
    }

    // Baris pagu satu jabatan yang tidak seragam antarproduk: mesin memakai
    // angka terbesar, jadi selisihnya perlu disadari admin, bukan diam-diam
    // menentukan nominal yang dibayarkan.
    if (gabungan) {
      if (Number(i.pagu_gabungan) !== Number(i.pagu_min)) {
        out.push({
          nada: "warn",
          pesan: `${nm}: pagu jabatan ini beda-beda antarproduk (${Number(i.pagu_min).toLocaleString('id-ID')} s/d ${Number(i.pagu_gabungan).toLocaleString('id-ID')}). Karena satu orang hanya punya satu pagu, mesin memakai yang terbesar — samakan baris Pagu Insentif untuk semua produk jabatan ini kalau itu bukan yang dimaksud.`,
        });
      }
      if (Number(i.pembagi_gabungan) !== Number(i.pembagi_min)) {
        out.push({
          nada: "warn",
          pesan: `${nm}: pembagi jabatan ini beda-beda antarproduk (${i.pembagi_min} s/d ${i.pembagi_gabungan}). Mesin memakai yang terbesar — samakan baris Pagu Insentif untuk semua produk jabatan ini.`,
        });
      }
      if (Number(i.ambang_gabungan) !== Number(i.ambang_min)) {
        out.push({
          nada: "warn",
          pesan: `${nm}: ambang minimal jabatan ini beda-beda antarproduk (${i.ambang_min} s/d ${i.ambang_gabungan}). Mesin memakai yang terbesar untuk menilai skor gabungan.`,
        });
      }
    }
  }

  return out;
}
