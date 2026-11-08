'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { MediaDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

async function uploadImage(file: File): Promise<MediaDTO> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/v1/admin/media', {
    method: 'POST',
    body: form,
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'x-aurum-client': 'web' },
  });
  const text = await res.text();
  let payload: { data?: { media?: MediaDTO }; media?: MediaDTO; error?: { code?: string; fields?: Record<string, string> } } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    throw new ApiError(res.status, 'internal_error');
  }
  if (!res.ok) throw new ApiError(res.status, payload.error?.code ?? 'internal_error', payload.error?.fields);
  const media = payload.data?.media ?? payload.media;
  if (!media) throw new ApiError(res.status, 'internal_error');
  return media;
}

export function ImagePicker({ label, value, onChange }: { label: string; value: MediaDTO | null; onChange: (media: MediaDTO | null) => void }) {
  const t = useTranslations('adminContent');
  const tRoot = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<MediaDTO[] | null>(null);

  function fail(err: unknown) {
    setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function toggleLibrary() {
    if (library) {
      setLibrary(null);
      return;
    }
    setError(null);
    try {
      const res = await apiClient<{ items: MediaDTO[] }>('/admin/media?limit=60');
      setLibrary(res.items);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="image-picker">
        <div className="image-picker-preview">
          {value ? <img src={value.url} alt="" /> : <span>{t('noImage')}</span>}
        </div>
        <div className="image-picker-actions">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? t('uploading') : t('chooseFile')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleLibrary()}>
            {t('fromLibrary')}
          </button>
          {value ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
              {t('removeImage')}
            </button>
          ) : null}
        </div>
      </div>
      <small className="muted">{t('imageHint')}</small>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {library ? (
        <div className="image-library">
          {library.length === 0 ? <span>{t('libraryEmpty')}</span> : null}
          {library.map((m) => (
            <button
              key={m.id}
              type="button"
              className="image-library-item"
              onClick={() => {
                onChange(m);
                setLibrary(null);
              }}
            >
              <img src={m.url} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
