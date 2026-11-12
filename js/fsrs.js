// FSRS-4.5 tabanlı aralıklı tekrar zamanlayıcısı (varsayılan parametreler)
import { MIN, DAY } from './util.js';

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5, FACTOR = 19 / 81, RETENTION = 0.9, MAX_IVL = 36500;

const clampD = d => Math.min(10, Math.max(1, d));
const D0 = g => clampD(W[4] - (g - 3) * W[5]);
const S0 = g => Math.max(0.1, W[g - 1]);
const retr = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
const nextD = (d, g) => clampD(W[7] * D0(4) + (1 - W[7]) * (d - W[6] * (g - 3)));
const sSucc = (d, s, r, g) => s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
const sFail = (d, s, r) => Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
const ivlDays = s => Math.min(MAX_IVL, Math.max(1, Math.round(s / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1))));

// g: 1=Tekrar, 2=Zor, 3=İyi, 4=Kolay
function rate(c, g, now) {
  const n = { ...c, reps: (c.reps || 0) + 1, last: now };
  const st = c.state || 'new';
  if (st === 'new') {
    n.d = D0(g); n.s = S0(g);
    if (g === 1) { n.state = 'learning'; n.step = 0; n.due = now + 1 * MIN; }
    else if (g === 2) { n.state = 'learning'; n.step = 0; n.due = now + 6 * MIN; }
    else if (g === 3) { n.state = 'learning'; n.step = 1; n.due = now + 10 * MIN; }
    else { n.state = 'review'; n.due = now + ivlDays(n.s) * DAY; }
    return n;
  }
  if (st === 'learning' || st === 'relearning') {
    const relearn = st === 'relearning';
    if (g === 1) { n.step = 0; n.due = now + (relearn ? 10 : 1) * MIN; n.d = nextD(c.d, 1); }
    else if (g === 2) { n.due = now + (relearn ? 10 : 6) * MIN; }
    else if (g === 3) {
      if (!relearn && (c.step || 0) < 1) { n.step = 1; n.due = now + 10 * MIN; }
      else { n.state = 'review'; n.due = now + ivlDays(n.s) * DAY; }
    } else {
      n.s = relearn ? c.s * 1.5 : Math.max(c.s, S0(4));
      n.state = 'review'; n.due = now + ivlDays(n.s) * DAY;
    }
    return n;
  }
  // review
  const t = Math.max(0, (now - (c.last || now)) / DAY);
  const r = retr(t, c.s);
  n.d = nextD(c.d, g);
  if (g === 1) {
    n.s = sFail(c.d, c.s, r); n.lapses = (c.lapses || 0) + 1;
    n.state = 'relearning'; n.step = 0; n.due = now + 10 * MIN;
  } else {
    n.s = sSucc(c.d, c.s, r, g);
    n.due = now + ivlDays(n.s) * DAY;
  }
  return n;
}

// Dört butonun sonuçları (aralıklar birbirine göre sıralı tutulur)
export function preview(c, now = Date.now()) {
  const out = {};
  for (const g of [1, 2, 3, 4]) out[g] = rate(c, g, now);
  const long = g => out[g].state === 'review';
  if (long(2) && long(3) && out[2].due > out[3].due) out[2].due = out[3].due;
  if (long(3) && long(4) && out[4].due <= out[3].due) out[4].due = out[3].due + DAY;
  if (!long(3) && long(4) && out[4].due - now < DAY) out[4].due = now + DAY;
  return out;
}

export const isMature = c => c.state === 'review' && c.s >= 21;
