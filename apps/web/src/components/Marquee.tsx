/** Endless, auto-scrolling row (pure CSS). The items are repeated so the loop is seamless; hover pauses it. */
export function Marquee({ children, seconds = 50, count }: { children: React.ReactNode[]; seconds?: number; count: number }) {
  if (count === 0) return null;
  const reps = Math.max(2, Math.ceil(12 / count));
  const half = Array.from({ length: reps }, () => children).flat();
  return (
    <div className="ticker marquee">
      <div className="ticker-track" style={{ animationDuration: `${seconds}s` }}>
        {half.map((c, i) => (
          <div key={`a${i}`} className="marquee-item">
            {c}
          </div>
        ))}
        {half.map((c, i) => (
          <div key={`b${i}`} className="marquee-item" aria-hidden="true">
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
