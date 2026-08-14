/** Kerangka halaman saat data sedang dimuat — membuat perpindahan terasa instan. */
export default function Skeleton({ baris = 4 }: { baris?: number }) {
  return (
    <main className="shell">
      <div className="sk-head">
        <div className="sk sk-title" />
        <div className="sk sk-sub" />
      </div>
      <div className="sk-cards">
        {Array.from({ length: baris }).map((_, i) => (
          <div className="sk sk-card" key={i} />
        ))}
      </div>
    </main>
  );
}
