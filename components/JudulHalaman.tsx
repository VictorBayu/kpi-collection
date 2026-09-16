/**
 * Kepala halaman bersama — pola "Page Header & Action Bar" di mockup
 * KPI Collection Enterprise: chip eyebrow + keterangan kecil di atas,
 * judul besar, deskripsi, dan tombol aksi di kanan.
 *
 * Dipakai supaya setiap layar punya struktur kepala yang sama tanpa
 * menyalin markup; halaman lama yang masih memakai .sectionhead tetap
 * tampil rapi karena gaya keduanya diselaraskan.
 */
export default function JudulHalaman({
  eyebrow, meta, judul, deskripsi, aksi, nada = "lembut",
}: {
  eyebrow?: string;
  /** Keterangan kecil di samping eyebrow, mis. "2 sumber aktif". */
  meta?: React.ReactNode;
  judul: React.ReactNode;
  deskripsi?: React.ReactNode;
  aksi?: React.ReactNode;
  /** "lembut" = chip indigo muda, "tegas" = chip indigo solid. */
  nada?: "lembut" | "tegas";
}) {
  return (
    <header className="jh">
      <div className="jh-teks">
        {(eyebrow || meta) && (
          <div className="jh-atas">
            {eyebrow && <span className={"jh-eyebrow " + nada}>{eyebrow}</span>}
            {eyebrow && meta && <span className="jh-titik" aria-hidden>•</span>}
            {meta && <span className="jh-meta">{meta}</span>}
          </div>
        )}
        <h1 className="jh-judul">{judul}</h1>
        {deskripsi && <p className="jh-desk">{deskripsi}</p>}
      </div>
      {aksi && <div className="jh-aksi">{aksi}</div>}
    </header>
  );
}

/** Titik status kecil untuk dipakai di `meta`. */
export function TitikStatus({ nada = "good" }: { nada?: "good" | "bad" | "warn" | "netral" }) {
  return <i className={"titik-status " + nada} aria-hidden />;
}

/**
 * Kartu metrik ringkas dengan ikon di kanan — pola "Key Metrics Ribbon".
 */
export function KartuMetrik({
  label, nilai, satuan, catatan, ikon, nada = "netral", lencana, progres,
}: {
  label: string;
  nilai: React.ReactNode;
  satuan?: string;
  catatan?: React.ReactNode;
  ikon?: React.ReactNode;
  nada?: "netral" | "accent" | "good" | "warn" | "bad";
  lencana?: { teks: string; nada?: "good" | "warn" | "bad" | "netral" };
  /** Bilah tipis di kaki kartu (0–100), mis. porsi dari total. */
  progres?: { persen: number; nada?: "accent" | "good" | "warn" | "bad" | "netral" };
}) {
  return (
    <div className={"km" + (progres ? " berbilah" : "")}>
      <div className="km-isi">
        <span className="km-label">{label}</span>
        <div className="km-nilai">
          <b className="num">{nilai}</b>
          {satuan && <span className="km-satuan">{satuan}</span>}
          {lencana && <span className={"km-lencana " + (lencana.nada ?? "netral")}>{lencana.teks}</span>}
        </div>
        {catatan && <span className="km-catatan">{catatan}</span>}
      </div>
      {ikon && <span className={"km-ikon " + nada}>{ikon}</span>}
      {progres && (
        <span className={"km-bilah " + (progres.nada ?? "accent")} aria-hidden>
          <i style={{ width: `${Math.max(0, Math.min(100, progres.persen))}%` }} />
        </span>
      )}
    </div>
  );
}
