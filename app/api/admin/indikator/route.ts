import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { daftarSumber } from "@/lib/sumber";
import { ujiRumus } from "@/lib/hitung-indikator";
import { RumusSalah, type Komponen } from "@/lib/rumus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AGREGAT = ["SUM","COUNT","COUNT_DISTINCT","AVG","MIN","MAX"];
const OPERATOR = ["sama","tidak_sama","termasuk","tidak_termasuk","mengandung",
                  "lebih","lebih_sama","kurang","kurang_sama","antara","kosong","terisi"];
const PERAN = ["staff","spv","bch"];
const PERAN_TARGET = ["kpi","reguler","reward","penalty","tier","nominal","pendukung"];
const JENIS_NILAI = ["nominal","persen"];
const OP_GERBANG = ["lebih","lebih_sama","kurang","kurang_sama","sama"];

/**
 * Membaca definisi indikator dari badan permintaan, sekaligus memeriksanya.
 *
 * Pemeriksaan dilakukan di sini, bukan diserahkan ke constraint database,
 * karena pesan galat dari Postgres ("violates check constraint
 * ck_komponen_kolom") tidak berarti apa-apa bagi admin yang sedang menyusun
 * rumus di layar.
 */
function bacaKomponen(raw: any): Komponen[] {
  if (!Array.isArray(raw) || !raw.length) {
    throw new HttpError(400, "Rumus belum punya komponen.");
  }
  return raw.map((k: any, i: number) => {
    const agregat = String(k.agregat ?? "SUM").toUpperCase();
    if (!AGREGAT.includes(agregat)) {
      throw new HttpError(400, `Agregat "${agregat}" tidak dikenal.`);
    }
    const kolom = k.kolom ? String(k.kolom) : null;
    if (agregat !== "COUNT" && !kolom) {
      throw new HttpError(400, `Komponen ke-${i + 1}: ${agregat} butuh kolom sumber.`);
    }
    const op = k.operator_sebelum ? String(k.operator_sebelum) : null;
    if (i > 0 && !["+","-","*","/"].includes(op ?? "")) {
      throw new HttpError(400, `Komponen ke-${i + 1} belum punya operator penghubung.`);
    }

    const syarat = (Array.isArray(k.syarat) ? k.syarat : []).map((s: any) => {
      const operator = String(s.operator ?? "sama");
      if (!OPERATOR.includes(operator)) {
        throw new HttpError(400, `Operator syarat "${operator}" tidak dikenal.`);
      }
      const nilai = (Array.isArray(s.nilai) ? s.nilai : [s.nilai])
        .filter((v: any) => v !== null && v !== undefined && String(v) !== "")
        .map((v: any) => String(v));

      if (!["kosong","terisi"].includes(operator) && !nilai.length) {
        throw new HttpError(400, `Syarat pada komponen ke-${i + 1} belum diisi nilainya.`);
      }
      if (operator === "antara" && nilai.length < 2) {
        throw new HttpError(400, `Syarat "antara" butuh dua nilai.`);
      }
      if (!s.kolom) throw new HttpError(400, `Syarat pada komponen ke-${i + 1} belum pilih kolom.`);

      return { kolom: String(s.kolom), operator, nilai };
    });

    // Bobot pengakuan: nilai → persen. Baris tanpa nilai diabaikan (admin
    // menambah baris kosong lalu belum mengisinya), tapi persen yang bukan
    // angka ditolak — lebih baik gagal terang-terangan daripada diam-diam
    // menghitung nol.
    const pengakuanKolom = k.pengakuan_kolom ? String(k.pengakuan_kolom) : null;
    const pengakuan = (Array.isArray(k.pengakuan) ? k.pengakuan : [])
      .filter((b: any) => b && String(b.nilai ?? "").trim() !== "")
      .map((b: any) => {
        const persen = Number(b.persen);
        if (!Number.isFinite(persen)) {
          throw new HttpError(400,
            `Persen pengakuan untuk "${b.nilai}" pada komponen ke-${i + 1} bukan angka.`);
        }
        if (persen < 0 || persen > 1000) {
          throw new HttpError(400,
            `Persen pengakuan untuk "${b.nilai}" harus antara 0 dan 1000.`);
        }
        return { nilai: String(b.nilai).trim(), persen };
      });

    if (pengakuan.length && !pengakuanKolom) {
      throw new HttpError(400,
        `Komponen ke-${i + 1}: bobot pengakuan sudah diisi tapi kolom penentunya belum dipilih.`);
    }
    if (pengakuan.length && !["SUM", "AVG"].includes(agregat)) {
      throw new HttpError(400,
        `Komponen ke-${i + 1}: bobot pengakuan hanya bisa dipakai pada SUM atau AVG.`);
    }
    // Nilai ganda membuat cabang CASE kedua tidak pernah tercapai —
    // gejalanya angka yang tidak sesuai harapan tanpa pesan galat apa pun.
    const ganda = pengakuan.map((b: { nilai: string }) => b.nilai)
      .filter((v: string, idx: number, arr: string[]) => arr.indexOf(v) !== idx);
    if (ganda.length) {
      throw new HttpError(400,
        `Komponen ke-${i + 1}: nilai "${ganda[0]}" didaftarkan lebih dari sekali.`);
    }

    return {
      agregat, kolom,
      operator_sebelum: i === 0 ? null : op,
      gabung_syarat: k.gabung_syarat === "atau" ? "atau" as const : "dan" as const,
      syarat,
      pengakuan_kolom: pengakuanKolom,
      pengakuan,
    };
  });
}

/** Daftar indikator, katalog kolom, dan bahan pengisi dropdown. */
export const GET = handler(async (req) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get("id");

  if (!id) {
    const [daftar, kolom, produk, jabatan, sumber] = await Promise.all([
      q<any>(
        `SELECT d.id, d.nama, d.satuan, d.kali_seratus, d.peran_pic, d.aktif,
                (SELECT COUNT(*)::int FROM indikator_komponen k WHERE k.indikator_id = d.id) AS komponen,
                (SELECT COUNT(*)::int FROM indikator_target t WHERE t.indikator_id = d.id AND t.aktif) AS terdaftar
           FROM indikator_def d ORDER BY d.nama`),
      q<any>(`SELECT kolom, label, jenis, agregat, kelompok
                     , COALESCE(sumber,'api') AS sumber
                FROM mentah_kolom
               WHERE COALESCE(aktif, true)
               ORDER BY urutan, label`),
      q<any>(`SELECT kode, nama FROM produk_master WHERE aktif ORDER BY urutan, kode`),
      // Semua alias jabatan yang dikenal, bukan hanya yang sudah dipetakan
      // ke produk. Kalau dibatasi ke jabatan_produk, daftarnya kosong
      // sebelum pemetaan produk diisi dan admin mengira fiturnya rusak.
      q<any>(
        `SELECT alias FROM jabatan_alias
         UNION
         SELECT DISTINCT norm_jabatan(jabatan) AS alias
           FROM app_user
          WHERE jabatan IS NOT NULL AND btrim(jabatan) <> ''
         ORDER BY alias`),
      daftarSumber(),
    ]);
    // Sumber ikut dikirim supaya pembangun indikator bisa menyaring daftar
    // kolom mengikuti sumber tambahan yang dipilih.
    return Response.json({
      daftar, kolom, produk, jabatan,
      sumber: sumber.map((s) => ({
        kode: s.kode, nama: s.nama, jenis: s.jenis, keterangan: s.keterangan,
      })),
    });
  }

  const [def] = await q<any>(
    `SELECT id, nama, deskripsi, satuan, kali_seratus, peran_pic, aktif, sumber_kode
       FROM indikator_def WHERE id = $1`, [id]);
  if (!def) throw new HttpError(404, "Indikator tidak ditemukan.");

  const komponen = await q<any>(
    `SELECT id, urutan, label, agregat, kolom, operator_sebelum, gabung_syarat,
            pengakuan_kolom
       FROM indikator_komponen WHERE indikator_id = $1 ORDER BY urutan`, [id]);

  const [syarat, pengakuan] = komponen.length
    ? await Promise.all([
        q<any>(
          `SELECT id, komponen_id, urutan, kolom, operator, nilai
             FROM indikator_syarat WHERE komponen_id = ANY($1::uuid[]) ORDER BY urutan`,
          [komponen.map((k) => k.id)]),
        q<any>(
          `SELECT id, komponen_id, urutan, nilai, persen
             FROM indikator_pengakuan WHERE komponen_id = ANY($1::uuid[]) ORDER BY urutan`,
          [komponen.map((k) => k.id)]),
      ])
    : [[], []];

  const target = await q<any>(
    `SELECT id, alias, produk, peran, jenis_nilai, nilai_efek, pemilih_id,
            bobot_kpi, bobot_insentif,
            target_kpi3, target_kpi4, target_kpi5, aktif
       FROM indikator_target WHERE indikator_id = $1 ORDER BY alias, produk`, [id]);

  const ids = target.map((t) => t.id);
  const [pita, nominal, gerbang] = await Promise.all([
    ids.length
      ? q<any>(
          `SELECT id, target_id, urutan, nilai_min, nilai_max, poin_min, poin_max
             FROM indikator_pita WHERE target_id = ANY($1::uuid[]) ORDER BY target_id, urutan`,
          [ids])
      : Promise.resolve([]),
    ids.length
      ? q<any>(
          `SELECT id, target_id, urutan, nilai_min, nilai_max, nominal
             FROM indikator_nominal WHERE target_id = ANY($1::uuid[]) ORDER BY target_id, urutan`,
          [ids])
      : Promise.resolve([]),
    ids.length
      ? q<any>(
          `SELECT id, target_id, urutan, label, sumber_id, operator, nilai
             FROM indikator_gerbang WHERE target_id = ANY($1::uuid[]) ORDER BY target_id, urutan`,
          [ids])
      : Promise.resolve([]),
  ]);

  // Daftar indikator lain (bahan gerbang/pemilih pita) tidak dikirim dari
  // sini: klien menurunkannya dari daftar di panel kiri, supaya selalu
  // terisi bahkan saat menyusun indikator baru yang belum tersimpan.
  return Response.json({
    def,
    komponen: komponen.map((k) => ({
      ...k,
      syarat: syarat.filter((s) => s.komponen_id === k.id),
      pengakuan: pengakuan
        .filter((b) => b.komponen_id === k.id)
        .map((b) => ({ nilai: b.nilai, persen: Number(b.persen) })),
    })),
    target: target.map((t) => ({
      ...t,
      pita: pita.filter((p) => p.target_id === t.id),
      nominal: nominal.filter((n) => n.target_id === t.id),
      gerbang: gerbang.filter((g) => g.target_id === t.id),
    })),
  });
});

/**
 * Menyimpan satu indikator utuh: definisi, komponen, syarat, pendaftaran.
 *
 * Semuanya diganti, bukan ditambal. Menyusun rumus itu pekerjaan iteratif —
 * admin menghapus kartu, menyisipkan di tengah, menukar urutan — dan
 * mencocokkan mana yang baru, berubah, atau hilang di sisi server hanya
 * menambah cara untuk gagal. Menghapus lalu menulis ulang selalu
 * menghasilkan keadaan yang persis seperti di layar.
 */
export const POST = handler(async (req) => {
  const admin = await requireAdmin();
  const b = await req.json();

  const nama = String(b.nama ?? "").trim();
  if (!nama) throw new HttpError(400, "Nama indikator belum diisi.");

  const peran = PERAN.includes(b.peran_pic) ? b.peran_pic : "staff";
  const satuan = ["rupiah","persen","unit"].includes(b.satuan) ? b.satuan : "rupiah";
  const komponen = bacaKomponen(b.komponen);

  /**
   * Sumber tambahan yang dipakai indikator ini.
   *
   * Diperiksa terhadap registri, bukan dipercaya apa adanya: kode yang
   * tidak terdaftar akan ditolak kunci asing di database dengan pesan
   * yang tidak berarti apa-apa bagi admin.
   *
   * Yang dipilih hanyalah sumber TAMBAHAN — kolom data utama selalu
   * tersedia, karena di sanalah NIK PIC, cabang, dan produk berada dan
   * tanpa ketiganya tidak ada indikator yang bisa dihitung untuk siapa
   * pun.
   */
  let sumberKode: string | null = b.sumber_kode ? String(b.sumber_kode) : null;
  if (sumberKode) {
    const daftar = await daftarSumber();
    const s = daftar.find((x) => x.kode === sumberKode);
    if (!s) throw new HttpError(400, `Sumber data "${sumberKode}" tidak terdaftar.`);
    if (s.jenis === "utama") sumberKode = null;
  }

  let id: string = b.id ?? "";

  if (id) {
    const [ada] = await q<any>(`SELECT 1 FROM indikator_def WHERE id = $1`, [id]);
    if (!ada) throw new HttpError(404, "Indikator tidak ditemukan.");
    await q(
      `UPDATE indikator_def
          SET nama=$2, deskripsi=$3, satuan=$4, kali_seratus=$5,
              peran_pic=$6, aktif=$7, sumber_kode=$8, diubah_pada=now()
        WHERE id=$1`,
      [id, nama, b.deskripsi ?? null, satuan, !!b.kali_seratus, peran,
       b.aktif !== false, sumberKode]);
  } else {
    const [baru] = await q<any>(
      `INSERT INTO indikator_def
         (nama, deskripsi, satuan, kali_seratus, peran_pic, aktif, sumber_kode)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [nama, b.deskripsi ?? null, satuan, !!b.kali_seratus, peran,
       b.aktif !== false, sumberKode]);
    id = baru.id;
  }

  // Komponen dihapus berantai ke syaratnya lewat ON DELETE CASCADE.
  await q(`DELETE FROM indikator_komponen WHERE indikator_id = $1`, [id]);

  for (let i = 0; i < komponen.length; i++) {
    const k = komponen[i];
    const [kb] = await q<any>(
      `INSERT INTO indikator_komponen
         (indikator_id, urutan, label, agregat, kolom, operator_sebelum,
          gabung_syarat, pengakuan_kolom)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [id, i, b.komponen[i]?.label ?? null, k.agregat, k.kolom,
       k.operator_sebelum, k.gabung_syarat,
       k.pengakuan?.length ? k.pengakuan_kolom : null]);

    for (let j = 0; j < k.syarat.length; j++) {
      const s = k.syarat[j];
      await q(
        `INSERT INTO indikator_syarat (komponen_id, urutan, kolom, operator, nilai)
         VALUES ($1,$2,$3,$4,$5)`,
        [kb.id, j, s.kolom, s.operator, s.nilai]);
    }

    for (let j = 0; j < (k.pengakuan?.length ?? 0); j++) {
      const bb = k.pengakuan![j];
      await q(
        `INSERT INTO indikator_pengakuan (komponen_id, urutan, nilai, persen)
         VALUES ($1,$2,$3,$4)`,
        [kb.id, j, bb.nilai, bb.persen]);
    }
  }

  // Pendaftaran ke jabatan+produk, juga diganti utuh. Pita ikut dihapus
  // berantai lewat ON DELETE CASCADE saat baris target-nya dihapus, jadi
  // cukup ditulis ulang di sini seperti komponen di atas.
  if (Array.isArray(b.target)) {
    await q(`DELETE FROM indikator_target WHERE indikator_id = $1`, [id]);
    for (const t of b.target) {
      const alias = String(t.alias ?? "").trim().toUpperCase();
      const produk = String(t.produk ?? "").trim().toUpperCase();
      if (!alias || !produk) continue;
      // Kosong disimpan sebagai NULL, bukan nol. Bobot kosong berarti
      // indikator ini memang tidak ikut skema tersebut — berbeda dari
      // ikut dinilai tapi berbobot nol.
      const angkaAtauNull = (v: unknown) =>
        v === "" || v === null || v === undefined ? null : Number(v);

      const peranTarget = PERAN_TARGET.includes(t.peran) ? t.peran : "kpi";
      const jenisNilai = JENIS_NILAI.includes(t.jenis_nilai) ? t.jenis_nilai : null;

      const [tb] = await q<any>(
        `INSERT INTO indikator_target
           (indikator_id, alias, produk, peran, jenis_nilai, nilai_efek, pemilih_id,
            bobot_kpi, bobot_insentif,
            target_kpi3, target_kpi4, target_kpi5, aktif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (indikator_id, alias, produk) DO UPDATE
           SET peran=EXCLUDED.peran,
               jenis_nilai=EXCLUDED.jenis_nilai,
               nilai_efek=EXCLUDED.nilai_efek,
               pemilih_id=EXCLUDED.pemilih_id,
               bobot_kpi=EXCLUDED.bobot_kpi,
               bobot_insentif=EXCLUDED.bobot_insentif,
               target_kpi3=EXCLUDED.target_kpi3,
               target_kpi4=EXCLUDED.target_kpi4, target_kpi5=EXCLUDED.target_kpi5,
               aktif=EXCLUDED.aktif, updated_at=now()
         RETURNING id`,
        [id, alias, produk, peranTarget, jenisNilai,
         angkaAtauNull(t.nilai_efek),
         t.pemilih_id ? String(t.pemilih_id) : null,
         angkaAtauNull(t.bobot_kpi),
         angkaAtauNull(t.bobot_insentif),
         angkaAtauNull(t.target_kpi3),
         angkaAtauNull(t.target_kpi4),
         angkaAtauNull(t.target_kpi5),
         t.aktif !== false]);

      // Pita nominal dan gerbang hanya berlaku pada peran 'nominal'.
      // Menyimpannya untuk peran lain akan membuat baris yatim yang tidak
      // pernah dibaca siapa pun tapi tetap muncul saat peran diganti.
      if (peranTarget === "nominal") {
        for (let i = 0; i < (Array.isArray(t.nominal) ? t.nominal : []).length; i++) {
          const n = t.nominal[i];
          const rp = angkaAtauNull(n.nominal);
          if (rp === null) continue;
          const bMin = angkaAtauNull(n.nilai_min);
          const bMax = angkaAtauNull(n.nilai_max);
          if (bMin !== null && bMax !== null && bMax < bMin) {
            throw new HttpError(400,
              `Pita nominal ke-${i + 1}: batas atas lebih kecil daripada batas bawah.`);
          }
          await q(
            `INSERT INTO indikator_nominal (target_id, urutan, nilai_min, nilai_max, nominal)
             VALUES ($1,$2,$3,$4,$5)`, [tb.id, i, bMin, bMax, rp]);
        }

        for (let i = 0; i < (Array.isArray(t.gerbang) ? t.gerbang : []).length; i++) {
          const g = t.gerbang[i];
          const nilai = angkaAtauNull(g.nilai);
          if (nilai === null) continue;
          const op = OP_GERBANG.includes(g.operator) ? g.operator : "lebih_sama";
          await q(
            `INSERT INTO indikator_gerbang
               (target_id, urutan, label, sumber_id, operator, nilai)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [tb.id, i, g.label ? String(g.label).trim() || null : null,
             g.sumber_id ? String(g.sumber_id) : null, op, nilai]);
        }
      }

      if (Array.isArray(t.pita) && t.pita.length) {
        for (let i = 0; i < t.pita.length; i++) {
          const p = t.pita[i];
          const poinMin = angkaAtauNull(p.poin_min);
          const poinMax = angkaAtauNull(p.poin_max);
          if (poinMin === null || poinMax === null) continue;
          await q(
            `INSERT INTO indikator_pita
               (target_id, urutan, nilai_min, nilai_max, poin_min, poin_max)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [tb.id, i, angkaAtauNull(p.nilai_min), angkaAtauNull(p.nilai_max), poinMin, poinMax]);
        }
      }
    }
  }

  await auditLog(admin.sub, "indikator.simpan", nama, { id, komponen: komponen.length });
  return Response.json({ ok: true, id });
});

/**
 * Menjalankan rumus atas data mentah tanpa menyimpan hasilnya.
 *
 * Ada supaya admin bisa melihat angka sungguhan dari beberapa orang
 * sebelum mendaftarkan rumus ke puluhan jabatan. Tanpa ini, kesalahan
 * rumus baru ketahuan setelah semua orang melihat angkanya di dasbor.
 */
export const PATCH = handler(async (req) => {
  await requireAdmin();
  const b = await req.json();
  try {
    const hasil = await ujiRumus(
      bacaKomponen(b.komponen),
      !!b.kali_seratus,
      PERAN.includes(b.peran_pic) ? b.peran_pic : "staff",
      b.produk ? String(b.produk).toUpperCase() : null,
    );
    return Response.json(hasil);
  } catch (e) {
    if (e instanceof RumusSalah) throw new HttpError(400, e.message);
    throw e;
  }
});

export const DELETE = handler(async (req) => {
  const admin = await requireAdmin();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "Indikator belum dipilih.");

  // Indikator yang dipakai sebagai syarat atau pemilih pita tidak boleh
  // hilang begitu saja: syaratnya akan lenyap dan nominal mulai cair tanpa
  // penahan. Basis data sudah menolaknya lewat RESTRICT, tapi pesan
  // Postgres tidak memberi tahu indikator mana yang memakainya — itu yang
  // sebenarnya perlu diketahui admin untuk bisa membereskannya.
  const pemakai = await q<any>(
    `SELECT DISTINCT d.nama
       FROM indikator_target t
       JOIN indikator_def d ON d.id = t.indikator_id
      WHERE t.pemilih_id = $1
      UNION
     SELECT DISTINCT d.nama
       FROM indikator_gerbang g
       JOIN indikator_target t ON t.id = g.target_id
       JOIN indikator_def d ON d.id = t.indikator_id
      WHERE g.sumber_id = $1`, [id]);

  if (pemakai.length) {
    throw new HttpError(400,
      `Masih dipakai sebagai syarat atau pemilih nominal oleh: ` +
      `${pemakai.map((p) => p.nama).join(", ")}. Lepaskan dulu di sana.`);
  }

  // Baris KPI yang sudah terlanjur dihitung ikut dibuang; kalau ditinggal,
  // dasbor akan terus menampilkan indikator yang definisinya sudah hilang
  // dan tidak bisa lagi diperiksa asal angkanya.
  await q(`DELETE FROM kpi_row WHERE indikator_id = $1 AND sumber = 'api'`, [id]);
  await q(`DELETE FROM indikator_def WHERE id = $1`, [id]);
  await auditLog(admin.sub, "indikator.hapus", id);
  return Response.json({ ok: true });
});
