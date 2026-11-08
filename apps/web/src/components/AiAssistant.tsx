'use client';

import '@/styles/joker.css';
import { ApiError, apiClient } from '@/lib/api';
import { Link } from '@/i18n/routing';
import type { Locale } from '@aurum/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AI_OPEN_EVENT } from './game/GameInfo';
import { JokerArt } from './JokerArt';

/** Topics the player can pick (each sends a ready question) and quick links to the right page. */
const TOPICS = [
  { key: 'deposit', icon: '💳' },
  { key: 'withdraw', icon: '💵' },
  { key: 'sports', icon: '⚽' },
  { key: 'live', icon: '🔴' },
  { key: 'games', icon: '🎰' },
  { key: 'bonus', icon: '🎁' },
  { key: 'shop', icon: '🏪' },
  { key: 'safe', icon: '🛡️' },
] as const;
const LINKS = [
  { key: 'l_deposit', href: '/account/deposits' },
  { key: 'l_withdraw', href: '/account/withdrawals' },
  { key: 'l_bets', href: '/account/bets' },
  { key: 'l_promos', href: '/promotions' },
  { key: 'l_shops', href: '/shops' },
  { key: 'l_contact', href: '/contact' },
] as const;

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const STORE = 'hannibal-ai-chat';

/** Floating "Hannibal AI" help chat. Answers come from the API (/v1/ai/chat); nothing is sent before the player asks. */
export function AiAssistant() {
  const t = useTranslations('ai');
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [page, setPage] = useState<string | null>(null);
  const [topics, setTopics] = useState(false);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as unknown;
      if (Array.isArray(saved)) setMsgs(saved.filter((m): m is Msg => !!m && typeof m === 'object' && typeof (m as Msg).content === 'string').slice(-20));
    } catch {
      /* no saved chat */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-20)));
    } catch {
      /* storage unavailable */
    }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  useEffect(() => {
    if (open) input.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ page?: string; question?: string }>).detail ?? {};
      setPage(d.page ?? null);
      setOpen(true);
      if (d.question) pending.current = d.question;
    };
    window.addEventListener(AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(AI_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open && pending.current) {
      const q = pending.current;
      pending.current = null;
      void send(q);
    }
  });

  async function send(content: string) {
    const q = content.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q.slice(0, 1000) }];
    setMsgs(next);
    setText('');
    setBusy(true);
    setError(false);
    try {
      const res = await apiClient<{ reply: string }>('/ai/chat', { method: 'POST', locale, json: { locale, messages: next.slice(-10), ...(page ? { page: page.slice(0, 400) } : {}) } });
      setMsgs([...next, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      setError(true);
      if (!(e instanceof ApiError)) console.warn(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`ai-fab is-joker${open ? ' is-open' : ''}`} aria-label={open ? t('close') : t('open')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <JokerArt className="ai-fab-joker" />
        <span className="ai-fab-label">AI</span>
      </button>
      {open ? (
        <section className="ai-panel is-joker" role="dialog" aria-label={t('title')}>
          <header className="ai-head">
            <span className="ai-avatar is-big">
              <JokerArt />
              <i className="ai-online" aria-hidden="true" />
            </span>
            <div>
              <strong>{t('title')}</strong>
              <span>{t('subtitle')}</span>
            </div>
            <button type="button" className={`ai-x${topics ? ' on' : ''}`} onClick={() => setTopics((v) => !v)} title={t('topics')} aria-label={t('topics')} aria-pressed={topics}>
              ☰
            </button>
            <button type="button" className="ai-x" onClick={() => setMsgs([])} title={t('clear')} aria-label={t('clear')}>
              ↺
            </button>
            <button type="button" className="ai-x" onClick={() => setOpen(false)} aria-label={t('close')}>
              ×
            </button>
          </header>
          <div className="ai-list" ref={list} aria-live="polite">
            <div className="ai-row assistant">
              <span className="ai-avatar" aria-hidden="true">
                <JokerArt />
              </span>
              <div className="ai-msg assistant">{t('hello')}</div>
            </div>
            {msgs.map((m, i) =>
              m.role === 'assistant' ? (
                <div key={i} className="ai-row assistant">
                  <span className="ai-avatar" aria-hidden="true">
                    <JokerArt />
                  </span>
                  <div className="ai-msg assistant">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="ai-msg user">
                  {m.content}
                </div>
              ),
            )}
            {busy ? (
              <div className="ai-row assistant">
                <span className="ai-avatar" aria-hidden="true">
                  <JokerArt />
                </span>
                <div className="ai-msg assistant ai-typing">
                  <span className="ai-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  {t('thinking')}
                </div>
              </div>
            ) : null}
            {error ? <div className="ai-msg ai-error">{t('error')}</div> : null}
            {msgs.length === 0 || topics ? (
              <div className="ai-topics">
                {TOPICS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setTopics(false);
                      void send(t(`q_${c.key}`));
                    }}
                  >
                    <span aria-hidden="true">{c.icon}</span>
                    {t(`t_${c.key}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <nav className="ai-links" aria-label={t('topics')}>
            {LINKS.map((l) => (
              <Link key={l.key} href={l.href} onClick={() => setOpen(false)}>
                {t(l.key)}
              </Link>
            ))}
          </nav>
          <form
            className="ai-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <textarea
              ref={input}
              className="input"
              rows={1}
              maxLength={1000}
              value={text}
              placeholder={t('placeholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
            />
            <button type="submit" className="btn btn-gold" disabled={busy || !text.trim()}>
              {t('send')}
            </button>
          </form>
          <p className="ai-note">{t('note')}</p>
        </section>
      ) : null}
    </>
  );
}
