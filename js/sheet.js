// Kelimeye tıklayınca açılan bilgi paneli
import { S, deckById, addWordToDeck, addUnknown, cardsOfWord, keyOf } from './store.js';
import { esc, toast, norm } from './util.js';
import { TYPE_LABEL, isNoun } from './parser.js';
import { conjugate, TENSES } from './conj.js';
import { corpusExamples, adjForms, nounPlural, invalidate } from './dict.js';
import { speak } from './tts.js';
import { openSheet, closeSheet, genderClass, accentBar } from './ui.js';

export function showWordSheet(hit, clicked) {
  if (!hit) return /^\p{Lu}/u.test(clicked || '') ? showProper(clicked) : showUnknown(clicked);
  const w = hit.word;
  const deck = w.deckId != null ? deckById(w.deckId) : null;
  const hasCards = cardsOfWord(w.id).length > 0;
  const formNote = clicked && norm(clicked) !== norm(w.fr) && norm(clicked) !== w.key
    ? `<div class="form-note">Metindeki biçim: <b>${esc(clicked)}</b> → sözlük hali <b>${esc(w.fr)}</b></div>` : '';
  let extra = '';
  if (w.type === 'v') {
    const c = conjugate(w.fr);
    if (c) {
      extra = `<h3>Çekimler <span class="muted small">(yardımcı fiil: ${esc(c.aux || 'avoir')})</span></h3>
      <div class="tabs" role="tablist">${TENSES.map(([k, l], i) => `<button class="tab ${i ? '' : 'on'}" data-k="${k}">${l}</button>`).join('')}</div>
      ${TENSES.map(([k], i) => `<table class="conj" data-k="${k}" ${i ? 'hidden' : ''}>${c.tenses[k].map(r => `<tr><td>${esc(r)}</td><td><button class="icon-btn xs" data-say="${esc(r.replace('il/elle', 'il').replace('ils/elles', 'ils'))}" aria-label="Dinle">🔊</button></td></tr>`).join('')}</table>`).join('')}`;
    }
  } else if (w.type === 'adj') {
    const f = adjForms(w);
    extra = `<h3>Biçimler</h3><table class="forms"><tr><th></th><th>tekil</th><th>çoğul</th></tr>
      <tr><th>eril</th><td>${esc(f.ms)}</td><td>${esc(f.mp)}</td></tr><tr><th>dişil</th><td>${esc(f.fs)}</td><td>${esc(f.fp)}</td></tr></table>`;
  } else if (isNoun(w.type) && !/p$/.test(w.type)) {
    extra = `<h3>Çoğul</h3><p class="fr">${esc(nounPlural(w.fr))}</p>`;
  }
  const ex = corpusExamples(w, 3);
  const exHtml = ex.length ? `<h3>Metinlerden örnekler</h3>${ex.map(e => `<div class="example"><button class="icon-btn sm" data-say="${esc(e.sent)}" aria-label="Dinle">🔊</button><div><div class="fr">${highlight(e.sent, e.form)}</div><div class="muted small">${esc(e.title)}</div></div></div>`).join('')}` : '';
  const html = `
    <div class="ws-head"><div><div class="big fr ${genderClass(w.type)}">${esc(w.fr)}</div>
      <div class="type">${esc(TYPE_LABEL[w.type] || '')}${deck ? ` · ${esc(deck.name)}` : ''}</div></div>
      <button class="icon-btn" data-say="${esc(w.fr.split(',')[0])}" aria-label="Dinle">🔊</button></div>
    ${formNote}
    ${w.ipa ? `<div class="ipa">${esc(w.ipa)}</div>` : ''}
    <div class="meaning">${esc(w.tr)}</div>
    ${w.ex ? `<div class="example"><button class="icon-btn sm" data-say="${esc(w.ex)}" aria-label="Dinle">🔊</button><div><div class="fr">${esc(w.ex)}</div>${w.exTr ? `<div class="muted">${esc(w.exTr)}</div>` : ''}</div></div>` : ''}
    ${extra}
    ${exHtml}
    <div class="sheet-actions">${hasCards
      ? `<span class="pill ok">✓ Kart destende var</span>`
      : `<button class="btn primary" id="addw">➕ Desteme ekle</button>`}</div>`;
  openSheet(html, body => {
    body.querySelectorAll('[data-say]').forEach(b => b.onclick = () => speak(b.dataset.say));
    body.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      body.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
      body.querySelectorAll('table.conj').forEach(x => x.hidden = x.dataset.k !== t.dataset.k);
    });
    const add = body.querySelector('#addw');
    if (add) add.onclick = async () => {
      const d = await addWordToDeck(w, 'Metinlerden');
      toast(`"${w.fr}" → ${d.name} destesine eklendi`);
      add.outerHTML = `<span class="pill ok">✓ Kart destende var</span>`;
    };
  });
}

function highlight(sent, form) {
  const i = sent.indexOf(form);
  if (i < 0) return esc(sent);
  return esc(sent.slice(0, i)) + '<mark>' + esc(form) + '</mark>' + esc(sent.slice(i + form.length));
}

function showProper(word) {
  openSheet(`<div class="ws-head"><div><div class="big fr">${esc(word)}</div><div class="type">özel isim</div></div><button class="icon-btn" id="say" aria-label="Dinle">🔊</button></div>
    <p>Bu bir kişi ya da yer adı gibi görünüyor; sözlükte yer almaz.</p>
    <div class="sheet-actions"><button class="btn" id="ask">❓ Yine de sorulacaklara ekle</button></div>`, body => {
    body.querySelector('#say').onclick = () => speak(word);
    body.querySelector('#ask').onclick = async () => { await addUnknown(word); toast('Sorulacaklara eklendi'); closeSheet(); };
  });
}

function showUnknown(word) {
  const asked = S.meta.unknown.includes(norm(word));
  openSheet(`
    <div class="big fr">${esc(word)}</div>
    <p>Bu kelime sözlükte yok.</p>
    <div class="sheet-actions">
      ${asked ? '<span class="pill">❓ Sorulacaklar listesinde</span>' : '<button class="btn" id="ask">❓ Sorulacaklara ekle</button>'}
      <button class="btn" id="own">✍️ Anlamını kendim gireyim</button>
    </div>
    <p class="muted small">"Sorulacaklar" listesi, bir sonraki paket isteği mesajına eklenir; yeni paketteki sözlükte açıklanır.</p>
    <form id="ownf" hidden class="stack">
      <label>Fransızca (sözlük hali)<input type="text" name="fr" value="${esc(word.toLowerCase())}" required></label>
      ${accentBar()}
      <label>Türkçe anlamı<input type="text" name="tr" required></label>
      <label>Tür<select name="type"><option value="">—</option>${Object.entries(TYPE_LABEL).filter(([k]) => k).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Örnek cümle (isteğe bağlı)<input type="text" name="ex"></label>
      <button class="btn primary">Kaydet ve desteme ekle</button>
    </form>`, body => {
    const ask = body.querySelector('#ask');
    if (ask) ask.onclick = async () => { await addUnknown(word); ask.outerHTML = '<span class="pill">❓ Sorulacaklar listesinde</span>'; toast('Sorulacaklara eklendi'); };
    body.querySelector('#own').onclick = () => { body.querySelector('#ownf').hidden = false; };
    body.querySelector('#ownf').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const w = { fr: f.get('fr').trim(), tr: f.get('tr').trim(), type: f.get('type'), ex: f.get('ex').trim(), exTr: '', ipa: '', deckId: null };
      w.key = keyOf(w.fr);
      await addWordToDeck(w, 'Kendi kelimelerim');
      S.meta.unknown = S.meta.unknown.filter(x => x !== norm(word));
      invalidate(); closeSheet(); toast('Kelime eklendi');
    };
  });
}
