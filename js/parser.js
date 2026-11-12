// TXT dosyalarını okuyan ayrıştırıcılar (kelime listesi ve metin paketi)
import { keyNorm, norm } from './util.js';

export const TYPES = {
  'eril': 'm', 'disil': 'f', 'eril-cogul': 'mp', 'disil-cogul': 'fp', 'eril/disil': 'mf', 'eril-disil': 'mf',
  'fiil': 'v', 'sifat': 'adj', 'zarf': 'adv', 'baglac': 'conj', 'edat': 'prep', 'zamir': 'pron',
  'ifade': 'expr', 'sayi': 'num', 'unlem': 'intj', 'isim': 'n', 'artikel': 'art',
};
export const TYPE_LABEL = {
  m: 'isim · eril', f: 'isim · dişil', mp: 'isim · eril çoğul', fp: 'isim · dişil çoğul', mf: 'isim · eril/dişil', n: 'isim',
  v: 'fiil', adj: 'sıfat', adv: 'zarf', conj: 'bağlaç', prep: 'edat', pron: 'zamir', expr: 'ifade', num: 'sayı', intj: 'ünlem', art: 'artikel', '': ''
};
export const isNoun = t => ['m', 'f', 'mp', 'fp', 'mf', 'n'].includes(t);

export function detectType(text) {
  return /^\s*===\s*MET[İI]N\s*===\s*$/mi.test(text) ? 'texts' : 'words';
}

function parseTypeField(raw) {
  if (!raw) return '';
  const k = keyNorm(raw).replace(/\s+/g, '');
  return TYPES[k] ?? null;
}

// "fr | tr | tür | örnek | örnek çeviri | ipa"
export function parseWordLine(line) {
  const f = line.split('|').map(s => s.trim());
  if (f.length < 2 || !f[0] || !f[1]) return { error: 'En az "fransızca | türkçe" olmalı' };
  const type = parseTypeField(f[2]);
  if (type === null) return { error: `Bilinmeyen tür: "${f[2]}"` };
  return { fr: f[0], tr: f[1], type, ex: f[3] || '', exTr: f[4] || '', ipa: f[5] || '' };
}

export function parseWords(text) {
  const decks = []; const errors = [];
  let cur = null;
  const ensure = () => { if (!cur) { cur = { name: 'İçe aktarılan kelimeler', level: '', active: true, words: [] }; decks.push(cur); } return cur; };
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    const dm = line.match(/^#\s*([^:]+):\s*(.*)$/);
    if (dm) {
      const k = keyNorm(dm[1]).trim(), v = dm[2].trim();
      if (k === 'deste') { cur = { name: v || 'Adsız deste', level: '', active: true, words: [] }; decks.push(cur); }
      else if (k === 'seviye') ensure().level = v;
      else if (k === 'aktif') ensure().active = !/^(hayir|no|0|false)$/i.test(keyNorm(v));
      return;
    }
    if (line.startsWith('#')) return;
    const w = parseWordLine(line);
    if (w.error) errors.push({ line: i + 1, text: line, msg: w.error });
    else ensure().words.push(w);
  });
  return { decks: decks.filter(d => d.words.length), errors };
}

const SEC = { 'metin': 'text', 'coktan-secmeli': 'mcq', 'acik-uclu': 'open', 'sozluk': 'gloss' };

export function parseTexts(text) {
  const texts = []; const errors = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let t = null, sec = null, para = [], q = null, lineNo = 0;
  const flushPara = () => { if (t && para.length) { t.paras.push(para.join(' ').replace(/\s+/g, ' ').trim()); } para = []; };
  const finish = () => {
    if (!t) return;
    flushPara();
    const where = `"${t.title || '(başlıksız)'}"`;
    if (!t.title) errors.push({ line: t.line, msg: 'Metnin #başlık satırı yok' });
    if (!t.paras.length) errors.push({ line: t.line, msg: `${where}: metin boş` });
    t.mcq.forEach((m, i) => {
      if (m.opts.length < 2) errors.push({ line: t.line, msg: `${where}: ${i + 1}. çoktan seçmeli soruda en az 2 şık olmalı` });
      if (m.ans < 0) errors.push({ line: t.line, msg: `${where}: ${i + 1}. çoktan seçmeli soruda doğru şık (*) işaretli değil` });
    });
    t.gapCount = (t.paras.join(' ').match(/\[\[.+?\]\]/g) || []).length;
    if (t.title && t.paras.length) texts.push(t);
    t = null;
  };
  for (const raw of lines) {
    lineNo++;
    const line = raw.trim();
    if (/^===\s*MET[İI]N\s*===$/i.test(line)) { finish(); t = { title: '', level: '', topic: '', paras: [], mcq: [], open: [], gloss: { forms: [], words: [] }, line: lineNo }; sec = null; continue; }
    if (!t) continue;
    if (line.startsWith('//')) continue;
    const dm = line.match(/^#\s*([^:]+):\s*(.*)$/);
    if (dm) {
      const k = keyNorm(dm[1]).trim(), v = dm[2].trim();
      if (SEC[k]) { if (sec === 'text') flushPara(); sec = SEC[k]; q = null; if (v && sec === 'text') para.push(v); continue; }
      if (k === 'baslik') { t.title = v; continue; }
      if (k === 'seviye') { t.level = v; continue; }
      if (k === 'konu') { t.topic = v; continue; }
      if (k === 'aciklama' && q && sec === 'mcq') { q.expl = v; continue; }
      if ((k === 'ornek-cevap' || k === 'cevap') && q && sec === 'open') { q.answer = v; continue; }
      if ((k === 'anahtar-kelimeler' || k === 'anahtar') && q && sec === 'open') { q.keywords = v.split(/[,;]/).map(s => s.trim()).filter(Boolean); continue; }
      errors.push({ line: lineNo, text: line, msg: `Bilinmeyen satır: ${dm[1]}` });
      continue;
    }
    if (sec === 'text') {
      if (!line) flushPara(); else para.push(line);
      continue;
    }
    if (!line) continue;
    if (sec === 'mcq') {
      let m;
      if ((m = line.match(/^(\d+)\s*[.)]\s*(.+)$/))) { q = { q: m[2], opts: [], ans: -1, expl: '' }; t.mcq.push(q); }
      else if ((m = line.match(/^([a-fA-F])\s*[)\.]\s*(.+)$/)) && q) {
        let o = m[2].trim();
        if (/\*\s*$/.test(o)) { o = o.replace(/\s*\*\s*$/, ''); q.ans = q.opts.length; }
        q.opts.push(o);
      } else errors.push({ line: lineNo, text: line, msg: 'Çoktan seçmeli bölümünde anlaşılmayan satır' });
    } else if (sec === 'open') {
      const m = line.match(/^(\d+)\s*[.)]\s*(.+)$/);
      if (m) { q = { q: m[2], answer: '', keywords: [] }; t.open.push(q); }
      else errors.push({ line: lineNo, text: line, msg: 'Açık uçlu bölümünde anlaşılmayan satır' });
    } else if (sec === 'gloss') {
      if (line.includes('|')) {
        const w = parseWordLine(line);
        if (w.error) errors.push({ line: lineNo, text: line, msg: w.error }); else t.gloss.words.push(w);
      } else if (line.includes('=')) {
        const [a, b] = line.split('=').map(s => norm(s));
        if (a && b) t.gloss.forms.push([a, b]);
      } else errors.push({ line: lineNo, text: line, msg: 'Sözlük satırı "biçim = kelime" ya da "fr | tr | tür" olmalı' });
    }
  }
  finish();
  return { texts, errors };
}
