'use client';

import '@/styles/admin-banners.css';
import { LOCALES, errorMessageKey } from '@aurum/i18n';
import { BANNER_PLACEMENTS } from '@aurum/shared';
import { ImagePicker } from '@/components/admin/ImagePicker';
import { ApiError, apiClient } from '@/lib/api';
import { toIso, toLocalInput } from '@/lib/admin-content';
import type { AdminBanner, AdminBannerTranslation } from '@/lib/admin-content';
import type { MediaDTO } from '@/lib/types';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const emptyTr = (): AdminBannerTranslation => ({ title: '', subtitle: '', ctaLabel: '', linkUrl: '', altText: '', imageDesktop: null, imageMobile: null });

interface FormState {
  id: string | null;
  placement: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
  tr: Record<string, AdminBannerTranslation>;
}

function blank(placement: string = BANNER_PLACEMENTS[0]): FormState {
  return { id: null, placement, name: '', sortOrder: '0', isActive: true, startsAt: '', endsAt: '', tr: Object.fromEntries(LOCALES.map((l) => [l, emptyTr()])) };
}

/** Best picture sizes of each place (desktop, phone), matching how the site shows it. */
const SIZES: Record<string, [string, string]> = {
  home_hero: ['1920 × 620', '1080 × 920'],
  casino_hero: ['1920 × 650', '1080 × 650'],
  live_casino_hero: ['1920 × 650', '1080 × 650'],
  sports_hero: ['1920 × 650', '1080 × 650'],
  home_promo: ['1920 × 840', '1080 × 608'],
  promotions_hero: ['1920 × 840', '1080 × 608'],
};

type BannerState = 'live' | 'off' | 'scheduled' | 'ended';
function stateOf(b: AdminBanner, now: number): BannerState {
  if (!b.isActive) return 'off';
  if (b.startsAt && Date.parse(b.startsAt) > now) return 'scheduled';
  if (b.endsAt && Date.parse(b.endsAt) < now) return 'ended';
  return 'live';
}

/** The request body of a banner (same fields as the form sends), with some fields changed. */
function bodyOf(b: AdminBanner, patch: Partial<{ name: string; sortOrder: number; isActive: boolean }> = {}) {
  const translations: Record<string, unknown> = {};
  for (const loc of LOCALES) {
    const x = b.translations[loc];
    if (!x || (!x.title.trim() && !x.imageDesktop)) continue;
    translations[loc] = {
      title: x.title,
      subtitle: x.subtitle,
      ctaLabel: x.ctaLabel,
      linkUrl: x.linkUrl,
      altText: x.altText,
      ...(x.imageDesktop ? { imageDesktopId: x.imageDesktop.id } : {}),
      ...(x.imageMobile ? { imageMobileId: x.imageMobile.id } : {}),
    };
  }
  return {
    placement: b.placement,
    name: patch.name ?? b.name,
    sortOrder: patch.sortOrder ?? b.sortOrder,
    isActive: patch.isActive ?? b.isActive,
    ...(b.startsAt ? { startsAt: b.startsAt } : {}),
    ...(b.endsAt ? { endsAt: b.endsAt } : {}),
    translations,
  };
}

function fromBanner(b: AdminBanner): FormState {
  return {
    id: b.id,
    placement: b.placement,
    name: b.name,
    sortOrder: String(b.sortOrder),
    isActive: b.isActive,
    startsAt: toLocalInput(b.startsAt),
    endsAt: toLocalInput(b.endsAt),
    tr: Object.fromEntries(LOCALES.map((l) => [l, { ...emptyTr(), ...(b.translations[l] ?? {}) }])),
  };
}

export function BannersManager({ initial }: { initial: AdminBanner[] }) {
  const t = useTranslations('adminContent');
  const tAdmin = useTranslations('admin');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const tb = useTranslations('adminBanners');
  const router = useRouter();
  const [filter, setFilter] = useState<string>('all');
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

  function patchTr(loc: string, patch: Partial<AdminBannerTranslation>) {
    setForm((f) => (f ? { ...f, tr: { ...f.tr, [loc]: { ...(f.tr[loc] ?? emptyTr()), ...patch } } } : f));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setNotice(null);
    const first = form.tr[LOCALES[0]] ?? emptyTr();
    if (!first.imageDesktop) {
      setLocale(LOCALES[0]);
      setError(t('needDefault'));
      return;
    }
    const translations: Record<string, unknown> = {};
    for (const loc of LOCALES) {
      const x = form.tr[loc] ?? emptyTr();
      if (loc !== LOCALES[0] && !x.title.trim() && !x.imageDesktop) continue;
      translations[loc] = {
        title: x.title,
        subtitle: x.subtitle,
        ctaLabel: x.ctaLabel,
        linkUrl: x.linkUrl,
        altText: x.altText,
        ...(x.imageDesktop ? { imageDesktopId: x.imageDesktop.id } : {}),
        ...(x.imageMobile ? { imageMobileId: x.imageMobile.id } : {}),
      };
    }
    const json = {
      placement: form.placement,
      name: form.name,
      sortOrder: Number.parseInt(form.sortOrder || '0', 10) || 0,
      isActive: form.isActive,
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt),
      translations,
    };
    setBusy(true);
    try {
      if (form.id) await apiClient(`/admin/banners/${form.id}`, { method: 'PUT', json });
      else await apiClient('/admin/banners', { method: 'POST', json });
      setForm(null);
      setNotice(t('saved'));
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: AdminBanner) {
    if (!window.confirm(t('confirmDelete'))) return;
    setError(null);
    setNotice(null);
    try {
      await apiClient(`/admin/banners/${b.id}`, { method: 'DELETE' });
      setNotice(t('deleted'));
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  const cur = form ? (form.tr[locale] ?? emptyTr()) : emptyTr();
  const now = Date.now();
  const groups = BANNER_PLACEMENTS.map((p) => ({ placement: p, list: initial.filter((b) => b.placement === p).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) }));
  const shownGroups = groups.filter((g) => filter === 'all' || g.placement === filter);

  async function quick(run: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await run();
      setNotice(t('saved'));
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  // move a banner one place up or down inside its place: the whole group gets clean numbers 10, 20, 30 …
  function move(list: AdminBanner[], index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const order = [...list];
    const [item] = order.splice(index, 1);
    if (!item) return;
    order.splice(target, 0, item);
    void quick(async () => {
      for (let i = 0; i < order.length; i += 1) {
        const b = order[i] as AdminBanner;
        const sortOrder = (i + 1) * 10;
        if (b.sortOrder !== sortOrder) await apiClient(`/admin/banners/${b.id}`, { method: 'PUT', json: bodyOf(b, { sortOrder }) });
      }
    });
  }

  return (
    <>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      {!form ? (
        <>
          <div className="abn-top">
            <button type="button" className="btn btn-gold" onClick={() => { setForm(blank(filter === 'all' ? BANNER_PLACEMENTS[0] : filter)); setLocale(LOCALES[0]); setNotice(null); }}>
              + {t('newBanner')}
            </button>
            <div className="abn-filters" role="tablist">
              <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                {tb('all')} <sup>{initial.length}</sup>
              </button>
              {groups.map((g) => (
                <button key={g.placement} type="button" role="tab" aria-selected={filter === g.placement} className={filter === g.placement ? 'on' : ''} onClick={() => setFilter(g.placement)}>
                  {t(`placement_${g.placement}` as never)} <sup>{g.list.length}</sup>
                </button>
              ))}
            </div>
          </div>
          {shownGroups.map((g) => (
            <section key={g.placement} className="abn-group">
              <header className="abn-group-head">
                <div>
                  <h3>{t(`placement_${g.placement}` as never)}</h3>
                  <small className="muted">{tb('sizeHint', { desktop: SIZES[g.placement]?.[0] ?? '1920 × 650', mobile: SIZES[g.placement]?.[1] ?? '1080 × 650' })}</small>
                </div>
                <button type="button" className="btn btn-dark btn-sm" onClick={() => { setForm(blank(g.placement)); setLocale(LOCALES[0]); setNotice(null); }}>
                  + {tb('newHere')}
                </button>
              </header>
              {g.list.length === 0 ? <p className="muted abn-empty">{tb('groupEmpty')}</p> : null}
              <div className="abn-list">
                {g.list.map((b, i) => {
                  const img: MediaDTO | null = b.translations[LOCALES[0]]?.imageDesktop ?? null;
                  const mob: MediaDTO | null = b.translations[LOCALES[0]]?.imageMobile ?? null;
                  const st = stateOf(b, now);
                  const langs = LOCALES.filter((l) => {
                    const x = b.translations[l];
                    return !!x && (!!x.title.trim() || !!x.imageDesktop);
                  });
                  return (
                    <article key={b.id} className={`abn-item is-${st}`}>
                      <div className="abn-pics">
                        {img ? <img className="abn-desk" src={img.url} alt="" loading="lazy" /> : <span className="abn-desk abn-none">—</span>}
                        {mob ? <img className="abn-mob" src={mob.url} alt="" loading="lazy" /> : null}
                      </div>
                      <div className="abn-info">
                        <div className="abn-line">
                          <strong>{b.name}</strong>
                          <span className={`abn-state is-${st}`}>{tb(st)}</span>
                        </div>
                        <div className="abn-meta">
                          <span>#{i + 1}</span>
                          <span className="abn-langs">
                            {langs.map((l) => (
                              <i key={l}>{l.toUpperCase()}</i>
                            ))}
                          </span>
                          {b.translations[LOCALES[0]]?.linkUrl ? <span dir="ltr">→ {b.translations[LOCALES[0]]?.linkUrl}</span> : null}
                        </div>
                        <div className="abn-actions">
                          <button type="button" className="btn btn-gold btn-sm" onClick={() => { setForm(fromBanner(b)); setLocale(LOCALES[0]); setNotice(null); }}>
                            {tCommon('edit')}
                          </button>
                          <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => void quick(() => apiClient(`/admin/banners/${b.id}`, { method: 'PUT', json: bodyOf(b, { isActive: !b.isActive }) }))}>
                            {b.isActive ? tb('turnOff') : tb('turnOn')}
                          </button>
                          <button type="button" className="btn btn-dark btn-sm" disabled={busy || i === 0} onClick={() => move(g.list, i, -1)} aria-label={tb('moveUp')} title={tb('moveUp')}>
                            ↑
                          </button>
                          <button type="button" className="btn btn-dark btn-sm" disabled={busy || i === g.list.length - 1} onClick={() => move(g.list, i, 1)} aria-label={tb('moveDown')} title={tb('moveDown')}>
                            ↓
                          </button>
                          <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => void quick(() => apiClient('/admin/banners', { method: 'POST', json: bodyOf(b, { name: `${b.name} ${tb('copySuffix')}`.slice(0, 120), isActive: false }) }))}>
                            {tb('duplicate')}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove(b)}>
                            {tCommon('delete')}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      ) : (
        <form className="card" onSubmit={(e) => void save(e)}>
          <h2>{form.id ? t('editBanner') : t('newBanner')}</h2>
          <div className="admin-cols">
            <div className="field">
              <label>{t('name')}</label>
              <input value={form.name} maxLength={120} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('placement')}</label>
              <select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })}>
                {BANNER_PLACEMENTS.map((p) => (
                  <option key={p} value={p}>
                    {t(`placement_${p}` as never)}
                  </option>
                ))}
              </select>
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
              <input value={cur.title} maxLength={120} onChange={(e) => patchTr(locale, { title: e.target.value })} />
              <small className="muted">{t('pictureOnlyHint')}</small>
            </div>
            <div className="field">
              <label>{t('subtitle')}</label>
              <input value={cur.subtitle} maxLength={240} onChange={(e) => patchTr(locale, { subtitle: e.target.value })} />
            </div>
            <div className="admin-cols">
              <div className="field">
                <label>{t('ctaLabel')}</label>
                <input value={cur.ctaLabel} maxLength={40} onChange={(e) => patchTr(locale, { ctaLabel: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('linkUrl')}</label>
                <input value={cur.linkUrl} maxLength={500} placeholder="/casino" onChange={(e) => patchTr(locale, { linkUrl: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{t('altText')}</label>
              <input value={cur.altText} maxLength={200} onChange={(e) => patchTr(locale, { altText: e.target.value })} />
            </div>
            <ImagePicker label={t('imageDesktop')} value={cur.imageDesktop} onChange={(m) => patchTr(locale, { imageDesktop: m })} />
            <ImagePicker label={t('imageMobile')} value={cur.imageMobile} onChange={(m) => patchTr(locale, { imageMobile: m })} />
            <small className="muted">{tb('sizeHint', { desktop: SIZES[form.placement]?.[0] ?? '1920 × 650', mobile: SIZES[form.placement]?.[1] ?? '1080 × 650' })}</small>
            {cur.imageDesktop || (form.tr[LOCALES[0]] ?? emptyTr()).imageDesktop ? (
              <div className="abn-preview">
                <h4>{tb('preview')}</h4>
                <div className="abn-preview-row">
                  {(['desktop', 'mobile'] as const).map((kind) => {
                    const base = form.tr[LOCALES[0]] ?? emptyTr();
                    const pic = kind === 'mobile' ? (cur.imageMobile ?? base.imageMobile ?? cur.imageDesktop ?? base.imageDesktop) : (cur.imageDesktop ?? base.imageDesktop);
                    const textOn = !!(cur.title.trim() || cur.subtitle.trim());
                    return (
                      <figure key={kind} className={`abn-frame is-${kind} is-${form.placement}`}>
                        {pic ? <img src={pic.url} alt="" /> : null}
                        {textOn ? (
                          <figcaption>
                            <b>{cur.title}</b>
                            {cur.subtitle ? <span>{cur.subtitle}</span> : null}
                            {cur.ctaLabel ? <em>{cur.ctaLabel}</em> : null}
                          </figcaption>
                        ) : null}
                        <small>{tb(kind === 'mobile' ? 'previewMobile' : 'previewDesktop')}</small>
                      </figure>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <p className="admin-actions">
            <button type="submit" className="btn btn-gold" disabled={busy}>
              {tAdmin('saveBanner')}
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
