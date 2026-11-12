// Tarayıcının metin okuma özelliği (fr-FR) ve cümle cümle oynatıcı
import { S } from './store.js';

const synth = window.speechSynthesis;
let voices = [];
let current = null; // GC'ye karşı referans

function loadVoices() {
  if (!synth) return [];
  voices = synth.getVoices().filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('fr'));
  return voices;
}
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

export const ttsAvailable = () => !!synth;
export function frVoices() { return loadVoices(); }

function pickVoice() {
  loadVoices();
  const uri = S.settings.voice;
  return voices.find(v => v.voiceURI === uri)
    || voices.find(v => /fr-fr/i.test(v.lang.replace('_', '-')) && /(enhanced|premium|amélioré|google|natural|neural)/i.test(v.name))
    || voices.find(v => /fr-fr/i.test(v.lang.replace('_', '-')))
    || voices[0] || null;
}

export function stop() { if (synth) synth.cancel(); current = null; }

export function speak(text, { rate, onend } = {}) {
  if (!synth) { onend && onend(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  const v = pickVoice(); if (v) u.voice = v;
  u.rate = rate ?? S.settings.rate;
  let finished = false;
  const fin = () => { if (finished) return; finished = true; onend && onend(); };
  u.onend = fin; u.onerror = fin;
  current = u;
  synth.speak(u);
  return { utterance: u, isDone: () => finished, finish: fin };
}

// Cümle listesini sırayla okur. iOS/Android'deki "onend gelmedi" sorunlarına karşı bekçi zamanlayıcısı vardır.
export class Player {
  constructor(sents, opt = {}) {
    this.s = sents; this.i = 0; this.playing = false; this.run = 0; this.opt = opt; this.rate = S.settings.rate;
  }
  _emit() { this.opt.onState && this.opt.onState(this.playing, this.i); }
  play(from) {
    if (from != null) this.i = from;
    if (this.i >= this.s.length) this.i = 0;
    this.playing = true; this._emit(); this._say();
  }
  _say() {
    const id = ++this.run;
    clearTimeout(this._t); clearInterval(this._w);
    if (this.i >= this.s.length) {
      this.playing = false; this.i = 0; this._emit();
      this.opt.onSentence && this.opt.onSentence(-1);
      this.opt.onDone && this.opt.onDone();
      return;
    }
    this.opt.onSentence && this.opt.onSentence(this.i);
    const started = Date.now();
    const next = () => {
      if (id !== this.run || !this.playing) return;
      clearInterval(this._w);
      const gap = this.s[this.i].paraEnd ? 800 : 300;
      this.i++;
      this._t = setTimeout(() => { if (id === this.run && this.playing) this._say(); }, gap);
    };
    const h = speak(this.s[this.i].text, { rate: this.rate, onend: next });
    this._w = setInterval(() => {
      if (id !== this.run) { clearInterval(this._w); return; }
      if (synth && !synth.speaking && !synth.pending && Date.now() - started > 1500) h && h.finish();
    }, 700);
  }
  pause() { this.playing = false; this.run++; clearTimeout(this._t); clearInterval(this._w); stop(); this._emit(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  prev() { const was = this.playing; this.pause(); this.i = Math.max(0, this.i - 1); if (was) this.play(); else this.opt.onSentence && this.opt.onSentence(this.i); }
  repeat() { this.pause(); this.play(this.i); }
  next() { const was = this.playing; this.pause(); this.i = Math.min(this.s.length - 1, this.i + 1); if (was) this.play(); else this.opt.onSentence && this.opt.onSentence(this.i); }
  destroy() { this.pause(); this.opt = {}; }
}
