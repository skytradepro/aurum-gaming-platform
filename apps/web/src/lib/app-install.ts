'use client';

import { useSyncExternalStore } from 'react';

/**
 * The HANNIBAL phone app is the website itself, installed on the home screen (web app):
 * same server, same data, so every banner, promotion, game and balance is always the same.
 * This module registers the service worker and keeps the browser's "install" prompt so a button can
 * open it later (Chrome / Samsung Internet / Edge). iPhone has no prompt: the player uses Share →
 * Add to Home Screen (see the /app page).
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type AppPlatform = 'ios' | 'android' | 'desktop';

export interface AppInstallState {
  ready: boolean;
  platform: AppPlatform;
  /** opened from the home screen icon (already installed) */
  standalone: boolean;
  /** the browser can show its own install dialog right now */
  canPrompt: boolean;
  installed: boolean;
}

const SERVER_STATE: AppInstallState = { ready: false, platform: 'desktop', standalone: false, canPrompt: false, installed: false };

let state: AppInstallState = SERVER_STATE;
let deferred: InstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<AppInstallState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function detectPlatform(): AppPlatform {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function detectStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** Called once, as early as possible (the browser fires its install event only once per page). */
export function startAppInstall(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own gold button instead of the browser's banner
    deferred = e as InstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
  set({ ready: true, platform: detectPlatform(), standalone: detectStandalone() });
  if ('serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

/** Opens the browser's install dialog. Returns true when the player accepted. */
export async function promptAppInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  set({ canPrompt: false });
  await e.prompt();
  const choice = await e.userChoice;
  if (choice.outcome === 'accepted') set({ installed: true });
  return choice.outcome === 'accepted';
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useAppInstall(): AppInstallState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}
