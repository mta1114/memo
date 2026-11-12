// Fransızca fiil çekim motoru: düzenli fiiller kurallarla, düzensizler model tablosuyla
export const TENSES = [
  ['pres', 'Présent'], ['pc', 'Passé composé'], ['imp', 'Imparfait'],
  ['fut', 'Futur simple'], ['cond', 'Conditionnel'], ['subj', 'Subjonctif']
];
const PRON = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
const VOW = /^[aeiouyéèêëàâîïôûœh]/i;

// Model fiiller: pres = 6 kişi, fut = gelecek kökü, pp = ortaç, aux, ending = ailesini tanıtan son ek
// subj: [je/tu/il/ils kökü, nous/vous kökü] veya 6 tam çekim
const M = [
  { inf: 'être', exact: 1, pres: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'], imp: 'ét', fut: 'ser', pp: 'été', subj: ['sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'] },
  { inf: 'avoir', exact: 1, pres: ['ai', 'as', 'a', 'avons', 'avez', 'ont'], fut: 'aur', pp: 'eu', subj: ['aie', 'aies', 'ait', 'ayons', 'ayez', 'aient'] },
  { inf: 'aller', exact: 1, pres: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'], fut: 'ir', pp: 'allé', aux: 'être', subj: ['aill', 'all'] },
  { inf: 'faire', ending: 'faire', pres: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'], fut: 'fer', pp: 'fait', subj: ['fass', 'fass'] },
  { inf: 'dire', ending: 'dire', pres: ['dis', 'dis', 'dit', 'disons', 'dites', 'disent'], fut: 'dir', pp: 'dit' },
  { inf: 'lire', ending: 'lire', pres: ['lis', 'lis', 'lit', 'lisons', 'lisez', 'lisent'], fut: 'lir', pp: 'lu' },
  { inf: 'écrire', ending: 'crire', pres: ['écris', 'écris', 'écrit', 'écrivons', 'écrivez', 'écrivent'], fut: 'écrir', pp: 'écrit' },
  { inf: 'pouvoir', exact: 1, pres: ['peux', 'peux', 'peut', 'pouvons', 'pouvez', 'peuvent'], fut: 'pourr', pp: 'pu', subj: ['puiss', 'puiss'] },
  { inf: 'vouloir', exact: 1, pres: ['veux', 'veux', 'veut', 'voulons', 'voulez', 'veulent'], fut: 'voudr', pp: 'voulu', subj: ['veuill', 'voul'] },
  { inf: 'savoir', exact: 1, pres: ['sais', 'sais', 'sait', 'savons', 'savez', 'savent'], fut: 'saur', pp: 'su', subj: ['sach', 'sach'] },
  { inf: 'valoir', exact: 1, pres: ['vaux', 'vaux', 'vaut', 'valons', 'valez', 'valent'], fut: 'vaudr', pp: 'valu', subj: ['vaill', 'val'] },
  { inf: 'devoir', exact: 1, pres: ['dois', 'dois', 'doit', 'devons', 'devez', 'doivent'], fut: 'devr', pp: 'dû' },
  { inf: 'recevoir', ending: 'cevoir', pres: ['reçois', 'reçois', 'reçoit', 'recevons', 'recevez', 'reçoivent'], fut: 'recevr', pp: 'reçu' },
  { inf: 'voir', ending: 'voir', pres: ['vois', 'vois', 'voit', 'voyons', 'voyez', 'voient'], fut: 'verr', pp: 'vu' },
  { inf: 'venir', ending: 'venir', pres: ['viens', 'viens', 'vient', 'venons', 'venez', 'viennent'], fut: 'viendr', pp: 'venu', aux: 'être' },
  { inf: 'tenir', ending: 'tenir', pres: ['tiens', 'tiens', 'tient', 'tenons', 'tenez', 'tiennent'], fut: 'tiendr', pp: 'tenu' },
  { inf: 'prendre', ending: 'prendre', pres: ['prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent'], fut: 'prendr', pp: 'pris' },
  { inf: 'mettre', ending: 'mettre', pres: ['mets', 'mets', 'met', 'mettons', 'mettez', 'mettent'], fut: 'mettr', pp: 'mis' },
  { inf: 'battre', ending: 'battre', pres: ['bats', 'bats', 'bat', 'battons', 'battez', 'battent'], fut: 'battr', pp: 'battu' },
  { inf: 'partir', ending: 'partir', pres: ['pars', 'pars', 'part', 'partons', 'partez', 'partent'], fut: 'partir', pp: 'parti', aux: 'être' },
  { inf: 'sortir', ending: 'sortir', pres: ['sors', 'sors', 'sort', 'sortons', 'sortez', 'sortent'], fut: 'sortir', pp: 'sorti', aux: 'être' },
  { inf: 'dormir', ending: 'dormir', pres: ['dors', 'dors', 'dort', 'dormons', 'dormez', 'dorment'], fut: 'dormir', pp: 'dormi' },
  { inf: 'sentir', ending: 'sentir', pres: ['sens', 'sens', 'sent', 'sentons', 'sentez', 'sentent'], fut: 'sentir', pp: 'senti' },
  { inf: 'servir', ending: 'servir', pres: ['sers', 'sers', 'sert', 'servons', 'servez', 'servent'], fut: 'servir', pp: 'servi' },
  { inf: 'mentir', ending: 'mentir', pres: ['mens', 'mens', 'ment', 'mentons', 'mentez', 'mentent'], fut: 'mentir', pp: 'menti' },
  { inf: 'ouvrir', ending: 'vrir', pres: ['ouvre', 'ouvres', 'ouvre', 'ouvrons', 'ouvrez', 'ouvrent'], fut: 'ouvrir', pp: 'ouvert' },
  { inf: 'offrir', ending: 'frir', pres: ['offre', 'offres', 'offre', 'offrons', 'offrez', 'offrent'], fut: 'offrir', pp: 'offert' },
  { inf: 'cueillir', ending: 'cueillir', pres: ['cueille', 'cueilles', 'cueille', 'cueillons', 'cueillez', 'cueillent'], fut: 'cueiller', pp: 'cueilli' },
  { inf: 'courir', ending: 'courir', pres: ['cours', 'cours', 'court', 'courons', 'courez', 'courent'], fut: 'courr', pp: 'couru' },
  { inf: 'mourir', exact: 1, pres: ['meurs', 'meurs', 'meurt', 'mourons', 'mourez', 'meurent'], fut: 'mourr', pp: 'mort', aux: 'être' },
  { inf: 'acquérir', ending: 'quérir', pres: ['acquiers', 'acquiers', 'acquiert', 'acquérons', 'acquérez', 'acquièrent'], fut: 'acquerr', pp: 'acquis' },
  { inf: 'fuir', ending: 'fuir', pres: ['fuis', 'fuis', 'fuit', 'fuyons', 'fuyez', 'fuient'], fut: 'fuir', pp: 'fui' },
  { inf: 'connaître', ending: 'aître', pres: ['connais', 'connais', 'connaît', 'connaissons', 'connaissez', 'connaissent'], fut: 'connaîtr', pp: 'connu' },
  { inf: 'naître', exact: 1, pres: ['nais', 'nais', 'naît', 'naissons', 'naissez', 'naissent'], fut: 'naîtr', pp: 'né', aux: 'être' },
  { inf: 'craindre', ending: 'aindre', pres: ['crains', 'crains', 'craint', 'craignons', 'craignez', 'craignent'], fut: 'craindr', pp: 'craint' },
  { inf: 'peindre', ending: 'eindre', pres: ['peins', 'peins', 'peint', 'peignons', 'peignez', 'peignent'], fut: 'peindr', pp: 'peint' },
  { inf: 'joindre', ending: 'oindre', pres: ['joins', 'joins', 'joint', 'joignons', 'joignez', 'joignent'], fut: 'joindr', pp: 'joint' },
  { inf: 'conduire', ending: 'uire', pres: ['conduis', 'conduis', 'conduit', 'conduisons', 'conduisez', 'conduisent'], fut: 'conduir', pp: 'conduit' },
  { inf: 'croire', ending: 'croire', pres: ['crois', 'crois', 'croit', 'croyons', 'croyez', 'croient'], fut: 'croir', pp: 'cru' },
  { inf: 'boire', ending: 'boire', pres: ['bois', 'bois', 'boit', 'buvons', 'buvez', 'boivent'], fut: 'boir', pp: 'bu' },
  { inf: 'vivre', ending: 'vivre', pres: ['vis', 'vis', 'vit', 'vivons', 'vivez', 'vivent'], fut: 'vivr', pp: 'vécu' },
  { inf: 'suivre', ending: 'suivre', pres: ['suis', 'suis', 'suit', 'suivons', 'suivez', 'suivent'], fut: 'suivr', pp: 'suivi' },
  { inf: 'rire', ending: 'rire', pres: ['ris', 'ris', 'rit', 'rions', 'riez', 'rient'], fut: 'rir', pp: 'ri' },
  { inf: 'plaire', ending: 'plaire', pres: ['plais', 'plais', 'plaît', 'plaisons', 'plaisez', 'plaisent'], fut: 'plair', pp: 'plu' },
  { inf: 'résoudre', ending: 'résoudre', pres: ['résous', 'résous', 'résout', 'résolvons', 'résolvez', 'résolvent'], fut: 'résoudr', pp: 'résolu' },
  { inf: 'dissoudre', ending: 'dissoudre', pres: ['dissous', 'dissous', 'dissout', 'dissolvons', 'dissolvez', 'dissolvent'], fut: 'dissoudr', pp: 'dissous' },
  { inf: 'asseoir', ending: 'asseoir', pres: ['assieds', 'assieds', 'assied', 'asseyons', 'asseyez', 'asseyent'], fut: 'assiér', pp: 'assis' },
  { inf: 'vaincre', ending: 'vaincre', pres: ['vaincs', 'vaincs', 'vainc', 'vainquons', 'vainquez', 'vainquent'], fut: 'vaincr', pp: 'vaincu' },
  { inf: 'rompre', ending: 'rompre', pres: ['romps', 'romps', 'rompt', 'rompons', 'rompez', 'rompent'], fut: 'rompr', pp: 'rompu' },
  { inf: 'envoyer', ending: 'envoyer', pres: ['envoie', 'envoies', 'envoie', 'envoyons', 'envoyez', 'envoient'], fut: 'enverr', pp: 'envoyé' },
];
const IMPERSONAL = {
  falloir: { pres: 'faut', imp: 'fallait', pc: 'a fallu', fut: 'faudra', cond: 'faudrait', subj: 'faille' },
  pleuvoir: { pres: 'pleut', imp: 'pleuvait', pc: 'a plu', fut: 'pleuvra', cond: 'pleuvrait', subj: 'pleuve' },
};
// Birleşik zamanlarda être alan fiiller
const ETRE = new Set(['aller', 'venir', 'devenir', 'revenir', 'parvenir', 'intervenir', 'survenir', 'arriver', 'partir', 'repartir', 'sortir', 'ressortir', 'entrer', 'rentrer', 'monter', 'descendre', 'naître', 'renaître', 'mourir', 'rester', 'tomber', 'retomber', 'retourner', 'décéder', 'apparaître']);
const AVOIR_OVERRIDE = new Set(['convenir', 'prévenir', 'subvenir']);
const ER_E_EXC = new Set(['acheter', 'racheter', 'geler', 'congeler', 'dégeler', 'surgeler', 'modeler', 'peler', 'haleter', 'harceler', 'celer', 'démanteler', 'crocheter', 'ciseler', 'marteler']);

function findModel(inf) {
  const ex = M.find(m => m.inf === inf);
  if (ex) return { m: ex, stem: '', mstem: '' };
  let best = null;
  for (const m of M) {
    if (m.exact || !m.ending) continue;
    if (inf.endsWith(m.ending) && inf.length > m.ending.length - 0 && (!best || m.ending.length > best.ending.length)) best = m;
  }
  if (!best) return null;
  return { m: best, stem: inf.slice(0, inf.length - best.ending.length), mstem: best.inf.slice(0, best.inf.length - best.ending.length) };
}

function fromModel(inf) {
  const f = findModel(inf); if (!f) return null;
  const { m, stem, mstem } = f;
  const tr = s => (s.startsWith(mstem) ? stem + s.slice(mstem.length) : s);
  const pres = m.pres.map(tr);
  const nousStem = pres[3].replace(/ons$/, '');
  const impStem = m.imp ? tr(m.imp) : nousStem;
  let subj;
  if (m.subj && m.subj.length === 6) subj = m.subj.map(tr);
  else {
    const s1 = m.subj ? tr(m.subj[0]) : pres[5].replace(/ent$/, '');
    const s2 = m.subj ? tr(m.subj[1]) : impStem;
    subj = [s1 + 'e', s1 + 'es', s1 + 'e', s2 + 'ions', s2 + 'iez', s1 + 'ent'];
  }
  return { pres, impStem, fut: tr(m.fut), pp: tr(m.pp), subj, aux: m.aux };
}

function regular(inf) {
  if (inf.endsWith('er')) {
    const st = inf.slice(0, -2);
    let strong = st, futStem = inf;
    if (/yer$/.test(inf)) { strong = st.slice(0, -1) + 'i'; futStem = strong + 'er'; }
    else if (/e[lt]er$/.test(inf) && !/[éè]/.test(inf.slice(-4)) && !ER_E_EXC.has(inf)) { strong = st + st.slice(-1); futStem = strong + 'er'; }
    else if (/e[bcdfghjklmnpqrstvwxz]$/.test(st)) { strong = st.replace(/e([bcdfghjklmnpqrstvwxz])$/, 'è$1'); futStem = strong + 'er'; }
    else if (/é[bcdfghjklmnpqrstvwxz]{1,2}$/.test(st)) { strong = st.replace(/é([bcdfghjklmnpqrstvwxz]{1,2})$/, 'è$1'); }
    let soft = st;
    if (st.endsWith('c')) soft = st.slice(0, -1) + 'ç';
    else if (st.endsWith('g')) soft = st + 'e';
    return {
      pres: [strong + 'e', strong + 'es', strong + 'e', soft + 'ons', st + 'ez', strong + 'ent'],
      imp: [soft + 'ais', soft + 'ais', soft + 'ait', st + 'ions', st + 'iez', soft + 'aient'],
      fut: futStem, pp: st + 'é',
      subj: [strong + 'e', strong + 'es', strong + 'e', st + 'ions', st + 'iez', strong + 'ent'],
    };
  }
  if (inf.endsWith('ir')) {
    const st = inf.slice(0, -2);
    return {
      pres: [st + 'is', st + 'is', st + 'it', st + 'issons', st + 'issez', st + 'issent'],
      impStem: st + 'iss', fut: inf, pp: st + 'i',
      subj: ['isse', 'isses', 'isse', 'issions', 'issiez', 'issent'].map(e => st + e),
    };
  }
  if (inf.endsWith('re')) {
    const st = inf.slice(0, -2);
    return {
      pres: [st + 's', st + 's', st, st + 'ons', st + 'ez', st + 'ent'],
      impStem: st, fut: st + 'r', pp: st + 'u',
      subj: ['e', 'es', 'e', 'ions', 'iez', 'ent'].map(e => st + e),
    };
  }
  return null;
}

function baseParts(inf) {
  const p = fromModel(inf) || regular(inf);
  if (!p) return null;
  if (!p.imp) p.imp = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'].map(e => p.impStem + e);
  return p;
}

const AUX_PRES = { avoir: ['ai', 'as', 'a', 'avons', 'avez', 'ont'], être: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'] };
const REFL = ['me', 'te', 'se', 'nous', 'vous', 'se'];

// Ana fonksiyon: { inf, reflexive, aux, pp, tenses: {pres:[...6 satır]...} } veya null
export function conjugate(input) {
  let inf = String(input || '').toLowerCase().trim().replace(/[’]/g, "'");
  let refl = false;
  if (/^se /.test(inf)) { refl = true; inf = inf.slice(3); }
  else if (/^s'/.test(inf)) { refl = true; inf = inf.slice(2); }
  if (!/^[a-zàâäéèêëîïôöùûüçœ-]+$/.test(inf)) return null;
  if (IMPERSONAL[inf]) {
    const x = IMPERSONAL[inf]; const t = {};
    for (const [k] of TENSES) t[k] = [(k === 'subj' ? "qu'il " : 'il ') + x[k]];
    return { inf, impersonal: true, tenses: t, pp: x.pc.split(' ')[1] };
  }
  if (!/(er|ir|re|oir)$/.test(inf)) return null;
  const p = baseParts(inf); if (!p) return null;
  let aux = refl ? 'être' : (p.aux || (ETRE.has(inf) ? 'être' : 'avoir'));
  if (!refl && AVOIR_OVERRIDE.has(inf)) aux = 'avoir';
  const futE = ['ai', 'as', 'a', 'ons', 'ez', 'ont'], condE = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];
  const forms = {
    pres: p.pres, imp: p.imp,
    fut: futE.map(e => p.fut + e), cond: condE.map(e => p.fut + e), subj: p.subj,
  };
  const subjOf = (i, verb) => {
    if (i === 0) return VOW.test(verb) ? "j'" : 'je';
    return PRON[i];
  };
  const withPron = (i, verb, que = false) => {
    let v = verb;
    if (refl) { const r = REFL[i]; v = (/^(me|te|se)$/.test(r) && VOW.test(verb)) ? r[0] + "'" + verb : r + ' ' + verb; }
    let s = subjOf(i, v) + ' ' + v;
    s = s.replace(/^j' /, "j'");
    if (que) s = (/^(il|ils)/.test(s) ? "qu'" : 'que ') + s;
    return s;
  };
  const tenses = {};
  for (const k of ['pres', 'imp', 'fut', 'cond']) tenses[k] = forms[k].map((v, i) => withPron(i, v));
  tenses.subj = forms.subj.map((v, i) => withPron(i, v, true));
  tenses.pc = AUX_PRES[aux].map((a, i) => {
    let pp = p.pp;
    if (aux === 'être') pp += i < 3 ? '(e)' : (p.pp.endsWith('s') ? '(es)' : '(e)s');
    return withPron(i, a + ' ' + pp);
  });
  return { inf: (refl ? (VOW.test(inf) ? "s'" : 'se ') : '') + inf, aux, pp: p.pp, tenses, raw: forms };
}

// Çekimli bir halden mastarı bulmak için tüm çekim halleri
export function allForms(inf) {
  const c = conjugate(inf); if (!c || c.impersonal) {
    if (c && c.impersonal) return Object.values(IMPERSONAL[c.inf]).map(s => s.split(' ').pop());
    return [];
  }
  const out = new Set();
  for (const k of Object.keys(c.raw)) c.raw[k].forEach(v => out.add(v));
  [c.pp, c.pp + 'e', c.pp + 's', c.pp + 'es'].forEach(v => out.add(v));
  if (inf.endsWith('er') || inf.endsWith('ir') || inf.endsWith('re')) {
    // emir kipi ve şimdiki zaman ortacı
    const nous = c.raw.pres[3];
    out.add(nous.replace(/ons$/, 'ant'));
  }
  return [...out];
}

export const MODEL_VERBS = M.map(m => m.inf).concat(Object.keys(IMPERSONAL));
