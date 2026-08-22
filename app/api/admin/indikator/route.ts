import { requireAdmin, handler, HttpError } from "@/lib/auth";
import { q, auditLog } from "@/lib/db";
import { ujiRumus } from "@/lib/hitung-indikator";
import { RumusSalah, type Komponen } from "@/lib/rumus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AGREGAT = ["SUM","COUNT","COUNT_DISTINCT","AVG","MIN","MAX"];
const OPERATOR = ["sama","tidak_sama","termasuk","tidak_termasuk","mengandung",
                  "lebih","lebih_sama","kurang","kurang_sama","antara","kosong","terisi"];
const PERAN = ["staff","spv","bch"];
const PERAN_TARGET = ["kpi","reguler","reward","penalty","tier"];
const JENIS_NILAI = ["nominal","persen"];

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

    return {
      agregat, kolom,
      operator_sebelum: i === 0 ? null : op,
      gabung_syarat: k.gabung_syarat === "atau" ? "atau" as const : "dan" as const,
      syarat,
    };
  });
}

/** Daftar indikator, katalog kolom, dan bahan pengisi dropdown. */
export const GET = handler(async (req) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get("id");

  if (!id) {
    const [daftar, kolom, produk, jabatan] = await Promise.all([
      q<any>(
        `SELECT d.id, d.nama, d.satuan, d.kali_seratus, d.peran_pic, d.aktif,
                (SELECT COUNT(*)::int FROM indikator_komponen k WHERE k.indikator_id = d.id) AS komponen,
                (SELECT COUNT(*)::int FROM indikator_target t WHERE t.indikator_id = d.id AND t.aktif) AS terdaftar
           FROM indikator_def d ORDER BY d.nama`),
      q<any>(`SELECT kolom, label, jenis, agregat, kelompok
                FROM mentah_kolom ORDER BY urutan, label`),
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
    ]);
    return Response.json({ daftar, kolom, produk, jabatan });
  }

  const [def] = await q<any>(
    `SELECT id, nama, deskripsi, satuan, kali_seratus, peran_pic, aktif
       FROM indikator_def WHERE id = $1`, [id]);
  if (!def) throw new HttpError(404, "Indikator tidak ditemukan.");

  const komponen = await q<any>(
    `SELECT id, urutan, label, agregat, kolom, operator_sebelum, gabung_syarat
       FROM indikator_komponen WHERE indikator_id = $1 ORDER BY urutan`, [id]);

  const syarat = komponen.length
    ? await q<any>(
        `SELECT id, komponen_id, urutan, kolom, operator, nilai
           FROM indikator_syarat WHERE komponen_id = ANY($1::uuid[]) ORDER BY urutan`,
        [komponen.map((k) => k.id)])
    : [];

  const target = await q<any>(
    `SELECT id, alias, produk, peran, jenis_nilai, nilai_efek,
            bobot_kpi, bobot_insentif,
            target_kpi3, target_kpi4, target_kpi5, aktif
       FROM indikator_target WHERE indikator_id = $1 ORDER BY alias, produk`, [id]);

  const pita = target.length
    ? await q<any>(
        `SELECT id, target_id, urutan, nilai_min, nilai_max, poin_min, poin_max
           FROM indikator_pita WHERE target_id = ANY($1::uuid[]) ORDER BY target_id, urutan`,
        [target.map((t) => t.id)])
    : [];

  return Response.json({
    def,
    komponen: komponen.map((k) => ({
      ...k, syarat: syarat.filter((s) => s.komponen_id === k.id),
    })),
    target: target.map((t) => ({
      ...t, pita: pita.filter((p) => p.target_id === t.id),
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

  let id: string = b.id ?? "";

  if (id) {
    const [ada] = await q<any>(`SELECT 1 FROM indikator_def WHERE id = $1`, [id]);
    if (!ada) throw new HttpError(404, "Indikator tidak ditemukan.");
    await q(
      `UPDATE indikator_def
          SET nama=$2, deskripsi=$3, satuan=$4, kali_seratus=$5,
              peran_pic=$6, aktif=$7, diubah_pada=now()
        WHERE id=$1`,
      [id, nama, b.deskripsi ?? null, satuan, !!b.kali_seratus, peran, b.aktif !== false]);
  } else {
    const [baru] = await q<any>(
      `INSERT INTO indikator_def (nama, deskripsi, satuan, kali_seratus, peran_pic, aktif)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [nama, b.deskripsi ?? null, satuan, !!b.kali_seratus, peran, b.aktif !== false]);
    id = baru.id;
  }

  // Komponen dihapus berantai ke syaratnya lewat ON DELETE CASCADE.
  await q(`DELETE FROM indikator_komponen WHERE indikator_id = $1`, [id]);

  for (let i = 0; i < komponen.length; i++) {
    const k = komponen[i];
    const [kb] = await q<any>(
      `INSERT INTO indikator_komponen
         (indikator_id, urutan, label, agregat, kolom, operator_sebelum, gabung_syarat)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [id, i, b.komponen[i]?.label ?? null, k.agregat, k.kolom,
       k.operator_sebelum, k.gabung_syarat]);

    for (let j = 0; j < k.syarat.length; j++) {
      const s = k.syarat[j];
      await q(
        `INSERT INTO indikator_syarat (komponen_id, urutan, kolom, operator, nilai)
         VALUES ($1,$2,$3,$4,$5)`,
        [kb.id, j, s.kolom, s.operator, s.nilai]);
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
           (indikator_id, alias, produk, peran, jenis_nilai, nilai_efek,
            bobot_kpi, bobot_insentif,
            target_kpi3, target_kpi4, target_kpi5, aktif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (indikator_id, alias, produk) DO UPDATE
           SET peran=EXCLUDED.peran,
               jenis_nilai=EXCLUDED.jenis_nilai,
               nilai_efek=EXCLUDED.nilai_efek,
               bobot_kpi=EXCLUDED.bobot_kpi,
               bobot_insentif=EXCLUDED.bobot_insentif,
               target_kpi3=EXCLUDED.target_kpi3,
               target_kpi4=EXCLUDED.target_kpi4, target_kpi5=EXCLUDED.target_kpi5,
               aktif=EXCLUDED.aktif, updated_at=now()
         RETURNING id`,
        [id, alias, produk, peranTarget, jenisNilai,
         angkaAtauNull(t.nilai_efek),
         angkaAtauNull(t.bobot_kpi),
         angkaAtauNull(t.bobot_insentif),
         angkaAtauNull(t.target_kpi3),
         angkaAtauNull(t.target_kpi4),
         angkaAtauNull(t.target_kpi5),
         t.aktif !== false]);

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

  // Baris KPI yang sudah terlanjur dihitung ikut dibuang; kalau ditinggal,
  // dasbor akan terus menampilkan indikator yang definisinya sudah hilang
  // dan tidak bisa lagi diperiksa asal angkanya.
  await q(`DELETE FROM kpi_row WHERE indikator_id = $1 AND sumber = 'api'`, [id]);
  await q(`DELETE FROM indikator_def WHERE id = $1`, [id]);
  await auditLog(admin.sub, "indikator.hapus", id);
  return Response.json({ ok: true });
});
