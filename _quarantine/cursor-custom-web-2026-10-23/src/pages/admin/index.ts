/** Routes of the Super Admin / Admin dashboard (every page checks the permission it needs). */
import type { WebRoute } from '../../router.ts';
import * as content from './content.ts';
import * as dash from './dashboard.ts';
import * as games from './games.ts';
import * as ledger from './ledger.ts';
import * as players from './players.ts';
import * as shops from './shops.ts';
import * as system from './system.ts';
import * as withdrawals from './withdrawals.ts';

const get = (path: string, handler: WebRoute['handler']): WebRoute => ({ method: 'GET', path, handler });
const post = (path: string, handler: WebRoute['handler']): WebRoute => ({ method: 'POST', path, handler });

export const adminRoutes: WebRoute[] = [
  get('/admin', dash.dashboardPage),
  post('/admin/health', dash.healthCheck),
  get('/admin/reports', dash.reportsPage),

  get('/admin/players', players.playersPage),
  get('/admin/players/:id', players.playerPage),
  post('/admin/players/:id/balance', players.postBalance),
  post('/admin/players/:id/status', players.postStatus),
  post('/admin/players/:id/contact', players.postContact),
  post('/admin/players/:id/reset-password', players.postResetPassword),
  get('/admin/ledger', ledger.ledgerPage),
  get('/admin/ledger.csv', ledger.ledgerCsv),
  get('/admin/audit', ledger.auditPage),

  get('/admin/withdrawals', withdrawals.withdrawalsPage),
  get('/admin/withdrawals/:id', withdrawals.withdrawalPage),
  post('/admin/withdrawals/:id/reject', withdrawals.rejectWithdrawal),

  get('/admin/shops', shops.shopsPage),
  get('/admin/shops/new', shops.newShopPage),
  post('/admin/shops/new', shops.createShop),
  get('/admin/shops/:id', shops.shopPage),
  get('/admin/shops/:id/edit', shops.editShopPage),
  post('/admin/shops/:id/edit', shops.updateShop),
  post('/admin/shops/:id/cash', shops.postShopCash),
  post('/admin/shops/:id/count', shops.postCount),
  post('/admin/shops/:id/workers', shops.postWorker),
  get('/admin/workers', shops.workersPage),
  get('/admin/workers/:id', shops.workerPage),
  post('/admin/workers/:id', shops.updateWorker),
  post('/admin/workers/:id/reset-password', shops.resetWorkerPassword),
  get('/admin/shop-cash', shops.shopCashPage),

  get('/admin/banners', content.bannersPage),
  get('/admin/banners/new', content.newBannerPage),
  post('/admin/banners/new', content.createBanner),
  get('/admin/banners/:id', content.bannerPage),
  post('/admin/banners/:id', content.updateBanner),
  post('/admin/banners/:id/delete', content.deleteBanner),
  get('/admin/promotions', content.promotionsAdminPage),
  get('/admin/promotions/new', content.newPromotionPage),
  post('/admin/promotions/new', content.createPromotion),
  get('/admin/promotions/:id', content.promotionAdminPage),
  post('/admin/promotions/:id', content.updatePromotion),
  post('/admin/promotions/:id/delete', content.deletePromotion),
  get('/admin/pages', content.pagesAdminPage),
  get('/admin/pages/:slug', content.pageEditPage),
  post('/admin/pages/:slug', content.savePage),
  get('/admin/media', (ctx) => content.mediaPage(ctx)),
  post('/admin/media', content.uploadMedia),

  get('/admin/games', games.gamesAdminPage),
  get('/admin/games/new', games.newGamePage),
  post('/admin/games/new', games.createGame),
  get('/admin/games/:id', games.gameAdminPage),
  post('/admin/games/:id', games.updateGame),
  get('/admin/providers', games.providersPage),
  post('/admin/providers', games.saveProvider),
  post('/admin/providers/:id', games.saveProvider),

  get('/admin/staff', system.staffPage),
  post('/admin/staff', system.createStaff),
  get('/admin/staff/:id', system.staffMemberPage),
  post('/admin/staff/:id', system.updateStaff),
  post('/admin/staff/:id/reset-password', system.resetStaffPassword),
  get('/admin/currencies', system.currenciesPage),
  get('/admin/currencies/new', system.newCurrencyPage),
  post('/admin/currencies/new', system.createCurrency),
  get('/admin/currencies/:code', system.currencyPage),
  post('/admin/currencies/:code', system.updateCurrency),
  get('/admin/rates', system.ratesPage),
  post('/admin/rates', system.addRate),
  get('/admin/languages', system.languagesPage),
  post('/admin/languages/:code', system.updateLanguage),
  get('/admin/countries', system.countriesPage),
  post('/admin/countries/:code', system.updateCountry),
  get('/admin/settings', (ctx) => system.settingsPage(ctx)),
  post('/admin/settings', system.saveSettings),
];
