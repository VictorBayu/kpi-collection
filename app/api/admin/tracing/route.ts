import { requireAdmin, handler, HttpError } from "@/lib/auth";
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
  SELECT k.id, k.indikator_id, k.indikator, k.produk, k.satuan, k.catatan,
         k.pencapaian, k.skor_kpi, k.bobot, k.skor_terbobot,
         k.bobot_insentif, k.skor_terbobot_ins,
         k.target_kpi3, k.target_kpi4, k.target_kpi5,
         k.peran, k.jenis_nilai, k.nilai_efek,
         k.nominal_baris, k.gerbang_gagal,
         k.jabatan, k.cabang, k.sumber, k.dihitung_pada,
         d.peran_pic, d.kali_seratus, d.aktif AS indikator_aktif,
         t.id AS target_id, t.alias, t.aktif AS target_aktif, t.pemilih_id,
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
  await requireAdmin();
  const u = new URL(req.url);
  const nik = (u.searchParams.get("nik") ?? "").trim();
  const periodeMinta = (u.searchParams.get("periode") ?? "").trim();

  // Daftar periode selalu dikirim supaya pemilih periode terisi bahkan
  // saat NIK belum diketik.
  const periodeList = await q<{ periode: string }>(
    `SELECT DISTINCT periode FROM kpi_row ORDER BY periode DESC LIMIT 18`);
  // toISODate(), bukan String(date).slice(0,10) — driver mengembalikan
  // periode sebagai objek Date, dan String(Date) menghasilkan teks
  // seperti "Tue Sep 01 2026 ..." yang terpotong jadi "Tue Sep 01" tanpa
  // tahun. Teks itu lolos ke Response.json() sebagai string biasa, lalu
  // di klien di-parse ulang oleh `new Date(...)` sebagai fallback —
  // yang oleh mesin JS diperlakukan sebagai tanggal tanpa tahun dan
  // dibulatkan ke tahun rujukan 2001.
  const periode = periodeMinta ||
    (periodeList[0] ? toISODate(periodeList[0].periode) : "");

  if (!nik) return Response.json({ periodeList, periode, kosong: true });

  const [orang] = await q<any>(
    `SELECT u.nik, u.nama, u.jabatan, u.cabang, u.area, u.aktif,
            norm_jabatan(u.jabatan) AS alias
       FROM app_user u WHERE u.nik = $1`, [nik]);
  if (!orang) throw new HttpError(404, `NIK ${nik} tidak ada di daftar pengguna.`);
  if (!periode) throw new HttpError(400, "Belum ada periode KPI sama sekali.");

  const [baris, yatim] = await Promise.all([
    q<Baris>(SQL_BARIS, [nik, periode]),
    q<any>(SQL_TARGET_YATIM, [nik, periode]),
  ]);

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
      targetIds.length
        ? q<any>(
            `SELECT g.target_id, g.urutan, g.operator, g.nilai, g.sumber_id,
                    COALESCE(NULLIF(BTRIM(g.label), ''), d.nama, 'Syarat') AS nama,
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
               LEFT JOIN indikator_def d ON d.id = g.sumber_id
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
        `SELECT i.produk, i.kategori, i.jabatan, i.cabang,
                i.skor_insentif, i.tier, i.kelas_cabang,
                i.nominal_dasar, i.nominal_reward, i.nominal_penalty, i.nominal,
                i.keterangan, i.sumber, i.dihitung_pada,
                g.mekanisme, g.nominal AS pagu_nominal,
                g.skor_minimal, g.pembagi, g.aktif AS pagu_aktif
           FROM insentif_row i
           LEFT JOIN insentif_pagu g
                  ON g.alias = norm_jabatan(i.jabatan) AND g.produk = i.produk
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

  const jejak = await Promise.all(baris.map(async (b) => {
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
      // Hanya untuk periode berjalan — lihat alasan `berjalan` di atas.
      contoh_bahan: berjalan
        ? await contohBahan(pic, nik, String(b.produk ?? ""), komponenIndikator[0])
        : null,
    };
  }));

  return Response.json({
    periodeList, periode, orang, periode_berjalan: berjalan,
    jejak, yatim, insentif, tier_tabel: tierTabel,
    mentah,
    temuan: temuan(jejak, yatim, insentif, tierTabel, berjalan),
  });
});

/** Nama kolom lolos pola ini SEBELUM ditempel ke SQL — lihat lib/rumus.ts. */
const POLA_KOLOM = /^[a-z][a-z0-9_]{0,50}$/;

/**
 * Contoh baris data_mentah yang menjadi bahan satu komponen rumus.
 *
 * "Bahan yang masuk kategori" tidak terlihat dari kalimat rumus saja —
 * admin perlu melihat baris sungguhan untuk memastikan penyaringannya
 * (jabatan -> kolom nik_staff/spv/bch, dan syarat komponen) benar-benar
 * mengenai kontrak yang seharusnya. Karena itu potongan WHERE di sini
 * SENGAJA ditulis dengan pola yang sama seperti `potonganSyarat` di
 * lib/rumus.ts (operator, placeholder, ANY(...) untuk larik) — bukan
 * versi tersendiri yang berisiko diam-diam berbeda hasil dari mesin
 * hitung yang sesungguhnya.
 *
 * Hanya komponen PERTAMA yang ditelusuri. Untuk formula bersusun
 * (A - B, dst.) ini cukup mewakili kasus paling umum tanpa membuat
 * satu halaman menelusuri semua sisi rumus sekaligus.
 */
async function contohBahan(
  pic: "staff" | "spv" | "bch", nik: string, produk: string, komponen: any,
): Promise<{ kolom_label: string | null; kolom: string | null; baris: any[]; syarat_kolom: string[] } | null> {
  if (!komponen) return null;
  const kolomNik = `nik_${pic}`;

  const kolomUtama: string | null = komponen.kolom;
  if (kolomUtama && !POLA_KOLOM.test(kolomUtama)) return null;

  const syaratList: { kolom: string; label: string; operator: string; nilai: string[] }[] =
    komponen.syarat ?? [];
  for (const s of syaratList) {
    if (!POLA_KOLOM.test(s.kolom)) return null;
  }

  const params: any[] = [nik, produk];
  const kolomTampil = [
    "agreement_no",
    ...(kolomUtama ? [kolomUtama] : []),
    ...syaratList.map((s) => s.kolom),
  ];
  const unik = [...new Set(kolomTampil)];
  const select = unik.map((k) => `"${k}"`).join(", ");

  const potongan = (s: { kolom: string; operator: string; nilai: string[] }) => {
    const kolomSql = `"${s.kolom}"`;
    const p = (v: any) => { params.push(v); return `$${params.length}`; };
    const satu = () => s.nilai[0] ?? "";
    switch (s.operator) {
      case "kosong": return `(${kolomSql} IS NULL OR ${kolomSql}::text = '')`;
      case "terisi": return `(${kolomSql} IS NOT NULL AND ${kolomSql}::text <> '')`;
      case "sama": return `${kolomSql}::text = ${p(satu())}`;
      case "tidak_sama": return `(${kolomSql} IS NULL OR ${kolomSql}::text <> ${p(satu())})`;
      case "termasuk": return `${kolomSql}::text = ANY(${p(s.nilai)}::text[])`;
      case "tidak_termasuk": return `(${kolomSql} IS NULL OR NOT (${kolomSql}::text = ANY(${p(s.nilai)}::text[])))`;
      case "mengandung": return `${kolomSql}::text ILIKE ${p("%" + satu() + "%")}`;
      case "lebih": return `${kolomSql} > ${p(satu())}`;
      case "lebih_sama": return `${kolomSql} >= ${p(satu())}`;
      case "kurang": return `${kolomSql} < ${p(satu())}`;
      case "kurang_sama": return `${kolomSql} <= ${p(satu())}`;
      case "antara": return `${kolomSql} BETWEEN ${p(s.nilai[0] ?? "")} AND ${p(s.nilai[1] ?? "")}`;
      default: return "true";
    }
  };

  const lulusExpr = syaratList.length
    ? `(${syaratList.map(potongan).join(komponen.gabung_syarat === "atau" ? " OR " : " AND ")})`
    : "true";

  const sql = `
    SELECT ${select}, (${lulusExpr}) AS lulus_syarat
      FROM data_mentah
     WHERE "${kolomNik}" = $1
       AND upper(btrim(COALESCE(product,''))) = upper($2)
     ORDER BY id DESC
     LIMIT 15`;

  const rows = await q<any>(sql, params);
  return {
    kolom_label: kolomUtama ?? null,
    kolom: kolomUtama,
    syarat_kolom: syaratList.map((s) => s.kolom),
    baris: rows,
  };
}

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
    if (i.mekanisme === "pagu" && n(i.skor_insentif) !== null &&
        Number(i.skor_insentif) < Number(i.skor_minimal ?? 0)) {
      out.push({
        nada: "info",
        pesan: `${nm}: skor ${i.skor_insentif} di bawah ambang ${i.skor_minimal} — nol ini memang sesuai aturan, bukan kesalahan susunan.`,
      });
    }
  }

  return out;
}
