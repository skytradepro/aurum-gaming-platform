/** Brand-coloured icons for the contact channels (simple vector marks, no external files). */
export function WhatsAppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path fill="#fff" d="M16 3.2A12.7 12.7 0 0 0 5.1 22.4L3.4 28.6l6.4-1.7A12.7 12.7 0 1 0 16 3.2Z" />
      <path fill="currentColor" d="M16 5.3a10.6 10.6 0 0 0-9 16.3l.3.4-1 3.7 3.8-1 .4.2A10.6 10.6 0 1 0 16 5.3Zm6.2 15c-.3.8-1.5 1.5-2.1 1.5-.6.1-1.3.1-2-.1-.5-.2-1.1-.4-1.9-.7-3.3-1.4-5.5-4.8-5.6-5-.2-.2-1.4-1.8-1.4-3.4s.8-2.4 1.1-2.7c.3-.3.6-.4.8-.4h.6c.2 0 .4-.1.7.5l.9 2.2c.1.2.1.4 0 .6l-.3.5-.5.5c-.1.2-.3.3-.1.6.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.3.7-.2l2.1 1c.3.2.5.2.6.4.1.1.1.8-.2 1.6Z" />
    </svg>
  );
}

export function TelegramIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="currentColor" />
      <path fill="#fff" d="M22.9 10.1 7.9 15.9c-1 .4-1 1 0 1.3l3.8 1.2 1.5 4.5c.2.5.1.7.6.7.4 0 .6-.2.8-.4l1.9-1.8 3.9 2.9c.7.4 1.2.2 1.4-.7l2.5-11.9c.3-1.1-.4-1.6-1.4-1.6Zm-2.6 3.2-7 6.3-.3 3-1.4-4.3 8.1-5.1c.4-.2.7 0 .6.1Z" />
    </svg>
  );
}

export function MailIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
