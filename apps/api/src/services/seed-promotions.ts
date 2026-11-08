/**
 * One-time starter promotions (Cashback 10%, Sport bonus 100%, weekly sport and casino bonuses).
 * Runs once per database: a marker row in site_settings ("seed_promotions_v1") makes sure that a
 * promotion the admin edits or deletes later is never recreated or overwritten.
 * Everything here stays editable from Admin → Promotions.
 */
import type { Db } from '@aurum/db';

type Text = { title: string; summary: string; body: string; terms: string };
type Seed = { slug: string; sort: number; t: Record<'en' | 'fr' | 'ar' | 'ru' | 'tr', Text> };

const TERMS_EN = 'Minimum deposit and wagering conditions apply. One bonus per player, household and payment method. Hannibal may change or end this offer at any time. 18+ only — play responsibly.';
const TERMS_FR = 'Dépôt minimum et conditions de mise applicables. Un bonus par joueur, foyer et moyen de paiement. Hannibal peut modifier ou arrêter cette offre à tout moment. 18+ uniquement — jouez de manière responsable.';
const TERMS_AR = 'تنطبق شروط الحد الأدنى للإيداع والرهان. مكافأة واحدة لكل لاعب وعائلة ووسيلة دفع. يحق لحنبعل تعديل هذا العرض أو إيقافه في أي وقت. +18 فقط — العب بمسؤولية.';
const TERMS_RU = 'Действуют условия минимального депозита и отыгрыша. Один бонус на игрока, семью и способ оплаты. Hannibal может изменить или завершить акцию в любое время. Только 18+ — играйте ответственно.';
const TERMS_TR = 'Minimum yatırım ve çevrim şartları geçerlidir. Oyuncu, hane ve ödeme yöntemi başına bir bonus. Hannibal bu teklifi istediği zaman değiştirebilir veya sonlandırabilir. Yalnızca 18+ — sorumlu oynayın.';

const SEEDS: Seed[] = [
  {
    slug: 'cashback-10',
    sort: 10,
    t: {
      en: { title: 'Cashback 10%', summary: 'Losing doesn’t mean the end. Get 10% cashback on your weekly losses.', body: '10% cashback every week.\nEvery Monday we return 10% of your net casino losses from the previous week (Monday to Sunday) to your balance.', terms: TERMS_EN },
      fr: { title: 'Cashback 10 %', summary: 'Perdre n’est pas la fin. Recevez 10 % de cashback sur vos pertes de la semaine.', body: '10 % de cashback chaque semaine.\nChaque lundi, nous reversons sur votre solde 10 % de vos pertes nettes au casino de la semaine précédente (lundi à dimanche).', terms: TERMS_FR },
      ar: { title: 'استرداد نقدي 10%', summary: 'الخسارة ليست النهاية. احصل على استرداد 10% من خسائرك الأسبوعية.', body: 'استرداد نقدي 10% كل أسبوع.\nكل يوم اثنين نعيد إلى رصيدك 10% من صافي خسائرك في الكازينو خلال الأسبوع السابق (من الاثنين إلى الأحد).', terms: TERMS_AR },
      ru: { title: 'Кэшбэк 10%', summary: 'Проигрыш — это не конец. Получайте 10% кэшбэка с недельных проигрышей.', body: 'Кэшбэк 10% каждую неделю.\nКаждый понедельник мы возвращаем на баланс 10% чистого проигрыша в казино за прошлую неделю (с понедельника по воскресенье).', terms: TERMS_RU },
      tr: { title: '%10 Nakit İade', summary: 'Kaybetmek son değil. Haftalık kayıplarınızın %10’unu geri alın.', body: 'Her hafta %10 nakit iade.\nHer pazartesi, önceki haftanın (pazartesi–pazar) net casino kaybınızın %10’unu bakiyenize iade ediyoruz.', terms: TERMS_TR },
    },
  },
  {
    slug: 'sport-bonus-100',
    sort: 20,
    t: {
      en: { title: 'Sport Bonus 100%', summary: 'Fuel your winning streak with a 100% bonus on your first sports deposit.', body: '100% sports welcome bonus.\nMake your first deposit and we double it with a sports bonus to bet on your favourite teams.', terms: TERMS_EN },
      fr: { title: 'Bonus Sport 100 %', summary: 'Boostez votre série avec un bonus de 100 % sur votre premier dépôt sport.', body: 'Bonus de bienvenue sport de 100 %.\nFaites votre premier dépôt et nous le doublons avec un bonus sport pour parier sur vos équipes préférées.', terms: TERMS_FR },
      ar: { title: 'مكافأة رياضية 100%', summary: 'ضاعف حماسك مع مكافأة 100% على أول إيداع للرياضة.', body: 'مكافأة ترحيبية رياضية 100%.\nقم بأول إيداع وسنضاعفه بمكافأة رياضية للمراهنة على فرقك المفضلة.', terms: TERMS_AR },
      ru: { title: 'Спортивный бонус 100%', summary: 'Усильте свою серию побед с бонусом 100% на первый спортивный депозит.', body: 'Приветственный спортивный бонус 100%.\nСделайте первый депозит — и мы удвоим его спортивным бонусом для ставок на любимые команды.', terms: TERMS_RU },
      tr: { title: '%100 Spor Bonusu', summary: 'İlk spor yatırımınıza %100 bonus ile kazanma serinizi güçlendirin.', body: '%100 spor hoş geldin bonusu.\nİlk yatırımınızı yapın, favori takımlarınıza bahis yapmanız için spor bonusuyla ikiye katlayalım.', terms: TERMS_TR },
    },
  },
  {
    slug: 'weekly-sport-bonus',
    sort: 30,
    t: {
      en: { title: 'Weekly Bonus on Sport', summary: 'Every week is a new chance to win: reload your balance and receive a 100% sports bonus.', body: '100% weekly sports bonus.\nOnce a week, reload your balance and receive a 100% bonus to use on sports bets.', terms: TERMS_EN },
      fr: { title: 'Bonus hebdomadaire Sport', summary: 'Chaque semaine, une nouvelle chance : rechargez et recevez un bonus sport de 100 %.', body: 'Bonus sport hebdomadaire de 100 %.\nUne fois par semaine, rechargez votre solde et recevez un bonus de 100 % à utiliser sur les paris sportifs.', terms: TERMS_FR },
      ar: { title: 'مكافأة أسبوعية للرياضة', summary: 'كل أسبوع فرصة جديدة: اشحن رصيدك واحصل على مكافأة رياضية 100%.', body: 'مكافأة رياضية أسبوعية 100%.\nمرة كل أسبوع، اشحن رصيدك واحصل على مكافأة 100% لاستخدامها في الرهانات الرياضية.', terms: TERMS_AR },
      ru: { title: 'Еженедельный бонус на спорт', summary: 'Каждая неделя — новый шанс: пополните баланс и получите спортивный бонус 100%.', body: 'Еженедельный спортивный бонус 100%.\nРаз в неделю пополните баланс и получите бонус 100% для ставок на спорт.', terms: TERMS_RU },
      tr: { title: 'Haftalık Spor Bonusu', summary: 'Her hafta yeni bir şans: bakiyenizi yükleyin, %100 spor bonusu alın.', body: '%100 haftalık spor bonusu.\nHaftada bir kez bakiyenizi yükleyin ve spor bahislerinde kullanmak için %100 bonus alın.', terms: TERMS_TR },
    },
  },
  {
    slug: 'weekly-casino-bonus',
    sort: 40,
    t: {
      en: { title: 'Weekly Bonus on Casino', summary: 'A 50% weekly bonus for casino slots, every week.', body: '50% weekly casino bonus.\nOnce a week, reload your balance and receive a 50% bonus to play our casino slots.', terms: TERMS_EN },
      fr: { title: 'Bonus hebdomadaire Casino', summary: 'Un bonus hebdomadaire de 50 % sur les machines à sous, chaque semaine.', body: 'Bonus casino hebdomadaire de 50 %.\nUne fois par semaine, rechargez votre solde et recevez un bonus de 50 % pour jouer aux machines à sous.', terms: TERMS_FR },
      ar: { title: 'مكافأة أسبوعية للكازينو', summary: 'مكافأة أسبوعية 50% على ألعاب السلوت، كل أسبوع.', body: 'مكافأة كازينو أسبوعية 50%.\nمرة كل أسبوع، اشحن رصيدك واحصل على مكافأة 50% للعب ألعاب السلوت.', terms: TERMS_AR },
      ru: { title: 'Еженедельный бонус на казино', summary: 'Еженедельный бонус 50% на слоты казино.', body: 'Еженедельный бонус казино 50%.\nРаз в неделю пополните баланс и получите бонус 50% для игры в слоты.', terms: TERMS_RU },
      tr: { title: 'Haftalık Casino Bonusu', summary: 'Casino slotları için her hafta %50 bonus.', body: '%50 haftalık casino bonusu.\nHaftada bir kez bakiyenizi yükleyin ve slot oynamak için %50 bonus alın.', terms: TERMS_TR },
    },
  },
];

export async function seedStarterPromotions(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    const marker = await tx.query<{ key: string }>(
      `insert into site_settings (key, value) values ('seed_promotions_v1', 'true'::jsonb) on conflict (key) do nothing returning key`,
    );
    if (marker.rows.length === 0) return 0;
    const { rows: langs } = await tx.query<{ code: string }>('select code from languages');
    const known = new Set(langs.map((l) => l.code));
    let added = 0;
    for (const s of SEEDS) {
      const { rows } = await tx.query<{ id: string }>(
        `insert into promotions (slug, sort_order, is_active) values ($1, $2, true) on conflict (slug) do nothing returning id::text`,
        [s.slug, s.sort],
      );
      const id = rows[0]?.id;
      if (!id) continue;
      added += 1;
      for (const [locale, t] of Object.entries(s.t)) {
        if (!known.has(locale)) continue;
        await tx.query(
          `insert into promotion_translations (promotion_id, locale, title, summary, body, terms) values ($1::bigint, $2, $3, $4, $5, $6)`,
          [id, locale, t.title, t.summary, t.body, t.terms],
        );
      }
    }
    return added;
  });
}
