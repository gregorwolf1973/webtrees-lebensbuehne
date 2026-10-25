// 2,5D-Porträt: das Gesicht als gewölbte Fläche, die sich sanft dreht und der Maus bzw. dem Finger folgt.
// Mit Tiefenkarte (tools/tiefen.py, hell = nah) wird die Wölbung zum Relief, ohne sie gibt es eine weiche Kopfwölbung.
// Je Platz (Kopf der Einblendung, große Seite der Bildgeschichte) gibt es einen WebGL-Zeichner; er läuft nur,
// solange sein Porträt im Dokument hängt.
import * as THREE from 'three';

const plaetze = new Map();
let wolbung = null;

const ladeTextur = src => new Promise(ok => {
  if (!src) return ok(null);
  new THREE.TextureLoader().load(src, t => ok(t), undefined, () => ok(null));
});

// Ersatz-Tiefe: ein leicht nach oben verschobenes, hochkantes Oval (Kopf), zum Rand hin abfallend
function standardTiefe() {
  if (wolbung) return wolbung;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1a';
  g.fillRect(0, 0, 128, 128);
  g.save();
  g.translate(64, 58);
  g.scale(0.78, 1);
  const v = g.createRadialGradient(0, 0, 2, 0, 0, 62);
  v.addColorStop(0, '#ffffff');
  v.addColorStop(0.6, '#a8a8a8');
  v.addColorStop(1, '#1a1a1a');
  g.fillStyle = v;
  g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill();
  g.restore();
  wolbung = new THREE.CanvasTexture(c);
  return wolbung;
}

function platz(name) {
  if (plaetze.has(name)) return plaetze.get(name);
  let zeichner;
  try {
    zeichner = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    plaetze.set(name, null);
    return null;
  }
  zeichner.setPixelRatio(Math.min(devicePixelRatio, 2));
  zeichner.setClearColor(0x000000, 0);
  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
  kamera.position.set(0, 0, 2.3);
  const material = new THREE.ShaderMaterial({
    uniforms: { bild: { value: null }, tiefe: { value: null }, staerke: { value: 0.2 }, ring: { value: 1 }, rand: { value: new THREE.Color('#d6a24e') } },
    vertexShader: `
      uniform sampler2D tiefe;
      uniform float staerke;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        // zum Rand hin flach auslaufen, damit der runde Umriss nicht verzerrt
        float rand = smoothstep(1.0, 0.7, length(uv - 0.5) * 2.0);
        p.z += (texture2D(tiefe, uv).r - 0.5) * staerke * rand;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D bild;
      uniform vec3 rand;
      uniform float ring;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        if (r > 1.0) discard;
        vec3 f = ring > 0.5 && r > 0.97 ? rand : texture2D(bild, vUv).rgb;   // goldener Ring wie bei den anderen Porträts
        gl_FragColor = vec4(f, 1.0);
      }`,
    transparent: true,
  });
  const netz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), material);
  szene.add(netz);
  const p = { zeichner, szene, kamera, material, netz, aktiv: null };
  p.male = zeit => male(p, zeit);
  plaetze.set(name, p);
  return p;
}

function male(p, zeit) {
  const a = p.aktiv;
  if (!a || !a.el.isConnected) {
    p.zeichner.setAnimationLoop(null);
    p.aktiv = null;
    return;
  }
  const t = zeit / 1000, z = a.zeiger;
  // deutliches, langsames Schwenken plus Neigung zum Zeiger, weich nachgeführt
  a.ry += ((Math.sin(t * 0.55) * 0.42 + z.x * 0.7) - a.ry) * 0.08;
  a.rx += ((Math.sin(t * 0.37) * 0.17 + z.y * 0.5) - a.rx) * 0.08;
  p.netz.rotation.set(a.rx, a.ry, 0);
  const w = a.el.clientWidth, h = a.el.clientHeight;
  if (w && h && (w !== a.w || h !== a.h)) {
    a.w = w; a.h = h;
    p.zeichner.setSize(w, h, false);
    p.kamera.aspect = w / h;
    p.kamera.updateProjectionMatrix();
  }
  p.zeichner.render(p.szene, p.kamera);
}

/**
 * Macht aus einem Gesichtsbild ein bewegtes 2,5D-Porträt im Element `ziel` (quadratisch, rund ausgeschnitten).
 * `name` wählt den Platz (je Platz ein Porträt gleichzeitig), `ring` zeichnet den goldenen Rand selbst.
 * Gibt false zurück, wenn WebGL fehlt oder das Bild nicht lädt; dann bleibt das normale Bild stehen.
 */
export async function belebe(ziel, bildSrc, tiefeSrc, { name = 'gross', ring = true } = {}) {
  const p = platz(name);
  if (!p) return false;
  const [bild, tiefe] = await Promise.all([ladeTextur(bildSrc), ladeTextur(tiefeSrc)]);
  if (!bild || !ziel.isConnected) { bild?.dispose(); tiefe?.dispose(); return false; }
  const u = p.material.uniforms;
  u.bild.value?.dispose();
  if (u.tiefe.value && u.tiefe.value !== wolbung) u.tiefe.value.dispose();
  u.bild.value = bild;
  u.tiefe.value = tiefe ?? standardTiefe();
  u.staerke.value = tiefe ? 0.34 : 0.2;
  u.ring.value = ring ? 1 : 0;
  p.aktiv = { el: ziel, zeiger: { x: 0, y: 0 }, rx: 0, ry: 0, w: 0, h: 0 };
  const zustand = p.aktiv;
  ziel.appendChild(p.zeichner.domElement);
  ziel.addEventListener('pointermove', ev => {
    const r = ziel.getBoundingClientRect();
    zustand.zeiger.x = (ev.clientX - r.left) / r.width - 0.5;
    zustand.zeiger.y = (ev.clientY - r.top) / r.height - 0.5;
  });
  ziel.addEventListener('pointerleave', () => { zustand.zeiger.x = zustand.zeiger.y = 0; });
  p.zeichner.setAnimationLoop(p.male);
  return true;
}
