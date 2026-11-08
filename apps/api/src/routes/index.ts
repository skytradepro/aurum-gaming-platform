import type { Route } from '../http/types.ts';
import { accountRoutes } from './account.ts';
import { adminContentRoutes } from './admin-content.ts';
import { adminGameRuleRoutes } from './admin-game-rules.ts';
import { adminPlayerRoutes } from './admin-players.ts';
import { adminSystemRoutes } from './admin-system.ts';
import { authRoutes } from './auth.ts';
import { betRoutes } from './bets.ts';
import { gamePlayRoutes } from './games-play.ts';
import { publicRoutes } from './public.ts';
import { adminShopRoutes } from './admin-shops.ts';
import { shopRoutes } from './shop.ts';
import { cryptoRoutes } from './crypto.ts';
import { aggregatorRoutes } from './aggregator.ts';
import { apilxRoutes } from './apilx.ts';
import { videoRoutes } from './videos.ts';
import { aiRoutes } from './ai.ts';
import { giftRoutes } from './gift.ts';

export const allRoutes: Route[] = [
  ...publicRoutes,
  ...authRoutes,
  ...accountRoutes,
  ...adminPlayerRoutes,
  ...adminGameRuleRoutes,
  ...adminSystemRoutes,
  ...adminContentRoutes,
  ...adminShopRoutes,
  ...shopRoutes,
  ...gamePlayRoutes,
  ...betRoutes,
  ...cryptoRoutes,
  ...aggregatorRoutes,
  ...apilxRoutes,
  ...videoRoutes,
  ...aiRoutes,
  ...giftRoutes,
];
