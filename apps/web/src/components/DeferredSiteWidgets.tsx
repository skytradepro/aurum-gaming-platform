'use client';

import dynamic from 'next/dynamic';

/** Heavy / decorative UI — load after first paint (faster LCP on phone and PC). */
export const SiteAmbient = dynamic(() => import('./SiteAmbient').then((m) => ({ default: m.SiteAmbient })), { ssr: false });
export const AiAssistant = dynamic(() => import('./AiAssistant').then((m) => ({ default: m.AiAssistant })), { ssr: false });
export const AiHologram = dynamic(() => import('./AiHologram').then((m) => ({ default: m.AiHologram })), { ssr: false });
export const SiteToasts = dynamic(() => import('./SiteToasts').then((m) => ({ default: m.SiteToasts })), { ssr: false });
