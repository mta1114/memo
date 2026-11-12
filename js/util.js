export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const normApos = s => String(s ?? '').replace(/[’‘`´ʼ]/g, "'");
export const norm = s => normApos(s).normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
export const stripAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
export const trLower = s => String(s ?? '').normalize('NFC').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
export const trStrip = s => s.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
// Türkçe yönerge anahtarlarını sadeleştir: "Çoktan-Seçmeli" -> "coktan-secmeli"
export const keyNorm = s => trStrip(trLower(s)).replace(/i̇/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export const MIN = 60000, HOUR = 3600000, DAY = 86400000;
// Gün sabah 04:00'te başlar
export function dayKey(t = Date.now()) {
  const d = new Date(t - 4 * HOUR);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function endOfToday() {
  const n = new Date(); const e = new Date(n); e.setHours(4, 0, 0, 0);
  if (n >= e) e.setDate(e.getDate() + 1);
  return e.getTime();
}
export const startOfToday = () => endOfToday() - DAY;

export function fmtIvl(ms) {
  if (ms < HOUR) return Math.max(1, Math.round(ms / MIN)) + ' dk';
  if (ms < DAY) return Math.round(ms / HOUR) + ' sa';
  const d = ms / DAY;
  if (d < 30) return Math.round(d) + ' g';
  if (d < 365) return (Math.round(d / 30 * 10) / 10).toString().replace('.', ',') + ' ay';
  return (Math.round(d / 365 * 10) / 10).toString().replace('.', ',') + ' yıl';
}

export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}

export function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function download(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { }
    ta.remove(); return ok;
  }
}

// ---- Cevap karşılaştırma ----
const ARTICLES = /^(?:le\/la |un\/une |les |le |la |l'|un |une |des |du |de la |de l')/;
export const stripArticle = s => s.replace(ARTICLES, '').trim();

// Fransızca cevap: 'ok' | 'accent' | 'article' | 'close' | 'wrong'
export function compareFr(input, answer) {
  const a = norm(input).replace(/[.!?;,]+$/, ''), b = norm(answer).replace(/[.!?;,]+$/, '');
  if (!a) return 'wrong';
  if (a === b) return 'ok';
  const sa = stripAccents(a), sb = stripAccents(b);
  if (sa === sb) return 'accent';
  const a2 = stripArticle(a), b2 = stripArticle(b);
  if (a2 !== a || b2 !== b) {
    if (a2 === b2) return 'article';
    if (stripAccents(a2) === stripAccents(b2)) return 'accent';
  }
  if (sb.length >= 5 && lev(sa, sb) <= 1) return 'close';
  return 'wrong';
}

// Türkçe cevap: virgül/; ile ayrılmış alternatiflerden biri tutarsa doğru
export function compareTr(input, answer) {
  const a = trLower(input).replace(/[.!?]+$/, '');
  if (!a) return 'wrong';
  const alts = trLower(answer).replace(/\([^)]*\)/g, '').split(/[,;\/]/).map(s => s.trim()).filter(Boolean);
  if (alts.includes(a)) return 'ok';
  if (alts.some(x => trStrip(x) === trStrip(a))) return 'accent';
  if (alts.some(x => x.length >= 5 && lev(trStrip(x), trStrip(a)) <= 1)) return 'close';
  return 'wrong';
}

export const RESULT_LABEL = { ok: 'Doğru', accent: 'Aksan hatası', article: 'Artikel eksik/yanlış', close: 'Çok yakın (yazım hatası)', wrong: 'Yanlış' };
