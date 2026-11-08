/**
 * Transactional e-mail through Brevo's HTTP API (https://api.brevo.com/v3/smtp/email).
 * Off unless BREVO_API_KEY and MAIL_FROM_EMAIL are set (the sender must be verified in Brevo).
 * Sending never throws: a failed e-mail is logged and the caller carries on.
 */
import type { Config } from '../config.ts';

export interface MailInput {
  to: string;
  toName?: string | undefined;
  subject: string;
  html: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function mailEnabled(config: Config): boolean {
  return config.mail !== null;
}

export async function sendMail(config: Config, input: MailInput): Promise<boolean> {
  if (!config.mail) return false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.mail.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: config.mail.fromEmail, name: config.mail.fromName },
        to: [{ email: input.to, ...(input.toName ? { name: input.toName } : {}) }],
        subject: input.subject,
        htmlContent: input.html,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ time: new Date().toISOString(), level: 'warn', message: 'mail not sent', status: res.status }));
      return false;
    }
    return true;
  } catch (error) {
    console.error(JSON.stringify({ time: new Date().toISOString(), level: 'warn', message: 'mail error', error: error instanceof Error ? error.message : String(error) }));
    return false;
  }
}

const CODE_TEXT: Record<string, { subject: string; line1: (shop: string, amount: string) => string; line2: string; line3: string }> = {
  en: { subject: 'Your withdrawal code', line1: (s, a) => `${s} asks to pay you ${a} in cash. Your code:`, line2: 'Give it to the cashier only if you are at the counter now. It works once, for 10 minutes.', line3: 'Not you? Do not share this code, and refuse the request in your account.' },
  fr: { subject: 'Votre code de retrait', line1: (s, a) => `${s} demande à vous payer ${a} en espèces. Votre code :`, line2: 'Ne le donnez au caissier que si vous êtes au comptoir. Valable une fois, 10 minutes.', line3: 'Ce n’est pas vous ? Ne partagez pas ce code et refusez la demande dans votre compte.' },
  ar: { subject: 'كود السحب الخاص بك', line1: (s, a) => `${s} يطلب أن يدفع لك ${a} نقداً. الكود الخاص بك:`, line2: 'لا تعطه للكاشير إلا إذا كنت عند الصندوق الآن. صالح مرة واحدة لمدة 10 دقائق.', line3: 'لست أنت؟ لا تشارك هذا الكود، وارفض الطلب من حسابك.' },
  tr: { subject: 'Para çekme kodunuz', line1: (s, a) => `${s} size ${a} nakit ödemek istiyor. Kodunuz:`, line2: 'Kodu sadece şu an kasadaysanız kasiyere verin. Bir kez ve 10 dakika geçerlidir.', line3: 'Siz değil misiniz? Bu kodu paylaşmayın ve talebi hesabınızdan reddedin.' },
  ru: { subject: 'Ваш код для вывода', line1: (s, a) => `${s} хочет выдать вам ${a} наличными. Ваш код:`, line2: 'Называйте его кассиру, только если вы сейчас у кассы. Код действует один раз, 10 минут.', line3: 'Это не вы? Не сообщайте код и отклоните запрос в своём аккаунте.' },
};

/** The one-time code for a withdrawal a shop asked for, in the player's language. */
export function approvalCodeMail(locale: string | null, shop: string, amount: string, code: string): { subject: string; html: string } {
  const t = CODE_TEXT[locale ?? 'en'] ?? (CODE_TEXT.en as (typeof CODE_TEXT)['en']);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const html = `<!doctype html><html dir="${dir}"><body style="margin:0;background:#0b0b10;font-family:Arial,sans-serif;color:#f5f5f5">
<div style="max-width:480px;margin:0 auto;padding:24px">
<p style="font-size:13px;letter-spacing:4px;color:#e9c46a;margin:0 0 12px">HANNIBAL</p>
<p style="font-size:16px;margin:0 0 12px">${escapeHtml(t.line1(shop, amount))}</p>
<p dir="ltr" style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#ffd54a;margin:8px 0 16px;text-align:center">${escapeHtml(code)}</p>
<p style="font-size:14px;margin:0 0 8px">${escapeHtml(t.line2)}</p>
<p style="font-size:13px;color:#fca5a5;margin:0">${escapeHtml(t.line3)}</p>
</div></body></html>`;
  return { subject: t.subject, html };
}
