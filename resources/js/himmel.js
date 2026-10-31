// Sternhimmel weit hinter der Bühne: echte Sterne aus dem Yale Bright Star Catalogue (Lage, Helligkeit und Farbe wie am
// Himmel, resources/data/sterne.json) und das schwache Band der Milchstraße. Der Himmel wandert mit der Kamera mit und
// liegt damit „im Unendlichen“: Er dreht sich beim Umsehen, rückt aber nie zwischen die Karten.
import * as THREE from 'three';

const R = 600;   // Radius der Himmelskugel, innerhalb der Fernebene der Kamera

// Farbe aus dem Farbindex B−V: Temperatur nach Ballesteros (2012), daraus RGB (Näherung nach Tanner Helland), etwas entsättigt
function farbe(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)) / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  const k = v => 0.55 * Math.min(1, Math.max(0, v / 255)) + 0.45;
  return [k(r), k(g), k(b)];
}

// Himmelskoordinaten (Grad) → Einheitsvektor im Äquatorsystem (x zum Frühlingspunkt, z zum Himmelsnordpol)
const vektor = (ra, dec) => {
  const a = THREE.MathUtils.degToRad(ra), d = THREE.MathUtils.degToRad(dec);
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
// galaktische Koordinaten → Äquatorsystem (J2000, Transponierte der üblichen Matrix)
const GAL = [[-0.0548755604, 0.4941094279, -0.8676661490], [-0.8734370902, -0.4448296300, -0.1980763734], [-0.4838350155, 0.7469822445, 0.4559837762]];
const ausGalaktisch = (l, b) => {
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  return GAL.map(z => z[0] * g[0] + z[1] * g[1] + z[2] * g[2]);
};
const normal = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

const material = pixel => new THREE.ShaderMaterial({
  uniforms: { pixel: { value: pixel }, zeit: { value: 0 } },
  vertexShader: `
    attribute float groesse;
    attribute float hell;
    attribute float phase;
    attribute vec3 farbe;
    uniform float pixel;
    uniform float zeit;
    varying vec3 vFarbe;
    varying float vHell;
    void main() {
      vFarbe = farbe;
      // helle Sterne funkeln ein wenig
      vHell = hell * (1.0 + 0.14 * sin(zeit * 2.1 + phase) * step(2.6, groesse));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = groesse * pixel;
    }`,
  fragmentShader: `
    varying vec3 vFarbe;
    varying float vHell;
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      if (r > 1.0) discard;
      gl_FragColor = vec4(vFarbe, exp(-r * r * 5.0) * vHell);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

function punkte(liste, pixel) {
  const n = liste.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), gr = new Float32Array(n), he = new Float32Array(n), ph = new Float32Array(n);
  liste.forEach((s, i) => {
    // Äquatorsystem → Szene: Nordpol nach oben (y), Frühlingspunkt nach hinten
    pos.set([s.v[1] * R, s.v[2] * R, -s.v[0] * R], i * 3);
    col.set(s.farbe, i * 3);
    gr[i] = s.groesse; he[i] = s.hell; ph[i] = Math.random() * 6.3;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('farbe', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('groesse', new THREE.BufferAttribute(gr, 1));
  geo.setAttribute('hell', new THREE.BufferAttribute(he, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const p = new THREE.Points(geo, material(pixel));
  p.frustumCulled = false;
  p.renderOrder = -10;
  return p;
}

// Schimmer der Milchstraße als Kugel hinter den Sternen: Helligkeit aus der galaktischen Breite und Länge (zum Zentrum hin
// heller und breiter), dazu wolkiges Rauschen und dunklere Staubbänder – im Shader berechnet, damit nichts fleckig wirkt
function schimmer() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vRichtung;
      void main() {
        vRichtung = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vRichtung;
      float zufall(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float rauschen(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(zufall(i), zufall(i + vec3(1, 0, 0)), f.x), mix(zufall(i + vec3(0, 1, 0)), zufall(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(zufall(i + vec3(0, 0, 1)), zufall(i + vec3(1, 0, 1)), f.x), mix(zufall(i + vec3(0, 1, 1)), zufall(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        // Szene → Äquatorsystem → galaktisch
        vec3 e = vec3(-vRichtung.z, vRichtung.x, vRichtung.y);
        vec3 g = vec3(dot(vec3(-0.0548755604, -0.8734370902, -0.4838350155), e),
                      dot(vec3(0.4941094279, -0.4448296300, 0.7469822445), e),
                      dot(vec3(-0.8676661490, -0.1980763734, 0.4559837762), e));
        float b = asin(clamp(g.z, -1.0, 1.0)), l = atan(g.y, g.x);
        float zentrum = exp(-l * l / 0.9);
        float breite = 0.09 + 0.12 * zentrum;
        float band = exp(-(b * b) / (breite * breite)) * (0.3 + 0.7 * zentrum);
        float wolken = 0.55 * rauschen(vRichtung * 7.0) + 0.3 * rauschen(vRichtung * 17.0) + 0.15 * rauschen(vRichtung * 37.0);
        float staub = smoothstep(0.55, 0.8, rauschen(vRichtung * 11.0 + 3.1)) * exp(-(b * b) / 0.002) * zentrum;
        float hell = band * (0.35 + 0.9 * wolken) * (1.0 - 0.7 * staub);
        vec3 farbe = mix(vec3(0.55, 0.62, 0.8), vec3(0.95, 0.82, 0.62), zentrum);
        gl_FragColor = vec4(farbe * hell * 0.16, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  const kugel = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 96, 48), mat);
  kugel.renderOrder = -11;
  kugel.frustumCulled = false;
  return kugel;
}

/**
 * Baut den Himmel in die Szene und gibt eine Funktion zurück, die ihn je Bild mit der Kamera mitführt.
 * `fertig` wird gerufen, sobald die Sterne geladen sind (dann ist ein neues Bild fällig).
 */
export function baueHimmel(scene, url, pixel, fertig = () => {}) {
  const himmel = new THREE.Group();
  // Neigung so, dass die Milchstraße schräg über die Bühne zieht
  himmel.rotation.set(-0.35, 0.9, 0.25);
  scene.add(himmel);
  const materialien = [];
  fetch(url).then(r => r.json()).then(werte => {
    const sterne = [];
    for (let i = 0; i < werte.length; i += 4) {
      const [ra, dec, mag, bv] = werte.slice(i, i + 4);
      sterne.push({ v: vektor(ra, dec), farbe: farbe(bv), groesse: Math.max(1.6, 4.8 - 0.5 * mag), hell: Math.min(1, Math.max(0.2, 0.28 + (6.5 - mag) * 0.15)) });
    }
    // Milchstraße: sehr viele schwache Pünktchen entlang der galaktischen Ebene, zum Zentrum hin dichter und breiter –
    // wie auf Himmelsfotos ergibt erst die Menge den Schimmer
    const band = [];
    for (let i = 0; i < 28000; i++) {
      let l;
      do { l = (Math.random() - 0.5) * 2 * Math.PI; } while (Math.random() > 0.25 + 0.75 * Math.exp(-((l / 1.1) ** 2)));
      const b = normal() * THREE.MathUtils.degToRad(3 + 5 * Math.exp(-((l / 0.6) ** 2)));
      band.push({ v: ausGalaktisch(l, b), farbe: farbe(0.2 + Math.random() * 0.8), groesse: 1.1 + Math.random() * 0.9, hell: 0.07 + Math.random() * 0.13 });
    }
    himmel.add(schimmer());
    for (const liste of [band, sterne]) {
      const p = punkte(liste, pixel);
      materialien.push(p.material);
      himmel.add(p);
    }
    fertig();
  }).catch(() => { /* ohne Sterne bleibt der Hintergrund dunkel */ });
  const folge = (kamera, zeit) => {
    himmel.position.copy(kamera.position);
    for (const m of materialien) m.uniforms.zeit.value = zeit / 1000;
  };
  folge.gruppe = himmel;
  folge.richtungMilchstrasse = () => {   // Blickrichtung zum galaktischen Zentrum (zum Ausprobieren)
    const v = ausGalaktisch(0, 0);
    return new THREE.Vector3(v[1], v[2], -v[0]).applyEuler(himmel.rotation);
  };
  return folge;
}
