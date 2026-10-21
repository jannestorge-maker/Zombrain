// Zombrain – Speicher und Gehirn-Logik. Alles bleibt im localStorage dieses Geräts.

const KEY = 'zombrain.v1';
const OPEN_SCROLL_CAP_MIN = 180; // vergessene Scroll-Timer laufen höchstens 3 h
const OVERNIGHT_HEAL = 20;
const FOCUS_HEAL_PER_MIN = 1;
const FOCUS_DONE_BONUS = 5;
const RESIST_BONUS = 3;

export const DEFAULT_APPS = ['TikTok', 'Instagram', 'YouTube', 'Snapchat', 'X', 'Reddit', 'Twitch', 'Netflix'];

function defaults() {
  const now = Date.now();
  return {
    version: 1,
    onboarded: false,
    installedAt: now,
    name: '',
    goals: [],
    apps: ['TikTok', 'Instagram', 'YouTube'],
    limitMin: 60,
    focusMin: 25,
    breakMin: 5,
    theme: 'auto',
    sound: true,
    health: 100,
    lastDay: dayKey(new Date(now)),
    session: null,
    days: {},
    schedules: [
      { id: 's1', name: 'Schlafenszeit', emoji: '😴', from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6], on: true },
      { id: 's2', name: 'Schule', emoji: '📚', from: '08:00', to: '13:00', days: [1, 2, 3, 4, 5], on: false },
      { id: 's3', name: 'Guten Morgen', emoji: '🌅', from: '06:30', to: '08:00', days: [0, 1, 2, 3, 4, 5, 6], on: false },
    ],
  };
}

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch (e) { /* privates Fenster o. ä. */ }
  return defaults();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
  listeners.forEach((fn) => fn(state));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function get() { return state; }
export function set(patch) { Object.assign(state, patch); save(); }

export function day(key = dayKey()) {
  if (!state.days[key]) {
    state.days[key] = { scroll: 0, focus: 0, resisted: 0, healthEnd: state.health, healthMin: state.health, events: [] };
  }
  return state.days[key];
}

function clamp(h) { return Math.max(0, Math.min(100, h)); }

export function decayPerMin() { return 100 / (2 * state.limitMin); }

function setHealth(h) {
  state.health = clamp(h);
  const d = day();
  d.healthEnd = Math.round(state.health * 10) / 10;
  d.healthMin = Math.min(d.healthMin ?? 100, d.healthEnd);
}

function logEvent(ev) {
  const d = day();
  d.events.push({ t: Date.now(), ...ev });
  if (d.events.length > 60) d.events.shift();
}

// Wird regelmäßig aufgerufen: neuer Tag + laufende Session verrechnen.
export function tick(now = Date.now()) {
  let changed = false;
  const today = dayKey(new Date(now));
  if (state.lastDay !== today) {
    const daysPassed = Math.max(1, Math.round((new Date(today) - new Date(state.lastDay)) / 864e5));
    state.lastDay = today;
    setHealth(state.health + OVERNIGHT_HEAL * Math.min(daysPassed, 3));
    changed = true;
  }
  const s = state.session;
  if (s) {
    const capMin = s.plannedMin ?? OPEN_SCROLL_CAP_MIN;
    const endAt = s.start + capMin * 60000;
    const until = Math.min(now, endAt);
    const mins = Math.max(0, (until - s.applied) / 60000);
    if (mins > 0) {
      const d = day();
      if (s.type === 'scroll') {
        d.scroll += mins;
        setHealth(state.health - mins * decayPerMin());
      } else {
        d.focus += mins;
        setHealth(state.health + mins * FOCUS_HEAL_PER_MIN);
      }
      s.applied = until;
      changed = true;
    }
    if (now >= endAt) {
      finishSession(true);
      changed = true;
    }
  }
  if (changed) save();
  return state;
}

function finishSession(completed) {
  const s = state.session;
  if (!s) return null;
  const min = Math.round((s.applied - s.start) / 60000);
  if (s.type === 'focus' && completed) setHealth(state.health + FOCUS_DONE_BONUS);
  logEvent({ type: s.type, app: s.app, kind: s.kind, min, completed });
  state.session = null;
  state.lastFinished = { ...s, min, completed, at: Date.now() };
  return state.lastFinished;
}

export function startScroll(app, plannedMin = null) {
  tick();
  if (state.session) finishSession(false);
  const now = Date.now();
  state.session = { type: 'scroll', app, plannedMin, start: now, applied: now };
  save();
}

export function startFocus(min, kind = 'focus') {
  tick();
  if (state.session) finishSession(false);
  const now = Date.now();
  state.session = { type: 'focus', kind, plannedMin: min, start: now, applied: now };
  save();
}

export function stopSession() {
  tick();
  const r = finishSession(false);
  save();
  return r;
}

export function resist(app) {
  tick();
  const d = day();
  d.resisted += 1;
  setHealth(state.health + RESIST_BONUS);
  logEvent({ type: 'resist', app });
  save();
}

// Projektion: Wie gesund wäre das Gehirn nach x Minuten Scrollen?
export function healthAfterScroll(min) { return clamp(state.health - min * decayPerMin()); }

function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

export function activeSchedule(date = new Date()) {
  const cur = date.getHours() * 60 + date.getMinutes();
  const dow = date.getDay();
  const yesterday = (dow + 6) % 7;
  for (const s of state.schedules) {
    if (!s.on) continue;
    const a = toMin(s.from), b = toMin(s.to);
    if (a <= b) {
      if (s.days.includes(dow) && cur >= a && cur < b) return s;
    } else {
      // über Mitternacht, z. B. 22:00–07:00
      if (s.days.includes(dow) && cur >= a) return s;
      if (s.days.includes(yesterday) && cur < b) return s;
    }
  }
  return null;
}

export function lastDays(n = 7) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    const k = dayKey(x);
    out.push({ key: k, date: x, data: state.days[k] || null });
  }
  return out;
}

// Serie: Tage am Stück unter dem Limit (heute zählt mit, solange du drunter bist)
export function streak() {
  let n = 0;
  const start = new Date(state.installedAt);
  const startKey = dayKey(start);
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    const k = dayKey(x);
    if (k < startKey) break;
    const data = state.days[k];
    const scroll = data ? data.scroll : 0;
    if (scroll <= state.limitMin) n++;
    else if (i === 0) continue; // heute schon drüber: zählt nicht, bricht aber gestern nicht ab
    else break;
  }
  return n;
}

export function exportJSON() {
  return JSON.stringify({ app: 'zombrain', exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const next = parsed && parsed.app === 'zombrain' ? parsed.state : null;
  if (!next || typeof next !== 'object' || typeof next.health !== 'number') {
    throw new Error('Das ist keine Zombrain-Backup-Datei.');
  }
  state = { ...defaults(), ...next };
  save();
}

export function reset() {
  state = defaults();
  save();
}
