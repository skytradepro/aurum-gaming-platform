/**
 * Fills an empty installation with starter content so the website can be seen and tested:
 *
 *   - starter hero banners (text-free images in apps/api/seed/banners, titles in EN/FR/AR).
 *     These are ordinary banners: staff edit, replace or delete them in Admin -> Banners.
 *   - demo game providers and games, flagged is_demo. They are placeholders with generated
 *     artwork, they cannot be played, and the API hides them unless SHOW_DEMO_DATA=true
 *     (which it refuses in production).
 *
 *   npm run seed:demo                 add whatever is missing (safe to run again)
 *   npm run seed:demo -- --no-banners  only the demo catalogue
 *
 * It never creates players, staff, shops, balances or promotions with offers.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDb, type Queryable } from '@aurum/db';
import { loadConfig } from '../src/config.ts';
import { storeImage } from '../src/services/media.ts';

const config = loadConfig();
const withBanners = !process.argv.includes('--no-banners');
const seedDir = fileURLToPath(new URL('../seed/', import.meta.url));

// ---------------------------------------------------------------------------------------------
// Demo catalogue. Names are invented; "Demo" in every provider name keeps them recognisable.
// ---------------------------------------------------------------------------------------------
const PROVIDERS: readonly [slug: string, name: string][] = [
  ['demo-aurum-studio', 'Aurum Demo Studio'],
  ['demo-desert-games', 'Desert Demo Games'],
  ['demo-carthage-labs', 'Punic Demo Labs'],
  ['demo-velvet-live', 'Velvet Demo Live'],
];

type Category = 'slots' | 'crash' | 'live' | 'table' | 'other';
type DemoGame = [name: string, provider: string, category: Category, c1: string, c2: string, glyph: string, flags?: 'featured' | 'new' | 'both'];

const GAMES: readonly DemoGame[] = [
  ['Golden Crown', 'demo-aurum-studio', 'slots', '3d2a06', 'f5a300', 'crown', 'both'],
  ['Lucky Sevens', 'demo-aurum-studio', 'slots', '2a0b4e', '7b2ff7', 'seven', 'featured'],
  ['Cherry Burst', 'demo-aurum-studio', 'slots', '3d0a0a', 'e0453a', 'cherry'],
  ['Diamond Vault', 'demo-aurum-studio', 'slots', '06283d', '1fa2ff', 'diamond', 'featured'],
  ['Star Fortune', 'demo-aurum-studio', 'slots', '1d1d2b', '8f8fff', 'star', 'new'],
  ['Sahara Gems', 'demo-desert-games', 'slots', '3d2a06', 'ff8a00', 'gem', 'featured'],
  ['Oasis Clover', 'demo-desert-games', 'slots', '0b3d2e', '19b37a', 'clover'],
  ['Desert Moon', 'demo-desert-games', 'slots', '10162b', '4f6bff', 'moon', 'new'],
  ['Dune Bells', 'demo-desert-games', 'slots', '3d2a06', 'f5c400', 'bell'],
  ['Fire Pharaoh', 'demo-desert-games', 'slots', '3d0a0a', 'ff5a3c', 'flame'],
  ['Punic Coins', 'demo-carthage-labs', 'slots', '3d2a06', 'ffcc00', 'coin', 'both'],
  ['Harbour Lights', 'demo-carthage-labs', 'slots', '06283d', '00c2d1', 'bolt'],
  ['Elephant March', 'demo-carthage-labs', 'slots', '1d1d2b', 'a0a0c0', 'crown'],
  ['Mosaic Riches', 'demo-carthage-labs', 'slots', '0b3d2e', '2fe08f', 'gem'],
  ['Sky Rocket', 'demo-aurum-studio', 'crash', '06283d', '1fa2ff', 'rocket', 'both'],
  ['Lightning Climb', 'demo-desert-games', 'crash', '2a0b4e', 'b06bff', 'bolt', 'featured'],
  ['Comet Run', 'demo-carthage-labs', 'crash', '3d0a0a', 'ff5a3c', 'flame', 'new'],
  ['Gold Rush Crash', 'demo-aurum-studio', 'crash', '3d2a06', 'f5a300', 'rocket'],
  ['Blackjack Classic', 'demo-carthage-labs', 'table', '0b3d2e', '19b37a', 'spade', 'featured'],
  ['European Roulette', 'demo-carthage-labs', 'table', '3d0a0a', 'e0453a', 'wheel'],
  ['Baccarat Royale', 'demo-aurum-studio', 'table', '2a0b4e', '7b2ff7', 'diamond'],
  ['Dice Duel', 'demo-desert-games', 'table', '1d1d2b', '6c6c8a', 'dice', 'new'],
  ['Live Roulette', 'demo-velvet-live', 'live', '0b3d2e', '19b37a', 'wheel', 'featured'],
  ['Live Blackjack', 'demo-velvet-live', 'live', '1d1d2b', 'ffcc00', 'spade'],
  ['Live Baccarat', 'demo-velvet-live', 'live', '2a0b4e', 'b06bff', 'diamond'],
  ['Live Dice', 'demo-velvet-live', 'live', '3d0a0a', 'ff5a3c', 'dice', 'new'],
  ['Scratch Gold', 'demo-aurum-studio', 'other', '3d2a06', 'ffcc00', 'coin'],
  ['Keno Stars', 'demo-desert-games', 'other', '10162b', '4f6bff', 'star'],
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function seedCatalogue(q: Queryable): Promise<{ providers: number; games: number }> {
  let providers = 0;
  let games = 0;
  for (const [i, [slug, name]] of PROVIDERS.entries()) {
    const r = await q.query(
      `insert into game_providers (slug, name, sort_order, is_demo) values ($1, $2, $3, true) on conflict (slug) do nothing`,
      [slug, name, (i + 1) * 10],
    );
    providers += r.rowCount ?? 0;
  }
  for (const [i, [name, provider, category, c1, c2, glyph, flags]] of GAMES.entries()) {
    const r = await q.query(
      `insert into games (slug, provider_id, name, category, is_featured, is_new, sort_order, art, is_demo)
       select $1, p.id, $2, $3, $4, $5, $6, $7::jsonb, true from game_providers p where p.slug = $8
       on conflict (slug) do nothing`,
      [
        `demo-${slugify(name)}`,
        name,
        category,
        flags === 'featured' || flags === 'both',
        flags === 'new' || flags === 'both',
        (i + 1) * 10,
        JSON.stringify({ c1: `#${c1}`, c2: `#${c2}`, glyph }),
        provider,
      ],
    );
    games += r.rowCount ?? 0;
  }
  return { providers, games };
}

// ---------------------------------------------------------------------------------------------
// Starter banners. Plain, informative texts with no offers or promises of winnings.
// ---------------------------------------------------------------------------------------------
type Texts = { title: string; subtitle: string; cta: string; alt: string };
interface StarterBanner {
  name: string;
  placement: 'home_hero' | 'casino_hero' | 'live_casino_hero' | 'sports_hero';
  image: string;
  link: string;
  texts: { en: Texts; fr: Texts; ar: Texts };
}

const BANNERS: readonly StarterBanner[] = [
  {
    name: 'Starter: welcome',
    placement: 'home_hero',
    image: 'welcome',
    link: '/casino',
    texts: {
      en: { title: 'Welcome to Aurum', subtitle: 'Slots, crash games and table games, in English, French and Arabic.', cta: 'Open the casino', alt: 'Golden crown on a dark background' },
      fr: { title: 'Bienvenue sur Aurum', subtitle: 'Machines à sous, jeux crash et jeux de table, en français, en anglais et en arabe.', cta: 'Ouvrir le casino', alt: 'Couronne dorée sur fond sombre' },
      ar: { title: 'مرحبًا بك في Aurum', subtitle: 'ماكينات السلوت وألعاب كراش وألعاب الطاولة، بالعربية والفرنسية والإنجليزية.', cta: 'افتح الكازينو', alt: 'تاج ذهبي على خلفية داكنة' },
    },
  },
  {
    name: 'Starter: cash at shops',
    placement: 'home_hero',
    image: 'cash',
    link: '/shops',
    texts: {
      en: { title: 'Cash in, cash out at our shops', subtitle: 'Deposit and withdraw in cash at partner shops, in your account currency.', cta: 'Find a shop', alt: 'Gold coins on a green background' },
      fr: { title: 'Dépôts et retraits en espèces', subtitle: 'Déposez et retirez en espèces dans nos points de vente, dans la devise de votre compte.', cta: 'Trouver un point de vente', alt: 'Pièces dorées sur fond vert' },
      ar: { title: 'إيداع وسحب نقدًا في محلاتنا', subtitle: 'أودِع واسحب نقدًا في المحلات الشريكة، بعملة حسابك.', cta: 'ابحث عن محل', alt: 'عملات ذهبية على خلفية خضراء' },
    },
  },
  {
    name: 'Starter: responsible gaming',
    placement: 'home_hero',
    image: 'responsible',
    link: '/page/responsible-gaming',
    texts: {
      en: { title: 'Play for fun', subtitle: 'Set yourself a time and a budget before you play, and take a break when you need one.', cta: 'Responsible gaming', alt: 'Golden clock on a dark background' },
      fr: { title: 'Jouez pour le plaisir', subtitle: 'Fixez-vous une durée et un budget avant de jouer, et faites une pause quand il le faut.', cta: 'Jeu responsable', alt: 'Horloge dorée sur fond sombre' },
      ar: { title: 'العب من أجل المتعة', subtitle: 'حدّد لنفسك وقتًا وميزانية قبل اللعب، وخذ استراحة عند الحاجة.', cta: 'اللعب المسؤول', alt: 'ساعة ذهبية على خلفية داكنة' },
    },
  },
  {
    name: 'Starter: slots',
    placement: 'casino_hero',
    image: 'slots',
    link: '/casino/slots',
    texts: {
      en: { title: 'Slots', subtitle: 'Browse the slot games by provider, or search by name.', cta: 'See all slots', alt: 'Three golden sevens' },
      fr: { title: 'Machines à sous', subtitle: 'Parcourez les machines à sous par fournisseur, ou cherchez par nom.', cta: 'Voir les machines à sous', alt: 'Trois sept dorés' },
      ar: { title: 'ماكينات السلوت', subtitle: 'تصفح ألعاب السلوت حسب المزود، أو ابحث بالاسم.', cta: 'كل ألعاب السلوت', alt: 'ثلاث سبعات ذهبية' },
    },
  },
  {
    name: 'Starter: crash games',
    placement: 'casino_hero',
    image: 'crash',
    link: '/casino/crash',
    texts: {
      en: { title: 'Crash games', subtitle: 'Fast rounds: decide when to stop before the curve does.', cta: 'See crash games', alt: 'Golden rocket on a red background' },
      fr: { title: 'Jeux crash', subtitle: 'Des manches rapides : décidez quand vous arrêter avant la courbe.', cta: 'Voir les jeux crash', alt: 'Fusée dorée sur fond rouge' },
      ar: { title: 'ألعاب كراش', subtitle: 'جولات سريعة: قرّر متى تتوقف قبل أن يتوقف المنحنى.', cta: 'ألعاب كراش', alt: 'صاروخ ذهبي على خلفية حمراء' },
    },
  },
  {
    name: 'Starter: live casino',
    placement: 'live_casino_hero',
    image: 'live',
    link: '/live-casino',
    texts: {
      en: { title: 'Live casino', subtitle: 'Roulette, blackjack and baccarat tables with live dealers.', cta: '', alt: 'Roulette wheel on a green background' },
      fr: { title: 'Casino en direct', subtitle: 'Tables de roulette, de blackjack et de baccara avec croupiers en direct.', cta: '', alt: 'Roulette sur fond vert' },
      ar: { title: 'الكازينو المباشر', subtitle: 'طاولات روليت وبلاك جاك وباكارات مع موزعين مباشرين.', cta: '', alt: 'عجلة روليت على خلفية خضراء' },
    },
  },
  {
    name: 'Starter: sports',
    placement: 'sports_hero',
    image: 'sports',
    link: '/sports',
    texts: {
      en: { title: 'Sports betting', subtitle: 'Football, basketball, tennis and more.', cta: '', alt: 'Football pitch lines on a blue background' },
      fr: { title: 'Paris sportifs', subtitle: 'Football, basketball, tennis et plus encore.', cta: '', alt: 'Lignes d’un terrain de football sur fond bleu' },
      ar: { title: 'المراهنات الرياضية', subtitle: 'كرة القدم وكرة السلة والتنس والمزيد.', cta: '', alt: 'خطوط ملعب كرة قدم على خلفية زرقاء' },
    },
  },
];

async function seedBanners(db: ReturnType<typeof createDb>): Promise<number> {
  const locales = (await db.query<{ code: string }>(`select code from languages`)).rows.map((r) => r.code);
  let created = 0;
  for (const [i, banner] of BANNERS.entries()) {
    const exists = await db.query(`select 1 from banners where name = $1`, [banner.name]);
    if (exists.rows.length > 0) continue;
    const images: Record<'desktop' | 'mobile', string> = { desktop: '', mobile: '' };
    for (const kind of ['desktop', 'mobile'] as const) {
      const file = `${banner.image}-${kind}.jpg`;
      const bytes = new Uint8Array(await readFile(`${seedDir}banners/${file}`));
      images[kind] = (await storeImage(db, config.uploadDir, { bytes, originalName: file, uploadedBy: null })).media.id;
    }
    await db.transaction(async (tx) => {
      const row = await tx.query<{ id: string }>(
        `insert into banners (placement, name, sort_order) values ($1, $2, $3) returning id::text`,
        [banner.placement, banner.name, (i + 1) * 10],
      );
      const id = (row.rows[0] as { id: string }).id;
      for (const [locale, t] of Object.entries(banner.texts)) {
        if (!locales.includes(locale)) continue;
        await tx.query(
          `insert into banner_translations (banner_id, locale, title, subtitle, cta_label, link_url, alt_text, image_desktop_id, image_mobile_id)
           values ($1::bigint, $2, $3, $4, $5, $6, $7, $8::uuid, $9::uuid)`,
          [id, locale, t.title, t.subtitle, t.cta, t.cta ? banner.link : '', t.alt, images.desktop, images.mobile],
        );
      }
    });
    created += 1;
  }
  return created;
}

const db = createDb({ connectionString: config.databaseUrl, ssl: config.databaseSsl, max: 1, applicationName: 'aurum-seed' });
try {
  const catalogue = await db.transaction((tx) => seedCatalogue(tx));
  console.log(`Demo catalogue: ${catalogue.providers} provider(s) and ${catalogue.games} game(s) added (flagged is_demo).`);
  if (!config.showDemoData) console.log('Note: SHOW_DEMO_DATA is off, so the website does not show demo games.');
  if (withBanners) console.log(`Starter banners: ${await seedBanners(db)} added. Edit or replace them in Admin -> Banners.`);
} catch (error) {
  console.error('Seeding stopped:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.close();
}
