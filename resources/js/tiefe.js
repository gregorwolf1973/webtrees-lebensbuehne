// 2,5D-Porträt: das Gesicht als gewölbte Fläche, die sich sanft dreht und der Maus bzw. dem Finger folgt.
// Mit Tiefenkarte (tools/tiefen.py, hell = nah) wird die Wölbung zum Relief, ohne sie gibt es eine weiche Kopfwölbung.
// Alle Porträts teilen sich einen WebGL-Zeichner; er läuft nur, solange sein Porträt im Dokument hängt.
import * as THREE from 'three';

let zeichner = null, szene, kamera, netz, material, wolbung = null, aktiv = null;

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

function bereite() {
  if (zeichner) return true;
  try {
    zeichner = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    zeichner = null;
    return false;
  }
  zeichner.setPixelRatio(Math.min(devicePixelRatio, 2));
  zeichner.setClearColor(0x000000, 0);
  szene = new THREE.Scene();
  kamera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
  kamera.position.set(0, 0, 2.25);
  material = new THREE.ShaderMaterial({
    uniforms: { bild: { value: null }, tiefe: { value: null }, staerke: { value: 0.2 }, rand: { value: new THREE.Color('#d6a24e') } },
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
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        if (r > 1.0) discard;
        vec3 f = r > 0.97 ? rand : texture2D(bild, vUv).rgb;   // goldener Ring wie bei den anderen Porträts
        gl_FragColor = vec4(f, 1.0);
      }`,
    transparent: true,
  });
  netz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), material);
  szene.add(netz);
  return true;
}

function male(zeit) {
  if (!aktiv || !aktiv.el.isConnected) {
    zeichner.setAnimationLoop(null);
    aktiv = null;
    return;
  }
  const t = zeit / 1000, z = aktiv.zeiger;
  // langsames Atmen plus Neigung zum Zeiger, weich nachgeführt
  aktiv.ry += ((Math.sin(t * 0.45) * 0.3 + z.x * 0.55) - aktiv.ry) * 0.08;
  aktiv.rx += ((Math.sin(t * 0.31) * 0.12 + z.y * 0.4) - aktiv.rx) * 0.08;
  netz.rotation.set(aktiv.rx, aktiv.ry, 0);
  const w = aktiv.el.clientWidth, h = aktiv.el.clientHeight;
  if (w && h && (w !== aktiv.w || h !== aktiv.h)) {
    aktiv.w = w; aktiv.h = h;
    zeichner.setSize(w, h, false);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
  }
  zeichner.render(szene, kamera);
}

/**
 * Macht aus einem Gesichtsbild ein bewegtes 2,5D-Porträt im Element `ziel` (quadratisch, rund ausgeschnitten).
 * Gibt false zurück, wenn WebGL fehlt oder das Bild nicht lädt; dann bleibt das normale Bild stehen.
 */
export async function belebe(ziel, bildSrc, tiefeSrc) {
  if (!bereite()) return false;
  const [bild, tiefe] = await Promise.all([ladeTextur(bildSrc), ladeTextur(tiefeSrc)]);
  if (!bild || !ziel.isConnected) { bild?.dispose(); tiefe?.dispose(); return false; }
  const alt = material.uniforms;
  alt.bild.value?.dispose();
  if (alt.tiefe.value && alt.tiefe.value !== wolbung) alt.tiefe.value.dispose();
  alt.bild.value = bild;
  alt.tiefe.value = tiefe ?? standardTiefe();
  alt.staerke.value = tiefe ? 0.26 : 0.16;
  aktiv = { el: ziel, zeiger: { x: 0, y: 0 }, rx: 0, ry: 0, w: 0, h: 0 };
  const zustand = aktiv;
  ziel.appendChild(zeichner.domElement);
  ziel.addEventListener('pointermove', ev => {
    const r = ziel.getBoundingClientRect();
    zustand.zeiger.x = (ev.clientX - r.left) / r.width - 0.5;
    zustand.zeiger.y = (ev.clientY - r.top) / r.height - 0.5;
  });
  ziel.addEventListener('pointerleave', () => { zustand.zeiger.x = zustand.zeiger.y = 0; });
  zeichner.setAnimationLoop(male);
  return true;
}
