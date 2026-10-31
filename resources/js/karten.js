// Porträtkarten mit wenig Last für die Grafikkarte. Alle Karten werden in einem einzigen Zeichenaufruf gemalt: Ihre Bilder
// liegen als Kacheln in wenigen großen Texturen (Atlas), jede Karte ist eine Instanz derselben Fläche, die sich im Shader
// zur Kamera dreht. Jede Karte hat eine kleine Kachel; wer groß auf dem Bildschirm steht, bekommt aus einem begrenzten
// Vorrat eine mittlere oder große dazu, die beim Wegfahren an andere Karten geht. Gesichter lädt nur, wer im Blickfeld ist,
// und Karten außerhalb des Blickfelds werden gar nicht gezeichnet.
import * as THREE from 'three';

export const KW = 256, KH = 330;   // Kartengröße in Pixeln bei voller Auflösung
const grob = matchMedia('(pointer: coarse)').matches;
// Stufen: Maßstab der Kachel, ab welcher Kartenhöhe auf dem Bildschirm (Gerätepixel) sie gebraucht wird, Zahl der Kacheln
const STUFEN = [
  { s: 0.25 },
  { s: 0.5, ab: 95, vorrat: grob ? 96 : 192 },
  { s: 1, ab: 190, vorrat: grob ? 24 : 48 },
];
const RUECK = 0.8;              // erst bei 80 % der Schwelle zurück auf die kleinere Stufe, damit nichts flackert
const KLEIN_PIXEL = 4096 * 4096; // höchstens so viele Pixel für die kleinen Kacheln, sonst werden sie kleiner
const LADEN_GLEICHZEITIG = 8, BILDER_MAX = 80, BUDGET_MS = 6;

class Atlas {
  constructor(s, anzahl, maxSeite) {
    this.kw = Math.round(KW * s);
    this.kh = Math.round(KH * s);
    this.s = s;
    this.anzahl = anzahl;
    this.spalten = Math.max(1, Math.min(Math.floor(Math.min(4096, maxSeite) / this.kw), anzahl));
    this.W = this.spalten * this.kw;
    this.H = Math.ceil(anzahl / this.spalten) * this.kh;
    this.leinwand = document.createElement('canvas');
    this.leinwand.width = this.W;
    this.leinwand.height = this.H;
    this.tex = new THREE.CanvasTexture(this.leinwand);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.flipY = false;
    this.tex.anisotropy = 4;
    this.besitzer = new Array(anzahl).fill(null);   // je Kachel die Karte, die sie gerade hat
    this.kratz = null;
    this.mip = false;
  }
  ort(i) { return [(i % this.spalten) * this.kw, Math.floor(i / this.spalten) * this.kh]; }
  rechteck(i) { const [x, y] = this.ort(i); return [x / this.W, y / this.H, this.kw / this.W, this.kh / this.H]; }
  // erstes Hochladen, dabei Speicher für alle Mipmap-Stufen; danach wird nur noch kachelweise geschrieben
  hochladen(renderer) {
    renderer.initTexture(this.tex);
    this.tex.image = { width: this.W, height: this.H };
    this.leinwand = null;
    this.tex.generateMipmaps = false;
  }
  // Textur über three.js binden, auf der letzten Einheit wie three.js beim Hochladen. Erst die Einheit wählen:
  // bindTexture wechselt sie nur, wenn sich die Bindung ändert, sonst ginge die Kachel in eine andere Textur
  // (darum auch nicht renderer.copyTextureToTexture).
  binden(renderer) {
    const gl = renderer.getContext();
    renderer.state.activeTexture();
    renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(this.tex).__webglTexture);
    return gl;
  }
  kachel(renderer, i, quelle) {
    const [x, y] = this.ort(i), gl = this.binden(renderer);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, quelle);
    this.mip = true;
  }
  // Mipmaps einmal je Bild neu rechnen statt nach jeder Kachel
  mipmaps(renderer) {
    if (!this.mip) return;
    this.binden(renderer).generateMipmap(renderer.getContext().TEXTURE_2D);
    this.mip = false;
  }
}

const VERTEX = `
  attribute vec3 mitte;
  attribute vec2 groesse;
  attribute vec2 licht;    // Deckkraft, Helligkeit
  attribute vec4 kachel;   // Ecke, Breite und Höhe im Atlas
  attribute float stufe;
  varying vec2 vUv;
  varying vec2 vLicht;
  varying float vStufe;
  #include <fog_pars_vertex>
  void main() {
    vUv = kachel.xy + vec2(position.x + 0.5, 0.5 - position.y) * kachel.zw;
    vLicht = licht;
    vStufe = stufe;
    vec4 mvPosition = modelViewMatrix * vec4(mitte, 1.0);
    mvPosition.xy += position.xy * groesse;   // zur Kamera gedreht wie ein Sprite
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FRAGMENT = `
  uniform sampler2D klein;
  uniform sampler2D mittel;
  uniform sampler2D gross;
  varying vec2 vUv;
  varying vec2 vLicht;
  varying float vStufe;
  #include <fog_pars_fragment>
  void main() {
    vec4 a = texture2D(klein, vUv), b = texture2D(mittel, vUv), c = texture2D(gross, vUv);
    vec4 f = vStufe < 0.5 ? a : vStufe < 1.5 ? b : c;
    f.rgb *= vLicht.y;
    f.a *= vLicht.x;
    if (f.a < 0.01) discard;
    gl_FragColor = f;
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class Kartenstapel {
  /** `zeichne(g, p, bild)` malt die Karte der Person p in KW × KH in den Kontext g (bild: Gesicht oder null). */
  constructor(renderer, zeichne) {
    this.renderer = renderer;
    this.zeichne = zeichne;
    this.bilder = new Map();   // Gesichter, zuletzt benutzte zuletzt; null = ließ sich nicht laden
    this.laden = new Set();
    this.karten = [];
    this.atlanten = [];
    this.mesh = null;
    this.rest = false;         // Kacheln, deren Bild bereitliegt, mussten aufs nächste Bild warten
    this.neuGeladen = false;   // ein Gesicht ist angekommen
    this.frustum = new THREE.Frustum();
  }

  /** Es wartet Arbeit, für die ein weiterer Durchlauf nötig ist. */
  get offen() { return this.rest || this.neuGeladen; }

  /** Baut die Karten neu auf; `liste` enthält {p, basis}. Gibt die Karten zurück (Felder gross, o, hell, gesichtSrc). */
  baue(liste, eltern) {
    for (const a of this.atlanten) a.tex.dispose();
    const n = Math.max(1, liste.length), maxSeite = this.renderer.capabilities.maxTextureSize;
    // kleine Kacheln: eine je Karte; sehr viele Karten bekommen kleinere Kacheln, damit der Speicher reicht
    const zuGross = s => {
      const kw = Math.round(KW * s), kh = Math.round(KH * s), spalten = Math.floor(Math.min(4096, maxSeite) / kw);
      return n * kw * kh > KLEIN_PIXEL || Math.ceil(n / spalten) * kh > maxSeite;
    };
    let s0 = STUFEN[0].s;
    while (s0 > 0.05 && zuGross(s0)) s0 *= 0.9;
    this.atlanten = [new Atlas(s0, n, maxSeite), ...STUFEN.slice(1).map(st => new Atlas(st.s, Math.min(st.vorrat, n), maxSeite))];
    this.karten = liste.map(({ p, basis }, i) => ({
      p, basis, gross: 1, o: 1, hell: 1, gesichtSrc: p.gesicht ?? null,
      index: i, kachel: [i, null, null], inhalt: ['', null, null], wunsch: 0, ziel: 0, px: 0, tiefe: 0, sichtbar: false,
    }));
    // kleine Kacheln gleich ohne Gesicht in die Leinwand, dann alles auf einmal hochladen
    const klein = this.atlanten[0], g = klein.leinwand.getContext('2d');
    for (const k of this.karten) {
      const [x, y] = klein.ort(k.index);
      g.setTransform(klein.s, 0, 0, klein.s, x, y);
      this.zeichne(g, k.p, null);
    }
    for (const a of this.atlanten) a.hochladen(this.renderer);

    const ebene = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = ebene.index;
    geo.setAttribute('position', ebene.attributes.position);
    const attr = (name, groesse) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * groesse), groesse);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.attr = { mitte: attr('mitte', 3), groesse: attr('groesse', 2), licht: attr('licht', 2), kachel: attr('kachel', 4), stufe: attr('stufe', 1) };
    geo.instanceCount = 0;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { klein: { value: null }, mittel: { value: null }, gross: { value: null } }]);
    uniforms.klein.value = this.atlanten[0].tex;
    uniforms.mittel.value = this.atlanten[1].tex;
    uniforms.gross.value = this.atlanten[2].tex;
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, fog: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;   // nach Linien und Lichthöfen, die Karten liegen darüber
    eltern.add(this.mesh);
    this.rest = true;
    return this.karten;
  }

  /**
   * Vor jedem Bild: sichtbare Karten bestimmen, Stufen verteilen, fällige Kacheln schreiben (mit Zeitbudget) und die
   * Instanzen von hinten nach vorn sortiert eintragen. Gibt true zurück, wenn neue Kacheln zu sehen sind.
   */
  vorbereiten(kamera, hoehe) {
    if (!this.mesh) return false;
    this.neuGeladen = false;
    kamera.updateMatrixWorld();
    const m = new THREE.Matrix4().multiplyMatrices(kamera.projectionMatrix, kamera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(m);
    const f = hoehe / (2 * Math.tan(THREE.MathUtils.degToRad(kamera.fov) / 2)) * kamera.zoom;
    const v = new THREE.Vector3(), kugel = new THREE.Sphere();
    const sicht = [];
    for (const k of this.karten) {
      v.copy(k.p.pos).applyMatrix4(kamera.matrixWorldInverse);
      k.tiefe = -v.z;
      kugel.center.copy(k.p.pos);
      kugel.radius = k.basis.y * k.gross * 0.65;
      k.sichtbar = k.tiefe > 0 && this.frustum.intersectsSphere(kugel);
      // ohne Vergrößerung (Aufleuchten bei Geburt, Maus): sonst wechselt die Stufe mitten in der Animation und die Karte blinkt
      k.px = k.sichtbar ? k.basis.y * f / k.tiefe : 0;
      let w = 0;
      for (let s = STUFEN.length - 1; s > 0; s--) if (k.px >= STUFEN[s].ab * (k.wunsch >= s ? RUECK : 1)) { w = s; break; }
      k.wunsch = w;
      k.ziel = 0;
      if (k.sichtbar) sicht.push(k);
    }
    sicht.sort((a, b) => b.px - a.px);
    // große Stufen zuerst an die größten Karten; wer keine große Kachel bekommt, kann noch eine mittlere bekommen
    for (let s = STUFEN.length - 1; s > 0; s--) {
      const atlas = this.atlanten[s];
      let frei = atlas.anzahl;
      for (const k of sicht) {
        if (!frei) break;
        if (k.ziel || k.wunsch < s) continue;
        k.ziel = s;
        frei--;
      }
      // Kacheln vergeben: freie zuerst, sonst die von Karten, die diese Stufe gerade nicht brauchen
      const abgebbar = [];
      atlas.besitzer.forEach((b, i) => { if (!b) abgebbar.unshift(i); else if (b.ziel !== s) abgebbar.push(i); });
      for (const k of sicht) {
        if (k.ziel !== s || k.kachel[s] != null) continue;
        const i = abgebbar.shift();
        const alt = atlas.besitzer[i];
        if (alt) { alt.kachel[s] = null; alt.inhalt[s] = null; }
        atlas.besitzer[i] = k;
        k.kachel[s] = i;
        k.inhalt[s] = null;
      }
    }
    // fällige Kacheln: die kleine jeder sichtbaren Karte und die Zielstufe, jeweils mit dem aktuellen Gesicht
    let neu = false;
    this.rest = false;
    const t1 = performance.now();
    for (const k of sicht) {
      const soll = k.gesichtSrc ?? '';
      for (const s of k.ziel ? [k.ziel, 0] : [0]) {
        if (k.inhalt[s] === soll) continue;
        let bild = null;
        if (soll) {
          if (!this.bilder.has(soll)) { this.lade(soll); continue; }
          bild = this.bilder.get(soll);
          this.bilder.delete(soll);
          this.bilder.set(soll, bild);
        }
        if (neu && performance.now() - t1 > BUDGET_MS) { this.rest = true; continue; }
        this.schreibe(k, s, bild);
        k.inhalt[s] = soll;
        neu = true;
      }
    }
    for (const a of this.atlanten) a.mipmaps(this.renderer);
    this.puffer(sicht);
    return neu;
  }

  schreibe(k, s, bild) {
    const atlas = this.atlanten[s];
    if (!atlas.kratz) {
      atlas.kratz = document.createElement('canvas');
      atlas.kratz.width = atlas.kw;
      atlas.kratz.height = atlas.kh;
    }
    const g = atlas.kratz.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, atlas.kw, atlas.kh);
    g.setTransform(atlas.s, 0, 0, atlas.s, 0, 0);
    this.zeichne(g, k.p, bild);
    atlas.kachel(this.renderer, k.kachel[s], atlas.kratz);
  }

  lade(src) {
    if (this.laden.has(src) || this.laden.size >= LADEN_GLEICHZEITIG) return;
    this.laden.add(src);
    const img = new Image();
    const fertig = ok => {
      this.laden.delete(src);
      this.bilder.set(src, ok ? img : null);
      while (this.bilder.size > BILDER_MAX) this.bilder.delete(this.bilder.keys().next().value);
      this.neuGeladen = true;
    };
    img.onload = () => fertig(true);
    img.onerror = () => fertig(false);
    img.src = src;
  }

  // Instanzen von hinten nach vorn, damit die halb durchsichtigen Karten richtig übereinanderliegen
  puffer(sicht) {
    sicht.sort((a, b) => b.tiefe - a.tiefe);
    const { mitte, groesse, licht, kachel, stufe } = this.attr;
    sicht.forEach((k, i) => {
      // gezeigt wird die beste Kachel mit dem aktuellen Gesicht, sonst die beste vorhandene
      const soll = k.gesichtSrc ?? '';
      let s = -1;
      for (let t = STUFEN.length - 1; t >= 0 && s < 0; t--) if (k.kachel[t] != null && k.inhalt[t] === soll) s = t;
      for (let t = STUFEN.length - 1; t >= 0 && s < 0; t--) if (k.kachel[t] != null && k.inhalt[t] != null) s = t;
      if (s < 0) s = 0;
      mitte.setXYZ(i, k.p.pos.x, k.p.pos.y, k.p.pos.z);
      groesse.setXY(i, k.basis.x * k.gross, k.basis.y * k.gross);
      licht.setXY(i, k.o, k.hell);
      kachel.setXYZW(i, ...this.atlanten[s].rechteck(k.kachel[s]));
      stufe.setX(i, s);
    });
    for (const a of Object.values(this.attr)) a.needsUpdate = true;
    this.mesh.geometry.instanceCount = sicht.length;
  }

  /** Karte unter dem Zeiger (ndc wie beim Raycaster) mit Abstand zur Kamera, oder null. */
  treffer(x, y, kamera) {
    const d = new THREE.Vector3(x, y, 0.5).applyMatrix4(kamera.projectionMatrixInverse);
    const v = new THREE.Vector3();
    let best = null, abstand = Infinity;
    for (const k of this.karten) {
      if (!k.sichtbar) continue;
      v.copy(k.p.pos).applyMatrix4(kamera.matrixWorldInverse);
      if (v.z >= 0) continue;
      const t = v.z / d.z;   // der Strahl trifft die Ebene der Karte
      if (Math.abs(d.x * t - v.x) > k.basis.x * k.gross / 2 || Math.abs(d.y * t - v.y) > k.basis.y * k.gross / 2) continue;
      const a = Math.hypot(d.x * t, d.y * t, v.z);
      if (a < abstand) { best = k; abstand = a; }
    }
    return best && { karte: best, abstand };
  }
}
