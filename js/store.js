// Bellekteki durum + IndexedDB'ye yazma
import * as db from './db.js';
import { norm, dayKey, stripArticle } from './util.js';

export const DEFAULTS = {
  newPerDay: 15, maxReviews: 200, autoplay: true, rate: 0.9, voice: '',
  listenLimit: 2, highlight: true, reverse: true, typeAnswer: false,
};
export const S = { decks: [], words: new Map(), cards: [], texts: [], days: new Map(), settings: { ...DEFAULTS }, meta: {} };

export async function load() {
  const [decks, words, cards, texts, days, meta] = await Promise.all(['decks', 'words', 'cards', 'texts', 'days', 'meta'].map(db.getAll));
  S.decks = decks; S.words = new Map(words.map(w => [w.id, w])); S.cards = cards; S.texts = texts;
  S.days = new Map(days.map(d => [d.date, d]));
  S.meta = Object.fromEntries(meta.map(m => [m.key, m.value]));
  S.settings = { ...DEFAULTS, ...(S.meta.settings || {}) };
  if (!S.meta.unknown) S.meta.unknown = [];
}

export const setMeta = (key, value) => { S.meta[key] = value; return db.put('meta', { key, value }); };
export const saveSettings = () => setMeta('settings', S.settings);
export const putCard = c => db.put('cards', c);
export const putWord = w => db.put('words', w);
export const putDeck = d => db.put('decks', d);
export const putText = t => db.put('texts', t);

export function today() {
  const k = dayKey();
  let d = S.days.get(k);
  if (!d) { d = { date: k, reviews: 0, again: 0, revDone: 0, newTotal: 0, newByDeck: {}, texts: 0 }; S.days.set(k, d); }
  return d;
}
export const saveDay = d => db.put('days', d);

// Kelimenin sözlük anahtarı: artikel ve dönüşlü zamir atılır, sıfatın dişil hali ayrılır
export function keyOf(fr) {
  let s = norm(fr).split(',')[0].trim();
  s = stripArticle(s);
  s = s.replace(/^(se |s')/, '');
  return s;
}

export const deckById = id => S.decks.find(d => d.id === id);
export const cardsOfWord = wid => S.cards.filter(c => c.wordId === wid);

export function findDeckByName(name) {
  const n = norm(name);
  return S.decks.find(d => norm(d.name) === n);
}

export async function getOrCreateDeck(name, extra = {}) {
  let d = findDeckByName(name);
  if (d) return d;
  d = { name, level: extra.level || '', active: extra.active !== false, created: Date.now(), builtin: !!extra.builtin };
  await db.put('decks', d);
  S.decks.push(d);
  return d;
}

function nextOrd() {
  let m = S.meta.ord || 0; m++; S.meta.ord = m; return m;
}

function newCards(word, deckId) {
  const ord = nextOrd();
  return ['fr2tr', 'tr2fr'].map((dir, i) => ({ wordId: word.id, deckId, dir, state: 'new', due: 0, s: 0, d: 0, reps: 0, lapses: 0, step: 0, last: 0, ord: ord + i * 0.5 }));
}

// Kelime destelerini içe aktar. Aynı destede aynı kelime varsa atlanır.
export async function importDecks(decks, opts = {}) {
  let added = 0, dup = 0; const newWords = [];
  for (const dk of decks) {
    const deck = await getOrCreateDeck(dk.name, { level: dk.level, active: dk.active, builtin: opts.builtin });
    const existing = new Set([...S.words.values()].filter(w => w.deckId === deck.id).map(w => w.key));
    for (const w of dk.words) {
      const key = keyOf(w.fr);
      if (existing.has(key)) { dup++; continue; }
      existing.add(key);
      // Sözlükte desteli olmayan aynı kelime varsa onu desteye bağla
      const loose = [...S.words.values()].find(x => x.deckId == null && x.key === key);
      if (loose) { Object.assign(loose, w, { deckId: deck.id, key }); newWords.push(loose); }
      else newWords.push({ ...w, key, deckId: deck.id, wrong: 0, created: Date.now() });
      added++;
    }
  }
  await db.bulkPut('words', newWords);
  newWords.forEach(w => S.words.set(w.id, w));
  const cards = [];
  for (const w of newWords) if (!S.cards.some(c => c.wordId === w.id)) cards.push(...newCards(w, w.deckId));
  await db.bulkPut('cards', cards);
  S.cards.push(...cards);
  await setMeta('ord', S.meta.ord || 0);
  return { added, dup };
}

// Metin paketlerini içe aktar. Aynı başlıklı metin varsa atlanır.
export async function importTexts(texts, opts = {}) {
  let added = 0, dup = 0;
  const titles = new Set(S.texts.map(t => norm(t.title)));
  const toAdd = [], glossWords = [];
  for (const t of texts) {
    if (titles.has(norm(t.title))) { dup++; continue; }
    titles.add(norm(t.title));
    const { line, ...rest } = t;
    toAdd.push({ ...rest, builtin: !!opts.builtin, added: Date.now(), done: false, attempts: 0, results: null });
    for (const w of t.gloss.words) {
      const key = keyOf(w.fr);
      if ([...S.words.values()].some(x => x.key === key) || glossWords.some(x => x.key === key)) continue;
      glossWords.push({ ...w, key, deckId: null, wrong: 0, created: Date.now() });
    }
    added++;
  }
  await db.bulkPut('texts', toAdd); S.texts.push(...toAdd);
  await db.bulkPut('words', glossWords); glossWords.forEach(w => S.words.set(w.id, w));
  return { added, dup };
}

// Kelimeyi çalışılacak kartlara ekle (sözlükte olup destesi olmayanlar için)
export async function addWordToDeck(word, deckName = 'Metinlerden') {
  const deck = await getOrCreateDeck(deckName);
  if (word.deckId == null) { word.deckId = deck.id; }
  if (!word.id) { word.key = keyOf(word.fr); word.wrong = word.wrong || 0; word.created = Date.now(); await db.put('words', word); S.words.set(word.id, word); }
  else await db.put('words', word);
  if (!S.cards.some(c => c.wordId === word.id)) {
    const cs = newCards(word, word.deckId);
    await db.bulkPut('cards', cs); S.cards.push(...cs);
    await setMeta('ord', S.meta.ord);
  }
  return deckById(word.deckId);
}

export async function deleteWord(word) {
  const ids = S.cards.filter(c => c.wordId === word.id).map(c => c.id);
  await db.bulkDel('cards', ids);
  S.cards = S.cards.filter(c => c.wordId !== word.id);
  await db.del('words', word.id); S.words.delete(word.id);
}

export async function deleteDeck(deck) {
  const wids = [...S.words.values()].filter(w => w.deckId === deck.id).map(w => w.id);
  const cids = S.cards.filter(c => c.deckId === deck.id).map(c => c.id);
  await db.bulkDel('cards', cids); await db.bulkDel('words', wids); await db.del('decks', deck.id);
  S.cards = S.cards.filter(c => c.deckId !== deck.id);
  wids.forEach(id => S.words.delete(id));
  S.decks = S.decks.filter(d => d.id !== deck.id);
}

export async function deleteText(t) { await db.del('texts', t.id); S.texts = S.texts.filter(x => x.id !== t.id); }

export async function addUnknown(word) {
  const w = norm(word);
  if (!S.meta.unknown.includes(w)) { S.meta.unknown.push(w); await setMeta('unknown', S.meta.unknown); }
}

// Yedekleme
export async function exportAll() {
  return JSON.stringify({
    app: 'memo-fransizca', version: 1, exported: new Date().toISOString(),
    decks: S.decks, words: [...S.words.values()], cards: S.cards, texts: S.texts, days: [...S.days.values()],
    meta: Object.entries(S.meta).map(([key, value]) => ({ key, value })),
  });
}
export async function importAll(json) {
  const o = JSON.parse(json);
  if (o.app !== 'memo-fransizca') throw new Error('Bu dosya bir Mémo yedeği değil');
  await db.clearAll();
  for (const k of ['decks', 'words', 'cards', 'texts', 'days', 'meta']) await db.bulkPut(k, o[k] || []);
  await load();
}
export async function resetAll() { await db.clearAll(); await load(); }
