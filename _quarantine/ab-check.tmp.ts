import { andarBaharDeal, warPayout } from './packages/shared/src/games.ts';
let a = 0, n = 200000, seed = 12345;
const rnd = (k: number) => Math.floor(Math.random() * k); void seed;
for (let t = 0; t < n; t++) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 0; i < 52; i++) { const j = i + rnd(52 - i); [d[i], d[j]] = [d[j]!, d[i]!]; }
  if (andarBaharDeal(d).winner === 'andar') a++;
}
console.log('andar share', a / n, 'RTP andar', (a / n) * 1.83, 'bahar', (1 - a / n) * 1.94);
let ret = 0, cnt = 0;
for (let p = 0; p < 52; p++) for (let q = 0; q < 52; q++) if (p !== q) { const r = warPayout(p, q); ret += r.num / r.den; cnt++; }
console.log('war RTP exact', ret / cnt);
