// Bildwerkstatt: ein Stammbaum als Bild in einer Form, zum Speichern als Hintergrundbild. Eigene 2D-Fläche statt der
// 3D-Bühne: Dieselbe Zeichenfunktion malt die Vorschau und das fertige Bild, in jeder Größe genau gleich aufgebaut.
// Die Einstellungen merkt sich der Browser (localStorage lb-werkstatt).
import { t } from 'lb/text.js';
import { jahreKurz } from 'lb/daten.js';
import { FORMEN, auswahl, anordnen, anordnenFrei, freiEinblenden, freiMassstab, geschwisterVon, paareZusammenfassen, stammAuswahl } from 'lb/formen.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SCHRIFT = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const VORGABE = { form: 'herz', vorfahren: 4, nachkommen: 0, partner: false, geschwister: false, aus: [], mehr: [], portraets: {}, freiJe: {}, freiGroesse: 0.3, ranken: 'aus', rankenSaat: 1, rankenArt: 'ranke', rankenGroesse: 1, rankenFarbe: '', rosenFarbe: '#a51e33', titel: '', stammLinie: 'vater', rahmenJe: {}, groesseJe: {}, paareJe: {}, ohneLinieJe: {}, massstabJe: {}, verschoben: {}, versatzJe: {}, ton: 'farbe', linie: 'mittel',
  linienart: 'geschwungen', linienfarbe: '#d6a24e', kontur: true, seiten: false, namen: true, jahre: true, grund: 'dunkel', format: 'bildschirm' };
const STAERKE = { duenn: 1.2, mittel: 2.4, dick: 5 };     // bei 1080 Pixeln Bildhöhe
const GRUENDE = {
  dunkel: { innen: '#1b2130', aussen: '#090b11', text: '#f2ede4', text2: '#b9bfca', leer: '#232a38' },
  pergament: { innen: '#f3ebdb', aussen: '#d9c8a6', text: '#33291c', text2: '#6a5a43', leer: '#e3d6bb' },
  weiss: { innen: '#ffffff', aussen: '#ffffff', text: '#1e1e1e', text2: '#5c5c5c', leer: '#ececec' },
  // ohne Hintergrund: Die Schrift richtet sich danach, worauf das Bild später liegt; ein halbdurchsichtiger Hof hält sie lesbar
  klardunkel: { text: '#f2ede4', text2: '#c6ccd6', leer: '#232a38', hof: 'rgba(9, 11, 17, 0.55)' },
  klarhell: { text: '#2a2218', text2: '#54493a', leer: '#e3d6bb', hof: 'rgba(255, 255, 255, 0.6)' },
};
const FARBE_SEITE = { l: '#d6a24e', r: '#62b6a9', m: '#e8d5a8' };

function formate() {
  const f = window.devicePixelRatio || 1;
  return [
    { id: 'bildschirm', name: t('Mein Bildschirm'), b: Math.round(screen.width * f), h: Math.round(screen.height * f) },
    { id: 'fhd', name: 'Full HD', b: 1920, h: 1080 },
    { id: 'qhd', name: 'QHD', b: 2560, h: 1440 },
    { id: '4k', name: '4K', b: 3840, h: 2160 },
    { id: 'breit', name: '21:9', b: 3440, h: 1440 },
    // Druck mit 300 dpi
    ...[['A4', 3508, 2480], ['A3', 4961, 3508], ['A2', 7016, 4961]].flatMap(([n, l, k]) => [
      { id: `${n}q`, name: t('{f} quer', { f: n }), b: l, h: k, druck: `${n} landscape` },
      { id: `${n}h`, name: t('{f} hoch', { f: n }), b: k, h: l, druck: `${n} portrait` },
    ]),
  ];
}

// Was eine Szene für die ganze Werkstatt festhält; dazu kommt, was je Form und Hauptperson gilt (szeneErstellen)
const SZENEN_WERTE = ['form', 'vorfahren', 'nachkommen', 'partner', 'geschwister', 'seiten', 'aus', 'mehr', 'portraets', 'ton', 'linie', 'linienart', 'linienfarbe',
  'kontur', 'namen', 'jahre', 'grund', 'format', 'freiGroesse', 'ranken', 'rankenSaat', 'rankenArt', 'rankenGroesse', 'rankenFarbe', 'rosenFarbe', 'titel', 'stammLinie'];
const FORM_NAMEN = { herz: 'Herz', fluegel: 'Flügel', frei: 'Frei', tafel: 'Tafel', eiche: 'Ahnen-Eiche', stamm: 'Stammlinie' };
const FORM_TIPPS = {
  herz: 'Hauptperson unten, nach oben die älteren Generationen',
  fluegel: 'Hauptperson in der Mitte, Vaterseite im linken, Mutterseite im rechten Flügel',
  frei: 'Beginnt mit der Hauptperson. Klick auf eine Person blendet Verwandte ein, Ziehen verschiebt sie',
  tafel: 'Klassische Tafel: Vorfahren oben, Nachkommen mit ihren Partnern darunter, rechtwinklige Linien',
  eiche: 'Hauptperson am Stamm, die Vorfahren fächern sich in die Krone, Vaterseite links',
  stamm: 'Die Linie vom ältesten Stammvater bis zur Hauptperson im Stamm, Geschwister auf den Ästen',
};
const RINDE = '#6b4a2c', RINDE_DUNKEL = '#3b2815';
const LAUB = { eiche: ['#6f8a2e', '#8fa23c', '#a8a542', '#5b7326', '#b08d3a'], stamm: ['#4f7a2a', '#6b9634', '#86ad45', '#3f6522', '#97b94f'],
  tafel: ['#7d8f5a', '#93a26c', '#6c7d4c'] };

function ebenenName(g) {
  if (g === 0) return t('Hauptperson und Familie');
  const namen = { 1: 'Eltern', 2: 'Großeltern', 3: 'Urgroßeltern', '-1': 'Kinder', '-2': 'Enkel', '-3': 'Urenkel' };
  return namen[g] ? t(namen[g]) : t(g > 0 ? '{n}. Generation Vorfahren' : '{n}. Generation Nachkommen', { n: Math.abs(g) });
}

const linienSchluessel = (a, b) => [a.id, b.id].sort().join('+');

// --- Malen -----------------------------------------------------------------------------------------------
function pfad(g, zug, zu, f) {
  g.beginPath();
  zug.forEach((p, i) => { const [x, y] = f(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  if (zu) g.closePath();
}

/** Porträt rund ausgeschnitten im gewählten Bildton. Mit Zeichenmodi statt ctx.filter, das Safari nicht überall kann. */
function portraet(bild, px, ton, { cx = 0.5, cy = 0.5, z = 1 } = {}, rahmen = 'rund') {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const o = c.getContext('2d');
  o.imageSmoothingQuality = 'high';
  const b = bild.naturalWidth, h = bild.naturalHeight, s = Math.min(b, h) / z;
  o.drawImage(bild, Math.max(0, Math.min(b - s, cx * b - s / 2)), Math.max(0, Math.min(h - s, cy * h - s / 2)), s, s, 0, 0, px, px);
  if (ton !== 'farbe') {
    o.globalCompositeOperation = 'saturation';
    o.fillStyle = '#000';
    o.fillRect(0, 0, px, px);
    if (ton === 'sepia') {
      o.globalCompositeOperation = 'color';
      o.fillStyle = '#a5784a';
      o.fillRect(0, 0, px, px);
    }
  }
  o.globalCompositeOperation = 'destination-in';
  umriss(o, px / 2, px / 2, px / 2, rahmen);
  o.fill();
  return c;
}

/** Umriss eines Porträts: rund oder als Wappenschild */
function umriss(g, x, y, r, rahmen) {
  g.beginPath();
  if (rahmen !== 'schild') { g.arc(x, y, r, 0, 2 * Math.PI); return; }
  g.moveTo(x - r, y - r * 0.94);
  g.quadraticCurveTo(x, y - r * 0.78, x + r, y - r * 0.94);
  g.lineTo(x + r, y + r * 0.08);
  g.quadraticCurveTo(x + r * 0.96, y + r * 0.74, x, y + r);
  g.quadraticCurveTo(x - r * 0.96, y + r * 0.74, x - r, y + r * 0.08);
  g.closePath();
}

/** Feste Zahlenfolge: Das gespeicherte Bild sieht aus wie die Vorschau */
function wuerfel(saat) {
  let zustand = (saat * 2654435761) >>> 0;
  return () => {
    zustand = (zustand + 0x6D2B79F5) >>> 0;
    let z = Math.imul(zustand ^ (zustand >>> 15), 1 | zustand);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Punkte eines Astes von A nach B: 'hoch' steigt senkrecht auf, 'quer' läuft waagrecht hinaus, 'seite' kommt von unten seitlich */
function astPunkte(A, B, kurve) {
  const [ax, ay] = A, [bx, by] = B;
  const c = kurve === 'quer' ? [[ax + (bx - ax) * 0.5, ay], [bx - (bx - ax) * 0.25, by]]
    : kurve === 'seite' ? [[ax, ay + (by - ay) * 0.85], [ax + (bx - ax) * 0.35, by]]
      : [[ax, ay + (by - ay) * 0.55], [bx, ay + (by - ay) * 0.45]];
  return bogen(A, c[0], c[1], B, 30);
}

/** Ast, der sich von w0 auf w1 verjüngt */
function astMalen(g, punkte, w0, w1, farbe, kante) {
  const n = punkte.length, links = [], rechts = [];
  punkte.forEach(([x, y], i) => {
    const [px, py] = punkte[Math.max(0, i - 1)], [nx, ny] = punkte[Math.min(n - 1, i + 1)];
    const l = Math.hypot(nx - px, ny - py) || 1, b = (w0 + (w1 - w0) * i / (n - 1)) / 2;
    links.push([x - (ny - py) / l * b, y + (nx - px) / l * b]);
    rechts.push([x + (ny - py) / l * b, y - (nx - px) / l * b]);
  });
  g.beginPath();
  [...links, ...rechts.reverse()].forEach(([x, y], i) => { if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.closePath();
  g.fillStyle = farbe;
  g.fill();
  if (kante) {
    g.strokeStyle = kante;
    g.lineWidth = Math.max(0.6, w0 * 0.07);
    g.globalAlpha *= 0.6;
    g.stroke();
    g.globalAlpha /= 0.6;
  }
}

/** Gemalter Baum hinter den Personen: erst das Laub, darüber Stamm und Wurzeln. Die Tafel bekommt nur einen zarten Schatten. */
function baumMalen(g, z, f, m, zufall, astZuege) {
  const leise = z.art === 'tafel', farben = LAUB[z.art] ?? LAUB.stamm, gelappt = z.art === 'eiche';
  g.save();
  g.globalAlpha = leise ? 0.15 : 0.92;
  const blatt = (x, y, w, l) => {
    const c = Math.cos(w), s = Math.sin(w), n = 14;
    const profil = t => gelappt ? (0.15 + 0.13 * Math.sin(Math.PI * t)) * (1 + 0.45 * Math.cos(t * Math.PI * 8)) * Math.min(1, t * 8, (1 - t) * 6 + 0.1)
      : 0.36 * Math.sin(Math.PI * t) ** 0.8;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 1; i <= n; i++) { const t = i / n, r = profil(t) * l; g.lineTo(x + c * t * l - s * r, y + s * t * l + c * r); }
    for (let i = n - 1; i > 0; i--) { const t = i / n, r = profil(t) * l; g.lineTo(x + c * t * l + s * r, y + s * t * l - c * r); }
    g.closePath();
    g.fillStyle = farben[Math.floor(zufall() * farben.length)];
    g.fill();
  };
  const eichel = (x, y, r) => {
    g.fillStyle = '#9c7a3c';
    g.beginPath();
    g.ellipse(x, y + r * 0.35, r * 0.55, r * 0.8, 0, 0, 2 * Math.PI);
    g.fill();
    g.fillStyle = '#5e4524';
    g.beginPath();
    g.ellipse(x, y - r * 0.15, r * 0.66, r * 0.42, 0, 0, 2 * Math.PI);
    g.fill();
  };
  const art = { eiche: { groesse: 0.5, dicht: 0, um: 9, weit: 1.25, jeder: 3, ab: 0.35 }, stamm: { groesse: 0.46, dicht: 7, um: 16, weit: 1.55, jeder: 2, ab: 0.15 },
    tafel: { groesse: 0.5, dicht: 5 } }[z.art];
  const groesse = art.groesse * m, orte = [];
  if (z.krone) {   // die Krone in Büscheln, nicht gleichmäßig gestreut
    const k = z.krone, n = Math.min(500, Math.round(Math.PI * k.rx * k.ry * art.dicht / 9));
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(zufall()) * 0.97, w = zufall() * 2 * Math.PI, [bx, by] = [k.x + Math.cos(w) * r * k.rx, k.y + Math.sin(w) * r * k.ry];
      for (let j = 0; j < 9; j++) {
        const rr = zufall() * 0.55, ww = zufall() * 2 * Math.PI;
        orte.push(f([bx + Math.cos(ww) * rr, by + Math.sin(ww) * rr * 0.8]));
      }
    }
  }
  for (const q of z.blaetter ?? []) {
    for (let i = 0; i < art.um; i++) {
      const r = (0.5 + zufall() * (art.weit - 0.5)) * q.d, w = zufall() * 2 * Math.PI;
      orte.push(f([q.x + Math.cos(w) * r, q.y + 0.2 + Math.sin(w) * r * 0.85]));
    }
  }
  if (!leise) {
    for (const { a, punkte } of astZuege) {
      if (a.linie) continue;
      for (let i = Math.floor(punkte.length * art.ab); i < punkte.length; i += art.jeder) {
        for (const v of [-1, 1]) orte.push([punkte[i][0] + (zufall() - 0.5) * groesse, punkte[i][1] + v * zufall() * groesse * 0.9]);
      }
    }
  }
  for (const [x, y] of orte) blatt(x, y, zufall() * 2 * Math.PI, groesse * (0.75 + zufall() * 0.5));
  // die Tafel hat keine eigenen Äste: der Schattenbaum bekommt ein paar, vom Stamm in die Krone
  if (leise && z.stamm && z.krone) {
    const s = z.stamm, k = z.krone;
    g.fillStyle = RINDE;
    for (const w of [-0.95, -0.55, -0.2, 0.2, 0.55, 0.95]) {
      const ziel = [k.x + Math.sin(w) * k.rx * 0.8, k.y - Math.cos(w) * k.ry * 0.55];
      astMalen(g, astPunkte(f([s.x + w * s.bo, s.oben]), f(ziel), 'hoch'), s.bo * m * 0.9, s.bo * m * 0.15, RINDE);
    }
  }
  if (gelappt) for (const [x, y] of orte) if (zufall() < 0.05) eichel(x, y, groesse * 0.22);

  // Stamm mit Wurzeln
  const s = z.stamm;
  if (s) {
    const P = (x, y) => f([s.x + x, y]), mitte = (s.unten + s.oben) / 2;
    g.beginPath();
    g.moveTo(...P(-s.bu * 2.1, s.unten));
    g.quadraticCurveTo(...P(-s.bu * 0.95, s.unten - 0.12), ...P(-s.bu, s.unten - 0.9));
    g.bezierCurveTo(...P(-s.bu * 0.92, mitte), ...P(-s.bo * 1.15, s.oben + (s.unten - s.oben) * 0.2), ...P(-s.bo, s.oben));
    g.lineTo(...P(s.bo, s.oben));
    g.bezierCurveTo(...P(s.bo * 1.15, s.oben + (s.unten - s.oben) * 0.2), ...P(s.bu * 0.92, mitte), ...P(s.bu, s.unten - 0.9));
    g.quadraticCurveTo(...P(s.bu * 0.95, s.unten - 0.12), ...P(s.bu * 2.1, s.unten));
    g.quadraticCurveTo(...P(s.bu * 0.6, s.unten - 0.3), ...P(0, s.unten - 0.08));
    g.quadraticCurveTo(...P(-s.bu * 0.6, s.unten - 0.3), ...P(-s.bu * 2.1, s.unten));
    g.closePath();
    g.fillStyle = RINDE;
    g.fill();
    if (!leise) {
      g.strokeStyle = RINDE_DUNKEL;
      g.lineWidth = Math.max(1, 0.025 * m);
      g.stroke();
      // Rinde: ein paar gewellte Furchen
      g.globalAlpha = 0.45;
      for (let i = 0; i < 7; i++) {
        const k = (i + 0.5) / 7 * 2 - 1;
        g.beginPath();
        for (let j = 0; j <= 20; j++) {
          const y = s.oben + (s.unten - 0.9 - s.oben) * j / 20, b = s.bo + (s.bu - s.bo) * j / 20;
          const [x, yy] = P(k * b * 0.8 + Math.sin(j * 0.9 + i * 2) * 0.04, y);
          if (j) g.lineTo(x, yy); else g.moveTo(x, yy);
        }
        g.stroke();
      }
    }
  }
  g.restore();
}

/** Kleines Herz zwischen Eheleuten */
function herz(g, x, y, r) {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  g.fill();
}

function kurz(g, text, breite) {
  if (g.measureText(text).width <= breite) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + '…').width > breite) s = s.slice(0, -1);
  return s + '…';
}

/** Punkte einer Bézierkurve, für die Ranken */
function bogen([ax, ay], [bx, by], [cx, cy], [dx, dy], n = 26) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t * t * t * dx, u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t * t * t * dy];
  });
}

/** Ranken entlang der Linien: ein Trieb, der sich um die Linie windet, daran Blätter und was zur Pflanze gehört. Aus einer festen
 *  Zahlenfolge, darum sieht das gespeicherte Bild aus wie die Vorschau; „neu würfeln“ wählt eine andere Folge. */
function ranken(g, pfade, stil, einheit) {
  let zustand = (stil.rankenSaat * 2654435761) >>> 0;
  const zufall = () => {
    zustand = (zustand + 0x6D2B79F5) >>> 0;
    let z = Math.imul(zustand ^ (zustand >>> 15), 1 | zustand);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const reich = stil.ranken === 'reich', e = einheit * (stil.rankenGroesse ?? 1), farbe = stil.rankenFarbe || stil.linienfarbe;
  // Rosenblüten: vier Töne aus der gewählten Farbe, innen dunkler, außen heller
  const rose = /^#[0-9a-f]{6}$/i.test(stil.rosenFarbe ?? '') ? stil.rosenFarbe : '#a51e33';
  const mische = (k, ziel) => '#' + [1, 3, 5].map(i => {
    const v = parseInt(rose.slice(i, i + 2), 16);
    return Math.round(v + (ziel - v) * k).toString(16).padStart(2, '0');
  }).join('');
  const rosenToene = [mische(0.25, 0), rose, mische(0.18, 255), mische(0.36, 255)];
  g.strokeStyle = g.fillStyle = farbe;
  g.lineCap = g.lineJoin = 'round';
  const strich = b => { g.lineWidth = Math.max(0.5 * einheit, b * e); };

  /** Blatt mit Umriss und Mittelrippe; `profil(t)` ist die halbe Breite an der Stelle t, als Anteil der Länge */
  const blatt = (x, y, w, l, profil, fuellung = 0.4) => {
    const c = Math.cos(w), s = Math.sin(w), n = 28, rand = i => (seite => {
      const t = i / n, r = profil(t) * l * seite;
      return [x + c * t * l - s * r, y + s * t * l + c * r];
    });
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 1; i <= n; i++) g.lineTo(...rand(i)(1));
    for (let i = n - 1; i >= 0; i--) g.lineTo(...rand(i)(-1));
    g.closePath();
    g.globalAlpha = fuellung;
    g.fill();
    g.globalAlpha = 0.85;
    strich(0.7);
    g.stroke();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + c * l * 0.88, y + s * l * 0.88);
    g.stroke();
  };
  const SPITZ = t => 0.3 * Math.sin(Math.PI * t) ** 0.8;
  const ZACKIG = t => 0.3 * Math.sin(Math.PI * t ** 0.8) * (Math.floor(t * 14) % 2 ? 0.8 : 1);
  const GELAPPT = t => (0.13 + 0.17 * Math.sin(Math.PI * t)) * (1 + 0.5 * Math.cos(t * Math.PI * 8)) * Math.min(1, t * 9, (1 - t) * 7 + 0.1);

  const kringel = (x, y, w, l, seite) => {
    g.beginPath();
    g.moveTo(x, y);
    let px = x, py = y, a = w;
    for (let i = 1; i <= 22; i++) {
      const k = i / 22;
      a += seite * (0.06 + k * k * 0.55);
      px += Math.cos(a) * l / 22 * (1.25 - k * 0.8);
      py += Math.sin(a) * l / 22 * (1.25 - k * 0.8);
      g.lineTo(px, py);
    }
    strich(0.9);
    g.globalAlpha = 0.7;
    g.stroke();
  };
  const dorn = (x, y, w, l) => {
    const c = Math.cos(w), s = Math.sin(w), b = l * 0.3;
    g.beginPath();
    g.moveTo(x - s * b, y + c * b);
    g.quadraticCurveTo(x + c * l * 0.4 - s * b * 0.2, y + s * l * 0.4 + c * b * 0.2, x + c * l, y + s * l);
    g.quadraticCurveTo(x + c * l * 0.3 + s * b * 0.5, y + s * l * 0.3 - c * b * 0.5, x + s * b, y - c * b);
    g.closePath();
    g.globalAlpha = 0.9;
    g.fill();
  };
  const bluete = (x, y, r) => {
    const toene = rosenToene;
    for (let ring = 0; ring < 3; ring++) {
      const n = 5 - ring, weit = r * (0.62 - ring * 0.22), gr = r * (0.56 - ring * 0.1), dreh = ring * 0.7 + zufall() * 0.4;
      g.fillStyle = toene[ring];
      for (let i = 0; i < n; i++) {
        const w = dreh + i / n * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(w) * weit, y + Math.sin(w) * weit, gr, 0, Math.PI * 2);
        g.globalAlpha = 0.95;
        g.fill();
      }
    }
    g.fillStyle = toene[3];
    g.beginPath();
    g.arc(x, y, r * 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = farbe;
  };
  const knospe = (x, y, w, l) => {
    blatt(x, y, w, l * 0.5, SPITZ, 0.5);
    g.fillStyle = rosenToene[1];
    blatt(x + Math.cos(w) * l * 0.2, y + Math.sin(w) * l * 0.2, w, l * 0.6, t => 0.34 * Math.sin(Math.PI * t), 0.9);
    g.fillStyle = farbe;
  };
  const eichel = (x, y, w, l) => {
    const c = Math.cos(w), s = Math.sin(w), mx = x + c * l, my = y + s * l;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(mx, my);
    strich(0.9);
    g.globalAlpha = 0.85;
    g.stroke();
    g.save();
    g.translate(mx, my);
    g.rotate(w);
    g.beginPath();
    g.ellipse(l * 0.42, 0, l * 0.46, l * 0.3, 0, 0, Math.PI * 2);
    g.globalAlpha = 0.55;
    g.fill();
    g.globalAlpha = 0.85;
    g.stroke();
    g.beginPath();
    g.ellipse(l * 0.14, 0, l * 0.26, l * 0.36, 0, 0, Math.PI * 2);
    g.globalAlpha = 0.95;
    g.fill();
    g.restore();
  };

  // je Art: Abstand der Verzierungen, wie der Trieb verläuft und was an ihm wächst
  const ARTEN = {
    ranke: { abstand: 34, weite: 3.4, welle: 36, staerke: 0.9, an: (x, y, w, s, l) => {
      if (zufall() < 0.66) blatt(x, y, w, l * (0.9 + zufall()), SPITZ, 0.6);
      else kringel(x, y, w, l * (1.7 + zufall() * 1.3), s);
    } },
    dornen: { abstand: 14, weite: 2.8, welle: 26, staerke: 1.7, zweiter: true, kantig: true, an: (x, y, w, s, l) => {
      if (zufall() < 0.86) dorn(x, y, w, l * (0.55 + zufall() * 0.5));
      else blatt(x, y, w, l * 0.9, SPITZ, 0.5);
    } },
    rose: { abstand: 42, weite: 3, welle: 44, staerke: 1.1, an: (x, y, w, s, l, leise) => {
      const z = zufall();
      if (z < (leise ? 0.8 : 0.55)) {
        blatt(x, y, w, l * 1.3, ZACKIG, 0.5);
        blatt(x, y, w + 0.75, l * 0.85, ZACKIG, 0.5);
        blatt(x, y, w - 0.75, l * 0.85, ZACKIG, 0.5);
      } else if (z < (leise ? 0.93 : 0.85)) bluete(x + Math.cos(w) * l * 0.7, y + Math.sin(w) * l * 0.7, l * (leise ? 0.6 : 0.9));
      else knospe(x, y, w, l * 1.3);
    } },
    eiche: { abstand: 40, weite: 2.6, welle: 54, staerke: 1.2, an: (x, y, w, s, l) => {
      if (zufall() < 0.78) blatt(x, y, w, l * (1.7 + zufall() * 0.6), GELAPPT, 0.45);
      else eichel(x, y, w, l * 0.62);
    } },
  };
  const art = ARTEN[stil.rankenArt] ?? ARTEN.ranke;

  for (const { punkte, leise } of pfade) {
    const laengen = [0];
    for (let i = 1; i < punkte.length; i++) laengen.push(laengen[i - 1] + Math.hypot(punkte[i][0] - punkte[i - 1][0], punkte[i][1] - punkte[i - 1][1]));
    const L = laengen[laengen.length - 1];
    if (L < 36 * einheit) continue;
    const bei = s => {
      let i = laengen.findIndex(l => l >= s);
      i = Math.max(1, i < 0 ? punkte.length - 1 : i);
      const [ax, ay] = punkte[i - 1], [bx, by] = punkte[i], l = laengen[i] - laengen[i - 1] || 1, k = (s - laengen[i - 1]) / l;
      return [ax + (bx - ax) * k, ay + (by - ay) * k, (bx - ax) / l, (by - ay) / l];
    };
    const weite = art.weite * e * (reich ? 1.2 : 1), welle = art.welle * e, versatz = zufall() * 6.3;
    for (const phase of art.zweiter ? [0, Math.PI] : [0]) {
      g.beginPath();
      for (let s = 0; s <= L; s += 2.5 * e) {
        const [x, y, tx, ty] = bei(s), winkel = s / welle * 6.28 + versatz + phase;
        const o = (Math.sin(winkel) + (art.kantig ? 0.4 * Math.sin(winkel * 2.7) : 0)) * weite;
        if (s) g.lineTo(x - ty * o, y + tx * o); else g.moveTo(x - ty * o, y + tx * o);
      }
      strich(art.staerke * (phase ? 0.7 : 1));
      g.globalAlpha = leise ? 0.34 : 0.7;
      g.stroke();
    }
    const schritt = art.abstand * e * (reich ? 0.72 : 1.3) * (leise ? 1.7 : 1);
    let seite = zufall() < 0.5 ? -1 : 1;
    for (let s = schritt * (0.3 + zufall() * 0.7); s < L; s += schritt * (0.7 + zufall() * 0.6)) {
      const [x, y, tx, ty] = bei(s), w = Math.atan2(ty, tx) + seite * (0.55 + zufall() * 0.65);
      art.an(x, y, w, seite, (10 + zufall() * 6) * e * (leise ? 0.85 : 1), leise);
      seite = -seite;
    }
  }
  g.globalAlpha = 1;
  g.fillStyle = g.strokeStyle = farbe;
}

/** Malt das ganze Bild in die Fläche b × h. Für Vorschau und Ausgabe dieselbe Funktion, damit beide gleich aussehen. */
function male(g, b, h, plan, stil, bilder, wahl, { schaerfe = 1, zwischen = null, massstab = 1, versatz = [0, 0] } = {}) {
  // im Zoom scharf bleiben; bereits gerechnete Porträts wiederverwenden, sonst stockt das Mausrad
  const rund = (bild, px, ton, w) => {
    if (!zwischen) return portraet(bild, px, ton, w, plan.rahmen);
    const schluessel = [bild.src, px, ton, w.cx, w.cy, w.z, plan.rahmen].join('|');
    if (!zwischen.has(schluessel)) {
      if (zwischen.size > 300) zwischen.clear();
      zwischen.set(schluessel, portraet(bild, px, ton, w, plan.rahmen));
    }
    return zwischen.get(schluessel);
  };
  const grund = GRUENDE[stil.grund] ?? GRUENDE.dunkel, einheit = h / 1080;
  if (grund.innen) {
    const v = g.createRadialGradient(b / 2, h / 2, 0, b / 2, h / 2, Math.hypot(b, h) / 2);
    v.addColorStop(0, grund.innen);
    v.addColorStop(1, grund.aussen);
    g.fillStyle = v;
    g.fillRect(0, 0, b, h);
  }
  // unten etwas mehr Rand, dort liegt auf dem Bildschirm meist die Taskleiste
  const titel = (stil.titel ?? '').trim(), kopf = titel ? h * 0.11 : 0;
  const rand = h * 0.05, frei = h * 0.08, box = plan.box, rahmen = plan.rahmen ?? 'rund';
  const m = Math.min((b - 2 * rand) / (box.x1 - box.x0), (h - rand - frei - kopf) / (box.y1 - box.y0)) * massstab;
  const ox = b / 2 - (box.x0 + box.x1) / 2 * m + versatz[0] * m, oy = rand + kopf + (h - rand - frei - kopf) / 2 - (box.y0 + box.y1) / 2 * m + versatz[1] * m;
  const f = ([x, y]) => [ox + x * m, oy + y * m];
  const baum = !!(plan.zierde && stil.kontur), dicke = (STAERKE[stil.linie] ?? STAERKE.mittel) / STAERKE.mittel;
  const astZuege = (plan.aeste ?? []).map(a => ({ a, punkte: astPunkte(f(a.a ? [a.a.x, a.a.y] : a.von), f(a.b ? [a.b.x, a.b.y] : a.bis), a.kurve) }));
  if (baum) baumMalen(g, plan.zierde, f, m, wuerfel((stil.rankenSaat || 1) + (plan.zierde.saat ?? 0)), astZuege);
  g.globalAlpha = 1;
  for (const { a, punkte } of astZuege) {
    if (a.linie && baum) continue;   // die Linie verläuft im Stamm
    astMalen(g, punkte, Math.max(1.5 * einheit, a.dicke * m * dicke), Math.max(einheit, a.dicke * (a.spitze ?? 0.5) * m * dicke),
      baum ? RINDE : stil.linienfarbe, baum ? RINDE_DUNKEL : null);
  }

  if (stil.kontur) {
    g.strokeStyle = stil.linienfarbe;
    g.globalAlpha = 0.32;
    g.lineWidth = 1.4 * einheit;
    g.lineJoin = g.lineCap = 'round';
    for (const k of plan.kontur) { pfad(g, k.zug, k.zu, f); g.stroke(); }
    g.globalAlpha = 1;
  }

  g.strokeStyle = stil.linienfarbe;
  g.lineWidth = (STAERKE[stil.linie] ?? STAERKE.mittel) * einheit;
  g.lineCap = 'round';
  const gerade = stil.linienart === 'gerade';
  // Verläufe für die Ranken; die Kontur nur zart, und nur der geschlossene Umriss
  const pfade = stil.ranken !== 'aus' ? plan.kontur.filter(k => stil.kontur && k.zu).map(k => ({ punkte: [...k.zug, k.zug[0]].map(f), leise: true })) : [];
  const linie = (x1, y1, x2, y2, senkrecht = Math.abs(y2 - y1) > Math.abs(x2 - x1)) => {
    g.beginPath();
    g.moveTo(x1, y1);
    const b = gerade ? null : senkrecht ? [[x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2]] : [[(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2]];
    if (b) g.bezierCurveTo(...b[0], ...b[1], x2, y2); else g.lineTo(x2, y2);
    g.stroke();
    pfade.push({ punkte: b ? bogen([x1, y1], ...b, [x2, y2]) : [[x1, y1], [x2, y2]] });
  };
  const eckig = plan.linien === 'eckig';
  if (eckig) tafelLinien(g, plan, f, m, stil, gerade, pfade);
  else for (const { a, b: z } of plan.kanten) {
    const [x1, y1] = f([a.x, a.y]), [x2, y2] = f([z.x, z.y]);
    linie(x1, y1, x2, y2);
  }
  // Familien: Die Linien der Eltern fließen in einen gemeinsamen Stamm, aus dem die Kinder abzweigen. Am Treffpunkt haben alle
  // Linien dieselbe Richtung, von den Eltern zu den Kindern, darum gibt es dort keinen Knick, wo auch immer die Personen stehen.
  const richtung = ([ax, ay], [bx, by]) => {
    const l = Math.hypot(bx - ax, by - ay) || 1;
    return [(bx - ax) / l, (by - ay) / l, l];
  };
  const mitte = punkte => [0, 1].map(i => punkte.reduce((n, p) => n + p[i], 0) / punkte.length);
  for (const { eltern, kinder } of eckig ? [] : plan.familien) {
    const obenPunkte = eltern.map(q => f([q.x, q.y])), untenPunkte = kinder.map(q => f([q.x, q.y]));
    const e = mitte(obenPunkte), k = mitte(untenPunkte), [tx, ty, abstand] = richtung(e, k);
    // der Treffpunkt liegt jenseits aller Eltern, in Richtung der Kinder: sonst liefe eine Linie erst weg und böge dann zurück.
    // Stehen die Kinder darunter, zählt der Name der Eltern mit.
    const jenseits = Math.max(...eltern.map((q, i) => (obenPunkte[i][0] - e[0]) * tx + (obenPunkte[i][1] - e[1]) * ty
      + (q.basis ?? q.d) * m * (0.6 + (stil.namen ? 0.6 : 0.1) * Math.max(0, ty))));
    const anteil = Math.min(0.8, Math.max(0.5, jenseits / abstand)), jx = e[0] + (k[0] - e[0]) * anteil, jy = e[1] + (k[1] - e[1]) * anteil;
    const ast = (q, punkt, hinaus) => {
      let [ux, uy, weg] = richtung(punkt, [jx, jy]);
      // ein Elternteil oder eine Blase genau über dem Stamm: Er beginnt unter dem Namen, die Linie liefe sonst mitten hindurch
      if (!hinaus && stil.namen && eltern.length === 1 && uy > 0.85) return;
      // nach unten liefe die Linie durch den Namen: dann seitlich aus dem Porträt, auf der Seite des Treffpunkts
      if (!gerade && !hinaus && stil.namen && uy > 0.6) { ux = (Math.sign(jx - punkt[0]) || Math.sign(tx) || 1) * 0.8; uy = 0.6; }
      const r = (q.basis ?? q.d) * m / 2, sx = punkt[0] + ux * r, sy = punkt[1] + uy * r, l = Math.max(0, weg - r) * 0.45;
      // läuft die Linie quer zum Stamm ein, sanfter einmünden: Ein langer Griff ergäbe einen Bogen in die Gegenrichtung
      const k = hinaus ? l : l * Math.max(0.25, ux * tx + uy * ty);
      // von der Bildmitte aus: Das Porträt liegt darüber, also enden die Linien bei jeder Porträtgröße genau an seinem Rand
      g.beginPath();
      g.moveTo(punkt[0], punkt[1]);
      g.lineTo(sx, sy);
      const griff = hinaus ? [jx + tx * l, jy + ty * l] : [jx - tx * k, jy - ty * k];
      if (gerade) g.lineTo(jx, jy); else g.bezierCurveTo(sx + ux * l, sy + uy * l, ...griff, jx, jy);
      g.stroke();
      pfade.push({ punkte: gerade ? [[sx, sy], [jx, jy]] : bogen([sx, sy], [sx + ux * l, sy + uy * l], griff, [jx, jy]) });
    };
    eltern.forEach((q, i) => ast(q, obenPunkte[i], false));
    kinder.forEach((q, i) => ast(q, untenPunkte[i], true));
  }

  if (stil.ranken !== 'aus' && pfade.length) ranken(g, pfade, stil, einheit);
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (const q of plan.plaetze) {
    const [x, y] = f([q.x, q.y]), d = q.d * m, r = d / 2, w = wahl(q.e.p), bild = w.src ? bilder.get(w.src) : null, ton = w.ton || stil.ton;
    if (bild) g.drawImage(rund(bild, Math.max(8, Math.min(1200, Math.ceil(d * schaerfe / 8) * 8)), ton, w), x - r, y - r, d, d);
    else {
      umriss(g, x, y, r, rahmen);
      g.fillStyle = grund.leer;
      g.fill();
      g.fillStyle = grund.text2;
      g.font = `${d * 0.34}px ${SCHRIFT}`;
      g.textBaseline = 'middle';
      const n = q.e.p.name;
      g.fillText(`${(q.e.p.rufname || '?')[0]}${(n.nachname || '')[0] ?? ''}`, x, y);
      g.textBaseline = 'top';
    }
    umriss(g, x, y, r, rahmen);
    g.strokeStyle = ton === 'farbe' ? FARBE_SEITE[q.seite ?? q.e.seite] : stil.linienfarbe;
    g.lineWidth = Math.max(1, d * 0.028);
    g.stroke();
    if (!stil.namen) continue;
    const p = q.e.p, z = q.zweiter, breite = d * (z ? 2 : 1.36), gr = d * (z ? 0.15 : 0.17), y0 = y + r + d * 0.05;
    const zeile = (text, yy, farbe) => {
      const s = kurz(g, text, breite);
      g.strokeStyle = grund.hof ?? grund.innen;
      g.lineWidth = gr * 0.32;
      g.lineJoin = 'round';
      g.strokeText(s, x, yy);
      g.fillStyle = farbe;
      g.fillText(s, x, yy);
    };
    g.font = `600 ${gr}px ${SCHRIFT}`;
    if (z) {   // Bildblase: beide Namen, darunter beider Lebensdaten
      zeile([p.rufname, p.name.nachname].filter(Boolean).join(' '), y0, grund.text);
      zeile([z.rufname, z.name.nachname].filter(Boolean).join(' '), y0 + gr * 1.08, grund.text);
      if (stil.jahre) {
        g.font = `${gr * 0.8}px ${SCHRIFT}`;
        zeile([jahreKurz(p), jahreKurz(z)].filter(Boolean).join(' · '), y0 + gr * 2.2, grund.text2);
      }
      continue;
    }
    zeile(p.rufname || p.name.voll, y0, grund.text);
    const nach = p.name.nachname;
    if (nach) zeile(nach, y0 + gr * 1.08, grund.text);
    if (stil.jahre) {
      g.font = `${gr * 0.8}px ${SCHRIFT}`;
      zeile(jahreKurz(p), y0 + gr * (nach ? 2.2 : 1.12), grund.text2);
    }
  }
  if (titel) {   // Überschrift mit Zierlinien
    let gr = kopf * 0.5;
    g.font = `italic 600 ${gr}px ${SCHRIFT}`;
    let breite = g.measureText(titel).width;
    if (breite > b * 0.66) { gr *= b * 0.66 / breite; g.font = `italic 600 ${gr}px ${SCHRIFT}`; breite = b * 0.66; }
    const ty = rand + kopf * 0.4;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (grund.hof) {
      g.strokeStyle = grund.hof;
      g.lineWidth = gr * 0.2;
      g.lineJoin = 'round';
      g.strokeText(titel, b / 2, ty);
    }
    g.fillStyle = grund.text;
    g.fillText(titel, b / 2, ty);
    g.strokeStyle = g.fillStyle = stil.linienfarbe;
    g.lineWidth = Math.max(1, 1.4 * einheit);
    for (const v of [-1, 1]) {
      const x1 = b / 2 + v * (breite / 2 + gr * 0.5), x2 = b / 2 + v * (breite / 2 + gr * 3.2);
      g.beginPath();
      g.moveTo(x1, ty);
      g.lineTo(x2, ty);
      g.stroke();
      g.beginPath();
      g.moveTo(x2 + v * gr * 0.22, ty);
      g.lineTo(x2, ty - gr * 0.12);
      g.lineTo(x2 - v * gr * 0.22, ty);
      g.lineTo(x2, ty + gr * 0.12);
      g.closePath();
      g.fill();
    }
  }
  return { ox, oy, m };
}

/** Linien der Tafel: Eheleute waagrecht mit einem Herz, von ihrer Mitte senkrecht hinab und über einen Querbalken zu den Kindern */
function tafelLinien(g, plan, f, m, stil, gerade, pfade) {
  const unterNamen = q => q.d * m * (stil.namen ? (stil.jahre ? 1.1 : 0.92) : 0.56);
  const zug = punkte => {
    g.beginPath();
    g.moveTo(...punkte[0]);
    for (let i = 1; i < punkte.length; i++) {
      const p = punkte[i], n = punkte[i + 1];
      const r = gerade || !n ? 0 : Math.min(0.14 * m, Math.hypot(p[0] - punkte[i - 1][0], p[1] - punkte[i - 1][1]) / 2, Math.hypot(n[0] - p[0], n[1] - p[1]) / 2);
      if (r > 0.5) g.arcTo(...p, ...n, r); else g.lineTo(...p);
    }
    g.stroke();
    pfade.push({ punkte });
  };
  const herzen = [];
  for (const k of plan.kanten) {
    const A = f([k.a.x, k.a.y]), B = f([k.b.x, k.b.y]);
    zug([A, B]);
    if (k.art === 'partner') herzen.push([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, Math.min(k.a.basis ?? k.a.d, k.b.basis ?? k.b.d) * m * 0.12]);
  }
  for (const { eltern, kinder } of plan.familien) {
    const E = eltern.map(q => f([q.x, q.y])), K = kinder.map(q => f([q.x, q.y]));
    const unten = E.length ? Math.max(...eltern.map((q, i) => E[i][1] + unterNamen(q))) : null;
    const kopf = Math.min(...kinder.map((q, i) => K[i][1] - q.d * m / 2));
    const quer = unten === null ? kopf - 0.3 * m : (unten + kopf) / 2;
    const s = E.length >= 2 ? [E.reduce((a, p) => a + p[0], 0) / E.length, E.reduce((a, p) => a + p[1], 0) / E.length]
      : E.length ? [E[0][0], unten] : null;
    if (s) for (const k of K) zug([s, [s[0], quer], [k[0], quer], k]);
    else {
      const xs = K.map(k => k[0]);
      zug([[Math.min(...xs), quer], [Math.max(...xs), quer]]);
      for (const k of K) zug([[k[0], quer], k]);
    }
  }
  g.fillStyle = stil.linienfarbe;
  for (const [x, y, r] of herzen) herz(g, x, y, r);
}

// --- Fenster ---------------------------------------------------------------------------------------------
export class Werkstatt {
  constructor(daten) {
    this.daten = daten;
    this.bilder = new Map();    // Gesicht → Bild; null, solange es lädt oder wenn es fehlt
    this.ansicht = { z: 1, x: 0, y: 0 };   // Zoom der Vorschau; x, y: oberer linker Rand als Anteil der Fläche, in Zoom-Maßstab
    this.zwischen = new Map();  // gerechnete Porträts der Vorschau
    this.s = { ...VORGABE };
    try { Object.assign(this.s, JSON.parse(localStorage.getItem('lb-werkstatt') || '{}')); } catch (e) { /* Vorgabe */ }
    if (!FORMEN[this.s.form]) this.s.form = VORGABE.form;
  }

  merken() {
    try { localStorage.setItem('lb-werkstatt', JSON.stringify(this.s)); } catch (e) { /* ohne Speicher */ }
  }

  baue() {
    const el = this.el = document.createElement('div');
    el.className = 'bw-huelle';
    el.hidden = true;
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', t('Bildwerkstatt'));
    const wahl = (name, titel, optionen) => `<label class="bw-feld">${esc(titel)}<select name="${name}">${
      optionen.map(([w, n]) => `<option value="${w}">${esc(n)}</option>`).join('')}</select></label>`;
    const haken = (name, titel) => `<label class="bw-haken"><input type="checkbox" name="${name}"> ${esc(titel)}</label>`;
    const generationen = bis => Array.from({ length: bis - 3 }, (_, i) => [i + 4, t('{n} Generationen', { n: i + 4 })]);
    el.innerHTML = `
      <aside class="bw-seite">
        <div class="bw-kopf"><h2>${esc(t('Bildwerkstatt'))}</h2><button class="klein bw-zu" data-tun="zu" aria-label="${esc(t('Schließen'))}">✕</button></div>
        <section class="bw-szenen"><h3>${esc(t('Szenen'))}</h3>
          <select name="szeneWahl" aria-label="${esc(t('Gespeicherte Szenen'))}"></select>
          <div class="bw-szenen-knoepfe">
            <button class="klein" data-tun="szene-laden">${esc(t('Laden'))}</button>
            <button class="klein" data-tun="szene-loeschen">${esc(t('Löschen'))}</button>
          </div>
          <div class="bw-szenen-neu">
            <input name="szeneName" placeholder="${esc(t('Name der Szene'))}" aria-label="${esc(t('Name der Szene'))}" maxlength="60" autocomplete="off">
            <button class="klein" data-tun="szene-speichern">${esc(t('Speichern'))}</button>
          </div>
          <p class="bw-szenen-meldung" role="status"></p>
        </section>
        <section><h3>${esc(t('Form'))}</h3>
          <div class="bw-formen">${Object.keys(FORMEN).map(n => `
            <button data-form="${n}" title="${esc(t(FORM_TIPPS[n]))}" aria-pressed="false"><canvas width="96" height="72" aria-hidden="true"></canvas>${esc(t(FORM_NAMEN[n]))}</button>`).join('')}
          </div>
        </section>
        <section><h3>${esc(t('Personen'))}</h3>
          <label class="bw-feld">${esc(t('Hauptperson'))}<input name="hauptperson" list="namen" autocomplete="off"></label>
          <div class="bw-nur-frei">
            <p class="bw-tipp">${esc(t('Klick auf eine Person blendet Verwandte ein oder aus. Ziehen verschiebt sie.'))}</p>
            <button class="klein" data-tun="freineu">${esc(t('Neu beginnen'))}</button>
            <p class="bw-zahl-frei"></p>
          </div>
          <div class="bw-nur-auto">
          ${wahl('vorfahren', t('Vorfahren'), [[0, t('keine')], [1, t('Eltern')], [2, t('Großeltern')], [3, t('Urgroßeltern')], ...generationen(7)])}
          ${wahl('nachkommen', t('Nachkommen'), [[0, t('keine')], [1, t('Kinder')], [2, t('Enkel')], [3, t('Urenkel')], ...generationen(5)])}
          ${haken('partner', t('Partner'))}${haken('geschwister', t('Geschwister'))}
          ${haken('seiten', t('Vaterseite links, Mutterseite rechts'))}
          <div class="bw-nur-stamm">${wahl('stammLinie', t('Linie'), [['vater', t('über den Vater')], ['mutter', t('über die Mutter')]])}</div>
          <p class="bw-zahl" aria-live="polite"></p>
          <details class="bw-einzeln"><summary>${esc(t('Einzelne Personen'))}</summary><div class="bw-liste"></div></details>
          <button class="klein bw-ordnen" data-tun="ordnen" hidden>${esc(t('Verschobene Personen zurücksetzen'))}</button>
          </div>
        </section>
        <section><h3>${esc(t('Gestaltung'))}</h3>
          <label class="bw-feld">${esc(t('Überschrift'))}<input name="titel" maxlength="90" autocomplete="off"></label>
          <label class="bw-feld">${esc(t('Porträtgröße'))}<input type="range" name="groesse" min="0.4" max="2" step="0.05" title="${esc(t('Ändert nur die Bilder; Plätze und Linien bleiben, wie sie sind'))}"></label>
          ${wahl('rahmen', t('Rahmen'), [['rund', t('rund')], ['schild', t('Wappenschild')]])}
          ${wahl('ton', t('Bilder'), [['farbe', t('Farbe')], ['sw', t('Schwarzweiß')], ['sepia', t('Sepia')]])}
          ${wahl('linie', t('Verbindungslinien'), [['duenn', t('dünn')], ['mittel', t('mittel')], ['dick', t('dick')]])}
          ${wahl('linienart', t('Linienform'), [['geschwungen', t('geschwungen')], ['gerade', t('gerade')]])}
          <label class="bw-feld">${esc(t('Linienfarbe'))}<input type="color" name="linienfarbe"></label>
          ${wahl('ranken', t('Ranken'), [['aus', t('aus')], ['zart', t('zart')], ['reich', t('üppig')]])}
          <div class="bw-rankenwahl">
            ${wahl('rankenArt', t('Art der Ranken'), [['ranke', t('Ranke')], ['dornen', t('Dornenstrauch')], ['rose', t('Rose')], ['eiche', t('Eichenlaub')]])}
            <label class="bw-feld">${esc(t('Rankengröße'))}<input type="range" name="rankenGroesse" min="0.4" max="3" step="0.05"></label>
            <div class="bw-feld"><label for="bw-rankenfarbe">${esc(t('Rankenfarbe'))}</label>
              <button class="klein bw-rankenfarbe-aus" data-tun="rankenfarbe">${esc(t('wie die Linien'))}</button>
              <input type="color" id="bw-rankenfarbe" name="rankenFarbe"></div>
            <label class="bw-feld bw-rosenfarbe">${esc(t('Farbe der Rosen'))}<input type="color" name="rosenFarbe"></label>
            <button class="klein bw-wuerfel" data-tun="wuerfeln">${esc(t('Ranken neu würfeln'))}</button>
          </div>
          ${wahl('grund', t('Hintergrund'), [['dunkel', t('dunkel')], ['pergament', t('Pergament')], ['weiss', t('weiß')], ['klardunkel', t('transparent, für dunklen Grund')], ['klarhell', t('transparent, für hellen Grund')]])}
          ${haken('kontur', t('Kontur der Form'))}${haken('namen', t('Namen'))}${haken('jahre', t('Lebensdaten'))}
        </section>
        <section><h3>${esc(t('Ausgabe'))}</h3>
          ${wahl('format', t('Format'), formate().map(x => [x.id, `${x.name} (${x.b} × ${x.h})`]))}
          <button class="bw-speichern" data-tun="speichern">${esc(t('Als Bild speichern (PNG)'))}</button>
          <button class="bw-speichern bw-drucken" data-tun="drucken">${esc(t('Drucken'))}</button>
          <p class="bw-meldung" role="status"></p>
        </section>
      </aside>
      <div class="bw-flaeche"><canvas class="bw-vorschau" role="img" aria-label="${esc(t('Vorschau'))}" title="${esc(t('Klick oder Rechtsklick auf eine Person: Eltern, Bild, Ausblenden. Ziehen: verschieben. Rechte Maustaste auf freier Fläche: ganzes Bild verschieben. Mausrad: zoomen'))}"></canvas>
        <button class="klein bw-zoom" data-tun="zoom" title="${esc(t('Zoom zurücksetzen'))}" hidden></button></div>
      <div class="bw-kontext" role="menu" hidden></div>
      <div class="bw-wahl" hidden></div>`;
    document.body.appendChild(el);
    this.leinwand = el.querySelector('.bw-vorschau');
    this.flaeche = el.querySelector('.bw-flaeche');
    this.feld = n => el.querySelector(`[name="${n}"]`);

    el.addEventListener('input', ev => {
      if (ev.target.name === 'rankenGroesse') this.s.rankenGroesse = Number(ev.target.value);
      else if (ev.target.name === 'groesse') this.s.groesseJe[this.s.form] = Number(ev.target.value);
      else return;
      this.geaendert();
    });
    this.kontext = el.querySelector('.bw-kontext');
    this.wahlFenster = el.querySelector('.bw-wahl');
    el.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      if (!this.kontext.hidden) this.kontext.hidden = true;
      else if (!this.wahlFenster.hidden) this.wahlFenster.hidden = true;
      else this.zu();
    });
    const aufPerson = ev => {
      ev.preventDefault();
      const q = this.treffer(ev);
      if (q) this.menue(q, ev.clientX, ev.clientY); else this.kontext.hidden = true;
    };
    this.leinwand.addEventListener('contextmenu', aufPerson);
    this.leinwand.addEventListener('click', ev => {
      if (this.nachZug) { this.nachZug = false; return; }
      aufPerson(ev);
    });
    // Personen ziehen, in jeder Form; im Zoom verschiebt Ziehen auf freier Stelle die Ansicht. Ein kurzer Klick öffnet das Menü.
    this.leinwand.addEventListener('pointerdown', ev => {
      const q = this.treffer(ev);
      if (ev.button === 2 && !q) {   // rechte Maustaste auf freier Fläche: das ganze Bild im Rahmen verschieben
        this.zieht = { bild: true, x: ev.clientX, y: ev.clientY, los: false };
        this.leinwand.setPointerCapture(ev.pointerId);
        return;
      }
      if (ev.button !== 0) return;
      if (!q && this.ansicht.z === 1) return;
      this.zieht = { q, x: ev.clientX, y: ev.clientY, los: false };
      this.leinwand.setPointerCapture(ev.pointerId);
    });
    this.leinwand.addEventListener('pointermove', ev => {
      const z = this.zieht;
      if (!z) return;
      if (!z.los && Math.hypot(ev.clientX - z.x, ev.clientY - z.y) < 5) return;
      z.los = true;
      this.kontext.hidden = true;
      if (z.bild) {
        // so weit, dass die Anordnung in jeder Richtung den Bildrand erreicht und notfalls darüber hinausgeht
        const c = this.leinwand, massstab = this.sicht.f / this.sicht.m / this.ansicht.z, [x, y] = this.versatz();
        const gx = c.width / this.sicht.m, gy = c.height / this.sicht.m;
        this.s.versatzJe[this.s.form] = [
          Math.max(-gx, Math.min(gx, x + (ev.clientX - z.x) * massstab)),
          Math.max(-gy, Math.min(gy, y + (ev.clientY - z.y) * massstab)),
        ];
        z.x = ev.clientX;
        z.y = ev.clientY;
        this.leinwand.classList.add('schiebt');
        this.malen();
        return;
      }
      if (!z.q) {
        const a = this.ansicht, c = this.leinwand;
        a.x -= (ev.clientX - z.x) / c.clientWidth;
        a.y -= (ev.clientY - z.y) / c.clientHeight;
        z.x = ev.clientX;
        z.y = ev.clientY;
        this.malen();
        return;
      }
      const massstab = this.sicht.f / this.sicht.m / this.ansicht.z, box = this.plan.box, q = z.q;
      // verkleinert ist im Bild mehr Platz: bis an dessen Rand ziehen
      const k = this.massstab(), [vx, vy] = this.versatz(), mx = (box.x0 + box.x1) / 2 - vx, my = (box.y0 + box.y1) / 2 - vy, rx = (box.x1 - box.x0) / 2 / k, ry = (box.y1 - box.y0) / 2 / k;
      q.x = Math.max(mx - rx + q.d / 2, Math.min(mx + rx - q.d / 2, q.x + (ev.clientX - z.x) * massstab));
      q.y = Math.max(my - ry + q.d / 2, Math.min(my + ry - q.d / 2, q.y + (ev.clientY - z.y) * massstab));
      z.x = ev.clientX;
      z.y = ev.clientY;
      this.malen();
    });
    this.leinwand.addEventListener('pointerup', () => {
      const z = this.zieht;
      this.zieht = null;
      if (!z?.los) return;
      if (z.bild) {   // die rechte Taste löst keinen Klick aus, der wieder aufräumen würde
        this.leinwand.classList.remove('schiebt');
        this.merken();
        return;
      }
      this.nachZug = true;
      if (!z.q) return;
      const plaetze = this.s.form === 'frei' ? this.freiPlaetze() : this.verschobene();
      plaetze[z.q.e.p.id] = { x: z.q.x, y: z.q.y };
      if (z.q.zweiter) plaetze[z.q.zweiter.id] = { x: z.q.x, y: z.q.y };   // beide am selben Platz: Die Blase liegt in ihrer Mitte
      this.merken();
      this.knoepfe();
    });
    // Mausrad: über 100 % eine Lupe zum Zeiger hin, unter 100 % wird die Anordnung im Bild kleiner (siehe rad)
    this.leinwand.addEventListener('wheel', ev => {
      ev.preventDefault();
      this.kontext.hidden = true;
      const c = this.leinwand;
      this.rad(Math.exp(-ev.deltaY * 0.0015), ev.offsetX / c.clientWidth, ev.offsetY / c.clientHeight);
    }, { passive: false });
    this.kontext.addEventListener('click', ev => {
      const knopf = ev.target.closest('[data-k]'), k = knopf?.dataset.k, p = this.daten.byId.get(knopf?.dataset.p) ?? this.kontextPerson;
      if (!k || !p) return;
      this.kontext.hidden = true;
      if (k === 'eltern') this.elternUmschalten(p);
      if (k.startsWith('frei-')) this.freiUmschalten(k.slice(5), p);
      if (k === 'bild') this.bildWaehlen(p);
      if (k === 'paar') this.paarSetzen(this.kontextPerson, p);
      if (k === 'trennen') this.paarLoesen(p);
      if (k === 'linie') {
        const schluessel = linienSchluessel(this.kontextPerson, p), liste = this.ohneLinie();
        this.s.ohneLinieJe[this.s.form] = liste.includes(schluessel) ? liste.filter(x => x !== schluessel) : [...liste, schluessel];
        this.geaendert();
      }
      if (k === 'weg') {
        if (this.s.form === 'frei') delete this.freiPlaetze()[p.id];
        else this.s.aus = [...new Set([...this.s.aus, p.id])];
        this.geaendert();
      }
    });
    el.addEventListener('pointerdown', ev => { if (!this.kontext.hidden && !this.kontext.contains(ev.target) && ev.target !== this.leinwand) this.kontext.hidden = true; });
    el.addEventListener('click', ev => {
      const form = ev.target.closest('[data-form]')?.dataset.form;
      if (form) { this.s.form = form; this.geaendert(); }
      const tun = ev.target.closest('[data-tun]')?.dataset.tun;
      if (tun === 'zu') this.zu();
      if (tun === 'szene-speichern') this.szeneSpeichern();
      if (tun === 'szene-laden') this.szeneLaden();
      if (tun === 'szene-loeschen') this.szeneLoeschen();
      if (tun === 'zoom') this.zoomZurueck();
      if (tun === 'ordnen') { delete (this.s.verschoben[this.s.form] ?? {})[this.root.id]; this.geaendert(); }
      if (tun === 'freineu') { this.s.freiJe[this.root.id] = { [this.root.id]: { x: 0, y: 0 } }; this.geaendert(); }
      if (tun === 'speichern') this.speichern();
      if (tun === 'drucken') this.drucken();
      if (tun === 'rankenfarbe') { this.s.rankenFarbe = ''; this.geaendert(); }
      if (tun === 'wuerfeln') { this.s.rankenSaat = (this.s.rankenSaat || 1) + 1; this.geaendert(); }
    });
    el.addEventListener('change', ev => {
      const n = ev.target.name, w = ev.target;
      if (!n) return;
      if (n === 'szeneName') return;
      if (n === 'szeneWahl') {   // gleicher Name überschreibt die Szene beim Speichern
        this.feld('szeneName').value = w.value;
        this.szeneLoeschenBereit = null;
        return;
      }
      if (n === 'hauptperson') return this.hauptperson(w.value);
      if (n === 'groesse' || n === 'rankenGroesse') return;   // läuft schon über „input“
      if (n === 'rahmen') this.s.rahmenJe[this.s.form] = w.value;
      else if (n === 'aus') {
        this.s.aus = this.s.aus.filter(id => id !== w.value);
        if (!w.checked) this.s.aus.push(w.value);
      } else if (w.type === 'checkbox') this.s[n] = w.checked;
      else this.s[n] = ['vorfahren', 'nachkommen'].includes(n) ? Number(w.value) : w.value;
      this.geaendert();
    });
    new ResizeObserver(() => this.malen()).observe(this.flaeche);
    el.querySelectorAll('[data-form]').forEach(k => {
      const c = k.querySelector('canvas'), g = c.getContext('2d'), name = k.dataset.form, box = FORMEN[name].box;
      const m = Math.min(92 / (box.x1 - box.x0), 68 / (box.y1 - box.y0));
      const f = ([x, y]) => [48 + (x - (box.x0 + box.x1) / 2) * m, 36 + (y - (box.y0 + box.y1) / 2) * m];
      g.strokeStyle = '#d6a24e';
      g.lineWidth = 1.3;
      for (const z of FORMEN[name].kontur()) { pfad(g, z.zug, z.zu, f); g.stroke(); }
    });
  }

  oeffne(root) {
    if (!this.el) this.baue();
    this.root = root;
    this.feld('hauptperson').value = root.name.voll;
    for (const n of ['vorfahren', 'nachkommen', 'ranken', 'rankenArt', 'rankenGroesse', 'ton', 'linie', 'linienart', 'linienfarbe', 'grund', 'format', 'stammLinie', 'titel']) this.feld(n).value = this.s[n] ?? '';
    this.feld('titel').placeholder = root.name.nachname ? t('z. B. Stammbaum der Familie {name}', { name: root.name.nachname }) : '';
    for (const n of ['partner', 'geschwister', 'seiten', 'kontur', 'namen', 'jahre']) this.feld(n).checked = this.s[n];
    if (!this.feld('format').value) this.feld('format').value = this.s.format = VORGABE.format;
    this.el.hidden = false;
    this.el.focus();
    this.szenenZeigen();
    this.geaendert();
  }

  zu() {
    if (this.el) this.el.hidden = true;
  }

  hauptperson(text) {
    const v = text.trim().toLowerCase(), alle = this.daten.personen;
    const p = alle.find(x => `${x.name.voll} (${jahreKurz(x)})`.toLowerCase() === v) ?? alle.find(x => x.name.voll.toLowerCase() === v)
      ?? alle.find(x => x.name.voll.toLowerCase().startsWith(v)) ?? alle.find(x => x.name.voll.toLowerCase().includes(v));
    if (!v || !p) { this.feld('hauptperson').value = this.root.name.voll; return; }
    this.root = p;
    this.feld('hauptperson').value = p.name.voll;
    this.geaendert();
  }

  format() {
    const a = formate();
    return a.find(x => x.id === this.s.format) ?? a[0];
  }

  /** Auswahl oder Gestaltung hat sich geändert: Plan neu rechnen, Knöpfe und Liste nachziehen, Bilder laden, malen */
  geaendert() {
    this.merken();
    const frei = this.s.form === 'frei', form = FORMEN[this.s.form], fmt = this.format();
    const eintraege = frei ? [] : form.eigeneAuswahl ? stammAuswahl(this.root, this.s) : auswahl(this.root, { ...this.s, partnerAlle: !!form.partnerAlle });
    this.plan = frei ? anordnenFrei(this.root, this.freiPlaetze(), this.daten.byId, this.s.freiGroesse)
      : anordnen(this.s.form, eintraege, { namen: this.s.namen, seiten: this.s.seiten, verhaeltnis: fmt.b / fmt.h });
    this.plan.rahmen = this.s.rahmenJe[this.s.form] ?? this.plan.rahmen ?? 'rund';
    this.feld('rahmen').value = this.plan.rahmen;
    if (frei) this.massstabSetzen(Math.min(this.massstab(), freiMassstab(this.freiPlaetze(), this.s.freiGroesse, this.s.namen)));
    else {
      const eigen = this.verschobene();
      for (const q of this.plan.plaetze) if (eigen[q.e.p.id]) Object.assign(q, eigen[q.e.p.id]);
    }
    this.knoepfe();
    paareZusammenfassen(this.plan, this.paare());
    // Linien zwischen Eheleuten lassen sich je Paar ausblenden; bekannt bleiben sie für das Menü
    const ohne = new Set(this.ohneLinie());
    this.plan.paarLinien = new Set(this.plan.kanten.filter(l => l.art === 'partner').map(l => linienSchluessel(l.a.e.p, l.b.e.p)));
    this.plan.kanten = this.plan.kanten.filter(l => l.art !== 'partner' || !ohne.has(linienSchluessel(l.a.e.p, l.b.e.p)));
    // die Größe gilt nur für das Bild: Plätze und Linien richten sich weiter nach der Grundgröße
    const k = this.groesse();
    for (const q of this.plan.plaetze) { q.basis = q.d; q.d *= k; }
    this.plan.kleinstes *= k;
    this.feld('groesse').value = k;
    this.el.querySelector('.bw-rankenwahl').hidden = this.s.ranken === 'aus';
    if (!['ranke', 'dornen', 'rose', 'eiche'].includes(this.s.rankenArt)) this.s.rankenArt = 'ranke';   // z. B. die frühere Bohnenranke
    this.feld('rankenArt').value = this.s.rankenArt;
    this.feld('rosenFarbe').value = this.s.rosenFarbe || VORGABE.rosenFarbe;
    this.el.querySelector('.bw-rosenfarbe').hidden = this.s.rankenArt !== 'rose';
    this.feld('rankenFarbe').value = this.s.rankenFarbe || this.s.linienfarbe;
    this.el.querySelector('.bw-rankenfarbe-aus').hidden = !this.s.rankenFarbe;
    this.el.classList.toggle('frei', frei);
    this.el.querySelectorAll('[data-form]').forEach(k => k.setAttribute('aria-pressed', k.dataset.form === this.s.form));
    this.feld('jahre').disabled = !this.s.namen;
    // im Flügel, in der Tafel, der Eiche und der Stammlinie gilt das immer: Dort bleibt jede Seite auf ihrer Seite
    const flaeche = !!(form.flaeche || form.streng), seiten = this.feld('seiten');
    for (const n of ['nachkommen', 'partner', 'geschwister']) this.feld(n).disabled = !!form.ohne?.includes(n);
    this.el.querySelector('.bw-nur-stamm').hidden = !form.eigeneAuswahl;
    this.feld('kontur').nextSibling.textContent = ' ' + t(form.baum ? 'Baum zeichnen' : 'Kontur der Form');
    this.el.querySelector('.bw-zahl-frei').textContent = t('{n} Personen im Bild', { n: this.plan.plaetze.reduce((z, q) => z + (q.zweiter ? 2 : 1), 0) });
    seiten.disabled = flaeche;
    seiten.checked = flaeche || this.s.seiten;
    this.liste(eintraege);
    this.melden();
    for (const q of this.plan.plaetze) this.lade(this.bildVon(q.e.p).src);
    this.malen();
  }

  liste(eintraege) {
    const gruppen = new Map();
    for (const e of eintraege) {
      if (e.art === 'start') continue;
      if (!gruppen.has(e.ebene)) gruppen.set(e.ebene, []);
      gruppen.get(e.ebene).push(e);
    }
    this.el.querySelector('.bw-liste').innerHTML = [...gruppen].sort((a, b) => a[0] - b[0]).map(([g, l]) => `<h4>${esc(ebenenName(g))}</h4>`
      + l.map(e => `<label class="bw-haken"><input type="checkbox" name="aus" value="${esc(e.p.id)}"${e.aus ? '' : ' checked'}${e.weg && !e.aus ? ' disabled' : ''}> ${esc(e.p.name.voll)} <span>${esc(jahreKurz(e.p))}</span></label>`).join('')).join('');
  }

  melden() {
    const n = this.plan.plaetze.reduce((z, q) => z + (q.zweiter ? 2 : 1), 0), f = this.format(), box = this.plan.box;
    const m = Math.min(f.b * 0.9 / (box.x1 - box.x0), f.h * 0.87 / (box.y1 - box.y0)) * this.massstab();
    const klein = Math.round(this.plan.kleinstes * m);
    const teil = this.el.querySelector('.bw-zahl');
    teil.textContent = t('{n} Personen im Bild', { n }) + (klein < 40 ? ' · ' + t('sehr eng: Porträts nur {px} Pixel groß', { px: klein }) : '');
    teil.classList.toggle('warnung', klein < 40);
  }

  lade(src) {
    if (!src || this.bilder.has(src)) return;
    this.bilder.set(src, null);
    const img = new Image();
    img.onload = () => { this.bilder.set(src, img); this.malen(); };
    img.src = src;
  }

  /** Vorschau: höchstens einmal je Bild neu malen, die Gesichter treffen einzeln ein */
  malen() {
    if (this.wartet || !this.el || this.el.hidden || !this.plan) return;
    this.wartet = requestAnimationFrame(() => {
      this.wartet = 0;
      const f = this.format(), raum = this.flaeche.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      const s = Math.min((raum.width - 32) / f.b, (raum.height - 32) / f.h);
      if (s <= 0) return;
      const b = f.b * s, h = f.h * s, c = this.leinwand;
      c.style.width = `${b}px`;
      c.style.height = `${h}px`;
      c.width = Math.round(b * dpr);
      c.height = Math.round(h * dpr);
      const a = this.ansicht, g = c.getContext('2d');
      a.x = Math.max(0, Math.min(a.z - 1, a.x));
      a.y = Math.max(0, Math.min(a.z - 1, a.y));
      const vx = a.x * c.width, vy = a.y * c.height;
      g.setTransform(a.z, 0, 0, a.z, -vx, -vy);
      this.sicht = { ...male(g, c.width, c.height, this.plan, this.s, this.bilder, p => this.bildVon(p), { schaerfe: a.z, zwischen: this.zwischen, massstab: this.massstab(), versatz: this.versatz() }), f: c.width / b, vx, vy };
      const anzeige = this.el.querySelector('.bw-zoom');
      const gesamt = a.z * this.massstab();
      anzeige.hidden = Math.abs(gesamt - 1) < 0.005 && !this.s.versatzJe[this.s.form];
      anzeige.textContent = `${Math.round(gesamt * 100)} % ✕`;
      c.classList.toggle('gezoomt', a.z > 1);
      c.classList.toggle('klar', !GRUENDE[this.s.grund]?.innen);
      c.classList.toggle('klar-hell', this.s.grund === 'klarhell');
    });
  }

  massstab() {
    return this.s.massstabJe[this.s.form] ?? 1;
  }

  groesse() {
    return this.s.groesseJe[this.s.form] ?? 1;
  }

  /** Porträtgröße der freien Form, wie sie im Bild steht */
  freiD() {
    return this.s.freiGroesse * (this.s.groesseJe.frei ?? 1);
  }

  /** Das ganze Bild im Rahmen verschoben, in Einheiten der Form */
  versatz() {
    return this.s.versatzJe[this.s.form] ?? [0, 0];
  }

  massstabSetzen(k) {
    this.s.massstabJe[this.s.form] = Math.max(0.15, Math.min(1, k));
    this.merken();
  }

  /** Von Hand verschobene Personen der aktuellen Form und Hauptperson */
  verschobene() {
    const je = this.s.verschoben[this.s.form] ??= {};
    return je[this.root.id] ??= {};
  }

  knoepfe() {
    this.el.querySelector('.bw-ordnen').hidden = this.s.form === 'frei' || !Object.keys(this.verschobene()).length;
  }

  /** Mausrad: Hinein vergrößert erst die Anordnung bis 100 %, dann die Lupe; hinaus umgekehrt. Die Lupe betrifft nur die Ansicht,
   *  die Größe der Anordnung wird mit dem Bild gespeichert: Verkleinert ist darin mehr Platz für weitere Personen. */
  rad(faktor, px, py) {
    const k = this.massstab();
    if (this.ansicht.z > 1 || (faktor > 1 && k >= 1)) return this.zoomen(this.ansicht.z * faktor, px, py);
    this.massstabSetzen(k * faktor);
    this.melden();
    this.malen();
  }

  zoomZurueck() {
    this.zoomen(1);
    const frei = this.s.form === 'frei';
    this.massstabSetzen(frei ? freiMassstab(this.freiPlaetze(), this.s.freiGroesse, this.s.namen) : 1);
    delete this.s.versatzJe[this.s.form];
    this.merken();
    this.melden();
    this.malen();
  }

  /** Zoom der Vorschau setzen; (px, py) als Anteil der Fläche bleibt dabei an seinem Platz */
  zoomen(z, px = 0.5, py = 0.5) {
    const a = this.ansicht, neu = Math.max(1, Math.min(8, z));
    a.x = (a.x + px) * neu / a.z - px;
    a.y = (a.y + py) * neu / a.z - py;
    a.z = neu;
    this.malen();
  }

  /** Paare ohne Linie zwischen den Eheleuten, je Form */
  ohneLinie() {
    return this.s.ohneLinieJe[this.s.form] ??= [];
  }

  /** Paare in einer Bildblase, je Form */
  paare() {
    return this.s.paareJe[this.s.form] ??= [];
  }

  zweiterVon(p) {
    const paar = this.paare().find(x => x.includes(p.id));
    return paar ? this.daten.byId.get(paar[0] === p.id ? paar[1] : paar[0]) : null;
  }

  paarSetzen(a, b) {
    this.s.paareJe[this.s.form] = [...this.paare().filter(x => !x.includes(a.id) && !x.includes(b.id)), [a.id, b.id]];
    this.geaendert();
  }

  /** Wieder zwei Personen: Stehen beide am selben Platz, weil die Blase gezogen wurde, rückt die zweite daneben */
  paarLoesen(p) {
    const paar = this.paare().find(x => x.includes(p.id));
    if (!paar) return;
    this.s.paareJe[this.s.form] = this.paare().filter(x => x !== paar);
    const plaetze = this.s.form === 'frei' ? this.freiPlaetze() : this.verschobene(), [a, b] = paar.map(id => plaetze[id]);
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 0.01) {
      if (this.s.form === 'frei') b.x = a.x + this.s.freiGroesse * 1.42;
      else { delete plaetze[paar[0]]; delete plaetze[paar[1]]; }
    }
    this.geaendert();
  }

  /** Medien einer Person, in der Bildblase auch die des Partners */
  medienVon(p) {
    const z = this.zweiterVon(p), alle = [...(p.alleBilder ?? p.bilder ?? []), ...(z ? z.alleBilder ?? z.bilder ?? [] : [])];
    return alle.filter((b, i) => alle.findIndex(x => (x.id || x.src) === (b.id || b.src)) === i);
  }

  /** Bild einer Person: eigene Wahl mit Ausschnitt, sonst das Gesicht wie auf der Bühne */
  bildVon(p) {
    const w = this.s.portraets[p.id], vorgabe = p.gesicht ?? this.zweiterVon(p)?.gesicht;
    if (!w) return { src: vorgabe };
    const b = w.id ? this.medienVon(p).find(x => (x.id || x.src) === w.id) : null;
    return { ...w, src: b?.src ?? vorgabe };
  }

  /** Plätze der freien Form für die aktuelle Hauptperson; sie selbst steht immer darin */
  freiPlaetze() {
    const je = this.s.freiJe, id = this.root.id;
    je[id] ??= {};
    je[id][id] ??= { x: 0, y: 0 };
    return je[id];
  }

  /** Frei: Verwandte einer Person ein- oder ausblenden; beim Ausblenden gehen auch die dahinterliegenden Linien mit */
  freiUmschalten(art, p) {
    const plaetze = this.freiPlaetze(), liste = this.verwandte(art, p);
    if (liste.some(x => plaetze[x.id])) {
      const weg = [...liste];
      while (weg.length) {
        const x = weg.pop();
        if (x === this.root || !plaetze[x.id]) continue;
        delete plaetze[x.id];
        if (art === 'eltern') weg.push(...(x.eltern ?? []));
        if (art === 'kinder') weg.push(...(x.kinderP ?? []));
      }
    } else freiEinblenden(plaetze, p, art, liste.filter(x => !plaetze[x.id]), this.freiD(), this.s.namen);
    this.geaendert();
  }

  verwandte(art, p) {
    return { eltern: p.eltern ?? [], partner: p.partnerP ?? [], kinder: p.kinderP ?? [], geschwister: geschwisterVon(p) }[art] ?? [];
  }

  /** Person unter dem Zeiger */
  treffer(ev) {
    if (!this.sicht) return null;
    const { ox, oy, m, f, vx, vy } = this.sicht, z = this.ansicht.z, x = (ev.offsetX * f + vx) / z, y = (ev.offsetY * f + vy) / z;
    return this.plan.plaetze.find(q => Math.hypot(ox + q.x * m - x, oy + q.y * m - y) <= q.d * m / 2) ?? null;
  }

  menue(q, x, y) {
    const p = q.e.p, zweiter = q.zweiter ?? null, k = this.kontext, frei = this.s.form === 'frei';
    this.kontextPerson = p;
    const zu = new Set(this.plan.plaetze.flatMap(o => [o.e.p, o.zweiter].filter(Boolean)));
    const knopf = (kennung, person, text, an = true) => `<button role="menuitem" data-k="${kennung}" data-p="${esc(person.id)}"${an ? '' : ' disabled'}>${esc(text)}</button>`;
    const fuer = person => {
      const eltern = person.eltern ?? [], offen = eltern.some(e => zu.has(e));
      if (frei) return [['eltern', 'Eltern einblenden', 'Eltern ausblenden'], ['partner', 'Partner einblenden', 'Partner ausblenden'], ['kinder', 'Kinder einblenden', 'Kinder ausblenden'],
        ['geschwister', 'Geschwister einblenden', 'Geschwister ausblenden']].map(([art, ein, aus]) => {
        const liste = this.verwandte(art, person);
        return knopf(`frei-${art}`, person, t(liste.some(x => zu.has(x)) ? aus : ein), liste.length > 0);
      }).join('');
      if (FORMEN[this.s.form].eigeneAuswahl) return '';
      const darf = eltern.length && (person !== p || !['kind', 'geschwister', 'schwieger'].includes(q.e.art));
      return knopf('eltern', person, t(!eltern.length ? 'Keine Eltern bekannt' : offen ? 'Eltern ausblenden' : 'Eltern einblenden'), !!darf);
    };
    const name = person => zweiter ? `<h5>${esc(person.rufname || person.name.voll)}</h5>` : '';
    // zusammenfassen geht mit jedem Partner, der im Bild steht und noch frei ist
    const partner = zweiter ? [] : (p.partnerP ?? []).filter(x => zu.has(x) && !this.zweiterVon(x));
    const linien = zweiter ? [] : (p.partnerP ?? []).filter(x => this.plan.paarLinien.has(linienSchluessel(p, x)));
    k.innerHTML = `<h4>${esc(zweiter ? `${p.name.voll} & ${zweiter.name.voll}` : p.name.voll)}</h4>
      ${name(p)}${fuer(p)}${zweiter ? name(zweiter) + fuer(zweiter) : ''}
      ${partner.map(x => knopf('paar', x, t('Mit {name} zusammenfassen', { name: x.rufname || x.name.voll }))).join('')}
      ${linien.map(x => knopf('linie', x, t(this.ohneLinie().includes(linienSchluessel(p, x)) ? 'Linie zu {name} einblenden' : 'Linie zu {name} ausblenden', { name: x.rufname || x.name.voll }))).join('')}
      ${zweiter ? knopf('trennen', p, t('Wieder trennen')) : ''}
      <button role="menuitem" data-k="bild">${esc(t('Bild wählen …'))}</button>
      ${q.e.art === 'start' || zweiter ? '' : `<button role="menuitem" data-k="weg">${esc(t('Person ausblenden'))}</button>`}`;
    k.hidden = false;
    k.style.left = `${Math.min(x, innerWidth - k.offsetWidth - 8)}px`;
    k.style.top = `${Math.min(y, innerHeight - k.offsetHeight - 8)}px`;
    k.querySelector('button:not([disabled])')?.focus();
  }

  /** Eltern einer Person aus- oder einblenden, einblenden auch über die eingestellte Generation hinaus */
  elternUmschalten(p) {
    const ids = (p.eltern ?? []).map(e => e.id), zu = new Set(this.plan.plaetze.flatMap(o => [o.e.p.id, o.zweiter?.id]));
    if (ids.some(id => zu.has(id))) {
      this.s.aus = [...new Set([...this.s.aus, ...ids])];
      this.s.mehr = this.s.mehr.filter(id => id !== p.id);
    } else {
      this.s.aus = this.s.aus.filter(id => !ids.includes(id));
      this.s.mehr = [...new Set([...this.s.mehr, p.id])];
    }
    this.geaendert();
  }

  /** Bild aus den Medien der Person wählen und den Ausschnitt festlegen */
  bildWaehlen(p) {
    const fenster = this.wahlFenster, alle = this.medienVon(p), w = this.s.portraets[p.id] ?? {}, zweiter = this.zweiterVon(p);
    const a = this.aw = { p, id: w.id ?? '', cx: w.cx ?? 0.5, cy: w.cy ?? 0.5, z: w.z ?? 1, ton: w.ton ?? '' };
    const kachel = (id, src, titel) => `<button data-bild="${esc(id)}" title="${esc(titel)}" aria-pressed="${id === a.id}"><img src="${esc(src)}" alt="${esc(titel)}" loading="lazy"></button>`;
    fenster.innerHTML = `<div class="bw-wahl-fenster">
      <h3>${esc(t('Bild für {name}', { name: zweiter ? `${p.rufname} & ${zweiter.rufname}` : p.name.voll }))}</h3>
      <div class="bw-wahl-raster">${p.gesicht ?? zweiter?.gesicht ? kachel('', p.gesicht ?? zweiter.gesicht, t('Vorgabe')) : ''}${alle.map(b => kachel(b.id || b.src, b.src, b.titel || '')).join('')}</div>
      <div class="bw-wahl-rechts">
        <canvas class="bw-ausschnitt" width="280" height="280" title="${esc(t('Ziehen: verschieben, Mausrad: vergrößern'))}"></canvas>
        <label class="bw-feld">${esc(t('Ausschnitt'))}<input type="range" name="aw-z" min="1" max="6" step="0.05" value="${a.z}"></label>
        <label class="bw-feld">${esc(t('Bilder'))}<select name="aw-ton"><option value="">${esc(t('wie alle'))}</option><option value="farbe">${esc(t('Farbe'))}</option><option value="sw">${esc(t('Schwarzweiß'))}</option><option value="sepia">${esc(t('Sepia'))}</option></select></label>
        <div class="bw-wahl-knoepfe"><button class="klein" data-aw="vorgabe">${esc(t('↺ Vorgabe'))}</button><button class="klein" data-aw="fertig">${esc(t('Fertig'))}</button></div>
      </div></div>`;
    fenster.hidden = false;
    fenster.querySelector('[name="aw-ton"]').value = a.ton;
    fenster.querySelectorAll('.bw-wahl-raster img').forEach(i => { i.onerror = () => i.closest('button').remove(); });
    const leinwand = fenster.querySelector('.bw-ausschnitt'), g = leinwand.getContext('2d'), L = leinwand.width;
    const seite = () => Math.min(a.bild.naturalWidth, a.bild.naturalHeight) / a.z;
    const klemmen = () => {
      if (!a.bild) return;
      const s = seite(), hb = s / 2 / a.bild.naturalWidth, hh = s / 2 / a.bild.naturalHeight;
      a.cx = Math.max(hb, Math.min(1 - hb, a.cx));
      a.cy = Math.max(hh, Math.min(1 - hh, a.cy));
    };
    const zeigen = () => {
      g.clearRect(0, 0, L, L);
      if (!a.bild) return;
      klemmen();
      const s = seite();
      g.drawImage(a.bild, a.cx * a.bild.naturalWidth - s / 2, a.cy * a.bild.naturalHeight - s / 2, s, s, 0, 0, L, L);
      g.fillStyle = 'rgba(5, 7, 10, 0.62)';
      g.beginPath();
      g.rect(0, 0, L, L);
      g.arc(L / 2, L / 2, L / 2 - 2, 0, 2 * Math.PI, true);
      g.fill('evenodd');
    };
    const uebernehmen = () => {
      klemmen();
      const { id, cx, cy, z, ton } = a;
      if (!id && !ton && z === 1 && cx === 0.5 && cy === 0.5) delete this.s.portraets[p.id];
      else this.s.portraets[p.id] = { id, cx, cy, z, ton };
      this.merken();
      this.lade(this.bildVon(p).src);
      this.malen();
    };
    const bildLaden = () => {
      const src = a.id ? alle.find(b => (b.id || b.src) === a.id)?.src ?? this.bildVon(p).src : p.gesicht ?? zweiter?.gesicht;
      a.bild = null;
      zeigen();
      if (!src) return;
      const img = new Image();
      img.onload = () => { a.bild = img; this.bilder.set(src, img); zeigen(); uebernehmen(); };
      img.src = src;
    };
    fenster.onclick = ev => {
      const k = ev.target.closest('[data-bild]');
      if (k) {
        Object.assign(a, { id: k.dataset.bild, cx: 0.5, cy: 0.5, z: 1 });
        fenster.querySelector('[name="aw-z"]').value = 1;
        fenster.querySelectorAll('[data-bild]').forEach(x => x.setAttribute('aria-pressed', x === k));
        bildLaden();
      }
      const tun = ev.target.closest('[data-aw]')?.dataset.aw;
      if (tun === 'vorgabe') {
        delete this.s.portraets[p.id];
        this.merken();
        this.malen();
        return this.bildWaehlen(p);
      }
      if (tun === 'fertig' || ev.target === fenster) fenster.hidden = true;
    };
    fenster.oninput = ev => {
      if (ev.target.name === 'aw-z') a.z = Number(ev.target.value);
      if (ev.target.name === 'aw-ton') a.ton = ev.target.value;
      if (ev.target.name?.startsWith('aw-')) { ev.stopPropagation(); zeigen(); uebernehmen(); }
    };
    fenster.onchange = ev => ev.stopPropagation();
    let zug = null;
    leinwand.onpointerdown = ev => { zug = { x: ev.clientX, y: ev.clientY }; leinwand.setPointerCapture(ev.pointerId); };
    leinwand.onpointermove = ev => {
      if (!zug || !a.bild) return;
      const m = seite() / L;
      a.cx -= (ev.clientX - zug.x) * m / a.bild.naturalWidth;
      a.cy -= (ev.clientY - zug.y) * m / a.bild.naturalHeight;
      zug = { x: ev.clientX, y: ev.clientY };
      zeigen();
    };
    leinwand.onpointerup = () => { zug = null; uebernehmen(); };
    leinwand.onwheel = ev => {
      ev.preventDefault();
      a.z = Math.max(1, Math.min(6, a.z * Math.exp(-ev.deltaY * 0.001)));
      fenster.querySelector('[name="aw-z"]').value = a.z;
      zeigen();
      uebernehmen();
    };
    bildLaden();
    fenster.querySelector('[data-aw="fertig"]').focus();
  }

  // --- Szenen: benannte Stände der Werkstatt, im Browser gemerkt (localStorage lb-szenen) --------------------------------
  szenen() {
    try {
      const liste = JSON.parse(localStorage.getItem('lb-szenen') || '[]');
      return Array.isArray(liste) ? liste : [];
    } catch (err) { return []; }
  }

  szenenSichern(liste) {
    try {
      localStorage.setItem('lb-szenen', JSON.stringify(liste));
      return true;
    } catch (err) { return false; }
  }

  szenenMeldung(text) {
    this.el.querySelector('.bw-szenen-meldung').textContent = text;
  }

  szenenZeigen(gewaehlt = this.feld('szeneWahl').value) {
    const wahl = this.feld('szeneWahl'), liste = this.szenen();
    wahl.innerHTML = liste.length ? liste.map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('') : `<option value="">${esc(t('Noch keine Szene gespeichert'))}</option>`;
    if (liste.some(x => x.name === gewaehlt)) wahl.value = gewaehlt;
    wahl.disabled = !liste.length;
    for (const k of ['laden', 'loeschen']) this.el.querySelector(`[data-tun="szene-${k}"]`).disabled = !liste.length;
    this.el.querySelector('[data-tun="szene-loeschen"]').textContent = t('Löschen');
    this.szeneLoeschenBereit = null;
  }

  /** Der aktuelle Stand als reine Daten */
  szeneErstellen(name) {
    const f = this.s.form, r = this.root.id, werte = {};
    for (const k of SZENEN_WERTE) werte[k] = this.s[k];
    return JSON.parse(JSON.stringify({ name, zeit: Date.now(), root: r, werte, frei: this.s.freiJe[r], verschoben: this.s.verschoben[f]?.[r],
      groesse: this.s.groesseJe[f], rahmen: this.s.rahmenJe[f], paare: this.s.paareJe[f], ohneLinie: this.s.ohneLinieJe[f], massstab: this.s.massstabJe[f], versatz: this.s.versatzJe[f] }));
  }

  szeneSpeichern() {
    const name = this.feld('szeneName').value.trim();
    if (!name) { this.szenenMeldung(t('Bitte einen Namen eingeben.')); this.feld('szeneName').focus(); return; }
    const liste = this.szenen(), neu = this.szeneErstellen(name), i = liste.findIndex(x => x.name === name);
    if (i >= 0) liste[i] = neu; else liste.push(neu);
    liste.sort((a, b) => a.name.localeCompare(b.name));
    if (!this.szenenSichern(liste)) { this.szenenMeldung(t('Szene ließ sich nicht speichern: Der Browser hat keinen Platz mehr.')); return; }
    this.szenenZeigen(name);
    this.szenenMeldung(t(i >= 0 ? 'Szene „{name}“ überschrieben.' : 'Szene „{name}“ gespeichert.', { name }));
  }

  szeneLaden() {
    const name = this.feld('szeneWahl').value, sz = this.szenen().find(x => x.name === name);
    if (!sz) return;
    const root = this.daten.byId.get(sz.root);
    if (!root) { this.szenenMeldung(t('Die Hauptperson dieser Szene ist in diesem Stammbaum nicht sichtbar.')); return; }
    Object.assign(this.s, Object.fromEntries(SZENEN_WERTE.map(k => [k, sz.werte?.[k] ?? VORGABE[k]])));
    if (!FORMEN[this.s.form]) this.s.form = VORGABE.form;
    const f = this.s.form, setzen = (je, wert) => { if (wert === undefined) delete je[f]; else je[f] = wert; };
    if (sz.frei) this.s.freiJe[sz.root] = sz.frei; else delete this.s.freiJe[sz.root];
    (this.s.verschoben[f] ??= {})[sz.root] = sz.verschoben ?? {};
    setzen(this.s.groesseJe, sz.groesse);
    setzen(this.s.rahmenJe, sz.rahmen);
    setzen(this.s.paareJe, sz.paare);
    setzen(this.s.ohneLinieJe, sz.ohneLinie);
    setzen(this.s.massstabJe, sz.massstab);
    setzen(this.s.versatzJe, sz.versatz);
    this.ansicht = { z: 1, x: 0, y: 0 };
    this.feld('szeneName').value = name;
    this.oeffne(root);
    this.szenenMeldung(t('Szene „{name}“ geladen.', { name }));
  }

  /** Löschen braucht einen zweiten Klick: Eine Szene lässt sich nicht zurückholen */
  szeneLoeschen() {
    const name = this.feld('szeneWahl').value;
    if (!name) return;
    if (this.szeneLoeschenBereit !== name) {
      this.szeneLoeschenBereit = name;
      this.el.querySelector('[data-tun="szene-loeschen"]').textContent = t('Wirklich löschen?');
      return;
    }
    this.szenenSichern(this.szenen().filter(x => x.name !== name));
    this.szenenZeigen();
    this.szenenMeldung(t('Szene „{name}“ gelöscht.', { name }));
  }

  /** Das fertige Bild in voller Größe. Gesichter kommen dafür in der großen Fassung, soweit das Format sie braucht. */
  async bildErstellen() {
    const f = this.format(), box = this.plan.box;
    const m = Math.min((f.b - 2 * f.h * 0.05) / (box.x1 - box.x0), (f.h * 0.87) / (box.y1 - box.y0)) * this.massstab();
    const lade = src => new Promise(fertig => {
      const img = new Image();
      img.onload = () => fertig(img);
      img.onerror = () => fertig(null);
      img.src = src;
    });
    const karte = new Map(this.bilder), klein = [], wegen = new Map();
    for (const q of this.plan.plaetze) {
      const w = this.bildVon(q.e.p);
      if (!w.src) continue;
      const alt = wegen.get(w.src) ?? { px: 0, w };
      wegen.set(w.src, { ...alt, px: Math.max(alt.px, q.d * m * (w.z ?? 1)) });
    }
    await Promise.all([...wegen].map(async ([src, { px, w }]) => {
      let bild = this.bilder.get(src) ?? await lade(src);
      // eigene Medien sind schon das Original; das Gesicht gibt es größer
      if (bild && !w.id && px > bild.naturalWidth * 0.9) {
        const gross = await lade(`${src}${src.includes('?') ? '&' : '?'}g=1`);
        if (gross?.naturalWidth > bild.naturalWidth) bild = gross;   // kleine Originale gibt es nicht größer
      }
      if (bild) karte.set(src, bild);
    }));
    for (const q of this.plan.plaetze) {
      const w = this.bildVon(q.e.p), bild = w.src ? karte.get(w.src) : null;
      if (bild && Math.min(bild.naturalWidth, bild.naturalHeight) / (w.z ?? 1) < q.d * m * 0.5) klein.push(q.e.p.rufname || q.e.p.name.voll);
    }
    const c = document.createElement('canvas');
    c.width = f.b;
    c.height = f.h;
    male(c.getContext('2d'), f.b, f.h, this.plan, this.s, karte, p => this.bildVon(p), { massstab: this.massstab(), versatz: this.versatz() });
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('kein Bild');
    return { blob, f, klein, name: `Stammbaum-${this.root.name.voll}-${f.b}x${f.h}`.replace(/[^\p{L}\p{N}]+/gu, '-') + '.png' };
  }

  /** Knöpfe sperren, Bild erstellen, mit dem Ergebnis weitermachen, Meldung zeigen */
  async ausgeben(tun) {
    const knoepfe = this.el.querySelectorAll('.bw-speichern'), meldung = this.el.querySelector('.bw-meldung');
    knoepfe.forEach(k => { k.disabled = true; });
    meldung.textContent = t('Bild wird erstellt …');
    try {
      const bild = await this.bildErstellen();
      const text = await tun(bild);
      const hinweis = bild.klein.length ? t('Für dieses Format zu klein: {namen}', { namen: bild.klein.slice(0, 6).join(', ') + (bild.klein.length > 6 ? ' …' : '') }) : '';
      meldung.textContent = [text, hinweis].filter(Boolean).join(' ');
    } catch (err) {
      meldung.textContent = t('Das Bild ließ sich nicht erstellen.');
    }
    knoepfe.forEach(k => { k.disabled = false; });
  }

  speichern() {
    return this.ausgeben(async ({ blob, name }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      return t('Gespeichert: {name}', { name });
    });
  }

  /** Das fertige Bild in einem unsichtbaren Rahmen drucken; das Papierformat gibt der Druckdialog vor */
  drucken() {
    return this.ausgeben(({ blob, f }) => new Promise((fertig, fehler) => {
      const url = URL.createObjectURL(blob), rahmen = document.createElement('iframe');
      rahmen.className = 'bw-druckrahmen';
      rahmen.title = t('Drucken');
      rahmen.srcdoc = `<!doctype html><title>${esc(t('Bildwerkstatt'))}</title><style>@page { size: ${f.druck ?? 'auto'}; margin: 0 }
        html, body { margin: 0; height: 100% } img { display: block; width: 100%; height: 100%; object-fit: contain }</style><img src="${url}">`;
      rahmen.onload = async () => {
        try {
          await rahmen.contentDocument.querySelector('img').decode();
          rahmen.contentWindow.focus();
          rahmen.contentWindow.print();
          fertig('');
        } catch (err) { fehler(err); }
        setTimeout(() => { rahmen.remove(); URL.revokeObjectURL(url); }, 60000);
      };
      this.el.appendChild(rahmen);
    }));
  }
}
