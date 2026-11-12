import { $, esc } from './util.js';

export const genderClass = t => (t === 'm' || t === 'mp') ? 'g-m' : (t === 'f' || t === 'fp') ? 'g-f' : t === 'mf' ? 'g-mf' : '';

// ---- Aksan tuşları ----
const ACC = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'œ', "'"];
export function accentBar() {
  return `<div class="accents" role="toolbar" aria-label="Aksanlı harfler">${ACC.map(c => `<button type="button" class="acc" data-c="${esc(c)}">${esc(c)}</button>`).join('')}<button type="button" class="acc shift" data-shift="1" title="Büyük harf">⇧</button></div>`;
}
let lastInput = null, upper = false;
document.addEventListener('focusin', e => { if (e.target.matches('input[type=text], textarea')) lastInput = e.target; });
function insertAcc(btn) {
  if (btn.dataset.shift) {
    upper = !upper;
    document.querySelectorAll('.acc[data-c]').forEach(b => { b.textContent = upper ? b.dataset.c.toLocaleUpperCase('fr') : b.dataset.c; });
    document.querySelectorAll('.acc.shift').forEach(b => b.classList.toggle('on', upper));
    return;
  }
  const el = lastInput && document.body.contains(lastInput) ? lastInput : null;
  if (!el) return;
  const ch = upper ? btn.dataset.c.toLocaleUpperCase('fr') : btn.dataset.c;
  const s = el.selectionStart ?? el.value.length, e2 = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + ch + el.value.slice(e2);
  el.focus();
  try { el.setSelectionRange(s + ch.length, s + ch.length); } catch { }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
let handled = 0;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.acc'); if (!b) return;
  e.preventDefault(); handled = Date.now(); insertAcc(b);
});
document.addEventListener('click', e => {
  const b = e.target.closest('.acc'); if (!b) return;
  e.preventDefault(); if (Date.now() - handled < 600) return; insertAcc(b);
});

// ---- Alt panel (bottom sheet) ----
export function openSheet(html, onMount) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet-card" role="dialog" aria-modal="true"><button class="sheet-x" data-close aria-label="Kapat">✕</button><div class="sheet-body">${html}</div></div>`;
  sh.classList.add('open');
  document.body.classList.add('noscroll');
  sh.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
  onMount && onMount(sh.querySelector('.sheet-body'));
}
export function closeSheet() {
  const sh = $('#sheet'); sh.classList.remove('open'); sh.innerHTML = '';
  document.body.classList.remove('noscroll');
}
export function setTop(title, back) {
  $('#top').innerHTML = `${back ? `<a class="back" href="${back}" aria-label="Geri">‹</a>` : '<span class="logo">Mémo</span>'}<h1>${esc(title)}</h1>`;
}
