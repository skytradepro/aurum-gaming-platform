/**
 * Hannibal AI: a help assistant for players (games, deposits, withdrawals, accounts), through OpenRouter.
 * The key stays on the server. The assistant never sees balances or personal data, and it cannot place bets.
 */
import { AppError } from '@aurum/shared';
import type { Ctx } from '../http/types.ts';
import { listNetworks } from './crypto.ts';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GAMES =
  'Hannibal Wheel, Hannibal Slots, Dice, Coin Flip, Crash, Roulette, Plinko, Keno, Mines, Dragon Tiger, Baccarat, Sic Bo, Pair Plus Poker, Lucky Scratch, Gold Rush, Power Strike, Raptor Run, Sugar Pop, Thunder Gods, Deep Sea Gold, Aztec Gems, Hot Fruits, Book of Sands, Andar Bahar, Casino War';

const LANG: Record<string, string> = { ar: 'Arabic (a Tunisian player may write in Tunisian dialect; answer in clear Arabic)', fr: 'French', en: 'English', ru: 'Russian', tr: 'Turkish' };

async function systemPrompt(ctx: Ctx, locale: string): Promise<string> {
  let coins = 'USDT (TRC20), BTC, ETH, BNB, SUSDT, USDT (BEP20)';
  try {
    const nets = await listNetworks(ctx.db);
    if (nets.length > 0) coins = nets.map((n) => `${n.coin} (${n.chain.toUpperCase()})`).join(', ');
  } catch {
    /* keep the default list */
  }
  return [
    'You are "Joker" (Hannibal Joker, also called Hannibal AI), the friendly player support assistant of Hannibal, an online casino and sportsbook (website sections: Home, Sports Betting, Live Betting, Casino, Live Casino, Promotions, Account). In Arabic your name is "الجوكر".',
    'In Arabic the brand name is written "حنبعل" (never "هانيبال"). In English and French it is "Hannibal".',
    `Reply in ${LANG[locale] ?? 'the language the player writes in'}, unless the player writes in another language: then use theirs. Be short, warm and clear (at most 6 sentences or a short list).`,
    'Write plain text only: no Markdown (no **, #, tables); use simple numbered lines when listing steps.',
    'Facts you may use:',
    '- Players must be 18 or older. Gambling can be addictive; encourage playing for fun with a budget.',
    `- Hannibal games (casino page): ${GAMES}. Each round is decided by the server's random draw; nobody, including Hannibal and you, can predict or change a result.`,
    '- How Hannibal games are played: enter a stake (or use Min, ½, 2×, Max), pick the bet with the buttons on the page, then press the play button (for example SPIN). There are no chips to drag. Each game page shows its payouts and return to player.',
    '- Sports: pre-match and live football odds. Tap a match to open its match centre (score, minute, goals, yellow and red cards, statistics) and every market: match result, double chance, draw no bet, total goals, both teams to score, first and second half, half time / full time, correct score, team goals, odd / even, corners, cards and, during the match, next goal. Add prices to the bet slip (one match = single, several matches = accumulator) and confirm the stake.',
    '- Live bets are checked again a few seconds after the player confirms: if a goal is scored or the price is suspended in that time, the bet is cancelled and nothing is taken. Markets count the 90 minutes plus added time.',
    '- Deposits: cash at a Hannibal shop (the cashier credits the account), or crypto from Account > Deposits: request an exact amount, send it, then paste the transaction ID; it is credited automatically after confirmations. Coins: ' + coins + '.',
    '- Withdrawals: requested from the account and collected in cash at a Hannibal shop with a code and ID.',
    '- Bonuses and offers: only what the Promotions page shows. Do not invent bonuses, amounts or dates.',
    'Rules you must follow:',
    '- Never claim or imply a way to win more, a strategy that beats the games, "lucky" picks, or guaranteed profit. If asked, explain results are random and suggest playing responsibly.',
    '- Never ask for or accept passwords, seed phrases, private keys, card numbers or ID documents. Hannibal never asks for them.',
    '- You cannot see balances, bets or account data and cannot make transactions. For account problems, tell the player to contact a Hannibal shop or support.',
    '- If a player seems to lose control, chase losses, or be in distress, respond with care, suggest a break and the Responsible gaming page, and do not encourage more play.',
    '- Do not help with cheating, multiple accounts, bonus abuse or anything illegal. Do not give legal or financial advice.',
    '- If you do not know something about Hannibal, say so instead of guessing.',
  ].join('\n');
}

export async function aiChat(ctx: Ctx, input: { messages: ChatMessage[]; locale: string; page?: string | undefined }): Promise<{ reply: string }> {
  const cfg = ctx.config.ai;
  if (!cfg) throw new AppError('provider_unavailable', { message: 'OPENROUTER_API_KEY is not set' });
  const who = ctx.user?.id ?? ctx.ip;
  const limit = ctx.services.limiter.hit(`ai:${who}`, 20, 10 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const history = input.messages.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  if (history.length === 0 || history[history.length - 1]?.role !== 'user') throw new AppError('validation', { fields: { messages: 'invalidFormat' } });

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        'content-type': 'application/json',
        'x-title': 'Hannibal',
        ...(ctx.config.webOrigins[0] ? { 'http-referer': ctx.config.webOrigins[0] } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 450,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              (await systemPrompt(ctx, input.locale)) +
              (input.page ? `\nThe player is now on this game page (use it to explain the game; do not promise wins): ${input.page.slice(0, 400)}` : ''),
          },
          ...history,
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new AppError('provider_unavailable', { message: 'AI provider unreachable', cause: error });
  }
  if (!res.ok) {
    ctx.services.logger.warn('ai provider error', { status: res.status });
    throw new AppError('provider_unavailable', { message: `AI provider replied ${res.status}` });
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new AppError('provider_unavailable', { message: 'empty AI reply' });
  return { reply: reply.trim().slice(0, 4000) };
}
