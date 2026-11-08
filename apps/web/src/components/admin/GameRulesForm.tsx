'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface GameRules {
  game_max_stake: number;
  game_max_win: number;
  game_wheel_enabled: boolean;
  game_coin_enabled: boolean;
  game_dice_enabled: boolean;
  game_slots_enabled: boolean;
  game_crash_enabled: boolean;
  game_roulette_enabled: boolean;
  game_plinko_enabled: boolean;
  game_keno_enabled: boolean;
  game_mines_enabled: boolean;
  game_dragontiger_enabled: boolean;
  game_baccarat_enabled: boolean;
  game_sicbo_enabled: boolean;
  game_pairplus_enabled: boolean;
  game_scratch_enabled: boolean;
  game_goldrush_enabled: boolean;
  game_strike_enabled: boolean;
  game_raptor_enabled: boolean;
  game_candy_enabled: boolean;
  game_thunder_enabled: boolean;
  game_ocean_enabled: boolean;
  game_aztec_enabled: boolean;
  game_hotfruits_enabled: boolean;
  game_ancientbook_enabled: boolean;
  game_andarbahar_enabled: boolean;
  game_casinowar_enabled: boolean;
  game_desert_enabled: boolean;
  game_chilli_enabled: boolean;
  game_candyburst_enabled: boolean;
  game_lionsroar_enabled: boolean;
  game_tidal_enabled: boolean;
  game_olympusstorm_enabled: boolean;
  game_diamondblitz_enabled: boolean;
  game_vesuvius_enabled: boolean;
  game_deepcatch_enabled: boolean;
  game_luckyclover_enabled: boolean;
  game_jestersdice_enabled: boolean;
  game_pharaohcodex_enabled: boolean;
  game_treasurestack_enabled: boolean;
  game_icefortune_enabled: boolean;
  game_sevenorchard_enabled: boolean;
  game_savannacharge_enabled: boolean;
  game_vaultheist_enabled: boolean;
  game_lavadragon_enabled: boolean;
  game_foresthowl_enabled: boolean;
  game_carthagecards_enabled: boolean;
  game_palacecrown_enabled: boolean;
  game_lionpride_enabled: boolean;
  game_genielamp_enabled: boolean;
  game_luckyjig_enabled: boolean;
  game_hannibal_enabled: boolean;
  game_cherryparty_enabled: boolean;
  game_luckybell_enabled: boolean;
  game_powerhot_enabled: boolean;
  game_goldencoins_enabled: boolean;
  game_extracrown_enabled: boolean;
  game_jewelroulette_enabled: boolean;
  game_lucky7_enabled: boolean;
  game_teenpatti_enabled: boolean;
  game_amigomonkeys_enabled: boolean;
  game_wolves10k_enabled: boolean;
  game_rush10kx_enabled: boolean;
  game_nights10001_enabled: boolean;
  game_superhot100_enabled: boolean;
  game_supericy100_enabled: boolean;
  game_wonders10k_enabled: boolean;
  game_olympus1000_enabled: boolean;
  game_winning10kn_enabled: boolean;
  game_moongirls1000_enabled: boolean;
  game_rush1000x_enabled: boolean;
  game_artofgold100_enabled: boolean;
  game_reelfish100_enabled: boolean;
  game_winning1kn_enabled: boolean;
  game_burningbrilliants_enabled: boolean;
  game_dragonpearls15_enabled: boolean;
  game_spins1001_enabled: boolean;
  game_geniefortune1001_enabled: boolean;
  game_burninghotbb_enabled: boolean;
  game_artofgolddice_enabled: boolean;
  game_goldencoinsdice_enabled: boolean;
  sports_enabled: boolean;
  sports_max_stake: number;
  sports_max_win: number;
  sports_max_selections: number;
  sports_live_enabled: boolean;
  sports_live_max_stake: number;
  sports_live_delay_seconds: number;
}

const SWITCHES = [
  ['game_wheel_enabled', 'wheel'],
  ['game_coin_enabled', 'coin'],
  ['game_dice_enabled', 'dice'],
  ['game_slots_enabled', 'slots'],
  ['game_crash_enabled', 'crash'],
  ['game_roulette_enabled', 'roulette'],
  ['game_plinko_enabled', 'plinko'],
  ['game_keno_enabled', 'keno'],
  ['game_mines_enabled', 'mines'],
  ['game_dragontiger_enabled', 'dragontiger'],
  ['game_baccarat_enabled', 'baccarat'],
  ['game_sicbo_enabled', 'sicbo'],
  ['game_pairplus_enabled', 'pairplus'],
  ['game_scratch_enabled', 'scratch'],
  ['game_goldrush_enabled', 'goldrush'],
  ['game_strike_enabled', 'strike'],
  ['game_raptor_enabled', 'raptor'],
  ['game_candy_enabled', 'candy'],
  ['game_thunder_enabled', 'thunder'],
  ['game_ocean_enabled', 'ocean'],
  ['game_aztec_enabled', 'aztec'],
  ['game_hotfruits_enabled', 'hotfruits'],
  ['game_ancientbook_enabled', 'ancientbook'],
  ['game_andarbahar_enabled', 'andarbahar'],
  ['game_casinowar_enabled', 'casinowar'],
  ['game_desert_enabled', 'desert'],
  ['game_chilli_enabled', 'chilli'],
  ['game_candyburst_enabled', 'candyburst'],
  ['game_lionsroar_enabled', 'lionsroar'],
  ['game_tidal_enabled', 'tidal'],
  ['game_olympusstorm_enabled', 'olympusstorm'],
  ['game_diamondblitz_enabled', 'diamondblitz'],
  ['game_vesuvius_enabled', 'vesuvius'],
  ['game_deepcatch_enabled', 'deepcatch'],
  ['game_luckyclover_enabled', 'luckyclover'],
  ['game_jestersdice_enabled', 'jestersdice'],
  ['game_pharaohcodex_enabled', 'pharaohcodex'],
  ['game_treasurestack_enabled', 'treasurestack'],
  ['game_icefortune_enabled', 'icefortune'],
  ['game_sevenorchard_enabled', 'sevenorchard'],
  ['game_savannacharge_enabled', 'savannacharge'],
  ['game_vaultheist_enabled', 'vaultheist'],
  ['game_lavadragon_enabled', 'lavadragon'],
  ['game_foresthowl_enabled', 'foresthowl'],
  ['game_carthagecards_enabled', 'carthagecards'],
  ['game_palacecrown_enabled', 'palacecrown'],
  ['game_lionpride_enabled', 'lionpride'],
  ['game_genielamp_enabled', 'genielamp'],
  ['game_luckyjig_enabled', 'luckyjig'],
  ['game_hannibal_enabled', 'hannibal'],
  ['game_cherryparty_enabled', 'cherryparty'],
  ['game_luckybell_enabled', 'luckybell'],
  ['game_powerhot_enabled', 'powerhot'],
  ['game_goldencoins_enabled', 'goldencoins'],
  ['game_extracrown_enabled', 'extracrown'],
  ['game_jewelroulette_enabled', 'jewelroulette'],
  ['game_lucky7_enabled', 'lucky7'],
  ['game_teenpatti_enabled', 'teenpatti'],
  ['game_amigomonkeys_enabled', 'amigomonkeys'],
  ['game_wolves10k_enabled', 'wolves10k'],
  ['game_rush10kx_enabled', 'rush10kx'],
  ['game_nights10001_enabled', 'nights10001'],
  ['game_superhot100_enabled', 'superhot100'],
  ['game_supericy100_enabled', 'supericy100'],
  ['game_wonders10k_enabled', 'wonders10k'],
  ['game_olympus1000_enabled', 'olympus1000'],
  ['game_winning10kn_enabled', 'winning10kn'],
  ['game_moongirls1000_enabled', 'moongirls1000'],
  ['game_rush1000x_enabled', 'rush1000x'],
  ['game_artofgold100_enabled', 'artofgold100'],
  ['game_reelfish100_enabled', 'reelfish100'],
  ['game_winning1kn_enabled', 'winning1kn'],
  ['game_burningbrilliants_enabled', 'burningbrilliants'],
  ['game_dragonpearls15_enabled', 'dragonpearls15'],
  ['game_spins1001_enabled', 'spins1001'],
  ['game_geniefortune1001_enabled', 'geniefortune1001'],
  ['game_burninghotbb_enabled', 'burninghotbb'],
  ['game_artofgolddice_enabled', 'artofgolddice'],
  ['game_goldencoinsdice_enabled', 'goldencoinsdice'],
] as const;

/** Super Admin: the central rules every in-house game follows. Each change is saved on its own and audited. */
export function GameRulesForm({ rules }: { rules: GameRules }) {
  const t = useTranslations('adminContent');
  const tg = useTranslations('games');
  const tw = useTranslations('wheel');
  const tRoot = useTranslations();
  const router = useRouter();
  const [maxStake, setMaxStake] = useState(String(rules.game_max_stake));
  const [maxWin, setMaxWin] = useState(String(rules.game_max_win));
  const tb = useTranslations('bets');
  const [sStake, setSStake] = useState(String(rules.sports_max_stake));
  const [sWin, setSWin] = useState(String(rules.sports_max_win));
  const [sSel, setSSel] = useState(String(rules.sports_max_selections));
  const tsb = useTranslations('sbk');
  const [lMax, setLMax] = useState(String(rules.sports_live_max_stake));
  const [lDelay, setLDelay] = useState(String(rules.sports_live_delay_seconds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(key: string, value: number | boolean) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiClient(`/admin/settings/${key}`, { method: 'PUT', json: { value } });
      setNotice(t('rulesSaved'));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields ? ` (${Object.keys(err.fields).join(', ')})` : '';
        setError(`${tRoot(errorMessageKey(err.code) as never)}${fields}`);
      } else {
        setError(tRoot('errors.generic' as never));
      }
    } finally {
      setBusy(false);
    }
  }

  const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

  return (
    <div className="card" style={{ display: 'grid', gap: '1rem' }}>
      <h2>{t('rulesTitle')}</h2>
      <p className="muted">{t('rulesIntro')}</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}
      <div className="field">
        <label>{t('maxStake')}</label>
        <input inputMode="numeric" value={maxStake} disabled={busy} onChange={(e) => setMaxStake(e.target.value)} />
        <button type="button" className="btn btn-gold btn-sm" disabled={busy || Number.isNaN(num(maxStake))} onClick={() => void save('game_max_stake', num(maxStake))}>
          {t('save')}
        </button>
      </div>
      <div className="field">
        <label>{t('maxWin')}</label>
        <input inputMode="numeric" value={maxWin} disabled={busy} onChange={(e) => setMaxWin(e.target.value)} />
        <button type="button" className="btn btn-gold btn-sm" disabled={busy || Number.isNaN(num(maxWin))} onClick={() => void save('game_max_win', num(maxWin))}>
          {t('save')}
        </button>
      </div>
      <h3>{t('gamesOnOff')}</h3>
      {SWITCHES.map(([key, game]) => (
        <label key={key} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <input type="checkbox" checked={rules[key]} disabled={busy} onChange={(e) => void save(key, e.target.checked)} />
          {game === 'wheel' ? tw('title') : tg(`${game}Title` as never)}
        </label>
      ))}
      <h3>{tb('rulesTitle')}</h3>
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input type="checkbox" checked={rules.sports_enabled} disabled={busy} onChange={(e) => void save('sports_enabled', e.target.checked)} />
        {tb('enabled')}
      </label>
      {(
        [
          ['sports_max_stake', tb('maxStakeLabel'), sStake, setSStake],
          ['sports_max_win', tb('maxWinLabel'), sWin, setSWin],
          ['sports_max_selections', tb('maxSelectionsLabel'), sSel, setSSel],
        ] as const
      ).map(([key, label, value, setValue]) => (
        <div className="field" key={key}>
          <label>{label}</label>
          <input inputMode="numeric" value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="btn btn-gold btn-sm" disabled={busy || Number.isNaN(num(value))} onClick={() => void save(key, num(value))}>
            {t('save')}
          </button>
        </div>
      ))}
      <h3>{tsb('admLiveTitle')}</h3>
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input type="checkbox" checked={rules.sports_live_enabled} disabled={busy} onChange={(e) => void save('sports_live_enabled', e.target.checked)} />
        {tsb('admLiveEnabled')}
      </label>
      {(
        [
          ['sports_live_max_stake', tsb('admLiveMax'), lMax, setLMax],
          ['sports_live_delay_seconds', tsb('admLiveDelay'), lDelay, setLDelay],
        ] as const
      ).map(([key, label, value, setValue]) => (
        <div className="field" key={key}>
          <label>{label}</label>
          <input inputMode="numeric" value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="btn btn-gold btn-sm" disabled={busy || Number.isNaN(num(value))} onClick={() => void save(key, num(value))}>
            {t('save')}
          </button>
        </div>
      ))}
      <small className="muted">{tsb('admLiveHelp')}</small>
    </div>
  );
}
