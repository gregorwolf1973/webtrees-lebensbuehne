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
export function auswahl(root, { vorfahren = 0, nachkommen = 0, partner = false, partnerAlle = false, geschwister = false, aus = [], mehr = [] } = {}) {
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
      kind.paar = eintraege.find(e => (e.art === 'partner' || e.art === 'schwieger') && e.p === andere) ?? null;
      naechste.push(kind);
      // in der Tafel stehen auch die Nachkommen mit ihren Partnern
      if (partner && partnerAlle) for (const pa of k.partnerP ?? []) if (!gesehen.has(pa)) neu(pa, -g, 'm', kind, 'schwieger');
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
export function glatt(punkte, je = 12) {
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
  if (plan.aeste) plan.aeste = plan.aeste.map(a => ({ ...a, a: a.a && neu(a.a), b: a.b && neu(a.b) })).filter(a => !a.a || a.a !== a.b);
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
export function anordnen(name, eintraege, { namen = true, seiten = false, verhaeltnis = 16 / 9 } = {}) {
  const form = FORMEN[name];
  if (form.anordnen) return form.anordnen(eintraege, { namen, verhaeltnis, seiten });
  const sichtbar = eintraege.filter(e => !e.weg), ebenen = ebenenBilden(sichtbar, form, seiten);
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

// --- Tafel, Ahnen-Eiche, Stammlinie ---------------------------------------------------------------------------------
// Diese drei legen die Personen selbst aus, mit Porträts der Größe 1. Das Bild ergibt sich aus dem Inhalt (box), die Zeichnung
// passt es ins Format ein. Alle drei halten die Vaterseite links und die Mutterseite rechts.

export const nachSosa = (a, b) => a.sosa - b.sosa;
export const kreis = (x, y, r, n = 16) => Array.from({ length: n }, (_, i) => [x + r * Math.cos(i / n * 2 * Math.PI), y + r * Math.sin(i / n * 2 * Math.PI)]);
export const SYMBOL_BOX = { x0: -2, y0: -1.5, x1: 2, y1: 1.5 };

/** Maße bei Porträtgröße 1: Breite eines Platzes (der Name ist breiter als das Gesicht), Höhe mit Namen, Abstand der Reihen */
export function einheiten(namen) {
  const h = namen ? 1.62 : 1.08;
  return { w: namen ? 1.36 : 1.04, h, zeile: h + 0.85 };
}

export function umrandung(plaetze, w, h, mehr = []) {
  const xs = [...plaetze.flatMap(q => [q.x - w / 2, q.x + w / 2]), ...mehr.map(p => p[0])];
  const ys = [...plaetze.flatMap(q => [q.y - 0.5, q.y - 0.5 + h]), ...mehr.map(p => p[1])];
  if (!xs.length) return { x0: -1, y0: -1, x1: 1, y1: 1 };
  const r = 0.35;
  return { x0: Math.min(...xs) - r, y0: Math.min(...ys) - r, x1: Math.max(...xs) + r, y1: Math.max(...ys) + r };
}

/** Ordentlicher Baum (nach Reingold und Tilford): Jeder Knoten { breite, kinder } bekommt in `dx` seinen Platz relativ zum
 *  übergeordneten, die Teilbäume rücken so dicht zusammen, wie ihre Umrisse es in jeder Tiefe erlauben; `luft(t)` ist der
 *  Abstand in Tiefe t (0 = die Kinder selbst). Bei `getrennt` überschneiden sich die Teilbäume in keiner Tiefe: So bleibt die
 *  Vaterseite ganz links und die Mutterseite ganz rechts. Gibt den Umriss [links, rechts] je Tiefe zurück, Knoten bei 0. */
export function ordne(k, luft) {
  const umriss = [[-k.breite / 2, k.breite / 2]];
  if (!k.kinder.length) return umriss;
  const teile = k.kinder.map(c => ordne(c, luft)), lage = [0], gesamt = teile[0].map(u => [...u]);
  for (let i = 1; i < teile.length; i++) {
    const u = teile[i];
    let schub = -Infinity;
    for (let t = 0; t < Math.min(gesamt.length, u.length); t++) schub = Math.max(schub, gesamt[t][1] - u[t][0] + luft(t));
    if (k.getrennt && u.length > 1 && gesamt.length > 1) schub = Math.max(schub, Math.max(...gesamt.map(g => g[1])) - Math.min(...u.map(g => g[0])) + luft(1));
    lage.push(schub);
    u.forEach(([l, r], t) => { if (t < gesamt.length) gesamt[t][1] = r + schub; else gesamt.push([l + schub, r + schub]); });
  }
  const mitte = (lage[0] + lage[lage.length - 1]) / 2;
  k.kinder.forEach((c, i) => { c.dx = lage[i] - mitte; });
  for (const [l, r] of gesamt) umriss.push([l - mitte, r - mitte]);
  return umriss;
}

/** Personen nebeneinander in einem Knoten */
export const knoten = (personen, w, luft, kinder = []) => ({ personen, luft, kinder, breite: personen.length * w + Math.max(0, personen.length - 1) * luft });

// --- Tafel: oben die Vorfahren, jedes Elternpaar mittig über seinen Kindern, darunter die Nachkommen mit ihren Partnern ----
function tafelAnordnen(eintraege, { namen, seiten }) {
  const { w, h, zeile } = einheiten(namen), PAAR = 0.4, GESCHWISTER = 0.26, FAMILIE = 0.6;
  const sichtbar = eintraege.filter(e => !e.weg), start = sichtbar.find(e => e.art === 'start');
  const von = (e, art) => sichtbar.filter(x => x.von === e && x.art === art);
  const plaetze = [], nach = new Map();
  const lege = (k, x, tiefe, richtung) => {
    let px = x - k.breite / 2 + w / 2;
    for (const e of k.personen) {
      const q = { e, x: px, y: richtung * tiefe * zeile, d: 1 };
      plaetze.push(q);
      nach.set(e, q);
      px += w + k.luft;
    }
    for (const c of k.kinder) lege(c, x + c.dx, tiefe + 1, richtung);
  };
  // nach oben: Hauptperson mit ihren Geschwistern, daneben die Partner, über jedem die Eltern
  const hoch = e => knoten([e], w, 0, von(e, 'eltern').sort(nachSosa).map(hoch));
  const geschwister = sichtbar.filter(e => e.art === 'geschwister').sort((a, b) => a.geburt - b.geburt);
  const partner = von(start, 'partner');
  const kern = knoten([...geschwister, start], w, GESCHWISTER, von(start, 'eltern').sort(nachSosa).map(hoch));
  kern.getrennt = seiten;
  const oben = { breite: 0, personen: [], getrennt: seiten, kinder: [kern, ...partner.map(hoch)] };
  ordne(oben, t => t ? FAMILIE : PAAR);
  oben.kinder.forEach(c => lege(c, c.dx, 0, -1));
  // nach unten: Kinder je Partner, jeweils mit ihren eigenen Partnern
  const rang = e => (e.paar ? sichtbar.indexOf(e.paar) : -1);
  const kinderVon = e => von(e, 'kind').sort((a, b) => rang(a) - rang(b) || a.geburt - b.geburt);
  const runter = e => knoten([e, ...von(e, 'schwieger')], w, PAAR, kinderVon(e).map(runter));
  const unten = { breite: 0, personen: [], kinder: kinderVon(start).map(runter) };
  if (unten.kinder.length) {
    ordne(unten, t => t ? FAMILIE : GESCHWISTER);
    const eltern = [start, ...partner].map(e => nach.get(e)).filter(Boolean), mx = eltern.reduce((s, q) => s + q.x, 0) / eltern.length;
    unten.kinder.forEach(c => lege(c, mx + c.dx, 1, 1));
  }
  // Linien: Eheleute nebeneinander verbunden, von ihrer Mitte hinab zu den Kindern
  const kanten = [], familien = [], q = e => nach.get(e);
  for (const e of sichtbar) {
    if (!nach.has(e)) continue;
    const eltern = von(e, 'eltern').sort(nachSosa).filter(x => nach.has(x)).map(q);
    const kinder = e === start ? [...geschwister, start].map(q) : [q(e)];
    if (eltern.length) familien.push({ eltern, kinder });
    else if (e === start && geschwister.length) familien.push({ eltern: [], kinder });
    if (eltern.length === 2) kanten.push({ a: eltern[0], b: eltern[1], art: 'partner' });
    const ks = von(e, 'kind').filter(k => nach.has(k));
    for (const paar of new Set(ks.map(k => k.paar))) {
      familien.push({ eltern: [q(e), ...(paar && nach.has(paar) ? [q(paar)] : [])], kinder: ks.filter(k => k.paar === paar).map(q) });
    }
    for (const s of [...von(e, 'partner'), ...von(e, 'schwieger')]) if (nach.has(s)) kanten.push({ a: q(e), b: q(s), art: 'partner' });
  }
  const box = umrandung(plaetze, w, h), bb = box.x1 - box.x0, hh = box.y1 - box.y0, cx = (box.x0 + box.x1) / 2;
  // im Hintergrund ein zarter Baum
  const zierde = { art: 'tafel', stamm: { x: cx, unten: box.y1, oben: box.y0 + hh * 0.5, bu: bb * 0.05, bo: bb * 0.03 },
    krone: { x: cx, y: box.y0 + hh * 0.36, rx: bb * 0.44, ry: hh * 0.36 } };
  return { plaetze, kanten, familien, box, kontur: [], kleinstes: 1, linien: 'eckig', zierde };
}

// --- Ahnen-Eiche: die Hauptperson am Stamm, die Vorfahren fächern sich nach oben in die Krone ---------------------------
export function eicheAnordnen(eintraege, { namen, verhaeltnis = 16 / 9, seiten = false }) {
  const { w, h, zeile } = einheiten(namen), schritt = w + 0.16, MITTE = schritt * 0.5 + 0.1, VERSATZ = 0.8;
  const sichtbar = eintraege.filter(e => !e.weg), start = sichtbar.find(e => e.art === 'start');
  // nur die eigenen Vorfahren: Partner und Nachkommen haben in der Ahnentafel keinen Platz
  const zurHauptperson = e => { while (e && e !== start) { if (e.art !== 'eltern') return false; e = e.von; } return !!e; };
  const ahnen = sichtbar.filter(e => e !== start && zurHauptperson(e)), G = Math.max(0, ...ahnen.map(e => e.ebene));
  const gen = Array.from({ length: G + 1 }, (_, g) => ahnen.filter(e => e.ebene === g).sort(nachSosa));
  // Breite der Krone je Generation: unten schmal, oben so breit, wie das Bildformat es hergibt. Passt eine Generation nicht in
  // eine Reihe, stehen ihre Personen versetzt in mehreren.
  let breite = verhaeltnis * (G + 2) * zeile, lagen = [];
  for (let runde = 0; runde < 16; runde++) {
    lagen = gen.map((liste, g) => {
      if (!g) return { k: 1, halb: 0 };
      const halb = Math.max(schritt * 1.2, breite / 2 * (0.16 + 0.84 * (g / Math.max(1, G)) ** 0.85));
      // streng geteilt hat jede Seite ihre Hälfte, sonst teilen sie sich die Breite nach der Zahl ihrer Personen
      const n = seiten ? Math.max(...['l', 'r'].map(s => liste.filter(e => e.seite === s).length), 1) : Math.max(1, liste.length);
      return { k: Math.max(1, Math.ceil(n * schritt / (seiten ? halb - MITTE : 2 * halb - 3 * MITTE))), halb };
    });
    const hoehe = lagen.reduce((s, l, g) => s + (g ? zeile * (1 + VERSATZ * (l.k - 1)) : 0), 0) + h + 2;
    const neu = verhaeltnis * hoehe * 0.94;
    if (Math.abs(neu - breite) < 0.02) break;
    breite = neu;
  }
  const plaetze = [], nach = new Map(), setze = (e, x, y) => { const q = { e, x, y, d: 1 }; plaetze.push(q); nach.set(e, q); };
  setze(start, 0, 0);
  let y = 0;
  for (let g = 1; g <= G; g++) {
    const { k, halb } = lagen[g], vorher = lagen[g - 1].halb || 1;
    y -= zeile * (1 + VERSATZ * (lagen[g - 1].k - 1));
    const nl = gen[g].filter(e => e.seite === 'l').length, nr = gen[g].length - nl;
    const teil = seiten ? 0 : Math.max(-halb + MITTE, Math.min(halb - MITTE, -halb + 2 * halb * nl / Math.max(1, nl + nr)));
    for (const s of ['l', 'r']) {
      const liste = gen[g].filter(e => e.seite === s), n = liste.length;
      if (!n) continue;
      const lo = s === 'l' ? -halb : teil + MITTE, hi = s === 'l' ? teil - MITTE : halb;
      // dicht besetzte Reihen füllen die Krone, wenige Personen stehen beisammen über ihren Kindern
      const breit = Math.max(0, Math.min(hi - lo, n * schritt * 2.2 / k));
      const wunsch = liste.reduce((a, e) => a + (nach.get(e.von)?.x ?? 0) * halb / vorher, 0) / n;
      const anfang = Math.max(lo, Math.min(hi - breit, wunsch - breit / 2));
      liste.forEach((e, i) => setze(e, anfang + (i + 0.5) / n * breit, y - (i % k) * VERSATZ * zeile));
    }
  }
  const aeste = ahnen.filter(e => nach.has(e.von)).map(e => ({ a: nach.get(e.von), b: nach.get(e), dicke: 0.4 * 0.74 ** (e.ebene - 1), kurve: 'hoch' }));
  const erste = plaetze.filter(q => q.e.ebene === 1).map(q => q.y), box = umrandung(plaetze, w, h, [[-1.8, h + 1.4], [1.8, h + 1.4]]);
  box.x1 = Math.max(box.x1, -box.x0);   // der Stamm steht in der Mitte des Bildes
  box.x0 = -box.x1;
  const krone = plaetze.filter(q => q.e.ebene >= 1);
  const zierde = { art: 'eiche', saat: 7, stamm: { x: 0, unten: h + 1.2, oben: erste.length ? Math.max(...erste) * 0.55 : -0.6, bu: 1.15, bo: 0.6 },
    blaetter: krone.filter(q => q.e.ebene >= Math.min(2, G)) };
  return { plaetze, kanten: [], familien: [], aeste, box, kontur: [], kleinstes: 1, zierde, rahmen: 'schild' };
}

// --- Stammlinie: vom ältesten Stammvater im Stamm hinauf bis zur Hauptperson, die Geschwister auf den Ästen ---------------
/** Wer in die Stammlinie kommt: die Linie über den Vater (oder die Mutter), mit ihren Ehepartnern, dazu auf Wunsch die
 *  Geschwister jeder Generation, Partner und Nachkommen der Hauptperson. Aufbau der Einträge wie bei auswahl(). */
export function stammAuswahl(root, { vorfahren = 0, nachkommen = 0, partner = false, geschwister = false, aus = [], stammLinie = 'vater' } = {}) {
  const abgewaehlt = new Set(aus), gesehen = new Set(), eintraege = [];
  const neu = (p, ebene, von, art, mehr = {}) => {
    const e = { p, ebene, seite: 'm', von, art, sosa: 0, geburt: p.geburt ?? p.jahrE ?? 0, aus: p !== root && abgewaehlt.has(p.id), weg: false, ...mehr };
    e.weg = e.aus || !!von?.weg;
    gesehen.add(p);
    eintraege.push(e);
    return e;
  };
  const start = neu(root, 0, null, 'start'), linie = [start];
  for (let g = 1; g <= vorfahren; g++) {
    const kind = linie[g - 1].p, p = stammLinie === 'mutter' ? kind.mutterP : kind.vaterP;
    if (!p || gesehen.has(p)) break;
    const e = neu(p, g, linie[g - 1], 'eltern', { linie: true, seite: p === kind.vaterP ? 'l' : 'r' });
    const gatte = p === kind.vaterP ? kind.mutterP : kind.vaterP;
    if (gatte && !gesehen.has(gatte)) neu(gatte, g, linie[g - 1], 'eltern', { gatte: e, seite: gatte === kind.vaterP ? 'l' : 'r' });
    linie.push(e);
  }
  if (geschwister) {
    for (let g = 0; g < linie.length - 1; g++) {
      const eltern = linie[g + 1], kinder = (eltern.p.kinderP ?? []).filter(k => !gesehen.has(k));
      for (const k of kinder) neu(k, g, eltern, 'geschwister');
    }
  }
  if (partner) for (const pa of root.partnerP ?? []) if (!gesehen.has(pa)) neu(pa, 0, start, 'partner');
  let stufe = [start];
  for (let g = 1; g <= nachkommen; g++) {
    const naechste = [];
    for (const x of stufe) for (const k of x.p.kinderP ?? []) {
      if (gesehen.has(k)) continue;
      const kind = neu(k, -g, x, 'kind'), andere = k.vaterP === x.p ? k.mutterP : k.vaterP;
      kind.paar = eintraege.find(e => e.art === 'partner' && e.p === andere) ?? null;
      naechste.push(kind);
    }
    stufe = naechste;
  }
  return eintraege;
}

function stammAnordnen(eintraege, { namen }) {
  const { w, h, zeile } = einheiten(namen), PAAR = 0.4, schritt = w + 0.22, AST = 1.1;
  const sichtbar = eintraege.filter(e => !e.weg), start = sichtbar.find(e => e.art === 'start');
  const linie = [start, ...sichtbar.filter(e => e.linie).sort((a, b) => a.ebene - b.ebene)], G = linie.length - 1;
  const plaetze = [], nach = new Map(), aeste = [], kanten = [];
  const setze = (e, x, y) => { const q = { e, x, y, d: 1 }; plaetze.push(q); nach.set(e, q); return q; };
  const halbe = [];
  linie.forEach((l, g) => {
    const y = g * zeile;
    // im Stamm das Paar, der Mann links; bei der Hauptperson ihre Partner rechts daneben
    const paar = g ? [l, ...sichtbar.filter(e => e.gatte === l)].sort((a, b) => (a.seite === 'l' ? 0 : 1) - (b.seite === 'l' ? 0 : 1))
      : [start, ...sichtbar.filter(e => e.art === 'partner')];
    const breite = paar.length * w + (paar.length - 1) * PAAR;
    paar.forEach((e, i) => setze(e, -breite / 2 + w / 2 + i * (w + PAAR), y));
    for (let i = 1; i < paar.length; i++) kanten.push({ a: nach.get(paar[0]), b: nach.get(paar[i]), art: 'partner' });
    halbe[g] = breite / 2;
    // Geschwister nach Geburt: die ältere Hälfte links, die jüngere rechts; ein Ast je Seite, an ihm ein Zweig je Person
    const geschwister = sichtbar.filter(e => e.art === 'geschwister' && e.ebene === g).sort((a, b) => a.geburt - b.geburt);
    const teilung = Math.ceil(geschwister.length / 2), yAst = y + h - 0.5 + 0.38;
    [[geschwister.slice(0, teilung).reverse(), -1], [geschwister.slice(teilung), 1]].forEach(([seite, v]) => {
      if (!seite.length) return;
      const xs = seite.map((e, j) => v * (breite / 2 + AST + w / 2 + j * schritt));
      seite.forEach((e, j) => setze(e, xs[j], y));
      const ende = xs[xs.length - 1] + v * (w / 2 + 0.1);
      aeste.push({ von: [v * Math.max(0.2, breite / 2 - 0.5), yAst + 0.45], bis: [ende, yAst - 0.15], dicke: 0.3, spitze: 0.35, kurve: 'quer' });
      seite.forEach((e, j) => aeste.push({ von: [xs[j] + v * (w / 2 - 0.05), yAst - 0.04 * j], b: nach.get(e), dicke: 0.11, kurve: 'seite' }));
    });
  });
  // die Linie selbst, falls kein Baum gezeichnet wird: von Paar zu Paar
  for (let g = 1; g <= G; g++) {
    const mitte = e => nach.get(e).x + (sichtbar.some(x => x.gatte === e) ? (e.seite === 'l' ? 1 : -1) * (w + PAAR) / 2 : 0);
    aeste.push({ von: [mitte(linie[g]), g * zeile], bis: [g === 1 ? nach.get(start).x : mitte(linie[g - 1]), (g - 1) * zeile], dicke: 0.3, kurve: 'hoch', linie: true });
  }
  // Nachkommen der Hauptperson oben in der Krone
  const kinderVon = e => sichtbar.filter(x => x.von === e && x.art === 'kind').sort((a, b) => a.geburt - b.geburt);
  const krone = e => knoten([e], w, 0, kinderVon(e).map(krone)), oben = { breite: 0, personen: [], kinder: kinderVon(start).map(krone) };
  if (oben.kinder.length) {
    ordne(oben, t => t ? 0.6 : 0.26);
    const lege = (k, x, tiefe) => {
      setze(k.personen[0], x, -tiefe * zeile);
      for (const c of k.kinder) lege(c, x + c.dx, tiefe + 1);
    };
    oben.kinder.forEach(c => lege(c, c.dx, 1));
    for (const e of sichtbar) if (e.art === 'kind' && nach.has(e.von)) aeste.push({ a: nach.get(e.von), b: nach.get(e), dicke: 0.16, kurve: 'hoch' });
  }
  const unten = G * zeile + h + 0.9, box = umrandung(plaetze, w, h, [[-2, unten + 0.3], [2, unten + 0.3]]);
  const oberste = Math.min(...plaetze.map(q => q.y));
  const zierde = { art: 'stamm', saat: 3, stamm: { x: 0, unten, oben: Math.min(-0.2, oberste + zeile * 0.6), bu: Math.min(1.5, 0.75 + 0.06 * G), bo: 0.42 },
    krone: { x: (box.x0 + box.x1) / 2, y: (oberste - 0.6 + (G - 0.6) * zeile) / 2, rx: (box.x1 - box.x0) * 0.44, ry: ((G - 0.6) * zeile - oberste + 1.4) / 2 },
    blaetter: plaetze.filter(q => q.e.art === 'geschwister' || q.e.art === 'kind') };
  return { plaetze, kanten, familien: [], aeste, box, kontur: [], kleinstes: 1, zierde };
}

const tafel = {
  baum: true, partnerAlle: true, anordnen: tafelAnordnen, box: SYMBOL_BOX,
  kontur: () => [[[-1.2, -0.85], [-1.2, -0.55], [-0.6, -0.55], [-0.6, -0.85]], [[0.6, -0.85], [0.6, -0.55], [1.2, -0.55], [1.2, -0.85]],
    [[-0.9, -0.55], [-0.9, 0.35], [0.9, 0.35], [0.9, -0.55]], [[0, 0.35], [0, 0.85]]].map(zug => ({ zug, zu: false }))
    .concat([[-1.2, -1.1], [-0.6, -1.1], [0.6, -1.1], [1.2, -1.1], [-0.9, -0.05], [0.9, -0.05], [0, 1.1]].map(([x, y]) => ({ zug: kreis(x, y, 0.2), zu: true }))),
};
const eiche = {
  baum: true, ohne: ['nachkommen', 'partner', 'geschwister'], anordnen: eicheAnordnen, box: SYMBOL_BOX,
  kontur: () => [{ zug: [[-0.35, 1.4], [-0.2, 0.6], [-0.25, 0], [-1.3, -0.6], [-1.8, -1.2]], zu: false },
    { zug: [[0.35, 1.4], [0.2, 0.6], [0.25, 0], [1.3, -0.6], [1.8, -1.2]], zu: false },
    { zug: [[-0.22, 0.2], [-0.6, -0.9], [-0.5, -1.35]], zu: false }, { zug: [[0.22, 0.2], [0.6, -0.9], [0.5, -1.35]], zu: false },
    { zug: glatt([[-1.9, -0.9], [-1.4, -1.45], [0, -1.5], [1.4, -1.45], [1.9, -0.9]]), zu: false }],
};
const stamm = {
  streng: true, baum: true, eigeneAuswahl: true, anordnen: stammAnordnen, box: SYMBOL_BOX,
  kontur: () => [{ zug: [[-0.4, 1.45], [-0.25, 0.9], [-0.22, -1.2]], zu: false }, { zug: [[0.4, 1.45], [0.25, 0.9], [0.22, -1.2]], zu: false },
    ...[0.6, -0.1, -0.8].flatMap(y => [{ zug: [[-0.25, y + 0.15], [-1.1, y], [-1.6, y - 0.2]], zu: false }, { zug: [[0.25, y + 0.15], [1.1, y], [1.6, y - 0.2]], zu: false }]),
    { zug: glatt([[-1.8, 0.2], [-1.6, -1.1], [0, -1.5], [1.6, -1.1], [1.8, 0.2]]), zu: false }],
};
Object.assign(FORMEN, { tafel, eiche, stamm });
