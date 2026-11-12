// Sözlük araması: tıklanan kelimenin sözlük halini bulur
import { S, keyOf } from './store.js';
import { norm } from './util.js';
import { allForms, MODEL_VERBS } from './conj.js';

let idx = null, forms = null, verbForms = null, built = 0;

const ELISION = { "l'": 'le', "d'": 'de', "j'": 'je', "qu'": 'que', "n'": 'ne', "s'": 'se', "c'": 'ce', "m'": 'me', "t'": 'te', "jusqu'": "jusque", "lorsqu'": 'lorsque', "puisqu'": 'puisque' };

export function invalidate() { idx = null; }
const AUX = new Set(['ai', 'as', 'a', 'avons', 'avez', 'ont', 'avais', 'avait', 'avions', 'aviez', 'avaient', 'aura', 'aurait', 'suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'était', 'étaient', 'étais', 'sera', 'serait', 'été', 'ayant', 'étant', "j'ai", "n'a", "n'ont", "n'est", "s'est", "s'était", "m'a", "l'a", "t'a", "c'est"]);

function build() {
  idx = new Map(); forms = new Map(); verbForms = new Map();
  const add = (k, w) => { if (!k) return; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(w); };
  for (const w of S.words.values()) {
    add(w.key, w);
    const full = norm(w.fr);
    if (full !== w.key) add(full.split(',')[0].trim(), w);
    if (w.type === 'adj' && w.fr.includes(',')) add(norm(w.fr.split(',')[1]), w);
    if (w.type === 'v') for (const f of allForms(w.key)) if (!verbForms.has(f)) verbForms.set(f, w.key);
  }
  for (const v of MODEL_VERBS) if (idx.has(v)) for (const f of allForms(v)) if (!verbForms.has(f)) verbForms.set(f, v);
  for (const t of S.texts) for (const [a, b] of (t.gloss?.forms || [])) forms.set(a, b);
  for (const [a, b] of Object.entries(ELISION)) if (!forms.has(a)) forms.set(a, b);
  built = Date.now();
}

const pick = list => list && list.length ? (list.find(w => w.deckId != null) || list[0]) : null;

function variants(f) {
  const v = [f];
  const rules = [[/euses$/, 'eux'], [/euse$/, 'eux'], [/ives$/, 'if'], [/ive$/, 'if'], [/elles$/, 'el'], [/elle$/, 'el'], [/ennes$/, 'en'], [/enne$/, 'en'], [/ères$/, 'er'], [/ère$/, 'er'],
    [/aux$/, 'al'], [/eaux$/, 'eau'], [/es$/, ''], [/s$/, ''], [/x$/, ''], [/e$/, ''], [/ées$/, 'é'], [/ée$/, 'é'], [/és$/, 'é'], [/ales$/, 'al'], [/ale$/, 'al']];
  for (const [re, r] of rules) if (re.test(f) && f.length >= 3) v.push(f.replace(re, r));
  return v;
}

// Tek bir sözcük biçimini ara → { word, lemma } | null
export function lookupForm(text) {
  if (!idx) build();
  const f = norm(text);
  if (!f) return null;
  let w = pick(idx.get(f)); if (w) return { word: w, lemma: w.key };
  const g = forms.get(f); if (g) { w = pick(idx.get(g)) || pick(idx.get(keyOf(g))); if (w) return { word: w, lemma: g }; }
  const vf = verbForms.get(f); if (vf) { w = pick(idx.get(vf)); if (w) return { word: w, lemma: vf }; }
  const el = f.match(/^(l'|d'|j'|qu'|n'|s'|c'|m'|t'|jusqu'|lorsqu'|puisqu')(.+)$/);
  if (el) return lookupForm(el[2]);
  for (const x of variants(f).slice(1)) {
    w = pick(idx.get(x)); if (w) return { word: w, lemma: x };
    const v2 = verbForms.get(x); if (v2 && (w = pick(idx.get(v2)))) return { word: w, lemma: v2 };
  }
  return null;
}

// Tıklanan sözcüğü çevresiyle (en fazla 4 kelimelik öbek) birlikte ara; en uzun eşleşme kazanır
export function lookupAt(tokens, i) {
  if (!idx) build();
  for (let n = 6; n >= 2; n--) {
    for (let start = Math.max(0, i - n + 1); start <= i; start++) {
      const end = start + n - 1; if (end >= tokens.length) continue;
      const phrase = tokens.slice(start, end + 1).map((t, j) => (j ? t.pre : '') + t.text).join('');
      const p = norm(phrase);
      const w = pick(idx.get(p)) || (forms.get(p) && pick(idx.get(forms.get(p))));
      if (w) return { word: w, lemma: w.key, form: phrase, range: [start, end] };
    }
  }
  // "a été", "est allé": yardımcı fiilden sonra gelen ortaç fiil olarak okunur
  const prev = i > 0 ? norm(tokens[i - 1].text) : '';
  if (AUX.has(prev)) {
    const v = verbForms.get(norm(tokens[i].text));
    const w = v && pick(idx.get(v));
    if (w) return { word: w, lemma: v, form: tokens[i].text, range: [i, i] };
  }
  const r = lookupForm(tokens[i].text);
  return r ? { ...r, form: tokens[i].text, range: [i, i] } : null;
}

// Metin içinde sözcükleri ayır; her belirteç önceki boşluk/noktalama ile birlikte tutulur
export function tokenize(s) {
  const out = []; const re = /[\p{L}\p{N}]+(?:['’](?=\p{L}))?/gu; let m, last = 0;
  while ((m = re.exec(s))) { out.push({ pre: s.slice(last, m.index), text: m[0], start: m.index }); last = m.index + m[0].length; }
  return { tokens: out, tail: s.slice(last) };
}

// Metinlerden örnek cümleler bul
export function corpusExamples(word, max = 3) {
  if (!idx) build();
  const res = [];
  for (const t of S.texts) {
    for (const p of t.paras) {
      const clean = p.replace(/\[\[(.+?)\]\]/g, '$1');
      for (const sent of clean.match(/[^.!?…]+[.!?…]*/g) || []) {
        const { tokens } = tokenize(sent);
        for (let i = 0; i < tokens.length; i++) {
          const r = lookupForm(tokens[i].text);
          if (r && r.word.id === word.id) { res.push({ sent: sent.trim(), form: tokens[i].text, title: t.title }); break; }
        }
        if (res.length >= max) return res;
      }
    }
  }
  return res;
}

// Sıfat biçimleri
export function adjForms(w) {
  let [m, f] = w.fr.split(',').map(s => s.trim());
  if (!f) {
    if (/e$/.test(m)) f = m;
    else if (/eux$/.test(m)) f = m.replace(/eux$/, 'euse');
    else if (/if$/.test(m)) f = m.replace(/if$/, 'ive');
    else if (/(el|eil)$/.test(m)) f = m + 'le';
    else if (/(en|on)$/.test(m)) f = m + 'ne';
    else if (/er$/.test(m)) f = m.replace(/er$/, 'ère');
    else if (/et$/.test(m)) f = m.replace(/et$/, 'ète');
    else f = m + 'e';
  }
  const pl = x => /[sx]$/.test(x) ? x : /al$/.test(x) ? x.replace(/al$/, 'aux') : /eau$/.test(x) ? x + 'x' : x + 's';
  return { ms: m, fs: f, mp: pl(m), fp: f + 's' };
}

export function nounPlural(fr) {
  const m = fr.match(/^(le\/la |un\/une |le |la |l'|les )?(.+)$/i);
  const base = m[2];
  const pl = base.split(' ').map((x, i) => i ? x : (/[sxz]$/.test(x) ? x : /(al)$/.test(x) ? x.replace(/al$/, 'aux') : /(eau|eu)$/.test(x) ? x + 'x' : x + 's')).join(' ');
  return 'les ' + pl;
}
