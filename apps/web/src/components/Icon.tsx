import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'sports'
  | 'live'
  | 'casino'
  | 'liveCasino'
  | 'virtuals'
  | 'promo'
  | 'search'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'play'
  | 'user'
  | 'menu'
  | 'close'
  | 'sun'
  | 'moon'
  | 'globe'
  | 'cash'
  | 'shop'
  | 'ticket'
  | 'trophy'
  | 'lock'
  | 'trash'
  | 'info';

const PATHS: Record<IconName, ReactElement> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-5h4v5" />,
  sports: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7.5 3.6 2.6-1.4 4.2H9.8L8.4 10.1 12 7.5ZM12 3v4.5M3.6 9.8l4.8.3M20.4 9.8l-4.8.3M7 19l2.8-4.7M17 19l-2.8-4.7" />
    </>
  ),
  live: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M9 21h6M12 17v4M10.5 9.5v4l3.5-2-3.5-2Z" />
    </>
  ),
  casino: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="8.7" cy="8.7" r="1.1" fill="currentColor" />
      <circle cx="15.3" cy="8.7" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="8.7" cy="15.3" r="1.1" fill="currentColor" />
      <circle cx="15.3" cy="15.3" r="1.1" fill="currentColor" />
    </>
  ),
  liveCasino: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M18.4 5.6l-4.2 4.2M9.8 14.2l-4.2 4.2" />
    </>
  ),
  virtuals: (
    <>
      <path d="M4 9l8-5 8 5v8l-8 5-8-5V9Z" />
      <path d="M4 9l8 5 8-5M12 14v8" />
    </>
  ),
  promo: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12M12 8c-2-4-6-3-5 0 .5 1.3 3 1 5 0Zm0 0c2-4 6-3 5 0-.5 1.3-3 1-5 0Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </>
  ),
  shop: (
    <>
      <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5c0 1.7 1.3 2.8 2.7 2.8S9.4 11.2 9.4 9.5c0 1.7 1.2 2.8 2.6 2.8s2.6-1.1 2.6-2.8c0 1.7 1.3 2.8 2.7 2.8S20 11.2 20 9.5M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20" />
    </>
  ),
  ticket: (
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM14 6v12" />
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5c0 3 1.2 4.5 3.5 5M16 6h3.5c0 3-1.2 4.5-3.5 5M12 13v4M8.5 20h7M10 17h4v3h-4z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </>
  ),
};

export function Icon({ name, className, ...rest }: { name: IconName } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `icon ${className}` : 'icon'}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
