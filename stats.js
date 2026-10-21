// Zombrain – kleine SVG-Diagramme (ohne Bibliothek)

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function fmtMin(m) {
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// Balken mit abgerundeter Oberkante (4px), unten gerade an der Grundlinie
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, h, w / 2);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

function niceMax(v) {
  const steps = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600];
  return steps.find((s) => s >= v) || Math.ceil(v / 120) * 120;
}

function attachTip(box, svg, hits, textFor) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  box.appendChild(tip);
  const show = (i, el) => {
    hits.forEach((h) => h.classList.toggle('on', h === el));
    tip.innerHTML = textFor(i);
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    let x = r.left + r.width / 2 - b.left;
    x = Math.max(70, Math.min(b.width - 70, x));
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(30, r.top - b.top + 24)}px`;
    tip.classList.add('show');
  };
  const hide = () => { tip.classList.remove('show'); hits.forEach((h) => h.classList.remove('on')); };
  hits.forEach((el, i) => {
    el.addEventListener('pointerenter', () => show(i, el));
    el.addEventListener('click', () => show(i, el));
    el.addEventListener('focus', () => show(i, el));
    el.addEventListener('blur', hide);
  });
  svg.addEventListener('pointerleave', hide);
}

export function weekBars(box, days, limit) {
  const W = Math.max(300, Math.round(box.clientWidth) || 640), H = 240, P = { l: 44, r: 10, t: 14, b: 30 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const vals = days.map((d) => ({ s: d.data?.scroll || 0, f: d.data?.focus || 0 }));
  const max = niceMax(Math.max(limit * 1.2, ...vals.map((v) => Math.max(v.s, v.f))));
  const y = (v) => P.t + ih - (v / max) * ih;
  const slot = iw / days.length;
  const bw = Math.max(6, Math.min(26, (slot - 14) / 2));
  const ticks = [0, max / 2, max];

  let g = '';
  ticks.forEach((t) => {
    g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/>
          <text x="${P.l - 8}" y="${y(t) + 4}" text-anchor="end">${t >= 60 ? (t / 60).toFixed(t % 60 ? 1 : 0).replace('.', ',') + ' h' : t ? t + ' min' : '0'}</text>`;
  });
  let marks = '', hits = '';
  days.forEach((d, i) => {
    const cx = P.l + slot * i + slot / 2;
    const v = vals[i];
    // 2px Abstand zwischen den beiden Balken
    marks += `<path d="${barPath(cx - bw - 1, y(v.s), bw, P.t + ih - y(v.s))}" fill="var(--c-scroll)"/>`;
    marks += `<path d="${barPath(cx + 1, y(v.f), bw, P.t + ih - y(v.f))}" fill="var(--c-focus)"/>`;
    const isToday = i === days.length - 1;
    marks += `<text x="${cx}" y="${H - 8}" text-anchor="middle" style="${isToday ? 'fill:var(--ink);font-weight:800' : ''}">${isToday ? 'Heute' : WD[d.date.getDay()]}</text>`;
    hits += `<rect class="hit" tabindex="0" x="${P.l + slot * i + 2}" y="${P.t}" width="${slot - 4}" height="${ih}" rx="10"/>`;
  });
  const ly = y(limit);
  const limitLine = `<line x1="${P.l}" x2="${W - P.r}" y1="${ly}" y2="${ly}" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="5 5"/>
    <text x="${W - P.r}" y="${ly - 6}" text-anchor="end">Limit ${fmtMin(limit)}</text>`;

  box.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scrollen und Fokus der letzten 7 Tage">
      ${g}<g>${hits}</g>${marks}${limitLine}</svg>`;
  const svg = box.querySelector('svg');
  attachTip(box, svg, [...svg.querySelectorAll('.hit')], (i) => {
    const d = days[i], v = vals[i];
    const label = i === days.length - 1 ? 'Heute' : d.date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
    return `<b>${label}</b><br>📱 Scrollen: ${fmtMin(v.s)}<br>🧘 Fokus: ${fmtMin(v.f)}<br>💪 Widerstanden: ${d.data?.resisted || 0}×`;
  });
}

export function healthLine(box, days) {
  const W = Math.max(300, Math.round(box.clientWidth) || 640), H = 190, P = { l: 44, r: 14, t: 16, b: 30 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const x = (i) => P.l + (i / (days.length - 1)) * iw;
  const y = (v) => P.t + ih - (v / 100) * ih;
  const pts = days.map((d, i) => (d.data ? [x(i), y(d.data.healthEnd), d.data.healthEnd, i] : null));
  let path = '', open = false;
  pts.forEach((p) => {
    if (!p) { open = false; return; }
    path += `${open ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    open = true;
  });
  let g = '';
  [0, 50, 100].forEach((t) => {
    g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/>
          <text x="${P.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}%</text>`;
  });
  let labels = '', hits = '', dots = '';
  days.forEach((d, i) => {
    const isToday = i === days.length - 1;
    labels += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="${isToday ? 'fill:var(--ink);font-weight:800' : ''}">${isToday ? 'Heute' : WD[d.date.getDay()]}</text>`;
    const half = iw / (days.length - 1) / 2;
    hits += `<rect class="hit" tabindex="0" x="${x(i) - half}" y="${P.t}" width="${half * 2}" height="${ih}" rx="10"/>`;
  });
  pts.forEach((p) => {
    if (p) dots += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>`;
  });
  box.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gehirn-Gesundheit am Tagesende">
      ${g}<g>${hits}</g>
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${labels}</svg>`;
  const svg = box.querySelector('svg');
  attachTip(box, svg, [...svg.querySelectorAll('.hit')], (i) => {
    const d = days[i];
    const label = i === days.length - 1 ? 'Heute' : d.date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
    if (!d.data) return `<b>${label}</b><br>Keine Daten`;
    return `<b>${label}</b><br>🧠 Am Ende: ${Math.round(d.data.healthEnd)}%<br>📉 Tiefster Stand: ${Math.round(d.data.healthMin)}%`;
  });
}

export function weekTable(days) {
  const rows = days.map((d, i) => {
    const label = i === days.length - 1 ? 'Heute' : d.date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
    const v = d.data;
    return `<tr><td>${label}</td><td>${fmtMin(v?.scroll || 0)}</td><td>${fmtMin(v?.focus || 0)}</td><td>${v?.resisted || 0}</td><td>${v ? Math.round(v.healthEnd) + '%' : '–'}</td></tr>`;
  }).join('');
  return `<table class="data"><thead><tr><th>Tag</th><th>Scrollen</th><th>Fokus</th><th>Nein</th><th>Gehirn</th></tr></thead><tbody>${rows}</tbody></table>`;
}
