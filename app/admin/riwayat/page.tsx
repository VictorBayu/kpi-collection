import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { readSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { namaPeriode, waktu } from "@/lib/format";
import RollbackButton from "./RollbackButton";
import HapusButton from "./HapusButton";

export const metadata = { title: "Riwayat impor" };

const STATUS: Record<string, { label: string; warna: string }> = {
  published:  { label: "Aktif",       warna: "var(--good)" },
  draft:      { label: "Draf",        warna: "var(--ink-faint)" },
  validated:  { label: "Siap terbit", warna: "var(--accent)" },
  superseded: { label: "Digantikan",  warna: "var(--warn)" },
  failed:     { label: "Gagal",       warna: "var(--bad)" },
};

export default async function Riwayat() {
  const s = await readSession();
  if (!s) redirect("/login");
  if (s.peran !== "admin") redirect("/dashboard");

  const list = await q<any>(
    `SELECT b.id, b.periode, b.tipe, b.status, b.nama_file, b.blob_url,
            b.total_baris, b.baris_valid, b.baris_warning, b.baris_ditolak,
            b.diunggah_pada, b.diterbitkan_pada, u.nama AS pengunggah
       FROM import_batch b LEFT JOIN app_user u ON u.id = b.diunggah_oleh
      ORDER BY b.diunggah_pada DESC LIMIT 60`);

  const aktif = list.find((b) => b.status === "published" && b.tipe === "kpi");
  const [jumlah] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM app_user WHERE aktif`);

  return (
    <AppShell>
      <main className="shell">
        <div className="sectionhead rowbetween">
          <div>
            <h2>Riwayat impor</h2>
            <p>Setiap unggahan tersimpan lengkap dengan berkas aslinya selama 24 bulan.</p>
          </div>
          <Link className="btn nowrap" href="/admin/import">+ Unggah berkas baru</Link>
        </div>

        {aktif && (
          <div className="banner info">
            <b>Yang dilihat karyawan sekarang: {namaPeriode(aktif.periode)}</b>
            {Number(aktif.baris_valid).toLocaleString("id-ID")} baris, terbit{" "}
            {waktu(aktif.diterbitkan_pada)} oleh {aktif.pengunggah ?? "—"}. Mengaktifkan
            batch lain akan langsung mengubah angka di layar {jumlah.n} karyawan.
          </div>
        )}

        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Periode</th><th>Berkas</th><th>Hasil pemeriksaan</th>
                <th>Status</th><th className="r">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const st = STATUS[b.status] ?? { label: b.status, warna: "var(--ink-faint)" };
                return (
                  <tr key={b.id}>
                    <td>
                      <b>{namaPeriode(b.periode)}</b>
                      <div className="faint">{b.tipe === "kpi" ? "Data KPI" : "Data insentif"}</div>
                    </td>
                    <td>
                      <span className="num small">{b.nama_file}</span>
                      <div className="faint">{waktu(b.diunggah_pada)} · {b.pengunggah ?? "—"}</div>
                    </td>
                    <td className="small">
                      {Number(b.baris_valid).toLocaleString("id-ID")} siap ·{" "}
                      {Number(b.baris_warning).toLocaleString("id-ID")} dicek ·{" "}
                      {Number(b.baris_ditolak).toLocaleString("id-ID")} ditolak
                    </td>
                    <td>
                      <span className="dotstat" style={{ color: st.warna }}>
                        <i style={{ background: st.warna }} />{st.label}
                      </span>
                    </td>
                    <td className="r">
                      <div className="rowact">
                        {b.status === "superseded" && (
                          <RollbackButton batchId={b.id} periode={namaPeriode(b.periode)} />
                        )}
                        {b.status === "draft" && (
                          <Link className="btn ghost sm" href="/admin/import">Lanjutkan</Link>
                        )}
                        <a className="btn ghost sm" href={b.blob_url} download>Unduh</a>
                        {/* Batch yang sedang terbit dilindungi: menghapusnya
                            akan mengosongkan layar seluruh karyawan. */}
                        {b.status !== "published" && (
                          <HapusButton
                            batchId={b.id}
                            periode={namaPeriode(b.periode)}
                            namaFile={b.nama_file}
                            baris={Number(b.baris_valid)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!list.length && (
                <tr><td colSpan={5} className="empty">
                  Belum ada berkas yang diunggah. Mulai dari tombol Unggah berkas baru.
                </td></tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  );
}
