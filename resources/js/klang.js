// Geräusche zur Zeitreise: echte Aufnahmen aus media/klaenge/ (Dateiname = Art, z. B. kanone.mp3, kanone_2.ogg),
// sonst im Browser erzeugt (Web Audio).
// Atmosphären laufen, solange ein Ereignis andauert, und werden weich ein- und ausgeblendet.

let ctx = null, master = null, rauschen = null, pegel = 0.5;
const rnd = (a, b) => a + Math.random() * (b - a);

export function bereit() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = pegel;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 4;
    rauschen = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = rauschen.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  dekodieren();
  return ctx;
}

// --- Aufnahmen ----------------------------------------------------------------------------------------
const DATEIEN = {}, PUFFER = {};
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

export async function ladeAufnahmen() {
  try {
    const liste = await ordnerListe();
    await Promise.all(Object.entries(liste).map(async ([name, datei]) => {
      try { DATEIEN[name] = await (await fetch(klangUrl(datei))).arrayBuffer(); } catch (e) { /* fehlt */ }
    }));
  } catch (e) { /* keine Aufnahmen: erzeugte Klänge */ }
  if (ctx) await dekodieren();
  return Object.keys(DATEIEN);
}
async function dekodieren() {
  for (const [n, b] of Object.entries(DATEIEN)) {
    if (PUFFER[n]) continue;
    try { PUFFER[n] = await ctx.decodeAudioData(b.slice(0)); } catch (e) { /* unlesbar */ }
  }
}
// zufällige Aufnahme einer Art: „kanone“, „kanone_2“, „kanone_3“ …
function puffer(name) {
  const k = Object.keys(PUFFER).filter(x => x === name || x.startsWith(name + '_'));
  return k.length ? PUFFER[k[Math.floor(Math.random() * k.length)]] : null;
}
// Einzelgeräusche aus langen Aufnahmen: Abschnittslänge und Vorlauf vor dem lauten Einsatz (Sekunden)
const ABSCHNITT = {
  kanone: [4, 0.1], artillerie: [5, 0.1], gewehr: [4, 0.1], mg1: [3.5, 0.1], mg2: [3.5, 0.1], mg: [3.5, 0.1],
  bombe: [7, 3], stuka: [11, 8], luftalarm: [20, 0.5], totenglocke: [6, 0.05], glocke_hell: [3, 0.05], glocke_tief: [7, 0.05], hochzeit: [9, 0],
  geburt: [3.5, 0.15], lachen: [5, 0.2],
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
function spiele(name, ziel, { laut = 1, pan = rnd(-0.7, 0.7), tonhoehe = rnd(0.95, 1.05) } = {}) {
  const b = puffer(name);
  if (!b) return false;
  const [laenge, vorlauf] = ABSCHNITT[name] ?? [b.duration, 0];
  let ab = 0, dauer = b.duration;
  if (b.duration > laenge + 1) {
    const e = einsaetze(b);
    const t = e.length ? e[Math.floor(Math.random() * e.length)] : rnd(0, b.duration - laenge);
    ab = Math.max(0, Math.min(b.duration - laenge, t - vorlauf));
    dauer = laenge;
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
  return true;
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
// Geburt: Babylachen bzw. Jauchzen; Hochzeit: Glocken mit hellem Lachen
export const geburt = () => ctx && (spiele('geburt', master, { laut: 0.6, pan: rnd(-0.4, 0.4), tonhoehe: 1 }) || spiele('glocke_hell', master, { laut: 0.5, pan: 0 }) || glocke(880 + rnd(0, 200), 0.08, 2.5));
export const tod = () => ctx && (spiele('glocke_tief', master, { laut: 0.6, pan: 0 }) || glocke(rnd(150, 190), 0.16, 5));
export const hochzeit = () => {
  if (!ctx) return;
  if (!spiele('hochzeit', master, { laut: 0.45, pan: 0 })) { glocke(523, 0.1, 3); setTimeout(() => glocke(659, 0.1, 3), 300); }
  setTimeout(() => ctx && spiele('lachen', master, { laut: 0.55, pan: rnd(-0.3, 0.3), tonhoehe: 1 }), 400);
};

// Gesamtlautstärke der Geräusche (0..1); gilt auch, wenn der Ton erst später startet
export function lautstaerke(v) {
  pegel = v;
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
}

// kurze Hörprobe einer Art (für das Ton-Menü)
export function probe(art) {
  if (!ctx) return;
  if (art === 'geburt') return geburt();
  if (art === 'tod') return tod();
  if (art === 'hochzeit') return hochzeit();
  if (art === 'luftkrieg') { luftalarm(master, 6); setTimeout(() => ctx && bombe(master), 1500); return; }
  if (art === 'krieg2') { stuka(master); return; }
  if (!ATMO[art]) return;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(master);
  const stop = ATMO[art](g);
  g.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
  setTimeout(() => g.gain.setTargetAtTime(0, ctx.currentTime, 0.4), 3500);
  setTimeout(() => { stop(); g.disconnect(); }, 5500);
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

// --- Einzelne Klänge ---------------------------------------------------------------------------
function kanone(ziel, nah = Math.random(), art = 'kanone') {
  if (spiele(art, ziel, { laut: 0.35 + 0.65 * nah }) || (art !== 'kanone' && spiele('kanone', ziel, { laut: 0.35 + 0.65 * nah }))) return;
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
  if (spiele('gewehr', ziel, { laut: 0.7 })) return;
  const pan = rnd(-1, 1), n = Math.floor(rnd(3, 10));
  for (let i = 0, z = 0; i < n; i++, z += rnd(60, 240)) setTimeout(() => ctx && schuss(ziel, pan + rnd(-0.15, 0.15)), z);
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
}

// Maschinengewehr: schnelle, gleichmäßige Schüsse (Erster Weltkrieg langsamer, Zweiter schneller)
function mg(ziel, abstand = 110) {
  if (spiele(abstand < 80 ? 'mg2' : 'mg1', ziel, { laut: 0.7 }) || spiele('mg', ziel, { laut: 0.7 })) return;
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
}

// Fliegerbombe: Pfeifen im Fall, dann schwere Explosion
function bombe(ziel) {
  if (spiele('bombe', ziel, { laut: 0.9 })) return;
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
  setTimeout(() => { if (ctx) { kanone(p, 1); kanone(p, 0.8); } }, d * 1000);
}

// Sturzkampfbomber: Motor und anschwellende Sirene im Sturzflug, am Ende die Bombe
function stuka(ziel) {
  if (spiele('stuka', ziel, { laut: 0.8 })) return;
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
}

// Luftalarm: Sirene, die etwa eine Viertelminute auf- und abschwillt
function luftalarm(ziel, dauer = 14) {
  if (spiele('luftalarm', ziel, { laut: 0.6, pan: 0, tonhoehe: 1 })) return;
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

const ATMO = {
  // Kriege vor 1900: Kanonen und Gewehrsalven
  krieg: g => {
    const id = setInterval(() => {
      if (Math.random() < 0.55) kanone(g, Math.random());
      if (Math.random() < 0.4) salve(g);
    }, 850);
    return () => clearInterval(id);
  },
  // Erster Weltkrieg: Artillerie und Maschinengewehre
  krieg1: g => {
    const id = setInterval(() => {
      if (Math.random() < 0.45) kanone(g, Math.random(), 'artillerie');
      if (Math.random() < 0.35) mg(g, 115);
      if (Math.random() < 0.2) salve(g);
    }, 900);
    return () => clearInterval(id);
  },
  // Zweiter Weltkrieg: schnelle Maschinengewehre, Stukas, Bomben
  krieg2: g => {
    let n = 0;
    const id = setInterval(() => {
      if (Math.random() < 0.4) mg(g, 55);
      if (Math.random() < 0.3) kanone(g, Math.random(), 'artillerie');
      if (n % 14 === 3) stuka(g);
      else if (Math.random() < 0.12) bombe(g);
      n++;
    }, 900);
    return () => clearInterval(id);
  },
  // Luftkrieg der letzten Kriegsjahre: Luftalarm und Bombenhagel
  luftkrieg: g => {
    const echt = schleife('luftkrieg', g, 0.7);   // Originalaufnahme eines Luftangriffs, dazu ab und zu die Sirene
    if (echt) {
      let m = 0;
      const id2 = setInterval(() => { if (m % 30 === 0) luftalarm(g); m++; }, 1000);
      return () => { echt(); clearInterval(id2); };
    }
    let n = 0;
    const id = setInterval(() => {
      if (n % 24 === 0) luftalarm(g);
      if (n % 24 > 8 && Math.random() < 0.35) bombe(g);
      if (n % 24 === 12) stuka(g);
      n++;
    }, 1000);
    return () => clearInterval(id);
  },
  // Schießereien bei Aufständen
  gefecht: g => {
    const id = setInterval(() => {
      if (Math.random() < 0.4) mg(g, 70);
      if (Math.random() < 0.5) salve(g);
    }, 1100);
    return () => clearInterval(id);
  },
  totenglocke: g => {
    const id = setInterval(() => spiele('totenglocke', g, { laut: 0.7, pan: 0, tonhoehe: 1 }) || glocke(rnd(105, 125), 0.22, 6, g), 4200);
    return () => clearInterval(id);
  },
  marsch: g => {
    const echt = schleife('marsch', g, 0.8);
    if (echt) return echt;
    let n = 0;
    const id = setInterval(() => { tritt(g, n % 2 === 0); if (n % 2 === 0) trommel(g); if (n % 8 === 6) { trommel(g); setTimeout(() => ctx && trommel(g), 130); } n++; }, 530);
    return () => clearInterval(id);
  },
  not: g => {
    const echt = schleife('klagen', g, 0.8);
    if (echt) { const w2 = schleife('wind', g, 0.4); return () => { echt(); w2?.(); }; }
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
  glocken: g => {
    const echt = schleife('glocken', g, 0.7);
    if (echt) return echt;
    const id = setInterval(() => glocke(rnd(300, 480), 0.16, 4, g), 1600);
    return () => clearInterval(id);
  },
  strom: g => schleife('strom', g, 0.6) || strom(g),
};
export const ARTEN = Object.keys(ATMO);

const aktiv = new Map();
// ziele: { art: Stärke 0..1 }; was fehlt, wird ausgeblendet
export function stimmung(ziele) {
  if (!ctx) return;
  for (const [art, st] of Object.entries(ziele)) {
    if (!ATMO[art] || st <= 0.01) continue;
    let a = aktiv.get(art);
    if (!a) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);
      a = { g, stop: ATMO[art](g), ende: null };
      aktiv.set(art, a);
    }
    if (a.ende) { clearTimeout(a.ende); a.ende = null; }
    a.g.gain.setTargetAtTime(st, ctx.currentTime, 0.6);
  }
  for (const [art, a] of aktiv) {
    if ((ziele[art] ?? 0) > 0.01 || a.ende) continue;
    a.g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    a.ende = setTimeout(() => { a.stop(); a.g.disconnect(); aktiv.delete(art); }, 2500);
  }
}

export function stille() { stimmung({}); }

// für die Fehlersuche in der Konsole
export function zustand() {
  const einsatz = Object.fromEntries(Object.entries(PUFFER).filter(([n]) => ABSCHNITT[n.replace(/_\d+$/, '')]).map(([n, b]) => [n, `${Math.round(b.duration)} s, ${einsaetze(b).length} Einsätze`]));
  return { audio: ctx?.state ?? 'aus', atmosphaeren: [...aktiv.keys()], aufnahmen: Object.keys(PUFFER), einsatz };
}
