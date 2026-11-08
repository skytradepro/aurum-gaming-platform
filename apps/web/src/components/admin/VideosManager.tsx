'use client';

import type { VideoSlotName, VideoSlots } from '@/lib/videos';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const SLOTS: VideoSlotName[] = ['home_casino', 'home_football', 'casino_hero', 'live_casino_hero', 'sports_hero', 'sports_side'];
const VARIANTS = ['desktop', 'mobile'] as const;
const CHUNK = 4 * 1024 * 1024;
const MAX_BYTES = 100 * 1024 * 1024;

function newUploadId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: 'include', headers: { ...(init.headers ?? {}), 'x-aurum-client': 'web', Accept: 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string } };
  if (!res.ok || !body.data) throw new Error(body.error?.code ?? `http_${res.status}`);
  return body.data;
}

export function VideosManager({ initial }: { initial: VideoSlots }) {
  const t = useTranslations('adminVideos');
  const [slots, setSlots] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(slot: VideoSlotName, variant: (typeof VARIANTS)[number], file: File) {
    if (file.size > MAX_BYTES) {
      setMessage({ ok: false, text: t('hint') });
      return;
    }
    const id = `${slot}:${variant}`;
    setBusy(id);
    setProgress(0);
    setMessage(null);
    try {
      const upload = newUploadId();
      const parts = Math.max(1, Math.ceil(file.size / CHUNK));
      for (let part = 0; part < parts; part++) {
        const blob = file.slice(part * CHUNK, Math.min(file.size, (part + 1) * CHUNK));
        const data = await call<{ done: boolean; slots?: VideoSlots }>(`/api/v1/admin/videos/${slot}/${variant}/chunk?upload=${upload}&part=${part}&parts=${parts}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob,
        });
        setProgress(Math.round(((part + 1) / parts) * 100));
        if (data.done && data.slots) setSlots(data.slots);
      }
      setMessage({ ok: true, text: t('saved') });
    } catch {
      setMessage({ ok: false, text: t('failed') });
    } finally {
      setBusy(null);
    }
  }

  async function mode(slot: VideoSlotName, variant: (typeof VARIANTS)[number], value: 'default' | 'off') {
    setBusy(`${slot}:${variant}`);
    setMessage(null);
    try {
      const data = await call<{ slots: VideoSlots }>(`/api/v1/admin/videos/${slot}/${variant}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: value }),
      });
      setSlots(data.slots);
      setMessage({ ok: true, text: t('saved') });
    } catch {
      setMessage({ ok: false, text: t('failed') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="vm-grid">
      <p className="muted">{t('hint')}</p>
      {message ? <div className={message.ok ? 'alert alert-success' : 'alert alert-error'}>{message.text}</div> : null}
      {SLOTS.map((slot) => (
        <section key={slot} className="card vm-slot">
          <h3>{t(`slot_${slot}`)}</h3>
          <div className="vm-variants">
            {VARIANTS.map((variant) => {
              const id = `${slot}:${variant}`;
              const current = slots[slot][variant];
              const working = busy === id;
              return (
                <div key={variant} className="vm-variant">
                  <strong>{t(variant)}</strong>
                  <div className={`vm-preview${variant === 'mobile' ? ' portrait' : ''}`}>
                    {current ? (
                      <video key={current.src} src={current.src} poster={current.poster ?? undefined} muted loop playsInline controls preload="metadata" />
                    ) : (
                      <span className="vm-off">{t('off')}</span>
                    )}
                  </div>
                  <span className="muted">{current ? (current.source === 'uploaded' ? t('sourceUploaded') : t('sourceDefault')) : t('off')}</span>
                  {working && progress > 0 ? (
                    <>
                      <div className="vm-progress" aria-hidden="true">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <span className="muted">{t('uploading', { percent: progress })}</span>
                    </>
                  ) : null}
                  <div className="vm-actions">
                    <input
                      ref={(el) => {
                        inputs.current[id] = el;
                      }}
                      type="file"
                      accept="video/mp4,video/webm"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void upload(slot, variant, file);
                      }}
                    />
                    <button type="button" className="btn btn-gold btn-sm" disabled={busy !== null} onClick={() => inputs.current[id]?.click()}>
                      {t('upload')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || current?.source === 'default'} onClick={() => void mode(slot, variant, 'default')}>
                      {t('reset')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || !current} onClick={() => void mode(slot, variant, 'off')}>
                      {t('turnOff')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
