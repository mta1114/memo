// Kart çalışma ekranı
import { S, today, saveDay, putCard, putWord, deckById } from './store.js';
import { preview } from './fsrs.js';
import { esc, fmtIvl, endOfToday, DAY, MIN, compareFr, compareTr, RESULT_LABEL } from './util.js';
import { TYPE_LABEL } from './parser.js';
import { speak, stop } from './tts.js';
import { genderClass, accentBar, setTop } from './ui.js';

const enabled = c => !c.suspended && (c.dir === 'fr2tr' || S.settings.reverse);

function groupByWord(cards) { const m = new Map(); for (const c of cards) { if (!m.has(c.wordId)) m.set(c.wordId, []); m.get(c.wordId).push(c); } return m; }

export function queueInfo(deckIds) {
  const set = new Set(deckIds);
  const now = Date.now(), eod = endOfToday(), sod = eod - DAY, day = today();
  const byWord = groupByWord(S.cards);
  const sib = c => (byWord.get(c.wordId) || []).find(x => x.id !== c.id);
  const cs = S.cards.filter(c => set.has(c.deckId) && enabled(c));
  const learning = cs.filter(c => c.state === 'learning' || c.state === 'relearning').sort((a, b) => a.due - b.due);
  const revLeft = Math.max(0, S.settings.maxReviews - (day.revDone || 0));
  const reviews = cs.filter(c => c.state === 'review' && c.due <= eod && !((sib(c)?.last || 0) >= sod)).sort((a, b) => a.due - b.due).slice(0, revLeft);
  const news = [];
  const perDeck = new Map();
  for (const c of cs) if (c.state === 'new') { if (!perDeck.has(c.deckId)) perDeck.set(c.deckId, []); perDeck.get(c.deckId).push(c); }
  for (const [deckId, list] of perDeck) {
    let left = Math.max(0, S.settings.newPerDay - (day.newByDeck?.[deckId] || 0));
    list.sort((a, b) => a.ord - b.ord);
    for (const c of list) {
      if (!left) break;
      if (c.dir === 'tr2fr') { const s = sib(c); if (s && (s.state === 'new' || s.last >= sod)) continue; }
      else { const s = sib(c); if (s && s.last >= sod) continue; }
      news.push(c); left--;
    }
  }
  news.sort((a, b) => a.ord - b.ord);
  return { learning, learnNow: learning.filter(c => c.due <= now), reviews, news };
}

export function renderStudy(view, deckIds, title) {
  setTop(title, '#/');
  let n = 0, cur = null, revealed = false, typed = null, sessionCount = 0;
  const pick = () => {
    const q = queueInfo(deckIds);
    if (q.learnNow.length) return q.learnNow[0];
    const useNew = q.news.length && (!q.reviews.length || n % 4 === 3);
    if (useNew) return q.news[0];
    if (q.reviews.length) return q.reviews[0];
    const soon = q.learning.filter(c => c.due - Date.now() < 20 * MIN);
    return soon[0] || null;
  };
  const counts = () => {
    const q = queueInfo(deckIds);
    return `<span class="cnt c-new" title="Yeni">${q.news.length}</span><span class="cnt c-learn" title="Öğrenme">${q.learning.length}</span><span class="cnt c-rev" title="Tekrar">${q.reviews.length}</span>`;
  };

  function show() {
    stop();
    cur = pick(); revealed = false; typed = null;
    if (!cur) return finished();
    const w = S.words.get(cur.wordId);
    if (!w) { cur.suspended = true; putCard(cur); return show(); }
    const fr2tr = cur.dir === 'fr2tr';
    const gc = genderClass(w.type);
    const front = fr2tr
      ? `<div class="big fr ${gc}">${esc(w.fr)}</div><div class="type">${esc(TYPE_LABEL[w.type] || '')}</div>
         <button class="icon-btn say" data-say aria-label="Dinle">🔊</button>`
      : `<div class="big">${esc(w.tr)}</div><div class="type">${esc((TYPE_LABEL[w.type] || '').replace(/ · .*/, ''))}</div>`;
    const typing = S.settings.typeAnswer ? `
      <div class="type-answer">
        <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${fr2tr ? 'Türkçesini yaz…' : 'Fransızcasını yaz…'}">
        ${fr2tr ? '' : accentBar()}
      </div>` : '';
    view.innerHTML = `
      <div class="study">
        <div class="study-head"><div class="counts">${counts()}</div><div class="muted small">${esc(deckById(cur.deckId)?.name || '')} · ${fr2tr ? 'FR → TR' : 'TR → FR'}</div></div>
        <div class="flash">
          <div class="front">${front}</div>
          ${typing}
          <div class="back" hidden></div>
        </div>
        <div class="study-actions" id="acts"><button class="btn primary wide" id="reveal">Cevabı göster</button></div>
      </div>`;
    const say = view.querySelector('[data-say]'); if (say) say.onclick = () => speak(w.fr);
    view.querySelector('#reveal').onclick = reveal;
    const ans = view.querySelector('#ans');
    if (ans) { ans.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); reveal(); } }); setTimeout(() => ans.focus(), 50); }
    if (fr2tr && S.settings.autoplay) speak(w.fr);
  }

  function reveal() {
    if (revealed) return; revealed = true;
    const w = S.words.get(cur.wordId);
    const fr2tr = cur.dir === 'fr2tr';
    const ans = view.querySelector('#ans');
    let res = '';
    if (ans) {
      const v = ans.value;
      typed = fr2tr ? compareTr(v, w.tr) : (() => {
        const alts = w.fr.split(',').map(s => s.trim());
        const r = alts.map(a => compareFr(v, a));
        for (const k of ['ok', 'accent', 'article', 'close']) if (r.includes(k)) return k;
        return 'wrong';
      })();
      ans.disabled = true;
      res = `<div class="typed r-${typed}">${typed === 'ok' ? '✓' : typed === 'wrong' ? '✗' : '≈'} ${esc(RESULT_LABEL[typed])}${v ? ` — <i>${esc(v)}</i>` : ''}</div>`;
    }
    const back = view.querySelector('.back');
    back.hidden = false;
    back.innerHTML = `${res}
      ${fr2tr ? `<div class="big2">${esc(w.tr)}</div>` : `<div class="big fr ${genderClass(w.type)}">${esc(w.fr)}</div><div class="type">${esc(TYPE_LABEL[w.type] || '')}</div><button class="icon-btn say" data-say2 aria-label="Dinle">🔊</button>`}
      ${w.ipa ? `<div class="ipa">${esc(w.ipa)}</div>` : ''}
      ${w.ex ? `<div class="example"><button class="icon-btn sm" data-sayex aria-label="Örneği dinle">🔊</button><div><div class="fr">${esc(w.ex)}</div>${w.exTr ? `<div class="muted">${esc(w.exTr)}</div>` : ''}</div></div>` : ''}`;
    const s2 = back.querySelector('[data-say2]'); if (s2) s2.onclick = () => speak(w.fr);
    const sx = back.querySelector('[data-sayex]'); if (sx) sx.onclick = () => speak(w.ex);
    if (!fr2tr && S.settings.autoplay) speak(w.fr);
    const pv = preview(cur);
    const now = Date.now();
    const sug = typed ? (typed === 'ok' ? 3 : typed === 'wrong' ? 1 : 2) : 0;
    const lab = { 1: 'Tekrar', 2: 'Zor', 3: 'İyi', 4: 'Kolay' };
    view.querySelector('#acts').innerHTML = `<div class="rate">${[1, 2, 3, 4].map(g =>
      `<button class="rbtn r${g} ${sug === g ? 'sug' : ''}" data-g="${g}"><span>${lab[g]}</span><small>${fmtIvl(pv[g].due - now)}</small></button>`).join('')}</div>`;
    view.querySelectorAll('.rbtn').forEach(b => b.onclick = () => answer(+b.dataset.g, pv));
  }

  async function answer(g, pv) {
    const old = cur.state;
    const nc = pv[g];
    Object.assign(cur, nc);
    const day = today();
    day.reviews++; if (g === 1) day.again++;
    if (old === 'new') { day.newTotal++; day.newByDeck[cur.deckId] = (day.newByDeck[cur.deckId] || 0) + 1; }
    if (old === 'review') day.revDone++;
    n++; sessionCount++;
    const w = S.words.get(cur.wordId);
    const jobs = [putCard(cur), saveDay(day)];
    if (g === 1 && w) { w.wrong = (w.wrong || 0) + 1; jobs.push(putWord(w)); }
    await Promise.all(jobs);
    show();
  }

  function finished() {
    const q = queueInfo(deckIds);
    const later = q.learning.length ? `<p class="muted">${q.learning.length} kart öğrenme aşamasında; birkaç dakika sonra tekrar gelecek.</p>` : '';
    view.innerHTML = `<div class="empty-state"><div class="emoji">🎉</div><h2>Bu destede bugünlük iş bitti!</h2>
      <p>Bu oturumda ${sessionCount} kart çalıştın.</p>${later}
      <a class="btn primary" href="#/">Ana sayfaya dön</a> <a class="btn" href="#/texts">🎧 Dinleme metinleri</a></div>`;
  }

  const keys = e => {
    if (!document.body.contains(view.querySelector('.study'))) { document.removeEventListener('keydown', keys); return; }
    if (e.target.matches('input')) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (revealed && ['1', '2', '3', '4'].includes(e.key)) view.querySelector(`.rbtn[data-g="${e.key}"]`)?.click();
    else if (revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); view.querySelector('.rbtn[data-g="3"]')?.click(); }
  };
  document.addEventListener('keydown', keys);
  show();
}
