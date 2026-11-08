/**
 * Shapes of the API responses the website reads. They are imported as TYPES ONLY from the API
 * source (erased at run time), so the website and the API cannot silently disagree: changing a
 * response breaks the type check of the pages that use it.
 */
export type { MeDTO as Me } from '../../api/src/services/accounts.ts';
export type { PublicConfigDTO as PublicConfig, DemoJackpotDTO, DemoWinnerDTO } from '../../api/src/services/public.ts';
export type { CurrencyDTO as Currency } from '../../api/src/services/currencies.ts';
export type { BannerDTO, PageDTO, PromotionDTO, PublicBannerDTO, PublicPageDTO, PublicPromotionDTO } from '../../api/src/services/content.ts';
export type { GameDTO, ProviderDTO } from '../../api/src/services/games.ts';
export type { MediaDTO } from '../../api/src/services/media.ts';
export type { LedgerEntryDTO, Page, PlayerEntryDTO, StaffEntryResult } from '../../api/src/services/balances.ts';
export type { PlayerDetailDTO, PlayerListItemDTO, StaffDTO } from '../../api/src/services/users.ts';
export type { AuditEntryDTO, DashboardDTO, LedgerHealthDTO } from '../../api/src/services/reports.ts';
export type { CountryDTO, LanguageDTO, RateDTO, Settings } from '../../api/src/services/settings.ts';
export type { CashCountDTO, PublicShopDTO, ShopCashEntryDTO, ShopDTO, ShopReportDTO, WorkerDTO } from '../../api/src/services/shops.ts';
export type { PayoutLookupDTO, PayoutResult, StaffWithdrawalDTO, WithdrawalDTO } from '../../api/src/services/withdrawals.ts';
export type { CounterDepositResult, CounterPlayerDTO, CounterSummaryDTO } from '../../api/src/services/cashier.ts';
export type { Indicative } from '../../api/src/services/rates.ts';
