// Formen der Bildwerkstatt: welche Personen ins Bild kommen und wo sie stehen. Nur Geometrie, ohne Oberfläche und Zeichnen.
// Bewusst nicht über ansicht() aus daten.js: Die schreibt in die Personen und würde die Ansicht der Bühne verändern.
//
// Die Personen bilden die Form selbst: Jede Form bietet Reihen an (reihe), auf denen Porträts Platz finden, und der Löser
// sucht die größte Porträtgröße, bei der alle ohne Überlappung hineinpassen. Danach verteilt er den übrigen Platz.

const FEIN = 0.012;          // so weit rückt der Löser vor, wenn eine Reihe nicht passt
const SCHRUMPF = 0.9;        // je Generation Abstand von der Hauptperson werden die Porträts so viel kleiner
const KLEINSTER = 0.6;

/** Wer mit welcher Hauptperson ins Bild kommt. `weg` sind Personen, die nicht gezeigt werden, weil sie selbst abgewählt
 *  sind (`aus`) oder an einer abgewählten Person hängen; sie bleiben in der Liste, damit man sie zurückholen kann. */
export function auswahl(root, { vorfahren = 0, nachkommen = 0, partner = false, geschwister = false, aus = [], mehr = [] } = {}) {
  const abgewaehlt = new Set(aus), weiter = new Set(mehr), gesehen = new Set([root]), eintraege = [];
  const neu = (p, ebene, seite, von, art, sosa = 0) => {
    const e = { p, ebene, seite, von, art, sosa, geburt: p.geburt ?? p.jahrE ?? 0,
      aus: p !== root && abgewaehlt.has(p.id), weg: false };
    e.weg = e.aus || !!von?.weg;
    gesehen.add(p);
    eintraege.push(e);
    return e;
  };
  const start = neu(root, 0, 'm', null, 'start', 1);
  // Vorfahren von innen nach außen; bei Ahnenschwund zählt jede Person nur einmal. Über die eingestellte Generation
  // hinaus geht es nur bei Personen, deren Eltern ausdrücklich eingeblendet wurden (`mehr`).
  const vorfahrenVon = anfang => {
    let stufe = [anfang];
    while (stufe.length) {
      const naechste = [];
      for (const x of stufe) {
        const g = x.ebene + 1;
        if (x.art !== 'partner' && g > vorfahren && !weiter.has(x.p.id)) continue;
        if (x.art === 'partner' && !weiter.has(x.p.id)) continue;
        [[x.p.vaterP, 0], [x.p.mutterP, 1]].forEach(([e, add]) => {
          if (!e || gesehen.has(e)) return;
          const seite = x.art === 'partner' ? 'r' : g === 1 ? (add ? 'r' : 'l') : x.seite;
          naechste.push(neu(e, g, seite, x, 'eltern', x.sosa * 2 + add));
        });
      }
      stufe = naechste;
    }
  };
  vorfahrenVon(start);
  if (partner) for (const pa of root.partnerP ?? []) if (!gesehen.has(pa)) vorfahrenVon(neu(pa, 0, 'm', start, 'partner', 1000));
  if (geschwister) {
    const kinder = [...new Set([root.vaterP, root.mutterP].filter(Boolean).flatMap(e => e.kinderP ?? []))];
    for (const g of kinder) {
      if (gesehen.has(g)) continue;
      const eltern = eintraege.find(e => e.ebene === 1 && (e.p === g.vaterP || e.p === g.mutterP));
      neu(g, 0, 'm', eltern ?? start, 'geschwister');
    }
  }
  let stufe = [start];
  for (let g = 1; g <= nachkommen; g++) {
    const naechste = [];
    for (const x of stufe) for (const k of x.p.kinderP ?? []) {
      if (gesehen.has(k)) continue;
      const kind = neu(k, -g, 'm', x, 'kind'), andere = k.vaterP === x.p ? k.mutterP : k.vaterP;
      kind.paar = eintraege.find(e => e.art === 'partner' && e.p === andere) ?? null;
      naechste.push(kind);
    }
    stufe = naechste;
  }
  return eintraege;
}

// --- Hilfen für Linienzüge ---------------------------------------------------------------------------
const abstand = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const laenge = zug => zug.slice(1).reduce((s, p, i) => s + abstand(zug[i], p), 0);

function punktBei(zug, s) {
  for (let i = 1; i < zug.length; i++) {
    const l = abstand(zug[i - 1], zug[i]);
    if (s <= l || i === zug.length - 1) {
      const k = l ? Math.min(1, s / l) : 0;
      return [zug[i - 1][0] + (zug[i][0] - zug[i - 1][0]) * k, zug[i - 1][1] + (zug[i][1] - zug[i - 1][1]) * k];
    }
    s -= l;
  }
  return zug[zug.length - 1];
}

/** Ein Paar steht zusammen mitten auf dem Linienzug */
function dicht(zug, n, luecke) {
  const [x, y] = punktBei(zug, laenge(zug) / 2);
  return Array.from({ length: n }, (_, i) => [x + (i - (n - 1) / 2) * luecke, y]);
}

/** n Plätze gleichmäßig auf dem Linienzug: einer in der Mitte, mehrere bis an beide Enden, damit sie die Form ausfüllen */
function verteile(zug, n) {
  const l = laenge(zug);
  return Array.from({ length: n }, (_, i) => punktBei(zug, n === 1 ? l / 2 : l * i / (n - 1)));
}

/** Plätze als versetztes Raster im Umriss; Gesicht und Name müssen ganz hineinpassen */
function raster(umriss, xAnfang, box, d, h, luecke, frei = () => true) {
  const orte = [], innen = (x, y) => schnitte(umriss, y).filter(a => a < x).length % 2 === 1;
  let reihe = 0;
  for (let y = box.y0 + d / 2; y + h - d / 2 < box.y1; y += h, reihe++) {
    for (let x = xAnfang + (reihe % 2 ? luecke / 2 : 0); x + d / 2 < box.x1; x += luecke) {
      const breit = Math.max(d, luecke * 0.9) / 2, unten = y + h - d / 2;
      if ([[x, y - d / 2], [x - d / 2, y], [x + d / 2, y], [x - breit, unten], [x + breit, unten]].every(([a, b]) => innen(a, b)) && frei(x, y)) orte.push([x, y]);
    }
  }
  return orte;
}

function schnitte(umriss, y) {
  const xs = [];
  for (let i = 0; i < umriss.length; i++) {
    const a = umriss[i], b = umriss[(i + 1) % umriss.length];
    if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
  }
  return xs.sort((p, q) => p - q);
}

/** Glatte Kurve durch die Punkte (Catmull-Rom) */
function glatt(punkte, je = 12) {
  const z = [];
  for (let i = 0; i < punkte.length - 1; i++) {
    const p0 = punkte[Math.max(0, i - 1)], p1 = punkte[i], p2 = punkte[i + 1], p3 = punkte[Math.min(punkte.length - 1, i + 2)];
    for (let k = 0; k < je; k++) {
      const t = k / je, t2 = t * t, t3 = t2 * t;
      z.push([0, 1].map(c => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
        + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  z.push(punkte[punkte.length - 1]);
  return z;
}

// --- Herz: unten die Jüngsten, nach oben die Älteren; links die Vaterseite, rechts die Mutterseite ------------------
const HERZ = Array.from({ length: 240 }, (_, i) => {
  const t = i / 240 * 2 * Math.PI;
  return [Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16];
});
const HERZ_UNTEN = Math.max(...HERZ.map(p => p[1])), HERZ_OBEN = Math.min(...HERZ.map(p => p[1]));

const herz = {
  box: { x0: -1.04, y0: HERZ_OBEN - 0.04, x1: 1.04, y1: HERZ_UNTEN + 0.04 },
  laenge: HERZ_UNTEN - HERZ_OBEN,
  gemeinsam: true,
  groesstes: 0.52,
  /** Reihe für Porträts der Größe d mit Gesamthöhe h (mit Namen darunter), t läuft von der Spitze nach oben */
  reihe(t, h, seite, d) {
    const y = HERZ_UNTEN - t * this.laenge;
    let links = -Infinity, rechts = Infinity, spalt = 0;
    for (const yy of [y - d / 2, y, y + h - d / 2]) {
      const xs = schnitte(HERZ, yy);
      if (xs.length < 2) return null;
      links = Math.max(links, xs[0]);
      rechts = Math.min(rechts, xs[xs.length - 1]);
      if (xs.length >= 4) spalt = Math.max(spalt, xs[2]);   // oben ragt die Kerbe zwischen den beiden Bögen herein
    }
    links += d / 2; rechts -= d / 2;
    if (links > rechts) return null;
    if (seite === 'm') return spalt ? null : [[links, y], [rechts, y]];
    const innen = spalt + d * 0.62;
    if (seite === 'l') return -innen >= links ? [[links, y], [-innen, y]] : null;
    return innen <= rechts ? [[innen, y], [rechts, y]] : null;
  },
  kontur: () => [{ zug: HERZ, zu: true }],
};

// --- Flügel: ein Paar; die Hauptperson in der Mitte, Vaterseite links, Mutterseite rechts, darunter die übrige Familie ---
const SCHULTER = [0.16, 0];
const FLUEGEL = glatt([SCHULTER, [0.2, -0.42], [0.34, -0.78], [0.65, -1], [1.1, -1.02], [1.6, -0.88], [1.98, -0.5], [1.95, -0.1],
  [1.72, 0.3], [1.38, 0.62], [1, 0.85], [0.62, 0.95], [0.3, 0.85], [0.2, 0.45], SCHULTER]);
const vonSchulter = q => Math.hypot(q[0] - SCHULTER[0], q[1] - SCHULTER[1]);
const REICHWEITE = 1;   // Nahe am Körper stoßen die Reihen zusammen: Personen stehen nur, wo der Rand so weit entfernt ist
const NUTZBAR = FLUEGEL.filter(q => vonSchulter(q) >= REICHWEITE);
const gespiegelt = (zug, seite) => seite === 'l' ? zug.map(([x, y]) => [-x, y]) : zug;
const FEDERN = 16;

function fluegelKontur(seite) {
  // von der Spitze bis zum Körper läuft der Rand als Federn aus
  const n = FLUEGEL.length, ab = FLUEGEL.reduce((b, q, i) => q[0] > FLUEGEL[b][0] ? i : b, 0);
  const bis = FLUEGEL.findLastIndex(q => vonSchulter(q) >= REICHWEITE * 0.9), rand = [];
  FLUEGEL.forEach((q, i) => {
    const k = i >= ab && i <= bis ? Math.abs(Math.sin(Math.PI * FEDERN * (i - ab) / (bis - ab))) * 0.05 : 0, l = vonSchulter(q) || 1;
    rand.push([q[0] + (q[0] - SCHULTER[0]) / l * k, q[1] + (q[1] - SCHULTER[1]) / l * k]);
  });
  const striche = [];
  for (let f = 1; f < FEDERN; f++) {
    const q = FLUEGEL[Math.min(n - 1, ab + Math.round((bis - ab) * f / FEDERN))];
    striche.push({ zug: gespiegelt([q, [SCHULTER[0] + (q[0] - SCHULTER[0]) * 0.8, SCHULTER[1] + (q[1] - SCHULTER[1]) * 0.8]], seite), zu: false });
  }
  return [{ zug: gespiegelt(rand, seite), zu: true }, ...striche];
}

const fluegel = {
  box: { x0: -2.06, y0: -1.1, x1: 2.06, y1: 1.06 },
  laenge: 1,
  groesstes: 0.75,
  flaeche: true,
  /** Mitte unter der Hauptperson: alle, die nicht in die Flügel gehören */
  reihe(t, h, seite, d) {
    const y = t * 1.0, breit = 0.06 + 0.42 * t;
    return y + h - d / 2 > this.box.y1 ? null : [[-breit, y], [breit, y]];
  },
  /** Plätze im rechten Flügel als versetztes Raster, damit sich die Fläche bei jedem Stammbaum füllt; innen zuerst */
  plaetze(d, h, luecke, frei) {
    return raster(FLUEGEL, SCHULTER[0], this.box, d, h, luecke, frei).sort((a, b) => vonSchulter(a) - vonSchulter(b));
  },
  kontur: () => [...fluegelKontur('l'), ...fluegelKontur('r')],
};

// --- Frei: beginnt mit der Hauptperson, alle weiteren Personen und ihre Plätze bestimmt man selbst -----------------------------
const frei = {
  box: { x0: -2, y0: -1.125, x1: 2, y1: 1.125 },
  frei: true,
  kontur: () => [{ zug: [[-1.2, 0.7], [0, -0.7], [1.2, 0.7]], zu: false }],
};

export const FORMEN = { herz, fluegel, frei };

/** Geschwister einer Person: alle Kinder ihrer Eltern */
export const geschwisterVon = p => [...new Set((p.eltern ?? []).flatMap(e => e.kinderP ?? []))].filter(k => k !== p);

/** Freie Plätze für neu eingeblendete Personen in der Nähe ihrer Verwandten; `plaetze` ist { id: { x, y } }. Reicht das Bild
 *  nicht, stehen sie außerhalb: Niemand wird auf einen anderen gelegt, die Anordnung rückt danach kleiner (freiMassstab). */
export function freiEinblenden(plaetze, von, art, liste, d, namen) {
  const m = masse(d, namen), a = plaetze[von.id] ?? { x: 0, y: 0 }, n = liste.length;
  const belegt = (x, y) => Object.values(plaetze).some(q => Math.abs(q.x - x) < m.luecke * 0.98 && Math.abs(q.y - y) < m.h * 0.98);
  liste.forEach((p, i) => {
    const mittig = (i - (n - 1) / 2) * m.luecke;
    const ziel = { eltern: [a.x + mittig, a.y - m.h * 1.2], kinder: [a.x + mittig, a.y + m.h * 1.3], partner: [a.x + m.luecke * (i + 1), a.y],
      geschwister: [a.x - m.luecke * (i + 1), a.y] }[art];
    // vom Wunschplatz spiralförmig nach außen, bis etwas frei ist
    for (let w = 0, r = 0; ; w += 0.4, r += 0.01) {
      const x = ziel[0] + r * Math.cos(w), y = ziel[1] + r * Math.sin(w);
      if (!belegt(x, y)) { plaetze[p.id] = { x, y }; break; }
    }
  });
}

/** Maßstab, bei dem alle in das Bild der freien Form passen (höchstens 1) */
export function freiMassstab(plaetze, d, namen) {
  const m = masse(d, namen), box = frei.box;
  let k = 1;
  for (const { x, y } of Object.values(plaetze)) {
    k = Math.min(k, box.x1 / (Math.abs(x) + d / 2), box.y1 / Math.max(d / 2 - y, y + m.h - d / 2));
  }
  return k;
}

/** Eheleute in einer Bildblase: zwei Plätze werden einer, in der Mitte zwischen beiden; alle Linien der beiden laufen dorthin.
 *  `paare` sind Paare von Kennungen, die erste Person gibt das Bild. Verändert den Plan und gibt ihn zurück. */
export function paareZusammenfassen(plan, paare) {
  const nach = new Map(plan.plaetze.map(q => [q.e.p.id, q])), ersatz = new Map();
  for (const [a, b] of paare) {
    const qa = nach.get(a), qb = nach.get(b);
    if (!qa || !qb || qa.zweiter || qb.zweiter || ersatz.has(qa) || ersatz.has(qb)) continue;
    Object.assign(qa, { x: (qa.x + qb.x) / 2, y: (qa.y + qb.y) / 2, d: Math.max(qa.d, qb.d) * 1.15, zweiter: qb.e.p, seite: qa.e.seite === qb.e.seite ? qa.e.seite : 'm' });
    ersatz.set(qb, qa);
  }
  if (!ersatz.size) return plan;
  const neu = q => ersatz.get(q) ?? q, gesehen = new Set();
  plan.plaetze = plan.plaetze.filter(q => !ersatz.has(q));
  plan.kanten = plan.kanten.map(k => ({ ...k, a: neu(k.a), b: neu(k.b) })).filter(k => {
    const schluessel = [k.a.e.p.id, k.b.e.p.id].sort().join('+');
    if (k.a === k.b || gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
  const gruppen = new Map();
  for (const { eltern, kinder } of plan.familien) {
    const e = [...new Set(eltern.map(neu))], schluessel = e.map(q => q.e.p.id).join('+');
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, { eltern: e, kinder: [] });
    const liste = gruppen.get(schluessel).kinder;
    for (const k of kinder.map(neu)) if (!liste.includes(k) && !e.includes(k)) liste.push(k);
  }
  plan.familien = [...gruppen.values()].filter(x => x.kinder.length);
  return plan;
}

/** Plan der freien Form: gezeigt wird, wer in `plaetze` steht; die Linien ergeben sich aus der Verwandtschaft */
export function anordnenFrei(root, plaetze, byId, d) {
  const seite = new Map();
  const hoch = (p, s) => { if (p && !seite.has(p)) { seite.set(p, s); hoch(p.vaterP, s); hoch(p.mutterP, s); } };
  hoch(root.vaterP, 'l');
  hoch(root.mutterP, 'r');
  const orte = Object.entries(plaetze).filter(([id]) => byId.has(id)).map(([id, o]) => {
    const p = byId.get(id);
    return { e: { p, art: p === root ? 'start' : 'frei', seite: seite.get(p) ?? 'm', ebene: 0 }, x: o.x, y: o.y, d };
  });
  const nach = new Map(orte.map(q => [q.e.p, q])), kanten = [], gruppen = new Map();
  for (const q of orte) {
    for (const pa of q.e.p.partnerP ?? []) if (nach.has(pa) && q.e.p.id < pa.id) kanten.push({ a: q, b: nach.get(pa), art: 'partner' });
    const eltern = (q.e.p.eltern ?? []).filter(e => nach.has(e)).map(e => nach.get(e));
    if (!eltern.length) continue;
    const schluessel = eltern.map(x => x.e.p.id).join('+');
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, { eltern, kinder: [] });
    gruppen.get(schluessel).kinder.push(q);
  }
  return { plaetze: orte, kanten, familien: [...gruppen.values()], box: frei.box, kontur: [], kleinstes: d };
}

// --- Der Löser ---------------------------------------------------------------------------------------
function ebenenBilden(sichtbar, form, seiten) {
  const nach = new Map();
  for (const e of sichtbar) {
    // Geschwister in eigener Reihe: Das Paar der Hauptperson soll zusammenstehen, und unter ihm laufen die Kinder zusammen
    const g = e.art === 'geschwister' && form.gemeinsam ? 0.5 : e.ebene;
    if (!nach.has(g)) nach.set(g, { g, m: [], l: [], r: [], faktor: Math.max(KLEINSTER, SCHRUMPF ** Math.abs(g)) });
    nach.get(g)[e.seite].push(e);
  }
  const ebenen = [...nach.values()].sort((a, b) => a.g - b.g);
  for (const eb of ebenen) {
    eb.l.sort((a, b) => a.sosa - b.sosa);
    eb.r.sort((a, b) => a.sosa - b.sosa);
    // Stammbäume sind selten gleich weit erforscht: Damit das Herz trotzdem ganz gefüllt ist, teilt sich jede Generation
    // gleichmäßig auf beide Hälften. Die Reihenfolge bleibt, darum kreuzen sich die Linien nicht. Im Flügel nicht: Dort wäre
    // das ein Sprung quer über das Bild, jede Seite bleibt in ihrem Flügel und füllt ihn für sich (flaecheBelegen).
    if (!seiten && !form.flaeche && eb.l.length + eb.r.length > 1) {
      // ein Elternpaar bleibt zusammen; lässt es sich nirgends sinnvoll teilen, bleibt jeder auf seiner Seite
      const alle = [...eb.l, ...eb.r];
      let mitte = Math.ceil(alle.length / 2);
      while (mitte < alle.length && alle[mitte].von === alle[mitte - 1].von) mitte++;
      if (mitte < alle.length) { eb.l = alle.slice(0, mitte); eb.r = alle.slice(mitte); }
    }
    if (form.flaeche) eb.r.reverse();   // im Flügel läuft die Reihe links hinab und rechts wieder hinauf
    eb.m.sort((a, b) => a.geburt - b.geburt);
    const i = eb.m.findIndex(e => e.art === 'start');
    if (i >= 0) {
      const [start] = eb.m.splice(i, 1);
      // im Herz steht das Paar zusammen in der Mitte, bei zwei Partnern die Hauptperson zwischen ihnen
      eb.m.splice(form.gemeinsam ? Math.floor(eb.m.length / 2) : 0, 0, start);
      eb.paar = !!form.gemeinsam && eb.m.length > 1;
    }
  }
  return ebenen;
}

function legeAn(form, ebenen, basis, luft, namen) {
  const plaetze = [];
  const passt = (x, y, d, neu) => [...plaetze, ...neu].every(q => Math.hypot(q.x - x, q.y - y) >= (q.d + d) / 2 * 1.04);
  const lauf = (folge, t, seiten, weg) => {
    for (const eb of folge) {
      const d = basis * eb.faktor, h = d * (namen ? 1.62 : 1.08), luecke = d * (namen ? 1.42 : 1.14);
      const rest = { m: [...eb.m], l: [...eb.l], r: [...eb.r] };
      // über den Kindern Platz für die Linie, die unter den Eltern zusammenläuft
      if (form.gemeinsam && eb.g <= 0 && eb.g > folge[0].g) t += d * 0.42 / weg;
      while (seiten.some(s => rest[s].length)) {
        if (t > 1) return null;
        const neu = [], genommen = {};
        for (const s of seiten) {
          if (!rest[s].length) continue;
          const zug = form.reihe(t, h, s, d);
          if (!zug) continue;
          const platz = Math.floor(laenge(zug) / luecke) + 1;
          if (eb.paar && platz < rest[s].length) continue;   // ein Paar wird nicht getrennt
          const n = Math.min(platz, rest[s].length), orte = eb.paar ? dicht(zug, n, luecke) : verteile(zug, n), reihe = [];
          for (let i = 0; i < n; i++) {
            if (!passt(orte[i][0], orte[i][1], d, [...neu, ...reihe])) { reihe.length = 0; break; }
            reihe.push({ e: rest[s][i], x: orte[i][0], y: orte[i][1], d });
          }
          if (reihe.length) { neu.push(...reihe); genommen[s] = n; }
        }
        if (neu.length) {
          plaetze.push(...neu);
          for (const s in genommen) rest[s].splice(0, genommen[s]);
          t += h * luft / weg;
        } else t += FEIN;
      }
    }
    return t;
  };
  if (form.gemeinsam) {
    const t = lauf(ebenen, 0, ['m', 'l', 'r'], form.laenge);
    return t === null ? null : { plaetze, ende: t };
  }
  // Flügel: hier nur die Mitte, die Vorfahren verteilt flaecheBelegen
  const mitte = ebenen.filter(e => e.m.length).sort((a, b) => Math.abs(a.g) - Math.abs(b.g) || b.g - a.g);
  return lauf(mitte, 0, ['m'], form.laenge) === null ? null : { plaetze, ende: 0 };
}

const masse = (d, namen) => ({ d, h: d * (namen ? 1.62 : 1.08), luecke: d * (namen ? 1.42 : 1.14) });

/** Jeder Flügel für sich: so große Porträts, dass seine Personen die Fläche füllen. Der schwächer besetzte Flügel darf etwas
 *  größere haben, aber nicht beliebig, sonst passen die beiden nicht mehr zusammen; übrige Plätze verteilen sich über die Fläche. */
function flaecheBelegen(form, ebenen, plaetze, namen) {
  const aussen = ebenen.filter(e => e.l.length || e.r.length), mitte = [...plaetze];
  const orteBei = d => {
    const m = masse(d, namen), name = d * 0.85;   // die Namen stehen unter dem Gesicht und zählen mit
    const frei = (x, y) => [1, -1].every(v => mitte.every(q => [[q.x, q.y], [q.x, q.y + q.d * 0.85]].every(([a, b]) =>
      [[x * v, y], [x * v, y + name]].every(([c, e]) => Math.hypot(a - c, b - e) >= (q.d + d) / 2))));
    return form.plaetze(m.d, m.h, m.luecke, frei);
  };
  const groesste = n => {
    if (!n) return 0;
    for (let d = form.groesstes; d > 0.025; d *= 0.99) if (orteBei(d).length >= n) return d;
    return 0.025;
  };
  const zahl = s => aussen.reduce((n, eb) => n + eb[s].length, 0);
  const groessen = { l: groesste(zahl('l')), r: groesste(zahl('r')) };
  const obergrenze = Math.min(...Object.values(groessen).filter(Boolean)) * 1.25;
  for (const s of ['l', 'r']) {
    const n = zahl(s);
    if (!n) continue;
    const d = Math.min(groessen[s], obergrenze), alle = orteBei(d);
    // gleichmäßig über die Fläche, aber wenige Personen nicht bis in die Spitze: sonst gäbe es wieder lange Linien
    const schritt = n > 1 ? Math.min(2.5, (alle.length - 1) / (n - 1)) : 0;
    const orte = Array.from({ length: n }, (_, i) => alle[Math.round(i * schritt)]);
    let i = 0;
    for (const eb of aussen) {
      const gruppe = orte.slice(i, i + eb[s].length).sort((a, b) => Math.atan2(a[1], a[0] - SCHULTER[0]) - Math.atan2(b[1], b[0] - SCHULTER[0]));
      eb[s].forEach((e, k) => plaetze.push({ e, x: s === 'l' ? -gruppe[k][0] : gruppe[k][0], y: gruppe[k][1], d }));
      i += eb[s].length;
    }
  }
  return Math.min(...Object.entries(groessen).filter(([, d]) => d).map(([, d]) => d), Infinity);
}

/** Flügel: Die Mitte begrenzt die Flügel nicht mehr. Erst ihre größten Porträts, dann die Flügel; die Hauptperson bleibt
 *  dabei nur wenig größer als die Vorfahren. */
function flaecheLoesen(form, ebenen, namen) {
  let unten = 0.03, oben = 0.5;
  for (let i = 0; i < 12; i++) {
    const m = (unten + oben) / 2;
    if (legeAn(form, ebenen, m, 1, namen)) unten = m; else oben = m;
  }
  const probe = legeAn(form, ebenen, unten, 1, namen) ?? { plaetze: [] };
  const d = flaecheBelegen(form, ebenen, [...probe.plaetze], namen);
  const r = legeAn(form, ebenen, Math.min(unten, d * 1.3), 1, namen) ?? { plaetze: [...probe.plaetze] };
  flaecheBelegen(form, ebenen, r.plaetze, namen);
  return r;
}

/** Größte Porträts, die passen, dann der übrige Platz auf die Reihen verteilt. Maße in Einheiten der Form (form.box). */
export function anordnen(name, eintraege, { namen = true, seiten = false } = {}) {
  const form = FORMEN[name], sichtbar = eintraege.filter(e => !e.weg), ebenen = ebenenBilden(sichtbar, form, seiten);
  let bestes = null;
  if (form.flaeche) bestes = flaecheLoesen(form, ebenen, namen);
  else {
    let unten = 0.03, oben = form.groesstes;
    if (legeAn(form, ebenen, oben, 1, namen)) unten = oben;
    for (let i = 0; i < 16 && oben - unten > 0.001; i++) {
      const mitte = (unten + oben) / 2;
      if (legeAn(form, ebenen, mitte, 1, namen)) unten = mitte; else oben = mitte;
    }
    bestes = legeAn(form, ebenen, unten, 1, namen);
    let knapp = 1, weit = 2.2;
    for (let i = 0; i < 10; i++) {
      const luft = (knapp + weit) / 2, r = legeAn(form, ebenen, unten, luft, namen);
      if (r) { bestes = r; knapp = luft; } else weit = luft;
    }
  }
  const plaetze = bestes?.plaetze ?? [], nach = new Map(plaetze.map(q => [q.e, q]));
  const kanten = plaetze.filter(q => (q.e.art !== 'kind' || !form.gemeinsam) && q.e.von && nach.has(q.e.von)).map(q => ({ a: nach.get(q.e.von), b: q, art: q.e.art }));
  // Kinder hängen an einer gemeinsamen Linie ihrer Eltern, je Elternpaar eine
  const gruppen = new Map();
  for (const q of plaetze) {
    if (!form.gemeinsam || q.e.art !== 'kind' || !nach.has(q.e.von)) continue;
    const eltern = [nach.get(q.e.von), ...(q.e.paar && nach.has(q.e.paar) ? [nach.get(q.e.paar)] : [])], schluessel = eltern.map(x => x.e.p.id).join('+');
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, { eltern, kinder: [] });
    gruppen.get(schluessel).kinder.push(q);
  }
  return { plaetze, kanten, familien: [...gruppen.values()], box: form.box, kontur: form.kontur(), kleinstes: plaetze.length ? Math.min(...plaetze.map(q => q.d)) : 0 };
}
