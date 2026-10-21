// Zombrain – die Gehirn-Figur als SVG. Alles selbst gezeichnet.
// brainSVG(health) gibt einen SVG-String zurück, health = 0..100.

let uid = 0;

const STOPS = [
  // [health, body, fold]
  [0, '#8FC46F', '#5E8F45'],
  [25, '#B9CB80', '#839657'],
  [45, '#E6C7A6', '#B48C73'],
  [70, '#FBB3C3', '#D97F98'],
  [100, '#FF9DB8', '#E86F93'],
];

export const STAGES = [
  { min: 85, key: 'fit', label: 'Topfit', emoji: '✨', msg: 'Dein Gehirn strahlt. Weiter so!' },
  { min: 60, key: 'ok', label: 'Okay', emoji: '🙂', msg: 'Alles im grünen … äh, rosa Bereich.' },
  { min: 40, key: 'tired', label: 'Müde', emoji: '🥱', msg: 'Dein Gehirn wird langsam matschig.' },
  { min: 20, key: 'mushy', label: 'Matschig', emoji: '🤢', msg: 'Uff. Es fängt an zu riechen.' },
  { min: 0, key: 'zombie', label: 'Zombie', emoji: '🧟', msg: 'Volle Verrottung. Zeit für Detox!' },
];

export function stageOf(h) {
  return STAGES.find((s) => h >= s.min) || STAGES[STAGES.length - 1];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
function colorsFor(h) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [h0, b0, f0] = STOPS[i];
    const [h1, b1, f1] = STOPS[i + 1];
    if (h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return { body: mix(b0, b1, t), fold: mix(f0, f1, t) };
    }
  }
  return { body: STOPS[4][1], fold: STOPS[4][2] };
}

function bodyPath(h) {
  const rot = 1 - h / 100;
  const cx = 150, cy = 142, rx = 112, ry = 86;
  const N = 11;
  const pts = [], ctrls = [];
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const sag = Math.sin(a) > 0 ? rot * 14 * Math.sin(a) : 0;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a) + sag]);
    const am = a + Math.PI / N;
    // oben große Hügel, unten flacher; beim Verrotten werden die Hügel unruhiger
    const top = Math.sin(am) < 0;
    const wob = rot * 0.06 * Math.sin(i * 2.3);
    const bulge = (top ? 1.24 : 1.1) + wob;
    const sagC = Math.sin(am) > 0 ? rot * 16 * Math.sin(am) : 0;
    ctrls.push([cx + rx * bulge * Math.cos(am), cy + ry * bulge * Math.sin(am) + sagC]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const c = ctrls[i], p = pts[(i + 1) % N];
    d += ` Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function eyes(h, ink, body, fold) {
  const L = 122, R = 178, Y = 158;
  if (h >= 85) {
    // glückliche Bogen-Augen
    return `<path d="M${L - 11} ${Y + 4} q11 -15 22 0" class="zb-ink" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>
            <path d="M${R - 11} ${Y + 4} q11 -15 22 0" class="zb-ink" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  }
  if (h < 20) {
    const x = (cx) => `<path d="M${cx - 9} ${Y - 9} l18 18 M${cx + 9} ${Y - 9} l-18 18" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
    return x(L) + x(R);
  }
  const lid = h >= 60 ? 0 : h >= 40 ? 0.42 : 0.62;
  const eye = (cx, s) => {
    const ry = 13 * s, rx = 10 * s;
    if (lid === 0) {
      return `<ellipse cx="${cx}" cy="${Y}" rx="${rx}" ry="${ry}" fill="${ink}"/>
             <circle cx="${cx + 3.5 * s}" cy="${Y - 5 * s}" r="${3.6 * s}" fill="#fff"/>`;
    }
    // halb geschlossenes Auge: nur der untere Teil der Ellipse + Lidstrich
    const ly = Y - ry + 2 * ry * lid;
    const w = rx * Math.sqrt(1 - ((ly - Y) / ry) ** 2);
    const large = lid < 0.5 ? 1 : 0;
    return `<path d="M${(cx - w).toFixed(1)} ${ly.toFixed(1)} A${rx} ${ry} 0 ${large} 0 ${(cx + w).toFixed(1)} ${ly.toFixed(1)}Z" fill="${ink}"/>
            <path d="M${cx - rx - 3} ${ly.toFixed(1)} h${rx * 2 + 6}" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
            <path d="M${cx - 9} ${Y + ry + 5} q9 6 18 0" stroke="${fold}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".9"/>`;
  };
  if (h < 40) return eye(L, 1.05) + eye(R, 0.8);
  return eye(L, 1) + eye(R, 1);
}

function mouth(h, ink) {
  const X = 150, Y = 190;
  if (h >= 85) {
    return `<path d="M${X - 20} ${Y - 6} q20 30 40 0 z" fill="${ink}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
            <path d="M${X - 9} ${Y + 6} q9 -8 18 0 q-9 8 -18 0z" fill="#FF6F8E"/>`;
  }
  if (h >= 60) return `<path d="M${X - 16} ${Y - 4} q16 16 32 0" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  if (h >= 40) return `<path d="M${X - 16} ${Y} q8 -6 16 0 t16 0" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  if (h >= 20) {
    return `<ellipse cx="${X}" cy="${Y}" rx="11" ry="9" fill="${ink}"/>
            <path class="zb-drool" d="M${X + 7} ${Y + 6} q3 12 0 18 a4 4 0 1 1 -1 0" fill="#9FE3E8" stroke="#6CC3CB" stroke-width="1.5"/>`;
  }
  return `<path d="M${X - 22} ${Y - 4} l7 8 l7 -8 l8 8 l8 -8 l7 8 l7 -8 q-6 22 -22 22 q-16 0 -22 -22z" fill="${ink}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
          <rect x="${X - 6}" y="${Y - 2}" width="8" height="8" rx="2" fill="#FFF7D6"/>
          <path class="zb-drool" d="M${X + 12} ${Y + 10} q3 12 0 20 a4.5 4.5 0 1 1 -1 0" fill="#B7E86B" stroke="#7FB53A" stroke-width="1.5"/>`;
}

function extras(h, still) {
  let s = '';
  if (h >= 85) {
    const star = (x, y, r, d) =>
      `<path class="zb-twinkle" style="animation-delay:${d}s" d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="#FFD25A"/>`;
    s += star(40, 60, 14, 0) + star(262, 48, 11, 0.6) + star(272, 128, 8, 1.1) + star(28, 140, 7, 0.3);
  }
  if (h >= 40 && h < 60) {
    s += `<path class="zb-sweat" d="M238 92 q-10 16 0 20 q10 -4 0 -20z" fill="#9FD8F5" stroke="#5BA9D6" stroke-width="2"/>`;
  }
  if (h < 30) {
    const line = (x, d) => `<path class="zb-stink" style="animation-delay:${d}s" d="M${x} 52 q-8 -10 0 -20 q8 -10 0 -20" stroke="#9BB560" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>`;
    s += line(110, 0) + line(150, 0.5) + line(190, 1);
  }
  if (h < 40) {
    const n = h < 20 ? 3 : 2;
    const paths = [
      ['M150 40 C 260 0, 290 120, 200 110 C 120 100, 40 10, 150 40', 3.4, '150 40'],
      ['M60 90 C 0 30, 110 0, 120 60 C 130 120, 20 150, 60 90', 2.8, '60 90'],
      ['M240 160 C 300 120, 290 230, 240 210 C 190 190, 200 140, 240 160', 2.2, '240 160'],
    ];
    const fly = (i) => {
      const [d, dur, pos] = paths[i];
      const move = still ? '' : `<animateMotion dur="${dur}s" repeatCount="indefinite" path="${d}"/>`;
      return `<g ${still ? `transform="translate(${pos})"` : ''}>${move}
        <ellipse cx="0" cy="-4" rx="5" ry="3.5" fill="#D9F1FF" opacity=".85" class="zb-wing"/>
        <circle cx="0" cy="0" r="4.5" fill="#2B2B2B"/></g>`;
    };
    for (let i = 0; i < n; i++) s += fly(i);
  }
  if (h < 15) {
    s += `<g class="zb-worm"><path d="M196 74 q4 -18 16 -16 q12 2 8 14" stroke="#F29BB2" stroke-width="9" fill="none" stroke-linecap="round"/>
          <circle cx="220" cy="72" r="1.8" fill="#2B2B2B"/></g>`;
  }
  return s;
}

function spots(h) {
  if (h >= 45) return '';
  const o = Math.min(1, (45 - h) / 35) * 0.55;
  return `<g opacity="${o.toFixed(2)}" fill="#5B7F3A">
      <ellipse cx="86" cy="118" rx="12" ry="8"/>
      <ellipse cx="214" cy="112" rx="9" ry="6"/>
      <ellipse cx="226" cy="196" rx="11" ry="7"/>
      <ellipse cx="78" cy="196" rx="7" ry="5"/>
      <circle cx="180" cy="86" r="5"/></g>`;
}

export function brainSVG(health, opts = {}) {
  const h = Math.max(0, Math.min(100, health));
  const { body, fold } = colorsFor(h);
  const id = `zb${++uid}`;
  const ink = '#3A2A2E';
  const rot = 1 - h / 100;
  const cheekOp = Math.max(0, (h - 30) / 70) * 0.75;
  const title = opts.title ?? `Gehirn bei ${Math.round(h)} Prozent`;
  return `<svg class="zb ${opts.still ? 'zb-still' : ''}" viewBox="0 0 300 290" role="img" aria-label="${title}"
      style="--zb-body:${body};--zb-fold:${fold};--zb-speed:${(3.2 - rot * 1.6).toFixed(2)}s">
    <defs>
      <radialGradient id="${id}g" cx="38%" cy="30%" r="75%">
        <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
        <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="150" cy="262" rx="${90 + rot * 14}" ry="11" fill="#000" opacity=".1"/>
    <g class="zb-body">
      <ellipse cx="116" cy="243" rx="18" ry="12" fill="${fold}"/>
      <ellipse cx="184" cy="243" rx="18" ry="12" fill="${fold}"/>
      <path d="${bodyPath(h)}" fill="${body}" stroke="${fold}" stroke-width="6" stroke-linejoin="round"/>
      <path d="${bodyPath(h)}" fill="url(#${id}g)"/>
      <g stroke="${fold}" stroke-width="5.5" fill="none" stroke-linecap="round">
        <path d="M150 60 C 142 76, 158 90, 150 108"/>
        <path d="M96 84 c 12 -8 26 -2 28 10"/>
        <path d="M204 84 c -12 -8 -26 -2 -28 10"/>
        <path d="M66 122 c 14 -8 26 2 24 14"/>
        <path d="M234 122 c -14 -8 -26 2 -24 14"/>
        <path d="M112 112 c -2 10 -12 14 -20 12"/>
        <path d="M188 112 c 2 10 12 14 20 12"/>
        <path d="M58 178 c 10 0 16 8 14 18"/>
        <path d="M242 178 c -10 0 -16 8 -14 18"/>
      </g>
      ${spots(h)}
      <ellipse cx="102" cy="184" rx="13" ry="8" fill="#FF6F8E" opacity="${cheekOp.toFixed(2)}"/>
      <ellipse cx="198" cy="184" rx="13" ry="8" fill="#FF6F8E" opacity="${cheekOp.toFixed(2)}"/>
      ${eyes(h, ink, body, fold)}
      ${mouth(h, ink)}
    </g>
    ${extras(h, opts.still)}
  </svg>`;
}
