// "Dinle ve Anla" modülü: metin listesi ve 6 adımlık akış
import { S, putText, today, saveDay, putWord, putCard, addWordToDeck, addUnknown, cardsOfWord, saveSettings } from './store.js';
import { esc, norm, stripAccents, compareFr, toast } from './util.js';
import { Player, stop, ttsAvailable } from './tts.js';
import { tokenize, lookupAt, lookupForm, invalidate } from './dict.js';
import { showWordSheet } from './sheet.js';
import { accentBar, setTop } from './ui.js';
import { requestMessage } from './request.js';
import { openSheet } from './ui.js';
import { copyText } from './util.js';

// ---------- Metin hazırlama ----------
function splitSentences(p) {
  const out = []; const re = /[^.!?…]+(?:[.!?…]+[»"”)]*)?\s*/g; let m;
  while ((m = re.exec(p))) { if (m[0].trim()) out.push(m[0]); if (m[0] === '') re.lastIndex++; }
  return out;
}
export function prepText(t) {
  let gi = 0; const sents = [], gaps = [];
  t.paras.forEach((p, pi) => {
    const parts = splitSentences(p);
    parts.forEach((s, si) => {
      const segs = []; let last = 0;
      s.replace(/\[\[(.+?)\]\]/g, (m, inner, off) => {
        if (off > last) segs.push({ t: 'text', v: s.slice(last, off) });
        segs.push({ t: 'gap', v: inner.trim(), gi }); gaps.push(inner.trim()); gi++;
        last = off + m.length; return m;
      });
      if (last < s.length) segs.push({ t: 'text', v: s.slice(last) });
      sents.push({ para: pi, segs, text: s.replace(/\[\[(.+?)\]\]/g, '$1').trim(), paraEnd: si === parts.length - 1 });
    });
  });
  return { sents, gaps };
}

const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

// ---------- Liste ----------
export function renderTexts(view) {
  setTop('Dinle ve Anla');
  const filter = sessionStorage.getItem('tf') || 'all';
  const levels = [...new Set(S.texts.map(t => t.level).filter(Boolean))];
  const topics = [...new Set(S.texts.map(t => t.topic).filter(Boolean))];
  const list = S.texts.filter(t => filter === 'all' || (filter === 'new' && !t.done) || (filter === 'done' && t.done) || t.level === filter || t.topic === filter);
  const left = S.texts.filter(t => !t.done).length;
  view.innerHTML = `
    ${!ttsAvailable() ? '<div class="warn">Bu tarayıcı sesli okumayı desteklemiyor.</div>' : ''}
    <div class="row-between"><p class="muted">${S.texts.length} metin · <b>${left}</b> tanesi çözülmedi</p></div>
    ${left <= 3 && S.texts.length ? `<div class="notice">📦 ${left ? `Son ${left} metnin kaldı.` : 'Bütün metinleri bitirdin!'} Yeni paket için aşağıdaki butonu kullan.</div>` : ''}
    <div class="btn-row"><button class="btn" id="req">📋 Yeni paket isteği oluştur</button><a class="btn" href="#/import">📥 Dosyadan ekle</a></div>
    <div class="chips">${[['all', 'Tümü'], ['new', 'Çözülmedi'], ['done', 'Çözüldü'], ...levels.map(l => [l, l]), ...topics.map(x => [x, x])].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div class="list">${list.map(t => `
      <a class="item text-item" href="#/text/${t.id}">
        <div><div class="title">${t.done ? '✅ ' : ''}${esc(t.title)}</div>
          <div class="muted small">${esc([t.level, t.topic].filter(Boolean).join(' · '))} · ${t.gapCount} boşluk · ${t.mcq.length + t.open.length} soru</div></div>
        ${t.results ? `<div class="scores small"><span title="Çoktan seçmeli">ÇS ${t.results.mcq}/${t.results.mcqTotal}</span><span title="Açık uçlu">AU ${t.results.open}/${t.results.openTotal}</span><span title="Boşluk">B ${pct(t.results.gaps, t.results.gapTotal)}%</span></div>` : '<span class="chev">›</span>'}
      </a>`).join('') || '<p class="muted">Bu filtrede metin yok.</p>'}</div>`;
  view.querySelectorAll('.chip').forEach(c => c.onclick = () => { sessionStorage.setItem('tf', c.dataset.f); renderTexts(view); });
  view.querySelector('#req').onclick = () => showRequest('texts');
}

export function showRequest(kind) {
  const msg = requestMessage(kind);
  openSheet(`<h2>${kind === 'texts' ? 'Yeni metin paketi isteği' : 'Yeni kelime paketi isteği'}</h2>
    <p>Bu mesajı kopyala ve Claude'a yapıştır. Claude sana bir <b>.txt</b> dosyası hazırlayacak; sonra <b>📥 Dosyadan ekle</b> ile yükle.</p>
    <textarea class="mono" rows="12" readonly>${esc(msg)}</textarea>
    <div class="sheet-actions"><button class="btn primary" id="cp">📋 Mesajı kopyala</button></div>`, body => {
    body.querySelector('#cp').onclick = async () => { toast(await copyText(msg) ? 'Kopyalandı ✓' : 'Kopyalanamadı; metni seçip elle kopyala'); };
  });
}

// ---------- Akış ----------
export function renderTextFlow(view, id, startStep) {
  const t = S.texts.find(x => String(x.id) === String(id));
  if (!t) { view.innerHTML = '<p>Metin bulunamadı.</p>'; return; }
  setTop(t.title, '#/texts');
  const P = prepText(t);
  const st = { step: startStep || 'listen', listens: 0, mcq: [], open: [], openGrade: [], gaps: [], gapRes: [], player: null, hl: S.settings.highlight };
  const limit = S.settings.listenLimit; // 0 = sınırsız
  const listensLeft = () => limit ? Math.max(0, limit - st.listens) : Infinity;

  const killPlayer = () => { if (st.player) { st.player.destroy(); st.player = null; } stop(); };
  window.__leave = killPlayer;

  const steps = [['listen', 'Dinle'], ['questions', 'Sorular'], ['qresults', 'Sonuç'], ['gaps', 'Boşluk'], ['gresults', 'Sonuç'], ['read', 'Oku']];
  const stepper = () => `<ol class="stepper">${steps.map(([k, l], i) => `<li class="${k === st.step ? 'on' : steps.findIndex(s => s[0] === st.step) > i ? 'past' : ''}"><span>${i + 1}</span>${l}</li>`).join('')}</ol>`;
  const meta = `<div class="muted small">${esc([t.level, t.topic].filter(Boolean).join(' · '))}</div>`;

  function go(step) { killPlayer(); st.step = step; window.scrollTo(0, 0); render(); }
  function render() {
    ({ listen, questions, qresults, gaps, gresults, read })[st.step]();
  }

  // Oynatıcı (counted=true: dinleme hakkı sayılır)
  function mountPlayer(el, { counted, highlight, full } = {}) {
    killPlayer();
    const p = new Player(P.sents, {
      onState: (playing) => { const b = el.querySelector('[data-pp]'); if (b) b.textContent = playing ? '⏸ Duraklat' : (p.i > 0 ? '▶️ Devam et' : (counted ? `▶️ Dinle` : '▶️ Oynat')); },
      onSentence: (i) => {
        const pr = el.querySelector('.prog-bar'); if (pr) pr.style.width = (i < 0 ? 100 : pct(i, P.sents.length)) + '%';
        const pc = el.querySelector('.prog-txt'); if (pc) pc.textContent = i < 0 ? 'Bitti' : `Cümle ${i + 1} / ${P.sents.length}`;
        if (highlight) {
          document.querySelectorAll('.sent.hl').forEach(s => s.classList.remove('hl'));
          if (i >= 0 && st.hl) { const s = document.querySelector(`.sent[data-s="${i}"]`); if (s) { s.classList.add('hl'); s.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
        }
      },
      onDone: () => { updCount(); },
    });
    st.player = p;
    const updCount = () => { const c = el.querySelector('.listen-left'); if (c) c.textContent = limit ? `Kalan dinleme hakkı: ${listensLeft()}` : 'Sınırsız dinleme'; const b = el.querySelector('[data-pp]'); if (b && counted && !p.playing && p.i === 0 && listensLeft() <= 0) { b.disabled = true; b.textContent = 'Dinleme hakkın bitti'; } };
    el.innerHTML = `
      <div class="player ${full ? 'full' : ''}">
        <div class="prog"><div class="prog-bar"></div></div>
        <div class="row-between small"><span class="prog-txt">Cümle 0 / ${P.sents.length}</span><span class="listen-left"></span></div>
        <div class="pbtns">
          ${counted ? '' : '<button class="btn" data-prev title="Önceki cümle">⏮</button>'}
          <button class="btn primary" data-pp>▶️ ${counted ? 'Dinle' : 'Oynat'}</button>
          ${counted ? '' : '<button class="btn" data-rep title="Cümleyi tekrarla">🔁</button>'}
          <select data-rate aria-label="Hız">${[0.6, 0.75, 0.9, 1, 1.1].map(r => `<option value="${r}" ${Math.abs(r - S.settings.rate) < 0.01 ? 'selected' : ''}>${String(r).replace('.', ',')}x</option>`).join('')}</select>
        </div>
      </div>`;
    if (!counted) el.querySelector('.listen-left').textContent = '';
    else updCount();
    el.querySelector('[data-pp]').onclick = () => {
      if (!p.playing && p.i === 0 && counted) { if (listensLeft() <= 0) return; st.listens++; }
      p.toggle(); if (counted) updCount();
    };
    const pv = el.querySelector('[data-prev]'); if (pv) pv.onclick = () => p.prev();
    const rp = el.querySelector('[data-rep]'); if (rp) rp.onclick = () => p.repeat();
    el.querySelector('[data-rate]').onchange = e => { p.rate = +e.target.value; S.settings.rate = p.rate; saveSettings(); };
    return p;
  }

  // 1) Dinle
  function listen() {
    view.innerHTML = `${stepper()}${meta}
      <div class="panel center"><h2>🎧 Metni dinle</h2>
        <p class="muted">Metin ekranda görünmüyor. Dikkatle dinle; sonra soruları cevaplayacaksın.${limit ? ` Toplam <b>${limit}</b> dinleme hakkın var (sorular ekranında da kullanabilirsin).` : ''}</p>
        <div id="pl"></div></div>
      <div class="btn-row end"><button class="btn primary" id="next">Sorulara geç →</button></div>`;
    mountPlayer(view.querySelector('#pl'), { counted: true, full: true });
    view.querySelector('#next').onclick = () => { if (st.player) st.player.pause(); go('questions'); };
  }

  // 2) Sorular
  function questions() {
    view.innerHTML = `${stepper()}${meta}
      <div id="pl" class="sticky-player"></div>
      <h2>Çoktan seçmeli</h2>
      ${t.mcq.map((q, i) => `<fieldset class="q"><legend>${i + 1}. ${esc(q.q)}</legend>${q.opts.map((o, j) => `<label class="opt"><input type="radio" name="m${i}" value="${j}" ${st.mcq[i] === j ? 'checked' : ''}> <span>${'abcdef'[j]}) ${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}
      <h2>Açık uçlu <span class="muted small">(Fransızca cevapla)</span></h2>
      ${accentBar()}
      ${t.open.map((q, i) => `<div class="q"><div class="qtext">${i + 1}. ${esc(q.q)}</div><textarea data-o="${i}" rows="2" autocapitalize="sentences" spellcheck="false" placeholder="Réponds en français…">${esc(st.open[i] || '')}</textarea></div>`).join('')}
      <div class="btn-row end"><button class="btn primary" id="check">Cevapları kontrol et</button></div>`;
    mountPlayer(view.querySelector('#pl'), { counted: true });
    view.querySelector('#check').onclick = () => {
      st.mcq = t.mcq.map((q, i) => { const r = view.querySelector(`input[name=m${i}]:checked`); return r ? +r.value : -1; });
      st.open = t.open.map((q, i) => view.querySelector(`textarea[data-o="${i}"]`).value.trim());
      const empty = st.mcq.filter(x => x < 0).length + st.open.filter(x => !x).length;
      if (empty && !confirm(`${empty} soru boş. Yine de kontrol edilsin mi?`)) return;
      st.openGrade = t.open.map((q, i) => autoGrade(st.open[i], q.keywords));
      go('qresults');
    };
  }

  // 3) Soru sonuçları
  function qresults() {
    const mcqOk = t.mcq.filter((q, i) => st.mcq[i] === q.ans).length;
    const openPts = () => st.openGrade.reduce((a, g) => a + (g.grade === 'ok' ? 1 : g.grade === 'half' ? 0.5 : 0), 0);
    view.innerHTML = `${stepper()}${meta}
      <div class="score-box"><div><b>${mcqOk}/${t.mcq.length}</b><span>çoktan seçmeli</span></div><div><b id="opts">${fmtPts(openPts())}/${t.open.length}</b><span>açık uçlu</span></div></div>
      <h2>Çoktan seçmeli</h2>
      ${t.mcq.map((q, i) => {
        const ok = st.mcq[i] === q.ans;
        return `<div class="q res ${ok ? 'good' : 'bad'}"><div class="qtext">${ok ? '✅' : '❌'} ${i + 1}. ${esc(q.q)}</div>
          ${q.opts.map((o, j) => `<div class="opt-r ${j === q.ans ? 'correct' : ''} ${j === st.mcq[i] && !ok ? 'chosen' : ''}">${'abcdef'[j]}) ${esc(o)}${j === q.ans ? ' ✓' : ''}${j === st.mcq[i] && !ok ? ' ← senin cevabın' : ''}</div>`).join('')}
          ${q.expl ? `<div class="expl">💡 ${esc(q.expl)}</div>` : ''}</div>`;
      }).join('')}
      <h2>Açık uçlu</h2>
      <p class="muted small">Uygulama anahtar kelimelere bakarak bir ön puan verdi. Örnek cevapla karşılaştır ve son kararı sen ver.</p>
      ${t.open.map((q, i) => {
        const g = st.openGrade[i];
        return `<div class="q res"><div class="qtext">${i + 1}. ${esc(q.q)}</div>
          <div class="ans-box"><span class="lbl">Senin cevabın</span><div class="fr">${esc(st.open[i]) || '<i class="muted">(boş)</i>'}</div></div>
          ${q.keywords.length ? `<div class="kw">${g.hits.map(h => `<span class="pill ${h.ok ? 'ok' : 'no'}">${h.ok ? '✓' : '✗'} ${esc(h.kw)}</span>`).join('')}</div>` : ''}
          <div class="ans-box model"><span class="lbl">Örnek cevap</span><div class="fr">${esc(q.answer)}</div></div>
          <div class="grade" data-i="${i}">${[['ok', '✅ Doğru'], ['half', '🟡 Kısmen'], ['no', '❌ Yanlış']].map(([k, l]) => `<button class="gbtn ${g.grade === k ? 'on' : ''}" data-g="${k}">${l}</button>`).join('')}</div></div>`;
      }).join('')}
      <div class="btn-row end"><button class="btn primary" id="next">Boşluk doldurmaya geç →</button></div>`;
    view.querySelectorAll('.grade').forEach(gr => gr.querySelectorAll('.gbtn').forEach(b => b.onclick = () => {
      st.openGrade[+gr.dataset.i].grade = b.dataset.g;
      gr.querySelectorAll('.gbtn').forEach(x => x.classList.toggle('on', x === b));
      view.querySelector('#opts').textContent = `${fmtPts(openPts())}/${t.open.length}`;
    }));
    view.querySelector('#next').onclick = () => {
      st.result = { mcq: mcqOk, mcqTotal: t.mcq.length, open: openPts(), openTotal: t.open.length };
      go('gaps');
    };
  }

  // 4) Boşluk doldurma
  function sentHtml(mode) {
    let html = '', para = -1;
    P.sents.forEach((s, i) => {
      if (s.para !== para) { if (para >= 0) html += '</p>'; html += '<p>'; para = s.para; }
      html += `<span class="sent" data-s="${i}">` + s.segs.map(g => {
        if (g.t === 'text') return mode === 'read' ? clickable(g.v) : esc(g.v);
        if (mode === 'gaps') return `<input type="text" class="gap" data-g="${g.gi}" size="${Math.max(4, g.v.length + 1)}" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" value="${esc(st.gaps[g.gi] || '')}">`;
        if (mode === 'gresults') {
          const r = st.gapRes[g.gi];
          return r === 'ok' ? `<span class="gap-r ok">${esc(g.v)}</span>`
            : `<span class="gap-r ${r === 'wrong' ? 'bad' : 'mid'}">${st.gaps[g.gi] ? `<s>${esc(st.gaps[g.gi])}</s> ` : ''}${esc(g.v)}</span>`;
        }
        return `<span class="target">${clickable(g.v)}</span>`;
      }).join('') + '</span>';
    });
    return html + '</p>';
  }
  let tokCounter = 0, tokens = [];
  function clickable(str) {
    const { tokens: tk, tail } = tokenize(str);
    let out = '';
    for (const x of tk) { const ti = tokens.length; tokens.push(x); out += esc(x.pre) + `<span class="w" data-t="${ti}">${esc(x.text)}</span>`; }
    return out + esc(tail);
  }

  function gaps() {
    view.innerHTML = `${stepper()}${meta}
      <div class="sticky-player"><div id="pl"></div>
        <label class="switch"><input type="checkbox" id="hl" ${st.hl ? 'checked' : ''}> <span>Okunan cümleyi vurgula</span></label>
        ${accentBar()}</div>
      <p class="muted small">Ses metni okurken boşlukları duyduklarınla doldur. Bir cümleye dokunarak oradan dinlemeye başlayabilirsin.</p>
      <div class="reader gaps">${sentHtml('gaps')}</div>
      <div class="btn-row end"><button class="btn primary" id="check">Kontrol et</button></div>`;
    mountPlayer(view.querySelector('#pl'), { counted: false, highlight: true });
    view.querySelector('#hl').onchange = e => {
      st.hl = e.target.checked; S.settings.highlight = st.hl; saveSettings();
      if (!st.hl) document.querySelectorAll('.sent.hl').forEach(s => s.classList.remove('hl'));
    };
    view.querySelectorAll('.sent').forEach(s => s.addEventListener('click', e => { if (e.target.matches('input')) return; st.player.pause(); st.player.play(+s.dataset.s); }));
    view.querySelectorAll('input.gap').forEach(inp => {
      inp.addEventListener('input', () => { st.gaps[+inp.dataset.g] = inp.value; });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const nx = view.querySelector(`input.gap[data-g="${+inp.dataset.g + 1}"]`); nx ? nx.focus() : inp.blur(); } });
    });
    view.querySelector('#check').onclick = async () => {
      view.querySelectorAll('input.gap').forEach(inp => st.gaps[+inp.dataset.g] = inp.value);
      const empty = P.gaps.filter((g, i) => !(st.gaps[i] || '').trim()).length;
      if (empty && !confirm(`${empty} boşluk boş. Yine de kontrol edilsin mi?`)) return;
      st.gapRes = P.gaps.map((g, i) => { const r = compareFr(st.gaps[i] || '', g); return r === 'article' ? 'accent' : r; });
      st.added = await handleMistakes();
      go('gresults');
    };
  }

  // Yanlış yapılan kelimeler: kart destesine ekle / öne al
  async function handleMistakes() {
    const added = [], boosted = [], unknown = [];
    invalidate();
    for (let i = 0; i < P.gaps.length; i++) {
      if (st.gapRes[i] === 'ok') continue;
      const g = P.gaps[i];
      const { tokens: tk } = tokenize(g);
      let hit = null;
      if (tk.length > 1) hit = lookupAt(tk, 0);
      if (!hit || (hit.range && hit.range[1] - hit.range[0] + 1 < tk.length && tk.length > 1)) { const whole = lookupForm(g); if (whole) hit = whole; }
      if (!hit && tk.length) {
        // en uzun anlamlı kelimeyi dene
        const cand = [...tk].sort((a, b) => b.text.length - a.text.length);
        for (const c of cand) { const r = lookupForm(c.text); if (r && !['art', 'prep', 'pron', 'conj'].includes(r.word.type)) { hit = r; break; } }
      }
      if (!hit) { unknown.push(g); await addUnknown(g); continue; }
      const w = hit.word;
      w.wrong = (w.wrong || 0) + 1; await putWord(w);
      const cs = cardsOfWord(w.id);
      if (!cs.length) { await addWordToDeck(w, 'Metinlerden'); added.push(w.fr); }
      else {
        const c = cs.find(x => x.dir === 'fr2tr');
        if (c && c.state === 'review' && c.due > Date.now()) { c.due = Date.now(); await putCard(c); boosted.push(w.fr); }
        else if (c && c.state === 'new') { c.ord = -Date.now() / 1000; await putCard(c); boosted.push(w.fr); }
      }
    }
    return { added: [...new Set(added)], boosted: [...new Set(boosted)], unknown };
  }

  // 5) Boşluk sonuçları
  function gresults() {
    const ok = st.gapRes.filter(r => r === 'ok').length;
    const mid = st.gapRes.filter(r => r === 'accent' || r === 'close').length;
    const a = st.added || { added: [], boosted: [], unknown: [] };
    view.innerHTML = `${stepper()}${meta}
      <div class="score-box"><div><b>${ok}/${P.gaps.length}</b><span>doğru</span></div><div><b>${mid}</b><span>aksan/yazım hatası</span></div><div><b>${P.gaps.length - ok - mid}</b><span>yanlış</span></div></div>
      <div class="legend small"><span class="gap-r ok">doğru</span> <span class="gap-r mid">aksan/yazım</span> <span class="gap-r bad">yanlış</span></div>
      <div class="reader">${sentHtml('gresults')}</div>
      ${a.added.length ? `<div class="notice">➕ Kart destene eklendi (Metinlerden): ${a.added.map(esc).join(', ')}</div>` : ''}
      ${a.boosted.length ? `<div class="notice">🔁 Kart sırasında öne alındı (ilk fırsatta sorulacak): ${a.boosted.map(esc).join(', ')}</div>` : ''}
      ${a.unknown.length ? `<div class="notice">❓ Sözlükte bulunamadı, sonraki paket isteğine eklendi: ${a.unknown.map(esc).join(', ')}</div>` : ''}
      <div class="btn-row end"><button class="btn primary" id="next">Metni oku ve kelimeleri incele →</button></div>`;
    view.querySelector('#next').onclick = async () => {
      st.result = { ...(st.result || {}), gaps: ok + mid * 0.5, gapTotal: P.gaps.length };
      await saveResults();
      go('read');
    };
  }

  async function saveResults() {
    const first = !t.done;
    t.done = true; t.attempts = (t.attempts || 0) + 1;
    t.results = { ...st.result, date: Date.now() };
    t.history = [...(t.history || []), t.results];
    await putText(t);
    if (first) { const d = today(); d.texts = (d.texts || 0) + 1; await saveDay(d); }
  }

  // 6) Etkileşimli metin
  function read() {
    tokens = [];
    view.innerHTML = `${stepper()}${meta}
      <div class="sticky-player"><div id="pl"></div>
        <label class="switch"><input type="checkbox" id="hl" ${st.hl ? 'checked' : ''}> <span>Okunan cümleyi vurgula</span></label></div>
      <p class="muted small">Herhangi bir kelimeye dokun: anlamı, örnekleri ve çekimleri açılır. Altı noktalı kelimeler boşluk kelimeleriydi.</p>
      <div class="reader read">${sentHtml('read')}</div>
      <div class="btn-row end"><button class="btn" id="again">↺ Baştan çöz</button><a class="btn primary" href="#/texts">Bitir ✓</a></div>`;
    mountPlayer(view.querySelector('#pl'), { counted: false, highlight: true });
    view.querySelector('#hl').onchange = e => { st.hl = e.target.checked; S.settings.highlight = st.hl; saveSettings(); if (!st.hl) document.querySelectorAll('.sent.hl').forEach(s => s.classList.remove('hl')); };
    const reader = view.querySelector('.reader');
    reader.addEventListener('click', e => {
      const w = e.target.closest('.w'); if (!w) return;
      const i = +w.dataset.t;
      // aynı paragraf içindeki belirteçlerle öbek ara
      const hit = lookupAt(tokens, i);
      reader.querySelectorAll('.w.sel').forEach(x => x.classList.remove('sel'));
      if (hit?.range) for (let k = hit.range[0]; k <= hit.range[1]; k++) reader.querySelector(`.w[data-t="${k}"]`)?.classList.add('sel');
      else w.classList.add('sel');
      showWordSheet(hit, hit?.form || tokens[i].text);
    });
    view.querySelector('#again').onclick = () => { Object.assign(st, { listens: 0, mcq: [], open: [], gaps: [], gapRes: [] }); go('listen'); };
  }

  render();
}

function fmtPts(x) { return String(x).replace('.', ','); }

// Açık uçlu ön puan: anahtar kelimelerin cevapta geçip geçmediği (aksan ve çekim farkları hoş görülür)
const STOP = new Set(['de', 'la', 'le', 'les', 'des', 'du', 'un', 'une', 'et', 'à', 'a', 'en', 'au', 'aux', "l'", "d'"]);
export function autoGrade(answer, keywords) {
  const A = stripAccents(norm(answer));
  const words = A.split(/[^a-z0-9]+/).filter(Boolean);
  const hits = keywords.map(kw => {
    const parts = stripAccents(norm(kw)).split(/[^a-z0-9]+/).filter(p => p && !STOP.has(p));
    const ok = parts.length > 0 && parts.every(k => words.some(w => w === k || (k.length >= 4 && w.length >= 4 && (w.startsWith(k.slice(0, Math.max(4, k.length - 2))) || k.startsWith(w.slice(0, Math.max(4, w.length - 2)))))));
    return { kw, ok };
  });
  const r = hits.length ? hits.filter(h => h.ok).length / hits.length : (answer ? 0.5 : 0);
  const grade = !answer ? 'no' : r >= 0.67 ? 'ok' : r >= 0.34 ? 'half' : 'no';
  return { hits, grade };
}
