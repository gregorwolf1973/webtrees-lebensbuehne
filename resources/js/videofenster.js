// Videofenster: Videos zur Zeitgeschichte aussuchen, ansehen und zuschneiden. Oben zeigt ein Zeitstrahl, welches
// Video in welchem Jahr läuft und wo Lücken sind; links die Liste (entfernte Vorschläge blass mit ＋), rechts die
// Vorschau mit Filmstreifen und Zeitleiste: ein Klick setzt den Start, Umschalt+Klick oder Rechtsklick das Ende,
// die Griffe lassen sich ziehen. Gestrichelt ist, was der 4:3-Rahmen im Hintergrund abschneidet.
import { t } from 'lb/text.js';
import { youtubeId, youtubeApi, ytFehler, sekunden, uhr, istVorschlag } from 'lb/video.js';
import { VORSCHLAEGE } from 'lb/videovorschlaege.js';

const STREIFEN = 10;   // Einzelbilder im Filmstreifen
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const VERGLEICH = ['url', 'titel', 'von', 'bis', 'start', 'ende'];

/** Vorschau für Videodateien und YouTube mit gemeinsamer Bedienung */
class Abspieler {
  constructor(ziel) { this.ziel = ziel; this.nr = 0; }

  lade(e, { stumm, start, beiFehler }) {
    this.weg();
    const nr = this.nr, id = youtubeId(e.url);
    const fehler = m => { if (nr === this.nr) beiFehler(m); };
    if (id) {
      const platz = document.createElement('div');
      this.ziel.appendChild(platz);
      youtubeApi().then(YT => {
        if (nr !== this.nr) return;
        this.yt = new YT.Player(platz, {
          host: 'https://www.youtube-nocookie.com',
          videoId: id,
          playerVars: { autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0,
            start: Math.floor(start), origin: location.origin },
          events: {
            onReady: ev => { this.bereit = true; if (stumm) ev.target.mute(); else ev.target.unMute(); ev.target.playVideo(); },
            onError: ev => fehler(ytFehler(ev.data)),
          },
        });
      }, () => fehler(t('YouTube nicht erreichbar')));
    } else {
      const v = this.v = document.createElement('video');
      v.muted = stumm;
      v.playsInline = true;
      v.preload = 'auto';
      v.addEventListener('loadedmetadata', () => { this.bereit = true; v.currentTime = Math.min(start, Math.max(0, v.duration - 1)); v.play().catch(() => {}); }, { once: true });
      v.addEventListener('error', () => fehler(t('Datei lässt sich nicht abspielen')));
      v.src = e.url;
      this.ziel.appendChild(v);
    }
  }

  weg() {
    this.nr++;
    try { this.yt?.destroy(); } catch (err) { /* schon weg */ }
    if (this.v) { this.v.removeAttribute('src'); this.v.load(); }
    this.ziel.innerHTML = '';
    this.v = this.yt = null;
    this.bereit = false;
  }

  get zeit() { return this.v ? this.v.currentTime : this.yt?.getCurrentTime?.() || 0; }
  get dauer() { return this.v ? (isFinite(this.v.duration) ? this.v.duration : 0) : this.yt?.getDuration?.() || 0; }
  get laeuft() { return this.v ? !this.v.paused && !this.v.ended : this.yt?.getPlayerState?.() === 1; }
  get zuEnde() { return this.v ? this.v.ended : this.yt?.getPlayerState?.() === 0; }
  get titel() { return this.yt?.getVideoData?.()?.title || ''; }
  spiele() { if (this.v) this.v.play().catch(() => {}); else this.yt?.playVideo?.(); }
  pause() { if (this.v) this.v.pause(); else this.yt?.pauseVideo?.(); }
  springe(s, fertig = true) { if (this.v) this.v.currentTime = s; else this.yt?.seekTo?.(s, fertig); }
  stumm(an) { if (this.v) this.v.muted = an; else if (this.yt?.mute) { if (an) this.yt.mute(); else this.yt.unMute(); } }
}

/** Titel aus dem Dateinamen einer Videoadresse */
function dateiTitel(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop());
    return name.replace(/(\.\d+p)?(\.vp9)?\.(webm|ogv|mp4|mov|ogg)/gi, '').replace(/[_-]+/g, ' ').trim();
  } catch (err) { return ''; }
}

export class VideoFenster {
  /** `beimOeffnen()` hält die Zeitreise an */
  constructor(videos, beimOeffnen) {
    this.v = videos;
    this.beimOeffnen = beimOeffnen;
    this.wahl = null;      // { e, art: 'liste' | 'vorschlag' (entfernt) | 'neu' }
    this.stumm = true;
    this.dauer = 0;
    this.streifenNr = 0;
  }

  baue() {
    const el = this.el = document.createElement('div');
    el.className = 'vf-huelle';
    el.hidden = true;
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', t('Videos zur Zeitgeschichte'));
    el.innerHTML = `<div class="vf">
      <header class="vf-oben">
        <h2>${esc(t('Videos zur Zeitgeschichte'))}</h2>
        <button class="klein" data-tun="neu">${esc(t('＋ Eigenes Video'))}</button>
        <button class="klein vf-zu" data-tun="zu" aria-label="${esc(t('Schließen'))}">✕</button>
      </header>
      <div class="vf-strahl-box">
        <div class="vf-strahl"></div>
        <div class="vf-skala"></div>
        <p class="vf-luecken"><span></span> <button class="klein" data-tun="fuellen" hidden>${esc(t('Lücken mit Vorschlägen füllen'))}</button></p>
      </div>
      <div class="vf-haupt">
        <ul class="vf-liste"></ul>
        <section class="vf-rechts">
          <p class="vf-leer">${esc(t('Wähle links ein Video, klicke oben auf ein Jahr oder füge ein eigenes Video hinzu.'))}</p>
          <div class="vf-editor" hidden>
            <div class="vf-bild" title="${esc(t('Klick: abspielen oder anhalten'))}"><div class="vf-video"></div><p class="vf-meldung" hidden></p></div>
            <div class="vf-zeitleiste">
              <div class="vf-streifen"></div>
              <div class="vf-leiste"></div>
              <div class="vf-aus vf-aus-l"></div><div class="vf-aus vf-aus-r"></div>
              <div class="vf-kopf"></div>
              <span class="vf-griff vf-start" title="${esc(t('Start – ziehen zum Verschieben'))}"></span>
              <span class="vf-griff vf-ende" title="${esc(t('Ende – ziehen zum Verschieben'))}"></span>
              <span class="vf-zeiger" hidden></span>
            </div>
            <p class="vf-tipp">${esc(t('Klick in Filmstreifen oder Zeitleiste: Start dorthin · Umschalt+Klick oder Rechtsklick: Ende · Griffe ziehen · Leertaste: abspielen/anhalten'))}</p>
            <div class="vf-knoepfe">
              <button class="klein" data-tun="spiel" aria-label="${esc(t('Abspielen oder anhalten'))}">▶</button>
              <button class="klein" data-tun="-5">−5 s</button>
              <button class="klein" data-tun="+5">+5 s</button>
              <span class="vf-uhr">0:00 / 0:00</span>
              <button class="klein" data-tun="start-hier" title="${esc(t('Start auf die gerade gezeigte Stelle'))}">${esc(t('⇤ Start hier'))}</button>
              <button class="klein" data-tun="ende-hier" title="${esc(t('Ende auf die gerade gezeigte Stelle'))}">${esc(t('Ende hier ⇥'))}</button>
              <button class="klein" data-tun="ganz">${esc(t('Ganzes Video'))}</button>
              <button class="klein" data-tun="ton" aria-label="${esc(t('Ton der Vorschau'))}">🔇</button>
            </div>
            <form class="vf-felder" autocomplete="off">
              <label class="vf-breit">${esc(t('Adresse'))} <input name="url" type="url" placeholder="${esc(t('YouTube-Link oder Videodatei (https://…)'))}"></label>
              <label class="vf-breit">${esc(t('Titel'))} <input name="titel"></label>
              <label>${esc(t('Jahre'))} <input name="von" type="number" min="1000" max="2100" aria-label="${esc(t('von'))}"> – <input name="bis" type="number" min="1000" max="2100" aria-label="${esc(t('bis'))}"></label>
              <label>${esc(t('Ausschnitt'))} <input name="start" placeholder="0:00" aria-label="${esc(t('Start'))}"> – <input name="ende" placeholder="${esc(t('Ende'))}" aria-label="${esc(t('Ende'))}"></label>
              <label class="haken vf-breit"><input type="checkbox" name="an"> ${esc(t('während der Zeitreise zeigen'))}</label>
            </form>
            <p class="vf-quelle"></p>
            <div class="vf-aktionen">
              <button class="klein" data-tun="dazu"></button>
              <button class="klein" data-tun="hintergrund">${esc(t('Im Hintergrund ansehen'))}</button>
              <button class="klein" data-tun="zuruecksetzen">${esc(t('Vorschlag zurücksetzen'))}</button>
              <button class="klein vf-weg" data-tun="weg">${esc(t('Entfernen'))}</button>
            </div>
          </div>
        </section>
      </div>
    </div>`;
    document.body.appendChild(el);
    const q = s => el.querySelector(s);
    this.liste = q('.vf-liste');
    this.strahl = q('.vf-strahl');
    this.form = q('.vf-felder');
    this.zl = q('.vf-zeitleiste');
    this.streifen = q('.vf-streifen');
    this.spieler = new Abspieler(q('.vf-video'));

    el.addEventListener('click', ev => {
      if (ev.target === el) return this.zu();
      const k = ev.target.closest('[data-tun]');
      if (k) return this.tun(k.dataset.tun);
      if (ev.target.closest('.vf-bild')) return this.tun('spiel');
      const lauf = ev.target.closest('.vf-lauf');
      if (lauf?.dataset.id) return this.waehleAus(this.v.einst.liste.find(e => e.id === lauf.dataset.id));
      if (lauf?.dataset.luecke) { const [a, b] = lauf.dataset.luecke.split('-').map(Number); return this.neu(a, b); }
      const dazu = ev.target.closest('[data-dazu]');
      if (dazu) {
        const v = VORSCHLAEGE.find(x => x.id === dazu.dataset.dazu);
        this.v.einst.liste.push({ ...v, an: true }); this.v.speichern();
        return this.waehleAus(this.v.einst.liste.at(-1));
      }
      const zeile = ev.target.closest('.vf-zeile');
      if (zeile && !ev.target.closest('input')) {
        const e = this.v.einst.liste.find(x => x.id === zeile.dataset.id);
        if (e) this.waehleAus(e);
        else this.waehleAus({ ...VORSCHLAEGE.find(x => x.id === zeile.dataset.id), an: true }, 'vorschlag');
      }
    });
    this.liste.addEventListener('change', ev => {
      const e = this.v.einst.liste.find(x => x.id === ev.target.dataset.an);
      if (!e) return;
      e.an = ev.target.checked; this.v.speichern();
      if (e === this.wahl?.e) this.form.an.checked = e.an;
      this.zeichne();
    });
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); return this.zu(); }
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest('input, button, select, textarea')) return;
      const k = { ' ': 'spiel', ArrowLeft: '-5', ArrowRight: '+5' }[ev.key];
      if (k && this.wahl) { ev.preventDefault(); this.tun(k); }
    });
    this.form.addEventListener('submit', ev => ev.preventDefault());
    this.form.addEventListener('change', ev => this.feldGeaendert(ev.target.name));
    this.zeitleisteEinrichten();
  }

  oeffne(jahr) {
    if (!this.el) this.baue();
    this.beimOeffnen?.();
    this.v.halt();
    this.v.melde = () => this.zeichne();
    this.el.hidden = false;
    this.el.focus();
    const L = this.v.einst.liste;
    const e = (this.wahl?.art === 'liste' && L.includes(this.wahl.e) && this.wahl.e) || this.v.waehle(jahr)
      || [...L].sort((x, y) => x.von - y.von)[0];
    if (e) this.waehleAus(e); else { this.wahl = null; this.zeigeEditor(); this.zeichne(); }
    this.takt();
  }

  zu() {
    if (!this.el || this.el.hidden) return;
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
    this.spieler.weg();
    this.streifenNr++;
    this.zieht = null;
    this.v.melde = null;
    document.getElementById('videos')?.focus();
  }

  waehleAus(e, art = 'liste') {
    if (!e) return;
    delete this.v.fehler[e.id];   // erneut versuchen
    this.wahl = { e, art };
    this.zeigeEditor();
    this.lade();
    this.zeichne();
    this.liste.querySelector('.gewaehlt')?.scrollIntoView({ block: 'nearest' });
  }

  neu(von, bis) {
    const j = +document.getElementById('jahr')?.value || 1900;
    this.wahl = { e: { id: 'v' + Date.now().toString(36), url: '', titel: '', von: von ?? j, bis: bis ?? von ?? j, start: 0, ende: 0, an: true }, art: 'neu' };
    this.zeigeEditor();
    this.lade();
    this.zeichne();
    this.form.url.focus();
  }

  lade() {
    const e = this.wahl?.e;
    this.dauer = 0;
    this.streifenNr++;
    this.streifen.innerHTML = '';
    this.meldung(null);
    this.leiste();
    if (!e?.url) { this.spieler.weg(); return; }
    this.spieler.lade(e, { stumm: this.stumm, start: e.start || 0, beiFehler: m => this.fehlschlag(m) });
  }

  meldung(text) {
    const m = this.el.querySelector('.vf-meldung');
    m.hidden = !text;
    m.textContent = text || '';
  }

  fehlschlag(m) {
    this.meldung('⚠ ' + m);
    if (this.wahl?.art === 'liste') { this.v.fehler[this.wahl.e.id] = m; this.zeichne(); }
  }

  /** Je Bild, solange das Fenster offen ist: Abspielkopf, Uhr, Schleife im Ausschnitt */
  takt() {
    cancelAnimationFrame(this.raf);
    if (this.el.hidden) return;
    this.raf = requestAnimationFrame(() => this.takt());
    const e = this.wahl?.e, sp = this.spieler;
    if (!e || !sp.bereit) return;
    const d = sp.dauer;
    if (d && Math.abs(d - this.dauer) > 0.5) { this.dauer = d; this.leiste(); this.filmstreifen(); }
    if (!e.titel && sp.titel) { e.titel = this.form.titel.value = sp.titel; this.uebernehmen(); }
    const z = sp.zeit, start = e.start || 0;
    if ((e.ende && z >= e.ende) || sp.zuEnde) { sp.springe(start); sp.spiele(); }
    if (sp.laeuft && this.v.fehler[e.id]) { delete this.v.fehler[e.id]; this.zeichne(); }
    if (this.dauer) this.el.querySelector('.vf-kopf').style.left = Math.min(100, z / this.dauer * 100) + '%';
    const uhrText = `${uhr(z)} / ${uhr(this.dauer)}`, k = this.el.querySelector('[data-tun="spiel"]'), zeichen = sp.laeuft ? '❚❚' : '▶';
    if (this.uhrText !== uhrText) this.el.querySelector('.vf-uhr').textContent = this.uhrText = uhrText;
    if (k.textContent !== zeichen) k.textContent = zeichen;
  }

  /** Ausschnitt, Griffe und Felder nach start/ende */
  leiste() {
    const e = this.wahl?.e, d = this.dauer;
    this.zl.classList.toggle('ohne-dauer', !d);
    if (!e) return;
    this.form.start.value = e.start ? uhr(e.start) : '';
    this.form.ende.value = e.ende ? uhr(e.ende) : '';
    if (!d) return;
    const a = Math.min(100, (e.start || 0) / d * 100), b = e.ende ? Math.min(100, e.ende / d * 100) : 100;
    const q = s => this.el.querySelector(s);
    q('.vf-aus-l').style.width = a + '%';
    q('.vf-aus-r').style.left = b + '%';
    q('.vf-start').style.left = a + '%';
    q('.vf-ende').style.left = b + '%';
  }

  async filmstreifen() {
    const nr = ++this.streifenNr, e = this.wahl.e, ziel = this.streifen;
    ziel.innerHTML = '';
    const id = youtubeId(e.url);
    if (id) {
      // YouTube legt Standbilder bei etwa einem Viertel, der Hälfte und drei Vierteln an
      ziel.innerHTML = [1, 2, 3].map(i => `<img src="https://i.ytimg.com/vi/${id}/hq${i}.jpg" style="left:${i * 25}%;width:25%" alt="">`).join('');
      return;
    }
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    const warte = (art, ms = 10000) => new Promise((ok, nein) => {
      const uhrzeit = setTimeout(nein, ms);
      v.addEventListener(art, () => { clearTimeout(uhrzeit); ok(); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(uhrzeit); nein(); }, { once: true });
    });
    // von Commons die kleinste Fassung, sonst die Datei selbst
    const klein = e.url.replace(/\.\d+p\.vp9\.webm$/, '.240p.vp9.webm');
    try {
      v.src = klein; await warte('loadedmetadata');
    } catch (err) {
      if (klein === e.url || nr !== this.streifenNr) return;
      try { v.src = e.url; await warte('loadedmetadata'); } catch (err2) { return; }
    }
    for (let i = 0; i < STREIFEN && nr === this.streifenNr; i++) {
      const p = (i + 0.5) / STREIFEN;
      v.currentTime = p * v.duration;
      try { await warte('seeked'); } catch (err) { break; }
      if (nr !== this.streifenNr) break;
      const c = document.createElement('canvas');
      c.width = 128; c.height = 96;
      const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s;
      c.getContext('2d').drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
      c.style.left = p * 100 + '%';
      ziel.appendChild(c);
    }
    v.removeAttribute('src');
    v.load();
  }

  zeitleisteEinrichten() {
    const zl = this.zl, zeiger = zl.querySelector('.vf-zeiger');
    const zeitAus = ev => { const r = zl.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * this.dauer; };
    zl.addEventListener('contextmenu', ev => ev.preventDefault());
    zl.addEventListener('pointerdown', ev => {
      if (!this.dauer || !this.wahl) return;
      const griff = ev.target.closest('.vf-griff');
      if (griff) {
        this.zieht = griff.classList.contains('vf-start') ? 'start' : 'ende';
        zl.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
      if (ev.button === 2 || ev.shiftKey) this.setzeEnde(zeitAus(ev));
      else if (ev.button === 0) this.setzeStart(zeitAus(ev));
    });
    zl.addEventListener('pointermove', ev => {
      if (!this.dauer) return;
      const s = zeitAus(ev);
      zeiger.hidden = false;
      zeiger.textContent = uhr(s);
      zeiger.style.left = s / this.dauer * 100 + '%';
      if (this.zieht === 'start') this.setzeStart(s, true);
      if (this.zieht === 'ende') this.setzeEnde(s, true);
    });
    const los = ev => {
      if (!this.zieht) return;
      const s = zeitAus(ev);
      if (this.zieht === 'start') this.setzeStart(s); else this.setzeEnde(s);
      this.zieht = null;
    };
    zl.addEventListener('pointerup', los);
    zl.addEventListener('pointercancel', () => { this.zieht = null; });
    zl.addEventListener('pointerleave', () => { if (!this.zieht) zeiger.hidden = true; });
  }

  /** Start setzen; beim Ziehen nur anzeigen, beim Loslassen oder Klicken übernehmen und von dort abspielen */
  setzeStart(s, ziehen = false) {
    const e = this.wahl.e;
    s = Math.max(0, Math.min(Math.round(s), Math.floor(this.dauer) - 1));
    if (e.ende && s > e.ende - 2) { if (ziehen) s = e.ende - 2; else e.ende = 0; }
    e.start = s;
    this.leiste();
    this.spieler.springe(s, !ziehen);
    if (!ziehen) { this.spieler.spiele(); this.uebernehmen(); }
  }

  /** Ende setzen; danach laufen die letzten Sekunden davor zur Kontrolle */
  setzeEnde(s, ziehen = false) {
    const e = this.wahl.e, start = e.start || 0;
    s = Math.round(s);
    if (s < start + 2) { if (!ziehen) return; s = start + 2; }
    e.ende = s >= this.dauer - 0.5 ? 0 : s;
    this.leiste();
    this.spieler.springe(ziehen ? s : Math.max(start, s - 3), !ziehen);
    if (!ziehen) { this.spieler.spiele(); this.uebernehmen(); }
  }

  feldGeaendert(name) {
    const e = this.wahl?.e, f = this.form;
    if (!e) return;
    if (name === 'url') {
      const url = f.url.value.trim();
      if (url === e.url) return;
      e.url = url;
      // ein YouTube-Link mit Zeitmarke (t=90, t=1m30s) setzt den Start
      const m = /[?&#](?:t|start)=([\dhms]+)/.exec(url);
      if (m && !e.start) e.start = sekunden(m[1]);
      if (!e.titel && url && !youtubeId(url)) e.titel = f.titel.value = dateiTitel(url);
      delete this.v.fehler[e.id];
      this.lade();
    }
    if (name === 'titel') e.titel = f.titel.value.trim();
    if (name === 'von' || name === 'bis') {
      e.von = Math.round(+f.von.value) || e.von;
      e.bis = Math.max(e.von, Math.round(+f.bis.value) || e.von);
      f.von.value = e.von; f.bis.value = e.bis;
    }
    if (name === 'start') {
      e.start = sekunden(f.start.value);
      if (e.ende && e.ende <= e.start) e.ende = 0;
      this.spieler.springe(e.start);
    }
    if (name === 'ende') {
      e.ende = sekunden(f.ende.value);
      if (e.ende && e.ende <= (e.start || 0)) e.ende = 0;
    }
    if (name === 'an') e.an = f.an.checked;
    this.leiste();
    this.uebernehmen();
  }

  /** Änderungen an einem Eintrag der Liste sofort merken (neue und entfernte erst mit „Hinzufügen“) */
  uebernehmen() {
    if (this.wahl?.art !== 'liste') return;
    this.v.speichern();
    this.zeichne();
    this.zeigeEditor();
  }

  tun(was) {
    const sp = this.spieler, w = this.wahl, e = w?.e, L = this.v.einst.liste;
    if (was === 'zu') return this.zu();
    if (was === 'neu') return this.neu();
    if (was === 'fuellen') return this.fuellen();
    if (!e) return;
    if (was === 'spiel') { if (sp.laeuft) sp.pause(); else sp.spiele(); }
    if (was === '-5' || was === '+5') sp.springe(Math.max(0, Math.min(this.dauer || Infinity, sp.zeit + +was)));
    if (was === 'start-hier' && this.dauer) this.setzeStart(sp.zeit);
    if (was === 'ende-hier' && this.dauer) this.setzeEnde(sp.zeit);
    if (was === 'ganz') { e.start = 0; e.ende = 0; this.leiste(); this.uebernehmen(); }
    if (was === 'ton') {
      this.stumm = !this.stumm;
      sp.stumm(this.stumm);
      this.el.querySelector('[data-tun="ton"]').textContent = this.stumm ? '🔇' : '🔊';
    }
    if (was === 'dazu') {
      if (!e.url) return this.form.url.focus();
      L.push(e); w.art = 'liste';
      this.v.speichern(); this.zeichne(); this.zeigeEditor();
    }
    if (was === 'weg') {
      this.v.einst.liste = L.filter(x => x !== e); this.v.speichern();
      if (istVorschlag(e)) { w.art = 'vorschlag'; this.zeichne(); this.zeigeEditor(); }
      else { this.wahl = null; this.spieler.weg(); this.zeigeEditor(); this.zeichne(); }
    }
    if (was === 'zuruecksetzen') {
      const neu = { ...VORSCHLAEGE.find(x => x.id === e.id), an: e.an };
      L[L.indexOf(e)] = neu;
      this.v.speichern();
      this.waehleAus(neu);
    }
    if (was === 'hintergrund') { this.zu(); this.v.vorschau(e); }
  }

  /** Entfernte Vorschläge wieder aufnehmen, soweit sie in Jahre ohne Video fallen */
  fuellen() {
    const L = this.v.einst.liste;
    for (const v of VORSCHLAEGE) {
      if (L.some(x => x.id === v.id)) continue;
      let frei = false;
      for (let j = v.von; j <= v.bis && !frei; j++) frei = !this.v.waehle(j);
      if (frei) L.push({ ...v, an: true });
    }
    this.v.speichern();
    if (this.wahl?.art === 'vorschlag') { const e = L.find(x => x.id === this.wahl.e.id); if (e) this.wahl = { e, art: 'liste' }; }
    this.zeichne();
    this.zeigeEditor();
  }

  zeigeEditor() {
    const w = this.wahl, e = w?.e, f = this.form, q = s => this.el.querySelector(s);
    q('.vf-leer').hidden = !!w;
    q('.vf-editor').hidden = !w;
    if (!w) return;
    if (document.activeElement?.form !== f) {
      f.url.value = e.url; f.titel.value = e.titel || ''; f.von.value = e.von; f.bis.value = e.bis; f.an.checked = e.an !== false;
    }
    this.leiste();
    const dazu = q('[data-tun="dazu"]');
    dazu.hidden = w.art === 'liste';
    dazu.textContent = w.art === 'neu' ? t('Hinzufügen') : t('Wieder aufnehmen');
    q('[data-tun="weg"]').hidden = w.art !== 'liste';
    const v = istVorschlag(e) && VORSCHLAEGE.find(x => x.id === e.id);
    q('[data-tun="zuruecksetzen"]').hidden = !(w.art === 'liste' && v && VERGLEICH.some(k => (v[k] || 0) !== (e[k] || 0)));
    q('[data-tun="hintergrund"]').hidden = !e.url;
    const id = youtubeId(e.url);
    const quelle = e.quelle || (id ? `https://www.youtube.com/watch?v=${id}` : e.url);
    q('.vf-quelle').innerHTML = quelle ? `${esc(t('Quelle'))}: <a href="${esc(quelle)}" target="_blank" rel="noopener">${esc(e.quelle ? new URL(quelle).hostname : id ? 'YouTube' : t('Datei'))}</a>`
      + [e.urheber, e.lizenz].filter(Boolean).map(x => ' · ' + esc(x)).join('') + (e.inhalt ? `<br>${esc(e.inhalt)}` : '') : '';
  }

  zeichne() {
    if (!this.el || this.el.hidden) return;
    const L = this.v.einst.liste, wid = this.wahl?.e.id;
    const fehlen = VORSCHLAEGE.filter(v => !L.some(x => x.id === v.id));
    // Liste: eigene und übernommene Videos, dazwischen blass die entfernten Vorschläge
    const zeilen = [...L.map(e => ({ e, drin: true })), ...fehlen.map(e => ({ e, drin: false }))]
      .sort((x, y) => x.e.von - y.e.von || x.e.bis - y.e.bis);
    this.liste.innerHTML = zeilen.map(({ e, drin }) => {
      const info = [youtubeId(e.url) ? 'YouTube' : t('Datei')];
      if (e.start || e.ende) info.push(`${uhr(e.start)}–${e.ende ? uhr(e.ende) : t('Ende')}`);
      if (istVorschlag(e)) info.push(drin ? t('Vorschlag') : t('Vorschlag, entfernt'));
      const f = this.v.fehler[e.id];
      return `<li class="vf-zeile${e.id === wid ? ' gewaehlt' : ''}${drin && e.an ? '' : ' blass'}" data-id="${esc(e.id)}">
        ${drin ? `<input type="checkbox" data-an="${esc(e.id)}"${e.an ? ' checked' : ''} aria-label="${esc(t('während der Zeitreise zeigen'))}">`
          : `<button class="vf-dazu" data-dazu="${esc(e.id)}" title="${esc(t('Wieder aufnehmen'))}">＋</button>`}
        <span class="vf-jahre">${e.von}–${e.bis}</span><span class="vf-name">${esc(e.titel || e.url)}</span>
        <small>${esc(info.join(' · '))}${f ? ` · <b class="warnung">⚠ ${esc(f)}</b>` : ''}</small></li>`;
    }).join('') || `<li class="vf-zeile blass">${esc(t('Noch keine Videos.'))}</li>`;

    // Zeitstrahl: welches Video in welchem Jahr läuft, Lücken schraffiert
    const jetzt = new Date().getFullYear();
    const A = Math.min(1600, ...L.map(e => e.von)), B = Math.max(jetzt, ...L.map(e => e.bis)) + 1;
    const pos = j => (j - A) / (B - A) * 100;
    const laeufe = [];
    for (let j = A; j < B; j++) {
      const e = this.v.waehle(j), l = laeufe.at(-1);
      if (l && l.e === e) l.bis = j; else laeufe.push({ e, von: j, bis: j });
    }
    let n = 0;
    this.strahl.innerHTML = laeufe.map(l => {
      const stil = `left:${pos(l.von)}%;width:${pos(l.bis + 1) - pos(l.von)}%`, jahre = l.von === l.bis ? l.von : `${l.von}–${l.bis}`;
      if (!l.e) return `<button class="vf-lauf luecke" style="${stil}" data-luecke="${l.von}-${l.bis}" title="${esc(t('Lücke {jahre} – Klick: Video für diese Jahre hinzufügen', { jahre }))}"></button>`;
      return `<button class="vf-lauf${n++ % 2 ? ' b' : ''}${l.e.id === wid ? ' gewaehlt' : ''}" style="${stil}" data-id="${esc(l.e.id)}" title="${esc(`${jahre} · ${l.e.titel || l.e.url}`)}"></button>`;
    }).join('');
    const marken = [];
    for (let j = Math.ceil(A / 50) * 50; j < B; j += 50) marken.push(`<span style="left:${pos(j)}%">${j}</span>`);
    this.el.querySelector('.vf-skala').innerHTML = marken.join('');
    const luecken = laeufe.filter(l => !l.e);
    this.el.querySelector('.vf-luecken span').textContent = luecken.length
      ? t('Ohne Video: {jahre}', { jahre: luecken.map(l => l.von === l.bis ? l.von : `${l.von}–${l.bis}`).join(', ') })
      : t('Lückenlos von {a} bis {b}.', { a: A, b: B - 1 });
    this.el.querySelector('[data-tun="fuellen"]').hidden = !fehlen.some(v => luecken.some(l => v.von <= l.bis && v.bis >= l.von));
  }
}
