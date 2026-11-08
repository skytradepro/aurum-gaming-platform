'use client';

import { LOCALES, errorMessageKey } from '@aurum/i18n';
import { ImagePicker } from '@/components/admin/ImagePicker';
import { ApiError, apiClient } from '@/lib/api';
import { toIso, toLocalInput } from '@/lib/admin-content';
import type { AdminPromotion, AdminPromotionTranslation } from '@/lib/admin-content';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const emptyTr = (): AdminPromotionTranslation => ({ title: '', summary: '', body: '', terms: '', image: null });

interface FormState {
  id: string | null;
  slug: string;
  sortOrder: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
  tr: Record<string, AdminPromotionTranslation>;
}

function blank(): FormState {
  return { id: null, slug: '', sortOrder: '0', isActive: true, startsAt: '', endsAt: '', tr: Object.fromEntries(LOCALES.map((l) => [l, emptyTr()])) };
}

function fromPromotion(p: AdminPromotion): FormState {
  return {
    id: p.id,
    slug: p.slug,
    sortOrder: String(p.sortOrder),
    isActive: p.isActive,
    startsAt: toLocalInput(p.startsAt),
    endsAt: toLocalInput(p.endsAt),
    tr: Object.fromEntries(LOCALES.map((l) => [l, { ...emptyTr(), ...(p.translations[l] ?? {}) }])),
  };
}

export function PromotionsManager({ initial }: { initial: AdminPromotion[] }) {
  const t = useTranslations('adminContent');
  const tAdmin = useTranslations('admin');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [locale, setLocale] = useState<string>(LOCALES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function fail(err: unknown) {
    if (err instanceof ApiError) {
      const fields = err.fields ? ` (${Object.keys(err.fields).join(', ')})` : '';
      setError(`${tRoot(errorMessageKey(err.code) as never)}${fields}`);
    } else {
      setError(tRoot('errors.generic' as never));
    }
  }

  function patchTr(loc: string, patch: Partial<AdminPromotionTranslation>) {
    setForm((f) => (f ? { ...f, tr: { ...f.tr, [loc]: { ...(f.tr[loc] ?? emptyTr()), ...patch } } } : f));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setNotice(null);
    const first = form.tr[LOCALES[0]] ?? emptyTr();
    if (!first.title.trim()) {
      setLocale(LOCALES[0]);
      setError(t('needDefaultTitle'));
      return;
    }
    const translations: Record<string, unknown> = {};
    for (const loc of LOCALES) {
      const x = form.tr[loc] ?? emptyTr();
      if (loc !== LOCALES[0] && !x.title.trim()) continue;
      translations[loc] = { title: x.title, summary: x.summary, body: x.body, terms: x.terms, ...(x.image ? { imageId: x.image.id } : {}) };
    }
    const json = {
      slug: form.slug.trim().toLowerCase(),
      sortOrder: Number.parseInt(form.sortOrder || '0', 10) || 0,
      isActive: form.isActive,
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt),
      translations,
    };
    setBusy(true);
    try {
      if (form.id) await apiClient(`/admin/promotions/${form.id}`, { method: 'PUT', json });
      else await apiClient('/admin/promotions', { method: 'POST', json });
      setForm(null);
      setNotice(t('saved'));
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: AdminPromotion) {
    if (!window.confirm(t('confirmDelete'))) return;
    setError(null);
    setNotice(null);
    try {
      await apiClient(`/admin/promotions/${p.id}`, { method: 'DELETE' });
      setNotice(t('deleted'));
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  const cur = form ? (form.tr[locale] ?? emptyTr()) : emptyTr();

  return (
    <>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      {!form ? (
        <>
          <p>
            <button type="button" className="btn btn-gold" onClick={() => { setForm(blank()); setLocale(LOCALES[0]); setNotice(null); }}>
              {t('newPromotion')}
            </button>
          </p>
          {initial.length === 0 ? <p className="muted">{t('noPromotions')}</p> : null}
          {initial.length > 0 ? (
            <table className="card" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{t('image')}</th>
                  <th>{t('title')}</th>
                  <th>{t('slug')}</th>
                  <th>{t('sortOrder')}</th>
                  <th>{tCommon('status')}</th>
                  <th>{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {initial.map((p) => {
                  const base = p.translations[LOCALES[0]];
                  return (
                    <tr key={p.id}>
                      <td>{base?.image ? <img className="admin-thumb" src={base.image.url} alt="" /> : '—'}</td>
                      <td>{base?.title ?? '—'}</td>
                      <td>{p.slug}</td>
                      <td>{p.sortOrder}</td>
                      <td>{p.isActive ? tCommon('active') : tCommon('inactive')}</td>
                      <td className="admin-actions">
                        <button type="button" className="btn btn-dark btn-sm" onClick={() => { setForm(fromPromotion(p)); setLocale(LOCALES[0]); setNotice(null); }}>
                          {tCommon('edit')}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(p)}>
                          {tCommon('delete')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </>
      ) : (
        <form className="card" onSubmit={(e) => void save(e)}>
          <h2>{form.id ? t('editPromotion') : t('newPromotion')}</h2>
          <div className="admin-cols">
            <div className="field">
              <label>{t('slug')}</label>
              <input value={form.slug} maxLength={80} required pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('sortOrder')}</label>
              <input type="number" value={form.sortOrder} min={-10000} max={10000} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('startsAt')}</label>
              <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('endsAt')}</label>
              <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </div>
            <div className="field">
              <label>{tCommon('status')}</label>
              <select value={form.isActive ? '1' : '0'} onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}>
                <option value="1">{tCommon('active')}</option>
                <option value="0">{tCommon('inactive')}</option>
              </select>
            </div>
          </div>

          <h3>{t('languageVersion')}</h3>
          <div className="admin-tabs" role="tablist">
            {LOCALES.map((l) => (
              <button key={l} type="button" role="tab" aria-selected={l === locale} className={l === locale ? 'btn btn-gold btn-sm' : 'btn btn-dark btn-sm'} onClick={() => setLocale(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <div className="field">
              <label>{t('title')}</label>
              <input value={cur.title} maxLength={160} onChange={(e) => patchTr(locale, { title: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('summary')}</label>
              <input value={cur.summary} maxLength={400} onChange={(e) => patchTr(locale, { summary: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('body')}</label>
              <textarea rows={8} value={cur.body} maxLength={20000} onChange={(e) => patchTr(locale, { body: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('terms')}</label>
              <textarea rows={5} value={cur.terms} maxLength={20000} onChange={(e) => patchTr(locale, { terms: e.target.value })} />
            </div>
            <ImagePicker label={t('image')} value={cur.image} onChange={(m) => patchTr(locale, { image: m })} />
          </div>

          <p className="admin-actions">
            <button type="submit" className="btn btn-gold" disabled={busy}>
              {tAdmin('savePromotion')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setForm(null); setError(null); }}>
              {tCommon('cancel')}
            </button>
          </p>
        </form>
      )}
    </>
  );
}
