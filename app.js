'use strict';
/* Woordkoffer – flashcards om de woorden van een taal te leren, met herhaling op het juiste moment.
   Alle gegevens staan in de browser (localStorage) op het apparaat zelf. */

// ---------- Constanten ----------
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
// Talen die je kunt leren. Een taal toevoegen is één regel.
// Een kaart heeft een woord in de gekozen taal (term) en de Nederlandse vertaling (nl);
// je oefent in twee richtingen: toNl (taal → Nederlands) en fromNl (Nederlands → taal).
const LANGS = {
  es: { name: 'Spaans', flag: '🇪🇸', tts: 'es-ES', motto: 'la maleta de palabras', hello: '¡Buen viaje!', bravo: '¡Muy bien!', done: '¡Terminado!' },
  it: { name: 'Italiaans', flag: '🇮🇹', tts: 'it-IT', motto: 'la valigia delle parole', hello: 'Buon viaggio!', bravo: 'Bravissimo!', done: 'Finito!' },
  fr: { name: 'Frans', flag: '🇫🇷', tts: 'fr-FR', motto: 'la valise de mots', hello: 'Bon voyage !', bravo: 'Très bien !', done: 'Terminé !' },
  pt: { name: 'Portugees', flag: '🇵🇹', tts: 'pt-PT', motto: 'a mala de palavras', hello: 'Boa viagem!', bravo: 'Muito bem!', done: 'Terminado!' },
  de: { name: 'Duits', flag: '🇩🇪', tts: 'de-DE', motto: 'der Wortkoffer', hello: 'Gute Reise!', bravo: 'Sehr gut!', done: 'Fertig!' },
  en: { name: 'Engels', flag: '🇬🇧', tts: 'en-GB', motto: 'the word suitcase', hello: 'Have a good trip!', bravo: 'Well done!', done: 'All done!' },
  sv: { name: 'Zweeds', flag: '🇸🇪', tts: 'sv-SE', motto: 'resväskan med ord', hello: 'Trevlig resa!', bravo: 'Bra jobbat!', done: 'Klart!' },
};
// Logo: een koffer met een tekstballonnetje als label (woorden op reis), altijd kobaltblauw.
const LOGO_SVG = `<svg class="logo" viewBox="0 0 100 100" aria-hidden="true">
  <rect width="100" height="100" rx="24" fill="#0047ab"/>
  <rect x="38" y="20" width="24" height="15" rx="6" fill="none" stroke="#fff" stroke-width="5"/>
  <rect x="18" y="31" width="64" height="47" rx="9" fill="#fff"/>
  <rect x="30" y="31" width="6" height="47" fill="#d6dff0"/>
  <rect x="64" y="31" width="6" height="47" fill="#d6dff0"/>
  <rect x="40" y="44" width="21" height="15" rx="4" fill="#0047ab"/>
  <polygon points="43,58 43,65 49,58" fill="#0047ab"/>
  <circle cx="45.5" cy="51.5" r="1.8" fill="#fff"/><circle cx="50.5" cy="51.5" r="1.8" fill="#fff"/><circle cx="55.5" cy="51.5" r="1.8" fill="#fff"/>
</svg>`;
const curLang = () => db.settings.lang in LANGS ? db.settings.lang : 'es';

// ---------- Taal van de app ----------
// De app is Nederlands. Per leertaal kan de hele app ook in die taal (schakelaar in het menu en bij Instellingen).
// De vertalingen staan in vertalingen.js, met de Nederlandse tekst als sleutel.
const UI = window.UI_TEXT || {};
const uiLang = () => db.settings.uiTarget && UI[curLang()] ? curLang() : 'nl';
const LOCALES = { nl: 'nl-NL', es: 'es-ES', it: 'it-IT', fr: 'fr-FR', pt: 'pt-PT', de: 'de-DE', en: 'en-GB', sv: 'sv-SE' };
const loc = () => LOCALES[uiLang()];
function t(key, vars) {
  const s = UI[uiLang()]?.[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : s;
}
const tn = (n, one, many, vars) => t(n === 1 ? one : many, { ...vars, n: Number(n).toLocaleString(loc()) });
// Naam van een taal in de taal van de app.
const langName = code => UI[uiLang()]?._langs?.[code] || (code === 'nl' ? 'Nederlands' : LANGS[code].name);
const nlName = () => langName('nl');
const dirLabel = (dir, deck) => {
  const taal = langName(deck?.lang || 'es');
  return dir === 'toNl' ? `${taal} → ${nlName()}` : `${nlName()} → ${taal}`;
};
// Kant-en-klare lijsten met hun oorspronkelijke naam tonen we in de taal van de app.
const deckName = d => {
  const s = d.starter && (window.STARTER_LISTS || []).find(x => x.key === d.starter);
  return s && s.name === d.name ? t(d.name) : d.name;
};

// Tempo per lijst: hoeveel nieuwe woorden per dag (elk woord komt in beide richtingen).
// De groeifactoren zijn de standaardwaarden van Anki.
const PRESETS = {
  weinig: { label: 'Weinig', newWords: 10, maxReviews: 200 },
  normaal: { label: 'Normaal', newWords: 20, maxReviews: 400 },
  veel: { label: 'Veel', newWords: 40, maxReviews: 800 },
};
const DEFAULT_OPTS = {
  preset: 'normaal', newWords: 20, maxReviews: 400,
  learnSteps: [8, 25],   // na zoveel kaarten komt een nieuw woord terug (Opnieuw, daarna Goed)
  relearnSteps: [10],    // na zoveel kaarten komt een vergeten woord terug
  gradIvl: 1,            // dagen na "Goed" op een nieuwe kaart
  easyPause: 60,         // minstens zoveel dagen pauze na "Makkelijk" op een woord dat je aan het leren bent
  startEase: 2.5,        // vermenigvuldiger bij "Goed"
  easyBonus: 1.3,        // extra vermenigvuldiger bij "Makkelijk"
  hardFactor: 1.2,       // vermenigvuldiger bij "Moeilijk"
  maxIvl: 365,           // langste wachttijd in dagen
};
const optsOf = deck => ({ ...DEFAULT_OPTS, ...(deck?.opts || {}) });

// ---------- Hulpjes ----------
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() + n); return d.getTime(); };
const endOfDay = t => addDays(t, 1) - 1;
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Opslag ----------
const APP_VERSION = '1.1.1';
// Instellingen van de maker. Leeg = staat uit.
const MAKER = 'ernasworld';
const SOURCE_URL = 'https://github.com/ernasworld/woordkoffer';
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSctxD9dJ6HfMhewnEC6IKhJu7M7MbdgveobdPjtM1W_Q_j6zQ/viewform';   // link naar het Google-formulier voor feedback
const GOATCOUNTER = 'woordkoffer';    // code bij GoatCounter: telt anoniem hoe vaak de app wordt geopend
const STORE_KEY = 'woordkoffer';
const DATA_VERSION = 2;
const STARTERS = window.STARTER_LISTS || [];
function starterDeck(s) {
  return { id: uid(), name: s.name, starter: s.key, lang: s.lang || 'es', dir: 'both', created: Date.now(), opts: {},
    cards: s.words.map(([term, nl, note]) => ({ id: uid(), term, nl, note: note || '', p: {} })) };
}
function freshDb() {
  return { version: DATA_VERSION, settings: { autoSpeak: true, rate: 0.9, lang: 'es', theme: 'auto' }, decks: STARTERS.map(starterDeck), log: {}, events: [] };
}
// Controleert opgeslagen gegevens en vult ontbrekende onderdelen aan.
function normalize(d) {
  if (!d || !Array.isArray(d.decks)) return null;
  d.settings = { ...freshDb().settings, ...(d.settings || {}) };
  d.log ||= {};
  d.events ||= [];
  for (const deck of d.decks) { deck.opts ||= {}; deck.lang ||= 'es'; deck.dir ||= 'both'; }
  if ((d.version || 1) < 2) {
    // Gegevens met versie 1 omzetten naar versie 2: tempo per keer oefenen, leerstappen in kaarten.
    for (const deck of d.decks) {
      const o = deck.opts;
      if ('newPerDay' in o) { o.newWords = o.newPerDay; delete o.newPerDay; }
      if ('reviewsPerDay' in o) { o.maxReviews = o.reviewsPerDay; delete o.reviewsPerDay; }
      delete o.learnSteps; delete o.relearnSteps;
      delete deck.log; delete deck.extra;
    }
  }
  d.version = DATA_VERSION;
  return d;
}

// ---------- Automatische kopieën ----------
// De voortgang staat los van de app-bestanden; een nieuwe versie vervangt alleen de bestanden.
// Voor de zekerheid bewaart de app zelf kopieën in de browser:
//  - de stand bij de eerste keer openen op een dag (dagkopie), de laatste 7;
//  - de stand vlak voordat een nieuwe versie de gegevens omzet (voor-update), de laatste 3;
//  - de stand vlak voor het terugzetten van een kopie of back-up, de laatste 3;
//  - gegevens die onleesbaar bleken (onleesbaar), de laatste 3.
const COPY_PREFIX = STORE_KEY + '.kopie.';
function copyKeys() {
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(COPY_PREFIX)) keys.push(k); } } catch (e) { /* geen opslag */ }
  return keys.sort().reverse();   // nieuwste eerst (de sleutel bevat het tijdstip)
}
function storeCopy(kind, raw, keep) {
  try {
    localStorage.setItem(`${COPY_PREFIX}${new Date().toISOString()}.${kind}`, raw);
    copyKeys().filter(k => k.endsWith('.' + kind)).slice(keep).forEach(k => localStorage.removeItem(k));
  } catch (e) { /* opslag vol: oudste kopieën opruimen */
    copyKeys().slice(-3).forEach(k => localStorage.removeItem(k));
  }
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { /* hieronder */ }
  if (parsed && Array.isArray(parsed.decks)) {
    if ((parsed.version || 0) < DATA_VERSION) storeCopy('voor-update', raw, 3);
    const today = dayKey();
    try {
      if (localStorage.getItem(STORE_KEY + '.dagkopie-datum') !== today) {
        storeCopy('dagkopie', raw, 7);
        localStorage.setItem(STORE_KEY + '.dagkopie-datum', today);
      }
    } catch (e) { /* geen opslag */ }
    const d = normalize(parsed); if (d) return d;
  }
  // Onleesbare gegevens nooit overschrijven: eerst apart bewaren.
  storeCopy('onleesbaar', raw, 3);
  setTimeout(() => toast(t('Je opgeslagen gegevens waren onleesbaar. Er is een kopie bewaard (zie Instellingen).')), 500);
  return null;
}
let db = load() || freshDb();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast(t('Opslaan is mislukt. Maak een back-up.')); }
}
save();
// Kleurmodus: 'auto' volgt de telefoon, 'light' of 'dark' kies je zelf in Instellingen.
function applyTheme() {
  const t = db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme();
// Vraag de browser om de gegevens niet zomaar op te ruimen.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const getDeck = id => db.decks.find(d => d.id === id);
// Lijsten van de taal die je leert. Uitgezette lijsten (archived) tellen niet mee, maar houden hun voortgang.
const langDecks = () => db.decks.filter(d => (d.lang || 'es') === curLang() && !d.archived);
const dirsOf = deck => deck.dir === 'both' ? ['toNl', 'fromNl'] : [deck.dir];
const isNewSt = st => !st || st.s === 'new';
// Verborgen woorden doen niet mee met oefenen.
const activeCards = deck => deck.cards.filter(c => !c.hidden);

// ---------- Antwoorden vastleggen (voor de statistieken) ----------
// Eén regel per antwoord: [tijdstip, lijst, woord, richting (0 = taal → NL, 1 = NL → taal), knop, soort, duur in ms]
// knop: 1 Opnieuw · 2 Moeilijk · 3 Goed · 4 Makkelijk · 5 Ken ik al · 6 Weg
// soort: 0 nieuw · 1 aan het leren · 2 herhaling · 3 opnieuw leren · 8 doorkijken · 9 vrij oefenen
const KIND = { new: 0, learn: 1, review: 2, relearn: 3 };
function logEvent(deckId, cardId, dir, grade, kind, ms) {
  db.events.push([Date.now(), deckId, cardId, dir === 'fromNl' ? 1 : 0, grade, kind, Math.max(0, Math.min(ms || 0, 60000))]);
}
const EV = { t: 0, deck: 1, card: 2, dir: 3, grade: 4, kind: 5, ms: 6 };
const isCorrect = e => e[EV.grade] >= 2 && e[EV.grade] <= 5;   // alles behalve Opnieuw (en Weg) telt als goed
const counts = e => e[EV.grade] !== 6;                           // "Weg" telt niet als geoefend

// ---------- Herhaalschema ----------
// Gebaseerd op het klassieke Anki-schema (SM-2). Tijdens het oefenen tellen we in kaarten:
// een woord dat je aan het leren bent, komt terug na een vast aantal andere kaarten, hoe snel je ook bent.
// Daarna gaat het om dagen: hoe langer je een woord onthoudt, hoe langer de pauze.
function schedule(old, grade, now = Date.now(), o = DEFAULT_OPTS) {
  const st = { s: 'new', step: 0, gap: 0, ivl: 0, ease: o.startEase, reps: 0, lapses: 0, due: now, ...old };
  const setIvl = days => { st.ivl = Math.min(o.maxIvl, Math.max(1, Math.round(days))); st.due = addDays(now, st.ivl); st.gap = 0; };
  const graduate = days => { st.s = 'review'; st.step = 0; setIvl(days); };
  st.reps++;
  if (st.s === 'new') { st.s = 'learn'; st.step = 0; st.ease = o.startEase; }

  if (st.s === 'learn' || st.s === 'relearn') {
    const steps = st.s === 'learn' ? o.learnSteps : o.relearnSteps;
    const after = st.s === 'learn' ? o.gradIvl : Math.max(1, st.ivl);
    st.due = now;   // een woord dat je aan het leren bent, staat de volgende keer meteen klaar
    if (!steps.length) { graduate(grade === 4 ? o.easyPause : after); return st; }
    if (grade === 1) { st.step = 0; st.gap = steps[0]; }
    else if (grade === 2) { st.gap = Math.round((steps[st.step] || steps[0]) * 1.8); }
    else if (grade === 3) {
      st.step++;
      if (st.step >= steps.length) graduate(after);
      else st.gap = steps[st.step];
    } else { graduate(Math.max(o.easyPause, after + 1)); }
    return st;
  }

  // Herhaling. Kom je later terug dan gepland en weet je het nog, dan telt die extra tijd mee.
  const late = Math.max(0, (startOfDay(now) - st.due) / DAY);
  if (grade === 1) {
    st.lapses++; st.ease = Math.max(1.3, st.ease - 0.2);
    st.ivl = Math.max(1, Math.round(st.ivl * 0.2));
    if (o.relearnSteps.length) { st.s = 'relearn'; st.step = 0; st.gap = o.relearnSteps[0]; st.due = now; }
    else setIvl(st.ivl);
  } else if (grade === 2) {
    st.ease = Math.max(1.3, st.ease - 0.15);
    setIvl(Math.max(st.ivl + 1, st.ivl * o.hardFactor));
  } else if (grade === 3) {
    setIvl(Math.max(st.ivl + 1, (st.ivl + late / 2) * st.ease));
  } else {
    st.ease += 0.15;
    setIvl(Math.max(o.easyPause, st.ivl + 2, (st.ivl + late) * st.ease * o.easyBonus));
  }
  return st;
}

// Tekst onder de antwoordknoppen: wanneer zie je het woord terug?
function fmtWait(st) {
  if (st.s !== 'review') return tn(st.gap, '{n} kaart', '{n} kaarten');
  const d = st.ivl;
  if (d <= 1) return t('volgende keer');
  if (d < 30) return tn(d, '{n} dag', '{n} dagen');
  if (d < 365) return t('{n} mnd', { n: Math.round(d / 30) });
  return t('{n} jaar', { n: (d / 365).toFixed(1).replace('.0', '').replace('.', loc() === 'nl-NL' || loc() === 'es-ES' ? ',' : '.') });
}

// ---------- Nieuwe woorden per dag ----------
// Per lijst krijg je per dag een vast aantal nieuwe woorden. Stop je halverwege en ga je dezelfde dag verder,
// dan ga je door met dezelfde woorden; de volgende dag komen er nieuwe bij. Wat je vandaag begon, volgt uit de
// vastgelegde antwoorden: een woord dat vandaag voor het eerst beantwoord is (niet met Ken ik al of Weg).
function newStartedToday(deck) {
  const sod = startOfDay(Date.now()), first = new Map();
  for (const e of db.events) {
    if (e[EV.deck] !== deck.id || e[EV.grade] > 4 || e[EV.kind] >= 8) continue;
    if (!first.has(e[EV.card])) first.set(e[EV.card], e[EV.t]);
  }
  let n = 0;
  for (const tm of first.values()) if (tm >= sod) n++;
  return n;
}
// Ben je klaar en wil je verder, dan komen er extra nieuwe woorden bij voor vandaag (deck.extra).
const extraToday = deck => deck.extra?.day === dayKey() ? deck.extra.n : 0;
const newLeftToday = deck => Math.max(0, optsOf(deck).newWords + extraToday(deck) - newStartedToday(deck));

// Nieuwe kaarten voor vandaag. Elk nieuw woord komt in beide richtingen: eerst taal → Nederlands,
// en een paar kaarten later Nederlands → taal. Een richting die nog openstaat van een eerder woord kost geen nieuw woord.
const LAG = 2;
function planNew(deck, limit = newLeftToday(deck)) {
  const dirs = dirsOf(deck), whole = [], out = [];
  for (const c of activeCards(deck)) {
    const open = dirs.filter(d => isNewSt(c.p?.[d]));
    if (open.length === dirs.length) whole.push(c);
    else for (const d of open) out.push({ deck: deck.id, card: c.id, dir: d });
  }
  const words = whole.slice(0, limit);
  const first = words.map(c => ({ deck: deck.id, card: c.id, dir: dirs[0] }));
  if (dirs.length === 1) return out.concat(first);
  const second = words.map(c => ({ deck: deck.id, card: c.id, dir: dirs[1] }));
  first.forEach((r, i) => { out.push(r); if (i >= LAG) out.push(second[i - LAG]); });
  out.push(...second.slice(Math.max(0, first.length - LAG)));
  return out;
}

// Wat staat er klaar als je nu gaat oefenen?
function deckCounts(deck, now = Date.now()) {
  const eod = endOfDay(now); let lrn = 0, rev = 0, newWords = 0;
  for (const c of activeCards(deck)) {
    let allNew = true;
    for (const d of dirsOf(deck)) {
      const st = c.p?.[d];
      if (isNewSt(st)) continue;
      allNew = false;
      if (st.s === 'review') { if (st.due <= eod) rev++; }
      else lrn++;
    }
    if (allNew) newWords++;
  }
  return { nw: planNew(deck).length, lrn, rev: Math.min(rev, optsOf(deck).maxReviews), newWords };
}

// ---------- Oefenen (met herhaalschema) ----------
// Een oefenronde is één rij kaarten. Een woord dat je aan het leren bent, wordt een aantal plekken verderop teruggezet.
let session = null;

function findRef(ref) {
  const deck = getDeck(ref.deck); const card = deck?.cards.find(c => c.id === ref.card && !c.hidden);
  return { deck, card };
}
function stateOf(ref) { return findRef(ref).card?.p?.[ref.dir] || { s: 'new' }; }

// Extra nieuwe woorden voor vandaag ("Nog 20 nieuwe woorden"). Bij "alles oefenen" verdeeld over de lijsten
// die nog nieuwe woorden hebben, samen precies n.
function addExtra(target, n) {
  const decks = (target === 'all' ? langDecks() : [getDeck(target)]).filter(d => d && deckCounts(d).newWords > 0);
  decks.forEach((d, i) => {
    const share = Math.floor(n / decks.length) + (i < n % decks.length ? 1 : 0);
    if (share) d.extra = { day: dayKey(), n: extraToday(d) + share };
  });
  save();
}
function startSession(target, extraWords = 0) {
  const decks = target === 'all' ? langDecks() : db.decks.filter(d => d.id === target);
  const eod = endOfDay(Date.now());
  if (extraWords) addExtra(target, extraWords);
  const learn = [], review = [], fresh = [];
  for (const deck of decks) {
    const dRev = [];
    for (const c of activeCards(deck)) for (const d of dirsOf(deck)) {
      const st = c.p?.[d]; const ref = { deck: deck.id, card: c.id, dir: d };
      if (isNewSt(st)) continue;
      if (st.s === 'review') { if (st.due <= eod) dRev.push(ref); }
      else learn.push(ref);
    }
    review.push(...shuffle(dRev).slice(0, optsOf(deck).maxReviews));
    fresh.push(...planNew(deck));
  }
  // Eerst wat nog aan het leren was, daarna herhalingen en nieuwe woorden door elkaar (2 : 1).
  const queue = shuffle(learn), rev = shuffle(review);
  for (let i = 0; rev.length || fresh.length; i++) queue.push((i % 3 === 2 && fresh.length) || !rev.length ? fresh.shift() : rev.shift());
  session = { target, queue, done: 0, current: null, revealed: false, undo: null, started: Date.now(), seen: new Set(), skipped: new Set(), good: {} };
  nextCard();
}

function nextCard() {
  const s = session;
  s.current = s.queue.shift() || null;
  s.revealed = false;
  s.shownAt = Date.now();
}

// ---------- Voortgang in een oefenronde ----------
const wordKey = r => r.deck + '|' + r.card;
// Hoeveel antwoorden heeft deze kaart nog nodig in deze ronde (als je steeds Goed kiest)?
function answersLeft(ref) {
  const st = stateOf(ref), o = optsOf(getDeck(ref.deck));
  if (isNewSt(st)) return Math.max(1, o.learnSteps.length);
  if (st.s === 'learn') return Math.max(1, o.learnSteps.length - st.step);
  if (st.s === 'relearn') return Math.max(1, o.relearnSteps.length - st.step);
  return 1;
}
// Woorden klaar / totaal, en een schatting van de tijd die nog nodig is.
// Klaar telt alles wat je vandaag in deze lijst(en) oefende, ook in een eerdere ronde van vandaag.
function roundProgress() {
  const s = session, rest = [s.current, ...s.queue].filter(Boolean);
  const left = new Set(rest.map(wordKey));
  const ids = new Set((s.target === 'all' ? langDecks() : [getDeck(s.target)].filter(Boolean)).map(d => d.id)), sod = startOfDay(Date.now());
  const seen = new Set(s.seen);
  for (const e of db.events) if (e[EV.t] >= sod && ids.has(e[EV.deck]) && e[EV.kind] < 8 && e[EV.grade] !== 6) seen.add(e[EV.deck] + '|' + e[EV.card]);
  const done = [...seen].filter(k => !left.has(k) && !s.skipped.has(k)).length;
  const ms = db.events.slice(-200).map(e => e[EV.ms]).filter(x => x > 500).sort((a, b) => a - b);
  const per = ms.length ? ms[Math.floor(ms.length / 2)] : 8000;   // mediaan van je eigen antwoordtijd
  const answers = rest.reduce((n, r) => n + answersLeft(r), 0);
  return { done, total: done + left.size, mins: Math.max(1, Math.round(answers * per / 60000)) };
}
// Stipjes voor het huidige woord: hoe vaak je het in deze ronde goed had, en hoe vaak nog nodig.
function wordDots() {
  const s = session, k = wordKey(s.current);
  const left = [s.current, ...s.queue].filter(r => wordKey(r) === k).reduce((n, r) => n + answersLeft(r), 0);
  const good = s.good[k] || 0;
  return `<div class="word-dots" title="${t('Dit woord: {a} keer goed, nog {b} keer nodig', { a: good, b: left })}" aria-label="${t('Dit woord: {a} keer goed, nog {b} keer nodig', { a: good, b: left })}">${'<i class="on"></i>'.repeat(good)}${'<i></i>'.repeat(left)}</div>`;
}

// Overslaan (zoals "begraven" in Anki): het woord verdwijnt uit deze ronde en komt de volgende keer terug. Telt niet als fout.
function skipCurrent() {
  const s = session; if (!s?.current) return;
  const k = wordKey(s.current);
  s.undo = { ref: s.current, skip: k, queue: [...s.queue], done: s.done, events: db.events.length };
  s.queue = s.queue.filter(r => wordKey(r) !== k);
  s.skipped.add(k); s.seen.add(k);
  toast(t('Overgeslagen. Dit woord komt de volgende keer terug.'));
  nextCard();
  render();
}

function answer(grade) {
  const s = session; if (!s?.current || !s.revealed) return;
  const ref = s.current; const { deck, card } = findRef(ref);
  if (!card) { nextCard(); return render(); }
  const old = card.p?.[ref.dir];
  const firstOfWord = dirsOf(deck).every(d => isNewSt(card.p?.[d]));   // eerste keer dat dit woord langskomt
  s.undo = { ref, old: old ? { ...old } : null, queue: [...s.queue], done: s.done, events: db.events.length };
  if (grade === 4 && firstOfWord) return hideCurrent(deck, card, true);
  logEvent(deck.id, card.id, ref.dir, grade, KIND[old?.s || 'new'], Date.now() - s.shownAt);
  s.seen.add(wordKey(ref));
  if (grade >= 3) s.good[wordKey(ref)] = (s.good[wordKey(ref)] || 0) + 1;
  s.undo.grade = grade;
  const st = schedule(old, grade, Date.now(), optsOf(deck));
  card.p ||= {};
  card.p[ref.dir] = st;
  save();
  if (st.s === 'learn' || st.s === 'relearn') s.queue.splice(Math.min(st.gap, s.queue.length), 0, ref);
  s.done++;
  nextCard();
  render();
}

// Woord verbergen tijdens het oefenen.
// reason true ("Ken ik al" bij een nieuw woord): komt niet vanzelf terug, wel bij het doorkijken.
// reason 'removed' ("✕ Weg"): je wilt het woord niet leren; het komt ook niet terug bij het doorkijken.
// Bij een nieuw woord schuift er meteen een ander nieuw woord in de plaats.
function hideCurrent(deck, card, reason) {
  const s = session, ref = s.current;
  const wholeNew = dirsOf(deck).every(d => isNewSt(card.p?.[d]));
  logEvent(deck.id, card.id, ref.dir, reason === 'removed' ? 6 : 5, KIND[card.p?.[ref.dir]?.s || 'new'], Date.now() - s.shownAt);
  if (reason === 'removed') s.skipped.add(wordKey(ref)); else s.seen.add(wordKey(ref));
  card.hidden = reason;
  s.undo.hidden = card.id;
  s.queue = s.queue.filter(r => r.card !== card.id);
  if (wholeNew) {
    const inSession = new Set(s.queue.map(r => r.card));
    const next = activeCards(deck).find(c => !inSession.has(c.id) && dirsOf(deck).every(d => isNewSt(c.p?.[d])));
    if (next) {
      const dirs = dirsOf(deck);
      s.queue.splice(Math.min(2, s.queue.length), 0, { deck: deck.id, card: next.id, dir: dirs[0] });
      if (dirs[1]) s.queue.splice(Math.min(2 + LAG + 1, s.queue.length), 0, { deck: deck.id, card: next.id, dir: dirs[1] });
    }
  }
  save();
  toast(reason === 'removed'
    ? t('"{w}" is weg. Terugzetten kan met ↶ Ongedaan of via de lijst.', { w: card.term })
    : t('"{w}" verborgen. Terugzien kan via "Verborgen woorden doorkijken".', { w: card.term }));
  if (reason !== 'removed') s.done++;
  nextCard();
  render();
}

function removeCurrent() {
  const s = session; if (!s?.current) return;
  const { deck, card } = findRef(s.current); if (!card) return;
  s.undo = { ref: s.current, old: null, queue: [...s.queue], done: s.done, events: db.events.length };
  hideCurrent(deck, card, 'removed');
}

function undo() {
  const s = session; if (!s?.undo) return;
  const u = s.undo;
  if (u.skip) {
    s.skipped.delete(u.skip);
    Object.assign(s, { queue: u.queue, done: u.done, current: u.ref, revealed: false, undo: null, shownAt: Date.now() });
    return render();
  }
  if (u.grade >= 3) s.good[wordKey(u.ref)] = Math.max(0, (s.good[wordKey(u.ref)] || 1) - 1);
  const deck = getDeck(u.ref.deck), card = deck?.cards.find(x => x.id === u.ref.card);
  if (card) {
    if (u.hidden) delete card.hidden;
    else { card.p ||= {}; if (u.old) card.p[u.ref.dir] = u.old; else delete card.p[u.ref.dir]; }
  }
  db.events.length = Math.min(db.events.length, u.events);
  save();
  Object.assign(s, { queue: u.queue, done: u.done, current: u.ref, revealed: true, undo: null, shownAt: Date.now() });
  render();
}

// ---------- Vrij oefenen en doorkijken (zonder herhaalschema) ----------
let free = null;
// mode 'free': hele lijst door zonder dat het meetelt voor het schema. mode 'check': verborgen woorden doorkijken.
function startFree(deckId, mode = 'free') {
  const deck = getDeck(deckId); if (!deck) return;
  const dirs = dirsOf(deck);
  const cards = mode === 'check' ? deck.cards.filter(c => c.hidden && c.hidden !== 'removed') : activeCards(deck);
  const queue = shuffle(cards.map(c => ({ card: c.id, dir: dirs[Math.floor(Math.random() * dirs.length)] })));
  free = { deck: deckId, mode, queue, total: queue.length, known: 0, again: 0, revealed: false, shownAt: Date.now() };
}
function removeFree() {
  if (!free?.queue.length) return;
  const it = free.queue[0];
  const c = getDeck(free.deck)?.cards.find(x => x.id === it.card); if (!c) return;
  logEvent(free.deck, c.id, it.dir, 6, 9, Date.now() - free.shownAt);
  c.hidden = 'removed'; save();
  free.queue = free.queue.filter(x => x.card !== it.card); free.total--; free.revealed = false; free.shownAt = Date.now();
  toast(t('"{w}" is weg. Terugzetten kan via de lijst (Selecteren → Tonen).', { w: c.term }));
  render();
}
function freeAnswer(knew) {
  if (!free?.queue.length || !free.revealed) return;
  const item = free.queue.shift();
  logEvent(free.deck, item.card, item.dir, knew ? 3 : 1, free.mode === 'check' ? 8 : 9, Date.now() - free.shownAt);
  if (knew) free.known++;
  else if (free.mode === 'check') {
    // Toch niet (meer) bekend: terug in het oefenen, als nieuw woord.
    const c = getDeck(free.deck)?.cards.find(x => x.id === item.card);
    if (c) { delete c.hidden; c.p = {}; }
    free.again++;
  } else { free.again++; free.queue.splice(Math.min(free.queue.length, 4), 0, item); }
  free.revealed = false; free.shownAt = Date.now();
  if (!free.queue.length && free.mode === 'check') { const d = getDeck(free.deck); if (d) d.lastCheck = Date.now(); }
  save();
  render();
}

// ---------- Uitspraak ----------
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
// Op de iPhone volgt de voorleesstem de stille modus: staat die aan, dan hoor je niets. Een website kan dat niet omzeilen.
const iosSilentTip = () => t('Hoor je niets? Zet de stille modus van je iPhone uit, met de knop aan de zijkant.');

let voices = [];
function loadVoices() { if ('speechSynthesis' in window) voices = speechSynthesis.getVoices(); }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
// Standaard een vrouwenstem. De telefoon zegt niet of een stem een vrouw of man is, dus de app herkent de bekende
// vrouwenstemmen aan hun naam (iPhone, Mac, Windows, Chrome). Een betere versie (Premium, Enhanced) gaat voor.
// Staat er geen bekende vrouwenstem op het apparaat, dan de eerste stem voor de taal, behalve de robotachtige
// Eloquence-stemmen. Op Android kiest de app niet: daar gebruikt Chrome de stem die op de telefoon is ingesteld.
const FEMALE_VOICES = {
  es: ['monica', 'paulina', 'marisol', 'helena', 'laura', 'elvira', 'dalia', 'sabina', 'google espanol'],
  nl: ['claire', 'ellen', 'fenna', 'colette', 'hanna', 'google nederlands'],
  sv: ['alva', 'klara', 'hedda', 'sofie', 'google svenska'],
  it: ['alice', 'federica', 'elsa', 'isabella', 'paola', 'google italiano'],
  fr: ['audrey', 'amelie', 'marie', 'aurelie', 'hortense', 'julie', 'denise', 'google francais'],
  pt: ['joana', 'catarina', 'luciana', 'fernanda', 'raquel', 'helia', 'maria', 'francisca'],
  de: ['anna', 'petra', 'helena', 'hedda', 'katja', 'amala', 'google deutsch'],
  en: ['kate', 'serena', 'stephanie', 'martha', 'hazel', 'susan', 'libby', 'sonia', 'google uk english female', 'samantha', 'moira', 'tessa', 'karen', 'fiona'],
};
const ELOQUENCE = ['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley'];
const plain = x => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nameHas = (v, names) => names.some(n => new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(plain(v.name)));
// Chrome op de computer speelt een stem met een accent in de naam (Mónica, Amélie) af met de standaardstem van de
// computer, dus met een Nederlandse uitspraak. Daar daarom eerst de Google-stemmen (online), dan stemmen zonder accent.
const chromeDesktop = /Chrome\//.test(navigator.userAgent) && !/Android|iPhone|iPad/.test(navigator.userAgent);
const trusted = list => {
  if (!chromeDesktop) return list;
  const google = navigator.onLine ? list.filter(v => /^google/i.test(v.name)) : [];
  const safe = list.filter(v => !/^google/i.test(v.name) && /^[\x20-\x7e]*$/.test(v.name));
  return [...google, ...safe];
};
function voiceFor(tts) {
  const base = tts.split('-')[0], female = FEMALE_VOICES[base] || [];
  const exact = voices.filter(v => v.lang?.replace('_', '-') === tts);
  const same = voices.filter(v => v.lang?.replace('_', '-').startsWith(base));
  const best = list => list.find(v => /premium|enhanced|verbeterd|mejorada|förbättrad/i.test(v.name)) || list[0];
  const her = list => trusted(list.filter(v => nameHas(v, female)));
  const human = list => trusted(list.filter(v => !nameHas(v, ELOQUENCE)));
  return best(her(exact)) || best(her(same)) || human(exact)[0] || human(same)[0] || exact[0] || same[0] || null;
}
const noVoiceWarned = new Set();
function speak(text, lang = curLang()) {
  if (!('speechSynthesis' in window) || !text) return;
  audioOn();
  const tts = lang === 'nl' ? 'nl-NL' : (LANGS[lang] || LANGS.es).tts, voice = voiceFor(tts);
  const u = new SpeechSynthesisUtterance(text.replace(/[¿¡]/g, ''));
  u.lang = voice?.lang || tts; if (voice) u.voice = voice;
  u.rate = db.settings.rate || 0.9;
  const playing = on => document.querySelectorAll('.speak').forEach(b => b.classList.toggle('playing', on));
  u.onstart = () => playing(true);
  u.onend = () => playing(false);
  u.onerror = e => { playing(false); if (!['interrupted', 'canceled'].includes(e.error)) toast(t('De stem doet het niet. Staat het geluid van je telefoon aan, en de stille modus uit?')); };
  if (voices.length && !voice && !noVoiceWarned.has(lang)) {
    noVoiceWarned.add(lang);
    toast(t('Op dit apparaat is geen stem voor het {taal} gevonden.', { taal: uiLang() === 'es' ? langName(lang).toLowerCase() : langName(lang) }));
  }
  // Op de iPhone gaat een nieuwe zin soms verloren als hij direct na cancel() komt; daarom dan even wachten.
  if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(() => speechSynthesis.speak(u), 150); }
  else speechSynthesis.speak(u);
}

// De iPhone laat de stem pas praten na een eerste tik. Een lege zin bij de eerste tik zet hem vrij, zodat ook het
// automatisch voorlezen (dat niet direct uit een tik komt) werkt.
document.addEventListener('touchend', () => {
  if (isIos && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
}, { once: true, passive: true });

// Volumeknoppen op Android. Die regelen normaal het belvolume, behalve als er media speelt; de stem gebruikt het
// mediavolume. Daarom speelt tijdens het oefenen een stil geluid door, zodat de volumeknoppen het volume van de stem regelen.
let keepAlive = null;
function silentWav() {
  const n = 8000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const w = (o, txt) => [...txt].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function audioOn() {
  if (!isAndroid || keepAlive || !db.settings.autoSpeak) return;
  keepAlive = new Audio(silentWav());
  keepAlive.loop = true;
  keepAlive.play().catch(() => { keepAlive = null; });
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Woordkoffer' });
}
function audioOff() { if (keepAlive) { keepAlive.pause(); URL.revokeObjectURL(keepAlive.src); keepAlive = null; } }

// ---------- Importeren ----------
const SEPARATORS = ['\t', ';', ' = ', ' – ', ' — ', ' - ', '=', ':', ','];
function parseLines(text, swap) {
  const out = [], bad = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let parts = null;
    for (const sep of SEPARATORS) {
      if (!line.includes(sep)) continue;
      if (sep === '\t' || sep === ';') parts = line.split(sep);
      else { const i = line.indexOf(sep); parts = [line.slice(0, i), line.slice(i + sep.length)]; }
      break;
    }
    parts = parts?.map(p => p.trim().replace(/^"(.*)"$/, '$1').trim());
    if (!parts || !parts[0] || !parts[1]) { bad.push(line); continue; }
    let [term, nl, ...rest] = parts;
    if (swap) [term, nl] = [nl, term];
    out.push({ term, nl, note: rest.filter(Boolean).join(' · ') });
  }
  return { out, bad };
}
function addCards(deck, items) {
  const have = new Set(deck.cards.map(c => (c.term + '|' + c.nl).toLowerCase()));
  let added = 0, dup = 0;
  for (const it of items) {
    const key = (it.term + '|' + it.nl).toLowerCase();
    if (have.has(key)) { dup++; continue; }
    have.add(key);
    deck.cards.push({ id: uid(), term: it.term, nl: it.nl, note: it.note || '', p: {} });
    added++;
  }
  return { added, dup };
}
const newDeck = name => ({ id: uid(), name, lang: curLang(), dir: 'both', created: Date.now(), opts: {}, cards: [] });

// ---------- Bestanden delen / back-up ----------
async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const safeName = s => s.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'woordkoffer';
function readFile(input, cb) {
  const f = input.files?.[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => cb(String(r.result), f.name); r.readAsText(f);
}

// ---------- Weergaven ----------
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { name: parts[0] || 'home', a: parts[1], b: parts[2] };
}
// ---------- Navigeren ----------
// Het overzicht is het beginpunt. Elke stap verder komt in de geschiedenis, "Terug" gaat een stap terug,
// en de terugknop van de telefoon op het overzicht sluit de app. Zo loop je nooit heen en weer.
// history.state.d = hoeveel stappen je van het overzicht af bent; .from = het scherm waar je vandaan kwam.
const here = () => (location.hash && location.hash !== '#' ? location.hash : '#/');
const depth = () => history.state?.d || 0;
function go(hash) {
  if (hash === '#/' || hash === '#' || hash === '') return goHome();
  if (hash === here()) return render();
  history.pushState({ d: depth() + 1, from: here() }, '', hash);
  render();
}
function goHome() {
  const d = depth();
  if (d > 0) history.go(-d);
  else { history.replaceState({ d: 0 }, '', '#/'); render(); }
}
// Terug naar het vorige scherm; is dat niet het verwachte scherm, dan dit scherm vervangen (geen extra stap).
function goBack(target) {
  if (target === '#/' && depth() <= 1) return depth() ? history.back() : goHome();
  if (depth() > 0 && history.state?.from === target) return history.back();
  if (target === '#/') return goHome();
  history.replaceState({ d: depth(), from: '#/' }, '', target);
  render();
}
// Na opslaan of toevoegen: dit scherm vervangen door het doel.
function replaceWith(target) {
  if (target === '#/') return goHome();
  history.replaceState({ d: depth(), from: history.state?.from || '#/' }, '', target);
  render();
}
const ICONS = {
  chat: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  stats: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  box: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="4" y="8" width="16" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};
// Voorlezen heeft drie standen: uit, alleen de taal die je leert, of die taal plus de Nederlandse vraag (handig samen, in de auto).
const SOUND_MODES = ['off', 'lang', 'both'];
const soundMode = () => !db.settings.autoSpeak ? 'off' : db.settings.speakNl ? 'both' : 'lang';
const soundLabel = mode => mode === 'off' ? t('Uit') : mode === 'lang' ? langName(curLang()) : t('{taal} + NL', { taal: langName(curLang()) });
function setSound(mode) {
  db.settings.autoSpeak = mode !== 'off';
  db.settings.speakNl = mode === 'both';
  save();
  if (mode === 'off') { if ('speechSynthesis' in window) speechSynthesis.cancel(); audioOff(); }
  const f = currentFlash();
  lastSpoken = f ? f.key + f.revealed : lastSpoken;   // niet meteen opnieuw voorlezen bij omschakelen
}
const soundBtn = () => {
  const m = soundMode();
  return `<button class="iconbtn" data-act="toggle-sound" aria-label="${t('Voorlezen: {stand}. Tik om te wisselen.', { stand: soundLabel(m) })}" title="${t('Voorlezen: uit, alleen de taal, of de taal en het Nederlands')}">${m === 'off' ? '🔇' : '🔊'} ${esc(soundLabel(m))}</button>`;
};
const topbar = (back, title = '', right = '') =>
  `<div class="topbar">${back ? `<button class="iconbtn" data-back="${back}">‹ ${t('Terug')}</button>` : ''}<div class="title">${title}</div>${right}</div>`;

// ---------- Tellen in woorden ----------
// Een woord heeft twee kaarten (taal → NL en NL → taal). Voor jou telt het woord, niet hoeveel kaarten er voorbijkwamen.
// Een woord is "geleerd" als je het in beide richtingen twee keer achter elkaar goed had: dan gaat het naar de herhaling.
// Een woord is "mee bezig" als je ermee begonnen bent, maar het nog niet geleerd is (of als je het vergeten was).

// Unieke woorden in een reeks antwoorden; "meteen goed" = zonder één keer Opnieuw.
function wordsIn(events) {
  const m = new Map();
  for (const e of events) { const k = e[EV.deck] + '|' + e[EV.card]; m.set(k, (m.get(k) ?? true) && isCorrect(e)); }
  const clean = [...m.values()].filter(Boolean).length;
  return { words: m.size, clean, mistakes: m.size - clean };
}

// Woorden die je vandaag hebt geoefend. Uit de vastgelegde antwoorden, en uit de stand van elk woord:
// wanneer een woord het laatst beantwoord is, volgt uit de pauze. Zo tellen ook woorden mee waarvan geen antwoorden
// zijn vastgelegd. Van die woorden is niet bekend of ze meteen goed waren.
function practicedToday(decks) {
  const sod = startOfDay(Date.now()), eod = endOfDay(Date.now()), ids = new Set(decks.map(d => d.id));
  const words = new Map();   // woord → true (meteen goed), false (met een fout), null (onbekend)
  for (const e of db.events) {
    if (e[EV.t] < sod || !counts(e) || !ids.has(e[EV.deck])) continue;
    const k = e[EV.deck] + '|' + e[EV.card];
    words.set(k, (words.get(k) ?? true) && isCorrect(e));
  }
  for (const d of decks) for (const c of d.cards) {
    const k = d.id + '|' + c.id;
    if (words.has(k)) continue;
    const today = Object.values(c.p || {}).some(st => st && !isNewSt(st) &&
      (st.s === 'review' ? addDays(st.due, -st.ivl) === sod : st.due >= sod && st.due <= eod + DAY));
    if (today) words.set(k, null);
  }
  const v = [...words.values()];
  return { words: words.size, clean: v.filter(x => x === true).length, unknown: v.filter(x => x === null).length };
}
// "Vandaag 16 woorden geoefend, 15 meteen goed." (meteen goed alleen als dat van alle woorden bekend is)
const todayText = p => !p.words ? '' : p.unknown
  ? tn(p.words, 'Vandaag {n} woord geoefend.', 'Vandaag {n} woorden geoefend.')
  : tn(p.words, 'Vandaag {n} woord geoefend, {c} meteen goed.', 'Vandaag {n} woorden geoefend, {c} meteen goed.', { c: p.clean });

// Hoe staan de woorden van een lijst ervoor, en wat staat er nu klaar?
function deckWords(d) {
  const w = { new: 0, busy: 0, learned: 0, due: 0 }, eod = endOfDay(Date.now());
  for (const c of activeCards(d)) {
    const s = wordStatus(d, c);
    if (s === 'new') w.new++;
    else if (s === 'busy') w.busy++;
    else { w.learned++; if (dirsOf(d).some(x => c.p?.[x]?.due <= eod)) w.due++; }
  }
  w.total = w.new + w.busy + w.learned;
  w.newNow = Math.min(w.new, newLeftToday(d));
  w.ready = w.newNow + w.busy + w.due;
  return w;
}

function deckSummary(d) {
  const w = deckWords(d), today = practicedToday([d]);
  const seg = (n, cls) => n ? `<span class="${cls}" style="flex:${n}"></span>` : '';
  const ready = [w.newNow ? tn(w.newNow, '{n} nieuw', '{n} nieuw') : '', w.busy ? t('{n} mee bezig', { n: w.busy }) : '', w.due ? t('{n} herhalen', { n: w.due }) : ''].filter(Boolean).join(' · ');
  return `<div class="summary">
    <div class="wordbar" role="img" aria-label="${t('{a} geleerd, {b} mee bezig, {c} nog niet geoefend', { a: w.learned, b: w.busy, c: w.new })}">${seg(w.learned, 'learned')}${seg(w.busy, 'busy')}${seg(w.new, 'fresh')}</div>
    <div class="small"><i class="dot learned"></i>${t('{n} geleerd', { n: w.learned })} · <i class="dot busy"></i>${t('{n} mee bezig', { n: w.busy })} · <span class="muted">${t('{n} nieuw', { n: w.new })}</span></div>
    ${today.words ? `<div class="small">${todayText(today)}</div>` : ''}
    <div class="small muted">${ready ? t('Nu klaar: {x}', { x: ready }) : t('Nu niets te oefenen')}</div>
  </div>`;
}

function langPicker() {
  const L = LANGS[curLang()];
  return `<label class="langpick" title="${t('Kies de taal die je leert')}">
      <span aria-hidden="true">${L.flag}</span><span>${langName(curLang())}</span><span class="chev" aria-hidden="true">▾</span>
      <select class="langsel" aria-label="${t('Taal die je leert')}">
        ${Object.entries(LANGS).map(([k, v]) => {
          const n = db.decks.filter(d => (d.lang || 'es') === k).length;
          return `<option value="${k}" ${k === curLang() ? 'selected' : ''}>${v.flag} ${langName(k)}${n ? ` (${tn(n, '{n} lijst', '{n} lijsten')})` : ''}</option>`;
        }).join('')}
      </select></label>`;
}

// Schakelaar: de app in het Nederlands of in de taal die je leert.
function uiToggle() {
  const target = curLang();
  if (!UI[target]) return `<p class="muted small" style="margin:8px 0 0">${t('Woordkoffer is nog niet vertaald in het {taal}.', { taal: langName(target).toLowerCase() })}</p>`;
  const on = uiLang() === target;
  return `<div class="seg seg2" role="radiogroup" aria-label="${t('Taal van de app')}">
      <button class="${on ? '' : 'on'}" role="radio" aria-checked="${!on}" data-act="ui-lang" data-key="nl"><span>🇳🇱&nbsp; Nederlands</span></button>
      <button class="${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-act="ui-lang" data-key="target"><span>${LANGS[target].flag}&nbsp; ${UI[target]._self}</span></button>
    </div>`;
}

// Oefenknop: staat er iets klaar, dan "Oefen". Ben je klaar voor vandaag maar zijn er nog nieuwe woorden,
// dan "Nog 20 nieuwe woorden" (je eigen tempo), zodat je meteen verder kunt.
function practiceBtn(target, ready, newLeft, n, label, cls = '') {
  n = n || 20;
  if (ready) return `<button class="btn primary ${cls}" data-go="#/study/${esc(target)}">${label}</button>`;
  if (newLeft) return `<button class="btn primary ${cls}" data-act="extra" data-id="${esc(target)}" data-n="${n}">${tn(Math.min(n, newLeft), 'Nog {n} nieuw woord', 'Nog {n} nieuwe woorden')}</button>`;
  return `<button class="btn ${cls}" disabled>${t('Alles gedaan')}</button>`;
}

function viewHome() {
  let all = 0, newAll = 0;
  const L = LANGS[curLang()];
  const rows = langDecks().map(d => {
    const w = deckWords(d); all += w.ready; newAll += w.new;
    return `<div class="card deckcard">
      <div class="name">${esc(deckName(d))}</div>
      <div class="info">${deckSummary(d)}</div>
      <div class="deck-actions">
        <button class="btn" data-go="#/deck/${esc(d.id)}">${t('Bekijk lijst')}</button>
        ${practiceBtn(d.id, w.ready, w.new, optsOf(d).newWords, t('Oefen'))}
      </div>
    </div>`;
  }).join('');
  // Vandaag geoefend, in woorden (zie practicedToday).
  const today = practicedToday(langDecks());
  return `
    ${topbar('', `<button class="iconbtn icon" data-act="menu" aria-label="${t('Menu')}" aria-expanded="false">${ICONS.menu}</button>`, langPicker())}
    <header class="brand">
      ${LOGO_SVG}
      <div><h1>Woordkoffer</h1><p class="motto" lang="${curLang()}">${esc(L.motto)}</p></div>
    </header>
    <p class="muted">${today.words ? todayText(today) : t('Vandaag nog niet geoefend.')}</p>
    <div class="hero">
      ${practiceBtn('all', all, newAll, 20, tn(all, 'Alles oefenen ({n} woord)', 'Alles oefenen ({n} woorden)'), 'block')}
    </div>
    <h2>${t('Woordenlijsten')}</h2>
    <div class="list">${rows || `<div class="card"><p>${t('Nog geen lijsten voor {taal}.', { taal: langName(curLang()) })}</p><p class="muted small">${t('Maak een lijst door woorden te plakken, met {taal} links en {nl} rechts.', { taal: langName(curLang()), nl: nlName() })}</p></div>`}</div>
    <div class="row" style="margin-top:14px">
      <button class="btn" data-go="#/import/new">+ ${t('Nieuwe lijst')}</button>
      ${STARTERS.some(s => (s.lang || 'es') === curLang()) ? `<button class="btn" data-go="#/library">+ ${t('Kant-en-klaar')}</button>` : ''}
    </div>`;
}

// ---------- Menu (zijlade) ----------
// Openen met de menuknop of door op het overzicht naar rechts te vegen. Sluiten met de terugknop van de telefoon,
// door naar links te vegen, buiten het menu te tikken of met Escape.
let menuOpen = false, pendingGo = null;
function menuHtml() {
  const L = LANGS[curLang()];
  const cur = here();
  const item = (hash, icon, label) => `<button class="menu-item ${cur === hash ? 'on' : ''}" data-menu-go="${hash}" ${cur === hash ? 'aria-current="page"' : ''}>${ICONS[icon]}<span>${label}</span></button>`;
  return `
    <div class="menu-head">${LOGO_SVG}<div><strong>Woordkoffer</strong><div class="motto" lang="${curLang()}">${esc(L.motto)}</div></div>
      <button class="iconbtn icon menu-close" data-act="menu-close" aria-label="${t('Menu sluiten')}" title="${t('Menu sluiten')}">${ICONS.close}</button></div>
    <div class="menu-section">
      <div class="menu-label">${t('Ik leer')}</div>
      ${langPicker()}
      <div class="menu-label" style="margin-top:14px">${t('Taal van de app')}</div>
      ${uiToggle()}
    </div>
    <div class="menu-items">
      ${item('#/', 'home', t('Overzicht'))}
      ${item('#/study/all', 'play', t('Alles oefenen'))}
      ${item('#/stats', 'stats', t('Statistieken'))}
      ${item('#/import/new', 'plus', t('Nieuwe lijst'))}
      ${STARTERS.some(s => (s.lang || 'es') === curLang()) ? item('#/library', 'box', t('Kant-en-klare lijsten')) : ''}
      ${item('#/settings', 'settings', t('Instellingen'))}
      ${FEEDBACK_URL ? `<a class="menu-item" href="${esc(FEEDBACK_URL)}" target="_blank" rel="noopener">${ICONS.chat}<span>${t('Feedback geven')}</span></a>` : ''}
    </div>
    <div class="menu-foot muted small">${creditHtml()}</div>`;
}
function drawMenu() {
  const nav = document.getElementById('drawer');
  nav.innerHTML = menuHtml();
  nav.querySelector('.langsel')?.addEventListener('change', e => { db.settings.lang = e.target.value; save(); render(); });
}
function openMenu() {
  if (menuOpen) return;
  menuOpen = true;
  history.pushState({ menu: 1, d: depth(), from: history.state?.from }, '');
  drawMenu();
  document.body.classList.add('menu-open');
  document.getElementById('drawer').setAttribute('aria-hidden', 'false');
  document.getElementById('drawer').querySelector('button')?.focus({ preventScroll: true });
}
function closeMenu() { if (menuOpen) history.back(); }   // de terugknop sluit het menu ook: één weg
window.addEventListener('popstate', () => {
  if (!menuOpen) return render();
  menuOpen = false;
  document.body.classList.remove('menu-open');
  document.getElementById('drawer').setAttribute('aria-hidden', 'true');
  if (pendingGo) { const h = pendingGo; pendingGo = null; if (h !== here()) go(h); }
});

// Vegen: op het overzicht naar rechts = menu open; in het menu naar links = dicht.
// Op andere schermen: vanaf de linkerrand naar rechts vegen = terug. Niet in Safari op de iPhone zelf: die doet dat al.
// Telefoons die zelf terugvegen (Android met veeggebaren) krijgen de veeg niet door aan de app, dus het gebeurt nooit dubbel.
const ownBackSwipe = isIos && navigator.standalone !== true;
let touch = null;
document.addEventListener('touchstart', e => { const p = e.touches[0]; touch = { x: p.clientX, y: p.clientY, t: Date.now() }; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!touch) return;
  const p = e.changedTouches[0], dx = p.clientX - touch.x, dy = p.clientY - touch.y, start = touch.x;
  const quick = Date.now() - touch.t < 700; touch = null;
  if (!quick || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
  if (menuOpen) { if (dx < 0) closeMenu(); return; }
  if (dx > 0 && route().name === 'home' && start > 24) openMenu();                  // niet vanaf de rand: daar zit op Android het systeem-terug
  else if (dx > 0 && route().name !== 'home' && !ownBackSwipe && start < 40) {
    const back = $app.querySelector('[data-back]');
    if (back) goBack(back.dataset.back); else goHome();
  }
}, { passive: true });

function flashHtml({ dir, card, revealed, sub, removable, deck, skippable, dots = '' }) {
  const lc = deck?.lang || 'es';
  const front = dir === 'toNl' ? card.term : card.nl;
  const back = dir === 'toNl' ? card.nl : card.term;
  return `<div class="card flash" data-act="${revealed ? 'speak' : 'reveal'}">
      <div class="dir">${dirLabel(dir, deck)}${sub ? ' · ' + esc(sub) : ''}</div>
      ${dots}
      ${db.settings.autoSpeak && (dir === 'toNl' || revealed || db.settings.speakNl) ? `<button class="iconbtn speak" data-act="speak" aria-label="${t('Spreek uit')}">🔊</button>` : ''}
      <div class="front" lang="${dir === 'toNl' ? lc : 'nl'}">${esc(front)}</div>
      ${revealed ? `<hr><div class="back" lang="${dir === 'fromNl' ? lc : 'nl'}">${esc(back)}</div>${card.note ? `<div class="note">${esc(card.note)}</div>` : ''}` : ''}
      ${skippable ? `<button class="mini-skip" data-act="skip-word" title="${t('Nu overslaan; komt de volgende keer terug')}">↷ ${t('Overslaan')}</button>` : ''}
      ${removable ? `<button class="mini-remove" data-act="remove-word" title="${t('Dit woord hoef ik niet te leren')}" aria-label="${t('Dit woord hoef ik niet te leren')}">✕ ${t('Weg')}</button>` : ''}
    </div>`;
}

function viewStudy(target) {
  if (!session || session.target !== target) startSession(target);
  const s = session;
  const back = topbar('#/', '', (s.undo ? `<button class="iconbtn" data-act="undo" title="${t('Laatste antwoord ongedaan maken')}">↶ ${t('Ongedaan')}</button>` : '') + soundBtn());
  if (!s.current) {
    const mine = db.events.filter(e => e[EV.t] >= s.started && counts(e));
    const mw = wordsIn(mine);
    const mins = Math.round(mine.reduce((n, e) => n + e[EV.ms], 0) / 60000);
    const decks = target === 'all' ? langDecks() : [getDeck(target)].filter(Boolean);
    const moreNew = decks.reduce((n, d) => n + deckCounts(d).newWords, 0);
    const moreN = (target === 'all' ? 20 : optsOf(decks[0]).newWords) || 20;   // je eigen tempo
    return `${back}<div class="done">
      <div class="big">🎉</div>
      <h1>${mine.length ? LANGS[curLang()].bravo : t('Niets te doen')}</h1>
      <p class="muted">${mine.length ? tn(mw.words, '{n} woord geoefend, {c} meteen goed.', '{n} woorden geoefend, {c} meteen goed.', { c: mw.clean }) + (mins ? ' ' + tn(mins, 'In {n} minuut.', 'In {n} minuten.') : '') : t('Er staat nu niets klaar.')}</p>
      ${moreNew ? `<p class="muted">${tn(moreNew, 'Er is nog {n} nieuw woord over.', 'Er zijn nog {n} nieuwe woorden over.')}</p>
        <button class="btn primary block" data-act="extra" data-id="${esc(target)}" data-n="${moreN}" style="margin-top:12px">${tn(Math.min(moreN, moreNew), 'Doorgaan met {n} nieuw woord', 'Doorgaan met {n} nieuwe woorden')}</button>` : ''}
      <button class="btn ${moreNew ? '' : 'primary'} block" data-go="#/" style="margin-top:12px">${t('Naar het overzicht')}</button></div>`;
  }
  const { deck, card } = findRef(s.current);
  if (!card) { nextCard(); return viewStudy(target); }
  const st = stateOf(s.current);
  const pr = roundProgress();
  const studyCounts = `<div class="roundbar">
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.total}" aria-valuenow="${pr.done}"><span style="width:${pr.total ? (pr.done / pr.total * 100).toFixed(1) : 0}%"></span></div>
      <div class="small muted">${t('{a} van {b} woorden klaar', { a: pr.done, b: pr.total })} · ${t('nog ±{n} min', { n: pr.mins })}</div>
    </div>`;
  let buttons;
  if (s.revealed) {
    const now = Date.now(), o = optsOf(deck);
    const firstTime = dirsOf(deck).every(d => isNewSt(card.p?.[d]));
    const lbl = [t('Opnieuw'), t('Moeilijk'), t('Goed'), firstTime ? t('Ken ik al') : t('Makkelijk')];
    const sub = g => g === 4 && firstTime ? t('verbergen') : fmtWait(schedule(st, g, now, o));
    buttons = `<div class="answers">${[1, 2, 3, 4].map(g =>
      `<button class="btn a${g}" data-grade="${g}">${lbl[g - 1]}<span>${sub(g)}</span></button>`).join('')}</div>`;
  } else {
    buttons = `<button class="btn primary block reveal" data-act="reveal">${t('Toon antwoord')}</button>`;
  }
  return `${back}${studyCounts}<div class="study">
    ${flashHtml({ dir: s.current.dir, card, deck, revealed: s.revealed, sub: target === 'all' ? deckName(deck) : '', removable: true, skippable: true, dots: wordDots() })}
    ${buttons}</div>`;
}

function viewFree(deckId, mode = 'free') {
  if (!free || free.deck !== deckId || free.mode !== mode) startFree(deckId, mode);
  const deck = getDeck(deckId); if (!deck || !free) return viewNotFound();
  const check = mode === 'check';
  const back = topbar('#/deck/' + esc(deckId), check ? t('Verborgen woorden') : t('Vrij oefenen'), soundBtn());
  if (!free.queue.length && check) {
    return `${back}<div class="done"><div class="big">👀</div><h1>${t('Klaar met doorkijken')}</h1>
      <p class="muted">${free.total ? tn(free.known, 'Je kent nog {n} woord.', 'Je kent nog {n} woorden.') + ' ' + tn(free.again, '{n} woord gaat terug in het oefenen.', '{n} woorden gaan terug in het oefenen.') : t('Er zijn geen verborgen woorden in deze lijst.')}</p>
      <button class="btn primary block" data-go="#/deck/${esc(deckId)}" style="margin-top:12px">${t('Klaar')}</button></div>`;
  }
  if (!free.queue.length) {
    return `${back}<div class="done"><div class="big">🚗</div><h1>${LANGS[curLang()].done}</h1>
      <p class="muted">${tn(free.total, 'Alle {n} woord gehad.', 'Alle {n} woorden gehad.')} ${free.again ? tn(free.again, '{n} keer "nog eens".', '{n} keer "nog eens".') : t('Alles meteen goed.')}</p>
      <button class="btn block" data-act="free-restart" style="margin-top:12px">${t('Nog een rondje')}</button>
      <button class="btn primary block" data-go="#/deck/${esc(deckId)}" style="margin-top:12px">${t('Klaar')}</button></div>`;
  }
  const item = free.queue[0];
  const card = deck.cards.find(c => c.id === item.card);
  if (!card) { free.queue.shift(); return viewFree(deckId, mode); }
  const buttons = !free.revealed
    ? `<button class="btn primary block reveal" data-act="reveal">${t('Toon antwoord')}</button>`
    : check
      ? `<div class="answers two"><button class="btn a1" data-free="0">${t('Toch oefenen')}<span>${t('terug in de lijst')}</span></button><button class="btn a3" data-free="1">${t('Ken ik nog')}<span>${t('blijft verborgen')}</span></button></div>`
      : `<div class="answers two"><button class="btn a1" data-free="0">${t('Nog eens')}</button><button class="btn a3" data-free="1">${t('Wist ik')}</button></div>`;
  const done = free.total - free.queue.length;
  const fdone = check ? done : free.known;
  return `${back}<div class="roundbar">
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${free.total}" aria-valuenow="${fdone}"><span style="width:${free.total ? (fdone / free.total * 100).toFixed(1) : 0}%"></span></div>
      <div class="small muted">${check ? t('{a} van {b} woorden doorgekeken', { a: fdone, b: free.total }) : t('{a} van {b} woorden geweten', { a: fdone, b: free.total })}</div>
    </div>
    <div class="study">${flashHtml({ dir: item.dir, card, deck, revealed: free.revealed, sub: check ? t('verborgen woord') : t('telt niet mee'), removable: !check })}${buttons}</div>`;
}

function optField(id, label, value, hint, attrs = '') {
  return `<label for="${id}">${label}</label><input type="${attrs.includes('text') ? 'text' : 'number'}" id="${id}" data-opt="${id}" value="${esc(value)}" ${attrs.replace('text', '')} inputmode="decimal">${hint ? `<p class="muted small">${hint}</p>` : ''}`;
}

function viewDeck(id) {
  const d = getDeck(id); if (!d) return viewNotFound();
  if (viewDeck.deck !== id) { viewDeck.deck = id; viewDeck.sel = new Set(); viewDeck.selecting = false; }
  const o = optsOf(d), now = Date.now();
  const c = deckCounts(d);
  const q = (viewDeck.q || '').toLowerCase();
  const cards = d.cards.filter(x => !q || (x.term + ' ' + x.nl + ' ' + x.note).toLowerCase().includes(q));
  // Per woord dezelfde begrippen als bovenaan: nieuw, mee bezig, of geleerd (en wanneer het terugkomt).
  const dueTxt = card => {
    const st = wordStatus(d, card);
    if (st === 'new') return t('nieuw');
    if (st === 'busy') return t('mee bezig');
    const next = Math.min(...dirsOf(d).map(x => card.p[x].due));
    if (next <= endOfDay(now)) return t('herhalen');
    const days = Math.round((startOfDay(next) - startOfDay(now)) / DAY);
    return days === 1 ? t('geleerd · morgen terug') : t('geleerd · over {n} d terug', { n: days });
  };
  const perWord = dirsOf(d).length;
  const rounds = o.newWords ? Math.ceil(c.newWords / o.newWords) : 0;
  const todo = c.nw + c.lrn + c.rev;
  const sel = viewDeck.sel, selecting = viewDeck.selecting;
  const hiddenN = d.cards.filter(x => x.hidden && x.hidden !== 'removed').length;
  const removedN = d.cards.filter(x => x.hidden === 'removed').length;
  const hidLabel = x => x.hidden === 'removed' ? t('weg') : t('verborgen');
  const allSel = cards.length && cards.every(x => sel.has(x.id));
  const cell = x => `<div class="term" lang="${d.lang || 'es'}">${esc(x.term)}</div><div class="nl">${esc(x.nl)}</div><div class="due">${x.hidden ? hidLabel(x) : dueTxt(x)}</div>`;
  const row = x => selecting
    ? `<label class="cardrow ${x.hidden ? 'hidden-row' : ''}"><input type="checkbox" class="pick" data-pick="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''}>${cell(x)}</label>`
    : `<div class="cardrow ${x.hidden ? 'hidden-row' : ''}" data-go="#/card/${esc(d.id)}/${esc(x.id)}">${cell(x)}</div>`;
  const wordsHead = [tn(d.cards.length, '{n} woord', '{n} woorden'), hiddenN ? t('{n} verborgen', { n: hiddenN }) : '', removedN ? t('{n} weg', { n: removedN }) : ''].filter(Boolean).join(', ');
  return `
    ${topbar('#/', esc(deckName(d)))}
    <div class="card" style="margin:0 0 12px">${deckSummary(d)}</div>
    <div class="row">
      ${practiceBtn(d.id, todo, c.newWords, o.newWords, t('Oefen'))}
      <button class="btn" data-go="#/free/${esc(d.id)}" ${activeCards(d).length ? '' : 'disabled'}>${t('Vrij oefenen')}</button>
    </div>

    <h2>${t('Hoeveel nieuwe woorden per dag?')}</h2>
    <div class="seg" role="radiogroup" aria-label="${t('Nieuwe woorden per dag')}">
      ${Object.entries(PRESETS).map(([k, p]) => `<button class="${o.preset === k ? 'on' : ''}" role="radio" aria-checked="${o.preset === k}" data-act="set-preset" data-id="${esc(d.id)}" data-key="${k}">
        ${t(p.label)}<span>${tn(p.newWords, '{n} woord', '{n} woorden')}</span></button>`).join('')}
    </div>
    ${!PRESETS[o.preset] ? `<p class="small" style="margin:8px 0 0">${tn(o.newWords, 'Nu: eigen instelling, {n} woord per dag.', 'Nu: eigen instelling, {n} woorden per dag.')}</p>` : ''}
    <p class="muted small" style="margin-top:8px">${perWord === 2 ? t('Zoveel nieuwe woorden krijg je per dag, elk in beide richtingen.') : t('Zoveel nieuwe woorden krijg je per dag.')} ${t('Stop je halverwege en ga je dezelfde dag verder, dan ga je door met dezelfde woorden. De volgende dag komen er nieuwe bij.')}
      ${c.newWords ? tn(rounds, 'Alle {w} nieuwe woorden heb je na ±{n} dag gehad.', 'Alle {w} nieuwe woorden heb je na ±{n} dagen gehad.', { w: c.newWords }) : ''}
      ${t('Ben je klaar en wil je verder? Dan krijg je met één tik een nieuwe portie woorden.')}</p>
    <details style="margin-top:10px" class="card">
      <summary>${t('Eigen aantal en meer instellingen')}</summary>
      ${optField('newWords', t('Nieuwe woorden per dag'), o.newWords, '', 'min="0" max="500"')}
      ${optField('maxReviews', t('Maximaal te herhalen kaarten per keer oefenen'), o.maxReviews, '', 'min="0" max="9999"')}
      ${optField('learnSteps', t('Een nieuw woord komt terug na … kaarten'), o.learnSteps.join(' '), t('Eerste getal: na "Opnieuw". Na "Goed" schuift het woord door naar het volgende getal, en daarna naar de volgende keer oefenen. "Moeilijk" is ongeveer 1,8 keer zo ver. Standaard: 8 25.'), 'text')}
      ${optField('relearnSteps', t('Een vergeten woord komt terug na … kaarten'), o.relearnSteps.join(' '), t('Standaard: {v}.', { v: 10 }), 'text')}
      ${optField('gradIvl', t('Eerste pauze als je een nieuw woord kent (dagen)'), o.gradIvl, t('1 = de volgende keer dat je oefent. Standaard: 1.'), 'min="1" max="30"')}
      ${optField('easyPause', t('Pauze na "Makkelijk" (dagen)'), o.easyPause, t('Een woord dat je aan het leren bent en "Makkelijk" vindt, komt minstens zo lang niet terug. Standaard: 60.'), 'min="1" max="365"')}
      ${optField('startEase', t('Groei bij "Goed" (%)'), Math.round(o.startEase * 100), t('De pauze wordt telkens zo veel keer langer. Standaard: 250%.'), 'min="130" max="500"')}
      ${optField('hardFactor', t('Groei bij "Moeilijk" (%)'), Math.round(o.hardFactor * 100), t('Standaard: {v}.', { v: '120%' }), 'min="100" max="200"')}
      ${optField('easyBonus', t('Extra bij "Makkelijk" (%)'), Math.round(o.easyBonus * 100), t('Standaard: {v}.', { v: '130%' }), 'min="100" max="300"')}
      ${optField('maxIvl', t('Langste pauze (dagen)'), o.maxIvl, t('Standaard: {v}.', { v: 365 }), 'min="1" max="36500"')}
      <button class="btn block" data-act="reset-opts" data-id="${esc(d.id)}" style="margin-top:12px">${t('Standaardwaarden terugzetten')}</button>
    </details>

    <h2>${t('Woorden')} <span class="muted small" style="font-weight:400">(${wordsHead})</span></h2>
    ${hiddenN ? `<div class="row" style="margin-bottom:8px"><button class="btn" data-go="#/check/${esc(d.id)}">${t('Verborgen woorden doorkijken ({n})', { n: hiddenN })}</button></div>
      <p class="muted small" style="margin:-2px 0 10px">${t('Verborgen woorden komen niet vanzelf terug.')} ${d.lastCheck ? t('Laatst doorgekeken: {d}.', { d: new Date(d.lastCheck).toLocaleDateString(loc()) }) : t('Nog nooit doorgekeken.')} ${t('Eens per maand of twee is genoeg.')}</p>` : ''}
    <div class="row" style="margin-bottom:8px">
      ${selecting
        ? `<button class="btn" data-act="sel-all" data-id="${esc(d.id)}">${allSel ? t('Niets selecteren') : t('Alles selecteren')}</button>
           <button class="btn primary" data-act="sel-done">${t('Klaar')}</button>`
        : `<button class="btn" data-go="#/import/${esc(d.id)}">${t('Woorden toevoegen')}</button>
           <button class="btn" data-act="sel-start">${t('Selecteren')}</button>`}
    </div>
    ${d.cards.length > 8 ? `<input type="search" id="q" placeholder="${t('Zoeken…')}" value="${esc(viewDeck.q || '')}" style="margin-bottom:8px">` : ''}
    <div class="card" style="padding:4px 12px">
      ${cards.map(row).join('') || `<p class="muted">${t('Geen woorden.')}</p>`}
    </div>
    ${selecting ? `<div class="selbar">
      <div class="small">${t('{n} geselecteerd', { n: `<strong>${sel.size}</strong>` })}</div>
      <div class="row">
        <button class="btn" data-act="sel-hide" data-id="${esc(d.id)}" ${sel.size ? '' : 'disabled'}>${t('Verbergen')}</button>
        <button class="btn" data-act="sel-show" data-id="${esc(d.id)}" ${sel.size ? '' : 'disabled'}>${t('Tonen')}</button>
        <button class="btn danger" data-act="sel-del" data-id="${esc(d.id)}" ${sel.size ? '' : 'disabled'}>${t('Verwijderen')}</button>
      </div></div>` : ''}

    <h2>${t('Over deze lijst')}</h2>
    <div class="card">
      <label for="dname">${t('Naam')}</label>
      <input type="text" id="dname" value="${esc(deckName(d))}">
      <label for="ddir">${t('Richting')}</label>
      <select id="ddir">
        <option value="both" ${d.dir === 'both' ? 'selected' : ''}>${t('Beide richtingen')}</option>
        <option value="toNl" ${d.dir === 'toNl' ? 'selected' : ''}>${t('Alleen {r}', { r: dirLabel('toNl', d) })}</option>
        <option value="fromNl" ${d.dir === 'fromNl' ? 'selected' : ''}>${t('Alleen {r}', { r: dirLabel('fromNl', d) })}</option>
      </select>
      <div class="row" style="margin-top:14px">
        <button class="btn" data-act="share-deck" data-id="${esc(d.id)}">${t('Lijst delen')}</button>
        <button class="btn danger" data-act="del-deck" data-id="${esc(d.id)}">${t('Lijst verwijderen')}</button>
      </div>
    </div>`;
}

function viewCard(deckId, cardId) {
  const d = getDeck(deckId); const c = d?.cards.find(x => x.id === cardId);
  if (!c) return viewNotFound();
  return `
    ${topbar('#/deck/' + esc(d.id), t('Woord bewerken'))}
    <div class="card">
      <label for="term">${esc(langName(d.lang || 'es'))}</label><input type="text" id="term" value="${esc(c.term)}" lang="${d.lang || 'es'}">
      <label for="nl">${nlName()}</label><input type="text" id="nl" value="${esc(c.nl)}" lang="nl">
      <label for="note">${t('Notitie (optioneel)')}</label><input type="text" id="note" value="${esc(c.note)}" placeholder="${t('bijv. onregelmatig werkwoord')}">
      <div class="row" style="margin-top:14px">
        <button class="btn primary" data-act="save-card" data-deck="${esc(d.id)}" data-id="${esc(c.id)}">${t('Opslaan')}</button>
        <button class="btn speak" data-act="speak-text" data-text="${esc(c.term)}" data-lang="${d.lang || 'es'}">🔊 ${t('Luister')}</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn" data-act="reset-card" data-deck="${esc(d.id)}" data-id="${esc(c.id)}">${t('Opnieuw leren')}</button>
        <button class="btn danger" data-act="del-card" data-deck="${esc(d.id)}" data-id="${esc(c.id)}">${t('Verwijderen')}</button>
      </div>
    </div>`;
}

function viewImport(id) {
  const isNew = id === 'new';
  const d = isNew ? null : getDeck(id);
  if (!isNew && !d) return viewNotFound();
  const taal = langName(d?.lang || curLang()), es = (d?.lang || curLang()) === 'es';
  return `
    ${topbar(isNew ? '#/' : '#/deck/' + esc(d.id), isNew ? t('Nieuwe lijst') : t('Woorden toevoegen'))}
    <div class="card">
      ${isNew ? `<label for="dname">${t('Naam van de lijst')}</label><input type="text" id="dname" placeholder="${t('bijv. Les 5 november')}">` : `<p><strong>${esc(deckName(d))}</strong></p>`}
      <label for="paste">${t('Plak hier je woorden, één per regel')}</label>
      <textarea id="paste" placeholder="${es ? 'el perro – de hond&#10;la mesa - de tafel&#10;hablar; praten; regelmatig werkwoord' : esc(t('woord – vertaling'))}"></textarea>
      <p class="muted small">${t('Scheid {taal} en {nl} met een streepje, = , ; of tab. {taal} staat links. Een derde deel na ; wordt een notitie.', { taal, nl: nlName() })}</p>
      <label class="check"><input type="checkbox" id="swap"> ${t('{nl} staat links', { nl: nlName() })}</label>
      <label for="file">${t('Of kies een bestand (.txt of .csv)')}</label>
      <input type="file" id="file" accept=".txt,.csv,.tsv,text/plain,text/csv">
      <div id="preview" class="preview" style="margin-top:12px"></div>
      <button class="btn primary block" data-act="do-import" data-id="${esc(id)}" style="margin-top:12px">${t('Toevoegen')}</button>
    </div>`;
}

function viewLibrary() {
  return `
    ${topbar('#/', t('Kant-en-klare lijsten'))}
    ${curLang() === 'es' ? `<p class="muted small">${t('Spaans zoals in Spanje. Waar Latijns-Amerika een ander woord gebruikt, staat dat in de notitie.')}</p>` : ''}
    <p class="muted small">${t('Zet aan wat je wilt leren. Zet je een lijst uit, dan verdwijnt hij uit je overzicht maar blijft je voortgang bewaard. Een lijst die aanstaat is je eigen kopie: via "Bekijk lijst" kun je woorden toevoegen, wijzigen en verwijderen.')}</p>
    <div class="list">${STARTERS.filter(s => (s.lang || 'es') === curLang()).map(s => {
      const d = db.decks.find(x => x.starter === s.key), on = !!d && !d.archived;
      return `<div class="card deck"><div class="info"><div class="name">${esc(d ? deckName(d) : t(s.name))}</div>
        <div class="muted small">${tn(d ? d.cards.length : s.words.length, '{n} woord', '{n} woorden')}: ${esc(s.words.slice(0, 4).map(w => w[0]).join(', '))}…</div>
        ${on ? `<button class="linkbtn small" data-go="#/deck/${esc(d.id)}">${t('Bekijk lijst')} ›</button>` : ''}</div>
        <button class="switch" role="switch" aria-checked="${on}" aria-label="${esc(t(s.name))}" data-act="toggle-starter" data-key="${esc(s.key)}"><span></span></button></div>`;
    }).join('')}</div>`;
}

function viewSettings() {
  const s = db.settings;
  const total = db.decks.reduce((n, d) => n + d.cards.length, 0);
  const KINDS = { 'voor-update': t('voor een nieuwe versie'), dagkopie: t('dagkopie'), onleesbaar: t('onleesbare gegevens'), 'voor-terugzetten': t('stand voor het terugzetten') };
  return `
    ${topbar('#/', t('Instellingen'))}
    <h2 style="margin-top:4px">${t('Taal van de app')}</h2>
    ${uiToggle()}
    <h2>${t('Weergave')}</h2>
    <div class="seg" role="radiogroup" aria-label="${t('Kleurmodus')}">
      ${[['auto', t('Automatisch'), t('zoals je telefoon')], ['light', t('Licht'), ''], ['dark', t('Donker'), '']].map(([k, label, sub]) => {
        const on = (s.theme || 'auto') === k;
        return `<button class="${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-act="set-theme" data-key="${k}">${label}${sub ? `<span>${sub}</span>` : ''}</button>`;
      }).join('')}
    </div>
    <h2>${t('Geluid')}</h2>
    <div class="card">
      <div class="menu-label">${t('Voorlezen')}</div>
      <div class="seg" role="radiogroup" aria-label="${t('Voorlezen')}">
        ${SOUND_MODES.map(k => `<button class="${soundMode() === k ? 'on' : ''}" role="radio" aria-checked="${soundMode() === k}" data-act="set-sound" data-key="${k}">${esc(soundLabel(k))}</button>`).join('')}
      </div>
      <p class="muted small">${t('Met "+ NL" leest de app ook de Nederlandse vraag voor: handig om samen te oefenen, bijvoorbeeld in de auto. Je wisselt ook tijdens het oefenen, met het luidsprekertje bovenin.')}</p>
      <label for="rate">${t('Spreeksnelheid')}</label>
      <select id="rate">
        ${[[0.7, t('Langzaam')], [0.9, t('Normaal')], [1.05, t('Snel')]].map(([v, l]) => `<option value="${v}" ${s.rate == v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <div class="row" style="margin-top:12px"><button class="btn speak" data-act="speak-text" data-text="${esc(LANGS[curLang()].hello)}" data-lang="${curLang()}">🔊 ${t('Test de stem')}</button></div>
      ${'speechSynthesis' in window ? '' : `<p class="muted small">${t('Deze browser kan niet voorlezen.')}</p>`}
    </div>
    <h2>${t('Waar staat mijn voortgang?')}</h2>
    <div class="card small">
      <p>${t('In deze browser, bij dit adres:')} <strong>${esc(location.protocol === 'file:' ? decodeURIComponent(location.pathname) : location.origin)}</strong></p>
      <p class="muted">${t('Open de app altijd op dezelfde manier en in dezelfde browser. Een ander adres of een andere browser heeft een eigen, lege voortgang. Een nieuwe versie van de app laat je voortgang staan.')}</p>
    </div>
    <h2>${t('Automatische kopieën')}</h2>
    <div class="card small">
      <p class="muted">${t('De app bewaart zelf kopieën: elke dag één, en één vlak voor elke nieuwe versie. Ging er iets mis, zet dan een kopie terug.')}</p>
      ${copyKeys().map(k => {
        const [, iso, kind] = k.slice(COPY_PREFIX.length).match(/^(.+)\.([a-z-]+)$/) || [];
        let info = '';
        try { const d = JSON.parse(localStorage.getItem(k)); const n = d.decks.reduce((a, x) => a + x.cards.filter(c => Object.keys(c.p || {}).length).length, 0); info = tn(n, '{n} woord met voortgang', '{n} woorden met voortgang'); } catch (e) { info = t('onleesbaar'); }
        return `<div class="cardrow" style="cursor:default"><div class="term">${iso ? new Date(iso).toLocaleString(loc(), { dateStyle: 'short', timeStyle: 'short' }) : ''}</div><div class="nl">${esc(KINDS[kind] || kind)} · ${info}</div>
          <button class="iconbtn" data-act="restore-copy" data-key="${esc(k)}">${t('Terugzetten')}</button></div>`;
      }).join('') || `<p class="muted">${t('Nog geen kopieën.')}</p>`}
    </div>
    <h2>${t('Back-up')}</h2>
    <div class="card">
      <p class="muted small">${t('Je woorden en voortgang staan alleen op dit apparaat ({l}, {w}). Maak af en toe een back-up, bijvoorbeeld naar Dropbox of Google Drive. Met een back-up zet je je voortgang ook over naar een ander apparaat of adres.', { l: tn(db.decks.length, '{n} lijst', '{n} lijsten'), w: tn(total, '{n} woord', '{n} woorden') })}</p>
      <div class="row" style="margin-top:10px">
        <button class="btn" data-act="backup">${t('Back-up maken')}</button>
        <label class="btn" for="restore" style="margin:0;color:var(--text);font-size:inherit">${t('Back-up terugzetten')}</label>
      </div>
      <input type="file" id="restore" accept=".json,application/json" hidden>
    </div>
    <h2>${t('Hoe werkt het?')}</h2>
    <div class="card small">
      <p>${t('Na elke kaart kies je hoe goed je het wist. Daarmee bepaalt de app wanneer je het woord terugziet:')}</p>
      <p><strong style="color:var(--again)">${t('Opnieuw')}</strong>: ${t('niet geweten, komt na een paar andere kaarten terug.')}<br>
      <strong style="color:var(--hard)">${t('Moeilijk')}</strong>: ${t('met moeite, komt iets eerder terug.')}<br>
      <strong style="color:var(--good)">${t('Goed')}</strong>: ${t('geweten, de pauze wordt langer.')}<br>
      <strong style="color:var(--easy)">${t('Ken ik al')}</strong> ${t('(bij een woord dat je voor het eerst ziet): het woord wordt verborgen en komt niet vanzelf terug.')}<br>
      <strong style="color:var(--easy)">${t('Makkelijk')}</strong> ${t('(bij een woord dat je aan het leren bent): minstens 2 maanden pauze.')}</p>
      <p>${t('Verborgen woorden kun je per lijst af en toe doorkijken. Weet je er een niet meer, dan gaat hij terug in het oefenen.')}</p>
      <p>${t('Bovenaan zie je hoeveel woorden van deze ronde klaar zijn en hoe lang het ongeveer nog duurt. De stipjes op de kaart laten zien hoe vaak je dit woord in deze ronde al goed had en hoe vaak nog nodig is. Lukt een woord nu niet, kies dan Overslaan: het komt de volgende keer terug en telt niet als fout.')}</p>
      <p>${t('Vrij oefenen loopt een hele lijst door zonder dat het meetelt. Handig om samen te oefenen, bijvoorbeeld in de auto.')}</p>
      <p class="muted">${t('Bij elke lijst zie je hoeveel woorden je al hebt geleerd, wat je vandaag hebt geoefend (goed en fout) en wat er klaarstaat: nieuwe woorden en woorden om te herhalen.')}</p>
    </div>
    <h2>${t('Privacy')}</h2>
    <div class="card small">
      <p>${t('Je woorden, voortgang en antwoorden staan alleen op dit apparaat. De app stuurt ze nergens heen en heeft geen account nodig.')}</p>
      ${chromeDesktop ? `<p>${t('Chrome op de computer leest voor met een stem van Google. Het woord dat wordt voorgelezen gaat dan via internet naar Google.')}</p>` : ''}
      ${GOATCOUNTER ? `<p>${t('De app telt anoniem hoe vaak hij wordt geopend, met GoatCounter: zonder cookies en zonder persoonsgegevens.')}</p>` : ''}
      ${FEEDBACK_URL ? `<p>${t('Feedback gaat via een Google-formulier. Vul daar alleen in wat je wilt delen.')}</p>` : ''}
    </div>
    ${FEEDBACK_URL ? `<a class="btn block" href="${esc(FEEDBACK_URL)}" target="_blank" rel="noopener" style="margin-top:16px">${t('Feedback geven')}</a>` : ''}
    <p class="muted small" style="text-align:center;margin-top:24px">${creditHtml()}</p>`;
}

// ---------- Statistieken ----------
const PERIODS = { 30: 'Maand', 90: '3 mnd', 365: 'Jaar', all: 'Alles' };
const WORD_STATUS = {
  new: { label: 'Nog niet geoefend', expl: 'Woorden die je nog niet hebt gezien.' },
  busy: { label: 'Mee bezig', expl: 'Begonnen, maar nog niet in beide richtingen twee keer achter elkaar goed. Of je was het woord vergeten.' },
  known: { label: 'Geleerd, nog vers', expl: 'Geleerd, maar nog maar kort: de pauze is korter dan 3 weken.' },
  solid: { label: 'Geleerd, zit erin', expl: 'Je weet ze ook na 3 weken of langer nog.' },
};
const fmtDate = ms => new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
const fmtDur = ms => { const m = Math.round(ms / 60000); return m < 60 ? t('{m} min', { m }) : t('{h} u {m} min', { h: Math.floor(m / 60), m: m % 60 }); };
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '–';
const num = n => Number(n).toLocaleString(loc());

function wordStatus(deck, c) {
  const sts = dirsOf(deck).map(d => c.p?.[d]);
  if (sts.every(isNewSt)) return 'new';
  if (sts.some(st => isNewSt(st) || st.s !== 'review')) return 'busy';
  return Math.min(...sts.map(st => st.ivl)) >= 21 ? 'solid' : 'known';
}

const statsState = { period: '30', deck: 'all', year: new Date().getFullYear() };

// De antwoorden (en oudere dagtellingen) binnen de gekozen taal en lijst.
function statsData() {
  const decks = statsState.deck === 'all' ? langDecks() : [getDeck(statsState.deck)].filter(Boolean);
  const ids = new Set(decks.map(d => d.id));
  const events = db.events.filter(e => ids.has(e[EV.deck]) && counts(e));
  // Oefenen met een eerdere versie van de app: daarvan is alleen het aantal kaarten per dag bekend (niet goed of fout).
  const oldDays = statsState.deck === 'all' && curLang() === 'es'
    ? Object.entries(db.log).filter(([k, v]) => ((v.reviews || 0) + (v.free || 0)) > 0)
      .map(([k, v]) => ({ day: k, n: (v.reviews || 0) + (v.free || 0) })) : [];
  return { decks, events, oldDays };
}

// Per dag: unieke woorden, hoeveel daarvan meteen goed en hoeveel met een fout. Oude dagtotalen (kaarten) apart.
function perDay(events, oldDays) {
  const m = new Map();
  for (const e of events) {
    const k = dayKey(e[EV.t]);
    if (!m.has(k)) m.set(k, { day: k, ev: [], old: 0 });
    m.get(k).ev.push(e);
  }
  for (const d of oldDays) { if (!m.has(d.day)) m.set(d.day, { day: d.day, ev: [], old: 0 }); m.get(d.day).old += d.n; }
  return [...m.values()].map(o => {
    const w = wordsIn(o.ev);
    return { day: o.day, n: w.words, ok: w.clean, bad: w.mistakes, answers: o.ev.length, ms: o.ev.reduce((n, e) => n + e[EV.ms], 0), old: o.old };
  }).sort((a, b) => a.day < b.day ? -1 : 1);
}
const dayTime = k => { const [y, mo, d] = k.split('-').map(Number); return new Date(y, mo - 1, d).getTime(); };

function viewStats() {
  const { decks, events: all, oldDays: allOld } = statsData();
  const from = statsState.period === 'all' ? 0 : addDays(Date.now(), -Number(statsState.period) + 1);
  const events = all.filter(e => e[EV.t] >= from);
  const oldDays = allOld.filter(d => dayTime(d.day) >= from);
  const days = perDay(events, oldDays);
  const ww = wordsIn(events);
  const wordDays = days.reduce((n, d) => n + d.n, 0), cleanDays = days.reduce((n, d) => n + d.ok, 0);
  const time = events.reduce((n, e) => n + e[EV.ms], 0);
  const status = { new: 0, busy: 0, known: 0, solid: 0 }; let hidden = 0;
  for (const d of decks) for (const c of d.cards) { if (c.hidden) { hidden++; continue; } status[wordStatus(d, c)]++; }

  const filters = `
    <div class="seg seg4" role="radiogroup" aria-label="${t('Periode')}">
      ${Object.entries(PERIODS).map(([k, v]) => `<button class="${statsState.period === k ? 'on' : ''}" role="radio" aria-checked="${statsState.period === k}" data-act="stats-period" data-key="${k}">${t(v)}</button>`).join('')}
    </div>
    <select id="statsdeck" aria-label="${t('Lijst')}" style="margin-top:8px">
      <option value="all">${t('Alle lijsten ({taal})', { taal: langName(curLang()) })}</option>
      ${langDecks().map(d => `<option value="${esc(d.id)}" ${statsState.deck === d.id ? 'selected' : ''}>${esc(deckName(d))}</option>`).join('')}
    </select>`;

  const tiles = `<div class="tiles">
      ${tile(t('Dagen geoefend'), num(days.length))}
      ${tile(t('Woorden geoefend'), num(ww.words), events.length ? tn(events.length, '{n} antwoord', '{n} antwoorden') : '')}
      ${tile(t('Meteen goed'), wordDays ? pct(cleanDays, wordDays) : '–', wordDays ? t('zonder één keer Opnieuw') : '')}
      ${tile(t('Tijd'), events.length ? fmtDur(time) : '–')}
    </div>`;

  return `
    ${topbar('#/', t('Statistieken'))}
    ${filters}
    ${tiles}
    <h2>${t('Kalender')}</h2>
    <div class="card">${calendarHtml(perDay(all, allOld))}</div>
    <h2>${t('Geoefend')}</h2>
    <div class="card">${practiceChart(days)}</div>
    <h2>${t('Onthouden')}</h2>
    <div class="card">${retentionHtml(all)}</div>
    <h2>${t('Je woorden')}</h2>
    <div class="card">${statusHtml(status, hidden)}</div>
    <h2>${t('Lastigste woorden')}</h2>
    <div class="card">${hardestHtml(events, decks)}</div>
    <div id="tip" class="tip" role="tooltip" hidden></div>`;
}

function tile(label, value, sub = '') {
  return `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;
}

// Kalender: twaalf kleine maandkaartjes. Hoe donkerder, hoe meer kaarten die dag.
function calendarHtml(days) {
  const y = statsState.year;
  const byDay = new Map(days.map(d => [d.day, d]));
  const inYear = days.filter(d => d.day.startsWith(y + '-'));
  const act = d => d.n || Math.ceil(d.old / 2);   // oude dagen: alleen kaarten bekend, ongeveer 2 kaarten per woord
  const max = Math.max(1, ...inYear.map(act));
  const level = n => n ? Math.min(5, Math.ceil(n / max * 5)) : 0;
  const months = Array.from({ length: 12 }, (_, m) => {
    const name = new Date(y, m, 1).toLocaleDateString(loc(), { month: 'short' }).replace('.', '');
    const first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7, len = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span class="cal-pad"></span>';
    for (let d = 1; d <= len; d++) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const o = byDay.get(k);
      const tip = o ? `${new Date(y, m, d).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'long' })}|${o.n ? tn(o.n, '{n} woord', '{n} woorden') + ' · ' + t('{c} meteen goed', { c: o.ok }) : t('geoefend met een vorige versie van de app')}` : '';
      cells += `<span class="cal-day l${o ? level(act(o)) : 0}" ${o ? `data-tip="${esc(tip)}" tabindex="0"` : ''}></span>`;
    }
    return `<div class="cal-month"><div class="cal-name">${name}</div><div class="cal-grid">${cells}</div></div>`;
  }).join('');
  return `
    <div class="cal-head">
      <button class="iconbtn" data-act="stats-year" data-step="-1" aria-label="${t('Vorig jaar')}">‹</button>
      <strong>${y}</strong>
      <button class="iconbtn" data-act="stats-year" data-step="1" aria-label="${t('Volgend jaar')}" ${y >= new Date().getFullYear() ? 'disabled' : ''}>›</button>
    </div>
    <div class="cal">${months}</div>
    <div class="cal-legend"><span>${t('Minder')}</span>${[1, 2, 3, 4, 5].map(l => `<span class="cal-day l${l}"></span>`).join('')}<span>${t('Meer')}</span></div>
    <p class="muted small" style="margin:8px 0 0">${inYear.length ? t('{d} geoefend in {y}.', { d: tn(inYear.length, '{n} dag', '{n} dagen'), y }) : t('Nog niet geoefend in {y}.', { y })}</p>
    ${inYear.length ? tableDetails([t('Dag'), t('Woorden'), t('Meteen goed')], inYear.slice().reverse().map(d => [fmtDate(dayTime(d.day)), d.n || '–', d.n ? pct(d.ok, d.n) : '–'])) : ''}`;
}

// Goed en fout per oefendag (bij meer dan 21 dagen per week), als gestapelde kolommen.
function practiceChart(days) {
  const real = days.filter(d => d.ok + d.bad);
  if (!real.length) return `<p class="muted small">${t('Nog geen antwoorden in deze periode.')}</p>`;
  let groups = real.map(d => ({ label: fmtDate(dayTime(d.day)), ok: d.ok, bad: d.bad }));
  let per = t('per oefendag');
  if (real.length > 21) {
    const m = new Map();
    for (const d of real) {
      const ms = dayTime(d.day), monday = addDays(ms, -((new Date(ms).getDay() + 6) % 7));
      const g = m.get(monday) || { label: t('wk {d}', { d: fmtDate(monday) }), ok: 0, bad: 0 };
      g.ok += d.ok; g.bad += d.bad; m.set(monday, g);
    }
    groups = [...m.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    per = t('per week');
  }
  const W = Math.max(260, Math.min(496, window.innerWidth - 64)), H = 190, padL = 30, padB = 22, padT = 10;
  const max = Math.max(...groups.map(g => g.ok + g.bad));
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const y = v => padT + (H - padT - padB) * (1 - v / top);
  const band = (W - padL) / groups.length, bw = Math.min(24, band * 0.62);
  let svg = '';
  for (let v = 0; v <= top; v += step) svg += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`;
  groups.forEach((g, i) => {
    const x = padL + band * i + (band - bw) / 2;
    const yOk = y(g.ok), yAll = y(g.ok + g.bad), base = y(0);
    const tip = `${g.label}|${t('{a} meteen goed · {b} met een fout', { a: g.ok, b: g.bad })}`;
    if (g.ok) svg += bar(x, yOk, bw, base - yOk, !g.bad, 'good');
    if (g.bad) svg += bar(x, yAll, bw, Math.max(0, (g.ok ? yOk - 2 : base) - yAll), true, 'bad');
    svg += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB}" fill="transparent" data-tip="${esc(tip)}" tabindex="0"/>`;
  });
  const every = Math.ceil(groups.length / Math.floor((W - padL) / 70));
  groups.forEach((g, i) => {
    if (i % every) return;
    const tx = padL + band * i + band / 2, edge = tx > W - 34 ? 'end' : 'middle';   // laatste label niet afsnijden
    svg += `<text x="${edge === 'end' ? W : tx}" y="${H - 6}" class="axis" text-anchor="${edge}">${esc(g.label)}</text>`;
  });
  return `
    <p class="muted small" style="margin-top:0">${t('Woorden die je oefende {per}: meteen goed, of met minstens één keer Opnieuw.', { per })}</p>
    <div class="legend"><span><i class="sw good"></i>${t('Meteen goed')}</span><span><i class="sw bad"></i>${t('Met een fout')}</span></div>
    <svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Woorden {per}', { per })}">${svg}</svg>
    ${tableDetails(['', t('Meteen goed'), t('Met een fout'), t('Woorden')], groups.slice().reverse().map(g => [g.label, g.ok, g.bad, g.ok + g.bad]))}`;
}
function niceStep(max) {
  const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  return [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) || p * 10;
}
// Kolom met 4px afgeronde bovenkant en een rechte voet.
function bar(x, y, w, h, roundTop, cls) {
  if (h <= 0) return '';
  const r = roundTop ? Math.min(4, h, w / 2) : 0;
  return `<path class="${cls}" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z"/>`;
}

// Onthouden: hoe vaak wist je een woord nog toen het na een pauze terugkwam?
function retentionHtml(events) {
  // Per woord per dag: kwam een geleerd woord terug, en wist je het nog (in beide richtingen)?
  const comebacks = since => {
    const m = new Map();
    for (const e of events) {
      if (e[EV.kind] !== KIND.review || e[EV.t] < since) continue;
      const k = dayKey(e[EV.t]) + '|' + e[EV.deck] + '|' + e[EV.card];
      m.set(k, (m.get(k) ?? true) && isCorrect(e));
    }
    const v = [...m.values()];
    return { n: v.length, kept: v.filter(Boolean).length };
  };
  const rows = [[30, t('Afgelopen maand')], [90, t('Afgelopen 3 maanden')], [365, t('Afgelopen jaar')]].map(([n, label]) => {
    const r = comebacks(addDays(Date.now(), -n + 1));
    return [label, r.n, pct(r.kept, r.n), r.n - r.kept];
  });
  const tot = comebacks(0), all = tot.n, kept = tot.kept;
  return `
    <p class="muted small" style="margin-top:0">${t('Een geleerd woord komt na een pauze van een of meer dagen terug. Wist je het nog (in beide richtingen), dan telt het als onthouden. Wist je het niet meer, dan ben je het vergeten en gaat het terug naar "mee bezig".')}</p>
    ${all ? `<div class="tiles two">${tile(t('Onthouden'), pct(kept, all), t('{a} van {b} keer', { a: num(kept), b: num(all) }))}${tile(t('Vergeten'), num(all - kept), t('keer een geleerd woord vergeten'))}</div>
    <table class="stat-table"><thead><tr><th></th><th>${t('Teruggekomen')}</th><th>${t('Onthouden')}</th><th>${t('Vergeten')}</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table>`
    : `<p class="muted small">${t('Nog geen geleerde woorden teruggekomen. Dat gebeurt zodra je een geleerd woord na een pauze terugziet.')}</p>`}`;
}

// Je woorden: één balk, verdeeld in vier stappen van nog niet geoefend tot zit erin.
function statusHtml(status, hidden) {
  const keys = ['new', 'busy', 'known', 'solid'], total = keys.reduce((n, k) => n + status[k], 0);
  if (!total) return `<p class="muted small">${t('Geen woorden in deze lijst.')}</p>`;
  const parts = keys.filter(k => status[k]).map(k => {
    const share = status[k] / total, label = `${Math.round(share * 100)}%`;
    return `<div class="seg-part s-${k}" style="flex:${status[k]}" data-tip="${esc(`${t(WORD_STATUS[k].label)}|${tn(status[k], '{n} woord', '{n} woorden')} · ${label}`)}" tabindex="0">${share >= 0.12 ? `<span>${label}</span>` : ''}</div>`;
  }).join('');
  return `
    <div class="segbar" role="img" aria-label="${keys.map(k => `${t(WORD_STATUS[k].label)}: ${status[k]}`).join(', ')}">${parts}</div>
    <ul class="status-legend">${keys.map(k => `<li><i class="sw s-${k}"></i><div><strong>${t(WORD_STATUS[k].label)}</strong> · ${status[k]}<br><span class="muted small">${t(WORD_STATUS[k].expl)}</span></div></li>`).join('')}</ul>
    ${hidden ? `<p class="muted small" style="margin:6px 0 0">${tn(hidden, 'Daarnaast {n} verborgen woord (Ken ik al of Weg).', 'Daarnaast {n} verborgen woorden (Ken ik al of Weg).')}</p>` : ''}`;
}

// Lastigste woorden: het vaakst fout in de gekozen periode.
function hardestHtml(events, decks) {
  const m = new Map();
  for (const e of events) {
    const k = e[EV.deck] + '|' + e[EV.card];
    const o = m.get(k) || { deck: e[EV.deck], card: e[EV.card], n: 0, bad: 0 };
    o.n++; if (!isCorrect(e)) o.bad++; m.set(k, o);
  }
  const list = [...m.values()].filter(o => o.bad).sort((a, b) => b.bad - a.bad || a.n - b.n).slice(0, 10)
    .map(o => ({ ...o, c: getDeck(o.deck)?.cards.find(c => c.id === o.card) })).filter(o => o.c);
  if (!list.length) return `<p class="muted small">${t('Nog geen woorden die je fout had in deze periode.')}</p>`;
  return `<table class="stat-table hard"><thead><tr><th>${t('Woord')}</th><th>${t('Fout')}</th><th>${t('Goed')}</th></tr></thead><tbody>
    ${list.map(o => `<tr data-go="#/card/${esc(o.deck)}/${esc(o.card)}"><td><strong lang="${getDeck(o.deck)?.lang || 'es'}">${esc(o.c.term)}</strong><br><span class="muted small">${esc(o.c.nl)}</span></td><td>${o.bad}×</td><td>${pct(o.n - o.bad, o.n)}</td></tr>`).join('')}
  </tbody></table>`;
}

function tableDetails(head, rows) {
  return `<details class="as-table"><summary>${t('Bekijk als tabel')}</summary>
    <table class="stat-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

// Tooltip voor kalenderdagen, kolommen en de woordenbalk (aanwijzen, aantikken of met de tab-toets).
function bindTips() {
  const tip = document.getElementById('tip'); if (!tip) return;
  const show = el => {
    const [title, body] = el.dataset.tip.split('|');
    tip.replaceChildren();
    const b = document.createElement('strong'); b.textContent = body; tip.append(b, document.createElement('br'), document.createTextNode(title));
    tip.hidden = false;
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
    tip.style.top = (r.top + window.scrollY - tip.offsetHeight - 8) + 'px';
  };
  $app.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('pointerdown', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
    el.addEventListener('blur', () => { tip.hidden = true; });
  });
}

// Naam en versie, onderaan het menu en de instellingen.
const creditHtml = () => `Woordkoffer ${APP_VERSION} · <a href="${SOURCE_URL}" target="_blank" rel="noopener">${t('open source')}</a><br>© 2026 ${MAKER}`;

function viewNotFound() {
  return `<div class="done"><h1>${t('Niet gevonden')}</h1><button class="btn primary" data-go="#/">${t('Naar het overzicht')}</button></div>`;
}

// ---------- Renderen ----------
let lastSpoken = null;
function render() {
  applyTheme();   // ook na het terugzetten van een back-up of kopie
  document.documentElement.lang = uiLang();
  const r = route();
  if (r.name !== 'study') session = null;
  if (!['study', 'free', 'check'].includes(r.name)) audioOff();
  if (r.name !== 'free' && r.name !== 'check') free = null;
  let html;
  switch (r.name) {
    case 'home': html = viewHome(); break;
    case 'study': html = viewStudy(r.a || 'all'); break;
    case 'free': html = viewFree(r.a); break;
    case 'check': html = viewFree(r.a, 'check'); break;
    case 'deck': html = viewDeck(r.a); break;
    case 'card': html = viewCard(r.a, r.b); break;
    case 'import': html = viewImport(r.a || 'new'); break;
    case 'library': html = viewLibrary(); break;
    case 'settings': html = viewSettings(); break;
    case 'stats': html = viewStats(); break;
    default: html = viewNotFound();
  }
  $app.innerHTML = html;
  if (menuOpen) drawMenu();
  afterRender(r);
}

// Wat er bij dit kaartje wordt voorgelezen. Vanzelf: het vreemde woord zodra het op het scherm komt, en in de stand
// "+ NL" ook de Nederlandse vraag. Met het luidsprekertje (onTap): het vreemde woord als het in beeld is.
function spokenText(f, onTap = false) {
  const term = { text: f.card.term, lang: f.lang };
  if (f.dir === 'toNl') return !f.revealed || onTap ? term : null;
  if (f.revealed) return term;
  return db.settings.speakNl ? { text: f.card.nl, lang: 'nl' } : null;
}

// Het kaartje dat nu op het scherm staat (in beide oefenvormen).
function currentFlash() {
  if (route().name === 'study' && session?.current) {
    const { card, deck } = findRef(session.current);
    return { card, lang: deck?.lang, dir: session.current.dir, revealed: session.revealed, key: session.current.card + session.current.dir + session.done };
  }
  if (['free', 'check'].includes(route().name) && free?.queue.length) {
    const it = free.queue[0];
    const deck = getDeck(free.deck);
    return { card: deck?.cards.find(c => c.id === it.card), lang: deck?.lang, dir: it.dir, revealed: free.revealed, key: it.card + (free.known + free.again) };
  }
  return null;
}

function bindOptions(d) {
  const o = () => (d.opts ||= {});
  const numbers = { newWords: [0, 500], maxReviews: [0, 9999], gradIvl: [1, 30], easyPause: [1, 365], maxIvl: [1, 36500] };
  const percents = { startEase: [130, 500], hardFactor: [100, 200], easyBonus: [100, 300] };
  document.querySelectorAll('[data-opt]').forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.opt; const v = inp.value;
    if (k === 'learnSteps' || k === 'relearnSteps') {
      const arr = v.split(/[\s,]+/).map(Number).filter(n => n > 0 && n <= 200).map(Math.round);
      if (k === 'learnSteps' && !arr.length) { toast(t('Vul minstens één getal in, bijv. 8 25')); return render(); }
      o()[k] = arr;
    } else if (numbers[k]) {
      const [lo, hi] = numbers[k]; o()[k] = Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
      if (k === 'newWords' || k === 'maxReviews') {
        const p = PRESETS[optsOf(d).preset];
        if (!p || p.newWords !== optsOf(d).newWords || p.maxReviews !== optsOf(d).maxReviews) o().preset = 'eigen';
      }
    } else if (percents[k]) {
      const [lo, hi] = percents[k]; o()[k] = Math.max(lo, Math.min(hi, Number(v) || lo)) / 100;
    }
    save(); toast(t('Opgeslagen'));
    const open = document.querySelector('details')?.open;
    render();
    if (open) document.querySelector('details').open = true;
  }));
}

function afterRender(r) {
  if (r.name === 'stats') {
    document.getElementById('statsdeck')?.addEventListener('change', e => { statsState.deck = e.target.value; render(); });
    bindTips();
  }
  $app.querySelector('.langsel')?.addEventListener('change', e => { db.settings.lang = e.target.value; statsState.deck = 'all'; save(); render(); });
  const f = currentFlash();
  if (f?.card && db.settings.autoSpeak) {
    const key = f.key + f.revealed;
    if (key !== lastSpoken) {
      const said = spokenText(f);
      if (said) { speak(said.text, said.lang); lastSpoken = key; }
    }
  }
  if (r.name === 'import') {
    const paste = document.getElementById('paste'), swap = document.getElementById('swap');
    if (!paste) return;
    const upd = () => {
      const { out, bad } = parseLines(paste.value, swap.checked);
      document.getElementById('preview').innerHTML = !paste.value.trim() ? '' :
        `<p class="small">${tn(out.length, '{n} woord herkend.', '{n} woorden herkend.')}${bad.length ? ` <span style="color:var(--again)">${tn(bad.length, '{n} regel niet begrepen.', '{n} regels niet begrepen.')}</span>` : ''}</p>
        <table>${out.slice(0, 50).map(o => `<tr><td><strong>${esc(o.term)}</strong></td><td>${esc(o.nl)}</td><td class="muted">${esc(o.note)}</td></tr>`).join('')}
        ${bad.slice(0, 10).map(b => `<tr><td colspan="3" style="color:var(--again)">${esc(b)}</td></tr>`).join('')}</table>`;
    };
    paste.addEventListener('input', upd); swap.addEventListener('change', upd);
    document.getElementById('file').addEventListener('change', e => readFile(e.target, (txt, name) => {
      paste.value = txt;
      const n = document.getElementById('dname');
      if (n && !n.value) n.value = name.replace(/\.[^.]+$/, '');
      upd();
    }));
  }
  if (r.name === 'deck') {
    const d = getDeck(r.a); if (!d) return;
    const q = document.getElementById('q');
    if (q) q.addEventListener('input', () => {
      viewDeck.q = q.value; const pos = q.selectionStart; const y = window.scrollY;
      render(); window.scrollTo(0, y); const q2 = document.getElementById('q'); q2.focus(); q2.setSelectionRange(pos, pos);
    });
    document.getElementById('dname').addEventListener('change', e => { const v = e.target.value.trim(); if (v) { d.name = v; save(); toast(t('Naam opgeslagen')); render(); } });
    document.getElementById('ddir').addEventListener('change', e => { d.dir = e.target.value; save(); toast(t('Richting aangepast')); render(); });
    bindOptions(d);
    document.querySelectorAll('[data-pick]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) viewDeck.sel.add(cb.dataset.pick); else viewDeck.sel.delete(cb.dataset.pick);
      rerenderKeepScroll();
    }));
  } else { viewDeck.q = ''; viewDeck.deck = null; }
  if (r.name === 'settings') {
    const s = db.settings;
    document.getElementById('rate').addEventListener('change', e => { s.rate = parseFloat(e.target.value); save(); });
    document.getElementById('restore').addEventListener('change', e => readFile(e.target, txt => {
      let data; try { data = normalize(JSON.parse(txt)); } catch (err) { data = null; }
      if (!data) return toast(t('Dit is geen geldige back-up.'));
      if (!confirm(t('Alles op dit apparaat vervangen door deze back-up? Je huidige stand wordt eerst als automatische kopie bewaard.'))) return;
      storeCopy('voor-terugzetten', JSON.stringify(db), 3);
      db = data; save(); toast(t('Back-up teruggezet')); goHome();
    }));
  }
}

function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }
// De woorden die in de lijst geselecteerd zijn.
const selected = d => d.cards.filter(c => viewDeck.sel.has(c.id));

// ---------- Acties ----------
function reveal() {
  if (route().name === 'study' && session?.current) session.revealed = true;
  else if (['free', 'check'].includes(route().name) && free?.queue.length) free.revealed = true;
  else return;
  render();
}

document.addEventListener('click', e => {
  if (['study', 'free', 'check'].includes(route().name)) audioOn();   // geluid mag pas starten na een tik
  if (e.target.closest('.drawer-backdrop')) return closeMenu();
  const menuGo = e.target.closest('[data-menu-go]');
  if (menuGo) { pendingGo = menuGo.dataset.menuGo; return closeMenu(); }
  const el = e.target.closest('[data-go],[data-back],[data-act],[data-grade],[data-free]');
  if (!el || el.disabled) return;
  if (el.dataset.grade) return answer(+el.dataset.grade);
  if (el.dataset.free) return freeAnswer(el.dataset.free === '1');
  if (el.dataset.back) return goBack(el.dataset.back);
  if (el.dataset.go) return go(el.dataset.go);
  switch (el.dataset.act) {
    case 'menu': openMenu(); break;
    case 'menu-close': closeMenu(); break;
    case 'ui-lang': db.settings.uiTarget = el.dataset.key === 'target'; save(); render(); break;
    case 'reveal': reveal(); break;
    case 'speak': { const f = currentFlash(); const said = f?.card && db.settings.autoSpeak && spokenText(f, true); if (said) speak(said.text, said.lang); break; }
    case 'toggle-sound': {
      const next = SOUND_MODES[(SOUND_MODES.indexOf(soundMode()) + 1) % SOUND_MODES.length];
      setSound(next);
      const msg = next === 'off' ? t('Voorlezen uit') : next === 'lang' ? t('Voorlezen: alleen {taal}', { taal: langName(curLang()) }) : t('Voorlezen: {taal} en Nederlands', { taal: langName(curLang()) });
      if (next === 'off' || !isIos) toast(msg);
      else toast(msg + '. ' + iosSilentTip(), 6000);
      render();
      break;
    }
    case 'set-sound':
      setSound(el.dataset.key); render();
      if (isIos && el.dataset.key !== 'off') toast(iosSilentTip(), 6000);
      break;
    case 'speak-text': speak(el.dataset.text, el.dataset.lang); break;
    case 'undo': undo(); break;
    case 'stats-period': statsState.period = el.dataset.key; render(); break;
    case 'stats-year': statsState.year += Number(el.dataset.step); render(); break;
    case 'set-theme':
      db.settings.theme = el.dataset.key; save(); applyTheme(); render();
      break;
    case 'skip-word': skipCurrent(); break;
    case 'remove-word': if (route().name === 'study') removeCurrent(); else removeFree(); break;
    case 'free-restart': startFree(free.deck); render(); break;
    case 'extra': {
      const n = Number(el.dataset.n) || 20;
      if (route().name === 'study') { startSession(el.dataset.id, n); render(); }
      else { session = null; addExtra(el.dataset.id, n); go('#/study/' + el.dataset.id); }
      break;
    }
    case 'set-preset': {
      const d = getDeck(el.dataset.id); const p = PRESETS[el.dataset.key]; if (!d || !p) return;
      d.opts = { ...(d.opts || {}), preset: el.dataset.key, newWords: p.newWords, maxReviews: p.maxReviews };
      save(); toast(t('{label}: {n} nieuwe woorden per dag', { label: t(p.label), n: p.newWords })); rerenderKeepScroll();
      break;
    }
    case 'sel-start': viewDeck.selecting = true; viewDeck.sel = new Set(); rerenderKeepScroll(); break;
    case 'sel-done': viewDeck.selecting = false; viewDeck.sel = new Set(); rerenderKeepScroll(); break;
    case 'sel-all': {
      const d = getDeck(el.dataset.id); if (!d) return;
      const q = (viewDeck.q || '').toLowerCase();
      const visible = d.cards.filter(x => !q || (x.term + ' ' + x.nl + ' ' + x.note).toLowerCase().includes(q));
      const all = visible.every(x => viewDeck.sel.has(x.id));
      for (const x of visible) all ? viewDeck.sel.delete(x.id) : viewDeck.sel.add(x.id);
      rerenderKeepScroll();
      break;
    }
    case 'sel-hide':
    case 'sel-show': {
      const d = getDeck(el.dataset.id); if (!d) return;
      const hide = el.dataset.act === 'sel-hide';
      const list = selected(d); list.forEach(c => { if (hide) c.hidden = true; else delete c.hidden; });
      save(); toast(hide ? tn(list.length, '{n} woord verborgen', '{n} woorden verborgen') : tn(list.length, '{n} woord weer zichtbaar', '{n} woorden weer zichtbaar'));
      viewDeck.sel = new Set(); rerenderKeepScroll();
      break;
    }
    case 'sel-del': {
      const d = getDeck(el.dataset.id); if (!d) return;
      const list = selected(d);
      if (!list.length || !confirm(tn(list.length, '{n} woord definitief verwijderen, met de voortgang? Verbergen kan ook: dan kun je het later terughalen.', '{n} woorden definitief verwijderen, met de voortgang? Verbergen kan ook: dan kun je ze later terughalen.'))) return;
      const ids = new Set(list.map(c => c.id));
      d.cards = d.cards.filter(c => !ids.has(c.id)); save();
      toast(tn(list.length, '{n} woord verwijderd', '{n} woorden verwijderd'));
      viewDeck.sel = new Set(); rerenderKeepScroll();
      break;
    }
    case 'reset-opts': {
      const d = getDeck(el.dataset.id); if (!d) return;
      if (!confirm(t('Alle tempo-instellingen van deze lijst terugzetten naar de standaard?'))) return;
      d.opts = {}; save(); toast(t('Standaardwaarden teruggezet')); render();
      break;
    }
    case 'toggle-starter': {
      // Aan: lijst toevoegen (of een eerder uitgezette lijst terugzetten, met voortgang). Uit: lijst uitzetten, voortgang blijft.
      const s = STARTERS.find(x => x.key === el.dataset.key); if (!s) return;
      let d = db.decks.find(x => x.starter === s.key);
      if (!d) { d = starterDeck(s); db.decks.push(d); toast(t('"{naam}" toegevoegd', { naam: deckName(d) })); }
      else if (d.archived) { delete d.archived; toast(t('"{naam}" staat weer aan, met je voortgang', { naam: deckName(d) })); }
      else { d.archived = true; toast(t('"{naam}" uitgezet. Je voortgang blijft bewaard.', { naam: deckName(d) })); }
      save(); rerenderKeepScroll();
      break;
    }
    case 'do-import': {
      const { out } = parseLines(document.getElementById('paste').value, document.getElementById('swap').checked);
      if (!out.length) return toast(t('Geen woorden gevonden.'));
      let d;
      if (el.dataset.id === 'new') {
        d = newDeck(document.getElementById('dname').value.trim() || t('Lijst {d}', { d: new Date().toLocaleDateString(loc()) }));
        db.decks.push(d);
      } else d = getDeck(el.dataset.id);
      const { added, dup } = addCards(d, out);
      save();
      toast(tn(added, '{n} woord toegevoegd', '{n} woorden toegevoegd') + (dup ? ', ' + tn(dup, '{n} stond er al in', '{n} stonden er al in') : ''));
      replaceWith('#/deck/' + d.id);
      break;
    }
    case 'save-card': {
      const d = getDeck(el.dataset.deck); const c = d?.cards.find(x => x.id === el.dataset.id); if (!c) return;
      const term = document.getElementById('term').value.trim(), nl = document.getElementById('nl').value.trim();
      if (!term || !nl) return toast(t('Vul {taal} en {nl} in.', { taal: langName(d.lang || 'es'), nl: nlName() }));
      c.term = term; c.nl = nl; c.note = document.getElementById('note').value.trim();
      save(); toast(t('Opgeslagen')); goBack('#/deck/' + d.id);
      break;
    }
    case 'reset-card': {
      const d = getDeck(el.dataset.deck); const c = d?.cards.find(x => x.id === el.dataset.id); if (!c) return;
      if (!confirm(t('De voortgang van dit woord wissen? Het komt terug als nieuw woord.'))) return;
      c.p = {}; save(); toast(t('Komt terug als nieuw woord'));
      break;
    }
    case 'del-card': {
      const d = getDeck(el.dataset.deck); if (!d) return;
      const c = d.cards.find(x => x.id === el.dataset.id);
      if (!c || !confirm(t('"{w}" verwijderen?', { w: c.term }))) return;
      d.cards = d.cards.filter(x => x.id !== c.id); save(); toast(t('Verwijderd')); goBack('#/deck/' + d.id);
      break;
    }
    case 'del-deck': {
      const d = getDeck(el.dataset.id); if (!d) return;
      if (!confirm(t('De lijst "{naam}" met {w} verwijderen? Dit kan niet ongedaan worden.', { naam: deckName(d), w: tn(d.cards.length, '{n} woord', '{n} woorden') }))) return;
      db.decks = db.decks.filter(x => x.id !== d.id); save(); toast(t('Lijst verwijderd')); goHome();
      break;
    }
    case 'share-deck': {
      const d = getDeck(el.dataset.id); if (!d) return;
      const txt = `# ${d.name}\n` + d.cards.map(c => [c.term, c.nl, c.note].filter((v, i) => i < 2 || v).join('\t')).join('\n') + '\n';
      shareFile(safeName(d.name) + '.txt', txt, 'text/plain');
      break;
    }
    case 'restore-copy': {
      let data = null;
      try { data = normalize(JSON.parse(localStorage.getItem(el.dataset.key))); } catch (err) { data = null; }
      if (!data) return toast(t('Deze kopie is onleesbaar.'));
      if (!confirm(t('Deze kopie terugzetten? Je huidige stand wordt eerst zelf ook als kopie bewaard.'))) return;
      storeCopy('voor-terugzetten', JSON.stringify(db), 3);
      db = data; save(); toast(t('Kopie teruggezet')); goHome();
      break;
    }
    case 'backup':
      shareFile(`woordkoffer-backup-${dayKey()}.json`, JSON.stringify(db), 'application/json');
      break;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && menuOpen) return closeMenu();
  const name = route().name;
  if (!['study', 'free', 'check'].includes(name) || e.target.matches('input,textarea,select')) return;
  const revealed = name === 'study' ? session?.revealed : free?.revealed;
  if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
  else if (revealed && name === 'study' && ['1', '2', '3', '4'].includes(e.key)) answer(+e.key);
  else if (revealed && name !== 'study' && (e.key === '1' || e.key === '2')) freeAnswer(e.key === '2');
});

// Bij het openen is dit scherm het beginpunt van de geschiedenis.
if (!history.state) history.replaceState({ d: 0 }, '');
// Bij terugkomen in de app (bijv. de volgende dag) de tellingen verversen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return audioOff();
  if (!['study', 'free', 'check'].includes(route().name)) render();
});
render();

// Anoniem tellen hoe vaak de app wordt geopend (alleen als GOATCOUNTER is ingevuld en de app online staat).
if (GOATCOUNTER && location.protocol === 'https:') {
  const sc = document.createElement('script');
  sc.async = true; sc.src = 'https://gc.zgo.at/count.js';
  sc.dataset.goatcounter = `https://${GOATCOUNTER}.goatcounter.com/count`;
  document.head.appendChild(sc);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
