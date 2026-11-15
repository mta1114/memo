import { S, load, saveSettings, importDecks, importTexts, deckById, putDeck, deleteDeck, deleteWord, putWord, addWordToDeck, keyOf, exportAll, importAll, resetAll, setMeta, today, deleteText } from './store.js';
import { $, esc, toast, download, dayKey, DAY, norm } from './util.js';
import { parseWords, parseTexts, detectType, TYPE_LABEL } from './parser.js';
import { queueInfo, renderStudy } from './study.js';
import { renderTexts, renderTextFlow, showRequest } from './listen.js';
import { invalidate } from './dict.js';
import { sortedFrVoices, onVoices, quality, speak, stop } from './tts.js';
import { setTop, genderClass, accentBar, openSheet, closeSheet } from './ui.js';
import { isMature } from './fsrs.js';
import { WORD_FORMAT, TEXT_FORMAT } from './request.js';

const view = $('#view');
const CONTENT_VERSION = 1;

// ---------- Hazır içerik ----------
async function loadBuiltin() {
  if ((S.meta.contentVersion || 0) >= CONTENT_VERSION) return;
  view.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>İlk kurulum: kelimeler ve metinler yükleniyor…</p></div>';
  const idx = await fetch('content/index.json').then(r => r.json());
  for (const f of idx.files) {
    const txt = await fetch('content/' + f).then(r => r.text());
    if (detectType(txt) === 'texts') await importTexts(parseTexts(txt).texts, { builtin: true });
    else await importDecks(parseWords(txt).decks, { builtin: true });
  }
  await setMeta('contentVersion', CONTENT_VERSION);
  invalidate();
}

// ---------- Yönlendirme ----------
const routes = [
  [/^#?\/?$/, home],
  [/^#\/study\/(all|\d+)$/, m => { const ids = m[1] === 'all' ? S.decks.filter(d => d.active).map(d => d.id) : [+m[1]]; renderStudy(view, ids, m[1] === 'all' ? 'Tüm desteler' : deckById(+m[1])?.name || 'Deste'); }],
  [/^#\/deck\/(\d+)$/, m => deckView(+m[1])],
  [/^#\/texts$/, () => renderTexts(view)],
  [/^#\/text\/(\d+)(?:\/(\w+))?$/, m => renderTextFlow(view, m[1], m[2])],
  [/^#\/import$/, importView],
  [/^#\/stats$/, statsView],
  [/^#\/settings$/, settingsView],
  [/^#\/help$/, helpView],
];
function route() {
  if (window.__leave) { window.__leave(); window.__leave = null; }
  stop(); closeSheet();
  const h = location.hash || '#/';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', h.startsWith(a.getAttribute('href')) && (a.getAttribute('href') !== '#/' || h === '#/' || h.startsWith('#/study') || h.startsWith('#/deck'))));
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { fn(m); window.scrollTo(0, 0); return; } }
  home();
}

// ---------- Ana sayfa ----------
function home() {
  setTop('Kartlar');
  const active = S.decks.filter(d => d.active);
  const all = queueInfo(active.map(d => d.id));
  const day = today();
  const rows = S.decks.map(d => {
    const q = queueInfo([d.id]);
    const total = [...S.words.values()].filter(w => w.deckId === d.id).length;
    return `<div class="deck ${d.active ? '' : 'inactive'}">
      <a class="deck-main" href="#/deck/${d.id}"><div class="title">${esc(d.name)}</div><div class="muted small">${total} kelime${d.level ? ' · ' + esc(d.level) : ''}${d.active ? '' : ' · çalışmaya kapalı'}</div></a>
      <div class="deck-counts"><span class="cnt c-new">${q.news.length}</span><span class="cnt c-learn">${q.learning.length}</span><span class="cnt c-rev">${q.reviews.length}</span></div>
      ${d.active ? `<a class="btn sm" href="#/study/${d.id}">Çalış</a>` : `<button class="btn sm" data-act="${d.id}">Aç</button>`}
    </div>`;
  }).join('');
  const due = all.news.length + all.learning.length + all.reviews.length;
  view.innerHTML = `
    <div class="hero">
      <div><div class="muted small">Bugün</div><div class="hero-num">${due ? `${due} kart seni bekliyor` : 'Bugünlük bitti 🎉'}</div>
      <div class="muted small">${day.reviews} kart çalıştın · ${streak()} gün seri 🔥</div></div>
      ${due ? '<a class="btn primary" href="#/study/all">Çalışmaya başla</a>' : '<a class="btn" href="#/texts">🎧 Metin dinle</a>'}
    </div>
    <div class="legend small"><span class="cnt c-new">yeni</span><span class="cnt c-learn">öğrenme</span><span class="cnt c-rev">tekrar</span></div>
    <div class="decks">${rows || '<p class="muted">Henüz deste yok.</p>'}</div>
    <div class="btn-row"><button class="btn" id="addw">➕ Kelime ekle</button><a class="btn" href="#/import">📥 Dosyadan ekle</a><button class="btn" id="reqw">📋 Kelime paketi iste</button></div>`;
  view.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { const d = deckById(+b.dataset.act); d.active = true; await putDeck(d); home(); toast(`${d.name} çalışmaya açıldı`); });
  view.querySelector('#addw').onclick = () => addWordSheet();
  view.querySelector('#reqw').onclick = () => showRequest('words');
}

export function streak() {
  let n = 0; let t = Date.now();
  const active = k => { const d = S.days.get(k); return d && (d.reviews > 0 || d.texts > 0); };
  if (!active(dayKey(t))) t -= DAY;
  while (active(dayKey(t))) { n++; t -= DAY; }
  return n;
}

function addWordSheet(deckId, word) {
  const decks = S.decks;
  const w = word || {};
  openSheet(`<h2>${word ? 'Kelimeyi düzenle' : 'Kelime ekle'}</h2>
    <form class="stack" id="wf">
      <label>Fransızca<input type="text" name="fr" required value="${esc(w.fr || '')}" placeholder="la maison" autocapitalize="off"></label>
      ${accentBar()}
      <label>Türkçe<input type="text" name="tr" required value="${esc(w.tr || '')}" placeholder="ev"></label>
      <label>Tür<select name="type"><option value="">—</option>${Object.entries(TYPE_LABEL).filter(([k]) => k).map(([k, l]) => `<option value="${k}" ${w.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Örnek cümle<input type="text" name="ex" value="${esc(w.ex || '')}"></label>
      <label>Örneğin Türkçesi<input type="text" name="exTr" value="${esc(w.exTr || '')}"></label>
      <label>Deste<select name="deck">${decks.map(d => `<option value="${d.id}" ${(w.deckId ?? deckId) === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}<option value="new">+ Yeni deste: Kendi kelimelerim</option></select></label>
      <button class="btn primary">${word ? 'Kaydet' : 'Ekle'}</button>
    </form>`, body => {
    body.querySelector('#wf').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const data = { fr: f.get('fr').trim(), tr: f.get('tr').trim(), type: f.get('type'), ex: f.get('ex').trim(), exTr: f.get('exTr').trim() };
      if (word) {
        Object.assign(word, data, { key: keyOf(data.fr) });
        const nd = f.get('deck');
        if (nd !== 'new' && +nd !== word.deckId) { word.deckId = +nd; S.cards.filter(c => c.wordId === word.id).forEach(c => c.deckId = +nd); }
        await putWord(word);
        for (const c of S.cards.filter(c => c.wordId === word.id)) await (await import('./store.js')).putCard(c);
        toast('Kaydedildi');
      } else {
        const nw = { ...data, ipa: '', deckId: f.get('deck') === 'new' ? null : +f.get('deck') };
        const dname = f.get('deck') === 'new' ? 'Kendi kelimelerim' : deckById(+f.get('deck')).name;
        await addWordToDeck(nw, dname);
        toast(`"${data.fr}" eklendi`);
      }
      invalidate(); closeSheet(); route();
    };
  });
}

// ---------- Deste ----------
function deckView(id) {
  const d = deckById(id);
  if (!d) return home();
  setTop(d.name, '#/');
  const words = [...S.words.values()].filter(w => w.deckId === id);
  const q = sessionStorage.getItem('dq') || '';
  const render = (q) => {
    const nq = norm(q);
    const list = words.filter(w => !nq || norm(w.fr).includes(nq) || norm(w.tr).includes(nq)).slice(0, 300);
    view.querySelector('#wl').innerHTML = list.map(w => {
      const c = S.cards.find(x => x.wordId === w.id && x.dir === 'fr2tr');
      const st = !c ? '' : c.state === 'new' ? 'yeni' : c.state === 'review' ? (isMature(c) ? 'oturdu' : 'genç') : 'öğreniliyor';
      return `<div class="item word" data-w="${w.id}"><div><div class="fr ${genderClass(w.type)}">${esc(w.fr)}</div><div class="muted small">${esc(w.tr)}</div></div><span class="pill small">${st}</span></div>`;
    }).join('') + (words.length > 300 && !nq ? `<p class="muted small">İlk 300 kelime gösteriliyor; aramayı kullan.</p>` : '');
  };
  view.innerHTML = `
    <div class="row-between"><p class="muted">${words.length} kelime</p>
      <label class="switch"><input type="checkbox" id="act" ${d.active ? 'checked' : ''}> <span>Çalışmaya açık</span></label></div>
    <div class="btn-row"><a class="btn primary" href="#/study/${id}">Çalış</a><button class="btn" id="add">➕ Kelime ekle</button><button class="btn danger" id="del">Desteyi sil</button></div>
    <input type="search" id="q" placeholder="Ara (Fransızca ya da Türkçe)…" value="${esc(q)}">
    <div class="list" id="wl"></div>`;
  render(q);
  view.querySelector('#q').oninput = e => { sessionStorage.setItem('dq', e.target.value); render(e.target.value); };
  view.querySelector('#act').onchange = async e => { d.active = e.target.checked; await putDeck(d); };
  view.querySelector('#add').onclick = () => addWordSheet(id);
  view.querySelector('#del').onclick = async () => { if (confirm(`"${d.name}" destesi ve içindeki ${words.length} kelime silinsin mi? Bu geri alınamaz.`)) { await deleteDeck(d); invalidate(); location.hash = '#/'; } };
  view.querySelector('#wl').onclick = e => {
    const it = e.target.closest('[data-w]'); if (!it) return;
    const w = S.words.get(+it.dataset.w);
    openSheet(`<div class="ws-head"><div><div class="big fr ${genderClass(w.type)}">${esc(w.fr)}</div><div class="type">${esc(TYPE_LABEL[w.type] || '')}</div></div><button class="icon-btn" id="say">🔊</button></div>
      <div class="meaning">${esc(w.tr)}</div>${w.ex ? `<div class="example"><div><div class="fr">${esc(w.ex)}</div><div class="muted">${esc(w.exTr || '')}</div></div></div>` : ''}
      <div class="sheet-actions"><button class="btn" id="ed">✏️ Düzenle</button><button class="btn" id="info">📖 Çekim/biçimler</button><button class="btn danger" id="rm">🗑 Sil</button></div>`, b => {
      b.querySelector('#say').onclick = () => speak(w.fr.split(',')[0]);
      b.querySelector('#ed').onclick = () => addWordSheet(id, w);
      b.querySelector('#info').onclick = async () => { const { showWordSheet } = await import('./sheet.js'); showWordSheet({ word: w, lemma: w.key }, w.fr); };
      b.querySelector('#rm').onclick = async () => { if (confirm(`"${w.fr}" silinsin mi?`)) { await deleteWord(w); invalidate(); closeSheet(); deckView(id); } };
    });
  };
}

// ---------- İçe aktarma ----------
function importView() {
  setTop('Dosyadan ekle', '#/');
  view.innerHTML = `
    <p>Claude'dan aldığın <b>.txt</b> dosyasını seç ya da içeriğini aşağıya yapıştır. Uygulama dosyanın <b>kelime listesi</b> mi <b>metin paketi</b> mi olduğunu kendisi anlar.</p>
    <label class="file-btn btn primary">📂 Dosya seç<input type="file" id="file" accept=".txt,text/plain" hidden></label>
    <p class="muted small">iPad'de: "Dosya seç" → Dosyalar uygulaması. Claude'dan indirdiğin dosya genelde "İndirilenler" klasöründedir.</p>
    <textarea id="txt" rows="8" class="mono" placeholder="…ya da dosya içeriğini buraya yapıştır"></textarea>
    <div class="btn-row"><button class="btn" id="pv">Önizle</button><a class="btn" href="#/help">Dosya biçimi nasıl?</a></div>
    <div id="prev"></div>`;
  const txt = view.querySelector('#txt');
  view.querySelector('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; txt.value = await f.text(); preview(); };
  view.querySelector('#pv').onclick = preview;
  function preview() {
    const s = txt.value;
    const box = view.querySelector('#prev');
    if (!s.trim()) { box.innerHTML = '<p class="warn">Dosya boş.</p>'; return; }
    const type = detectType(s);
    const errs = e => e.length ? `<details class="errs" open><summary>⚠️ ${e.length} satır okunamadı (bunlar atlanacak)</summary>${e.slice(0, 50).map(x => `<div class="small">Satır ${x.line}: ${esc(x.msg)}${x.text ? ` — <code>${esc(x.text.slice(0, 80))}</code>` : ''}</div>`).join('')}</details>` : '';
    if (type === 'texts') {
      const r = parseTexts(s);
      const titles = new Set(S.texts.map(t => norm(t.title)));
      const nw = r.texts.filter(t => !titles.has(norm(t.title)));
      box.innerHTML = `<div class="panel"><h3>📚 Metin paketi</h3>
        <p><b>${nw.length}</b> yeni metin eklenecek${r.texts.length - nw.length ? `, ${r.texts.length - nw.length} tanesi zaten var (atlanacak)` : ''}.</p>
        <ul class="small">${r.texts.map(t => `<li>${titles.has(norm(t.title)) ? '<s>' : ''}${esc(t.title)} — ${esc(t.level)} · ${t.gapCount} boşluk · ${t.mcq.length} ÇS · ${t.open.length} AU${titles.has(norm(t.title)) ? '</s>' : ''}</li>`).join('')}</ul>
        ${errs(r.errors)}
        <button class="btn primary" id="go" ${nw.length ? '' : 'disabled'}>İçe aktar</button></div>`;
      box.querySelector('#go').onclick = async () => { const res = await importTexts(r.texts); invalidate(); toast(`${res.added} metin eklendi`); location.hash = '#/texts'; };
    } else {
      const r = parseWords(s);
      const summary = r.decks.map(d => {
        const ex = deckByName(d.name);
        const keys = ex ? new Set([...S.words.values()].filter(w => w.deckId === ex.id).map(w => w.key)) : new Set();
        const nw = d.words.filter(w => !keys.has(keyOf(w.fr))).length;
        return { d, nw, dup: d.words.length - nw, exists: !!ex };
      });
      box.innerHTML = `<div class="panel"><h3>🃏 Kelime listesi</h3>
        ${summary.map(x => `<p><b>${esc(x.d.name)}</b>${x.exists ? ' (mevcut deste)' : ' (yeni deste)'}: <b>${x.nw}</b> yeni kelime${x.dup ? `, ${x.dup} tanesi zaten var` : ''}</p>`).join('') || '<p>Okunabilir kelime bulunamadı.</p>'}
        ${errs(r.errors)}
        <button class="btn primary" id="go" ${summary.some(x => x.nw) ? '' : 'disabled'}>İçe aktar</button></div>`;
      box.querySelector('#go').onclick = async () => { const res = await importDecks(r.decks); invalidate(); toast(`${res.added} kelime eklendi`); location.hash = '#/'; };
    }
  }
}
const deckByName = n => S.decks.find(d => norm(d.name) === norm(n));

// ---------- İstatistik ----------
function statsView() {
  setTop('İstatistik');
  const d = today();
  const cs = S.cards;
  const by = st => cs.filter(c => c.state === st).length;
  const mature = cs.filter(isMature).length;
  const young = by('review') - mature;
  const days = [];
  for (let i = 83; i >= 0; i--) { const k = dayKey(Date.now() - i * DAY); const x = S.days.get(k); days.push({ k, n: x ? x.reviews : 0, t: x ? (x.texts || 0) : 0 }); }
  const lvl = n => n === 0 ? 0 : n < 15 ? 1 : n < 40 ? 2 : n < 90 ? 3 : 4;
  const done = S.texts.filter(t => t.done && t.results);
  const avg = (k, tot) => { const xs = done.filter(t => t.results[tot]).map(t => t.results[k] / t.results[tot]); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) + '%' : '—'; };
  const week = days.slice(-7).reduce((a, x) => a + x.n, 0);
  const retention = (() => { let ok = 0, all = 0; for (const x of [...S.days.values()]) { all += x.reviews; ok += x.reviews - x.again; } return all ? Math.round(ok / all * 100) + '%' : '—'; })();
  const hard = [...S.words.values()].filter(w => w.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 12);
  view.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><b>${streak()}</b><span>gün seri 🔥</span></div>
      <div class="stat"><b>${d.reviews}</b><span>bugün çalışılan kart</span></div>
      <div class="stat"><b>${week}</b><span>son 7 gün</span></div>
      <div class="stat"><b>${retention}</b><span>hatırlama oranı</span></div>
    </div>
    <h2>Son 12 hafta</h2>
    <div class="heat" aria-label="Günlük çalışma yoğunluğu">${days.map(x => `<i class="h${lvl(x.n)}${x.t ? ' tx' : ''}" title="${x.k}: ${x.n} kart${x.t ? `, ${x.t} metin` : ''}"></i>`).join('')}</div>
    <div class="legend small muted">Az <i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i> Çok · noktalı kare: metin çözülen gün</div>
    <h2>Kartlar</h2>
    <table class="kv"><tr><td>Yeni (hiç görülmemiş)</td><td>${by('new')}</td></tr><tr><td>Öğreniliyor</td><td>${by('learning') + by('relearning')}</td></tr><tr><td>Genç (21 günden kısa aralık)</td><td>${young}</td></tr><tr><td>Oturmuş (21+ gün)</td><td>${mature}</td></tr></table>
    <h2>Dinle ve Anla</h2>
    <table class="kv"><tr><td>Çözülen metin</td><td>${done.length} / ${S.texts.length}</td></tr><tr><td>Çoktan seçmeli ortalaması</td><td>${avg('mcq', 'mcqTotal')}</td></tr><tr><td>Açık uçlu ortalaması</td><td>${avg('open', 'openTotal')}</td></tr><tr><td>Boşluk doldurma ortalaması</td><td>${avg('gaps', 'gapTotal')}</td></tr></table>
    ${hard.length ? `<h2>En çok zorlandığın kelimeler</h2><div class="chips">${hard.map(w => `<span class="chip">${esc(w.fr)} <small>×${w.wrong}</small></span>`).join('')}</div>` : ''}`;
}

// ---------- Ayarlar ----------
function settingsView() {
  setTop('Ayarlar');
  const s = S.settings;
  view.innerHTML = `
    <form class="stack settings" id="sf">
      <h2>Kartlar</h2>
      <label>Günlük yeni kart (deste başına)<input type="number" name="newPerDay" min="0" max="200" value="${s.newPerDay}"></label>
      <label>Günlük en fazla tekrar<input type="number" name="maxReviews" min="0" max="2000" value="${s.maxReviews}"></label>
      <label class="switch"><input type="checkbox" name="reverse" ${s.reverse ? 'checked' : ''}> <span>Ters kartlar (Türkçe → Fransızca)</span></label>
      <label class="switch"><input type="checkbox" name="typeAnswer" ${s.typeAnswer ? 'checked' : ''}> <span>Cevabı yazarak ver</span></label>
      <label class="switch"><input type="checkbox" name="autoplay" ${s.autoplay ? 'checked' : ''}> <span>Fransızca kelimeyi otomatik seslendir</span></label>
      <h2>Ses</h2>
      <label>Ses<select name="voice" id="voiceSel"></select></label>
      <p class="muted small" id="voiceInfo"></p>
      <label>Okuma hızı: <b id="rv">${String(s.rate).replace('.', ',')}x</b><input type="range" name="rate" min="0.5" max="1.3" step="0.05" value="${s.rate}"></label>
      <button type="button" class="btn" id="test">🔊 Sesi dene</button>
      <h2>Dinle ve Anla</h2>
      <label>Soru öncesi dinleme hakkı<select name="listenLimit">${[[1, '1 kez'], [2, '2 kez'], [3, '3 kez'], [0, 'Sınırsız']].map(([v, l]) => `<option value="${v}" ${+s.listenLimit === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="switch"><input type="checkbox" name="highlight" ${s.highlight ? 'checked' : ''}> <span>Boşluk doldururken okunan cümleyi vurgula (varsayılan)</span></label>
    </form>
    <h2>Yedekleme</h2>
    <p class="muted small">İlerlemen sadece bu cihazda saklanır. Arada bir yedek al; iPad ile telefon arasında taşımak için de bu dosyayı kullan.</p>
    <div class="btn-row"><button class="btn" id="exp">💾 Yedek dosyası indir</button><label class="btn">📂 Yedekten geri yükle<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    <p class="muted small" id="lastb">${S.meta.lastBackup ? 'Son yedek: ' + new Date(S.meta.lastBackup).toLocaleDateString('tr-TR') : 'Henüz yedek alınmadı.'}</p>
    <h2>Diğer</h2>
    <div class="btn-row"><a class="btn" href="#/help">❓ Yardım ve dosya biçimleri</a><button class="btn danger" id="reset">Her şeyi sıfırla</button></div>
    <p class="muted small">Mémo · sürüm 1.0 · ${S.words.size} kelime · ${S.texts.length} metin</p>`;
  const fillVoices = (vs) => {
    const sel = view.querySelector('#voiceSel'); if (!sel) return;
    sel.innerHTML = `<option value="">Otomatik (en iyi Fransızca ses)</option>` + vs.map(v => `<option value="${esc(v.voiceURI)}" ${s.voice === v.voiceURI ? 'selected' : ''}>${quality(v) >= 10 ? '★ ' : ''}${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    const hq = vs.filter(v => quality(v) >= 10).length;
    view.querySelector('#voiceInfo').innerHTML = !vs.length
      ? '<span class="warn">Fransızca ses bulunamadı.</span> Cihaz ayarlarından Fransızca ses indir (Yardım bölümüne bak), sonra uygulamayı tamamen kapatıp yeniden aç.'
      : `${vs.length} Fransızca ses bulundu${hq ? `, ${hq} tanesi yüksek kaliteli (★)` : ''}. Otomatik seçenek ★ sesi tercih eder.${hq ? '' : ' Yüksek kaliteli ses görünmüyorsa Yardım bölümüne bak.'}`;
  };
  fillVoices(sortedFrVoices());
  window.__leave = onVoices(fillVoices);
  const f = view.querySelector('#sf');
  f.oninput = f.onchange = async () => {
    const d = new FormData(f);
    s.newPerDay = +d.get('newPerDay') || 0; s.maxReviews = +d.get('maxReviews') || 0;
    s.reverse = !!d.get('reverse'); s.typeAnswer = !!d.get('typeAnswer'); s.autoplay = !!d.get('autoplay');
    s.voice = d.get('voice'); s.rate = +d.get('rate'); s.listenLimit = +d.get('listenLimit'); s.highlight = !!d.get('highlight');
    view.querySelector('#rv').textContent = String(s.rate).replace('.', ',') + 'x';
    await saveSettings();
  };
  view.querySelector('#test').onclick = () => speak('Bonjour ! Je m’appelle Mémo. On apprend le français ensemble ?');
  view.querySelector('#exp').onclick = async () => { download(`memo-yedek-${dayKey()}.json`, await exportAll(), 'application/json'); await setMeta('lastBackup', Date.now()); view.querySelector('#lastb').textContent = 'Son yedek: bugün'; };
  view.querySelector('#imp').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('Yedek geri yüklenirse bu cihazdaki mevcut veriler silinip yedektekiyle değiştirilecek. Devam edilsin mi?')) return;
    try { await importAll(await file.text()); invalidate(); toast('Yedek geri yüklendi'); location.hash = '#/'; } catch (err) { alert('Geri yüklenemedi: ' + err.message); }
  };
  view.querySelector('#reset').onclick = async () => {
    if (!confirm('Bütün kartlar, ilerleme ve eklediğin dosyalar silinecek, uygulama ilk kurulum haline dönecek. Emin misin?')) return;
    await resetAll(); await loadBuiltin(); invalidate(); toast('Sıfırlandı'); location.hash = '#/';
  };
}

// ---------- Yardım ----------
function helpView() {
  setTop('Yardım', '#/settings');
  view.innerHTML = `
    <div class="prose">
    <h2>Kartlar nasıl çalışır?</h2>
    <p>Her kelimenin iki kartı vardır: Fransızca → Türkçe ve Türkçe → Fransızca (ters kart, ertesi gün gelir). Cevabı gördükten sonra ne kadar iyi hatırladığını seç:</p>
    <ul><li><b>Tekrar</b>: hatırlamadım (birkaç dakika sonra tekrar gelir)</li><li><b>Zor</b>: zorlukla hatırladım</li><li><b>İyi</b>: hatırladım</li><li><b>Kolay</b>: çok kolaydı</li></ul>
    <p>Uygulama (FSRS algoritması) her kartı tam unutmak üzereyken tekrar sorar. Renkler: <span class="g-m"><b>mavi = eril</b></span>, <span class="g-f"><b>kırmızı = dişil</b></span>.</p>
    <h2>Dinle ve Anla</h2>
    <ol><li>Metni dinle (ekranda görünmez).</li><li>5 çoktan seçmeli ve 5 açık uçlu soruyu dinlediğine göre cevapla.</li><li>Sonuçlarına bak; açık uçlularda son kararı sen ver.</li><li>Metni tekrar dinlerken boşlukları doldur.</li><li>Hatalarını gör; yanlış kelimeler kart destene eklenir.</li><li>Metni oku, istediğin kelimeye dokun.</li></ol>
    <h2>Yeni içerik nasıl eklenir?</h2>
    <p><b>Dinle</b> sekmesindeki <b>📋 Yeni paket isteği oluştur</b> butonuna bas, mesajı kopyala ve Claude'a yapıştır. Claude'un hazırladığı .txt dosyasını <b>📥 Dosyadan ekle</b> ile yükle. Mesaj; bitirdiğin metinleri, zorlandığın kelimeleri ve başarı oranlarını içerir, böylece yeni paket sana göre hazırlanır.</p>
    <h3>Kelime dosyası biçimi</h3><pre>${esc(WORD_FORMAT)}</pre>
    <h3>Metin paketi biçimi</h3><pre>${esc(TEXT_FORMAT)}</pre>
    <h2>Daha doğal ses</h2>
    <p><b>iPad:</b> Ayarlar → Erişilebilirlik → Sesli İçerik → Sesler → Fransızca (Fransa) → "Thomas" ya da "Amélie" → <b>Gelişmiş</b> sürümünü indir. İndirme bitince Mémo'yu uygulama değiştiriciden yukarı kaydırarak <b>tamamen kapat</b> ve yeniden aç; ardından Mémo → Ayarlar → Ses listesinde ★ işaretli sesi seç. Not: Apple "Siri" seslerini web uygulamalarına açmaz; listede görünmezler.</p>
    <p><b>Android:</b> Ayarlar → Erişilebilirlik (veya Sistem → Diller) → Metin okuma çıkışı → Google konuşma hizmetleri → Ses verilerini yükle → Fransızca (Fransa).</p>
    <h2>Verilerim nerede?</h2>
    <p>Her şey bu cihazın içinde saklanır; internet gerekmez. iPad ve telefonun verileri ayrıdır; birinden diğerine taşımak için Ayarlar → Yedek dosyası indir / Yedekten geri yükle.</p>
    </div>`;
}

// ---------- Başlat ----------
async function start() {
  try {
    await load();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    await loadBuiltin();
  } catch (e) {
    view.innerHTML = `<div class="warn">Uygulama başlatılamadı: ${esc(e.message)}</div>`; console.error(e); return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
start();
