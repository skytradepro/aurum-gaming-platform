import '@/styles/games-fx.css';

/** Provider play: full-width stage; styles loaded for SSR (no tiny default iframe). */
export default function ProviderPlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="dns-prefetch" href="https://apipl.lxgame.io" />
      <link rel="preconnect" href="https://apipl.lxgame.io" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://common-static.ppgames.net" crossOrigin="anonymous" />
      <div className="pgf-page-root">{children}</div>
    </>
  );
}
