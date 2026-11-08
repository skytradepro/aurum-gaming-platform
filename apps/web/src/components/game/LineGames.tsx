'use client';

import { JESTERS_DICE_CONFIG, PHARAOH_CODEX_CONFIG, TREASURE_STACK_CONFIG, ICE_FORTUNE_CONFIG, SEVEN_ORCHARD_CONFIG, SAVANNA_CHARGE_CONFIG, VAULT_HEIST_CONFIG, LAVA_DRAGON_CONFIG, PALACE_CROWN_CONFIG, LION_PRIDE_CONFIG, GENIE_LAMP_CONFIG, LUCKY_JIG_CONFIG, HANNIBAL_CONFIG, CHERRY_PARTY_CONFIG, LUCKY_BELL_CONFIG, POWER_HOT_CONFIG, GOLDEN_COINS_CONFIG, EXTRA_CROWN_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { LineGame, type LineTheme } from './LineGame';

/** The Hannibal Play line slots: original symbols in public/media/games/<id>, lowest paying first (the last two are WILD and SCATTER). */
type Props = { currency: CurrencyDTO; locale: string; initialBalanceMinor: string };

const JESTERSDICE: LineTheme = { id: 'jestersdice', ns: 'jestersDice', title: 'HANNIBAL Jester\'s Dice', config: JESTERS_DICE_CONFIG, className: 'lg-jesters', folder: 'jestersdice', files: ['J', 'Q', 'K', 'A', 'chip', 'dice', 'hat', 'crown', 'joker', 'star'] };
export function JestersDiceGame(props: Props) {
  return <LineGame theme={JESTERSDICE} {...props} />;
}

const PHARAOHCODEX: LineTheme = { id: 'pharaohcodex', ns: 'pharaohCodex', title: 'HANNIBAL Pharaoh\'s Codex', config: PHARAOH_CODEX_CONFIG, className: 'lg-codex', folder: 'pharaohcodex', files: ['r10', 'rJ', 'rQ', 'rK', 'rA', 'ankh', 'scarab', 'eye', 'mask', 'falcon', 'sun'] };
export function PharaohCodexGame(props: Props) {
  return <LineGame theme={PHARAOHCODEX} {...props} />;
}

const TREASURESTACK: LineTheme = { id: 'treasurestack', ns: 'treasureStack', title: 'HANNIBAL Treasure Stack', config: TREASURE_STACK_CONFIG, className: 'lg-stack', folder: 'treasurestack', files: ['J', 'Q', 'K', 'A', 'coins', 'cash', 'goldbar', 'diamond', 'lion', 'chest'] };
export function TreasureStackGame(props: Props) {
  return <LineGame theme={TREASURESTACK} {...props} />;
}

const ICEFORTUNE: LineTheme = { id: 'icefortune', ns: 'iceFortune', title: 'HANNIBAL Ice Fortune', config: ICE_FORTUNE_CONFIG, className: 'lg-ice', folder: 'icefortune', files: ['J', 'Q', 'K', 'A', 'coin', 'crystal', 'goldclover', 'globe', 'hat', 'pot'] };
export function IceFortuneGame(props: Props) {
  return <LineGame theme={ICEFORTUNE} {...props} />;
}

const SEVENORCHARD: LineTheme = { id: 'sevenorchard', ns: 'sevenOrchard', title: 'HANNIBAL Seven Orchard', config: SEVEN_ORCHARD_CONFIG, className: 'lg-orchard', folder: 'sevenorchard', files: ['cherry', 'lemon', 'orange', 'plum', 'grapes', 'melon', 'bell', 'seven', 'wild', 'star'] };
export function SevenOrchardGame(props: Props) {
  return <LineGame theme={SEVENORCHARD} {...props} />;
}

const SAVANNACHARGE: LineTheme = { id: 'savannacharge', ns: 'savannaCharge', title: 'HANNIBAL Savanna Charge', config: SAVANNA_CHARGE_CONFIG, className: 'lg-savanna', folder: 'savannacharge', files: ['J', 'Q', 'K', 'A', 'acacia', 'shield', 'drum', 'amber', 'rhino', 'sunset'] };
export function SavannaChargeGame(props: Props) {
  return <LineGame theme={SAVANNACHARGE} {...props} />;
}

const VAULTHEIST: LineTheme = { id: 'vaultheist', ns: 'vaultHeist', title: 'HANNIBAL Vault Heist', config: VAULT_HEIST_CONFIG, className: 'lg-heist', folder: 'vaultheist', files: ['J', 'Q', 'K', 'A', 'dynamite', 'diamond', 'goldbars', 'bag', 'mask', 'vault'] };
export function VaultHeistGame(props: Props) {
  return <LineGame theme={VAULTHEIST} {...props} />;
}

const LAVADRAGON: LineTheme = { id: 'lavadragon', ns: 'lavaDragon', title: 'HANNIBAL Lava Dragon', config: LAVA_DRAGON_CONFIG, className: 'lg-dragon', folder: 'lavadragon', files: ['J', 'Q', 'K', 'A', 'orb', 'ruby', 'eye', 'claw', 'dragon', 'egg'] };
export function LavaDragonGame(props: Props) {
  return <LineGame theme={LAVADRAGON} {...props} />;
}

const PALACECROWN: LineTheme = { id: 'palacecrown', ns: 'palaceCrown', title: 'HANNIBAL Palace Crown', config: PALACE_CROWN_CONFIG, className: 'lg-crown', folder: 'palacecrown', files: ['cherry', 'bar1', 'bar2', 'bar3', 'bell', 'diamond', 'seven', 'crown'] };
export function PalaceCrownGame(props: Props) {
  return <LineGame theme={PALACECROWN} {...props} />;
}

const LIONPRIDE: LineTheme = { id: 'lionpride', ns: 'lionPride', title: 'HANNIBAL Lion Pride', config: LION_PRIDE_CONFIG, className: 'lg-pride', folder: 'lionpride', files: ['J', 'Q', 'K', 'A', 'paw', 'spears', 'fang', 'sunstone', 'lioness', 'lion', 'rock'] };
export function LionPrideGame(props: Props) {
  return <LineGame theme={LIONPRIDE} {...props} />;
}

const GENIELAMP: LineTheme = { id: 'genielamp', ns: 'genieLamp', title: 'HANNIBAL Genie\'s Lamp', config: GENIE_LAMP_CONFIG, className: 'lg-genie', folder: 'genielamp', files: ['J', 'Q', 'K', 'A', 'moon', 'scimitar', 'teapot', 'jewel', 'carpet', 'lamp', 'palace'] };
export function GenieLampGame(props: Props) {
  return <LineGame theme={GENIELAMP} {...props} />;
}

const LUCKYJIG: LineTheme = { id: 'luckyjig', ns: 'luckyJig', title: 'HANNIBAL Lucky Jig', config: LUCKY_JIG_CONFIG, className: 'lg-jig', folder: 'luckyjig', files: ['J', 'Q', 'K', 'A', 'boot', 'fiddle', 'pipe', 'pot', 'jig', 'rainbowpot'] };
export function LuckyJigGame(props: Props) {
  return <LineGame theme={LUCKYJIG} {...props} />;
}

const HANNIBAL: LineTheme = { id: 'hannibal', ns: 'hannibal', title: 'HANNIBAL Triumph', config: HANNIBAL_CONFIG, className: 'lg-hannibal', folder: 'hannibal', files: ['J', 'Q', 'K', 'A', 'coins', 'cash', 'goldbar', 'diamond', 'lion', 'chest'] };
export function HannibalTriumphGame(props: Props) {
  return <LineGame theme={HANNIBAL} {...props} />;
}

const CHERRYPARTY: LineTheme = { id: 'cherryparty', ns: 'cherryParty', title: 'HANNIBAL Cherry Party', config: CHERRY_PARTY_CONFIG, className: 'lg-cherry', folder: 'cherryparty', files: ['lemon', 'orange', 'plum', 'grapes', 'melon', 'bell', 'seven', 'cherry', 'wild', 'star'] };
export function CherryPartyGame(props: Props) {
  return <LineGame theme={CHERRYPARTY} {...props} />;
}

const LUCKYBELL: LineTheme = { id: 'luckybell', ns: 'luckyBell', title: 'HANNIBAL Lucky Bell', config: LUCKY_BELL_CONFIG, className: 'lg-bell', folder: 'luckybell', files: ['cherry', 'lemon', 'orange', 'plum', 'grapes', 'melon', 'seven', 'star', 'bell', 'wild'] };
export function LuckyBellGame(props: Props) {
  return <LineGame theme={LUCKYBELL} {...props} />;
}

const POWERHOT: LineTheme = { id: 'powerhot', ns: 'powerHot', title: 'HANNIBAL Power Hot', config: POWER_HOT_CONFIG, className: 'lg-power', folder: 'powerhot', files: ['cherry', 'lemon', 'orange', 'grapes', 'melon', 'dice', 'seven', 'chip', 'star', 'crown'] };
export function PowerHotGame(props: Props) {
  return <LineGame theme={POWERHOT} {...props} />;
}

const GOLDENCOINS: LineTheme = { id: 'goldencoins', ns: 'goldenCoins', title: 'HANNIBAL Golden Coins', config: GOLDEN_COINS_CONFIG, className: 'lg-coins', folder: 'goldencoins', files: ['J', 'Q', 'K', 'A', 'coins', 'cash', 'goldbar', 'diamond', 'lamp', 'chest'] };
export function GoldenCoinsGame(props: Props) {
  return <LineGame theme={GOLDENCOINS} {...props} />;
}

const EXTRACROWN: LineTheme = { id: 'extracrown', ns: 'extraCrown', title: 'HANNIBAL Extra Crown', config: EXTRA_CROWN_CONFIG, className: 'lg-extra', folder: 'extracrown', files: ['cherry', 'lemon', 'orange', 'plum', 'grapes', 'bell', 'seven', 'diamond', 'crown', 'star'] };
export function ExtraCrownGame(props: Props) {
  return <LineGame theme={EXTRACROWN} {...props} />;
}
