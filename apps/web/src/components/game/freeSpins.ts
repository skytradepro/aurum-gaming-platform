'use client';

/**
 * Free spins show for every slot game (no change inside the games themselves): a full-screen card announces the
 * free spins, plays them one by one with their wins, counts the total and waits for "Collect".
 * Sounds are synthesized (Web Audio) and the announcer uses the device's own voice (speech synthesis);
 * both stay silent when the player muted the game sound (same switch as the games: localStorage "cb-sound").
 */

export interface FreeSpinsData {
  count: number;
  baseMultiplier: string;
  basePayoutMinor: string;
  spins: { multiplier: string; payoutMinor: string }[];
  totalPayoutMinor: string;
  capped: boolean;
}

export interface FreeSpinsLabels {
  title: string;
  sub: string;
  spin: string;
  total: string;
  collect: string;
  noWin: string;
  voiceStart: string;
  voiceWin: string;
  voiceBig: string;
  lang: string;
}

export function readFreeSpins(detail: Record<string, unknown> | undefined): FreeSpinsData | null {
  const f = detail?.freeSpins as FreeSpinsData | undefined;
  if (!f || !Array.isArray(f.spins) || typeof f.totalPayoutMinor !== 'string' || typeof f.basePayoutMinor !== 'string') return null;
  return f;
}

function soundOn(): boolean {
  try {
    return localStorage.getItem('cb-sound') !== '0';
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------- sound
let audio: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!soundOn() || typeof window === 'undefined') return null;
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, glideTo?: number) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 4200;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/**
 * Call inside the player's tap on Spin, before the server answers: phones (iPhone Safari above all) only play
 * sound and speech that a tap started, and the free spins show starts after the answer.
 */
let voicePrimed = false;
export function primeSound(): void {
  if (!soundOn() || typeof window === 'undefined') return;
  const a = ac();
  if (a) {
    try {
      const src = a.createBufferSource();
      src.buffer = a.createBuffer(1, 1, 22050);
      src.connect(a.destination);
      src.start(0);
    } catch {
      /* audio not available */
    }
  }
  if (voicePrimed || !('speechSynthesis' in window)) return;
  voicePrimed = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* no voice on this device */
  }
}

const sfx = {
  /** Brass-like fanfare: rising chord, then a held major chord with shimmer. */
  fanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      tone(n, i * 0.11, 0.32, 'sawtooth', 0.09);
      tone(n * 2, i * 0.11, 0.2, 'triangle', 0.03);
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((n) => tone(n, 0.5, 1.1, 'sawtooth', 0.06));
    tone(1568, 0.5, 1.2, 'sine', 0.05, 3136);
  },
  /** Reel whoosh while a free spin runs. */
  spin() {
    tone(220, 0, 0.45, 'triangle', 0.05, 880);
  },
  /** Bell for a free spin that won. */
  win() {
    tone(1318.5, 0, 0.5, 'sine', 0.12);
    tone(1975.5, 0.05, 0.45, 'sine', 0.07);
  },
  /** Soft thud for a free spin without a win. */
  none() {
    tone(160, 0, 0.18, 'sine', 0.06, 110);
  },
  tick() {
    tone(2200, 0, 0.04, 'square', 0.02);
  },
  /** Final "ta-da". */
  finale() {
    [784, 987.8, 1174.7, 1568].forEach((n, i) => tone(n, i * 0.06, 0.9, 'triangle', 0.08));
    tone(392, 0, 1.0, 'sawtooth', 0.05);
  },
};

// ---------------------------------------------------------------- voice
/** Speaks with the device's best voice for the language; a strong, slightly deep delivery. */
export function announce(text: string, lang: string): void {
  if (!soundOn() || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const base = lang.slice(0, 2).toLowerCase();
    const same = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
    const score = (v: SpeechSynthesisVoice) => (/male/i.test(v.name) && !/female/i.test(v.name) ? 4 : 0) + (/google|natural|neural|online/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
    const voice = same.sort((a, b) => score(b) - score(a))[0];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? lang;
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 0.8;
    u.volume = 1;
    synth.cancel();
    synth.speak(u);
  } catch {
    /* no voice on this device */
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Shows the free spins and resolves when the player collects (or after a few seconds). */
export async function playFreeSpinsShow(data: FreeSpinsData, opts: { labels: FreeSpinsLabels; fmt: (minor: string) => string; stakeMinor: string; dir: 'ltr' | 'rtl' }): Promise<void> {
  if (typeof document === 'undefined') return;
  const { labels, fmt } = opts;
  const root = el('div', 'fsx');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('dir', opts.dir);
  const card = el('div', 'fsx-card');
  card.append(el('div', 'fsx-rays'));
  card.append(el('div', 'fsx-gift', '🎁'));
  const title = el('h2', 'fsx-title', labels.title);
  card.append(title);
  card.append(el('p', 'fsx-sub', labels.sub));
  const list = el('ol', 'fsx-spins');
  const items = data.spins.map((_, i) => {
    const li = el('li', 'fsx-spin');
    li.append(el('span', 'fsx-n', labels.spin.replace('{n}', String(i + 1))));
    li.append(el('span', 'fsx-reel', '★ ★ ★'));
    li.append(el('strong', 'fsx-val', '—'));
    list.append(li);
    return li;
  });
  card.append(list);
  const totalBox = el('div', 'fsx-total');
  totalBox.append(el('span', 'fsx-total-l', labels.total));
  const totalVal = el('strong', 'fsx-total-v', fmt('0'));
  totalBox.append(totalVal);
  card.append(totalBox);
  const btn = el('button', 'btn btn-gold fsx-ok', labels.collect);
  btn.type = 'button';
  btn.disabled = true;
  card.append(btn);
  root.append(card);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('is-open'));

  sfx.fanfare();
  announce(labels.voiceStart, labels.lang);
  await wait(1500);

  let running = 0n;
  for (let i = 0; i < data.spins.length; i++) {
    const li = items[i];
    const s = data.spins[i];
    if (!li || !s) continue;
    li.classList.add('is-spinning');
    sfx.spin();
    await wait(650);
    li.classList.remove('is-spinning');
    const won = BigInt(s.payoutMinor) > 0n;
    li.classList.add(won ? 'is-win' : 'is-none');
    const val = li.querySelector('.fsx-val');
    if (val) val.textContent = won ? `${s.multiplier} · ${fmt(s.payoutMinor)}` : labels.noWin;
    if (won) sfx.win();
    else sfx.none();
    running += BigInt(s.payoutMinor);
    totalVal.textContent = fmt(running.toString());
    await wait(450);
  }

  // The real total (it can be capped at the game's highest win, and it includes the paid spin's own win).
  const total = BigInt(data.totalPayoutMinor);
  const steps = 18;
  for (let k = 1; k <= steps; k++) {
    totalVal.textContent = fmt(((total * BigInt(k)) / BigInt(steps)).toString());
    sfx.tick();
    await wait(45);
  }
  totalBox.classList.add('is-done');
  sfx.finale();
  const stake = BigInt(opts.stakeMinor || '1') || 1n;
  if (total >= stake * 20n) announce(labels.voiceBig, labels.lang);
  else if (total > 0n) announce(labels.voiceWin, labels.lang);
  btn.disabled = false;
  btn.focus();

  await new Promise<void>((resolve) => {
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      root.classList.remove('is-open');
      setTimeout(() => {
        root.remove();
        resolve();
      }, 250);
    };
    btn.addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
    setTimeout(close, 6000);
  });
}
