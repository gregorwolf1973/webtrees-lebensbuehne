// Lebensbühne: die Familie als begehbarer Zeittunnel. Die Hauptperson in der Mitte, Vorfahren nach hinten, Nachkommen nach vorn;
// die Tiefe ist die Zeit.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ladeDaten, ansicht, jahreKurz, verwandtschaft, JETZT } from 'lb/daten.js';
import { Panel } from 'lb/panel.js';
import * as klang from 'lb/klang.js';

const FARBE = { vater: '#d6a24e', mutter: '#62b6a9', start: '#f2ede4' };
const ZWEIGE = ['#c99be0', '#86aee6', '#e39a8b', '#a5d388', '#e8c872', '#86d6cf'];   // Nachkommen: je Kind der Hauptperson eine Farbe
const PARTNER = '#e396b8';   // Partner und dessen Vorfahren
const farbe = p => p.rolle === 'nachkomme' ? ZWEIGE[(p.zweig ?? 0) % ZWEIGE.length] : p.partnerseite ? PARTNER : FARBE[p.seite] ?? FARBE.start;
const HINTERGRUND = 0x0c0f15;
const JAHR_NULL = 1973, TIEFE_PRO_JAHR = 0.24, RING_ABSTAND = 3.2, WINKEL = Math.PI * 0.86, RING = 35;
const FENSTER_ZEIT = 6, FENSTER_FAMILIE = 4;   // so viele Jahre vor und nach dem Regler werden Einträge eingeblendet
const zVon = jahr => (jahr - JAHR_NULL) * TIEFE_PRO_JAHR;

const daten = await ladeDaten();
const { personen, zeit } = daten;
const JAHR_MIN = Math.min(...personen.map(p => p.jahrE));

// --- Szene ---------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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

// --- Porträtkarten ----------------------------------------------------------------------------
const KW = 256, KH = 330;
const bildLader = new Map();
function ladeBild(src) {
  if (!bildLader.has(src)) bildLader.set(src, new Promise(ok => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  }));
  return bildLader.get(src);
}

function zeichneKarte(p, img) {
  const c = document.createElement('canvas');
  c.width = KW; c.height = KH;
  const g = c.getContext('2d');
  const f = farbe(p);
  g.fillStyle = 'rgba(18,22,30,0.94)';
  rundRechteck(g, 4, 4, KW - 8, KH - 8, 22); g.fill();
  g.lineWidth = p.mannesstamm || p.rolle === 'start' ? 7 : 4;
  g.strokeStyle = f; g.stroke();
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
  return c;
}

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

const ringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 });
const ringMat50 = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });
for (let j = Math.floor(JAHR_MIN / 50) * 50; j <= 2025; j += 25) {
  const pts = [];
  for (let i = 0; i <= 96; i++) { const w = i / 96 * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(w) * RING, Math.cos(w) * RING * 0.82, zVon(j))); }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), j % 50 ? ringMat : ringMat50));
  if (j % 50 === 0 && j <= 1950) {
    const t = textSprite(String(j), { groesse: 2.2, farbe: '#6f7786' });
    t.position.set(0, RING * 0.82 + 2, zVon(j));
    scene.add(t);
  }
}
const BODEN = -RING * 0.82;
scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, BODEN, zVon(JETZT)), new THREE.Vector3(0, BODEN, zVon(JAHR_MIN - 30))]),
  new THREE.LineBasicMaterial({ color: 0xe8b04f, transparent: true, opacity: 0.5 })));

const zeitMarken = [];
const rauteGeo = new THREE.OctahedronGeometry(0.7);
for (const z of zeit) {
  const m = new THREE.Mesh(rauteGeo, new THREE.MeshBasicMaterial({ color: 0xe8b04f, transparent: true, opacity: 0.75 }));
  m.position.set(0, BODEN, zVon(z.jahr));
  m.userData = { zeit: z };
  scene.add(m);
  zeitMarken.push(m);
}
{
  const n = 2200, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const w = Math.random() * Math.PI * 2, r = 4 + Math.random() * 55;
    pos.set([Math.sin(w) * r, Math.cos(w) * r * 0.8, zVon(JAHR_MIN - 30) + Math.random() * (zVon(JETZT + 30) - zVon(JAHR_MIN - 30))], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9aa4b5, size: 0.08, transparent: true, opacity: 0.35 })));
}

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
let root = daten.start, modus = { vorfahren: true, nachkommen: false, partner: false };
let imBild = [], karten = [], linien = [];
{
  const [id, m] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (daten.byId.has(id)) root = daten.byId.get(id);
  if (m) modus = { vorfahren: m.includes('v'), nachkommen: m.includes('n'), partner: m.includes('p') };
}

function baue() {
  for (const o of [...gruppe.children]) {
    gruppe.remove(o);
    o.geometry?.dispose?.();
    if (o.material?.map !== hofTextur) o.material?.map?.dispose();
    o.material?.dispose();
  }
  imBild = ansicht(daten, root, modus);
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
  // mit Partner: eigene Vorfahren links, die des Partners rechts daneben
  const partner = imBild.filter(p => p.rolle === 'partner');
  if (modus.vorfahren) verteile(root, -WINKEL, partner.length ? -0.12 : WINKEL, elternIm);
  partner.forEach((pa, i) => {
    const breite = (WINKEL - 0.12) / partner.length;
    verteile(pa, 0.12 + i * breite, 0.12 + (i + 1) * breite, elternIm, 0.7);
  });
  if (modus.nachkommen) verteile(root, -WINKEL, WINKEL, kinderIm);

  karten = imBild.map(p => {
    const tex = new THREE.CanvasTexture(zeichneKarte(p, null));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.position.copy(p.pos);
    const groesse = p.rolle === 'start' ? 1.35 : 1;
    s.userData = { p, basis: new THREE.Vector2(2.3 * groesse, 2.96 * groesse), tex, gesichtSrc: p.gesicht };
    s.scale.set(s.userData.basis.x, s.userData.basis.y, 1);
    gruppe.add(s);
    const hof = new THREE.Sprite(new THREE.SpriteMaterial({ map: hofTextur, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    hof.position.copy(p.pos);
    hof.visible = false;
    gruppe.add(hof);
    s.userData.hof = hof;
    if (p.gesicht) ladeBild(p.gesicht).then(img => {
      if (!img || !s.parent) return;
      tex.image = zeichneKarte(p, img);
      tex.needsUpdate = true;
    });
    return s;
  });
  linien = imBild.filter(p => p.zumStart).map(p => {
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

  const jahre = imBild.map(p => p.jahrE);
  document.getElementById('info-zahl').textContent =
    `${imBild.length} ${imBild.length === 1 ? 'Person' : 'Personen'} · ${Math.min(...jahre)}–${Math.max(...jahre)} · ${imBild.filter(p => p.gesicht).length} Gesichter`;
  document.getElementById('hauptperson').textContent = root.name.voll;
  document.getElementById('modus-vorfahren').setAttribute('aria-pressed', modus.vorfahren);
  document.getElementById('modus-nachkommen').setAttribute('aria-pressed', modus.nachkommen);
  document.getElementById('modus-partner').setAttribute('aria-pressed', modus.partner);
  document.getElementById('modus-partner').disabled = !root.partnerP.length;
  document.getElementById('modus-partner').title = root.partnerP.length ? `${root.partnerP.map(x => x.name.voll).join(', ')} und ${root.partnerP.length > 1 ? 'deren' : 'dessen'} Vorfahren einblenden` : 'Keine Partner im Stammbaum';
  history.replaceState(null, '', `#${root.id}/${modus.vorfahren ? 'v' : ''}${modus.nachkommen ? 'n' : ''}${modus.partner ? 'p' : ''}`);
  gewaehlt = null;
  aktualisiereDarstellung();
  letztesJahr = null;
  if (zeitJahr != null) setzeJahr(zeitJahr);
}

// --- Kamera-Flüge ---------------------------------------------------------------------------------
let flug = null;
function fliege(pos, ziel, dauer = 1300) {
  flug = { von: camera.position.clone(), vonZiel: controls.target.clone(), pos, ziel, t0: performance.now(), dauer };
}
function ueberblick() {
  const zs = imBild.map(p => p.pos.z), rs = imBild.map(p => Math.hypot(p.pos.x, p.pos.y));
  const zmin = Math.min(...zs), zmax = Math.max(...zs), spanne = Math.max(20, zmax - zmin), rmax = Math.max(8, ...rs);
  const d = Math.max(spanne * 0.42, rmax * 1.1) + 14;
  fliege(new THREE.Vector3(0, d * 0.6, zmax + d * 0.7), new THREE.Vector3(0, -2, zmax - spanne * 0.3));
}

// --- Auswahl, Hervorhebung, Zeitreise ---------------------------------------------------------------
let gewaehlt = null, zeitJahr = null, letztesJahr = null, hover = null;

function linieZu(p) {
  const s = new Set();
  for (let x = p; x; x = x.zumStart) s.add(x);
  return s;
}

function aktualisiereDarstellung() {
  const pfad = gewaehlt ? linieZu(gewaehlt) : null;
  for (const k of karten) {
    const p = k.userData.p;
    let o = 1, hell = 1, gross = 1, hof = 0;
    if (zeitJahr != null) {
      const s = lebenslicht(p, zeitJahr);
      o = s.o; hell = s.hell; gross = s.gross; hof = s.hof;
    }
    const h = k.userData.hof;
    h.material.opacity = 0.9 * hof;
    h.scale.setScalar(k.userData.basis.y * gross * 1.9);
    h.visible = hof > 0.01;
    if (k === hover) gross = Math.max(gross, 1.15);
    k.scale.set(k.userData.basis.x * gross, k.userData.basis.y * gross, 1);
    // ausgewählte Person: übrige dämpfen – nicht während der Zeitreise, dort zählt nur Leben und Tod
    if (!abspielen && pfad && !pfad.has(p) && p.zumStart !== gewaehlt) o = Math.min(o, 0.35);
    // Karten zwischen Kamera und gewählter Person fast durchsichtig, damit sie nicht verdecken
    if (!abspielen && gewaehlt && p.pos.z > gewaehlt.pos.z + 3) o = Math.min(o, 0.12);
    if (k === hover) { o = 1; hell = 1; }   // Maus über der Person: hell und voll sichtbar
    k.material.color.setScalar(hell);
    k.material.opacity = o;
  }
  for (const l of linien) {
    const { von, zu } = l.userData;
    const an = pfad ? (pfad.has(von) && pfad.has(zu)) || von === gewaehlt : false;
    l.material.opacity = pfad && !abspielen ? (an ? 0.95 : 0.12)
      : zeitJahr != null ? 0.6 * Math.min(lebenslicht(von, zeitJahr).o, lebenslicht(zu, zeitJahr).o) : 0.45;
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

// altersgerechte Gesichter: in der Zeitreise das zuletzt aufgenommene Foto bis zum aktuellen Jahr, sonst das Kartengesicht
function gesichterAnpassen(j) {
  for (const k of karten) {
    const p = k.userData.p;
    if (!p.gesichter?.length && k.userData.gesichtSrc === p.gesicht) continue;
    const passend = j == null ? null : [...(p.gesichter || [])].reverse().find(g => g.jahr <= j);
    const src = passend?.src ?? p.gesicht;
    if (!src || src === k.userData.gesichtSrc) continue;
    k.userData.gesichtSrc = src;
    ladeBild(src).then(img => {
      if (!img || k.userData.gesichtSrc !== src || !k.parent) return;
      k.userData.tex.image = zeichneKarte(p, img);
      k.userData.tex.needsUpdate = true;
    });
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
  if (!p.imBild) return setzeHauptperson(p);
  gewaehlt = p;
  aktualisiereDarstellung();
  const vorne = new THREE.Vector3(p.pos.x * 0.15, p.pos.y * 0.15 + 1.5, 15);
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
  if (px > 0 && innerWidth > 760) camera.setViewOffset(innerWidth, innerHeight, px / 2, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
}

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
const FAMILIE = { BIRT: 'Geburt', DEAT: 'Tod', MARR: 'Hochzeit', EMIG: 'Auswanderung', IMMI: 'Einwanderung' };

function setzeJahr(jGenau) {
  zeitJahr = jGenau;
  regler.value = jGenau;
  const j = Math.floor(jGenau);
  if (j === letztesJahr) return aktualisiereDarstellung();   // Einblendungen nur bei neuem Jahr, die Karten bei jedem Schritt
  letztesJahr = j;
  jahrAnzeige.textContent = j;
  // rechts: die zuletzt geborene Person, die noch lebt
  const geboren = imBild.filter(p => (p.geburt ?? p.jahrE) <= j && p.ende >= j)
    .sort((a, b) => (b.geburt ?? b.jahrE) - (a.geburt ?? a.jahrE) || a.geschaetzt - b.geschaetzt || b.bilder.length - a.bilder.length);
  if (geboren.length) panel.zeitreise(geboren[0], j);
  folgeZiel = berechneFolgeZiel(j, geboren[0]);
  gesichterAnpassen(j);
  const lebend = imBild.filter(p => p.jahrE <= j && p.ende >= j);
  lebendAnzeige.textContent = `${lebend.length} ${lebend.length === 1 ? 'Person lebt' : 'Personen leben'} in diesem Jahr`;
  const zg = zeit.map(z => ({ z, d: abstand(z, j) })).filter(x => x.d <= FENSTER_ZEIT)
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

let abspielen = null;
function stoppeAbspielen() {
  if (!abspielen) return;
  cancelAnimationFrame(abspielen.raf);
  abspielen = null;
  musik.pause();
  klang.stille();
  document.getElementById('abspielen').textContent = '▶ Zeitreise';
}
document.getElementById('abspielen').addEventListener('click', async e => {
  if (abspielen) return stoppeAbspielen();
  if (geraeuscheAn) klang.bereit();
  e.target.textContent = '❚❚ Anhalten';
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
  if (!menge.length) return { ziel: new THREE.Vector3(0, 0, zVon(j)), d: 30 };
  const ziel = new THREE.Vector3();
  for (const p of menge) ziel.add(p.pos);
  ziel.divideScalar(menge.length);
  if (aktuell?.pos) ziel.lerp(aktuell.pos, 0.35);   // die zuletzt geborene Person etwas in die Mitte rücken
  let r = 0;
  for (const p of menge) r = Math.max(r, p.pos.distanceTo(ziel));
  return { ziel, d: Math.min(90, Math.max(26, r * 1.7 + 10)) };
}
// weich nachführen: Blickpunkt mit etwa 4 s, Abstand mit etwa 6 s Zeitkonstante (unabhängig von der Bildrate)
function kameraNachfuehren(dt) {
  if (!kameraFolgt || zeitJahr == null || !folgeZiel || flug || nutzerZieht) return;
  const versatz = camera.position.clone().sub(controls.target), laenge = versatz.length();   // Blickwinkel bleibt, wie eingestellt
  controls.target.lerp(folgeZiel.ziel, 1 - Math.exp(-dt / 4));
  if (performance.now() > zoomPause) versatz.setLength(laenge + (folgeZiel.d - laenge) * (1 - Math.exp(-dt / 6)));
  camera.position.copy(controls.target).add(versatz);
}
renderer.domElement.addEventListener('pointerdown', () => { nutzerZieht = true; });
addEventListener('pointerup', () => { nutzerZieht = false; });
renderer.domElement.addEventListener('wheel', () => { zoomPause = performance.now() + 4000; }, { passive: true });

// --- Ton: Einstellungen (Menü „♪ Ton“), im Browser gemerkt -------------------------------------------------------
const ARTEN = [
  ['geburt', 'Geburt (Babylachen)'], ['hochzeit', 'Hochzeit (Glocken, Lachen)'], ['tod', 'Tod (tiefe Glocke)'],
  ['krieg', 'Krieg vor 1900 (Kanonen)'], ['krieg1', 'Erster Weltkrieg (MG)'], ['krieg2', 'Zweiter Weltkrieg (Stukas)'],
  ['luftkrieg', 'Luftalarm, Bomben'], ['gefecht', 'Schießereien'], ['totenglocke', 'Totenglocken im Krieg'], ['marsch', 'Marschtritte'],
  ['not', 'Hunger und Not'], ['kaelte', 'Kälte'], ['wasser', 'Wasser, Auswanderung'], ['flut', 'Flut'],
  ['zug', 'Eisenbahn'], ['jubel', 'Jubel'], ['unruhe', 'Unruhe'], ['glocken', 'Glockengeläut'], ['strom', 'Strom'],
];
const ton = { lied: false, liedTempo: true, geraeusche: true, volLied: 85, volGeraeusche: 50, arten: Object.fromEntries(ARTEN.map(([k]) => [k, true])) };
try {
  const t = JSON.parse(localStorage.getItem('lb-ton') || '{}');
  if (!localStorage.getItem('lb-ton')) {   // Einstellungen der ersten Fassung übernehmen
    if (localStorage.getItem('lb-lied')) t.lied = localStorage.getItem('lb-lied') === '1';
    if (localStorage.getItem('lb-geraeusche')) t.geraeusche = localStorage.getItem('lb-geraeusche') === '1';
  }
  Object.assign(ton, t, { arten: { ...ton.arten, ...(t.arten || {}) } });
} catch (e) { /* Vorgaben */ }
const tonSpeichern = () => { try { localStorage.setItem('lb-ton', JSON.stringify(ton)); } catch (e) { /* ohne Speicher */ } };
let geraeuscheAn = ton.geraeusche, liedAn = ton.lied;

function klingen(j) {
  const ziele = {};
  for (const z of daten.klangZeit) {
    const bis = (z.klangBis ?? z.bis ?? z.jahr) + 1;
    const st = j < z.jahr ? 1 - (z.jahr - j) / 1.5 : j > bis ? 1 - (j - bis) / 1.5 : 1;   // anderthalb Jahre ein- und ausblenden
    if (st <= 0) continue;
    for (const art of z.klang.split('+')) if (ton.arten[art]) ziele[art] = Math.max(ziele[art] ?? 0, st);
  }
  klang.stimmung(ziele);
  let n = 0;
  for (const p of imBild) {
    if (n > 3) break;
    if (p.geburt === j) { if (ton.arten.geburt) setTimeout(klang.geburt, n++ * 250); }
    else if (p.tod === j) { if (ton.arten.tod) setTimeout(klang.tod, n++ * 250); }
    else if (ton.arten.hochzeit && p.geschlecht === 'M' && p.ereignisse.some(e => e.art === 'MARR' && e.jahr === j)) setTimeout(klang.hochzeit, n++ * 250);
  }
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
function setzeLied(q) {
  musikQuelle = q;
  if (q) musik.src = q.url;
  document.getElementById('lied-name').textContent = q ? q.name : 'Kein Lied – eigene Datei über „Datei wählen …“ einbinden';
  zeigeTon();
}
dateiWahl.addEventListener('change', async () => {
  const datei = dateiWahl.files[0];
  if (!datei) return;
  try {
    const db = await speicher();
    db.transaction('dateien', 'readwrite').objectStore('dateien').put(datei, 'lied');
  } catch (e) { /* dann nur für diese Sitzung */ }
  liedAn = ton.lied = true; tonSpeichern();
  setzeLied({ url: URL.createObjectURL(datei), name: datei.name });
  if (abspielen) stoppeAbspielen();
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
liedLaden().then(setzeLied);
klang.ladeAufnahmen();

document.getElementById('ansicht-ueberblick').addEventListener('click', () => {
  stoppeAbspielen(); zeitJahr = null; letztesJahr = null; jahrAnzeige.textContent = '–'; lebendAnzeige.textContent = '';
  gesichterAnpassen(null);
  zeigeTicker([]); setTimeout(() => { if (zeitJahr == null) zeitKarte.hidden = true; }, 500);
  panel.schliesse(); aktualisiereDarstellung(); ueberblick();
});
// Klick auf den Namen der Hauptperson: die Suche wählt dann eine neue Hauptperson
const suche = document.getElementById('suche');
let hpWahl = false;
function hpWahlEnde() { hpWahl = false; suche.placeholder = 'Person suchen …'; suche.classList.remove('hp-wahl'); }
document.getElementById('hauptperson').addEventListener('click', () => {
  hpWahl = true;
  suche.value = '';
  suche.placeholder = 'Neue Hauptperson: Namen eingeben …';
  suche.classList.add('hp-wahl');
  suche.focus();
});
suche.addEventListener('blur', () => setTimeout(() => { if (!suche.value) hpWahlEnde(); }, 300));
suche.addEventListener('keydown', ev => { if (ev.key === 'Escape') { suche.value = ''; hpWahlEnde(); suche.blur(); } });
document.getElementById('modus-partner').addEventListener('click', () => {
  modus.partner = !modus.partner;
  panel.schliesse();
  baue();
  ueberblick();
});
for (const [knopf, schluessel, anderer] of [['modus-vorfahren', 'vorfahren', 'nachkommen'], ['modus-nachkommen', 'nachkommen', 'vorfahren']])
  document.getElementById(knopf).addEventListener('click', () => {
    modus[schluessel] = !modus[schluessel];
    if (!modus.vorfahren && !modus.nachkommen) modus[anderer] = true;   // eine Richtung bleibt immer an
    panel.schliesse();
    baue();
    ueberblick();
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
});

// --- Maus: Hover und Klick -------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const maus = new THREE.Vector2();
const tip = document.getElementById('tip');
let runter = null;

function treffer(ev) {
  maus.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(maus, camera);
  const t = ray.intersectObjects([...karten, ...zeitMarken], false).find(h => h.object.userData.p || h.object.material.opacity > 0.2);
  return t ? t.object : null;
}

renderer.domElement.addEventListener('pointermove', ev => {
  const o = treffer(ev);
  const vorher = hover;
  hover = o;
  if (vorher !== o) aktualisiereDarstellung();
  renderer.domElement.style.cursor = o ? 'pointer' : 'grab';
  if (!o) { tip.hidden = true; return; }
  const p = o.userData.p, z = o.userData.zeit;
  tip.innerHTML = p ? `<b>${p.name.voll}</b><span>${jahreKurz(p)} · ${verwandtschaft(p)}</span>`
    : `<b>${z.titel}</b><span>${z.bis ? `${z.jahr}–${z.bis}` : z.jahr} · Zeitgeschehen</span>`;
  tip.style.left = Math.min(ev.clientX + 16, innerWidth - 300) + 'px';
  tip.style.top = ev.clientY + 14 + 'px';
  tip.hidden = false;
});
renderer.domElement.addEventListener('pointerdown', ev => { runter = { x: ev.clientX, y: ev.clientY }; flug = null; });
renderer.domElement.addEventListener('dblclick', ev => {
  const o = treffer(ev);
  if (o?.userData.p && o.userData.p !== root) { stoppeAbspielen(); setzeHauptperson(o.userData.p); }
});
renderer.domElement.addEventListener('pointerup', ev => {
  if (!runter || Math.hypot(ev.clientX - runter.x, ev.clientY - runter.y) > 5) return;
  const o = treffer(ev);
  if (o?.userData.p) { stoppeAbspielen(); waehle(o.userData.p); }
  else if (o?.userData.zeit) { stoppeAbspielen(); setzeJahr(o.userData.zeit.jahr); }
});

addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && !ev.defaultPrevented) panel.schliesse();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  setzeVersatz(panel.offen ? panel.breite() : 0);
});

// --- Start und Schleife --------------------------------------------------------------------------------
baue();
camera.position.set(-40, 60, 90);
controls.target.set(0, 0, zVon(1880));
ueberblick();
let letzterRahmen = null;
const glatt = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
renderer.setAnimationLoop(now => {
  if (flug) {
    const t = Math.min(1, (now - flug.t0) / flug.dauer), k = glatt(t);
    camera.position.lerpVectors(flug.von, flug.pos, k);
    controls.target.lerpVectors(flug.vonZiel, flug.ziel, k);
    if (t >= 1) flug = null;
  }
  const dt = Math.min(0.1, (now - (letzterRahmen ?? now)) / 1000);
  letzterRahmen = now;
  for (const m of zeitMarken) m.rotation.y += 0.01;
  kameraNachfuehren(dt);
  abspannRollen(dt);
  controls.update();
  renderer.render(scene, camera);
});
document.body.classList.add('bereit');
window.__lb = { camera, controls, fliege, THREE, zVon, daten, karten: () => karten };  // zum Ausprobieren in der Konsole
