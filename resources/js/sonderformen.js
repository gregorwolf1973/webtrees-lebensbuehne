// Besondere Darstellungen der Bildwerkstatt: Lebensfäden, Wanderkarte, Ahnengalerie, Rosette, Wurzelwerk, Sternbild, Lebensstrom
// und Gesichtermosaik. Jede Form legt ihre Personen selbst aus (Porträtgröße 1) und bringt eigene Zeichnungen mit, die male() in
// werkstatt.js an festen Stellen aufruft: hinten (Hintergrund), linienMalen (statt der Verbindungslinien), beschriftung (statt der
// Namen unter dem Porträt) und vorne (über den Porträts). Der Haken „Kontur/Baum“ schaltet den Hintergrund (k.verziert).
import { t } from 'lb/text.js';
import { LB, jahreKurz } from 'lb/daten.js';
import { einheiten, ordne, knoten, umrandung, eicheAnordnen, nachSosa, kreis, glatt, SYMBOL_BOX } from 'lb/formen.js';

const JETZT = new Date().getFullYear();
const TAU = 2 * Math.PI;
const nachGeburt = (a, b) => a.geburt - b.geburt;
const nameZeile = p => [p.rufname || p.name.voll, p.name.nachname].filter(Boolean).join(' ');

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function wuerfel(saat) {
  let z = (saat * 2654435761) >>> 0;
  return () => {
    z = (z + 0x6D2B79F5) >>> 0;
    let x = Math.imul(z ^ (z >>> 15), 1 | z);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const sichtbarVon = eintraege => eintraege.filter(e => !e.weg);
const startVon = sichtbar => sichtbar.find(e => e.art === 'start');
/** Nur die eigenen Vorfahren der Hauptperson (ohne die Eltern eines Partners) */
function ahnenVon(sichtbar, start) {
  const zu = e => { while (e && e !== start) { if (e.art !== 'eltern') return false; e = e.von; } return !!e; };
  return sichtbar.filter(e => e !== start && zu(e));
}

/** Lebensspanne für Zeichnungen: ohne Sterbejahr bei Lebenden bis heute, sonst geschätzt (unsicheres Ende) */
function lebenszeit(p) {
  const von = p.geburt ?? p.jahrE ?? null;
  if (von == null) return null;
  if (p.tod != null) return { von, bis: Math.max(p.tod, von), offen: false, unsicher: false };
  if (von > JETZT - 100) return { von, bis: JETZT, offen: true, unsicher: false };
  return { von, bis: von + 60, offen: false, unsicher: true };
}

function geburtsort(p) {
  const ev = p.ereignisse ?? [], mit = x => x.ort && x.ort.lat != null && x.ort.lon != null;
  const e = ev.find(x => x.art === 'BIRT' && mit(x)) ?? ev.find(x => (x.art === 'CHR' || x.art === 'BAPM') && mit(x)) ?? ev.find(mit);
  return e ? { lat: e.ort.lat, lon: e.ort.lon, name: String(e.ort.name || '').split(',')[0].trim() } : null;
}

/** Text mit Hof, damit er auf jedem Grund lesbar bleibt */
function schreibe(k, text, x, y, farbe, hof = k.schrift?.hof ?? k.grund.hof ?? k.grund.innen, breite = Infinity) {
  const s = Number.isFinite(breite) ? k.kurz(k.g, text, breite) : text;
  if (hof) {
    k.g.strokeStyle = hof;
    k.g.lineWidth = Number(/([\d.]+)px/.exec(k.g.font)?.[1] ?? 12) * 0.3;
    k.g.lineJoin = 'round';
    k.g.strokeText(s, x, y);
  }
  k.g.fillStyle = farbe;
  k.g.fillText(s, x, y);
}

function hinweis(k, text) {
  const { g, b, h } = k;
  g.font = `italic ${h * 0.03}px ${k.SCHRIFT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  schreibe(k, text, b / 2, h / 2, k.grund.text2);
}

const dunkelGrund = k => ['dunkel', 'klardunkel'].includes(k.stil.grund);

/** Überlappungen auflösen: Kästen aus Gesicht und Namen schieben sich auseinander, eine Feder zieht sie zu ihrem Ziel zurück */
function entzerren(plaetze, w, h, ziele = null, runden = 140) {
  for (let r = 0; r < runden; r++) {
    for (let i = 0; i < plaetze.length; i++) {
      for (let j = i + 1; j < plaetze.length; j++) {
        const a = plaetze[i], b = plaetze[j], dx = b.x - a.x, dy = b.y - a.y, s = (a.d + b.d) / 2;
        const ox = w * s - Math.abs(dx), oy = h * s - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) { const v = (ox / 2 + 0.005) * (Math.sign(dx) || (i % 2 ? 1 : -1)); a.x -= v; b.x += v; }
        else { const v = (oy / 2 + 0.005) * (Math.sign(dy) || 1); a.y -= v; b.y += v; }
      }
    }
    if (ziele && r < runden - 30) for (const q of plaetze) { const z = ziele.get(q); if (z) { q.x += (z[0] - q.x) * 0.04; q.y += (z[1] - q.y) * 0.04; } }
  }
}

/** Aufwendige Hintergründe aus vielen kleinen Teilen einmal auf einer eigenen Fläche malen (im Hauptspeicher, das ist für tausende
 *  kleine Zeichenbefehle viel schneller als die Grafikkarte) und danach nur noch als ein Bild übernehmen */
const vorraete = new Map();
function vorrat(k, schluessel, b, h, malen) {
  const s = `${schluessel}|${Math.round(b)}|${Math.round(h)}`;
  let c = vorraete.get(s);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(b));
    c.height = Math.max(1, Math.round(h));
    malen(c.getContext('2d', { willReadFrequently: true }));
    if (vorraete.size > 6) vorraete.delete(vorraete.keys().next().value);
    vorraete.set(s, c);
  }
  return c;
}

const leer = (box, mehr = {}) => ({ plaetze: [], kanten: [], familien: [], box, kontur: [], kleinstes: 1, ohnePaare: true, ...mehr });

// =====================================================================================================================
// 1. Lebensfäden: jede Person ein Faden auf der Zeitachse von der Geburt bis zum Tod; die Eltern verbindet ein Strich mit dem Kind
const EPOCHEN = [[1618, 1648, 'Dreißigjähriger Krieg'], [1683, 1699, 'Großer Türkenkrieg'], [1756, 1763, 'Siebenjähriger Krieg'],
  [1803, 1815, 'Napoleonische Kriege'], [1848, 1849, 'Revolution 1848/49'], [1914, 1918, 'Erster Weltkrieg'], [1939, 1945, 'Zweiter Weltkrieg']];

function zeitAnordnen(eintraege, { namen, verhaeltnis }) {
  const s = sichtbarVon(eintraege), start = startVon(s), von = (e, art) => s.filter(x => x.von === e && x.art === art);
  const elternVon = e => { const el = von(e, 'eltern'); return [el.find(x => x.p === e.p.vaterP), el.find(x => x.p === e.p.mutterP)]; };
  // Reihenfolge der Bahnen: jedes Kind zwischen Vater (darüber) und Mutter (darunter); so laufen die Striche nur kurz
  const ahnen = e => { const [v, m] = elternVon(e); return [...(v ? ahnen(v) : []), e, ...(m ? ahnen(m) : [])]; };
  const nach = e => [e, ...von(e, 'schwieger'), ...von(e, 'kind').sort(nachGeburt).flatMap(nach)];
  const [v, mu] = elternVon(start), geschwister = s.filter(e => e.art === 'geschwister').sort(nachGeburt);
  const reihe = [...(v ? ahnen(v) : []), ...geschwister.filter(e => e.geburt < start.geburt), start, ...von(start, 'partner').flatMap(ahnen),
    ...von(start, 'kind').sort(nachGeburt).flatMap(nach), ...geschwister.filter(e => !(e.geburt < start.geburt)), ...(mu ? ahnen(mu) : [])];
  const gesehen = new Set(), bahnen = [];
  for (const e of [...reihe, ...s]) if (!gesehen.has(e) && lebenszeit(e.p)) { gesehen.add(e); bahnen.push(e); }
  if (!bahnen.length) return leer({ x0: -5, y0: -3, x1: 5, y1: 3 });
  const L = namen ? 1.32 : 1.12, leben = new Map(bahnen.map(e => [e, lebenszeit(e.p)]));
  const anfang = Math.floor((Math.min(...[...leben.values()].map(l => l.von)) - 6) / 10) * 10, ende = JETZT + 6;
  // Wer zu verschiedenen Zeiten lebte, teilt sich eine Bahn: in der Reihenfolge oben die erste freie. Die Breite der Namen hängt
  // vom Maßstab ab, der Maßstab von der Zahl der Bahnen; zwei Durchgänge reichen.
  let sx = 0.1, zeile = new Map(), n = bahnen.length;
  for (let runde = 0; runde < 3; runde++) {
    const frei = [];
    zeile = new Map();
    for (const e of bahnen) {
      const l = leben.get(e), schild = (namen ? 4.2 : 1.3) / sx, bis = Math.max(l.bis, l.von + schild) + 2.5 / sx;
      let i = frei.findIndex(z => z <= l.von);
      if (i < 0) { i = frei.length; frei.push(0); }
      frei[i] = bis;
      zeile.set(e, i);
    }
    n = Math.max(1, ...zeile.values()) + 1;
    sx = Math.max(1 / 26, verhaeltnis * (n * L + 2.4) * 0.97 / (ende - anfang));
  }
  const X = j => (j - anfang) * sx;
  const plaetze = bahnen.map(e => ({ e, x: X(leben.get(e).von) + 0.5, y: zeile.get(e) * L, d: 1, leben: leben.get(e) }));
  const box = { x0: X(anfang) - 0.4, y0: -2.3, x1: X(ende) + 0.4, y1: (n - 1) * L + 1.1 };
  const nachPerson = new Map(plaetze.map(q => [q.e.p, q]));

  const hinten = k => {
    if (!k.verziert) return;
    const { g, f, m } = k, oben = f([0, box.y0 + 0.1])[1], unten = f([0, box.y1])[1], hell = dunkelGrund(k) ? 255 : 0;
    g.font = `600 ${0.36 * m}px ${k.SCHRIFT}`;
    // Epochen als blasse Bänder
    for (const [a, z, name] of EPOCHEN) {
      if (z < anfang || a > ende) continue;
      const x1 = f([X(Math.max(a, anfang)), 0])[0], x2 = f([X(Math.min(z + 1, ende)), 0])[0];
      g.fillStyle = k.stil.linienfarbe;
      g.globalAlpha = 0.1;
      g.fillRect(x1, oben + 0.75 * m, x2 - x1, unten - oben - 0.75 * m);
      g.globalAlpha = 0.85;
      g.save();
      g.translate((x1 + x2) / 2, oben + 0.85 * m);
      if (x2 - x1 < g.measureText(t(name)).width * 0.7) { g.rotate(Math.PI / 2); g.textAlign = 'left'; } else g.textAlign = 'center';
      g.textBaseline = 'top';
      g.font = `italic ${0.3 * m}px ${k.SCHRIFT}`;
      schreibe(k, t(name), 0, 0, k.grund.text2);
      g.restore();
    }
    // Jahrzehnte, Jahrhunderte, heute
    g.globalAlpha = 1;
    for (let j = Math.ceil(anfang / 10) * 10; j <= ende; j += 10) {
      const x = f([X(j), 0])[0], gross = j % 100 === 0, mittel = j % 50 === 0;
      g.strokeStyle = `rgba(${hell}, ${hell}, ${hell}, ${gross ? 0.3 : mittel ? 0.16 : 0.06})`;
      g.lineWidth = Math.max(1, (gross ? 0.035 : 0.018) * m);
      g.beginPath();
      g.moveTo(x, oben + 0.62 * m);
      g.lineTo(x, unten);
      g.stroke();
      if (mittel) {
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.font = `${gross ? 600 : 400} ${(gross ? 0.42 : 0.3) * m}px ${k.SCHRIFT}`;
        schreibe(k, String(j), x, oben + 0.5 * m, gross ? k.grund.text : k.grund.text2);
      }
    }
    const x = f([X(JETZT), 0])[0];
    g.setLineDash([0.12 * m, 0.12 * m]);
    g.strokeStyle = k.stil.linienfarbe;
    g.beginPath();
    g.moveTo(x, oben + 0.62 * m);
    g.lineTo(x, unten);
    g.stroke();
    g.setLineDash([]);
    g.font = `italic ${0.3 * m}px ${k.SCHRIFT}`;
    g.textAlign = 'center';
    schreibe(k, t('heute'), x, oben + 0.5 * m, k.stil.linienfarbe);
  };

  const linienMalen = k => {
    const { g, f, m, stil } = k;
    // Striche von den Eltern zur Geburt des Kindes, mit einem Punkt auf dem Faden der Eltern
    g.strokeStyle = g.fillStyle = stil.linienfarbe;
    g.lineWidth = Math.max(1, 0.04 * m * k.dicke);
    for (const q of plaetze) {
      for (const el of [q.e.p.vaterP, q.e.p.mutterP]) {
        const p = nachPerson.get(el);
        if (!p) continue;
        const [x1, y1] = f([X(q.leben.von), p.y]), [, y2] = f([0, q.y]);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x1, y2);
        g.stroke();
        g.beginPath();
        g.arc(x1, y1, 0.07 * m, 0, TAU);
        g.fill();
      }
    }
    // die Fäden: offenes Ende bei Lebenden, auslaufend, wenn das Sterbejahr unbekannt ist
    g.lineCap = 'round';
    for (const q of plaetze) {
      const l = q.leben, [x1, y] = f([X(l.von), q.y]), [x2] = f([X(l.bis), q.y]), farbe = k.farben[q.e.seite] ?? stil.linienfarbe;
      g.lineWidth = Math.max(2, 0.17 * m * k.dicke);
      if (l.unsicher) {
        const v = g.createLinearGradient(x1, 0, x2, 0);
        v.addColorStop(0, farbe);
        v.addColorStop(0.55, farbe);
        v.addColorStop(1, 'rgba(0,0,0,0)');
        g.strokeStyle = v;
      } else g.strokeStyle = farbe;
      g.beginPath();
      g.moveTo(x1, y);
      g.lineTo(x2, y);
      g.stroke();
      k.pfade.push({ punkte: [[x1, y], [x2, y]] });
      if (l.offen) {
        g.fillStyle = farbe;
        g.beginPath();
        g.moveTo(x2 + 0.32 * m, y);
        g.lineTo(x2 - 0.05 * m, y - 0.2 * m);
        g.lineTo(x2 - 0.05 * m, y + 0.2 * m);
        g.closePath();
        g.fill();
      }
    }
  };

  const beschriftung = (q, k) => {
    const { g, x, y, d, stil } = k;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = `600 ${d * 0.27}px ${k.SCHRIFT}`;
    schreibe(k, nameZeile(q.e.p), x + d * 0.6, y - d * 0.14, k.schrift.text);
    if (stil.jahre) {
      g.font = `${d * 0.22}px ${k.SCHRIFT}`;
      schreibe(k, jahreKurz(q.e.p), x + d * 0.6, y + d * 0.34, k.schrift.text2);
    }
  };
  return { plaetze, kanten: [], familien: [], box, kontur: [], kleinstes: 1, ohnePaare: true, hinten, linienMalen, beschriftung };
}

// =====================================================================================================================
// 2. Wanderkarte: jede Person bei ihrem Geburtsort, Pfeile von den Eltern zu den Kindern zeigen die Wege der Familie
const GRENZ_JAHRE = [1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2010];
const grenzen = new Map();
function grenzenLaden(jahr) {
  if (!grenzen.has(jahr)) {
    const eintrag = { daten: null };
    eintrag.warten = fetch(LB.grenzen?.[jahr] ?? `data/grenzen/${jahr}.json`).then(r => (r.ok ? r.json() : null))
      .then(d => { eintrag.daten = d; }).catch(() => { eintrag.daten = { features: [] }; });
    grenzen.set(jahr, eintrag);
  }
  return grenzen.get(jahr);
}
const JAHRHUNDERT_FARBE = { 15: '#6b4a2a', 16: '#7b4b2a', 17: '#9a3b2e', 18: '#b8642a', 19: '#3f7f7a', 20: '#2f5f9a', 21: '#5a4a9a' };

function karteAnordnen(eintraege, { namen, verhaeltnis }) {
  const s = sichtbarVon(eintraege), { w, h } = einheiten(namen);
  const mitOrt = s.map(e => ({ e, ort: geburtsort(e.p) })).filter(x => x.ort);
  if (!mitOrt.length) return leer({ x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, { vorne: k => hinweis(k, t('Für diese Personen sind keine Geburtsorte mit Koordinaten bekannt.')) });
  const lats = mitOrt.map(x => x.ort.lat).sort((a, b) => a - b), kx = Math.cos(lats[Math.floor(lats.length / 2)] * Math.PI / 180);
  const roh = ([lon, lat]) => [lon * kx, -lat];
  // Ausreißer (etwa Ausgewanderte in Amerika) machen die Karte nicht riesig: sie zeigt das Gebiet, in dem die meisten geboren sind
  const anteil = (liste, a) => liste[Math.min(liste.length - 1, Math.max(0, Math.round(a * (liste.length - 1))))];
  const xs = mitOrt.map(x => roh([x.ort.lon, x.ort.lat])[0]).sort((a, b) => a - b), ys = mitOrt.map(x => -x.ort.lat).sort((a, b) => a - b);
  const grob = mitOrt.length >= 10 ? 0.05 : 0;
  let x0 = anteil(xs, grob), x1 = anteil(xs, 1 - grob), y0 = anteil(ys, grob), y1 = anteil(ys, 1 - grob);
  const rand = Math.max(0.5, (x1 - x0) * 0.12, (y1 - y0) * 0.12);
  x0 -= rand; x1 += rand; y0 -= rand; y1 += rand;
  if ((x1 - x0) / (y1 - y0) < verhaeltnis) { const z = ((y1 - y0) * verhaeltnis - (x1 - x0)) / 2; x0 -= z; x1 += z; }
  else { const z = ((x1 - x0) / verhaeltnis - (y1 - y0)) / 2; y0 -= z; y1 += z; }
  const innen = mitOrt.filter(x => { const [a, b] = roh([x.ort.lon, x.ort.lat]); return a >= x0 && a <= x1 && b >= y0 && b <= y1; });
  const S = Math.min(40, Math.max(14, Math.sqrt(innen.length) * 4.4)) / (x1 - x0);   // Einheiten (Porträts) je Grad
  const proj = (lon, lat) => { const [a, b] = roh([lon, lat]); return [a * S, b * S]; };
  // Personen am selben Ort stehen als Traube um ihn herum
  const gruppen = new Map();
  for (const x of innen) {
    const schluessel = `${x.ort.lat.toFixed(3)},${x.ort.lon.toFixed(3)}`;
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(x);
  }
  const plaetze = [], ziele = new Map(), orte = [];
  for (const liste of gruppen.values()) {
    liste.sort((a, b) => a.e.geburt - b.e.geburt);
    const [px, py] = proj(liste[0].ort.lon, liste[0].ort.lat);
    orte.push({ x: px, y: py, name: liste[0].ort.name });
    liste.forEach((x, i) => {
      const r = liste.length === 1 ? 0.9 : 1.1 * Math.sqrt(i + 0.6), a = i * 2.39996 - Math.PI / 2;
      const q = { e: x.e, x: px + Math.cos(a) * r, y: py + Math.sin(a) * r - 0.4, d: 1, ort: { x: px, y: py } };
      plaetze.push(q);
      ziele.set(q, [q.x, q.y]);
    });
  }
  entzerren(plaetze, w * 1.02, h * 1.02, ziele);
  const box = umrandung(plaetze, w, h, [[x0 * S, y0 * S], [x1 * S, y1 * S]]);
  const geburten = innen.map(x => x.e.geburt).filter(Boolean).sort((a, b) => a - b), mitte = geburten[Math.floor(geburten.length / 2)] ?? 1900;
  const jahr = [...GRENZ_JAHRE].reverse().find(j => j <= mitte) ?? GRENZ_JAHRE[0], karte = grenzenLaden(jahr);
  const nachPerson = new Map(plaetze.map(q => [q.e.p, q])), draussen = s.length - plaetze.length;

  const hinten = k => {
    if (!k.verziert) return;
    const { g, f, m, b, h: hoehe } = k, dunkel = dunkelGrund(k);
    const meer = dunkel ? '#121c27' : '#cbd7cf', land = dunkel ? ['#2c3341', '#323a49', '#2a3a3a', '#3a3530', '#30363f'] : ['#efe2c2', '#e9dbb6', '#e4e0bf', '#f0d9bf', '#e6d7c4'];
    g.fillStyle = meer;
    g.fillRect(0, 0, b, hoehe);
    for (const ft of karte.daten?.features ?? []) {
      const geo = ft.geometry;
      if (!geo) continue;
      const flaechen = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
      g.beginPath();
      for (const flaeche of flaechen) for (const ring of flaeche) ring.forEach(([lon, lat], i) => { const [x, y] = f(proj(lon, lat)); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.fillStyle = land[hash(ft.properties?.name) % land.length];
      g.fill('evenodd');
      g.strokeStyle = dunkel ? '#5d6678' : '#a8916a';
      g.lineWidth = Math.max(1, 0.03 * m);
      g.stroke();
    }
    // Gradnetz
    const breite = (x1 - x0) / kx, schritt = [0.5, 1, 2, 5, 10].find(z => breite / z <= 10) ?? 20;
    g.strokeStyle = dunkel ? 'rgba(200, 210, 230, 0.12)' : 'rgba(90, 70, 40, 0.18)';
    g.lineWidth = 1;
    g.font = `italic ${0.28 * m}px ${k.SCHRIFT}`;
    g.fillStyle = k.grund.text2;
    for (let lon = Math.floor(x0 / kx / schritt) * schritt; lon <= x1 / kx + schritt; lon += schritt) {
      const [x] = f(proj(lon, 0));
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hoehe); g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'bottom';
      g.fillText(`${Math.round(lon * 10) / 10}° ${lon < 0 ? 'W' : 'O'}`, x + 3, hoehe - 4);
    }
    for (let lat = Math.floor(-y1 / schritt) * schritt; lat <= -y0 + schritt; lat += schritt) {
      const [, y] = f(proj(0, lat));
      g.beginPath(); g.moveTo(0, y); g.lineTo(b, y); g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'bottom';
      g.fillText(`${Math.round(lat * 10) / 10}° N`, 4, y - 2);
    }
    // Windrose unten links
    const r = Math.min(b, hoehe) * 0.06, cx = r * 1.6, cy = hoehe - r * 1.8;
    g.fillStyle = k.stil.linienfarbe;
    g.strokeStyle = dunkel ? '#d9cfb8' : '#4d3d25';
    g.lineWidth = Math.max(1, r * 0.03);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 - Math.PI / 2, l = i % 2 ? r * 0.55 : r, s = r * 0.13;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      g.lineTo(cx + Math.cos(a + Math.PI / 2) * s, cy + Math.sin(a + Math.PI / 2) * s);
      g.lineTo(cx + Math.cos(a - Math.PI / 2) * s, cy + Math.sin(a - Math.PI / 2) * s);
      g.closePath();
      g.globalAlpha = i % 2 ? 0.6 : 0.95;
      g.fill();
      g.stroke();
    }
    g.globalAlpha = 1;
    g.font = `600 ${r * 0.32}px ${k.SCHRIFT}`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    schreibe(k, 'N', cx, cy - r * 1.04, k.grund.text);
    // doppelter Rahmen
    g.strokeStyle = k.stil.linienfarbe;
    g.lineWidth = Math.max(1, hoehe * 0.003);
    g.strokeRect(hoehe * 0.015, hoehe * 0.015, b - hoehe * 0.03, hoehe - hoehe * 0.03);
    g.lineWidth = Math.max(1, hoehe * 0.0012);
    g.strokeRect(hoehe * 0.024, hoehe * 0.024, b - hoehe * 0.048, hoehe - hoehe * 0.048);
  };

  const linienMalen = k => {
    const { g, f, m } = k;
    // Wege von den Eltern zu den Kindern, nach dem Jahrhundert der Geburt gefärbt
    for (const q of plaetze) {
      for (const el of [q.e.p.vaterP, q.e.p.mutterP]) {
        const p = nachPerson.get(el);
        if (!p) continue;
        const [ax, ay] = f([p.ort.x, p.ort.y]), [bx, by] = f([q.ort.x, q.ort.y]), l = Math.hypot(bx - ax, by - ay);
        if (l < 0.3 * m) continue;
        const nx = -(by - ay) / l, ny = (bx - ax) / l, cx = (ax + bx) / 2 + nx * l * 0.18, cy = (ay + by) / 2 + ny * l * 0.18;
        const farbe = JAHRHUNDERT_FARBE[Math.floor((q.e.geburt || 1900) / 100)] ?? k.stil.linienfarbe;
        g.strokeStyle = g.fillStyle = farbe;
        g.lineWidth = Math.max(1.5, 0.07 * m * k.dicke);
        g.globalAlpha = 0.85;
        g.beginPath();
        g.moveTo(ax, ay);
        g.quadraticCurveTo(cx, cy, bx, by);
        g.stroke();
        k.pfade.push({ punkte: k.bogen([ax, ay], [(ax + 2 * cx) / 3, (ay + 2 * cy) / 3], [(bx + 2 * cx) / 3, (by + 2 * cy) / 3], [bx, by]) });
        const wx = bx - cx, wy = by - cy, wl = Math.hypot(wx, wy) || 1, ux = wx / wl, uy = wy / wl, sp = 0.26 * m, ex = bx - ux * 0.1 * m, ey = by - uy * 0.1 * m;
        g.beginPath();
        g.moveTo(ex, ey);
        g.lineTo(ex - ux * sp - uy * sp * 0.45, ey - uy * sp + ux * sp * 0.45);
        g.lineTo(ex - ux * sp + uy * sp * 0.45, ey - uy * sp - ux * sp * 0.45);
        g.closePath();
        g.fill();
      }
    }
    g.globalAlpha = 1;
    // vom Porträt zum Ort
    g.strokeStyle = k.grund.text2;
    g.lineWidth = Math.max(1, 0.025 * m);
    for (const q of plaetze) {
      const [ax, ay] = f([q.x, q.y]), [bx, by] = f([q.ort.x, q.ort.y]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    g.font = `italic 600 ${0.3 * m}px ${k.SCHRIFT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (const o of orte) {
      const [x, y] = f([o.x, o.y]);
      g.beginPath();
      g.arc(x, y, 0.09 * m, 0, TAU);
      g.fillStyle = '#8a2c1d';
      g.fill();
      g.strokeStyle = '#fff6e6';
      g.lineWidth = Math.max(1, 0.025 * m);
      g.stroke();
      schreibe(k, o.name, x + 0.15 * m, y + 0.02 * m, k.grund.text);
    }
  };

  const vorne = k => {
    const { g, b, h: hoehe } = k;
    g.font = `italic ${hoehe * 0.018}px ${k.SCHRIFT}`;
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    const zeilen = [k.verziert ? t('Grenzen um {jahr}', { jahr }) : '', draussen ? t('{n} Personen ohne Ort oder außerhalb der Karte', { n: draussen }) : ''].filter(Boolean);
    zeilen.forEach((z, i) => schreibe(k, z, b - hoehe * 0.04, hoehe * (0.96 - i * 0.025), k.grund.text2));
  };
  return { plaetze, kanten: [], familien: [], box, kontur: [], kleinstes: 1, ohnePaare: true, hinten, linienMalen, vorne, warten: karte.daten ? null : karte.warten };
}

// =====================================================================================================================
// 3. Ahnengalerie: Ölbilder an einer Schlosswand, der Rahmen nach der Zeit, in der die Person geboren ist; darunter ein Messingschild
const EPOCHE = j => (j < 1720 ? 'barock' : j < 1790 ? 'rokoko' : j < 1840 ? 'biedermeier' : j < 1890 ? 'gruenderzeit' : j < 1920 ? 'jugendstil' : j < 1960 ? 'deco' : 'modern');
const GOLD = ['#6e4f18', '#e8c66a', '#a5782a', '#f7df8e', '#86601e'];

function galerieAnordnen(eintraege, { namen, verhaeltnis }) {
  const s = sichtbarVon(eintraege), start = startVon(s), nachEbene = new Map();
  for (const e of s) { if (!nachEbene.has(e.ebene)) nachEbene.set(e.ebene, []); nachEbene.get(e.ebene).push(e); }
  const reihen = [...nachEbene].sort((a, b) => b[0] - a[0]).map(([ebene, liste]) => {
    if (ebene > 0) return liste.sort(nachSosa);
    if (ebene < 0) return liste.sort(nachGeburt);
    const g = liste.filter(e => e.art === 'geschwister').sort(nachGeburt);
    return [...g.filter(e => e.geburt < start.geburt), start, ...liste.filter(e => e.art === 'partner'), ...g.filter(e => !(e.geburt < start.geburt))];
  });
  // Reihen mit wenigen Bildern bekommen größere, wie in einem echten Ahnensaal; die Hauptperson bleibt die größte ihrer Reihe
  const natur = Math.max(...reihen.map(r => r.length)), faktor = new Map();
  for (const r of reihen) for (const e of r) faktor.set(e, Math.min(2.1, Math.max(1, Math.sqrt(natur / r.length) * 0.9)));
  const groesse = e => faktor.get(e) * (e === start ? 1.15 : 1);
  const zelleB = d => d * (0.8 + 0.4) + 0.5, zelleH = d => d * 1.4 + (namen ? d * 0.5 : 0) + 0.55;
  // so viele Bilder je Reihe, dass die Wand etwa das Format des Bildes hat
  let beste = null;
  for (let C = 2; C <= 48; C++) {
    let H = 0, W = 0;
    for (const r of reihen) for (let i = 0; i < r.length; i += C) {
      const teil = r.slice(i, i + C);
      W = Math.max(W, teil.reduce((a, e) => a + zelleB(groesse(e)), 0));
      H += Math.max(...teil.map(e => zelleH(groesse(e))));
    }
    const fehler = Math.abs(Math.log(W / H / verhaeltnis));
    if (!beste || fehler < beste.fehler) beste = { C, fehler };
  }
  const plaetze = [];
  let y = 0;
  for (const r of reihen) for (let i = 0; i < r.length; i += beste.C) {
    const teil = r.slice(i, i + beste.C), hoch = Math.max(...teil.map(e => zelleH(groesse(e)))), breit = teil.reduce((a, e) => a + zelleB(groesse(e)), 0);
    let x = -breit / 2;
    for (const e of teil) {
      const d = groesse(e), ep = EPOCHE(e.p.geburt ?? e.p.jahrE ?? 1950);
      plaetze.push({ e, x: x + zelleB(d) / 2, y: y + 0.35 + d * 0.7, d, epoche: ep, rahmen: ep === 'rokoko' || ep === 'jugendstil' ? 'oval' : 'eckig' });
      x += zelleB(d);
    }
    y += hoch;
  }
  const xs = plaetze.flatMap(q => [q.x - zelleB(q.d) / 2, q.x + zelleB(q.d) / 2]);
  const box = { x0: Math.min(...xs) - 0.3, y0: -0.6, x1: Math.max(...xs) + 0.3, y1: y + 0.2 };

  const hinten = k => {
    if (!k.verziert) return;
    const { g, f, m, b, h } = k, art = k.stil.grund;
    const wand = ['dunkel', 'klardunkel'].includes(art) ? ['#1d332d', '#2a463d'] : art === 'pergament' ? ['#5e222c', '#76303b'] : ['#d5cab7', '#e2d8c6'];
    k.g.drawImage(vorrat(k, `wand|${wand[0]}|${Math.round(m * 10)}`, b, h, g => {
    g.fillStyle = wand[0];
    g.fillRect(0, 0, b, h);
    // Damasttapete: ein Lilienmuster, versetzt
    const T = Math.max(18, 1.15 * m);
    g.fillStyle = wand[1];
    g.globalAlpha = 0.55;
    for (let yy = -T, z = 0; yy < h + T; yy += T * 1.3, z++) {
      for (let xx = (z % 2) * T / 2 - T; xx < b + T; xx += T) {
        g.beginPath();
        g.ellipse(xx, yy, T * 0.1, T * 0.3, 0, 0, TAU);
        g.ellipse(xx - T * 0.18, yy + T * 0.1, T * 0.08, T * 0.2, -0.7, 0, TAU);
        g.ellipse(xx + T * 0.18, yy + T * 0.1, T * 0.08, T * 0.2, 0.7, 0, TAU);
        g.moveTo(xx, yy + T * 0.32);
        g.lineTo(xx + T * 0.08, yy + T * 0.45);
        g.lineTo(xx, yy + T * 0.58);
        g.lineTo(xx - T * 0.08, yy + T * 0.45);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    // Bilderleiste oben, Vertäfelung unten
    const leiste = h * 0.035, sockel = h * 0.86;
    const holz = g.createLinearGradient(0, 0, 0, leiste);
    holz.addColorStop(0, '#3b2414'); holz.addColorStop(0.5, '#8a5a32'); holz.addColorStop(1, '#2e1b0e');
    g.fillStyle = holz;
    g.fillRect(0, leiste, b, leiste * 0.6);
    const unten = g.createLinearGradient(0, sockel, 0, h);
    unten.addColorStop(0, '#4a2e18'); unten.addColorStop(1, '#2a180c');
    g.fillStyle = unten;
    g.fillRect(0, sockel, b, h - sockel);
    g.strokeStyle = 'rgba(255, 220, 160, 0.18)';
    g.lineWidth = Math.max(1, h * 0.002);
    const feld = h * 0.2;
    for (let xx = feld * 0.15; xx < b; xx += feld) g.strokeRect(xx, sockel + h * 0.025, feld * 0.85, h - sockel - h * 0.05);
    }), 0, 0, b, h);
    const leiste = h * 0.035;
    // Licht über jedem Bild und die Schnur zur Leiste
    for (const q of plaetze) {
      const [x, yy] = f([q.x, q.y]), r = q.d * m / 2, oben = yy - r - r * 0.4;
      const licht = g.createRadialGradient(x, oben, 0, x, oben, r * 3.2);
      licht.addColorStop(0, 'rgba(255, 228, 170, 0.22)');
      licht.addColorStop(1, 'rgba(255, 228, 170, 0)');
      g.fillStyle = licht;
      g.fillRect(x - r * 3.2, oben - r * 3.2, r * 6.4, r * 6.4);
      g.strokeStyle = '#b8954a';
      g.lineWidth = Math.max(1, r * 0.03);
      g.beginPath();
      g.moveTo(x, leiste * 1.6);
      g.lineTo(x - r * 0.5, oben + r * 0.1);
      g.moveTo(x, leiste * 1.6);
      g.lineTo(x + r * 0.5, oben + r * 0.1);
      g.stroke();
    }
  };

  const vorne = k => { for (const q of plaetze) rahmenMalen(k, q); };

  const beschriftung = (q, k) => {
    const { g, x, y, d, stil } = k, r = d / 2, unten = y + r + r * 0.34 * (q.epoche === 'gruenderzeit' ? 1.2 : 1) + d * 0.08;
    const name = nameZeile(q.e.p), jahre = stil.jahre ? jahreKurz(q.e.p) : '';
    g.font = `600 ${d * 0.13}px ${k.SCHRIFT}`;
    const breit = Math.min(d * 1.5, Math.max(g.measureText(name).width, jahre ? g.measureText(jahre).width * 0.9 : 0) + d * 0.2), hoch = d * (jahre ? 0.36 : 0.22);
    const v = g.createLinearGradient(x - breit / 2, unten, x + breit / 2, unten + hoch);
    v.addColorStop(0, '#8c6a2a'); v.addColorStop(0.45, '#e6cb7e'); v.addColorStop(1, '#9b7631');
    g.fillStyle = v;
    g.beginPath();
    g.roundRect(x - breit / 2, unten, breit, hoch, d * 0.04);
    g.fill();
    g.strokeStyle = '#5a4214';
    g.lineWidth = Math.max(1, d * 0.012);
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = '#2b1d0a';
    g.fillText(k.kurz(g, name, breit - d * 0.1), x, unten + d * 0.045);
    if (jahre) {
      g.font = `${d * 0.11}px ${k.SCHRIFT}`;
      g.fillText(jahre, x, unten + d * 0.2);
    }
  };
  return { plaetze, kanten: [], familien: [], box, kontur: [], kleinstes: 1, ohnePaare: true, ohneRing: true, hinten, vorne, beschriftung,
    titelSchrift: { text: '#f3e2b5', hof: 'rgba(20, 10, 6, 0.75)' } };
}

/** Bilderrahmen im Stil der Zeit */
function rahmenMalen(k, q) {
  const { g, f, m } = k, [x, y] = f([q.x, q.y]), r = q.d * m / 2, rx = r * 0.8, ry = r, ft = r * 0.34, oval = q.rahmen === 'oval';
  const form = ex => { if (oval) g.ellipse(x, y, rx + ex, ry + ex, 0, 0, TAU); else g.rect(x - rx - ex, y - ry - ex, 2 * (rx + ex), 2 * (ry + ex)); };
  const verlauf = farben => {
    const v = g.createLinearGradient(x - rx - ft, y - ry - ft, x + rx + ft, y + ry + ft);
    farben.forEach((c, i) => v.addColorStop(i / (farben.length - 1), c));
    return v;
  };
  const band = (aussen, innen, fuellung, schatten = false) => {
    g.save();
    if (schatten) { g.shadowColor = 'rgba(0, 0, 0, 0.5)'; g.shadowBlur = ft * 1.6; g.shadowOffsetY = ft * 0.5; }
    g.beginPath();
    form(aussen);
    form(innen);
    g.fillStyle = fuellung;
    g.fill('evenodd');
    g.restore();
  };
  const linie = (ex, farbe, breite) => { g.beginPath(); form(ex); g.strokeStyle = farbe; g.lineWidth = Math.max(1, breite); g.stroke(); };
  const ecken = fn => { if (!oval) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) fn(x + sx * (rx + ft * 0.5), y + sy * (ry + ft * 0.5)); };
  switch (q.epoche) {
    case 'barock':
      band(ft * 1.15, 0, verlauf(GOLD), true);
      linie(ft * 0.35, '#5a3d0e', ft * 0.12);
      linie(ft * 0.9, '#fff0b8', ft * 0.06);
      ecken((cx, cy) => {
        g.fillStyle = verlauf(GOLD);
        g.beginPath(); g.arc(cx, cy, ft * 0.75, 0, TAU); g.fill();
        g.fillStyle = '#5a3d0e';
        g.beginPath(); g.arc(cx, cy, ft * 0.28, 0, TAU); g.fill();
      });
      // Muschel oben
      g.fillStyle = verlauf(GOLD);
      g.beginPath();
      g.arc(x, y - ry - ft, ft * 1.3, Math.PI, TAU);
      g.fill();
      g.strokeStyle = '#5a3d0e';
      g.lineWidth = Math.max(1, ft * 0.08);
      for (let i = 1; i < 6; i++) { const a = Math.PI + i * Math.PI / 6; g.beginPath(); g.moveTo(x, y - ry - ft); g.lineTo(x + Math.cos(a) * ft * 1.25, y - ry - ft + Math.sin(a) * ft * 1.25); g.stroke(); }
      break;
    case 'rokoko':
      band(ft * 0.9, 0, verlauf(GOLD), true);
      linie(ft * 0.45, '#fff0b8', ft * 0.07);
      // Rocaille-Schnörkel oben
      g.strokeStyle = verlauf(GOLD);
      g.lineWidth = Math.max(1.5, ft * 0.32);
      g.lineCap = 'round';
      for (const v of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, y - ry - ft * 0.7);
        g.bezierCurveTo(x + v * ft * 1.2, y - ry - ft * 2.6, x + v * ft * 2.8, y - ry - ft * 0.8, x + v * ft * 1.7, y - ry - ft * 0.2);
        g.stroke();
        g.beginPath();
        g.arc(x + v * ft * 1.75, y - ry - ft * 0.55, ft * 0.35, 0, TAU);
        g.stroke();
      }
      break;
    case 'biedermeier':
      band(ft, 0, verlauf(['#3a1b0c', '#7b3f1f', '#4a2412', '#8a4a26', '#3a1b0c']), true);
      band(ft * 0.2, 0, verlauf(GOLD));
      break;
    case 'gruenderzeit': {
      band(ft * 1.25, 0, verlauf(GOLD), true);
      band(ft * 0.35, ft * 0.12, verlauf(['#f7e7a8', '#c79a3e', '#f7e7a8']));
      // Perlstab
      g.fillStyle = '#7a5a1a';
      const umfang = 2 * (2 * rx + 2 * ry), n = Math.round(umfang / (ft * 0.45)), e = ft * 0.8;
      for (let i = 0; i < n; i++) {
        let s = i / n * (4 * (rx + ry + 2 * e)), px, py;
        const bx = 2 * (rx + e), by = 2 * (ry + e);
        if (s < bx) { px = x - rx - e + s; py = y - ry - e; } else if ((s -= bx) < by) { px = x + rx + e; py = y - ry - e + s; }
        else if ((s -= by) < bx) { px = x + rx + e - s; py = y + ry + e; } else { s -= bx; px = x - rx - e; py = y + ry + e - s; }
        g.beginPath(); g.arc(px, py, ft * 0.11, 0, TAU); g.fill();
      }
      break;
    }
    case 'jugendstil':
      band(ft * 0.8, 0, verlauf(['#4d5a3a', '#c2a65e', '#6b7448', '#d8c07a', '#4d5a3a']), true);
      g.strokeStyle = '#c2a65e';
      g.lineWidth = Math.max(1.5, ft * 0.16);
      g.lineCap = 'round';
      for (const v of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, y + ry + ft * 0.6);
        g.bezierCurveTo(x + v * rx * 0.6, y + ry + ft * 2.2, x + v * rx * 1.1, y + ry - ft, x + v * (rx + ft * 1.4), y + ry * 0.2);
        g.stroke();
      }
      g.fillStyle = '#d8c07a';
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * ft * 0.35, y - ry - ft * 0.9 + Math.sin(a) * ft * 0.35, ft * 0.28, ft * 0.16, a, 0, TAU); g.fill(); }
      break;
    case 'deco':
      band(ft * 0.85, 0, verlauf(['#5f6368', '#eef0f2', '#8a8f95', '#d5d8db', '#5f6368']), true);
      linie(ft * 0.1, '#111', ft * 0.1);
      ecken((cx, cy) => { g.fillStyle = '#111'; g.fillRect(cx - ft * 0.38, cy - ft * 0.38, ft * 0.76, ft * 0.76); g.fillStyle = '#d5d8db'; g.fillRect(cx - ft * 0.2, cy - ft * 0.2, ft * 0.4, ft * 0.4); });
      break;
    default:
      band(ft * 1.5, ft * 1.25, '#151515', true);
      band(ft * 1.25, 0, '#f4f1ea');
      linie(0, 'rgba(0,0,0,0.25)', ft * 0.05);
  }
}

// =====================================================================================================================
// 4. Rosette: ein Kirchenfenster; die Hauptperson in der Mitte, jede Generation ein Ring, die Vaterseite in der linken Hälfte
const GLAS_VATER = ['#8c2f2a', '#b5651d', '#c9a227', '#7a3b69', '#a33c3c', '#9a6a1e'];
const GLAS_MUTTER = ['#1f4e79', '#2a7f62', '#3b6ea5', '#4f8a3c', '#295f7a', '#3d7d70'];

function rosetteAnordnen(eintraege) {
  const s = sichtbarVon(eintraege), start = startVon(s), ahnen = ahnenVon(s, start), G = Math.min(8, Math.max(1, ...ahnen.map(e => e.ebene)));
  const R = [1.05], D = [1.75];
  for (let g = 1; g <= G; g++) {
    const n = 2 ** g, innen = R[g - 1];
    let w = 1.4;
    if (TAU * (innen + w / 2) / n < w) w = Math.max(0.3, TAU * innen / n / (1 - Math.PI / n));
    R.push(innen + w);
    D.push(0.8 * Math.min(w, TAU * (innen + w / 2) / n));
  }
  const plaetze = [{ e: start, x: 0, y: 0, d: D[0] }];
  for (const e of ahnen) {
    if (e.ebene > G || e.sosa < 2 ** e.ebene || e.sosa >= 2 ** (e.ebene + 1)) continue;
    const n = 2 ** e.ebene, i = e.sosa - n, a = Math.PI / 2 + (i + 0.5) * TAU / n, r = (R[e.ebene - 1] + R[e.ebene]) / 2;
    plaetze.push({ e, x: Math.cos(a) * r, y: Math.sin(a) * r, d: D[e.ebene] });
  }
  const besetzt = new Set(ahnen.map(e => `${e.ebene}:${e.sosa}`)), aussen = R[G] + 0.9;

  const hinten = k => {
    const { g, f, m } = k, [cx, cy] = f([0, 0]), lr = Math.max(1.5, 0.06 * m);
    const segment = (r0, r1, a0, a1) => { g.beginPath(); g.arc(cx, cy, r1 * m, a0, a1); g.arc(cx, cy, r0 * m, a1, a0, true); g.closePath(); };
    if (!k.verziert) {
      g.strokeStyle = k.stil.linienfarbe;
      g.globalAlpha = 0.45;
      g.lineWidth = Math.max(1, 0.025 * m);
      for (let gg = 1; gg <= G; gg++) for (let i = 0; i < 2 ** gg; i++) { const a0 = Math.PI / 2 + i * TAU / 2 ** gg; segment(R[gg - 1], R[gg], a0, a0 + TAU / 2 ** gg); g.stroke(); }
      g.beginPath(); g.arc(cx, cy, R[0] * m, 0, TAU); g.stroke();
      return;
    }
    // Maßwerk aus Stein mit einem Kranz kleiner Pässe
    const stein = g.createRadialGradient(cx - aussen * m * 0.3, cy - aussen * m * 0.3, 0, cx, cy, aussen * m);
    stein.addColorStop(0, '#a29b8b'); stein.addColorStop(1, '#5d574b');
    g.fillStyle = stein;
    g.beginPath(); g.arc(cx, cy, aussen * m, 0, TAU); g.fill();
    const N = Math.max(16, Math.min(48, 2 ** Math.min(G + 1, 5))), rk = R[G] + 0.45, klein = Math.min(0.38, Math.PI * rk / N * 0.8);
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU, x = cx + Math.cos(a) * rk * m, y = cy + Math.sin(a) * rk * m;
      g.fillStyle = i % 2 ? '#c9a227' : '#2f6aa0';
      g.beginPath(); g.arc(x, y, klein * m, 0, TAU); g.fill();
      g.strokeStyle = '#141210'; g.lineWidth = lr * 0.7; g.stroke();
    }
    // Glas: links warme Töne der Vaterseite, rechts kühle der Mutterseite; leere Felder gedämpft
    for (let gg = 1; gg <= G; gg++) {
      const n = 2 ** gg;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI / 2 + i * TAU / n, a1 = a0 + TAU / n, liste = i < n / 2 ? GLAS_VATER : GLAS_MUTTER, farbe = liste[hash(`${gg}:${i}`) % liste.length];
        segment(R[gg - 1], R[gg], a0, a1);
        const am = (a0 + a1) / 2, rm = (R[gg - 1] + R[gg]) / 2, lx = cx + Math.cos(am) * rm * m, ly = cy + Math.sin(am) * rm * m;
        const v = g.createRadialGradient(lx, ly, 0, lx, ly, (R[gg] - R[gg - 1] + TAU * rm / n) * m * 0.6);
        v.addColorStop(0, '#ffffff'); v.addColorStop(0.25, farbe); v.addColorStop(1, farbe);
        g.fillStyle = v;
        g.globalAlpha = besetzt.has(`${gg}:${n + i}`) ? 0.95 : 0.5;
        g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = '#141210';
        g.lineWidth = lr;
        g.stroke();
      }
    }
    // Mitte: eine Rose
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      g.fillStyle = '#d9b45a';
      g.beginPath(); g.arc(cx + Math.cos(a) * R[0] * 0.62 * m, cy + Math.sin(a) * R[0] * 0.62 * m, R[0] * 0.42 * m, 0, TAU); g.fill();
      g.strokeStyle = '#141210'; g.lineWidth = lr * 0.8; g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, R[0] * m, 0, TAU);
    g.strokeStyle = '#141210'; g.lineWidth = lr * 1.4; g.stroke();
    g.beginPath(); g.arc(cx, cy, R[G] * m, 0, TAU); g.lineWidth = lr * 1.6; g.stroke();
  };
  const schrift = { text: '#fff8e8', text2: '#f2e6cc', hof: 'rgba(15, 12, 8, 0.78)' };
  return { plaetze, kanten: [], familien: [], box: { x0: -aussen - 0.2, y0: -aussen - 0.2, x1: aussen + 0.2, y1: aussen + 0.2 }, kontur: [], kleinstes: Math.min(...plaetze.map(q => q.d)),
    ohnePaare: true, hinten, linienMalen: () => {}, schrift, namenAb: 34 };
}

// =====================================================================================================================
// 5. Wurzelwerk: oben die Hauptperson mit ihren Kindern als kleiner Baum, darunter die Vorfahren als Wurzeln in Erdschichten
const ERDE = ['#5b3a22', '#6b4529', '#7a5233', '#86603e', '#7b6450', '#6a5c50', '#5a5149'];

function wurzelnAnordnen(eintraege, { namen, verhaeltnis }) {
  const s = sichtbarVon(eintraege), start = startVon(s), { w, h, zeile } = einheiten(namen);
  const plan = eicheAnordnen(eintraege, { namen, verhaeltnis: verhaeltnis * 0.85 });
  for (const q of plan.plaetze) q.y = -q.y;
  const wurzeln = plan.aeste, wurzel = plan.plaetze.find(q => q.e === start), plaetze = [...plan.plaetze];
  const BODEN = -0.85;
  // über der Erde: Partner neben der Hauptperson, Nachkommen in der Krone
  const partner = s.filter(e => e.art === 'partner' && e.von === start);
  partner.forEach((e, i) => plaetze.push({ e, x: (i + 1) * (w + 0.4), y: 0, d: 1 }));
  const kinderVon = e => s.filter(x => x.von === e && x.art === 'kind').sort(nachGeburt);
  const krone = e => knoten([e], w, 0, kinderVon(e).map(krone)), oben = { breite: 0, personen: [], kinder: kinderVon(start).map(krone) };
  const zweige = [];
  if (oben.kinder.length) {
    ordne(oben, t => (t ? 0.6 : 0.26));
    const mitte = partner.length ? (w + 0.4) / 2 : 0;
    const lege = (kn, x, tiefe, von) => {
      const q = { e: kn.personen[0], x, y: BODEN - 1.9 - (tiefe - 1) * zeile, d: 1 };
      plaetze.push(q);
      zweige.push({ a: von, b: q });
      for (const c of kn.kinder) lege(c, x + c.dx, tiefe + 1, q);
    };
    oben.kinder.forEach(c => lege(c, mitte + c.dx, 1, null));
  }
  for (const q of plaetze) if (q.y > BODEN + 0.5) q.schrift = { text: '#fbf3e4', text2: '#e6d6bd', hof: 'rgba(28, 16, 8, 0.8)' };
  // Jahre zu Tiefen: der Durchschnitt jeder Generation gibt einen Punkt, dazwischen geradlinig
  const punkte = [[wurzel?.e.p.geburt ?? JETZT - 40, 0]];
  const ebenen = new Map();
  for (const q of plan.plaetze) if (q.e.ebene > 0 && q.e.p.geburt) { const l = ebenen.get(q.e.ebene) ?? []; l.push(q); ebenen.set(q.e.ebene, l); }
  for (const [, l] of [...ebenen].sort((a, b) => a[0] - b[0])) {
    const j = l.reduce((a, q) => a + q.e.p.geburt, 0) / l.length, y = l.reduce((a, q) => a + q.y, 0) / l.length;
    if (j < punkte[punkte.length - 1][0] - 5 && y > punkte[punkte.length - 1][1]) punkte.push([j, y]);
  }
  if (punkte.length < 2) punkte.push([punkte[0][0] - 30, zeile]);
  const tiefe = j => {
    for (let i = 1; i < punkte.length; i++) if (j >= punkte[i][0]) { const [a, ya] = punkte[i - 1], [b, yb] = punkte[i]; return ya + (yb - ya) * (a - j) / (a - b); }
    const [a, ya] = punkte[punkte.length - 2], [b, yb] = punkte[punkte.length - 1];
    return yb + (yb - ya) * (b - j) / (a - b);
  };
  const box = umrandung(plaetze, w, h, [[0, BODEN - 3.4], [0, Math.max(...plaetze.map(q => q.y)) + h + 0.6]]);
  box.x1 = Math.max(box.x1, -box.x0); box.x0 = -box.x1;

  const hinten = k => {
    if (!k.verziert) return;
    const { g, f, m, b, h: hoehe } = k, zufall = wuerfel(5), [, boden] = f([0, BODEN]), welle = x => Math.sin(x / m * 1.3) * 0.08 * m;
    // Erdschichten je Jahrhundert, vom Boden bis zum unteren Bildrand
    const jahrOben = punkte[0][0], grenzenJ = [];
    for (let j = Math.floor(jahrOben / 100) * 100; j > jahrOben - 1500; j -= 100) { const [, y] = f([0, tiefe(j)]); if (y > boden && y < hoehe + m) grenzenJ.push([j, y]); if (y > hoehe) break; }
    const kanten = [boden, ...grenzenJ.map(x => x[1]), hoehe + m];
    for (let i = 0; i < kanten.length - 1; i++) {
      g.fillStyle = ERDE[Math.min(i, ERDE.length - 1)];
      g.beginPath();
      g.moveTo(0, kanten[i] + (i ? welle(0) : 0));
      for (let x = 0; x <= b; x += m * 0.3) g.lineTo(x, kanten[i] + (i ? welle(x + i * 40) : 0));
      g.lineTo(b + 1, kanten[i] + (i ? welle(b + i * 40) : 0));
      g.lineTo(b + 1, kanten[i + 1]);
      g.lineTo(0, kanten[i + 1]);
      g.closePath();
      g.fill();
      // Kiesel
      g.fillStyle = 'rgba(255, 240, 220, 0.12)';
      const n = Math.round((b / m) * ((kanten[i + 1] - kanten[i]) / m) * 0.6);
      for (let j = 0; j < Math.min(n, 400); j++) {
        g.beginPath();
        g.ellipse(zufall() * b, kanten[i] + zufall() * (kanten[i + 1] - kanten[i]), (0.05 + zufall() * 0.1) * m, (0.03 + zufall() * 0.06) * m, zufall() * 3, 0, TAU);
        g.fill();
      }
    }
    g.font = `600 ${0.42 * m}px ${k.SCHRIFT}`;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    for (const [j, y] of grenzenJ) {
      g.strokeStyle = 'rgba(255, 235, 200, 0.25)';
      g.lineWidth = Math.max(1, 0.02 * m);
      g.setLineDash([0.15 * m, 0.12 * m]);
      g.beginPath(); g.moveTo(0, y); g.lineTo(b, y); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255, 238, 210, 0.75)';
      g.fillText(String(j), hoehe * 0.04, y - 0.06 * m);
    }
    // Gras an der Oberfläche
    g.strokeStyle = '#4f7a2a';
    g.lineWidth = Math.max(1, 0.03 * m);
    g.fillStyle = '#4a6b2a';
    g.fillRect(0, boden - 0.06 * m, b, 0.12 * m);
    for (let x = 0; x < b; x += 0.07 * m) {
      const l = (0.12 + zufall() * 0.22) * m;
      g.beginPath(); g.moveTo(x, boden); g.lineTo(x + (zufall() - 0.5) * 0.15 * m, boden - l); g.stroke();
    }
    // Stamm über der Erde bis in die Krone
    if (zweige.length) {
      const [mx] = f([partner.length ? (w + 0.4) / 2 : 0, 0]), oberste = Math.min(...zweige.map(z => f([0, z.b.y])[1]));
      const ziel = (oberste + boden) / 2;
      g.fillStyle = '#6b4a2c';
      g.beginPath();
      g.moveTo(mx - 0.55 * m, boden);
      g.quadraticCurveTo(mx - 0.3 * m, (boden + ziel) / 2, mx - 0.22 * m, ziel);
      g.lineTo(mx + 0.22 * m, ziel);
      g.quadraticCurveTo(mx + 0.3 * m, (boden + ziel) / 2, mx + 0.55 * m, boden);
      g.closePath();
      g.fill();
      const laub = ['#4f7a2a', '#6b9634', '#86ad45', '#3f6522'];
      for (const z of zweige) {
        const [x, y] = f([z.b.x, z.b.y]);
        for (let i = 0; i < 14; i++) {
          const a = zufall() * TAU, r = (0.5 + zufall() * 0.9) * m;
          g.fillStyle = laub[Math.floor(zufall() * laub.length)];
          g.beginPath(); g.ellipse(x + Math.cos(a) * r, y + 0.2 * m + Math.sin(a) * r * 0.8, 0.2 * m, 0.11 * m, zufall() * 3, 0, TAU); g.fill();
        }
      }
    }
  };

  const linienMalen = k => {
    const { g, f, m, stil } = k, zufall = wuerfel(9), farbe = k.verziert ? '#3d2615' : stil.linienfarbe;
    const mitteOben = f([partner.length ? (w + 0.4) / 2 : 0, BODEN - 0.6]);
    g.strokeStyle = stil.linienfarbe;
    g.lineWidth = Math.max(1, 0.05 * m * k.dicke);
    for (const q of plaetze) if (q.e.art === 'partner') { g.beginPath(); g.moveTo(...f([wurzel.x, wurzel.y])); g.lineTo(...f([q.x, q.y])); g.stroke(); }
    for (const z of zweige) {
      const a = z.a ? f([z.a.x, z.a.y]) : mitteOben, b = f([z.b.x, z.b.y]);
      k.astMalen(g, k.astPunkte(a, b, 'hoch'), Math.max(2, 0.16 * m * k.dicke), Math.max(1, 0.07 * m * k.dicke), k.verziert ? '#6b4a2c' : stil.linienfarbe);
    }
    // Wurzeln: knorrig, mit feinen Fasern am Ende
    for (const a of wurzeln) {
      const p = k.astPunkte(f([a.a.x, a.a.y]), f([a.b.x, a.b.y]), 'hoch'), l = Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]);
      const phase = zufall() * 6;
      const knorrig = p.map(([x, y], i) => {
        const t = i / (p.length - 1), [px, py] = p[Math.max(0, i - 1)], [nx, ny] = p[Math.min(p.length - 1, i + 1)], dl = Math.hypot(nx - px, ny - py) || 1;
        const v = Math.sin(t * Math.PI * 3 + phase) * Math.sin(t * Math.PI) * l * 0.05;
        return [x - (ny - py) / dl * v, y + (nx - px) / dl * v];
      });
      k.astMalen(g, knorrig, Math.max(2, a.dicke * m * k.dicke), Math.max(1, a.dicke * 0.4 * m * k.dicke), farbe);
      const [ex, ey] = knorrig[knorrig.length - 4];
      g.strokeStyle = farbe;
      g.lineWidth = Math.max(1, 0.025 * m);
      for (let i = 0; i < 4; i++) {
        const w0 = Math.PI / 2 + (zufall() - 0.5) * 2.2, l2 = (0.3 + zufall() * 0.5) * m;
        g.beginPath(); g.moveTo(ex, ey); g.quadraticCurveTo(ex + Math.cos(w0) * l2 * 0.5 + (zufall() - 0.5) * l2 * 0.4, ey + Math.sin(w0) * l2 * 0.5, ex + Math.cos(w0) * l2, ey + Math.sin(w0) * l2); g.stroke();
      }
    }
  };
  return { plaetze, kanten: [], familien: [], box, kontur: [], kleinstes: 1, ohnePaare: true, hinten, linienMalen };
}

// =====================================================================================================================
// 6. Sternbild: die Vorfahren als Sterne am Nachthimmel, je länger das Leben, desto heller; die Linien bilden das Sternbild der Familie
function sterneAnordnen(eintraege, { namen }) {
  const s = sichtbarVon(eintraege), start = startVon(s), { w, h } = einheiten(namen), zufall = wuerfel(hash(start.p.id));
  const ahnen = ahnenVon(s, start), kinder = s.filter(e => e.art === 'kind');
  const plaetze = [{ e: start, x: 0, y: 0, d: 1.25 }], ziele = new Map();
  for (const e of ahnen) {
    const n = 2 ** e.ebene, i = Math.max(0, Math.min(n - 1, e.sosa - n)), spanne = 170 / n;
    const a = (185 + (i + 0.5) * spanne + (zufall() - 0.5) * spanne * 0.7) * Math.PI / 180, r = e.ebene * 2.5 + (zufall() - 0.5) * 1.1;
    plaetze.push({ e, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.85, d: 1 });
  }
  kinder.forEach((e, i) => {
    const a = (40 + (i + 0.5) / kinder.length * 100 + (zufall() - 0.5) * 10) * Math.PI / 180, r = -e.ebene * 2.3 + (zufall() - 0.5) * 0.6;
    plaetze.push({ e, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.85, d: 0.95 });
  });
  for (const q of plaetze) ziele.set(q, [q.x, q.y]);
  entzerren(plaetze, w * 1.05, h * 1.05, ziele);
  const box = umrandung(plaetze, w, h);
  for (const k of ['x0', 'y0']) box[k] -= 1.2;
  for (const k of ['x1', 'y1']) box[k] += 1.2;
  const nachPerson = new Map(plaetze.map(q => [q.e.p, q])), familie = (start.p.name.nachname || '').toUpperCase();
  const leben = q => { const l = lebenszeit(q.e.p); return l ? Math.min(100, l.bis - l.von) : 40; };

  const hinten = k => {
    const { g, f, m, b, h: hoehe } = k;
    if (k.verziert) k.g.drawImage(vorrat(k, `sterne|${!!k.grund.innen}|${k.einheit}`, b, hoehe, g => {
      const zufall2 = wuerfel(17);
      if (k.grund.innen) {
        const v = g.createRadialGradient(b / 2, hoehe * 1.1, 0, b / 2, hoehe * 0.5, Math.hypot(b, hoehe) * 0.75);
        v.addColorStop(0, '#1a2d58'); v.addColorStop(0.6, '#0b1430'); v.addColorStop(1, '#03060f');
        g.fillStyle = v;
        g.fillRect(0, 0, b, hoehe);
      }
      // Milchstraße: ein schräges Band aus Dunst und vielen kleinen Sternen
      g.save();
      g.translate(b / 2, hoehe / 2);
      g.rotate(-0.42);
      for (let i = 0; i < 70; i++) {
        const x = (zufall2() - 0.5) * b * 1.4, y = (zufall2() + zufall2() - 1) * hoehe * 0.12, r = (0.06 + zufall2() * 0.12) * hoehe;
        const v = g.createRadialGradient(x, y, 0, x, y, r);
        v.addColorStop(0, 'rgba(180, 190, 255, 0.07)'); v.addColorStop(1, 'rgba(180, 190, 255, 0)');
        g.fillStyle = v;
        g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      g.fillStyle = '#dfe6ff';
      for (let i = 0; i < 1400; i++) {
        const x = (zufall2() - 0.5) * b * 1.4, y = (zufall2() + zufall2() + zufall2() - 1.5) * hoehe * 0.12;
        g.globalAlpha = 0.2 + zufall2() * 0.5;
        g.fillRect(x, y, k.einheit * 1.2, k.einheit * 1.2);
      }
      g.restore();
      for (let i = 0; i < 900; i++) {
        const x = zufall2() * b, y = zufall2() * hoehe, r = (0.4 + zufall2() ** 3 * 1.6) * k.einheit;
        g.globalAlpha = 0.3 + zufall2() * 0.7;
        g.fillStyle = zufall2() < 0.15 ? '#ffe2b8' : '#ffffff';
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        if (r > 1.5 * k.einheit) { g.fillRect(x - r * 4, y - k.einheit * 0.3, r * 8, k.einheit * 0.6); g.fillRect(x - k.einheit * 0.3, y - r * 4, k.einheit * 0.6, r * 8); }
      }
    }), 0, 0, b, hoehe);
    if (k.verziert) {
      g.globalAlpha = 1;
      if (familie) {
        const [, oben] = f([0, box.y0 + 0.4]);
        g.font = `600 ${1.1 * m}px ${k.SCHRIFT}`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillStyle = 'rgba(200, 215, 255, 0.16)';
        g.fillText(familie.split('').join(' '), f([0, 0])[0], oben);
      }
    }
    // Lichthof je Person: je länger das Leben, desto größer
    for (const q of plaetze) {
      const [x, y] = f([q.x, q.y]), r = q.d * m * (0.75 + leben(q) / 90 * 1.3);
      const v = g.createRadialGradient(x, y, 0, x, y, r);
      v.addColorStop(0, 'rgba(255, 244, 214, 0.55)'); v.addColorStop(0.35, 'rgba(255, 228, 170, 0.18)'); v.addColorStop(1, 'rgba(255, 228, 170, 0)');
      g.fillStyle = v;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  };

  const linienMalen = k => {
    const { g, f, m } = k;
    g.strokeStyle = k.verziert ? 'rgba(175, 200, 255, 0.7)' : k.stil.linienfarbe;
    g.lineWidth = Math.max(1, 0.035 * m * k.dicke);
    for (const q of plaetze) for (const el of [q.e.p.vaterP, q.e.p.mutterP]) {
      const p = nachPerson.get(el);
      if (!p) continue;
      const [ax, ay] = f([q.x, q.y]), [bx, by] = f([p.x, p.y]), l = Math.hypot(bx - ax, by - ay), ra = q.d * m * 0.62, rb = p.d * m * 0.62;
      if (l <= ra + rb) continue;
      const ux = (bx - ax) / l, uy = (by - ay) / l;
      g.beginPath(); g.moveTo(ax + ux * ra, ay + uy * ra); g.lineTo(bx - ux * rb, by - uy * rb); g.stroke();
      k.pfade.push({ punkte: [[ax + ux * ra, ay + uy * ra], [bx - ux * rb, by - uy * rb]] });
    }
  };
  const schrift = { text: '#f4f6ff', text2: '#c3cbe6', hof: 'rgba(3, 6, 15, 0.8)' };
  return { plaetze, kanten: [], familien: [], box, kontur: [], kleinstes: 0.95, ohnePaare: true, hinten, linienMalen, schrift,
    titelSchrift: { text: '#f4f6ff', hof: 'rgba(3, 6, 15, 0.8)' } };
}

// =====================================================================================================================
// 7. Lebensstrom: die Vorfahren sind Quellen, ihre Bäche fließen zusammen bis zum Strom der Hauptperson; dahinter teilt er sich
function stromAnordnen(eintraege, { namen, verhaeltnis }) {
  const s = sichtbarVon(eintraege), start = startVon(s), { w, h } = einheiten(namen);
  const von = (e, art) => s.filter(x => x.von === e && x.art === art);
  const eltern = e => von(e, 'eltern').sort(nachSosa), kinder = e => von(e, 'kind').sort(nachGeburt);
  const hoch = e => knoten([e], h, 0, eltern(e).map(hoch)), runter = e => knoten([e], h, 0, kinder(e).map(runter));
  const baumA = hoch(start), baumN = runter(start);
  ordne(baumA, t => (t ? 0.45 : 0.3));
  ordne(baumN, t => (t ? 0.45 : 0.3));
  const tiefe = (kn, n = 0) => Math.max(n, ...kn.kinder.map(c => tiefe(c, n + 1)));
  const ta = tiefe(baumA), tn = tiefe(baumN), lagen = [];
  const sammle = (kn, y, t, v) => { lagen.push({ e: kn.personen[0], y, t: t * v }); for (const c of kn.kinder) sammle(c, y + c.dx, t + 1, v); };
  sammle(baumA, 0, 0, -1);
  baumN.kinder.forEach(c => sammle(c, c.dx, 1, 1));
  const ys = lagen.map(l => l.y), H = Math.max(...ys) - Math.min(...ys) + h + 1;
  const D = Math.max(w + 1.4, verhaeltnis * H * 0.95 / Math.max(1, ta + tn));
  const plaetze = lagen.map(l => ({ e: l.e, x: l.t * D, y: l.y, d: 1 })), nach = new Map(plaetze.map(q => [q.e, q]));
  // Breite eines Baches: so viele Vorfahren (oder Nachkommen), wie in ihn münden
  const zahlA = e => 1 + eltern(e).filter(x => nach.has(x)).reduce((a, x) => a + zahlA(x), 0);
  const zahlN = e => 1 + kinder(e).filter(x => nach.has(x)).reduce((a, x) => a + zahlN(x), 0);
  const u = Math.min(0.16, 2.2 / Math.max(zahlA(start), zahlN(start)));
  const baender = [];
  const zufluss = e => {
    const el = eltern(e).filter(x => nach.has(x)), breite = el.map(x => zahlA(x) * u), gesamt = breite.reduce((a, b) => a + b, 0);
    let oben = -gesamt / 2;
    el.forEach((x, i) => { baender.push({ von: nach.get(x), nach: nach.get(e), b0: breite[i], b1: breite[i], ab: 0, an: oben + breite[i] / 2 }); oben += breite[i]; zufluss(x); });
  };
  zufluss(start);
  const abfluss = e => {
    const ks = kinder(e).filter(x => nach.has(x)), breite = ks.map(x => zahlN(x) * u), gesamt = breite.reduce((a, b) => a + b, 0);
    let oben = -gesamt / 2;
    ks.forEach((x, i) => { baender.push({ von: nach.get(e), nach: nach.get(x), b0: breite[i], b1: breite[i], ab: oben + breite[i] / 2, an: 0 }); oben += breite[i]; abfluss(x); });
  };
  abfluss(start);
  const box = umrandung(plaetze, w, h);

  const hinten = k => {
    if (!k.verziert) return;
    const { g, b, h: hoehe, stil } = k, zufall = wuerfel(23);
    // Höhenlinien wie auf einer Wanderkarte
    g.strokeStyle = stil.linienfarbe;
    g.globalAlpha = 0.12;
    g.lineWidth = Math.max(1, hoehe * 0.0012);
    for (let z = 0; z < 4; z++) {
      const cx = zufall() * b, cy = zufall() * hoehe, phase = zufall() * 6;
      for (let r = 1; r < 9; r++) {
        g.beginPath();
        for (let i = 0; i <= 64; i++) {
          const a = i / 64 * TAU, rr = r * hoehe * 0.06 * (1 + 0.18 * Math.sin(a * 3 + phase + r * 0.4));
          const x = cx + Math.cos(a) * rr * 1.5, y = cy + Math.sin(a) * rr;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  };

  const linienMalen = k => {
    const { g, f, m } = k, dunkel = dunkelGrund(k);
    const farbe = e => `hsl(${188 + hash(e.p.name.nachname || e.p.id) % 36}, ${dunkel ? 55 : 48}%, ${dunkel ? 52 : 46}%)`;
    for (const bd of baender) {
      const [ax, ay] = f([bd.von.x, bd.von.y + bd.ab]), [bx, by] = f([bd.nach.x, bd.nach.y + bd.an]), b0 = bd.b0 * m / 2 * k.dicke, b1 = bd.b1 * m / 2 * k.dicke, mx = (ax + bx) / 2;
      g.beginPath();
      g.moveTo(ax, ay - b0);
      g.bezierCurveTo(mx, ay - b0, mx, by - b1, bx, by - b1);
      g.lineTo(bx, by + b1);
      g.bezierCurveTo(mx, by + b1, mx, ay + b0, ax, ay + b0);
      g.closePath();
      const v = g.createLinearGradient(ax, 0, bx, 0);
      v.addColorStop(0, farbe(bd.von.e));
      v.addColorStop(1, farbe(bd.nach.e));
      g.fillStyle = v;
      g.globalAlpha = 0.88;
      g.fill();
      // Glanz auf dem Wasser
      g.globalAlpha = 0.3;
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1, (b0 + b1) * 0.18);
      g.setLineDash([0.4 * m, 0.25 * m]);
      g.beginPath();
      g.moveTo(ax, ay - b0 * 0.3);
      g.bezierCurveTo(mx, ay - b0 * 0.3, mx, by - b1 * 0.3, bx, by - b1 * 0.3);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      k.pfade.push({ punkte: k.bogen([ax, ay - b0], [mx, ay - b0], [mx, by - b1], [bx, by - b1]), leise: true });
    }
  };
  return { plaetze, kanten: [], familien: [], box, kontur: [], kleinstes: 1, ohnePaare: true, hinten, linienMalen };
}

// =====================================================================================================================
// 8. Gesichtermosaik: das Bild der Hauptperson aus vielen kleinen Bildern ihrer Familie zusammengesetzt
const ZELLEN = 56;
const helligkeiten = new Map();

function helligkeit(bild, w) {
  const schluessel = [bild.src, w.cx, w.cy, w.z].join('|');
  if (!helligkeiten.has(schluessel)) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const o = c.getContext('2d', { willReadFrequently: true }), s = Math.min(bild.naturalWidth, bild.naturalHeight) / (w.z ?? 1);
    o.drawImage(bild, Math.max(0, (w.cx ?? 0.5) * bild.naturalWidth - s / 2), Math.max(0, (w.cy ?? 0.5) * bild.naturalHeight - s / 2), s, s, 0, 0, 8, 8);
    let wert = 0.5;
    try {
      const d = o.getImageData(0, 0, 8, 8).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) n += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      wert = n / 64 / 255;
    } catch (err) { /* fremdes Bild: mittlere Helligkeit */ }
    helligkeiten.set(schluessel, wert);
  }
  return helligkeiten.get(schluessel);
}

function mosaikAnordnen(eintraege) {
  const s = sichtbarVon(eintraege), start = startVon(s), personen = s.map(e => e.p);
  const hinten = k => {
    const { g, f, m, bilder, wahl, stil } = k, ziel = wahl(start.p), bild = ziel.src ? bilder.get(ziel.src) : null;
    if (!ziel.src) return hinweis(k, t('Für die Hauptperson gibt es kein Bild.'));
    if (!bild) return hinweis(k, t('Bilder werden geladen …'));
    const c = document.createElement('canvas');
    c.width = c.height = ZELLEN;
    const o = c.getContext('2d', { willReadFrequently: true }), z = ziel.z ?? 1, sw = Math.min(bild.naturalWidth, bild.naturalHeight) / z;
    o.drawImage(bild, Math.max(0, Math.min(bild.naturalWidth - sw, (ziel.cx ?? 0.5) * bild.naturalWidth - sw / 2)),
      Math.max(0, Math.min(bild.naturalHeight - sw, (ziel.cy ?? 0.5) * bild.naturalHeight - sw / 2)), sw, sw, 0, 0, ZELLEN, ZELLEN);
    let pixel;
    try { pixel = o.getImageData(0, 0, ZELLEN, ZELLEN).data; } catch (err) { return hinweis(k, t('Das Bild der Hauptperson lässt sich nicht auslesen.')); }
    const kacheln = [];
    for (const p of personen) {
      const w = wahl(p), b = w.src ? bilder.get(w.src) : null;
      if (b) kacheln.push({ w, b, hell: helligkeit(b, w), ton: w.ton || stil.ton });
    }
    if (!kacheln.length) return hinweis(k, t('Bilder werden geladen …'));
    kacheln.sort((a, b) => a.hell - b.hell);
    const [x0, y0] = f([0, 0]), zelle = Math.min(160, m * k.schaerfe), px = Math.max(8, Math.min(256, Math.ceil(zelle / 4) * 4));
    const bild2 = vorrat(k, ['mosaik', ziel.src, ziel.cx, ziel.cy, ziel.z, stil.ton, k.verziert, stil.rankenSaat, kacheln.map(x => x.b.src).join(',')].join('|'), ZELLEN * zelle, ZELLEN * zelle, g => {
    const zufall = wuerfel(stil.rankenSaat || 1), vorige = [];
    for (let y = 0; y < ZELLEN; y++) for (let x = 0; x < ZELLEN; x++) {
      const i = (y * ZELLEN + x) * 4, L = (0.299 * pixel[i] + 0.587 * pixel[i + 1] + 0.114 * pixel[i + 2]) / 255;
      // unter den nach Helligkeit passendsten Bildern eins, das nicht gleich neben sich selbst liegt
      let lo = 0, hi = kacheln.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (kacheln[mid].hell < L) lo = mid + 1; else hi = mid; }
      const nah = [];
      for (let j = Math.max(0, lo - 3); j <= Math.min(kacheln.length - 1, lo + 3); j++) if (kacheln[j] !== vorige[x] && kacheln[j] !== vorige[x - 1]) nah.push(kacheln[j]);
      const kachel = nah.length ? nah[Math.floor(zufall() * nah.length)] : kacheln[lo];
      vorige[x] = kachel;
      g.drawImage(k.rund(kachel.b, px, kachel.ton, kachel.w, 'quadrat'), x * zelle, y * zelle, zelle + 0.5, zelle + 0.5);
      if (k.verziert) {
        const grau = stil.ton !== 'farbe';
        const [r, gg, bb] = grau ? [L * 255, L * 255, L * 255] : [pixel[i], pixel[i + 1], pixel[i + 2]];
        g.fillStyle = `rgba(${r | 0}, ${gg | 0}, ${bb | 0}, 0.52)`;
        g.fillRect(x * zelle, y * zelle, zelle + 0.5, zelle + 0.5);
      }
    }
    });
    k.g.drawImage(bild2, x0, y0, ZELLEN * m, ZELLEN * m);
  };
  return { plaetze: [], kanten: [], familien: [], box: { x0: 0, y0: 0, x1: ZELLEN, y1: ZELLEN }, kontur: [], kleinstes: 1e9, ohnePaare: true,
    bilderLaden: personen, anzahl: personen.length, hinten, linienMalen: () => {} };
}

// --- Sinnbilder für die Knöpfe -------------------------------------------------------------------------------------
const zug = (punkte, zu = false) => ({ zug: punkte, zu });
const SYMBOLE = {
  zeit: () => [[-1.7, -0.9, 0.6], [-1.1, -0.3, 1.4], [-0.4, 0.3, 1.8], [0.3, 0.9, 1.8]].flatMap(([x, y, e]) => [zug([[x, y], [e, y]]), zug(kreis(x, y, 0.16), true)])
    .concat([zug([[-1.1, -0.9], [-1.1, -0.3]]), zug([[-0.4, -0.3], [-0.4, 0.3]]), zug([[0.3, 0.3], [0.3, 0.9]])]),
  karte: () => [zug(glatt([[-1.9, -0.6], [-1.2, -1], [-0.4, -0.7], [0.3, -1.2], [1.2, -0.9], [1.9, -1.2]])), zug(glatt([[-1.9, 1.1], [-0.8, 0.8], [0.4, 1.2], [1.9, 0.9]])),
    zug(glatt([[-1.3, -0.2], [-0.5, -0.5], [0.4, 0.1]])), zug(glatt([[0.4, 0.1], [1, 0.6], [1.4, 0.2]])), zug(kreis(-1.3, -0.2, 0.12), true), zug(kreis(0.4, 0.1, 0.12), true), zug(kreis(1.4, 0.2, 0.12), true)],
  galerie: () => [zug([[-1.8, -1.1], [-0.7, -1.1], [-0.7, 0.2], [-1.8, 0.2]], true), zug(kreis(0, -0.4, 0.5, 20).map(([x, y]) => [x * 0.8, (y + 0.4) * 1.3 - 0.4]), true),
    zug([[0.7, -1.1], [1.8, -1.1], [1.8, 0.2], [0.7, 0.2]], true), zug([[-1.5, 0.5], [-1, 0.5]]), zug([[-0.25, 0.5], [0.25, 0.5]]), zug([[1, 0.5], [1.5, 0.5]]), zug([[-2, 1.1], [2, 1.1]])],
  rosette: () => [zug(kreis(0, 0, 1.4, 40), true), zug(kreis(0, 0, 0.9, 32), true), zug(kreis(0, 0, 0.4, 20), true),
    ...Array.from({ length: 8 }, (_, i) => { const a = i / 8 * TAU; return zug([[Math.cos(a) * 0.4, Math.sin(a) * 0.4], [Math.cos(a) * 1.4, Math.sin(a) * 1.4]]); })],
  wurzeln: () => [zug([[-2, -0.3], [2, -0.3]]), zug([[0, -0.3], [0, -1]]), zug(kreis(0, -1.1, 0.35), true), zug(glatt([[0, -0.3], [-0.4, 0.3], [-1.2, 0.7], [-1.6, 1.3]])),
    zug(glatt([[0, -0.3], [0.4, 0.3], [1.2, 0.7], [1.6, 1.3]])), zug(glatt([[-0.4, 0.3], [-0.3, 0.9], [-0.5, 1.4]])), zug(glatt([[0.4, 0.3], [0.3, 0.9], [0.5, 1.4]]))],
  sterne: () => {
    const st = [[0, 1], [-0.9, 0.1], [0.9, 0.2], [-1.6, -0.8], [-0.4, -0.9], [0.5, -1], [1.5, -0.6]];
    const stern = ([x, y]) => zug(Array.from({ length: 10 }, (_, i) => { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.08 : 0.2; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; }), true);
    return [zug([st[3], st[1], st[0], st[2], st[6]]), zug([st[1], st[4]]), zug([st[2], st[5]]), ...st.map(stern)];
  },
  strom: () => [zug(glatt([[-1.9, -1.1], [-1, -0.9], [-0.2, -0.2], [0.6, 0], [1.9, 0]])), zug(glatt([[-1.9, 1.1], [-1, 0.9], [-0.2, 0.2], [0.6, 0]])),
    zug(glatt([[-1.9, -0.2], [-1, -0.4], [-0.6, -0.5]])), zug(glatt([[-1.9, 0.3], [-1, 0.5], [-0.6, 0.55]])), zug([[0.6, 0.12], [1.9, 0.12]])],
  mosaik: () => Array.from({ length: 12 }, (_, i) => { const x = -1.5 + (i % 4) * 0.8, y = -1.1 + Math.floor(i / 4) * 0.8; return zug([[x, y], [x + 0.7, y], [x + 0.7, y + 0.7], [x, y + 0.7]], true); }),
};

const form = (name, tipp, anordnen, mehr = {}) => ({ name, tipp, anordnen, box: SYMBOL_BOX, streng: true, kontur: SYMBOLE[mehr.symbol], ...mehr });
export const SONDERFORMEN = {
  zeit: form('Lebensfäden', 'Jedes Leben ein Faden auf der Zeitachse, Striche führen von den Eltern zur Geburt der Kinder', zeitAnordnen,
    { symbol: 'zeit', zierName: 'Zeitachse und Epochen', partnerAlle: true }),
  karte: form('Wanderkarte', 'Jede Person an ihrem Geburtsort, Pfeile zeigen die Wege der Familie, Grenzen der Zeit', karteAnordnen,
    { symbol: 'karte', zierName: 'Landkarte zeichnen' }),
  galerie: form('Ahnengalerie', 'Ölbilder an der Schlosswand, Rahmen im Stil der Zeit, darunter ein Messingschild', galerieAnordnen,
    { symbol: 'galerie', zierName: 'Wand zeichnen' }),
  rosette: form('Rosette', 'Ein Kirchenfenster: Hauptperson in der Mitte, jede Generation ein Ring, Vaterseite links', rosetteAnordnen,
    { symbol: 'rosette', zierName: 'Buntglas und Maßwerk', ohne: ['nachkommen', 'partner', 'geschwister'] }),
  wurzeln: form('Wurzelwerk', 'Oben Hauptperson und Kinder als Baum, darunter die Vorfahren als Wurzeln in den Erdschichten der Jahrhunderte', wurzelnAnordnen,
    { symbol: 'wurzeln', zierName: 'Erde und Baum zeichnen', ohne: ['geschwister'] }),
  sterne: form('Sternbild', 'Die Vorfahren als Sterne, je länger das Leben, desto heller; die Linien bilden das Sternbild der Familie', sterneAnordnen,
    { symbol: 'sterne', zierName: 'Sternenhimmel zeichnen', ohne: ['partner', 'geschwister'] }),
  strom: form('Lebensstrom', 'Die Vorfahren sind Quellen, ihre Bäche fließen zum Strom der Hauptperson zusammen', stromAnordnen,
    { symbol: 'strom', zierName: 'Höhenlinien zeichnen', ohne: ['partner', 'geschwister'] }),
  mosaik: form('Gesichtermosaik', 'Das Bild der Hauptperson aus den Bildern ihrer Familie zusammengesetzt', mosaikAnordnen,
    { symbol: 'mosaik', zierName: 'Bild durchscheinen lassen' }),
};
