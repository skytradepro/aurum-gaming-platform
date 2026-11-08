import type { EntryType, GameCategory, Permission, Role, ShopRole, UserStatus, WithdrawalStatus } from '@aurum/shared';

export interface MoneyDTO {
  amountMinor: string;
  currency: string;
}

export interface MediaDTO {
  id: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
}

export interface MeUser {
  id: string;
  accountNo: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  permissions: Permission[];
  status: UserStatus;
  accountCurrency: string | null;
  preferredLocale: string | null;
  displayCurrency: string | null;
  mustChangePassword: boolean;
  wallet: { id: string; currency: string; balance: MoneyDTO } | null;
  shop: { id: string; code: string; name: string; currency: string; status: string; role: ShopRole } | null;
}

export interface PublicConfig {
  languages: { code: string; nativeName: string; englishName: string; direction: 'ltr' | 'rtl'; isDefault: boolean }[];
  currencies: CurrencyDTO[];
  countries: { code: string; callingCode: string }[];
  registrationOpen: boolean;
  withdrawalsOpen: boolean;
  withdrawalExpiryHours: number;
  captcha: { enabled: boolean; siteKey: string | null };
  demo: boolean;
  inhouseGames: boolean;
  termsVersion: string;
  minAge: number;
  /** The daily gift page is open (older API versions do not send it). */
  giftEnabled?: boolean;
}

export interface CurrencyDTO {
  code: string;
  kind: 'fiat' | 'crypto';
  decimals: number;
  displayDecimals: number | null;
  names: Partial<Record<'en' | 'fr' | 'ar', string>>;
  display: {
    default: { symbol: string; placement: 'prefix' | 'suffix'; spacing: boolean };
    en?: { symbol: string; placement: 'prefix' | 'suffix'; spacing: boolean };
    fr?: { symbol: string; placement: 'prefix' | 'suffix'; spacing: boolean };
    ar?: { symbol: string; placement: 'prefix' | 'suffix'; spacing: boolean };
  };
  isEnabled: boolean;
  sortOrder: number;
}

export interface PublicBanner {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  linkUrl: string;
  alt: string;
  imageDesktop: MediaDTO;
  imageMobile: MediaDTO | null;
}

export interface PublicPromotion {
  slug: string;
  title: string;
  summary: string;
  image: MediaDTO | null;
  startsAt: string | null;
  endsAt: string | null;
  body?: string;
  terms?: string;
}

export interface GameItem {
  id: string;
  slug: string;
  name: string;
  provider: { id: string; slug: string; name: string };
  category: GameCategory;
  isFeatured: boolean;
  isNew: boolean;
  thumbnail: MediaDTO | null;
  art: Record<string, unknown>;
  isDemo: boolean;
}

export interface PlayerEntry {
  id: string;
  createdAt: string;
  entryType: EntryType;
  direction: 1 | -1;
  amount: MoneyDTO;
  balanceAfter: MoneyDTO;
  reference: string | null;
}

export interface WithdrawalItem {
  id: string;
  code: string;
  status: WithdrawalStatus;
  amount: MoneyDTO;
  createdAt: string;
  expiresAt: string;
  preferredShop: { id: string; code: string; name: string; city: string } | null;
  paidAt: string | null;
  paidShop: { id: string; code: string; name: string; city: string } | null;
  closedAt: string | null;
  closeReason: string | null;
}

export interface DashboardSummary {
  players: { total: number; byStatus: Record<UserStatus, number>; newLast7Days: number };
  balances: { currency: string; wallets: number; total: MoneyDTO }[];
  recentActivity: { currency: string; entryType: EntryType; entries: number; credited: MoneyDTO; debited: MoneyDTO }[];
  pendingWithdrawals: { currency: string; count: number; total: MoneyDTO }[];
  shopCash: { currency: string; shops: number; activeShops: number; total: MoneyDTO }[];
  generatedAt: string;
}
