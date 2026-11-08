/** Every page of the website (paths are relative to the language prefix, e.g. /en). */
import type { WebRoute } from './router.ts';
import * as account from './pages/account.ts';
import { adminRoutes } from './pages/admin/index.ts';
import * as auth from './pages/auth.ts';
import * as casino from './pages/casino.ts';
import { counterRoutes } from './pages/counter/index.ts';
import { homePage } from './pages/home.ts';
import * as info from './pages/info.ts';
import * as promos from './pages/promotions.ts';

const get = (path: string, handler: WebRoute['handler']): WebRoute => ({ method: 'GET', path, handler });
const post = (path: string, handler: WebRoute['handler']): WebRoute => ({ method: 'POST', path, handler });

export const webRoutes: WebRoute[] = [
  get('/', homePage),
  get('/casino', casino.casinoLobby),
  get('/casino/all', casino.casinoAll),
  get('/casino/search', casino.casinoSearch),
  get('/casino/providers', casino.casinoProviders),
  get('/casino/game/:slug', casino.gamePage),
  get('/casino/:view', casino.casinoView),
  get('/live-casino', casino.liveCasinoPage),
  get('/promotions', promos.promotionsPage),
  get('/promotions/:slug', promos.promotionPage),
  get('/sports', (ctx) => info.comingSoonPage(ctx, 'sports')),
  get('/live-betting', (ctx) => info.comingSoonPage(ctx, 'live-betting')),
  get('/virtuals', (ctx) => info.comingSoonPage(ctx, 'virtuals')),
  get('/live-channels', (ctx) => info.comingSoonPage(ctx, 'live-channels')),
  get('/page/:slug', info.infoPage),
  get('/shops', info.shopsPage),

  get('/login', auth.loginPage),
  post('/login', auth.loginSubmit),
  get('/register', auth.registerPage),
  post('/register', auth.registerSubmit),
  post('/logout', auth.logoutSubmit),
  post('/preferences/currency', auth.currencySubmit),
  post('/preferences/theme', auth.themeSubmit),

  get('/account', account.accountOverview),
  get('/account/transactions', account.accountTransactions),
  get('/account/withdrawals', account.accountWithdrawals),
  post('/account/withdrawals', account.requestWithdrawal),
  post('/account/withdrawals/:id/cancel', account.cancelWithdrawal),
  get('/account/profile', account.accountProfile),
  post('/account/profile', account.saveProfile),
  get('/account/password', account.passwordView),
  post('/account/password', account.passwordSubmit),

  ...adminRoutes,
  ...counterRoutes,
];
