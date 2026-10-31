// Lebensbühne: die Familie als begehbarer Zeittunnel. Die Hauptperson in der Mitte, Vorfahren nach hinten, Nachkommen nach vorn;
// die Tiefe ist die Zeit.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ladeDaten, ansicht, netz, phonetik, jahreKurz, verwandtschaft, zeitFuerAnsicht, weltgeschehenZeigen, JETZT } from 'lb/daten.js';
import { t, EN as SPRACHE_EN } from 'lb/text.js';
import { Panel } from 'lb/panel.js';
import * as klang from 'lb/klang.js';
import { baueHimmel } from 'lb/himmel.js';
import { Kartenstapel, KW, KH } from 'lb/karten.js';
import { bildrateTiefe } from 'lb/tiefe.js';

const FARBE = { vater: '#d6a24e', mutter: '#62b6a9', start: '#f2ede4' };
const ZWEIGE = ['#c99be0', '#86aee6', '#e39a8b', '#a5d388', '#e8c872', '#86d6cf'];   // Nachkommen: je Kind der Hauptperson eine Farbe
const PARTNER = '#e396b8';   // Partner und dessen Vorfahren
// Geschwister, Nichten und Neffen: je Geschwister eine Zweigfarbe, gegen die eigenen Kinder um drei Farben versetzt
const farbeFaecher = p => p.rolle === 'nachkomme' ? ZWEIGE[(p.zweig ?? 0) % ZWEIGE.length]
  : p.rolle === 'geschwister' || p.rolle === 'neffe' ? ZWEIGE[((p.zweig ?? 0) + 3) % ZWEIGE.length]
  : p.partnerseite ? PARTNER : FARBE[p.seite] ?? FARBE.start;
// im Netz wie bei „Lineage“: Farbe nach dem Klang des Familiennamens (Kölner Phonetik), Farbton im goldenen Winkel verteilt
const nameFarben = new Map();
function nameFarbe(p) {
  const code = phonetik(p.name.nachname || '') || '?';
  if (!nameFarben.has(code)) {
    let h = 0;
    for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    nameFarben.set(code, `hsl(${Math.round((h * 137.508) % 360)}, 62%, 64%)`);
  }
  return nameFarben.get(code);
}
const farbe = p => modus.netz ? (p.rolle === 'start' ? FARBE.start : nameFarbe(p)) : farbeFaecher(p);
const HINTERGRUND = 0x0c0f15;
const JAHR_NULL = 1973, TIEFE_PRO_JAHR = 0.24, RING_ABSTAND = 3.2, WINKEL = Math.PI * 0.86, RING = 35;
const FENSTER_ZEIT = 6, FENSTER_FAMILIE = 4;   // so viele Jahre vor und nach dem Regler werden Einträge eingeblendet
const zVon = jahr => (jahr - JAHR_NULL) * TIEFE_PRO_JAHR;

const daten = await ladeDaten();
const { personen, zeit } = daten;
let zeitAnsicht = zeit, klangAnsicht = daten.klangZeit;   // Zeitgeschehen, das zu den Regionen der Ansicht passt
const JAHR_MIN = Math.min(...personen.map(p => p.jahrE));

// --- Szene ---------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
// auf Touch-Geräten etwas gröber rendern: spart Grafikspeicher und Akku
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('buehne').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(HINTERGRUND);
scene.fog = new THREE.Fog(HINTERGRUND, 45, 190);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 260;
controls.autoRotateSpeed = 0.45;

// --- Porträtkarten (gezeichnet in KW × KH; Maßstab und Ablage im Atlas übernimmt karten.js) ------------------------
function zeichneKarte(g, p, img) {
  const f = farbe(p);
  g.fillStyle = 'rgba(18,22,30,0.94)';
  rundRechteck(g, 4, 4, KW - 8, KH - 8, 22); g.fill();
  g.lineWidth = p.mannesstamm || p.rolle === 'start' ? 7 : 4;
  g.strokeStyle = f;
  if (p.halb) g.setLineDash([18, 11]);   // Halbgeschwister: gestrichelter Rahmen
  g.stroke();
  g.setLineDash([]);
  // Gesicht im Kreis
  const cx = KW / 2, cy = 118, r = 92;
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  if (img) {
    const s = Math.max((2 * r) / img.width, (2 * r) / img.height);
    g.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
  } else {
    g.fillStyle = '#232a36'; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    g.fillStyle = '#3c4656';
    g.beginPath(); g.arc(cx, cy - 18, 36, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx, cy + 78, 66, 52, 0, Math.PI, 0); g.fill();
  }
  g.restore();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = f; g.stroke();
  // Name und Jahre
  g.textAlign = 'center'; g.fillStyle = '#f2ede4';
  g.font = '500 24px "Segoe UI", system-ui, sans-serif';
  g.fillText(kuerze(g, p.name.vorname || '?', KW - 28), cx, 245);
  g.font = '700 27px "Segoe UI", system-ui, sans-serif';
  g.fillText(kuerze(g, p.name.nachname || '', KW - 28), cx, 277);
  g.font = '400 21px "Segoe UI", system-ui, sans-serif'; g.fillStyle = '#a9b0bc';
  g.fillText(jahreKurz(p), cx, 308);
}
const stapel = new Kartenstapel(renderer, zeichneKarte);
let neuZeichnen = true;
const zeichnen = () => { neuZeichnen = true; };   // nächstes Bild zeichnen (die Schleife zeichnet sonst nicht)

function rundRechteck(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function kuerze(g, t, max) {
  if (g.measureText(t).width <= max) return t;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

// --- Feste Kulisse: Zeitringe, Zeitachse am Boden, Zeitgeschehen, Staub ----------------------------
function textSprite(text, { groesse = 1, farbe = '#8b93a1', gewicht = 500 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `${gewicht} 64px "Segoe UI", system-ui, sans-serif`;
  c.width = Math.ceil(g.measureText(text).width) + 20; c.height = 84;
  g.font = `${gewicht} 64px "Segoe UI", system-ui, sans-serif`;
  g.fillStyle = farbe; g.textBaseline = 'middle'; g.fillText(text, 10, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(groesse * c.width / c.height, groesse, 1);
  return s;
}

const kulisse = new THREE.Group();
scene.add(kulisse);
const ringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 });
const ringMat50 = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });
for (let j = Math.floor(JAHR_MIN / 50) * 50; j <= 2025; j += 25) {
  const pts = [];
  for (let i = 0; i <= 96; i++) { const w = i / 96 * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(w) * RING, Math.cos(w) * RING * 0.82, zVon(j))); }
  kulisse.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), j % 50 ? ringMat : ringMat50));
  if (j % 50 === 0 && j <= 1950) {
    const t = textSprite(String(j), { groesse: 2.2, farbe: '#6f7786' });
    t.position.set(0, RING * 0.82 + 2, zVon(j));
    kulisse.add(t);
  }
}
const BODEN = -RING * 0.82;
kulisse.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, BODEN, zVon(JETZT)), new THREE.Vector3(0, BODEN, zVon(JAHR_MIN - 30))]),
  new THREE.LineBasicMaterial({ color: 0xe8b04f, transparent: true, opacity: 0.5 })));

// Marken des Zeitgeschehens am Boden: bei jedem Wechsel der Ansicht neu, passend zu deren Regionen
const zeitMarken = [];
const rauteGeo = new THREE.OctahedronGeometry(0.7);
function baueZeitMarken() {
  zeichnen();
  for (const m of zeitMarken.splice(0)) { scene.remove(m); m.material.dispose(); }
  if (modus.netz) return;   // im Netz gibt es keine Zeitachse am Boden
  for (const z of zeitAnsicht) {
    const m = new THREE.Mesh(rauteGeo, new THREE.MeshBasicMaterial({ color: 0xe8b04f, transparent: true, opacity: 0.75 }));
    m.position.set(0, BODEN, zVon(z.jahr));
    m.userData = { zeit: z };
    scene.add(m);
    zeitMarken.push(m);
  }
}
// Sternhimmel nur im Hintergrund (echte Sterne und Milchstraße), er geht mit der Kamera mit
const himmelFolgt = baueHimmel(scene, (window.LEBENSBUEHNE || {}).sterne || 'data/sterne.json', renderer.getPixelRatio(), () => zeichnen());

// Lichthof für frisch Geborene (warmes, weiches Leuchten hinter der Karte)
const hofTextur = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), v = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  v.addColorStop(0, 'rgba(255,226,150,0.95)');
  v.addColorStop(0.45, 'rgba(232,176,79,0.45)');
  v.addColorStop(1, 'rgba(232,176,79,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// --- Familie der Hauptperson: wird bei jedem Wechsel neu aufgebaut ----------------------------------
const gruppe = new THREE.Group();
scene.add(gruppe);
let root = daten.start, modus = { vorfahren: true, nachkommen: false, partner: false, geschwister: false, netz: false };
let imBild = [], karten = [], linien = [];

// Netz-Tiefe (Schritte über Eltern, Kinder, Partner) und Weltgeschehen; beides merkt sich der Browser
const netzTiefeWahl = document.getElementById('netz-tiefe');
let netzTiefe = Infinity;
try {
  const w = localStorage.getItem('lb-netztiefe');
  if (w && [...netzTiefeWahl.options].some(o => o.value === w)) netzTiefeWahl.value = w;
  else netzTiefeWahl.value = 'alle';
} catch (e) { netzTiefeWahl.value = 'alle'; }
netzTiefe = netzTiefeWahl.value === 'alle' ? Infinity : Number(netzTiefeWahl.value);
// Generationen des Fächers (von der Hauptperson aus); große Stammbäume brauchen sonst sehr viel Rechenleistung
const generationenWahl = document.getElementById('generationen');
// ohne gemerkte Wahl: kleine Stammbäume ganz, große mit 5 Generationen (so lädt auch ein Baum mit Zehntausenden Personen)
const standardGenerationen = daten.personen.length <= 1500 ? 'alle' : '5';
try {
  const w = localStorage.getItem('lb-generationen');
  generationenWahl.value = w && [...generationenWahl.options].some(o => o.value === w) ? w : standardGenerationen;
} catch (e) { generationenWahl.value = standardGenerationen; }
let generationen = generationenWahl.value === 'alle' ? Infinity : Number(generationenWahl.value);
let mitWelt = true;
try { mitWelt = localStorage.getItem('lb-welt') !== '0'; } catch (e) { /* an */ }
weltgeschehenZeigen(mitWelt);
{
  const [id, m] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (daten.byId.has(id)) root = daten.byId.get(id);
  if (m) modus = { vorfahren: m.includes('v'), nachkommen: m.includes('n'), partner: m.includes('p'), geschwister: m.includes('g'), netz: m.includes('x') };
}

function baue() {
  for (const o of [...gruppe.children]) {
    gruppe.remove(o);
    o.geometry?.dispose?.();
    if (o.material?.map !== hofTextur && o.material?.map !== sternTextur) o.material?.map?.dispose();
    o.material?.dispose();
  }
  sim = null; netzKanten = null; netzHell = null; netzSterne = null;
  controls.autoRotate = false;
  imBild = modus.netz ? netz(daten, root, netzTiefe) : ansicht(daten, root, { ...modus, generationen });
  if (!modus.netz) document.getElementById('faecher-anzahl').textContent =
    t(imBild.gekuerzt ? '{n} Personen, weitere Generationen ausgeblendet' : '{n} Personen', { n: imBild.length.toLocaleString(SPRACHE_EN ? 'en' : 'de') });
  if (modus.netz) document.getElementById('netz-anzahl').textContent =
    t(imBild.gekuerzt ? '{n} Personen, gekürzt' : '{n} Personen', { n: imBild.length.toLocaleString(SPRACHE_EN ? 'en' : 'de') });
  kulisse.visible = !modus.netz;
  document.body.classList.toggle('netz', modus.netz);
  zeitAnsicht = zeitFuerAnsicht(imBild, zeit);
  klangAnsicht = zeitFuerAnsicht(imBild, daten.klangZeit);
  baueZeitMarken();
  // Fächer: jeder Zweig bekommt so viel Winkel, wie er Enden hat; Radius nach Generation, Tiefe nach Geburtsjahr
  const elternIm = p => p.eltern.filter(e => e.rolle === 'vorfahr' && e.zumStart === p);
  const kinderIm = p => p.kinderP.filter(c => c.rolle === 'nachkomme' && c.zumStart === p);
  const verteile = (p, von, bis, folge, plus = 0) => {
    const r = (p.generation + plus) * RING_ABSTAND, w = (von + bis) / 2;
    p.pos = new THREE.Vector3(Math.sin(w) * r, Math.cos(w) * r * 0.82, zVon(p.jahrE));
    const k = folge(p), enden = k.map(x => blaetter(x, folge)), summe = enden.reduce((a, b) => a + b, 0);
    let a = von;
    k.forEach((x, i) => { const b = a + (bis - von) * enden[i] / summe; verteile(x, a, b, folge, plus); a = b; });
  };
  const blaetterCache = new Map();
  const blaetter = (p, folge) => {
    const key = p.id + folge.name;
    if (!blaetterCache.has(key)) { const k = folge(p); blaetterCache.set(key, k.length ? k.reduce((s, x) => s + blaetter(x, folge), 0) : 1); }
    return blaetterCache.get(key);
  };
  root.pos = new THREE.Vector3(0, 0, zVon(root.jahrE));
  if (modus.netz) netzStart();
  else {
    // mit Partner: eigene Vorfahren links, die des Partners rechts daneben
    const partner = imBild.filter(p => p.rolle === 'partner');
    if (modus.vorfahren || modus.geschwister) verteile(root, -WINKEL, partner.length ? -0.12 : WINKEL, elternIm);
    partner.forEach((pa, i) => {
      const breite = (WINKEL - 0.12) / partner.length;
      verteile(pa, 0.12 + i * breite, 0.12 + (i + 1) * breite, elternIm, 0.7);
    });
    if (modus.nachkommen) verteile(root, -WINKEL, WINKEL, kinderIm);
    if (modus.geschwister) {
      // Geschwister auf dem ersten Ring in Geburtsreihenfolge, jedes mit so viel Winkel, wie es Partner und Enden
      // (Nichten, Neffen, deren Kinder …) hat; die Partner stehen neben ihm, die Nachkommen weiter außen
      const geschwFolge = p => [...(p.rolle === 'geschwister' ? p.partnerP.filter(x => x.rolle === 'schwager' && x.zumStart === p) : []),
        ...p.kinderP.filter(c => c.rolle === 'neffe' && c.zumStart === p)];
      const geschw = imBild.filter(p => p.rolle === 'geschwister');
      const enden = geschw.map(x => blaetter(x, geschwFolge)), summe = enden.reduce((a, b) => a + b, 0);
      let von = -WINKEL;
      geschw.forEach((x, i) => { const bis = von + 2 * WINKEL * enden[i] / summe; verteile(x, von, bis, geschwFolge, 1); von = bis; });
    }
    entzerren(imBild.filter(p => p !== root));
  }

  karten = stapel.baue(imBild.map(p => {
    const groesse = (p.rolle === 'start' ? 1.35 : 1) * (modus.netz ? 0.8 : 1);
    return { p, basis: new THREE.Vector2(2.3 * groesse, 2.96 * groesse) };
  }), gruppe);
  linien = modus.netz ? [] : imBild.filter(p => p.zumStart).map(p => {
    const a = p.zumStart.pos, b = p.pos;
    const mitte = a.clone().lerp(b, 0.5);
    mitte.add(new THREE.Vector3(mitte.x, mitte.y, 0).normalize().multiplyScalar(0.8));
    const kurve = new THREE.QuadraticBezierCurve3(a.clone(), mitte, b.clone());
    const mat = new THREE.MeshBasicMaterial({ color: farbe(p), transparent: true, opacity: 0.45 });
    const rohr = new THREE.Mesh(new THREE.TubeGeometry(kurve, 24, p.mannesstamm ? 0.06 : 0.035, 6, false), mat);
    rohr.userData = { von: p.zumStart, zu: p };
    gruppe.add(rohr);
    return rohr;
  });

  if (modus.netz) netzLinienBauen();
  const nachGeburt = [...imBild].filter(p => !modus.netz || p.rolle === 'vorfahr' || p.rolle === 'start')
    .sort((a, b) => (a.geburt ?? a.jahrE) - (b.geburt ?? b.jahrE) || b.mannesstamm - a.mannesstamm);
  linienBasis = modus.vorfahren || modus.partner || modus.geschwister || modus.netz ? nachGeburt[0] : nachGeburt[nachGeburt.length - 1];
  const jahre = imBild.map(p => p.jahrE);
  document.getElementById('info-zahl').textContent =
    t(imBild.length === 1 ? '{n} Person · {von}–{bis} · {g} Gesichter' : '{n} Personen · {von}–{bis} · {g} Gesichter',
      { n: imBild.length, von: Math.min(...jahre), bis: Math.max(...jahre), g: imBild.filter(p => p.gesicht).length });
  document.getElementById('hauptperson').textContent = root.name.voll;
  document.getElementById('modus-vorfahren').setAttribute('aria-pressed', modus.vorfahren);
  document.getElementById('modus-nachkommen').setAttribute('aria-pressed', modus.nachkommen);
  document.getElementById('modus-partner').setAttribute('aria-pressed', modus.partner);
  document.getElementById('modus-geschwister')?.setAttribute('aria-pressed', modus.geschwister);
  document.getElementById('modus-netz').setAttribute('aria-pressed', modus.netz);
  for (const id of ['modus-vorfahren', 'modus-nachkommen', 'modus-partner', 'modus-geschwister']) document.getElementById(id)?.classList.toggle('im-netz', modus.netz);
  // mit Geschwistern blendet „Partner“ auch die Partner der Geschwister ein
  const geschwPartner = modus.geschwister && imBild.some(p => p.rolle === 'geschwister' && p.partnerP.length);
  document.getElementById('modus-partner').disabled = !root.partnerP.length && !geschwPartner;
  document.getElementById('modus-partner').title = (root.partnerP.length
    ? t(root.partnerP.length > 1 ? '{namen} und deren Vorfahren einblenden' : '{namen} und dessen Vorfahren einblenden', { namen: root.partnerP.map(x => x.name.voll).join(', ') })
    : geschwPartner ? '' : t('Keine Partner im Stammbaum'))
    + (geschwPartner ? (root.partnerP.length ? ' · ' : '') + t('Partner der Geschwister einblenden') : '');
  history.replaceState(null, '', `#${root.id}/${modus.vorfahren ? 'v' : ''}${modus.nachkommen ? 'n' : ''}${modus.partner ? 'p' : ''}${modus.geschwister ? 'g' : ''}${modus.netz ? 'x' : ''}`);
  gewaehlt = null;
  aktualisiereDarstellung();
  letztesJahr = null;
  if (zeitJahr != null) setzeJahr(zeitJahr);
}


// --- Netz: alle Verwandten als räumliches Sternennetz (wie „Lineage“, aber in 3D). Jede Familie ist ein Stern: ein
// leuchtender Punkt in der Mitte, die Eltern dicht daran, die Kinder als Strahlen ringsum. Über die Kinder, die selbst
// eine Familie gründen, hängen die Sterne aneinander. Eine Kräftesimulation ordnet alles im Raum. ------------------------
let sim = null, netzKanten = null, netzHell = null, netzSterne = null;
const sternTextur = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), v = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  v.addColorStop(0, 'rgba(255,255,255,1)');
  v.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// Familien aus den Eltern der Kinder, dazu Paare ohne gemeinsame Kinder
// Karten aus derselben Zeit, die im Fächer aufeinanderliegen – etwa eingeheiratete Vorfahren ohne eigene Vorfahren
// auf den inneren Ringen –, auf ihrem Ring auseinanderschieben, bis eine Kartenbreite dazwischen ist; nur der Winkel ändert sich
function entzerren(menge) {
  const ABSTAND = 2.6, ZEIT = 1.5;   // Kartenbreite 2,3, dazu etwas Luft; Karten mit mehr als etwa 6 Jahren Unterschied liegen ohnehin hintereinander
  const k = menge.map(p => ({ p, r: Math.hypot(p.pos.x, p.pos.y / 0.82), w: Math.atan2(p.pos.x, p.pos.y / 0.82) }));
  for (let runde = 0; runde < 60; runde++) {
    let bewegt = false;
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
      const a = k[i], b = k[j];
      if (Math.abs(a.p.pos.z - b.p.pos.z) >= ZEIT) continue;
      const d = Math.hypot(a.p.pos.x - b.p.pos.x, a.p.pos.y - b.p.pos.y);
      if (d >= ABSTAND) continue;
      const schub = (ABSTAND - d) / Math.min(a.r, b.r) / 2 + 0.002;
      const [links, rechts] = a.w <= b.w ? [a, b] : [b, a];
      links.w -= schub;
      rechts.w += schub;
      for (const x of [a, b]) {
        x.w = Math.max(-WINKEL, Math.min(WINKEL, x.w));
        x.p.pos.x = Math.sin(x.w) * x.r;
        x.p.pos.y = Math.cos(x.w) * x.r * 0.82;
      }
      bewegt = true;
    }
    if (!bewegt) break;
  }
}

function familienBilden() {
  const fam = new Map();
  const hole = eltern => {
    const key = eltern.map(e => e.id).sort().join('+');
    if (!fam.has(key)) fam.set(key, { key, eltern, kinder: [] });
    return fam.get(key);
  };
  for (const p of imBild) {
    const e = p.eltern.filter(x => x.imBild);
    if (e.length) hole(e).kinder.push(p);
  }
  for (const p of imBild) for (const x of p.partnerP) if (x.imBild && p.id < x.id) hole([p, x]);
  return [...fam.values()];
}

function netzStart() {
  const familien = familienBilden(), kanten = [];
  for (const f of familien) {
    f.farbe = new THREE.Color(nameFarbe(f.eltern.find(e => e.geschlecht === 'M') || f.eltern[0]));
    for (const e of f.eltern) kanten.push({ a: f, b: e, lang: 1.9, stark: 0.7, art: 'eltern', f });
    for (const k of f.kinder) kanten.push({ a: f, b: k, lang: 3.6, stark: 0.45, art: 'kind', f });
  }
  // Startlage: von der Hauptperson aus nach außen, jeder Knoten neben einem schon platzierten Nachbarn (fester Zufall,
  // damit jeder Aufbau gleich aussieht)
  let saat = 7;
  const zufall = () => (saat = (saat * 16807) % 2147483647) / 2147483647 - 0.5;
  const nachbarnVon = new Map();
  const verbinde = (x, y) => { if (!nachbarnVon.has(x)) nachbarnVon.set(x, []); nachbarnVon.get(x).push(y); };
  for (const k of kanten) { verbinde(k.a, k.b); verbinde(k.b, k.a); }
  const knoten = [...imBild, ...familien];
  for (const n of knoten) { n.pos = null; n.v = new THREE.Vector3(); }
  root.pos = new THREE.Vector3();
  const reihe = [root];
  while (reihe.length) {
    const x = reihe.shift();
    for (const y of nachbarnVon.get(x) || []) {
      if (y.pos) continue;
      y.pos = x.pos.clone().add(new THREE.Vector3(zufall(), zufall(), zufall()).normalize().multiplyScalar(3));
      reihe.push(y);
    }
  }
  for (const n of knoten) if (!n.pos) n.pos = new THREE.Vector3(zufall() * 40, zufall() * 40, zufall() * 40);
  sim = { knoten, familien, kanten, alpha: 1 };
  for (let i = 0; i < 260; i++) simSchritt();   // vorrechnen, damit das Netz gleich geordnet erscheint
}

function simSchritt() {
  if (!sim || sim.alpha < 0.004) return false;
  const a = sim.alpha, R = 8, R2 = R * R, d = new THREE.Vector3();
  // Abstoßung über ein räumliches Raster mit Zellgröße R: nur Nachbarn aus den 27 Zellen ringsum
  const zellen = new Map(), schluessel = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  for (const n of sim.knoten) {
    n.zelle = [Math.floor(n.pos.x / R), Math.floor(n.pos.y / R), Math.floor(n.pos.z / R)];
    const k = schluessel(...n.zelle);
    if (!zellen.has(k)) zellen.set(k, []);
    zellen.get(k).push(n);
  }
  for (const n of sim.knoten) {
    const [cx, cy, cz] = n.zelle, staerke = n.kinder ? 4 : 10;   // Familienpunkte stoßen schwächer ab
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
      for (const m of zellen.get(schluessel(cx + dx, cy + dy, cz + dz)) || []) {
        if (m === n) continue;
        d.subVectors(n.pos, m.pos);
        const d2 = d.lengthSq();
        if (d2 < R2) n.v.addScaledVector(d, staerke * a / Math.max(d2, 0.25));
      }
  }
  for (const k of sim.kanten) {
    d.subVectors(k.b.pos, k.a.pos);
    const l = Math.max(0.01, d.length()), f = (l - k.lang) / l * k.stark * a;
    k.a.v.addScaledVector(d, f);
    k.b.v.addScaledVector(d, -f);
  }
  for (const n of sim.knoten) {
    n.v.addScaledVector(n.pos, -0.003 * a);   // sanft zur Mitte
    n.v.multiplyScalar(0.6);
    n.pos.add(n.v);
  }
  sim.alpha *= 0.986;
  return true;
}

const kantenGeo = n => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 6), 3));
  return g;
};
function netzLinienBauen() {
  // Strahlen der Familiensterne in der Farbe der Familie, zu den Eltern heller als zu den Kindern
  const geo = kantenGeo(sim.kanten.length), farben = new Float32Array(sim.kanten.length * 6);
  sim.kanten.forEach((k, i) => {
    const c = k.f.farbe.clone().multiplyScalar(k.art === 'eltern' ? 1 : 0.75);
    farben.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
  });
  geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  const strahlen = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }));
  strahlen.userData = { kanten: sim.kanten, basis: 0.5 };
  gruppe.add(strahlen);
  netzKanten = [strahlen];
  const hellGeo = kantenGeo(160);
  hellGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(160 * 6), 3));
  netzHell = new THREE.LineSegments(hellGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  netzHell.userData = { kanten: [] };
  gruppe.add(netzHell);
  // die Familienpunkte: kleine Sterne in der Mitte jeder Familie
  const pos = new Float32Array(sim.familien.length * 3), col = new Float32Array(sim.familien.length * 3);
  sim.familien.forEach((f, i) => col.set([f.farbe.r, f.farbe.g, f.farbe.b], i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  netzSterne = new THREE.Points(g, new THREE.PointsMaterial({ map: sternTextur, size: 2.4, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  netzSterne.frustumCulled = false;
  gruppe.add(netzSterne);
  netzPositionen();
}
function linienSetzen(l) {
  const a = l.geometry.attributes.position.array;
  l.userData.kanten.forEach((k, i) => {
    a[i * 6] = k.a.pos.x; a[i * 6 + 1] = k.a.pos.y; a[i * 6 + 2] = k.a.pos.z;
    a[i * 6 + 3] = k.b.pos.x; a[i * 6 + 4] = k.b.pos.y; a[i * 6 + 5] = k.b.pos.z;
  });
  l.geometry.setDrawRange(0, l.userData.kanten.length * 2);
  l.geometry.attributes.position.needsUpdate = true;
  l.geometry.computeBoundingSphere();
}
function netzPositionen() {
  for (const k of karten) k.hof?.position.copy(k.p.pos);
  for (const l of netzKanten || []) linienSetzen(l);
  if (netzHell) linienSetzen(netzHell);
  if (netzSterne) {
    const a = netzSterne.geometry.attributes.position;
    sim.familien.forEach((f, i) => a.setXYZ(i, f.pos.x, f.pos.y, f.pos.z));
    a.needsUpdate = true;
  }
}
// hervorgehoben: die Sterne der gewählten Person – ihre Herkunftsfamilie und ihre eigenen Familien. Der Weg zum
// Partner (die Person und der Partner an ihrem gemeinsamen Familienpunkt) ist rosa wie die Partnerseite im Fächer.
const HELL = new THREE.Color(0xf2ede4), HELL_PARTNER = new THREE.Color(0xff6fae);
function netzHellSetzen(p) {
  const fams = p ? new Set(sim.kanten.filter(k => k.b === p).map(k => k.f)) : new Set();
  const liste = sim.kanten.filter(k => fams.has(k.f)).slice(0, 160), farben = netzHell.geometry.attributes.color;
  liste.forEach((k, i) => {
    const c = k.art === 'eltern' && k.f.eltern.includes(p) ? HELL_PARTNER : HELL;
    farben.setXYZ(i * 2, c.r, c.g, c.b);
    farben.setXYZ(i * 2 + 1, c.r, c.g, c.b);
  });
  farben.needsUpdate = true;
  netzHell.userData.kanten = liste;
  linienSetzen(netzHell);
}
const nachbarn = p => new Set([p, ...p.eltern, ...p.kinderP, ...p.partnerP].filter(x => x.imBild));

function ueberblickNetz() {
  // Kugel um die meisten Karten (einzelne Ausreißer zählen nicht), schräg von vorn oben
  const mitte = new THREE.Vector3();
  for (const p of imBild) mitte.add(p.pos);
  mitte.divideScalar(imBild.length);
  const abst = imBild.map(p => p.pos.distanceTo(mitte)).sort((x, y) => x - y);
  const r = abst[Math.floor(abst.length * 0.95)] + 2;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = r / Math.min(tan, tan * camera.aspect) * 1.05;
  controls.maxDistance = Math.max(260, d * 1.6);
  fliege(mitte.clone().addScaledVector(new THREE.Vector3(0.25, 0.3, 1).normalize(), d), mitte);
  controls.autoRotate = true;   // dreht sich langsam, bis jemand eingreift
}

// --- Kamera-Flüge ---------------------------------------------------------------------------------
let flug = null;
function fliege(pos, ziel, dauer = 1300) {
  flug = { von: camera.position.clone(), vonZiel: controls.target.clone(), pos, ziel, t0: performance.now(), dauer };
}
// Überblick: Blick schräg von vorn oben; der Abstand richtet sich nach der Bildschirmform, damit alle Karten
// zwischen Kopf- und Fußleiste ganz zu sehen sind – auch im Hochformat, wo der Fächer breiter ist als der Bildschirm
function ueberblick() {
  if (modus.netz) return ueberblickNetz();
  const zs = imBild.map(p => p.pos.z);
  const zmax = Math.max(...zs), spanne = Math.max(20, zmax - Math.min(...zs));
  const H = innerHeight;
  const oben = 1 - 2 * (kopfleiste.getBoundingClientRect().bottom + 8) / H;
  const unten = -1 + 2 * (fussleiste.getBoundingClientRect().height + 8) / H;
  const probe = camera.clone();
  probe.clearViewOffset();
  const rechts = new THREE.Vector3(), hoch = new THREE.Vector3(), v = new THREE.Vector3();
  const rahmen = (pos, ziel) => {
    probe.position.copy(pos);
    probe.lookAt(ziel);
    probe.updateMatrixWorld();
    rechts.setFromMatrixColumn(probe.matrixWorld, 0);
    hoch.setFromMatrixColumn(probe.matrixWorld, 1);
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const p of imBild) {
      const g = p.rolle === 'start' ? 1.35 : 1;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        v.copy(p.pos).addScaledVector(rechts, sx * 1.2 * g).addScaledVector(hoch, sy * 1.55 * g).project(probe);
        if (v.z > 1) return null;   // hinter der Kamera: zu nah
        b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y);
      }
    }
    return b;
  };
  const verschiebung = new THREE.Vector3();
  const stelle = d => [new THREE.Vector3(0, d * 0.6, zmax + d * 0.7).add(verschiebung), new THREE.Vector3(0, -2, zmax - spanne * 0.3).add(verschiebung)];
  const passt = d => { const b = rahmen(...stelle(d)); return b && b.x1 - b.x0 <= 1.9 && b.y1 - b.y0 <= oben - unten; };
  let d = 20;
  for (let runde = 0; runde < 2; runde++) {
    let lo = 8, hi = 1200;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (passt(m)) hi = m; else lo = m; }
    d = hi;
    // Ausschnitt mittig zwischen die Leisten rücken
    const [pos, ziel] = stelle(d), b = rahmen(pos, ziel);
    if (!b) break;
    const halbH = pos.distanceTo(ziel) * Math.tan(THREE.MathUtils.degToRad(probe.fov / 2)), halbB = halbH * probe.aspect;
    verschiebung.addScaledVector(rechts, (b.x0 + b.x1) / 2 * halbB).addScaledVector(hoch, ((b.y0 + b.y1) / 2 - (oben + unten) / 2) * halbH);
  }
  const [pos, ziel] = stelle(d);
  controls.maxDistance = Math.max(260, pos.distanceTo(ziel) * 1.4);
  fliege(pos, ziel);
}

// --- Auswahl, Hervorhebung, Zeitreise ---------------------------------------------------------------
let gewaehlt = null, zeitJahr = null, letztesJahr = null, hover = null;

function linieZu(p) {
  const s = new Set();
  for (let x = p; x; x = x.zumStart) s.add(x);
  return s;
}

// Die direkte Linie: von der gewählten Person zur Hauptperson, ohne Auswahl von der ältesten dargestellten Person
// (nur Nachkommen: von der jüngsten). Sie ist hervorgehoben, und nur aus ihr kommen Geburts-, Hochzeits- und Todesklänge.
let linienBasis = null;
const direkteLinie = () => linieZu(gewaehlt ?? linienBasis ?? root);

function aktualisiereDarstellung() {
  const pfad = gewaehlt ? (modus.netz ? nachbarn(gewaehlt) : linieZu(gewaehlt)) : null;
  const direkt = !pfad || abspielen ? direkteLinie() : null;
  zeichnen();
  for (const k of karten) {
    const p = k.p;
    let o = 1, hell = 1, gross = 1, hof = 0;
    if (zeitJahr != null) {
      const s = lebenslicht(p, zeitJahr);
      o = s.o; hell = s.hell; gross = s.gross; hof = s.hof;
    }
    // Lichthof erst anlegen, wenn er gebraucht wird
    if (hof > 0.01 && !k.hof) {
      k.hof = new THREE.Sprite(new THREE.SpriteMaterial({ map: hofTextur, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));   // gleiche Tiefe wie die Karte: leicht nach vorn, sonst flimmert es
      k.hof.position.copy(p.pos);
      k.hof.renderOrder = 2;   // über der Karte, damit sie aufleuchtet (die Karten zeichnet karten.js mit renderOrder 1)
      gruppe.add(k.hof);
    }
    if (k.hof) {
      k.hof.material.opacity = 0.9 * hof;
      k.hof.scale.setScalar(k.basis.y * gross * 1.9);
      k.hof.visible = hof > 0.01;
    }
    if (k === hover) gross = Math.max(gross, 1.15);
    k.gross = gross;
    // ausgewählte Person: übrige dämpfen – nicht während der Zeitreise, dort zählt nur Leben und Tod
    if (!abspielen && pfad && !pfad.has(p) && p.zumStart !== gewaehlt) o = Math.min(o, 0.35);
    // Karten zwischen Kamera und gewählter Person fast durchsichtig, damit sie nicht verdecken
    if (!abspielen && gewaehlt && p.pos.z > gewaehlt.pos.z + 3) o = Math.min(o, 0.12);
    if (k === hover) { o = 1; hell = 1; }   // Maus über der Person: hell und voll sichtbar
    k.hell = hell;
    k.o = o;
  }
  for (const l of linien) {
    const { von, zu } = l.userData;
    const an = pfad ? (pfad.has(von) && pfad.has(zu)) || von === gewaehlt : false;
    l.material.opacity = pfad && !abspielen ? (an ? 0.95 : 0.12)
      : direkt?.has(von) && direkt.has(zu) ? 0.95
      : zeitJahr != null ? 0.6 * Math.min(lebenslicht(von, zeitJahr).o, lebenslicht(zu, zeitJahr).o) : 0.45;
  }
  if (netzKanten) {
    const leise = pfad && !abspielen;
    for (const l of netzKanten) l.material.opacity = leise ? l.userData.basis * 0.35 : l.userData.basis;
    netzHellSetzen(leise ? gewaehlt : null);
  }
  for (const m of zeitMarken) {
    const d = zeitJahr == null ? null : abstand(m.userData.zeit, zeitJahr);
    const nah = d != null && d <= FENSTER_ZEIT;
    m.material.opacity = d == null ? 0.75 : nah ? 1 - d / (FENSTER_ZEIT * 1.5) : 0.25;
    m.scale.setScalar(nah ? 2 - d / FENSTER_ZEIT : 1);
  }
}

// Zeitreise: um die Geburt hell einblenden (mit kurzem Aufleuchten), nach dem Tod langsam verblassen
// Ungeboren und verstorben bleiben die Gesichter gut erkennbar, nur gedämpft; zu Lebzeiten ganz hell wie unter der Maus
const GEDAEMPFT = { o: 0.65, hell: 0.6 };
function lebenslicht(p, j) {
  const geb = p.geburt ?? p.jahrE;
  const ein = Math.min(1, Math.max(0, (j - (geb - 1)) / 1));     // ein Jahr vor der Geburt hell werden
  const aus = j > p.ende ? Math.min(1, (j - p.ende) / 3) : 0;      // in drei Jahren nach dem Tod verblassen
  const licht = ein * (1 - aus);
  // frisch geboren: groß und mit Lichthof, klingt in drei Jahren ab
  const neu = j >= geb - 0.5 && j <= geb + 3 ? Math.min(1, (j - (geb - 0.5)) / 0.5) * (1 - Math.max(0, j - geb) / 3) : 0;
  return { o: GEDAEMPFT.o + (1 - GEDAEMPFT.o) * licht, hell: GEDAEMPFT.hell + (1 - GEDAEMPFT.hell) * licht,
           gross: 1 + 0.06 * licht + 0.45 * neu, hof: neu };
}

// altersgerechte Gesichter: in der Zeitreise das zuletzt aufgenommene Foto bis zum aktuellen Jahr; ohne Zeitreise
// und am Ende (heute) wieder das Hauptbild aus webtrees. Die Kacheln schreibt karten.js nach, sobald die Karte zu sehen ist.
function gesichterAnpassen(j) {
  for (const k of karten) {
    const p = k.p;
    if (!p.gesichter?.length && k.gesichtSrc === p.gesicht) continue;
    const passend = j == null || j >= JETZT - 0.5 ? null : [...(p.gesichter || [])].reverse().find(g => g.jahr <= j);
    const src = passend?.src ?? p.gesicht;
    if (!src || src === k.gesichtSrc) continue;
    k.gesichtSrc = src;
    zeichnen();
  }
}

// Jahre zwischen Regler und einem Eintrag (0, solange der Regler in der Dauer eines Zeitraums liegt)
function abstand(z, j) {
  const bis = z.bis ?? z.jahr;
  return j < z.jahr ? z.jahr - j : j > bis ? j - bis : 0;
}

const panel = new Panel(daten, {
  zuPerson: id => { stoppeAbspielen(); waehle(daten.byId.get(id)); },
  hauptperson: id => setzeHauptperson(daten.byId.get(id)),
  geschlossen: () => { gewaehlt = null; aktualisiereDarstellung(); setzeVersatz(0); },
  breite: w => setzeVersatz(w),
});

function waehle(p, { panelOeffnen = true } = {}) {
  if (!p) return;
  controls.autoRotate = false;
  if (!p.imBild) return setzeHauptperson(p);
  gewaehlt = p;
  aktualisiereDarstellung();
  const vorne = modus.netz ? new THREE.Vector3(0, 0.6, 13) : new THREE.Vector3(p.pos.x * 0.15, p.pos.y * 0.15 + 1.5, 15);
  fliege(p.pos.clone().add(vorne), p.pos.clone());
  if (panelOeffnen) panel.zeige(p);
  document.getElementById('suche').value = '';
}

function setzeHauptperson(p) {
  if (!p) return;
  root = p;
  baue();
  waehle(p);
}

function setzeVersatz(px) {
  merkeKopf();
  zeichnen();
  const el = document.getElementById('panel');
  const r = px > 0 && !el.hidden ? el.getBoundingClientRect() : null;
  if (r && r.height > innerHeight * 0.6 && r.left > innerWidth * 0.3) camera.setViewOffset(innerWidth, innerHeight, r.width / 2, 0, innerWidth, innerHeight);
  else if (r && r.width > innerWidth * 0.9 && r.top > innerHeight * 0.25) camera.setViewOffset(innerWidth, innerHeight, 0, (innerHeight - r.top) / 2, innerWidth, innerHeight);
  else camera.clearViewOffset();
}
// Höhe von Kopf- und Fußleiste als CSS-Variablen: Einblendungen und Zeitgeschehen richten sich danach
const kopfleiste = document.querySelector('.leiste-oben'), fussleiste = document.querySelector('.leiste-unten');
const merkeKopf = () => {
  document.documentElement.style.setProperty('--oben', `${Math.round(kopfleiste.getBoundingClientRect().bottom + 6)}px`);
  document.documentElement.style.setProperty('--leiste', `${Math.round(fussleiste.getBoundingClientRect().height)}px`);
};
merkeKopf();
if (window.ResizeObserver) { const ro = new ResizeObserver(merkeKopf); ro.observe(kopfleiste); ro.observe(fussleiste); }

// Zeitleiste unten: verändert nur Hervorhebung und Einblendungen, nie die Kamera
const regler = document.getElementById('jahr');
regler.min = Math.floor(JAHR_MIN / 50) * 50;
regler.max = JETZT;
{
  const skala = document.querySelector('.skala');
  skala.innerHTML = '';
  for (let j = +regler.min; j <= 2000; j += 50) skala.insertAdjacentHTML('beforeend', `<span style="left:${(j - regler.min) / (JETZT - regler.min) * 100}%">${j}</span>`);
}
const jahrAnzeige = document.getElementById('jahr-anzeige');
const zeitKarte = document.getElementById('zeit-karte');
const lebendAnzeige = document.getElementById('lebend');
const ticker = new Map();   // Schlüssel -> Element, damit Einträge weich ein- und ausblenden

function zeigeTicker(eintraege) {
  // chronologisch: das Neueste unten; Einträge rücken nach oben und verschwinden oben (FLIP-Animation)
  eintraege = [...eintraege].sort((a, b) => a.jahr - b.jahr || (a.key < b.key ? -1 : 1));
  const vorher = new Map([...ticker].map(([k, el]) => [k, el.getBoundingClientRect().top]));
  const schluessel = new Set(eintraege.map(e => e.key));
  const kasten = zeitKarte.getBoundingClientRect();
  for (const [k, el] of ticker) if (!schluessel.has(k)) {
    const r = el.getBoundingClientRect();
    ticker.delete(k);
    Object.assign(el.style, { position: 'absolute', left: '0', right: '0', top: `${r.top - kasten.top}px` });
    el.classList.add('weg');
    requestAnimationFrame(() => { el.style.opacity = 0; el.style.transform = 'translateY(-40px)'; });
    setTimeout(() => el.remove(), 650);
  }
  const neu = [];
  eintraege.forEach((e, i) => {
    let el = ticker.get(e.key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'zk ' + e.klasse;
      el.innerHTML = e.html;
      el.style.opacity = 0;
      zeitKarte.appendChild(el);
      ticker.set(e.key, el);
      neu.push([el, e.o]);
    }
    el.style.order = i;
    el.dataset.o = e.o;
  });
  for (const [k, el] of ticker) {
    const alt = vorher.get(k);
    if (alt == null) { el.style.transition = 'none'; el.style.transform = 'translateY(40px)'; continue; }
    const d = alt - el.getBoundingClientRect().top;
    if (d) { el.style.transition = 'none'; el.style.transform = `translateY(${d}px)`; }
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const el of ticker.values()) { el.style.transition = ''; el.style.transform = ''; el.style.opacity = el.dataset.o; }
  }));
}

// Abspann: während der Zeitreise rollen die Ereignisse wie im Kino von unten nach oben und laufen oben aus dem Bild
let abspann = null;
function abspannStart() {
  if (abspann) return;   // nach dem Anhalten geht der Abspann einfach weiter
  for (const el of ticker.values()) el.remove();
  ticker.clear();
  zeitKarte.querySelectorAll('.zk').forEach(el => el.remove());
  zeitKarte.classList.add('rollen');
  zeitKarte.hidden = false;
  abspann = { zeilen: [], gesehen: new Set() };
}
function abspannEnde() {
  if (!abspann) return;
  for (const z of abspann.zeilen) z.el.remove();
  abspann = null;
  zeitKarte.classList.remove('rollen');
}
function abspannNeu(j, familie, zeitg) {
  if (!abspann) abspannStart();
  const hoehe = zeitKarte.clientHeight;
  // neu ist, was in diesem Jahr beginnt (Zeitgeschehen) bzw. geschieht (Familie)
  const neu = [...zeitg.filter(e => e.jahr <= j), ...familie.filter(e => e.jahr <= j)].filter(e => !abspann.gesehen.has(e.key))
    .sort((a, b) => a.jahr - b.jahr);
  for (const e of neu) {
    abspann.gesehen.add(e.key);
    const el = document.createElement('div');
    el.className = 'zk ' + e.klasse;
    el.innerHTML = e.html;
    zeitKarte.appendChild(el);
    const letzte = abspann.zeilen[abspann.zeilen.length - 1];
    const y = Math.max(hoehe, letzte ? letzte.y + letzte.h + 10 : hoehe);
    const z = { el, y, h: el.offsetHeight };
    el.style.transform = `translateY(${y}px)`;
    abspann.zeilen.push(z);
  }
}
function abspannRollen(dt) {
  if (!abspann || !abspielen) return;
  const hoehe = zeitKarte.clientHeight, letzte = abspann.zeilen[abspann.zeilen.length - 1];
  const rueckstand = letzte ? Math.max(0, letzte.y + letzte.h - hoehe) : 0;
  const tempoPx = 28 + rueckstand * 0.25;   // gleichmäßig, bei vielen wartenden Einträgen etwas schneller
  for (const z of abspann.zeilen) { z.y -= tempoPx * dt; z.el.style.transform = `translateY(${z.y}px)`; }
  while (abspann.zeilen.length && abspann.zeilen[0].y + abspann.zeilen[0].h < -20) abspann.zeilen.shift().el.remove();
}

const deckkraft = (d, fenster) => d <= 1 ? 1 : Math.max(0.25, 1 - (d - 1) / fenster);
const FAMILIE = { BIRT: t('Geburt'), DEAT: t('Tod'), MARR: t('Hochzeit'), EMIG: t('Auswanderung'), IMMI: t('Einwanderung') };

// Rechte Karte in der Zeitreise: Wer zuletzt geboren wurde, kommt dran – aber jede Person darf ein paar ihrer Bilder
// zeigen (bis zu drei, je 2,6 s), bevor die nächste Geburt übernimmt. Wartende kommen der Reihe nach; liegt eine
// wartende Person mehr als ZR_JAHRE hinter dem laufenden Jahr, wird sie übersprungen, damit der Bezug zum Jahr bleibt.
const ZR_BILD_MS = 2600, ZR_JAHRE = 6;
let zrGezeigt = null, zrSeit = 0, zrWarte = [];
const zrBilder = p => p.bilder?.length || (p.gesicht ? 1 : 0);
const zrGeburt = p => p.geburt ?? p.jahrE;
function zeitreiseKarte(neueste, jGenau, sofort = false) {
  const jetzt = performance.now();
  if (neueste && neueste !== zrGezeigt && !zrWarte.includes(neueste)) zrWarte.push(neueste);
  if (sofort || !zrGezeigt || !abspielen) {
    if (neueste) { zrGezeigt = neueste; zrWarte = []; zrSeit = jetzt; }
  } else if (zrWarte.length) {
    const n = zrBilder(zrGezeigt);
    const genug = jetzt - zrSeit >= (n ? Math.min(3, n) * ZR_BILD_MS : 1500);
    const zuAlt = jGenau - zrGeburt(zrGezeigt) > ZR_JAHRE && zrWarte.some(w => jGenau - zrGeburt(w) <= ZR_JAHRE);
    if (genug || zuAlt) {
      while (zrWarte.length > 1 && jGenau - zrGeburt(zrWarte[0]) > ZR_JAHRE) zrWarte.shift();
      zrGezeigt = zrWarte.shift();
      zrSeit = jetzt;
    }
  }
  if (zrGezeigt) panel.zeitreise(zrGezeigt, jGenau);
}

function setzeJahr(jGenau) {
  zeitJahr = jGenau;
  regler.value = jGenau;
  const j = Math.floor(jGenau);
  if (j === letztesJahr) {   // Einblendungen nur bei neuem Jahr, die Karten bei jedem Schritt
    if (abspielen && zrWarte.length) zeitreiseKarte(null, jGenau);   // Wartende dürfen auch mitten im Jahr an die Reihe kommen
    return aktualisiereDarstellung();
  }
  letztesJahr = j;
  jahrAnzeige.textContent = j;
  // rechts: die zuletzt geborene Person, die noch lebt
  const geboren = imBild.filter(p => (p.geburt ?? p.jahrE) <= j && p.ende >= j)
    .sort((a, b) => (b.geburt ?? b.jahrE) - (a.geburt ?? a.jahrE) || a.geschaetzt - b.geschaetzt || b.bilder.length - a.bilder.length);
  if (geboren.length) zeitreiseKarte(geboren[0], jGenau);
  folgeZiel = berechneFolgeZiel(j, geboren[0]);
  gesichterAnpassen(j);
  const lebend = imBild.filter(p => p.jahrE <= j && p.ende >= j);
  lebendAnzeige.textContent = t(lebend.length === 1 ? '{n} Person lebt in diesem Jahr' : '{n} Personen leben in diesem Jahr', { n: lebend.length });
  const zg = zeitAnsicht.map(z => ({ z, d: abstand(z, j) })).filter(x => x.d <= FENSTER_ZEIT)
    .sort((a, b) => a.d - b.d).slice(0, 3)
    .map(({ z, d }) => ({ key: 'z' + z.jahr + z.titel, jahr: z.jahr, klasse: 'zeitgeschehen', o: deckkraft(d, FENSTER_ZEIT),
      html: `<span class="zk-jahr">${z.bis ? `${z.jahr}–${z.bis}` : z.jahr}</span><b>${z.titel}</b><p>${z.text}</p>` }));
  const fam = [];
  for (const p of imBild) for (const e of p.ereignisse) {
    if (!FAMILIE[e.art] || e.jahr == null || Math.abs(e.jahr - j) > FENSTER_FAMILIE) continue;
    if (e.art === 'MARR' && p.geschlecht === 'F' && p.partnerP.some(x => x.imBild)) continue;   // Hochzeit nur einmal zeigen
    fam.push({ p, e, d: Math.abs(e.jahr - j) });
  }
  const fk = fam.sort((a, b) => a.d - b.d).slice(0, 3).map(({ p, e, d }) => ({
    key: 'f' + p.id + e.art + e.jahr, jahr: e.jahr, klasse: 'familie', o: deckkraft(d, FENSTER_FAMILIE),
    html: `<span class="zk-jahr">${e.jahr}</span><b>${FAMILIE[e.art]}: ${p.name.voll}</b>${e.ort ? `<p>${e.ort.name.split(',')[0]}</p>` : ''}` }));
  if (abspielen) abspannNeu(j, fk, zg); else { abspannEnde(); zeigeTicker([...fk, ...zg]); }
  if (abspielen && geraeuscheAn) klingen(j);
  zeitKarte.hidden = false;
  aktualisiereDarstellung();
}
regler.step = 'any';
regler.addEventListener('input', () => { stoppeAbspielen(); setzeJahr(+regler.value); });

// Tempo in Jahren pro Minute (merkt sich der Browser)
const tempoFeld = document.getElementById('tempo');
try { const t = localStorage.getItem('lb-tempo'); if (t) tempoFeld.value = t; } catch (e) { /* ohne Speicher */ }
tempoFeld.addEventListener('input', () => {
  try { localStorage.setItem('lb-tempo', tempoFeld.value); } catch (e) { /* ohne Speicher */ }
  // wer das Tempo selbst einstellt, will es behalten: Kopplung ans Lied aus, das Lied läuft weiter (in Schleife)
  if (ton.liedTempo) { ton.liedTempo = false; tonSpeichern(); zeigeTon(); }
  if (abspielen?.lied) { abspielen.lied = false; abspielen.j = zeitJahr; abspielen.letzt = performance.now(); musik.loop = true; }
});
const tempo = () => Math.min(1200, Math.max(1, +tempoFeld.value || 60));

// Bildrate für alles, was ohne Zutun läuft (Zeitreise, Drehen, Netz-Simulation, 2,5D-Porträt); merkt sich der Browser
const bildrateWahl = document.getElementById('bildrate');
let bildrate = 30;
if (bildrateWahl) {
  try { const w = localStorage.getItem('lb-bildrate'); if (w && [...bildrateWahl.options].some(o => o.value === w)) bildrateWahl.value = w; } catch (e) { /* Vorgabe */ }
  const setzen = () => { bildrate = bildrateWahl.value === 'max' ? 0 : Number(bildrateWahl.value); bildrateTiefe(bildrate); };
  setzen();
  bildrateWahl.addEventListener('change', () => {
    setzen();
    try { localStorage.setItem('lb-bildrate', bildrateWahl.value); } catch (e) { /* ohne Speicher */ }
  });
} else bildrateTiefe(bildrate);

let abspielen = null;
function stoppeAbspielen() {
  if (!abspielen) return;
  cancelAnimationFrame(abspielen.raf);
  abspielen = null;
  musik.pause();
  klang.stille();
  document.getElementById('abspielen').textContent = t('▶ Zeitreise');
}
document.getElementById('abspielen').addEventListener('click', async e => {
  if (abspielen) return stoppeAbspielen();
  if (geraeuscheAn) klang.bereit();
  e.target.textContent = t('❚❚ Anhalten');
  const geburten = imBild.map(p => p.geburt ?? p.jahrE);
  const mitLied = liedAn && musikQuelle;
  if (mitLied && !musik.duration) await new Promise(ok => musik.addEventListener('loadedmetadata', ok, { once: true }));
  abspannStart();
  if (mitLied && ton.liedTempo) {
    // Das Lied beginnt kurz vor der ersten Geburt und endet kurz nach der letzten; daraus ergibt sich das Tempo
    const von = Math.min(...geburten) - 3, bis = Math.max(...geburten) + 2, D = musik.duration;
    tempoFeld.value = Math.round((bis - von) / (D / 60));
    const ab = zeitJahr != null && zeitJahr > von && zeitJahr < bis - 0.5 ? zeitJahr : von;
    musik.loop = false;
    musik.currentTime = (ab - von) / (bis - von) * D;
    abspielen = { lied: true, von, bis, D, j: ab, letzt: performance.now() };
  } else {
    const start = Math.min(...geburten) - 5;
    abspielen = { lied: false, j: zeitJahr == null || zeitJahr >= JETZT ? start : zeitJahr, letzt: performance.now() };
    if (mitLied) { musik.loop = true; if (musik.ended) musik.currentTime = 0; }
  }
  if (mitLied) { try { await musik.play(); } catch (err) { stoppeAbspielen(); return; } }
  const schritt = now => {
    const a = abspielen;
    if (!a) return;
    if (bildrate && now - (a.bild ?? 0) < 1000 / bildrate - 2) { a.raf = requestAnimationFrame(schritt); return; }
    a.bild = now;
    if (a.lied) {
      a.j = a.von + (a.bis - a.von) * musik.currentTime / a.D;
      if (musik.ended || a.j >= a.bis) { setzeJahr(a.bis); return stoppeAbspielen(); }
    } else {
      a.j += tempo() / 60 * Math.min(0.25, (now - a.letzt) / 1000);
      a.letzt = now;
      if (a.j >= JETZT) { setzeJahr(JETZT); return stoppeAbspielen(); }
    }
    setzeJahr(a.j);
    a.raf = requestAnimationFrame(schritt);
  };
  abspielen.raf = requestAnimationFrame(schritt);
});

// --- Kamera folgt: während der Zeitreise wandert der Blick zu den gerade lebenden Personen --------------------------
let kameraFolgt = false, folgeZiel = null, nutzerZieht = false, zoomPause = 0;
try { kameraFolgt = localStorage.getItem('lb-kamera') === '1'; } catch (e) { /* aus */ }
const kameraKnopf = document.getElementById('kamera');
kameraKnopf.setAttribute('aria-pressed', kameraFolgt);
kameraKnopf.addEventListener('click', () => {
  kameraFolgt = !kameraFolgt;
  kameraKnopf.setAttribute('aria-pressed', kameraFolgt);
  try { localStorage.setItem('lb-kamera', kameraFolgt ? '1' : '0'); } catch (e) { /* ohne Speicher */ }
  if (kameraFolgt && zeitJahr != null) folgeZiel = berechneFolgeZiel(Math.floor(zeitJahr), panel.zrPerson);
});
function berechneFolgeZiel(j, aktuell) {
  let menge = imBild.filter(p => (p.geburt ?? p.jahrE) <= j + 1 && p.ende >= j);
  if (!menge.length) menge = imBild.filter(p => Math.abs(p.jahrE - j) < 30);
  if (!menge.length) return { ziel: modus.netz ? new THREE.Vector3() : new THREE.Vector3(0, 0, zVon(j)), d: 30 };
  const ziel = new THREE.Vector3();
  for (const p of menge) ziel.add(p.pos);
  ziel.divideScalar(menge.length);
  if (aktuell?.pos) ziel.lerp(aktuell.pos, 0.35);   // die zuletzt geborene Person etwas in die Mitte rücken
  let r = 0;
  for (const p of menge) r = Math.max(r, p.pos.distanceTo(ziel));
  const hochkant = Math.min(1, camera.aspect / 1.2);   // im Hochformat weiter weg, sonst laufen die Seiten aus dem Bild
  return { ziel, d: Math.min(90, Math.max(26, r * 1.7 + 10)) / hochkant };
}
// weich nachführen: Blickpunkt mit etwa 4 s, Abstand mit etwa 6 s Zeitkonstante (unabhängig von der Bildrate)
function kameraNachfuehren(dt) {
  if (!kameraFolgt || zeitJahr == null || !folgeZiel || flug || nutzerZieht) return false;
  const versatz = camera.position.clone().sub(controls.target), laenge = versatz.length();   // Blickwinkel bleibt, wie eingestellt
  controls.target.lerp(folgeZiel.ziel, 1 - Math.exp(-dt / 4));
  if (performance.now() > zoomPause) versatz.setLength(laenge + (folgeZiel.d - laenge) * (1 - Math.exp(-dt / 6)));
  const vorher = camera.position.clone();
  camera.position.copy(controls.target).add(versatz);
  return camera.position.distanceToSquared(vorher) > 1e-6;   // die letzten Millimeter zählen nicht als Bewegung
}
renderer.domElement.addEventListener('pointerdown', () => { nutzerZieht = true; controls.autoRotate = false; });
addEventListener('pointerup', () => { nutzerZieht = false; });
renderer.domElement.addEventListener('wheel', () => { zoomPause = performance.now() + 4000; }, { passive: true });

// --- Ton: Einstellungen (Menü „♪ Ton“), im Browser gemerkt -------------------------------------------------------
const ARTEN = [
  ['geburt', t('Geburt (Babylachen)')], ['hochzeit', t('Hochzeit (Glocken, Lachen)')], ['tod', t('Tod (tiefe Glocke)')],
  ['krieg', t('Krieg vor 1900 (Kanonen)')], ['krieg1', t('Erster Weltkrieg (MG)')], ['krieg2', t('Zweiter Weltkrieg (Stukas)')],
  ['luftkrieg', t('Luftalarm, Bomben')], ['gefecht', t('Schießereien')], ['totenglocke', t('Totenglocken im Krieg')], ['marsch', t('Marschtritte')],
  ['not', t('Hunger und Not')], ['kaelte', t('Kälte')], ['wasser', t('Wasser, Auswanderung')], ['flut', t('Flut')],
  ['zug', t('Eisenbahn')], ['jubel', t('Jubel')], ['unruhe', t('Unruhe')], ['glocken', t('Glockengeläut')], ['strom', t('Strom')],
];
const ton = { lied: false, liedTempo: true, geraeusche: true, volLied: 85, volGeraeusche: 50, arten: Object.fromEntries(ARTEN.map(([k]) => [k, true])) };
try {
  const gespeichert = JSON.parse(localStorage.getItem('lb-ton') || '{}');
  if (!localStorage.getItem('lb-ton')) {   // Einstellungen der ersten Fassung übernehmen
    if (localStorage.getItem('lb-lied')) gespeichert.lied = localStorage.getItem('lb-lied') === '1';
    if (localStorage.getItem('lb-geraeusche')) gespeichert.geraeusche = localStorage.getItem('lb-geraeusche') === '1';
  }
  Object.assign(ton, gespeichert, { arten: { ...ton.arten, ...(gespeichert.arten || {}) } });
} catch (e) { /* Vorgaben */ }
const tonSpeichern = () => { try { localStorage.setItem('lb-ton', JSON.stringify(ton)); } catch (e) { /* ohne Speicher */ } };
let geraeuscheAn = ton.geraeusche, liedAn = ton.lied;

// Es klingt immer nur ein Geräusch (klang.js): Familienklänge zuerst und nacheinander, dann das Zeitgeschehen als kurze Szene
function klingen(j) {
  // Familienklänge nur aus der hervorgehobenen direkten Linie
  let n = 0, hochzeit = false;
  for (const p of direkteLinie()) {
    if (n > 3) break;
    if (p.geburt === j) { if (ton.arten.geburt) { klang.familie('geburt'); n++; } }
    else if (p.tod === j) { if (ton.arten.tod) { klang.familie('tod'); n++; } }
    else if (ton.arten.hochzeit && !hochzeit && p.ereignisse.some(e => e.art === 'MARR' && e.jahr === j)) { hochzeit = true; klang.familie('hochzeit'); n++; }
  }
  // Zeitgeschehen, das gerade läuft (bis ein Jahr nach seinem Ende)
  const ziele = {};
  for (const z of klangAnsicht) {
    if (j < z.jahr || j > (z.klangBis ?? z.bis ?? z.jahr) + 1) continue;
    for (const art of z.klang.split('+')) if (ton.arten[art]) ziele[art] = 1;
  }
  klang.stimmung(ziele);
  // Aufnahmen für die Ereignisse der nächsten Jahrzehnte schon holen, damit sie beim Einsatz bereitliegen
  const bald = new Set();
  for (const z of klangAnsicht) if (z.jahr > j && z.jahr <= j + 15) for (const art of z.klang.split('+')) if (ton.arten[art]) bald.add(art);
  if (bald.size) klang.vorladen([...bald]);
}

// --- Lied: eigene Datei (media/musik.mp3 o. ä. oder im Menü gewählt, im Browser gespeichert) --------------------
const musik = new Audio();
musik.preload = 'auto';
musik.volume = ton.volLied / 100;
klang.lautstaerke(ton.volGeraeusche / 100);
let musikQuelle = null;
const dateiWahl = document.getElementById('lied-datei');

function speicher() {
  return new Promise((ok, fehl) => {
    const r = indexedDB.open('lebensbuehne', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('dateien');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehl(r.error);
  });
}
async function liedLaden() {
  const LB = window.LEBENSBUEHNE;
  if (LB?.musik) return { url: LB.musik, name: LB.musikName || 'Lied' };   // im webtrees-Modul: Lied auf dem Server
  if (!LB) {
    for (const n of ['media/musik.mp3', 'media/musik.m4a', 'media/musik.ogg', 'media/musik.opus', 'media/musik.wav']) {
      try { if ((await fetch(n, { method: 'HEAD' })).ok) return { url: n, name: n.split('/').pop() }; } catch (e) { /* weiter */ }
    }
  }
  try {
    const db = await speicher();
    const blob = await new Promise(ok => { const r = db.transaction('dateien').objectStore('dateien').get('lied'); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
    if (blob) return { url: URL.createObjectURL(blob), name: blob.name || 'eigene Datei' };
  } catch (e) { /* ohne Speicher */ }
  return null;
}
// mitgelieferte freie Lieder (resources/musik/lieder.json: datei, titel, urheber, lizenz, lizenzUrl, quelle)
async function liederLaden() {
  const LB = window.LEBENSBUEHNE;
  if (LB) return LB.lieder || [];
  try {
    const r = await fetch('musik/lieder.json', { cache: 'no-store' });
    if (r.ok) return (await r.json()).map(l => ({ ...l, url: 'musik/' + encodeURIComponent(l.datei) }));
  } catch (e) { /* keine */ }
  return [];
}
let eigenesLied = null, liederMit = [];
const liedTitel = l => (SPRACHE_EN && l.titel_en) || l.titel;
const liedAuswahl = document.getElementById('lied-wahl');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function baueLiedAuswahl() {
  liedAuswahl.innerHTML = `<option value="eigen">${eigenesLied ? esc(t('Eigenes Lied: {name}', { name: eigenesLied.name })) : esc(t('Eigenes Lied (keins gewählt)'))}</option>`
    + liederMit.map(l => `<option value="mit:${esc(l.datei)}">${esc(liedTitel(l))}</option>`).join('');
  liedAuswahl.hidden = !liederMit.length;
}
// gewähltes Lied: eigenes, sonst das erste mitgelieferte
function waehleLied() {
  let wahl = ton.liedWahl;
  if (!wahl || (wahl === 'eigen' && !eigenesLied) || (wahl.startsWith('mit:') && !liederMit.some(l => 'mit:' + l.datei === wahl)))
    wahl = eigenesLied ? 'eigen' : liederMit.length ? 'mit:' + liederMit[0].datei : 'eigen';
  liedAuswahl.value = wahl;
  const mit = liederMit.find(l => 'mit:' + l.datei === wahl);
  setzeLied(mit ? { url: mit.url, name: liedTitel(mit), lied: mit } : eigenesLied);
}
function setzeLied(q) {
  musikQuelle = q;
  if (q) musik.src = q.url;
  document.getElementById('lied-name').textContent = q ? (q.lied ? '' : q.name) : t('Kein Lied – eigene Datei über „Datei wählen …“ einbinden');
  const l = q?.lied;
  document.getElementById('lied-quelle').innerHTML = l
    ? `${esc(l.urheber)} · <a href="${esc(l.lizenzUrl)}" target="_blank" rel="noopener">${esc((SPRACHE_EN && l.lizenz_en) || l.lizenz)}</a> · <a href="${esc(l.quelle)}" target="_blank" rel="noopener">${esc(t('Quelle'))}</a>` : '';
  zeigeTon();
}
liedAuswahl.addEventListener('change', () => {
  ton.liedWahl = liedAuswahl.value; tonSpeichern();
  if (abspielen) stoppeAbspielen();
  waehleLied();
});
dateiWahl.addEventListener('change', async () => {
  const datei = dateiWahl.files[0];
  if (!datei) return;
  try {
    const db = await speicher();
    db.transaction('dateien', 'readwrite').objectStore('dateien').put(datei, 'lied');
  } catch (e) { /* dann nur für diese Sitzung */ }
  liedAn = ton.lied = true;
  ton.liedWahl = 'eigen'; tonSpeichern();
  eigenesLied = { url: URL.createObjectURL(datei), name: datei.name };
  if (abspielen) stoppeAbspielen();
  baueLiedAuswahl();
  waehleLied();
});

// Menü aufbauen und bedienen
const tonKnopf = document.getElementById('ton'), tonMenue = document.getElementById('ton-menue');
document.getElementById('klang-arten').innerHTML = ARTEN.map(([k, name]) =>
  `<label><input type="checkbox" data-art="${k}"${ton.arten[k] ? ' checked' : ''}> ${name}</label>`).join('');
function zeigeTon() {
  document.getElementById('lied-an').checked = liedAn && !!musikQuelle;
  document.getElementById('lied-an').disabled = !musikQuelle;
  document.getElementById('geraeusche-an').checked = geraeuscheAn;
  document.getElementById('vol-lied').value = ton.volLied;
  document.getElementById('lied-tempo').checked = ton.liedTempo;
  document.getElementById('vol-geraeusche').value = ton.volGeraeusche;
  document.getElementById('klang-arten').disabled = !geraeuscheAn;
  tonKnopf.classList.toggle('an', (liedAn && !!musikQuelle) || geraeuscheAn);
}
tonKnopf.addEventListener('click', ev => {
  ev.stopPropagation();
  tonMenue.hidden = !tonMenue.hidden;
  tonKnopf.setAttribute('aria-expanded', !tonMenue.hidden);
});
addEventListener('click', ev => { if (!tonMenue.hidden && !tonMenue.contains(ev.target) && ev.target !== tonKnopf) { tonMenue.hidden = true; tonKnopf.setAttribute('aria-expanded', false); } });
document.getElementById('lied-waehlen').addEventListener('click', () => dateiWahl.click());
document.getElementById('lied-an').addEventListener('change', ev => {
  liedAn = ton.lied = ev.target.checked; tonSpeichern();
  if (abspielen) stoppeAbspielen();
  zeigeTon();
});
document.getElementById('geraeusche-an').addEventListener('change', ev => {
  geraeuscheAn = ton.geraeusche = ev.target.checked; tonSpeichern();
  if (geraeuscheAn) { klang.bereit(); klang.lautstaerke(ton.volGeraeusche / 100); if (abspielen && zeitJahr != null) klingen(Math.floor(zeitJahr)); }
  else klang.stille();
  zeigeTon();
});
document.getElementById('lied-tempo').addEventListener('change', ev => { ton.liedTempo = ev.target.checked; tonSpeichern(); if (abspielen) stoppeAbspielen(); });
document.getElementById('vol-lied').addEventListener('input', ev => { ton.volLied = +ev.target.value; musik.volume = ton.volLied / 100; tonSpeichern(); });
document.getElementById('vol-geraeusche').addEventListener('input', ev => { ton.volGeraeusche = +ev.target.value; klang.lautstaerke(ton.volGeraeusche / 100); tonSpeichern(); });
document.getElementById('klang-arten').addEventListener('change', ev => {
  const art = ev.target.dataset.art;
  if (!art) return;
  ton.arten[art] = ev.target.checked; tonSpeichern();
  if (abspielen && geraeuscheAn && zeitJahr != null) klingen(Math.floor(zeitJahr));
});
// Probeklang beim Einschalten einer Art, damit man hört, was gemeint ist
document.getElementById('klang-arten').addEventListener('change', ev => {
  if (!ev.target.checked || abspielen || !geraeuscheAn) return;
  klang.bereit(); klang.lautstaerke(ton.volGeraeusche / 100);
  klang.probe(ev.target.dataset.art);
});
zeigeTon();
Promise.all([liedLaden(), liederLaden()]).then(([eigen, mit]) => {
  eigenesLied = eigen;
  liederMit = mit;
  baueLiedAuswahl();
  waehleLied();
});
klang.ladeAufnahmen();

// Menü (☰) auf kleinen Bildschirmen: Suche, Überblick und Ansicht; schließt nach jeder Wahl
const menueKnopf = document.getElementById('menue'), mehr = document.getElementById('mehr');
const kompakt = matchMedia('(max-width: 1199px), (max-height: 600px)');
function menue(offen) {
  document.body.classList.toggle('menue-offen', offen);
  menueKnopf.setAttribute('aria-expanded', offen);
}
menueKnopf.addEventListener('click', ev => { ev.stopPropagation(); menue(!document.body.classList.contains('menue-offen')); });
addEventListener('click', ev => {
  if (document.body.classList.contains('menue-offen') && !mehr.contains(ev.target) && ev.target !== menueKnopf && ev.target.id !== 'hauptperson') menue(false);
});
mehr.addEventListener('click', ev => { if (ev.target.closest('button')) menue(false); });

// Kaffee-Knopf: kleiner Hinweis mit Link zur Spende (Buy Me a Coffee)
const spendeKnopf = document.getElementById('spende-knopf'), spende = document.getElementById('spende');
spendeKnopf.addEventListener('click', ev => {
  ev.stopPropagation();
  menue(false);
  spende.hidden = !spende.hidden;
  spendeKnopf.setAttribute('aria-expanded', !spende.hidden);
});
addEventListener('click', ev => {
  if (!spende.hidden && !spende.contains(ev.target) && !spendeKnopf.contains(ev.target)) { spende.hidden = true; spendeKnopf.setAttribute('aria-expanded', false); }
});

document.getElementById('ansicht-ueberblick').addEventListener('click', () => {
  stoppeAbspielen(); zeitJahr = null; letztesJahr = null; jahrAnzeige.textContent = '–'; lebendAnzeige.textContent = '';
  gesichterAnpassen(null);
  zeigeTicker([]); setTimeout(() => { if (zeitJahr == null) zeitKarte.hidden = true; }, 500);
  panel.schliesse(); aktualisiereDarstellung(); ueberblick();
});
// Klick auf den Namen der Hauptperson: die Suche wählt dann eine neue Hauptperson
const suche = document.getElementById('suche');
let hpWahl = false;
function hpWahlEnde() { hpWahl = false; suche.placeholder = t('Person suchen …'); suche.classList.remove('hp-wahl'); }
document.getElementById('hauptperson').addEventListener('click', () => {
  hpWahl = true;
  if (kompakt.matches) menue(true);   // die Suche steckt dann im Menü
  suche.value = '';
  suche.placeholder = t('Neue Hauptperson: Namen eingeben …');
  suche.classList.add('hp-wahl');
  suche.focus();
});
suche.addEventListener('blur', () => setTimeout(() => { if (!suche.value) hpWahlEnde(); }, 300));
suche.addEventListener('keydown', ev => { if (ev.key === 'Escape') { suche.value = ''; hpWahlEnde(); suche.blur(); } });
document.getElementById('modus-partner').addEventListener('click', () => {
  if (modus.netz) modus.netz = false; else modus.partner = !modus.partner;   // aus dem Netz zurück in den Fächer
  panel.schliesse();
  baue();
  ueberblick();
});
for (const [knopf, schluessel, anderer] of [['modus-vorfahren', 'vorfahren', 'nachkommen'], ['modus-nachkommen', 'nachkommen', 'vorfahren']])
  document.getElementById(knopf).addEventListener('click', () => {
    if (modus.netz) modus.netz = false;   // aus dem Netz zurück in den Fächer, mit der bisherigen Auswahl
    else modus[schluessel] = !modus[schluessel];
    if (!modus.vorfahren && !modus.nachkommen && !modus.geschwister) modus[anderer] = true;   // eine Richtung bleibt immer an
    panel.schliesse();
    baue();
    ueberblick();
  });

// Geschwister (mit Halbgeschwistern, Nichten, Neffen; mit „Partner“ auch deren Partner), kombinierbar mit den anderen Ansichten
document.getElementById('modus-geschwister')?.addEventListener('click', () => {
  if (modus.netz) { modus.netz = false; modus.geschwister = true; }   // aus dem Netz in den Fächer mit Geschwistern
  else modus.geschwister = !modus.geschwister;
  if (!modus.vorfahren && !modus.nachkommen && !modus.geschwister) modus.vorfahren = true;
  panel.schliesse();
  baue();
  ueberblick();
});

// Netz: alle Verwandten frei angeordnet, Linien zu Eltern, Kindern und Partnern (wie die Ansicht „Lineage“)
document.getElementById('modus-netz').addEventListener('click', () => {
  stoppeAbspielen();
  modus.netz = !modus.netz;
  panel.schliesse();
  baue();
  ueberblick();
});
generationenWahl.addEventListener('change', () => {
  generationen = generationenWahl.value === 'alle' ? Infinity : Number(generationenWahl.value);
  try { localStorage.setItem('lb-generationen', generationenWahl.value); } catch (e) { /* ohne Speicher */ }
  if (modus.netz) return;
  stoppeAbspielen();
  panel.schliesse();
  baue();
  ueberblick();
});
netzTiefeWahl.addEventListener('change', () => {
  netzTiefe = netzTiefeWahl.value === 'alle' ? Infinity : Number(netzTiefeWahl.value);
  try { localStorage.setItem('lb-netztiefe', netzTiefeWahl.value); } catch (e) { /* ohne Speicher */ }
  if (!modus.netz) return;
  stoppeAbspielen();
  panel.schliesse();
  baue();
  ueberblick();
});

// Weltgeschehen ein/aus: allgemeine Ereignisse (Welt, Europa) im Lauftext, an den Zeitmarken und in der Einblendung
const weltKnopf = document.getElementById('weltgeschehen');
weltKnopf.setAttribute('aria-pressed', mitWelt);
weltKnopf.addEventListener('click', () => {
  mitWelt = !mitWelt;
  weltKnopf.setAttribute('aria-pressed', mitWelt);
  try { localStorage.setItem('lb-welt', mitWelt ? '1' : '0'); } catch (e) { /* ohne Speicher */ }
  weltgeschehenZeigen(mitWelt);
  zeitAnsicht = zeitFuerAnsicht(imBild, zeit);
  baueZeitMarken();
});

// Suche über den ganzen Stammbaum; wer nicht in der Ansicht ist, wird Hauptperson
const liste = document.getElementById('namen');
for (const p of [...personen].sort((a, b) => a.name.voll.localeCompare(b.name.voll, 'de')))
  liste.insertAdjacentHTML('beforeend', `<option value="${p.name.voll} (${jahreKurz(p)})">`);
document.getElementById('suche').addEventListener('change', e => {
  const v = e.target.value;
  const t = v.toLowerCase().trim();
  const p = personen.find(x => `${x.name.voll} (${jahreKurz(x)})` === v) ||
            personen.find(x => x.name.voll.toLowerCase() === t) ||
            personen.find(x => x.name.voll.toLowerCase().startsWith(t)) ||
            personen.find(x => x.name.voll.toLowerCase().includes(t));
  if (!p) return;
  if (hpWahl) { hpWahlEnde(); setzeHauptperson(p); } else waehle(p);
  suche.blur();
  menue(false);
});

// --- Maus: Hover und Klick -------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const maus = new THREE.Vector2();
const tip = document.getElementById('tip');
let runter = null;

function treffer(ev) {
  maus.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(maus, camera);
  // Karten (Instanzen im Atlas) rechnet karten.js selbst, die Zeitmarken der Raycaster; es gilt das Nächste
  const karte = stapel.treffer(maus.x, maus.y, camera);
  const marke = ray.intersectObjects(zeitMarken, false).find(h => h.object.material.opacity > 0.2);
  if (marke && (!karte || marke.distance < karte.abstand)) return marke.object;
  return karte ? karte.karte : null;
}

renderer.domElement.addEventListener('pointermove', ev => {
  const o = treffer(ev);
  const vorher = hover;
  hover = o;
  if (vorher !== o) aktualisiereDarstellung();
  renderer.domElement.style.cursor = o ? 'pointer' : 'grab';
  if (!o) { tip.hidden = true; return; }
  const p = o.p, z = o.userData?.zeit;
  tip.innerHTML = p ? `<b>${p.name.voll}</b><span>${jahreKurz(p)} · ${verwandtschaft(p)}</span>`
    : `<b>${z.titel}</b><span>${z.bis ? `${z.jahr}–${z.bis}` : z.jahr} · ${t('Zeitgeschehen')}</span>`;
  tip.style.left = Math.min(ev.clientX + 16, innerWidth - 300) + 'px';
  tip.style.top = ev.clientY + 14 + 'px';
  tip.hidden = false;
});
// Maus verlässt die Bühne (etwa in die Einblendung): Namensschild weg, sonst bliebe es über deren Bedienelementen stehen
renderer.domElement.addEventListener('pointerleave', () => {
  tip.hidden = true;
  if (hover) { hover = null; aktualisiereDarstellung(); }
});
renderer.domElement.addEventListener('pointerdown', ev => { runter = { x: ev.clientX, y: ev.clientY }; flug = null; });
renderer.domElement.addEventListener('dblclick', ev => {
  const o = treffer(ev);
  if (o?.p && o.p !== root) { stoppeAbspielen(); setzeHauptperson(o.p); }
});
renderer.domElement.addEventListener('pointerup', ev => {
  if (!runter || Math.hypot(ev.clientX - runter.x, ev.clientY - runter.y) > 5) return;
  const o = treffer(ev);
  if (o?.p) { stoppeAbspielen(); waehle(o.p); }
  else if (o?.userData?.zeit) { stoppeAbspielen(); setzeJahr(o.userData.zeit.jahr); }
});

addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && !ev.defaultPrevented) panel.schliesse();
});
// nach verlorenem WebGL-Kontext (vor allem auf Handys) die Karten neu aufbauen: die Atlanten liegen nur auf der Grafikkarte
renderer.domElement.addEventListener('webglcontextrestored', () => baue());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  merkeKopf();
  setzeVersatz(panel.offen ? panel.breite() : 0);
  zeichnen();
});

// --- Start und Schleife --------------------------------------------------------------------------------
baue();
camera.position.set(-40, 60, 90);
controls.target.set(0, 0, zVon(1880));
ueberblick();
let letzterRahmen = null, letztesBild = 0;
const glatt = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Gezeichnet wird nur, wenn sich etwas bewegt oder ändert; im Leerlauf hat die Grafikkarte Ruhe. Was nicht von Hand
// gesteuert wird (Zeitreise, Drehen, Netz-Simulation), läuft mit der eingestellten Bildrate.
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, (now - (letzterRahmen ?? now)) / 1000);
  letzterRahmen = now;
  let bewegt = false;
  if (flug) {
    const t = Math.min(1, (now - flug.t0) / flug.dauer), k = glatt(t);
    camera.position.lerpVectors(flug.von, flug.pos, k);
    controls.target.lerpVectors(flug.vonZiel, flug.ziel, k);
    if (t >= 1) flug = null;
    bewegt = true;
  }
  const simLaeuft = !!sim && simSchritt();
  if (simLaeuft) { simSchritt(); netzPositionen(); bewegt = true; }   // Netz kommt sanft zur Ruhe
  if (kameraNachfuehren(dt)) bewegt = true;
  abspannRollen(dt);
  if (controls.update()) bewegt = true;
  if (bewegt) neuZeichnen = true;
  if (!neuZeichnen && !stapel.offen) return;
  const begrenzt = (abspielen || controls.autoRotate || simLaeuft) && !nutzerZieht && !flug;
  if (begrenzt && bildrate && now - letztesBild < 1000 / bildrate - 2) return;
  const neueKacheln = stapel.vorbereiten(camera, renderer.domElement.height);
  if (!neuZeichnen && !neueKacheln) return;   // nur auf Gesichter gewartet
  const dtBild = Math.min(0.1, (now - letztesBild) / 1000);
  letztesBild = now;
  neuZeichnen = false;
  for (const m of zeitMarken) m.rotation.y += 0.6 * dtBild;
  himmelFolgt(camera, now);
  // Nebel mit dem Abstand mitführen: aus großer Entfernung (Hochformat) sollen die Karten nicht im Dunst verschwinden
  const abstandZiel = camera.position.distanceTo(controls.target);
  scene.fog.near = Math.max(45, abstandZiel * 0.55);
  scene.fog.far = Math.max(190, abstandZiel + 150);
  renderer.render(scene, camera);
});
document.body.classList.add('bereit');
window.__lb = { camera, controls, fliege, THREE, zVon, daten, himmel: himmelFolgt, karten: () => karten, stapel, zeichnen, renderer, waehle: id => waehle(daten.byId.get(id)), klang: () => klang.zustand() };  // zum Ausprobieren in der Konsole
