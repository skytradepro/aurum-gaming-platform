/** Built-in artwork for the starter promotions, used only when the admin has not uploaded an image. */
export interface PromoArt {
  image: string;
  badge: string;
  play: '/casino' | '/sports';
}

const ART: Record<string, PromoArt> = {
  'cashback-10': { image: '/media/promotions/cashback-10.svg', badge: '10% · 10 TND', play: '/casino' },
  'sport-bonus-100': { image: '/media/videos/football-stadium-desktop.jpg', badge: '100%', play: '/sports' },
  'weekly-sport-bonus': { image: '/media/videos/football-crowd-mobile.jpg', badge: '100%', play: '/sports' },
  'weekly-casino-bonus': { image: '/media/videos/roulette-spin-desktop.jpg', badge: '50%', play: '/casino' },
};

export function promoArt(slug: string): PromoArt | null {
  return ART[slug] ?? null;
}

export function promoPlayHref(slug: string): '/casino' | '/sports' {
  return ART[slug]?.play ?? (slug.includes('sport') ? '/sports' : '/casino');
}
