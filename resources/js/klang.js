// Geräusche zur Zeitreise: eigene Aufnahmen (Dateiname = Art, z. B. kanone.mp3, kanone_2.ogg), sonst die mitgelieferten
// freien Aufnahmen des Moduls, sonst im Browser erzeugt (Web Audio).
// Es klingt immer nur ein Geräusch: Familienklänge (Geburt, Hochzeit, Tod) warten in einer Schlange und gehen vor,
// das Zeitgeschehen spielt je Art eine kurze Szene, die weich ein- und ausgeblendet wird.

let ctx = null, master = null, rauschen = null, pegel = 0.5;
const rnd = (a, b) => a + Math.random() * (b - a);

export function bereit() {
  if (!ctx) {
    // niedrige Abtastrate: Geräusche brauchen keine CD-Qualität, die dekodierten Aufnahmen aber nur halb so viel Speicher
    try { ctx = new AudioContext({ sampleRate: 22050 }); } catch (e) { ctx = new AudioContext(); }
    master = ctx.createGain();
    master.gain.value = pegel;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 4;
    rauschen = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = rauschen.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  vorladen(['geburt', 'tod', 'hochzeit']);
  return ctx;
}

// --- Aufnahmen ----------------------------------------------------------------------------------------
// Sparsam, damit Tablets nicht abstürzen: anfangs nur die Liste; jede Aufnahme wird erst geholt, wenn ihr Ereignis naht,
// als Mono dekodiert, auf MAX_SEK gekürzt, und nur die zuletzt benutzten MAX_PUFFER bleiben im Speicher.
const LISTE = {}, PUFFER = new Map(), LAEDT = new Set();
const MAX_PUFFER = 12, MAX_SEK = 60;
// Ordnerinhalt lesen: liste.json, sonst das Verzeichnis-Listing des lokalen Servers; Name = Dateiname ohne Endung
const LB = window.LEBENSBUEHNE || {};
const klangUrl = datei => LB.klangDatei ? LB.klangDatei.replace('DATEI', encodeURIComponent(datei)) : 'media/klaenge/' + encodeURIComponent(datei);
async function ordnerListe() {
  try { const r = await fetch(LB.klaenge || 'media/klaenge/liste.json', { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) { /* weiter */ }
  if (LB.klaenge) return {};
  const r = await fetch('media/klaenge/', { cache: 'no-store' });
  if (!r.ok) return {};
  const html = await r.text(), liste = {};
  for (const m of html.matchAll(/href="([^"?#/]+\.(mp3|ogg|oga|opus|wav|flac|m4a))"/gi)) {
    const datei = decodeURIComponent(m[1]);
    liste[datei.replace(/\.[^.]+$/, '').toLowerCase()] = datei;
  }
  return liste;
}

// mitgelieferte freie Aufnahmen des Moduls (resources/klaenge, Quellen in QUELLEN.md); lokal über klaenge/liste.json
async function mitgelieferte() {
  if (LB.klaengeMit) return LB.klaengeMit;
  if (window.LEBENSBUEHNE) return {};
  const r = await fetch('klaenge/liste.json', { cache: 'no-store' });
  if (!r.ok) return {};
  return Object.fromEntries(Object.entries(await r.json()).map(([k, datei]) => [k, 'klaenge/' + encodeURIComponent(datei)]));
}

// Liste: Name → Adresse. Eigene Aufnahmen einer Art ersetzen die mitgelieferten dieser Art ganz.
export async function ladeAufnahmen() {
  let eigene = {}, mit = {};
  try { eigene = await ordnerListe(); } catch (e) { /* keine eigenen Aufnahmen */ }
  try { mit = await mitgelieferte(); } catch (e) { /* keine mitgelieferten */ }
  const art = name => name.replace(/_\d+$/, '');
  const eigeneArten = new Set(Object.keys(eigene).map(art));
  for (const [k, url] of Object.entries(mit)) if (!eigeneArten.has(art(k))) LISTE[k] = url;
  for (const [k, datei] of Object.entries(eigene)) LISTE[k] = klangUrl(datei);
  return Object.keys(LISTE);
}
const varianten = name => Object.keys(LISTE).filter(x => x === name || x.startsWith(name + '_'));
function lade(x) {
  if (!ctx || PUFFER.has(x) || LAEDT.has(x)) return;
  LAEDT.add(x);
  fetch(LISTE[x]).then(r => r.arrayBuffer()).then(roh => ctx.decodeAudioData(roh)).then(b => {
    PUFFER.set(x, verkleinere(b));
    while (PUFFER.size > MAX_PUFFER) PUFFER.delete(PUFFER.keys().next().value);   // die am längsten unbenutzte zuerst
  }).catch(() => { /* unlesbar */ }).finally(() => LAEDT.delete(x));
}
// Mono und höchstens MAX_SEK Sekunden; die volle Fassung gibt der Browser danach frei
function verkleinere(b) {
  const n = Math.min(b.length, Math.round(MAX_SEK * b.sampleRate)), m = ctx.createBuffer(1, n, b.sampleRate), d = m.getChannelData(0);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const q = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] += q[i] / b.numberOfChannels;
  }
  return m;
}
// zufällige geladene Aufnahme einer Art („kanone“, „kanone_2“ …); fehlende werden nachgeladen, bis dahin gilt der erzeugte Klang
function puffer(name) {
  const k = varianten(name);
  for (const x of k) lade(x);
  const da = k.filter(x => PUFFER.has(x));
  if (!da.length) return null;
  const x = da[Math.floor(Math.random() * da.length)], b = PUFFER.get(x);
  PUFFER.delete(x); PUFFER.set(x, b);   // zuletzt benutzt
  return b;
}
// welche Aufnahmen eine Klangart braucht – werden vorab geholt, sobald das Ereignis näher rückt
const BRAUCHT = {
  geburt: ['geburt', 'glocke_hell'], tod: ['glocke_tief'], hochzeit: ['hochzeit', 'lachen'],
  krieg: ['kanone', 'gewehr'], krieg1: ['artillerie', 'kanone', 'mg1', 'gewehr'], krieg2: ['mg2', 'artillerie', 'stuka', 'bombe'],
  luftkrieg: ['luftkrieg', 'luftalarm', 'bombe', 'stuka'], gefecht: ['mg2', 'mg1', 'gewehr'], totenglocke: ['totenglocke'],
  marsch: ['marsch'], not: ['klagen', 'wind'], kaelte: ['sturm', 'wind'], wasser: ['wasser'], flut: ['flut', 'wasser'],
  zug: ['zug'], jubel: ['jubel'], unruhe: ['menge'], glocken: ['glocken'], strom: ['strom'],
};
export function vorladen(arten) {
  if (!ctx) return;
  for (const a of arten) for (const n of BRAUCHT[a] ?? [a]) for (const x of varianten(n)) lade(x);
}
// Einzelgeräusche aus langen Aufnahmen: Abschnittslänge und Vorlauf vor dem lauten Einsatz (Sekunden)
const ABSCHNITT = {
  kanone: [4, 0.1], artillerie: [5, 0.1], gewehr: [4, 0.1], mg1: [3.5, 0.1], mg2: [3.5, 0.1], mg: [3.5, 0.1],
  bombe: [7, 3], stuka: [11, 8], luftalarm: [7, 0.5], totenglocke: [6, 0.05], glocke_hell: [3, 0.05], glocke_tief: [4, 0.05], hochzeit: [4, 0],
  geburt: [3, 0.15], lachen: [2.5, 0.2],
};
const EINSAETZE = new WeakMap();
// laute Einsätze finden: 50-ms-Fenster, deutlich lauter als das vorige und als der Durchschnitt, mindestens 1 s auseinander
function einsaetze(b) {
  if (EINSAETZE.has(b)) return EINSAETZE.get(b);
  const d = b.getChannelData(0), n = Math.floor(b.sampleRate * 0.05), rms = [];
  for (let i = 0; i + n <= d.length; i += n) {
    let q = 0;
    for (let k = i; k < i + n; k += 4) q += d[k] * d[k];
    rms.push(Math.sqrt(q / (n / 4)));
  }
  const max = Math.max(...rms), mittel = rms.reduce((a, x) => a + x, 0) / rms.length, liste = [];
  for (let i = 1; i < rms.length; i++) {
    if (rms[i] > 0.35 * max && rms[i] > 1.6 * rms[i - 1] && rms[i] > 2 * mittel && (!liste.length || i * 0.05 - liste[liste.length - 1] > 1)) liste.push(i * 0.05);
  }
  // langsam anschwellende Klänge (Glocken, Sturzflug): die lautesten Stellen, mindestens 3 s auseinander
  if (!liste.length) {
    for (const i of rms.map((x, i) => i).sort((a, c) => rms[c] - rms[a])) {
      if (liste.length >= 8) break;
      if (liste.every(t => Math.abs(t - i * 0.05) >= 3)) liste.push(i * 0.05);
    }
  }
  EINSAETZE.set(b, liste);
  return liste;
}
// spielt einen Abschnitt und gibt seine Dauer in Sekunden zurück (0, wenn die Aufnahme noch nicht geladen ist)
function spiele(name, ziel, { laut = 1, pan = rnd(-0.7, 0.7), tonhoehe = rnd(0.95, 1.05) } = {}) {
  const b = puffer(name);
  if (!b) return 0;
  const [laenge, vorlauf] = ABSCHNITT[name] ?? [b.duration, 0];
  let ab = 0;
  const dauer = Math.min(b.duration, laenge);
  if (b.duration > laenge + 1) {
    const e = einsaetze(b);
    const t = e.length ? e[Math.floor(Math.random() * e.length)] : rnd(0, b.duration - laenge);
    ab = Math.max(0, Math.min(b.duration - laenge, t - vorlauf));
  }
  const t0 = ctx.currentTime, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = b;
  s.playbackRate.value = tonhoehe;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(laut, t0 + 0.02);
  g.gain.setValueAtTime(laut, t0 + Math.max(0.03, dauer / tonhoehe - 0.6));
  g.gain.linearRampToValueAtTime(0, t0 + dauer / tonhoehe);
  s.connect(g).connect(panner(pan)).connect(ziel);
  s.start(t0, ab, dauer + 0.05);
  return dauer / tonhoehe;
}
// Aufnahme als Endlosschleife (an zufälliger Stelle beginnend); gibt die Stopp-Funktion zurück oder null
function schleife(name, ziel, laut = 1) {
  const b = puffer(name);
  if (!b) return null;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = b;
  s.loop = true;
  g.gain.value = laut;
  s.connect(g).connect(ziel);
  s.start(ctx.currentTime, rnd(0, b.duration));
  return () => s.stop();
}
// Familienklänge; jeder gibt seine Dauer in Sekunden zurück
const FAMILIE = {
  // Geburt: Babylachen bzw. Jauchzen
  geburt: () => spiele('geburt', master, { laut: 0.6, pan: rnd(-0.4, 0.4), tonhoehe: 1 }) || spiele('glocke_hell', master, { laut: 0.5, pan: 0 }) || glocke(880 + rnd(0, 200), 0.08, 2.5),
  tod: () => spiele('glocke_tief', master, { laut: 0.6, pan: 0 }) || glocke(rnd(150, 190), 0.16, 5),
  // Hochzeit: erst die Glocken, danach helles Lachen
  hochzeit: () => {
    let d = spiele('hochzeit', master, { laut: 0.45, pan: 0 });
    if (!d) { glocke(523, 0.1, 1.2); setTimeout(() => ctx && glocke(659, 0.1, 2.5), 1200); d = 3.7; }
    if (!varianten('lachen').some(x => PUFFER.has(x))) return d;
    setTimeout(() => ctx && spiele('lachen', master, { laut: 0.55, pan: rnd(-0.3, 0.3), tonhoehe: 1 }), (d + 0.1) * 1000);
    return d + 0.1 + ABSCHNITT.lachen[0];
  },
};

// Gesamtlautstärke der Geräusche (0..1); gilt auch, wenn der Ton erst später startet
export function lautstaerke(v) {
  pegel = v;
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
}

// kurze Hörprobe einer Art (für das Ton-Menü); beendet die vorige Probe
export function probe(art) {
  if (!ctx) return;
  stille();
  if (FAMILIE[art]) return familie(art);
  if (!ATMO[art]) return;
  offen.set(art, { seit: ctx.currentTime, laenge: 5 });
  weiter();
}

function rauschQuelle(loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = rauschen;
  s.loop = loop;
  s.playbackRate.value = rnd(0.85, 1.15);
  return s;
}

function panner(x) {
  const p = ctx.createStereoPanner();
  p.pan.value = x;
  return p;
}

// --- Einzelne Klänge (jeder gibt seine Dauer in Sekunden zurück) ---------------------------------
function kanone(ziel, nah = Math.random(), art = 'kanone') {
  const e = spiele(art, ziel, { laut: 0.35 + 0.65 * nah }) || (art !== 'kanone' && spiele('kanone', ziel, { laut: 0.35 + 0.65 * nah }));
  if (e) return e;
  const t = ctx.currentTime, p = panner(rnd(-0.8, 0.8));
  const s = rauschQuelle(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(300 + 1400 * nah, t);
  f.frequency.exponentialRampToValueAtTime(60, t + 1.8);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4 + 0.9 * nah, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.3);
  s.connect(f).connect(g).connect(p).connect(ziel);
  s.start(t, rnd(0, 1.5));
  s.stop(t + 2.4);
  const o = ctx.createOscillator(), og = ctx.createGain();
  o.frequency.setValueAtTime(75, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
  og.gain.setValueAtTime(0.25 + 0.8 * nah, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 1);
  o.connect(og).connect(p);
  o.start(t);
  o.stop(t + 1.1);
  return 2.4;
}

function schuss(ziel, pan) {
  const t = ctx.currentTime, s = rauschQuelle(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass';
  f.frequency.value = rnd(900, 2400);
  f.Q.value = 0.9;
  g.gain.setValueAtTime(rnd(0.15, 0.35), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  s.connect(f).connect(g).connect(panner(pan)).connect(ziel);
  s.start(t, rnd(0, 3.5));
  s.stop(t + 0.15);
}

function salve(ziel) {
  const e = spiele('gewehr', ziel, { laut: 0.7 });
  if (e) return e;
  const pan = rnd(-1, 1), n = Math.floor(rnd(3, 10));
  let z = 0;
  for (let i = 0; i < n; i++, z += rnd(60, 240)) setTimeout(() => ctx && schuss(ziel, pan + rnd(-0.15, 0.15)), z);
  return z / 1000 + 0.15;
}

// Stimme: Sägezahn durch Vokalfilter („ah“), mit Vibrato und Tonhöhengleiten – klagend, rufend oder jubelnd
function stimme(ziel, { laut = 0.1, hoch = 1, steigend = false, dauer = rnd(2.5, 5) } = {}) {
  const t = ctx.currentTime, basis = rnd(170, 330) * hoch;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(steigend ? basis * 0.85 : basis * 1.25, t);
  o.frequency.exponentialRampToValueAtTime(steigend ? basis * 1.3 : basis * rnd(0.75, 0.95), t + dauer);
  const vib = ctx.createOscillator(), vg = ctx.createGain();
  vib.frequency.value = rnd(4.5, 6.5);
  vg.gain.value = basis * 0.025;
  vib.connect(vg).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut, t + dauer * 0.3);
  g.gain.linearRampToValueAtTime(0, t + dauer);
  for (const [fr, q] of [[rnd(650, 820) * hoch, 7], [rnd(1050, 1300) * hoch, 9], [rnd(2400, 2800), 12]]) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = fr;
    f.Q.value = q;
    o.connect(f).connect(g);
  }
  g.connect(panner(rnd(-0.9, 0.9))).connect(ziel);
  o.start(t); vib.start(t);
  o.stop(t + dauer); vib.stop(t + dauer);
}

export function glocke(grund = 440, laut = 0.2, dauer = 3.5, ziel = master) {
  if (!ctx) return;
  const t = ctx.currentTime, g = ctx.createGain();
  g.connect(ziel);
  g.gain.setValueAtTime(laut, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dauer);
  for (const [m, a] of [[0.5, 0.5], [1, 1], [1.19, 0.4], [1.5, 0.35], [2, 0.3], [2.74, 0.15], [3.76, 0.08]]) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.value = grund * m * rnd(0.997, 1.003);
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dauer);
  }
  return dauer;
}

// Maschinengewehr: schnelle, gleichmäßige Schüsse (Erster Weltkrieg langsamer, Zweiter schneller)
function mg(ziel, abstand = 110) {
  const e = spiele(abstand < 80 ? 'mg2' : 'mg1', ziel, { laut: 0.7 }) || spiele('mg', ziel, { laut: 0.7 });
  if (e) return e;
  const pan = rnd(-1, 1), n = Math.floor(rnd(8, 26)), laut = rnd(0.5, 1);
  for (let i = 0; i < n; i++) setTimeout(() => {
    if (!ctx) return;
    const t = ctx.currentTime, s = rauschQuelle(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = rnd(1100, 1700); f.Q.value = 0.7;
    g.gain.setValueAtTime(0.28 * laut, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    s.connect(f).connect(g).connect(panner(pan)).connect(ziel);
    s.start(t, rnd(0, 3.5)); s.stop(t + 0.08);
  }, i * abstand * rnd(0.92, 1.08));
  return n * abstand * 1.08 / 1000 + 0.1;
}

// Fliegerbombe: Pfeifen im Fall, dann schwere Explosion
function bombe(ziel) {
  const e = spiele('bombe', ziel, { laut: 0.9 });
  if (e) return e;
  const t = ctx.currentTime, d = rnd(1.8, 3), o = ctx.createOscillator(), g = ctx.createGain(), p = panner(rnd(-0.7, 0.7));
  o.type = 'sine';
  o.frequency.setValueAtTime(rnd(1500, 2000), t);
  o.frequency.exponentialRampToValueAtTime(rnd(300, 450), t + d);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.3);
  g.gain.linearRampToValueAtTime(0.1, t + d * 0.95);
  g.gain.linearRampToValueAtTime(0, t + d);
  o.connect(g).connect(p).connect(ziel);
  o.start(t); o.stop(t + d);
  setTimeout(() => ctx && kanone(p, 1), d * 1000);
  return d + ABSCHNITT.kanone[0];   // die Explosion kann auch eine Kanonen-Aufnahme sein
}

// Sturzkampfbomber: Motor und anschwellende Sirene im Sturzflug, am Ende die Bombe
function stuka(ziel) {
  const e = spiele('stuka', ziel, { laut: 0.8 });
  if (e) return e;
  const t = ctx.currentTime, d = rnd(3.5, 5), p = panner(rnd(-0.8, 0.8));
  const motor = ctx.createOscillator(), mf = ctx.createBiquadFilter(), mg2 = ctx.createGain();
  motor.type = 'sawtooth';
  motor.frequency.setValueAtTime(70, t);
  motor.frequency.linearRampToValueAtTime(110, t + d);
  mf.type = 'lowpass'; mf.frequency.value = 500;
  mg2.gain.setValueAtTime(0, t);
  mg2.gain.linearRampToValueAtTime(0.12, t + d * 0.8);
  mg2.gain.linearRampToValueAtTime(0, t + d + 0.5);
  motor.connect(mf).connect(mg2).connect(p);
  const sirene = ctx.createOscillator(), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
  sirene.type = 'sawtooth';
  sirene.frequency.setValueAtTime(380, t);
  sirene.frequency.exponentialRampToValueAtTime(1150, t + d);
  sf.type = 'bandpass'; sf.frequency.value = 900; sf.Q.value = 1.5;
  sg.gain.setValueAtTime(0, t);
  sg.gain.linearRampToValueAtTime(0.09, t + d * 0.9);
  sg.gain.linearRampToValueAtTime(0, t + d + 0.3);
  sirene.connect(sf).connect(sg).connect(p);
  p.connect(ziel);
  motor.start(t); sirene.start(t); motor.stop(t + d + 0.6); sirene.stop(t + d + 0.4);
  setTimeout(() => ctx && bombe(ziel), (d - 1.5) * 1000);
  return d - 1.5 + ABSCHNITT.bombe[0];   // die Bombe kann eine Aufnahme sein
}

// Luftalarm: Sirene, die auf- und abschwillt
function luftalarm(ziel, dauer = 7) {
  const e = spiele('luftalarm', ziel, { laut: 0.6, pan: 0, tonhoehe: 1 });
  if (e) return e;
  const t = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'sawtooth';
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 1 / 4.5;   // Heulton: alle 4,5 Sekunden auf und ab
  lg.gain.value = 200;
  o.frequency.value = 480; o2.frequency.value = 484;
  lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  f.type = 'lowpass'; f.frequency.value = 1400;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + 2);
  g.gain.setValueAtTime(0.07, t + dauer - 2);
  g.gain.linearRampToValueAtTime(0, t + dauer);
  o.connect(f); o2.connect(f); f.connect(g).connect(panner(rnd(-0.4, 0.4))).connect(ziel);
  o.start(t); o2.start(t); lfo.start(t);
  o.stop(t + dauer); o2.stop(t + dauer); lfo.stop(t + dauer);
  return dauer;
}

// Marschtritte: viele Stiefel im Gleichschritt, dazu Trommel
function tritt(ziel, betont) {
  const t = ctx.currentTime;
  for (let i = 0; i < 6; i++) {
    const s = rauschQuelle(false), f = ctx.createBiquadFilter(), g = ctx.createGain(), dt = rnd(0, 0.035);
    f.type = 'lowpass'; f.frequency.value = rnd(350, 650);
    g.gain.setValueAtTime(0, t + dt);
    g.gain.linearRampToValueAtTime(betont ? 0.16 : 0.11, t + dt + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.14);
    s.connect(f).connect(g).connect(panner(rnd(-0.6, 0.6))).connect(ziel);
    s.start(t + dt, rnd(0, 3.5)); s.stop(t + dt + 0.16);
  }
}

function trommel(ziel) {
  const t = ctx.currentTime, s = rauschQuelle(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6;
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  s.connect(f).connect(g).connect(ziel);
  s.start(t, rnd(0, 3.5)); s.stop(t + 0.13);
}

// --- Dauerklänge ---------------------------------------------------------------------------------
function wind(ziel, stark = 1, tief = 1) {
  const s = rauschQuelle(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass';
  f.frequency.value = 500 / tief;
  f.Q.value = 1.4;
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = rnd(0.07, 0.15);
  lg.gain.value = 350 / tief;
  lfo.connect(lg).connect(f.frequency);
  const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain();
  lfo2.frequency.value = rnd(0.1, 0.2);
  lg2.gain.value = 0.12 * stark;
  g.gain.value = 0.22 * stark;
  lfo2.connect(lg2).connect(g.gain);
  s.connect(f).connect(g).connect(ziel);
  s.start(); lfo.start(); lfo2.start();
  return () => { s.stop(); lfo.stop(); lfo2.stop(); };
}

function wasser(ziel, stark = 1, flut = false) {
  const s = rauschQuelle(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = flut ? 600 : 1300;
  hp.type = 'highpass'; hp.frequency.value = flut ? 60 : 180;
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = flut ? 0.25 : 0.45;
  lg.gain.value = 0.08 * stark;
  g.gain.value = 0.18 * stark;
  lfo.connect(lg).connect(g.gain);
  s.connect(lp).connect(hp).connect(g).connect(ziel);
  s.start(); lfo.start();
  return () => { s.stop(); lfo.stop(); };
}

function zug(ziel) {
  let n = 0;
  const schnauf = () => {
    const t = ctx.currentTime, s = rauschQuelle(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = rnd(500, 750); f.Q.value = 1.2;
    g.gain.setValueAtTime(n % 4 === 0 ? 0.3 : 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    s.connect(f).connect(g).connect(ziel);
    s.start(t, rnd(0, 3.5)); s.stop(t + 0.25);
    if (n % 40 === 10) pfeife(ziel);
    n++;
  };
  const id = setInterval(schnauf, 260);
  return () => clearInterval(id);
}

function pfeife(ziel) {
  const t = ctx.currentTime, g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.1);
  g.gain.setValueAtTime(0.08, t + 1.2);
  g.gain.linearRampToValueAtTime(0, t + 1.6);
  g.connect(ziel);
  for (const fr of [698, 880]) {
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = fr;
    o.connect(g); o.start(t); o.stop(t + 1.7);
  }
}

function menge(ziel, jubel = true) {
  const s = rauschQuelle(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.value = jubel ? 1400 : 700; f.Q.value = 0.8;
  g.gain.value = jubel ? 0.12 : 0.08;
  s.connect(f).connect(g).connect(ziel);
  s.start();
  const id = setInterval(() => {
    if (Math.random() < 0.7) stimme(ziel, { laut: jubel ? 0.07 : 0.05, hoch: jubel ? 1.3 : 0.9, steigend: jubel, dauer: rnd(0.8, 2) });
    if (jubel && Math.random() < 0.4) for (let i = 0; i < 12; i++) setTimeout(() => ctx && schuss(ziel, rnd(-1, 1)), rnd(0, 900));   // Klatschen
  }, 450);
  return () => { clearInterval(id); s.stop(); };
}

function strom(ziel) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = 50;
  f.type = 'lowpass'; f.frequency.value = 380;
  g.gain.value = 0.05;
  o.connect(f).connect(g).connect(ziel);
  o.start();
  const id = setInterval(() => { if (Math.random() < 0.5) schuss(ziel, rnd(-0.5, 0.5)); }, 700);
  return () => { clearInterval(id); o.stop(); };
}

// Einzelklänge einer Szene nacheinander, nie übereinander: schritt() spielt einen Klang und gibt seine Dauer zurück
function folge(schritt, luecke = [0.15, 0.6]) {
  let id = null, aus = false;
  const weiter = () => {
    if (aus || !ctx) return;
    id = setTimeout(weiter, ((schritt() || 1) + rnd(...luecke)) * 1000);
  };
  weiter();
  return () => { aus = true; clearTimeout(id); };
}

const ATMO = {
  // Kriege vor 1900: Kanonen und Gewehrsalven
  krieg: g => folge(() => Math.random() < 0.6 ? kanone(g, Math.random()) : salve(g)),
  // Erster Weltkrieg: Artillerie und Maschinengewehre
  krieg1: g => folge(() => {
    const r = Math.random();
    return r < 0.5 ? kanone(g, Math.random(), 'artillerie') : r < 0.8 ? mg(g, 115) : salve(g);
  }),
  // Zweiter Weltkrieg: schnelle Maschinengewehre, Stukas, Bomben
  krieg2: g => {
    let n = 0;
    return folge(() => {
      if (n++ % 4 === 1) return stuka(g);
      const r = Math.random();
      return r < 0.45 ? mg(g, 55) : r < 0.8 ? kanone(g, Math.random(), 'artillerie') : bombe(g);
    });
  },
  // Luftkrieg der letzten Kriegsjahre: erst der Luftalarm, dann der Angriff (Originalaufnahme oder Bomben und Stukas)
  luftkrieg: g => {
    let n = 0, angriff = null;
    const stop = folge(() => {
      if (n++ === 0) return luftalarm(g);
      if (n === 2 && (angriff = schleife('luftkrieg', g, 0.7))) return 600;   // die Aufnahme läuft bis zum Ende der Szene
      return n % 3 ? bombe(g) : stuka(g);
    });
    return () => { stop(); angriff?.(); };
  },
  // Schießereien bei Aufständen
  gefecht: g => folge(() => Math.random() < 0.45 ? mg(g, 70) : salve(g)),
  totenglocke: g => folge(() => spiele('totenglocke', g, { laut: 0.7, pan: 0, tonhoehe: 1 }) || glocke(rnd(105, 125), 0.22, 4, g), [0.3, 0.8]),
  marsch: g => {
    const echt = schleife('marsch', g, 0.8);
    if (echt) return echt;
    let n = 0;
    const id = setInterval(() => { tritt(g, n % 2 === 0); if (n % 2 === 0) trommel(g); if (n % 8 === 6) { trommel(g); setTimeout(() => ctx && trommel(g), 130); } n++; }, 530);
    return () => clearInterval(id);
  },
  not: g => {
    const echt = schleife('klagen', g, 0.8);
    if (echt) return echt;
    const w = wind(g, 0.6);
    const id = setInterval(() => {
      if (Math.random() < 0.65) stimme(g, { laut: 0.09 });
      if (Math.random() < 0.15) stimme(g, { laut: 0.14, hoch: 2, dauer: rnd(0.8, 1.4) });   // Aufschrei
    }, 1300);
    return () => { clearInterval(id); w(); };
  },
  kaelte: g => schleife('sturm', g) || schleife('wind', g) || wind(g, 1.1, 1.5),
  wasser: g => schleife('wasser', g, 0.8) || wasser(g, 0.8),
  flut: g => schleife('flut', g) || schleife('wasser', g, 1.4) || wasser(g, 1.6, true),
  zug: g => schleife('zug', g, 0.8) || zug(g),
  jubel: g => schleife('jubel', g, 0.8) || menge(g, true),
  unruhe: g => schleife('menge', g, 0.8) || menge(g, false),
  glocken: g => schleife('glocken', g, 0.7) || folge(() => glocke(rnd(300, 480), 0.16, 2.2, g), [0, 0.2]),
  strom: g => schleife('strom', g, 0.6) || strom(g),
};
export const ARTEN = Object.keys(ATMO);

// --- Eine Spur: nie zwei Geräusche zugleich ---------------------------------------------------------
// Länge einer Szene in Sekunden, auch wenn das Ereignis Jahrzehnte dauert (die Auswanderung 1846–1914 war sonst eine Minute Wasser)
const SZENE = {
  krieg: 10, krieg1: 10, krieg2: 12, luftkrieg: 14, gefecht: 8, totenglocke: 7, marsch: 6, not: 7, kaelte: 6,
  wasser: 5, flut: 6, zug: 6, jubel: 6, unruhe: 6, glocken: 6, strom: 4,
};
const EIN = 0.8, AUS = 1.2;   // Ein- und Ausblenden einer Szene (Sekunden)
const MINDESTENS = 4;         // so lange klingt eine Szene, bevor ein neu beginnendes Ereignis sie ablöst
const WARTEN = 3;             // länger wartende Familienklänge kommen zu spät und entfallen

let szene = null;                                  // { art, g, stop, start, endet }
const schlange = [];                               // wartende Familienklänge { name, seit }
let familieAn = false, familieTimer = null;
const offen = new Map(), erledigt = new Set();     // fällige Arten (Art → { seit, laenge }); schon gespielt, solange ihr Ereignis läuft

function blende(g, ziel, dauer) {
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(ziel, t + dauer);
}

function szeneStarten(art, laenge = SZENE[art] ?? 6) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(master);
  const s = { art, g, stop: ATMO[art](g), start: ctx.currentTime, endet: false };
  szene = s;
  blende(g, 1, EIN);
  s.timer = setTimeout(() => szeneBeenden(s), Math.max(0, laenge - AUS) * 1000);
}

function szeneBeenden(s, aus = AUS) {
  if (s.endet) return;
  s.endet = true;
  clearTimeout(s.timer); clearTimeout(s.abloesen);
  blende(s.g, 0, aus);
  setTimeout(() => {
    s.stop?.();
    s.g.disconnect();
    if (szene === s) { szene = null; weiter(); }
  }, aus * 1000 + 50);
}

// Hat ein neueres Ereignis begonnen, löst es die laufende Szene ab, sobald diese MINDESTENS Sekunden geklungen hat
function abloesen() {
  if (!szene || szene.endet || ![...offen.values()].some(o => o.seit > szene.start)) return;
  const rest = szene.start + MINDESTENS - ctx.currentTime;
  clearTimeout(szene.abloesen);
  if (rest > 0) szene.abloesen = setTimeout(abloesen, rest * 1000);
  else szeneBeenden(szene, familieAn ? 0.05 : 0.6);
}

// nächstes Geräusch auf die Spur: zuerst wartende Familienklänge, dann die zuletzt fällig gewordene Szene
function weiter() {
  if (!ctx || familieAn || szene?.endet) return;   // wer gerade klingt oder ausblendet, ruft danach wieder weiter()
  while (schlange.length && ctx.currentTime - schlange[0].seit > WARTEN) schlange.shift();
  if (schlange.length) {
    const { name } = schlange.shift();
    familieAn = true;
    const stumm = !!szene;   // laufende Szene ausblenden; sie läuft unhörbar weiter und kommt danach zurück
    if (stumm) blende(szene.g, 0, 0.3);
    familieTimer = setTimeout(() => {
      const d = FAMILIE[name]();
      familieTimer = setTimeout(() => { familieAn = false; weiter(); }, (d + 0.15) * 1000);
    }, stumm ? 300 : 0);
    return;
  }
  if (szene) { blende(szene.g, 1, EIN); abloesen(); return; }
  let art = null, seit = -1;
  for (const [a, o] of offen) if (o.seit > seit) { art = a; seit = o.seit; }   // bei Gleichstand die zuerst genannte Art
  if (!art) return;
  const { laenge } = offen.get(art);
  offen.delete(art);
  erledigt.add(art);
  szeneStarten(art, laenge);
}

// Familienklang (geburt, hochzeit, tod) anstellen
export function familie(name) {
  if (!ctx || !FAMILIE[name]) return;
  schlange.push({ name, seit: ctx.currentTime });
  weiter();
}

// ziele: { art: 1 } für jedes Ereignis, das gerade läuft. Jede Art klingt einmal als kurze Szene; erst wenn ihr Ereignis
// vorbei ist, kann sie wieder fällig werden.
export function stimmung(ziele) {
  if (!ctx) return;
  const laeuft = art => (ziele[art] ?? 0) > 0;
  for (const art of Object.keys(ziele)) {
    if (!ATMO[art] || !laeuft(art) || offen.has(art) || erledigt.has(art)) continue;
    if (szene?.art === art && !szene.endet) erledigt.add(art);
    else offen.set(art, { seit: ctx.currentTime });
  }
  for (const art of offen.keys()) if (!laeuft(art)) offen.delete(art);
  for (const art of erledigt) if (!laeuft(art)) erledigt.delete(art);
  abloesen();
  weiter();
}

export function stille() {
  if (!ctx) return;
  schlange.length = 0;
  offen.clear();
  erledigt.clear();
  clearTimeout(familieTimer);
  familieAn = false;
  if (szene) szeneBeenden(szene, 0.5);
}

// für die Fehlersuche in der Konsole
export function zustand() {
  const einsatz = Object.fromEntries([...PUFFER].filter(([n]) => ABSCHNITT[n.replace(/_\d+$/, '')]).map(([n, b]) => [n, `${Math.round(b.duration)} s, ${einsaetze(b).length} Einsätze`]));
  return {
    audio: ctx?.state ?? 'aus', abtastrate: ctx?.sampleRate, szene: szene?.art ?? null, familie: familieAn, schlange: schlange.map(x => x.name),
    offen: [...offen.keys()], geladen: [...PUFFER.keys()], verfuegbar: Object.keys(LISTE).length, einsatz,
  };
}
