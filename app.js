// Zombrain – App: Router, Screens, Timer
import * as S from './store.js';
import { brainSVG, stageOf } from './brain.js';
import { weekBars, healthLine, weekTable, fmtMin } from './stats.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const BASE_URL = new URL('./', location.href).href;
const APP_EMOJI = { TikTok: '🎵', Instagram: '📸', YouTube: '▶️', Snapchat: '👻', X: '✖️', Reddit: '👽', Twitch: '🎮', Netflix: '🍿' };
const appEmoji = (a) => APP_EMOJI[a] || '📱';

let current = null; // { name, update?, cleanup? }

/* ---------------- Helfer ---------------- */
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function sheet(html, onMount) {
  const root = $('#sheetRoot');
  root.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const bd = $('.sheet-backdrop', root);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
  document.addEventListener('keydown', onKey);
  onMount?.($('.sheet', root), close);
  $('.sheet button, .sheet input', root)?.focus({ preventScroll: true });
  return close;
}

function confetti() {
  const c = document.createElement('div');
  c.className = 'confetti';
  const colors = ['#FF6F8E', '#FFD25A', '#5CC98C', '#6FB6FF', '#C59BFF'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
    p.style.animationDelay = Math.random() * 0.4 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.appendChild(p);
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 3800);
}

let audioCtx;
function chime(kind = 'good') {
  if (!S.get().sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'good' ? [523.25, 659.25, 783.99, 1046.5] : [392, 311.13];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = audioCtx.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.45);
    });
  } catch (e) { /* kein Audio */ }
  try { navigator.vibrate?.(kind === 'good' ? [80, 60, 80, 60, 160] : [200]); } catch (e) { /* egal */ }
}

function clock(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* nicht unterstützt */ }
}

function applyTheme() {
  const t = S.get().theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

// Gehirn nur neu zeichnen, wenn sich die gerundete Gesundheit ändert (sonst starten Animationen neu)
function paintBrain(el, h, opts) {
  if (!el) return;
  const key = Math.round(h) + (opts?.still ? 's' : '');
  if (el.dataset.h === key) return;
  el.dataset.h = key;
  el.innerHTML = brainSVG(h, opts);
}

function meterHTML(h) {
  return `<div class="meter" aria-hidden="true">
      <div class="meter-track"><div class="meter-knob" style="left:${h}%">${stageOf(h).emoji}</div></div>
      <div class="meter-labels"><span>🧟 Voll verrottet</span><span>Gesund ✨</span></div>
    </div>`;
}

/* ---------------- Router ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, qs] = raw.split('?');
  return { name, params: new URLSearchParams(qs || '') };
}

const ROUTES = { home: Home, focus: Focus, schedule: Schedule, stats: Stats, settings: Settings, warn: Warn, onboarding: Onboarding };

function render() {
  S.tick();
  let { name, params } = parseHash();
  if (!ROUTES[name]) name = 'home';
  if (!S.get().onboarded && name !== 'warn' && name !== 'onboarding') {
    location.replace('#/onboarding');
    return;
  }
  current?.cleanup?.();
  document.body.classList.toggle('no-nav', name === 'warn' || name === 'onboarding');
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
  $$('.nav a').forEach((a) => (a.dataset.tab === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  view.innerHTML = '';
  current = { name, ...(ROUTES[name](params) || {}) };
  paintBrain($('#navBrain'), S.get().health, { still: true, title: '' });
  window.scrollTo(0, 0);
}

/* ---------------- Home ---------------- */
function Home() {
  const st = S.get();
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hey' : 'Guten Abend';
  view.innerHTML = `
    <div class="page-head">
      <div>
        <div class="sub">${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>${greet}${st.name ? ', ' + esc(st.name) : ''}! 👋</h1>
      </div>
      <button class="icon-btn" id="streakBtn" title="Serie" aria-label="Serie"><span id="streakTxt">🔥</span></button>
    </div>
    <div class="home-grid">
      <section class="card hero" id="hero">
        <div class="brain-wrap" id="hb"></div>
        <div class="pct" id="hp"></div>
        <div class="stage" id="hs"></div>
        <div class="msg" id="hm"></div>
        <div id="hmeter"></div>
      </section>
      <div class="stack">
        <div id="sched"></div>
        <div id="live"></div>
        <button class="btn block" id="scrollBtn">📱 Ich scrolle jetzt</button>
        <button class="btn good block" id="detoxBtn">🧘 Detox starten</button>
        <div class="grid2">
          <div class="tile"><div class="k">📱 Heute gescrollt</div><div class="v" id="tScroll"></div><div class="bar" id="tBar"><i></i></div></div>
          <div class="tile"><div class="k">🧘 Fokus heute</div><div class="v" id="tFocus"></div></div>
          <div class="tile"><div class="k">💪 Nein gesagt</div><div class="v" id="tRes"></div></div>
          <div class="tile"><div class="k">🔥 Serie unterm Limit</div><div class="v" id="tStreak"></div></div>
        </div>
      </div>
    </div>`;

  $('#scrollBtn').onclick = () => pickScroll();
  $('#detoxBtn').onclick = () => { location.hash = '#/focus'; };
  $('#streakBtn').onclick = () => toast(`🔥 ${S.streak()} Tage am Stück unter deinem Limit`);

  let lastMeter = null;
  function update() {
    const st = S.get();
    const h = st.health;
    const sg = stageOf(h);
    const s = st.session;
    const hero = $('#hero');
    hero.classList.toggle('scrolling', s?.type === 'scroll');
    hero.classList.toggle('focusing', s?.type === 'focus');
    $('#hb').classList.toggle('rotting', s?.type === 'scroll');
    $('#hb').classList.toggle('healing', s?.type === 'focus');
    paintBrain($('#hb'), h);
    $('#hp').textContent = `${Math.round(h)}%`;
    $('#hs').textContent = `${sg.emoji} ${sg.label}`;
    $('#hm').textContent = s?.type === 'scroll' ? 'Du scrollst gerade … dein Gehirn verrottet live 😵' : s?.type === 'focus' ? 'Dein Gehirn heilt gerade 🌱' : sg.msg;
    if (lastMeter !== Math.round(h)) { $('#hmeter').innerHTML = meterHTML(h); lastMeter = Math.round(h); }

    const d = S.day();
    $('#tScroll').innerHTML = `${Math.round(d.scroll)}<small> / ${st.limitMin} min</small>`;
    const pct = Math.min(100, (d.scroll / st.limitMin) * 100);
    $('#tBar i').style.width = pct + '%';
    $('#tBar').classList.toggle('over', d.scroll > st.limitMin);
    $('#tFocus').innerHTML = `${Math.round(d.focus)}<small> min</small>`;
    $('#tRes').innerHTML = `${d.resisted}<small>×</small>`;
    const sk = S.streak();
    $('#tStreak').innerHTML = `${sk}<small> ${sk === 1 ? 'Tag' : 'Tage'}</small>`;
    $('#streakTxt').textContent = sk > 0 ? `🔥` : '🧠';

    const sch = S.activeSchedule();
    $('#sched').innerHTML = sch ? `<div class="notice"><span class="e">${esc(sch.emoji)}</span><div>${esc(sch.name)} ist aktiv<div class="tiny">bis ${esc(sch.to)} Uhr · Handy weg!</div></div></div>` : '';

    const live = $('#live');
    if (!s) {
      if (live.dataset.k !== 'none') { live.innerHTML = ''; live.dataset.k = 'none'; }
      $('#scrollBtn').hidden = false;
      return;
    }
    $('#scrollBtn').hidden = s.type === 'scroll';
    const elapsed = Date.now() - s.start;
    const remaining = s.plannedMin ? s.plannedMin * 60000 - elapsed : null;
    const key = s.type + s.start;
    if (live.dataset.k !== key) {
      live.dataset.k = key;
      if (s.type === 'scroll') {
        live.innerHTML = `<div class="live scroll"><span class="dot"></span><div class="grow">
            <div class="t"><b>${appEmoji(s.app)} ${esc(s.app)}</b> · ${s.plannedMin ? `${s.plannedMin}-Min-Timer` : 'ohne Limit'}</div>
            <div class="clock" id="lc"></div></div>
            <button class="btn small" id="stopBtn">Stopp</button></div>`;
        $('#stopBtn').onclick = () => {
          const r = S.stopSession();
          toast(`Stark! ${fmtMin(r?.min || 0)} gescrollt. Gestoppt ✋`);
          update();
        };
      } else {
        live.innerHTML = `<a class="live focus" href="#/focus" style="text-decoration:none"><span class="dot"></span><div class="grow">
            <div class="t"><b>${s.kind === 'detox' ? '📵 Detox' : '🧘 Fokus'}</b> läuft · Gehirn heilt</div>
            <div class="clock" id="lc"></div></div><span class="btn small good">Öffnen</span></a>`;
      }
    }
    const lc = $('#lc');
    if (lc) lc.textContent = remaining != null ? `${clock(remaining)} übrig` : clock(elapsed);
  }
  update();
  return { update };
}

function pickScroll(appPreset) {
  const st = S.get();
  let app = appPreset || st.apps[0] || 'TikTok';
  let mins = 15;
  sheet(`
    <h2>📱 Was scrollst du?</h2>
    <p class="muted small" style="margin:6px 0 14px">Ehrlich sein! Dein Gehirn verrottet, solange der Timer läuft.</p>
    <div class="chips" id="appChips">${[...new Set([...st.apps, 'Anderes'])].map((a) => `<button class="chip" data-app="${esc(a)}" aria-pressed="${a === app}">${appEmoji(a)} ${esc(a)}</button>`).join('')}</div>
    <h3 style="margin:20px 0 10px">Wie lange?</h3>
    <div class="chips" id="minChips">${[5, 15, 30, 60, 0].map((m) => `<button class="chip" data-min="${m}" aria-pressed="${m === mins}">${m ? m + ' min' : 'Ohne Limit'}</button>`).join('')}</div>
    <p class="tiny" id="cost" style="margin-top:14px"></p>
    <div class="stack" style="margin-top:16px">
      <button class="btn block" id="go">Timer starten</button>
      <button class="btn link block" id="cancel">Doch nicht 💪</button>
    </div>`, (el, close) => {
    const cost = () => {
      const m = mins || 30;
      const after = S.healthAfterScroll(m);
      $('#cost', el).textContent = `${mins ? m : 'Pro 30'} Minuten = ca. −${Math.round(S.get().health - after)}% Gehirn. ${stageOf(after).emoji}`;
    };
    $$('#appChips .chip', el).forEach((b) => b.onclick = () => { app = b.dataset.app; $$('#appChips .chip', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
    $$('#minChips .chip', el).forEach((b) => b.onclick = () => { mins = +b.dataset.min; $$('#minChips .chip', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); cost(); });
    cost();
    $('#go', el).onclick = () => {
      S.startScroll(app, mins || null);
      close();
      chime('bad');
      toast(`Timer läuft. Viel Spaß … dein Gehirn leidet 😵`);
      if (current?.name !== 'home') location.hash = '#/home'; else current.update?.();
    };
    $('#cancel', el).onclick = () => { S.resist(app); close(); confetti(); chime('good'); toast('💪 Stark! +3% fürs Gehirn'); current?.update?.(); };
  });
}

/* ---------------- Fokus / Detox ---------------- */
function Focus() {
  const st = S.get();
  let kind = 'focus';
  let mins = st.focusMin;
  view.innerHTML = `
    <div class="page-head"><div><div class="sub">Gehirn heilen</div><h1>Fokus & Detox</h1></div></div>
    <div class="wide-grid">
      <section class="card" style="text-align:center">
        <div class="seg" role="group" aria-label="Modus" id="seg">
          <button data-k="focus" aria-pressed="true">🧘 Fokus</button>
          <button data-k="detox" aria-pressed="false">📵 Detox</button>
        </div>
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="90" fill="none" stroke="var(--bg-2)" stroke-width="12"/>
            <circle id="ringArc" cx="100" cy="100" r="90" fill="none" stroke="var(--focus)" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="565.5" stroke-dashoffset="565.5" style="transition:stroke-dashoffset 1s linear"/>
          </svg>
          <div class="ring-brain healing" id="fb"></div>
        </div>
        <div class="ring-time" id="ft"></div>
        <p class="muted" id="fsub" style="margin-top:6px"></p>
        <div id="durWrap" style="margin-top:16px">
          <div class="chips" id="dur" style="justify-content:center">${[5, 15, 25, 45, 60].map((m) => `<button class="chip" data-m="${m}" aria-pressed="${m === mins}">${m} min</button>`).join('')}</div>
        </div>
        <div class="stack" style="margin-top:18px">
          <button class="btn good block" id="fStart">Start</button>
          <button class="btn ghost block" id="fStop" hidden>Aufhören</button>
        </div>
      </section>
      <div class="stack">
        <div class="card stack">
          <h3>So heilst du dein Gehirn</h3>
          <p class="muted">🧘 <b>Fokus:</b> Lernen, Hausaufgaben, Lesen. Pomodoro-Style: 25 Minuten konzentriert, dann Pause.</p>
          <p class="muted">📵 <b>Detox:</b> Handy weglegen und etwas ohne Bildschirm machen: rausgehen, Sport, Freunde.</p>
          <p class="muted">🌱 <b>+1% pro Minute</b> und <b>+5% Bonus</b>, wenn du den Timer durchziehst.</p>
        </div>
        <div class="tile"><div class="k">🧠 Gehirn jetzt</div><div class="v" id="fH"></div></div>
      </div>
    </div>`;

  const setKind = (k) => {
    kind = k;
    $$('#seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === k));
    update();
  };
  $$('#seg button').forEach((b) => b.onclick = () => { if (!S.get().session || S.get().session.type !== 'focus') setKind(b.dataset.k); });
  $$('#dur .chip').forEach((b) => b.onclick = () => {
    mins = +b.dataset.m;
    $$('#dur .chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
    S.set({ focusMin: mins });
    update();
  });
  $('#fStart').onclick = () => {
    if (S.get().session?.type === 'scroll') toast('📱 Scroll-Timer gestoppt. Jetzt wird geheilt!');
    S.startFocus(mins, kind);
    keepAwake(true);
    chime('good');
    update();
  };
  $('#fStop').onclick = () => {
    const r = S.stopSession();
    keepAwake(false);
    toast(`Okay! ${fmtMin(r?.min || 0)} geschafft – zählt trotzdem 🌱`);
    update();
  };

  function update() {
    const st = S.get();
    const s = st.session?.type === 'focus' ? st.session : null;
    const running = !!s;
    if (running) kind = s.kind || 'focus';
    $$('#seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === kind));
    const total = (running ? s.plannedMin : mins) * 60000;
    const elapsed = running ? Date.now() - s.start : 0;
    $('#ft').textContent = clock(total - elapsed);
    $('#ringArc').style.strokeDashoffset = String(565.5 * (1 - Math.min(1, elapsed / total)));
    $('#fsub').textContent = running
      ? (kind === 'detox' ? 'Handy weg! Dein Gehirn regeneriert … 🌱' : 'Konzentrier dich! Dein Gehirn heilt … 🌱')
      : `+${Math.round((total / 60000) * 1 + 5)}% Gehirn, wenn du durchhältst`;
    $('#durWrap').hidden = running;
    $('#fStart').hidden = running;
    $('#fStop').hidden = !running;
    $('#fStart').textContent = kind === 'detox' ? '📵 Detox starten' : '🧘 Fokus starten';
    $('#fH').innerHTML = `${Math.round(st.health)}<small>% · ${stageOf(st.health).label}</small>`;
    paintBrain($('#fb'), st.health);
    if (running) keepAwake(true);
  }
  update();
  return { update, cleanup: () => keepAwake(false) };
}

/* ---------------- Zeitplan ---------------- */
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
function daysLabel(days) {
  if (days.length === 7) return 'Jeden Tag';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Mo–Fr';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Wochenende';
  return WD_ORDER.filter((d) => days.includes(d)).map((d) => WD[d]).join(', ') || 'Nie';
}

function Schedule() {
  view.innerHTML = `
    <div class="page-head"><div><div class="sub">Handy-freie Zeiten</div><h1>Zeitplan</h1></div>
      <button class="btn small" id="add">＋ Neu</button></div>
    <div class="wide-grid">
      <div class="list" id="list"></div>
      <div class="card stack">
        <h3>🛡️ Was bringt das?</h3>
        <p class="muted">Während einer Sperrzeit ist der Warnbildschirm strenger: Du musst <b>10 Sekunden warten</b>, bevor du scrollen darfst. Und auf der Startseite siehst du, dass gerade Handy-Pause ist.</p>
        <p class="tiny">Hinweis: Eine Web-App kann andere Apps nicht wirklich sperren. Mit dem iPhone-Kurzbefehl (unter „Mehr“) springt aber beim Öffnen von TikTok & Co. automatisch der Warnbildschirm auf.</p>
      </div>
    </div>`;
  const draw = () => {
    const st = S.get();
    const active = S.activeSchedule();
    $('#list').innerHTML = st.schedules.map((s) => `
      <div class="item ${s.on ? '' : 'off'}">
        <span class="e">${esc(s.emoji)}</span>
        <button class="grow" data-edit="${s.id}" style="all:unset;cursor:pointer;flex:1;min-width:0">
          <div class="t">${esc(s.name)} ${active?.id === s.id ? '<span class="tiny" style="color:var(--focus);font-weight:800">● jetzt aktiv</span>' : ''}</div>
          <div class="muted small">${esc(s.from)}–${esc(s.to)} · ${daysLabel(s.days)}</div>
        </button>
        <label class="switch" aria-label="${esc(s.name)} an/aus"><input type="checkbox" data-tog="${s.id}" ${s.on ? 'checked' : ''}><span></span></label>
      </div>`).join('') || '<p class="muted">Noch keine Zeitpläne.</p>';
    $$('[data-tog]').forEach((i) => i.onchange = () => {
      const s = S.get().schedules.find((x) => x.id === i.dataset.tog);
      s.on = i.checked;
      S.save();
      draw();
    });
    $$('[data-edit]').forEach((b) => b.onclick = () => edit(S.get().schedules.find((x) => x.id === b.dataset.edit)));
  };
  const edit = (sch) => {
    const isNew = !sch;
    const s = sch ? { ...sch, days: [...sch.days] } : { id: 's' + Date.now(), name: '', emoji: '🌙', from: '20:00', to: '21:00', days: [1, 2, 3, 4, 5], on: true };
    sheet(`
      <h2>${isNew ? 'Neue Sperrzeit' : 'Sperrzeit bearbeiten'}</h2>
      <div class="stack" style="margin-top:14px">
        <div class="chips" id="em">${['😴', '📚', '🌅', '🍽️', '⚽', '🎮', '🌙', '🧘'].map((e) => `<button class="chip" data-e="${e}" aria-pressed="${e === s.emoji}">${e}</button>`).join('')}</div>
        <label class="field">Name<input class="input" id="nm" maxlength="30" value="${esc(s.name)}" placeholder="z. B. Hausaufgaben"></label>
        <div class="grid2">
          <label class="field">Von<input class="input" type="time" id="fr" value="${esc(s.from)}"></label>
          <label class="field">Bis<input class="input" type="time" id="to" value="${esc(s.to)}"></label>
        </div>
        <div><div class="field" style="margin-bottom:8px">Tage</div>
          <div class="days" id="dd">${WD_ORDER.map((d) => `<button data-d="${d}" aria-pressed="${s.days.includes(d)}">${WD[d]}</button>`).join('')}</div></div>
        <button class="btn block" id="sv">Speichern</button>
        ${isNew ? '' : '<button class="btn link block" id="del">Löschen</button>'}
      </div>`, (el, close) => {
      $$('#em .chip', el).forEach((b) => b.onclick = () => { s.emoji = b.dataset.e; $$('#em .chip', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
      $$('#dd button', el).forEach((b) => b.onclick = () => {
        const d = +b.dataset.d;
        s.days = s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d];
        b.setAttribute('aria-pressed', s.days.includes(d));
      });
      $('#sv', el).onclick = () => {
        s.name = $('#nm', el).value.trim() || 'Sperrzeit';
        s.from = $('#fr', el).value || '20:00';
        s.to = $('#to', el).value || '21:00';
        const list = S.get().schedules;
        if (isNew) list.push(s); else list.splice(list.findIndex((x) => x.id === s.id), 1, s);
        S.save();
        close();
        draw();
        toast('Gespeichert ✅');
      };
      $('#del', el)?.addEventListener('click', () => {
        S.set({ schedules: S.get().schedules.filter((x) => x.id !== s.id) });
        close();
        draw();
      });
    });
  };
  $('#add').onclick = () => edit(null);
  draw();
  return { update: () => {} };
}

/* ---------------- Statistik ---------------- */
function Stats() {
  const st = S.get();
  const days = S.lastDays(7);
  const sum = (k) => days.reduce((a, d) => a + (d.data?.[k] || 0), 0);
  const used = days.filter((d) => d.data).length || 1;
  const best = days.slice(0, -1).filter((d) => d.data).sort((a, b) => a.data.scroll - b.data.scroll)[0];
  view.innerHTML = `
    <div class="page-head"><div><div class="sub">Letzte 7 Tage</div><h1>Statistik</h1></div></div>
    <div class="grid2" style="margin-bottom:14px">
      <div class="tile"><div class="k">📱 Ø Scrollen pro Tag</div><div class="v">${fmtMin(sum('scroll') / used)}</div></div>
      <div class="tile"><div class="k">🧘 Fokus gesamt</div><div class="v">${fmtMin(sum('focus'))}</div></div>
      <div class="tile"><div class="k">🔥 Serie unterm Limit</div><div class="v">${S.streak()}<small> Tage</small></div></div>
      <div class="tile"><div class="k">💪 Nein gesagt</div><div class="v">${sum('resisted')}<small>×</small></div></div>
    </div>
    <div class="wide-grid">
      <section class="card stack">
        <div class="row spread wrap"><h3>Scrollen vs. Fokus</h3>
          <div class="legend"><span><i style="background:var(--c-scroll)"></i>Scrollen</span><span><i style="background:var(--c-focus)"></i>Fokus</span></div></div>
        <div class="chart-box" id="c1"></div>
        <details><summary class="tiny" style="cursor:pointer">Als Tabelle anzeigen</summary><div style="margin-top:10px">${weekTable(days)}</div></details>
      </section>
      <section class="card stack">
        <h3>🧠 Gehirn am Tagesende</h3>
        <div class="chart-box" id="c2"></div>
        ${best ? `<p class="muted small">🏆 Bester Tag: <b>${best.date.toLocaleDateString('de-DE', { weekday: 'long' })}</b> mit nur ${fmtMin(best.data.scroll)} Scrollen.</p>` : ''}
      </section>
    </div>
    <h2 class="section-title">Heute</h2>
    <div class="list" id="ev"></div>`;
  const drawCharts = () => { weekBars($('#c1'), days, st.limitMin); healthLine($('#c2'), days); };
  drawCharts();
  let rt;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(drawCharts, 150); };
  window.addEventListener('resize', onResize);
  const evs = [...(S.day().events || [])].reverse();
  $('#ev').innerHTML = evs.length ? evs.map((e) => {
    const t = new Date(e.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const txt = e.type === 'scroll' ? `${appEmoji(e.app)} ${esc(e.app)} gescrollt · ${fmtMin(e.min)}`
      : e.type === 'focus' ? `${e.kind === 'detox' ? '📵 Detox' : '🧘 Fokus'} · ${fmtMin(e.min)}${e.completed ? ' ✅' : ''}`
      : `💪 ${esc(e.app || 'Scrollen')} widerstanden`;
    return `<div class="item"><span class="tiny" style="width:42px">${t}</span><div class="grow">${txt}</div></div>`;
  }).join('') : '<p class="muted">Heute noch nichts passiert. Dein Gehirn chillt. 😌</p>';
  return { update: () => {}, cleanup: () => window.removeEventListener('resize', onResize) };
}

/* ---------------- Mehr / Einstellungen ---------------- */
function Settings() {
  const st = S.get();
  const allApps = [...new Set([...S.DEFAULT_APPS, ...st.apps])];
  const warnUrl = (a) => `${BASE_URL}#/warn?app=${encodeURIComponent(a)}`;
  view.innerHTML = `
    <div class="page-head"><div><div class="sub">Einstellungen</div><h1>Mehr</h1></div></div>
    <div class="wide-grid">
      <div class="stack">
        <section class="card stack">
          <label class="field">Dein Name<input class="input" id="nm" maxlength="24" value="${esc(st.name)}" placeholder="Wie soll ich dich nennen?"></label>
          <div>
            <div class="row spread"><span class="field">Tageslimit fürs Scrollen</span><b id="limV">${fmtMin(st.limitMin)}</b></div>
            <input type="range" id="lim" min="15" max="240" step="15" value="${st.limitMin}" aria-label="Tageslimit">
            <p class="tiny">Bei doppeltem Limit ist dein Gehirn ein kompletter Zombie.</p>
          </div>
          <div>
            <div class="field" style="margin-bottom:8px">Apps, die du im Blick behalten willst</div>
            <div class="chips" id="apps">${allApps.map((a) => `<button class="chip" data-a="${esc(a)}" aria-pressed="${st.apps.includes(a)}">${appEmoji(a)} ${esc(a)}</button>`).join('')}<button class="chip add" id="addApp">＋ Eigene</button></div>
          </div>
          <div>
            <div class="field" style="margin-bottom:8px">Aussehen</div>
            <div class="seg" id="theme">${[['auto', '🌗 Auto'], ['light', '☀️ Hell'], ['dark', '🌙 Dunkel']].map(([k, l]) => `<button data-t="${k}" aria-pressed="${st.theme === k}">${l}</button>`).join('')}</div>
          </div>
          <div class="row spread"><span class="field">🔔 Töne & Vibration</span><label class="switch"><input type="checkbox" id="snd" ${st.sound ? 'checked' : ''}><span></span></label></div>
        </section>

        <details class="card" open>
          <summary>📲 Als App installieren</summary>
          <div class="stack" style="margin-top:12px">
            <p><b>iPhone/iPad (Safari):</b> Teilen-Knopf ⬆️ → „Zum Home-Bildschirm“.</p>
            <p class="tiny">Tipp fürs iPhone: Wenn du den Kurzbefehl unten nutzt, schalte beim Hinzufügen <b>„Als Web-App öffnen“ aus</b> (falls dein iPhone den Schalter zeigt). Dann teilen Home-Bildschirm-Icon und Warnbildschirm dieselben Daten, weil beide in Safari laufen.</p>
            <p><b>Android (Chrome):</b> Menü ⋮ → „App installieren“ / „Zum Startbildschirm“.</p>
            <p><b>PC/Mac (Chrome, Edge):</b> In der Adressleiste auf das Installieren-Symbol ⊕ klicken.</p>
          </div>
        </details>
      </div>

      <div class="stack">
        <details class="card">
          <summary>⚡ iPhone-Kurzbefehl: Warnung beim Öffnen von TikTok & Co.</summary>
          <div class="stack" style="margin-top:12px">
            <ol class="steps">
              <li>Öffne die App <b>Kurzbefehle</b> → unten <b>Automation</b> → <b>＋</b>.</li>
              <li>Wähle <b>App</b> → bei „App“ z. B. <b>TikTok</b> auswählen → <b>Wird geöffnet</b> anhaken.</li>
              <li>Wähle <b>Nach Bestätigung ausführen</b> (sanft) oder <b>Sofort ausführen</b> (streng) → Weiter.</li>
              <li>Neue leere Automation → Aktion <b>URL öffnen</b> hinzufügen.</li>
              <li>Diese Adresse einfügen (für jede App eine eigene Automation):</li>
            </ol>
            <div class="list" id="urls">${st.apps.map((a) => `<div><div class="tiny" style="margin-bottom:4px">${appEmoji(a)} ${esc(a)}</div><div class="row"><div class="code grow">${esc(warnUrl(a))}</div><button class="btn small ghost" data-copy="${esc(warnUrl(a))}">Kopieren</button></div></div>`).join('')}</div>
            <p class="tiny"><b>Sanft</b> = es kommt eine Mitteilung, die du antippst. <b>Streng</b> = Zombrain springt jedes Mal sofort auf, auch wenn du zurück zu TikTok wechselst. Zum Scrollen musst du die Automation dann kurz ausschalten. Genau das ist der Sinn 😈</p>
            <p class="tiny"><b>Android:</b> Mit der kostenlosen App <b>MacroDroid</b> geht das Gleiche: Auslöser „App gestartet“ → Aktion „Webseite öffnen“ mit derselben Adresse.</p>
            <a class="btn small ghost" href="#/warn?app=${encodeURIComponent(st.apps[0] || 'TikTok')}">Warnbildschirm testen</a>
          </div>
        </details>

        <section class="card stack">
          <h3>💾 Backup</h3>
          <p class="muted small">Deine Daten liegen nur auf diesem Gerät. Mit einer Backup-Datei kannst du sie sichern oder auf ein anderes Gerät mitnehmen.</p>
          <div class="row wrap">
            <button class="btn small ghost" id="exp">⬇️ Exportieren</button>
            <label class="btn small ghost" style="cursor:pointer">⬆️ Importieren<input type="file" id="imp" accept="application/json,.json" hidden></label>
          </div>
        </section>

        <section class="card stack">
          <h3>🧪 Neu anfangen</h3>
          <div class="row wrap">
            <button class="btn small ghost" id="heal">✨ Gehirn auf 100%</button>
            <button class="btn small ghost" id="onb">👋 Einführung nochmal</button>
            <button class="btn small ghost" id="rst" style="color:var(--accent)">🗑️ Alles löschen</button>
          </div>
        </section>

        <p class="tiny" style="padding:0 6px">Zombrain ist ein privates Hobbyprojekt. Es hat nichts mit anderen Screen-Time-Apps zu tun und sammelt keine Daten.</p>
      </div>
    </div>`;

  $('#nm').onchange = (e) => S.set({ name: e.target.value.trim() });
  $('#lim').oninput = (e) => { $('#limV').textContent = fmtMin(+e.target.value); };
  $('#lim').onchange = (e) => { S.set({ limitMin: +e.target.value }); toast('Limit gespeichert ✅'); };
  const bindApps = () => $$('#apps .chip[data-a]').forEach((b) => b.onclick = () => {
    const a = b.dataset.a;
    const apps = S.get().apps.includes(a) ? S.get().apps.filter((x) => x !== a) : [...S.get().apps, a];
    S.set({ apps });
    b.setAttribute('aria-pressed', apps.includes(a));
  });
  bindApps();
  $('#addApp').onclick = () => {
    const name = (prompt('Name der App?') || '').trim().slice(0, 20);
    if (!name) return;
    S.set({ apps: [...new Set([...S.get().apps, name])] });
    render();
  };
  $$('#theme button').forEach((b) => b.onclick = () => {
    S.set({ theme: b.dataset.t });
    applyTheme();
    $$('#theme button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  });
  $('#snd').onchange = (e) => S.set({ sound: e.target.checked });
  $$('[data-copy]').forEach((b) => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Kopiert 📋'); } catch (e) { toast('Kopieren ging nicht. Bitte markieren.'); }
  });
  $('#exp').onclick = () => {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zombrain-backup-${S.dayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  $('#imp').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      S.importJSON(await f.text());
      applyTheme();
      toast('Backup geladen ✅');
      render();
    } catch (err) { toast('❌ ' + err.message); }
  };
  $('#heal').onclick = () => { S.set({ health: 100 }); confetti(); toast('✨ Frisches Gehirn!'); };
  $('#onb').onclick = () => { S.set({ onboarded: false }); location.hash = '#/onboarding'; };
  $('#rst').onclick = () => {
    if (confirm('Wirklich alles löschen? Statistik, Zeitpläne und Einstellungen sind dann weg.')) {
      S.reset();
      applyTheme();
      location.hash = '#/onboarding';
    }
  };
  return { update: () => {} };
}

/* ---------------- Warnbildschirm ---------------- */
function Warn(params) {
  const app = (params.get('app') || 'Scrollen').slice(0, 30);
  const st = S.get();
  const sch = S.activeSchedule();
  const h = st.health;
  const after = S.healthAfterScroll(15);
  let wait = sch ? 10 : 0;
  view.innerHTML = `
    <div class="warn">
      <div class="brain-wrap rotting" id="wb"></div>
      <h1>Willst du wirklich ${esc(app)} öffnen?</h1>
      <p class="muted">15 Minuten ${esc(app)} kosten dein Gehirn ca. <b>${Math.round(h - after)}%</b>.</p>
      <div class="compare" aria-label="Gehirn jetzt und nach 15 Minuten">
        <div class="mini" id="m1"></div><div><div class="arrow">→</div><div class="tiny">15 min</div></div><div class="mini" id="m2"></div>
      </div>
      ${sch ? `<div class="strict">${esc(sch.emoji)} ${esc(sch.name)} ist gerade aktiv (bis ${esc(sch.to)} Uhr). Eigentlich ist ${esc(app)} jetzt tabu!</div>` : ''}
      <button class="btn good block" id="no">💪 Nein, ich bleib stark</button>
      <div class="opts">
        <button class="btn ghost" data-m="5">5 min scrollen</button>
        <button class="btn ghost" data-m="15">15 min scrollen</button>
      </div>
      <button class="btn link" data-m="0" id="free">Einfach scrollen (ohne Timer)</button>
      <p class="tiny" id="waitTxt"></p>
    </div>`;
  paintBrain($('#wb'), h);
  paintBrain($('#m1'), h, { still: true });
  paintBrain($('#m2'), after, { still: true });

  const scrollBtns = $$('[data-m]');
  const tickWait = () => {
    scrollBtns.forEach((b) => (b.disabled = wait > 0));
    $('#waitTxt').textContent = wait > 0 ? `⏳ Sperrzeit: Warte noch ${wait} Sekunden …` : '';
  };
  tickWait();
  const iv = wait ? setInterval(() => { wait--; tickWait(); if (wait <= 0) clearInterval(iv); }, 1000) : null;

  const done = (html) => {
    view.innerHTML = `<div class="warn">${html}</div>`;
  };
  $('#no').onclick = () => {
    S.resist(app);
    chime('good');
    confetti();
    done(`<div class="brain-wrap healing" id="wb2"></div>
      <h1>Stark! 💪</h1>
      <p class="muted">+3% fürs Gehirn. Du hast heute schon <b>${S.day().resisted}×</b> Nein gesagt.</p>
      <a class="btn good block" href="#/home">Zu meinem Gehirn</a>
      <p class="tiny">Du kannst diesen Tab jetzt auch einfach schließen.</p>`);
    paintBrain($('#wb2'), S.get().health);
  };
  scrollBtns.forEach((b) => b.onclick = () => {
    const m = +b.dataset.m;
    S.startScroll(app, m || null);
    chime('bad');
    done(`<div class="brain-wrap rotting" id="wb2"></div>
      <h1>Timer läuft ⏱️</h1>
      <p class="muted">${m ? `${m} Minuten` : 'Ohne Limit'} ${esc(app)}. Wechsle jetzt zurück zu ${esc(app)}.</p>
      <p class="muted">Komm danach wieder und drück <b>Stopp</b>, sonst verrottet dein Gehirn weiter. 🧟</p>
      <a class="btn block" href="#/home">Zur Startseite</a>`);
    paintBrain($('#wb2'), S.get().health);
  });
  return { cleanup: () => iv && clearInterval(iv) };
}

/* ---------------- Onboarding ---------------- */
const GOALS = [['sleep', '😴 Besser schlafen'], ['focus', '🎯 Mehr Fokus'], ['stress', '😌 Weniger Stress'], ['school', '📚 Schule & Lernen'], ['sport', '🏃 Mehr bewegen'], ['friends', '🫂 Mehr Zeit mit Freunden'], ['creative', '🎨 Kreativ sein']];

function Onboarding() {
  const st = S.get();
  let step = 0;
  let hours = 4;
  const goals = new Set(st.goals);
  const apps = new Set(st.apps);
  let limit = st.limitMin;
  const N = 5;

  const draw = () => {
    const dots = `<div class="dots">${Array.from({ length: N }, (_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
    const back = step > 0 ? '<button class="btn link" id="back">Zurück</button>' : '';
    let body = '', next = 'Weiter';
    if (step === 0) {
      body = `<div class="brain-wrap" id="ob"></div>
        <h1>Hi! Ich bin dein Gehirn 🧠</h1>
        <p class="muted">Jedes Mal, wenn du zu lange scrollst, verrotte ich ein bisschen. Mit Fokus und Pausen werde ich wieder fit. Hilf mir!</p>`;
      next = 'Los geht’s';
    } else if (step === 1) {
      body = `<div class="brain-wrap" id="ob"></div>
        <h2>Wie viele Stunden scrollst du am Tag?</h2>
        <div class="big" id="hv"></div>
        <input type="range" id="hr" min="0" max="8" step="0.5" value="${hours}" aria-label="Stunden pro Tag">
        <p class="muted" id="fact"></p>`;
    } else if (step === 2) {
      body = `<h1>Was willst du ändern?</h1>
        <p class="muted">Wähl alles aus, was passt.</p>
        <div class="chips" id="gl">${GOALS.map(([k, l]) => `<button class="chip" data-g="${k}" aria-pressed="${goals.has(k)}">${l}</button>`).join('')}</div>`;
    } else if (step === 3) {
      body = `<h1>Welche Apps fressen dein Gehirn?</h1>
        <div class="chips" id="ap">${S.DEFAULT_APPS.map((a) => `<button class="chip" data-a="${a}" aria-pressed="${apps.has(a)}">${appEmoji(a)} ${a}</button>`).join('')}</div>
        <h2 style="margin-top:12px">Dein Tageslimit</h2>
        <div class="big" id="lv">${fmtMin(limit)}</div>
        <input type="range" id="lim" min="15" max="240" step="15" value="${limit}" aria-label="Tageslimit">
        <p class="tiny">Bei doppeltem Limit bin ich ein kompletter Zombie 🧟</p>`;
    } else {
      body = `<div class="brain-wrap" id="ob"></div>
        <h1>Fast fertig!</h1>
        <label class="field" style="text-align:left">Wie soll ich dich nennen?<input class="input" id="nm" maxlength="24" value="${esc(st.name)}" placeholder="Dein Name (optional)"></label>`;
      next = 'Fertig 🎉';
    }
    view.innerHTML = `<div class="ob">${dots}<div class="ob-body">${body}</div><div class="ob-foot"><button class="btn block" id="next">${next}</button>${back}</div></div>`;

    const ob = $('#ob');
    if (step === 1) {
      const upd = () => {
        $('#hv').textContent = `${String(hours).replace('.', ',')} h`;
        const years = (hours * 60) / 24;
        $('#fact').innerHTML = hours === 0 ? 'Respekt. Bist du ein Mönch? 🧘'
          : `In den nächsten 60 Jahren wären das <b>${years.toFixed(1).replace('.', ',')} Jahre</b> am Handy 😳`;
        paintBrain(ob, Math.max(0, 100 - hours * 12.5));
      };
      $('#hr').oninput = (e) => { hours = +e.target.value; upd(); };
      upd();
    } else if (ob) {
      paintBrain(ob, 100);
    }
    $$('#gl .chip').forEach((b) => b.onclick = () => {
      const k = b.dataset.g;
      goals.has(k) ? goals.delete(k) : goals.add(k);
      b.setAttribute('aria-pressed', goals.has(k));
    });
    $$('#ap .chip').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      apps.has(a) ? apps.delete(a) : apps.add(a);
      b.setAttribute('aria-pressed', apps.has(a));
    });
    $('#lim')?.addEventListener('input', (e) => { limit = +e.target.value; $('#lv').textContent = fmtMin(limit); });
    $('#back')?.addEventListener('click', () => { step--; draw(); });
    $('#next').onclick = () => {
      if (step < N - 1) { step++; draw(); return; }
      S.set({
        onboarded: true,
        name: $('#nm').value.trim(),
        goals: [...goals],
        apps: apps.size ? [...apps] : ['TikTok'],
        limitMin: limit,
      });
      confetti();
      chime('good');
      location.hash = '#/home';
    };
  };
  draw();
}

/* ---------------- Start ---------------- */
let lastSeenFinish = S.get().lastFinished?.at || 0;
function loop() {
  S.tick();
  const lf = S.get().lastFinished;
  if (lf && lf.at > lastSeenFinish) {
    lastSeenFinish = lf.at;
    if (lf.completed) {
      if (lf.type === 'focus') { confetti(); chime('good'); toast(`🎉 ${lf.min} Minuten geschafft! +5% Bonus`); keepAwake(false); }
      else { chime('bad'); toast(`⏰ Deine ${lf.min} Minuten ${lf.app} sind um!`, 4000); }
    }
  }
  current?.update?.();
  paintBrain($('#navBrain'), S.get().health, { still: true, title: '' });
}

applyTheme();
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
setInterval(loop, 1000);
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
