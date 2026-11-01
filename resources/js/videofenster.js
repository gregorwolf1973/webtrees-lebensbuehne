// Videofenster: Videos zur Zeitgeschichte aussuchen, ansehen und zuschneiden. Oben zeigt je Land eine Bahn, welches
// Video in welchem Jahr dran wäre; die Reihenfolge der Bahnen (per Ziehen) ist der Vorrang bei Überschneidungen,
// Regionen und Länder lassen sich abwählen. Links die Liste mit Länderfilter
// (✕ löscht, gelöschte Vorschläge lassen sich einblenden und mit ＋ zurückholen), rechts die Vorschau mit Filmstreifen
// und Zeitleiste: ein Klick setzt den Start, Umschalt+Klick oder Rechtsklick das Ende, die Griffe lassen sich ziehen.
// Gestrichelt ist, was der 4:3-Rahmen im Hintergrund abschneidet.
import { t } from 'lb/text.js';
import { youtubeId, youtubeApi, ytFehler, sekunden, uhr, istVorschlag, REGIONEN, LAENDER, landVon, regionVon, sichereUrl } from 'lb/video.js';
import { VORSCHLAEGE } from 'lb/videovorschlaege.js';

const STREIFEN = 10;   // Einzelbilder im Filmstreifen
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Vorschau für Videodateien und YouTube mit gemeinsamer Bedienung */
class Abspieler {
  constructor(ziel) { this.ziel = ziel; this.nr = 0; }

  lade(e, { stumm, start, lautstaerke, beiFehler }) {
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
            onReady: ev => { this.bereit = true; ev.target.setVolume(lautstaerke); if (stumm) ev.target.mute(); else ev.target.unMute(); ev.target.playVideo(); },
            onError: ev => fehler(ytFehler(ev.data)),
          },
        });
      }, () => fehler(t('YouTube nicht erreichbar')));
    } else {
      const v = this.v = document.createElement('video');
      v.muted = stumm;
      v.volume = lautstaerke / 100;
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
  lautstaerke(w) { if (this.v) this.v.volume = w / 100; else this.yt?.setVolume?.(w); }
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
    this.wahl = null;      // { e, art: 'liste' | 'vorschlag' (gelöscht) | 'neu' }
    this.filter = '';      // Liste nur für eine Region ('r:Europa') oder ein Land ('l:USA')
    this.geloeschteZeigen = false;
    this.geloescht = null; // { e, i } zum Rückgängigmachen
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
        <button class="klein" data-tun="rueckgaengig" hidden></button>
        <button class="klein" data-tun="neu">${esc(t('＋ Eigenes Video'))}</button>
        <button class="klein vf-zu" data-tun="zu" aria-label="${esc(t('Schließen'))}">✕</button>
      </header>
      <div class="vf-strahl-box">
        <div class="vf-regionen-zeile">
          <span class="vf-regionen">${esc(t('Länder – wer oben steht, hat Vorrang'))}</span>
          <button class="klein vf-info" data-tun="info" aria-expanded="false" title="${esc(t('Wie die Zeitreise das Video wählt'))}">ⓘ ${esc(t('Regel'))}</button>
        </div>
        <div class="vf-regel" hidden>
          <p><b>${esc(t('So wählt die Zeitreise das Video:'))}</b></p>
          <ul>
            <li>${esc(t('Es laufen nur eingeschaltete Videos (Haken in der Liste) aus Ländern und Regionen mit Haken.'))}</li>
            <li>${esc(t('Ein Video läuft genau in seinen Jahren „von–bis“ und endet mit dem Jahr „bis“. Sein Ausschnitt wiederholt sich so lange.'))}</li>
            <li>${esc(t('Überschneiden sich Videos, gewinnt das Land, das hier weiter oben steht. Zum Ändern eine Region oder ein Land am ⠿ nach oben oder unten ziehen (oder ⠿ anklicken und die Pfeiltasten nehmen). Länder ziehen innerhalb ihrer Region.'))}</li>
            <li>${esc(t('Zugeklappt zeigt eine Region, welches ihrer Videos jeweils dran wäre; ▸ klappt ihre Länder auf.'))}</li>
            <li>${esc(t('Im selben Land gehen eigene Videos den Vorschlägen vor, sonst gewinnt das genaueste – das mit den wenigsten Jahren, etwa Magdeburg 1631 im Dreißigjährigen Krieg.'))}</li>
            <li>${esc(t('Beginnt ein vorrangiges Video, löst es das laufende frühestens nach 10 Sekunden ab, damit nichts flackert.'))}</li>
            <li>${esc(t('Jede Bahn zeigt, welches Video dieses Landes in welchem Jahr dran wäre. Ein Klick auf einen Abschnitt öffnet das Video, ein Klick auf eine Lücke legt eins für diese Jahre an.'))}</li>
          </ul>
        </div>
        <div class="vf-bahnen"></div>
        <div class="vf-bahn vf-skala-zeile"><span></span><span></span><div class="vf-skala"></div></div>
        <p class="vf-luecken"><span></span> <button class="klein" data-tun="fuellen" hidden>${esc(t('Lücken mit Vorschlägen füllen'))}</button></p>
      </div>
      <div class="vf-haupt">
        <div class="vf-links">
          <div class="vf-listenkopf">
            <select class="vf-filter" aria-label="${esc(t('Liste nach Land filtern'))}"></select>
            <label class="haken"><input type="checkbox" class="vf-geloeschte"> ${esc(t('gelöschte Vorschläge'))}</label>
          </div>
          <ul class="vf-liste"></ul>
        </div>
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
              <input type="range" class="vf-laut" min="0" max="100" aria-label="${esc(t('Lautstärke der Videos'))}" title="${esc(t('Lautstärke der Videos, auch während der Zeitreise'))}">
            </div>
            <form class="vf-felder" autocomplete="off">
              <label class="vf-breit">${esc(t('Adresse'))} <input name="url" type="url" placeholder="${esc(t('YouTube-Link oder Videodatei (https://…)'))}"></label>
              <label class="vf-breit">${esc(t('Titel'))} <input name="titel"></label>
              <label>${esc(t('Jahre'))} <input name="von" type="number" min="1000" max="2100" aria-label="${esc(t('von'))}"> – <input name="bis" type="number" min="1000" max="2100" aria-label="${esc(t('bis'))}"></label>
              <label>${esc(t('Ausschnitt'))} <input name="start" placeholder="0:00" aria-label="${esc(t('Start'))}"> – <input name="ende" placeholder="${esc(t('Ende'))}" aria-label="${esc(t('Ende'))}"></label>
              <label title="${esc(t('Land, in dem das Ereignis stattfand'))}">${esc(t('Land'))} <input name="land" list="vf-laender-liste" placeholder="${esc(t('z. B. Deutschland'))}"></label>
              <label class="haken"><input type="checkbox" name="an"> ${esc(t('während der Zeitreise zeigen'))}</label>
              <datalist id="vf-laender-liste">${LAENDER.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
            </form>
            <p class="vf-quelle"></p>
            <div class="vf-aktionen">
              <button class="klein" data-tun="dazu"></button>
              <button class="klein" data-tun="hintergrund">${esc(t('Im Hintergrund ansehen'))}</button>
              <button class="klein" data-tun="zuruecksetzen">${esc(t('Vorschlag zurücksetzen'))}</button>
              <button class="klein vf-weg" data-tun="weg">${esc(t('Löschen'))}</button>
            </div>
          </div>
        </section>
      </div>
    </div>`;
    document.body.appendChild(el);
    const q = s => el.querySelector(s);
    this.liste = q('.vf-liste');
    this.bahnen = q('.vf-bahnen');
    this.form = q('.vf-felder');
    this.zl = q('.vf-zeitleiste');
    this.streifen = q('.vf-streifen');
    this.spieler = new Abspieler(q('.vf-video'));
    // dieselbe Lautstärke wie während der Zeitreise; lauter stellen schaltet den Ton der Vorschau ein
    q('.vf-laut').addEventListener('input', ev => {
      const w = +ev.target.value;
      this.v.lautstaerke(w);
      document.getElementById('videos-lautstaerke').value = w;
      this.spieler.lautstaerke(w);
      if (this.stumm && w > 0) this.tun('ton');
    });

    el.addEventListener('click', ev => {
      if (ev.target === el) return this.zu();
      const k = ev.target.closest('[data-tun]');
      if (k) return this.tun(k.dataset.tun);
      if (ev.target.closest('.vf-bild')) return this.tun('spiel');
      const lauf = ev.target.closest('.vf-lauf');
      if (lauf?.dataset.id) return this.waehleAus(this.v.einst.liste.find(e => e.id === lauf.dataset.id));
      if (lauf?.dataset.luecke) {
        const [a, b] = lauf.dataset.luecke.split('-').map(Number);
        const land = lauf.closest('.vf-bahn')?.dataset.land ?? lauf.closest('.vf-gruppe')?.dataset.laender.split('|')[0];
        return this.neu(a, b, land === 'Ohne Land' ? '' : land);
      }
      const loeschen = ev.target.closest('[data-loeschen]');
      if (loeschen) return this.loesche(this.v.einst.liste.find(e => e.id === loeschen.dataset.loeschen));
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
    // Regionen und Länder ab- und wieder zuwählen
    this.el.querySelector('.vf-strahl-box').addEventListener('change', ev => {
      const name = ev.target.dataset.aus;
      if (name == null) return;
      const aus = this.v.einst.aus;
      const i = aus.indexOf(name);
      if (ev.target.checked) { if (i >= 0) aus.splice(i, 1); } else if (i < 0) aus.push(name);
      this.v.speichern();
      this.zeichne();
    });
    q('.vf-filter').addEventListener('change', ev => { this.filter = ev.target.value; this.zeichne(); });
    q('.vf-geloeschte').addEventListener('change', ev => { this.geloeschteZeigen = ev.target.checked; this.zeichne(); });
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); return this.zu(); }
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest('input, button, select, textarea')) return;
      const k = { ' ': 'spiel', ArrowLeft: '-5', ArrowRight: '+5' }[ev.key];
      if (k && this.wahl) { ev.preventDefault(); this.tun(k); }
    });
    this.form.addEventListener('submit', ev => ev.preventDefault());
    this.form.addEventListener('change', ev => this.feldGeaendert(ev.target.name));
    this.zeitleisteEinrichten();
    this.bahnenEinrichten();
  }

  /** Regionen und Länder am ⠿ ziehen (oder mit den Pfeiltasten verschieben): ihre Reihenfolge ist der Vorrang.
   *  Regionen ziehen gegeneinander, Länder innerhalb ihrer Region. */
  bahnenEinrichten() {
    const stueck = griff => griff.closest('.vf-laender-bahnen > .vf-bahn') || griff.closest('.vf-gruppe');
    const geschwister = el => [...el.parentElement.children].filter(x => x.classList.contains(el.classList.contains('vf-gruppe') ? 'vf-gruppe' : 'vf-bahn'));
    const kennung = el => el.dataset.land || el.dataset.region;
    const merken = el => {
      const sichtbar = [...this.bahnen.querySelectorAll('.vf-gruppe')].flatMap(g => g.dataset.laender.split('|'));
      const reihe = [...this.bahnen.querySelectorAll('.vf-gruppe')].flatMap(g => {
        const innen = [...g.querySelectorAll('.vf-laender-bahnen > .vf-bahn')].map(b => b.dataset.land);
        return innen.length ? innen : g.dataset.laender.split('|');
      });
      // nicht sichtbare Länder behalten ihren Platz hinter den sichtbaren
      this.v.einst.reihenfolge = [...reihe, ...this.v.reihenfolge().filter(l => !sichtbar.includes(l))];
      this.v.speichern();
      const k = kennung(el);
      this.zeichne();
      [...this.bahnen.querySelectorAll('.vf-gruppe, .vf-laender-bahnen > .vf-bahn')].find(x => kennung(x) === k)?.querySelector('.vf-zieh')?.focus();
    };
    this.bahnen.addEventListener('pointerdown', ev => {
      const griff = ev.target.closest('.vf-zieh');
      if (!griff || ev.button !== 0) return;
      ev.preventDefault();
      const el = stueck(griff);
      el.classList.add('zieht');
      const ziehen = e2 => {
        const andere = geschwister(el).filter(x => x !== el);
        const vor = andere.find(b => { const r = b.getBoundingClientRect(); return e2.clientY < r.top + r.height / 2; });
        if (vor) { if (el.nextElementSibling !== vor) el.parentElement.insertBefore(el, vor); }
        else if (andere.length && el !== andere.at(-1).nextElementSibling) andere.at(-1).after(el);
      };
      const los = () => {
        removeEventListener('pointermove', ziehen);
        removeEventListener('pointerup', los);
        removeEventListener('pointercancel', los);
        el.classList.remove('zieht');
        merken(el);
      };
      addEventListener('pointermove', ziehen);
      addEventListener('pointerup', los);
      addEventListener('pointercancel', los);
    });
    this.bahnen.addEventListener('keydown', ev => {
      const griff = ev.target.closest('.vf-zieh');
      if (!griff || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
      ev.preventDefault();
      ev.stopPropagation();
      const el = stueck(griff), reihe = geschwister(el), i = reihe.indexOf(el);
      const nachbar = reihe[ev.key === 'ArrowUp' ? i - 1 : i + 1];
      if (!nachbar) return;
      if (ev.key === 'ArrowUp') nachbar.before(el); else nachbar.after(el);
      merken(el);
    });
    // Regionen auf- und zuklappen
    this.bahnen.addEventListener('click', ev => {
      const k = ev.target.closest('.vf-auf');
      if (!k) return;
      const r = k.closest('.vf-gruppe').dataset.region, offen = this.v.einst.offen;
      if (offen.includes(r)) offen.splice(offen.indexOf(r), 1); else offen.push(r);
      this.v.speichern();
      this.zeichne();
    });
  }

  oeffne(jahr) {
    if (!this.el) this.baue();
    this.beimOeffnen?.();
    this.v.halt();
    this.v.melde = () => this.zeichne();
    this.el.hidden = false;
    this.el.querySelector('.vf-laut').value = this.v.einst.lautstaerke;
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
    this.geloescht = null;
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

  neu(von, bis, land) {
    const j = +document.getElementById('jahr')?.value || 1900;
    if (land == null) land = this.filter.startsWith('l:') ? this.filter.slice(2) : '';
    this.wahl = { e: { id: 'v' + Date.now().toString(36), url: '', titel: '', land, von: von ?? j, bis: bis ?? von ?? j, start: 0, ende: 0, an: true }, art: 'neu' };
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
    this.spieler.lade(e, { stumm: this.stumm, start: e.start || 0, lautstaerke: this.v.einst.lautstaerke, beiFehler: m => this.fehlschlag(m) });
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
    // am Ende des Ausschnitts einmal zurückspringen (YouTube meldet die neue Stelle erst nach ein paar Bildern)
    if (((e.ende && z >= e.ende) || sp.zuEnde) && !(this.springt > performance.now())) { sp.springe(start); sp.spiele(); this.springt = performance.now() + 600; }
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
      try {
        v.src = klein; await warte('loadedmetadata');
      } catch (err) {
        if (klein === e.url || nr !== this.streifenNr) return;
        v.src = e.url; await warte('loadedmetadata');
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
    } catch (err) { /* ohne Filmstreifen */ } finally {
      v.removeAttribute('src');
      v.load();
    }
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
    if (e.ende && s > e.ende - 2) { if (ziehen) s = e.ende - 2; else { e.ende = 0; this.merke('ende'); } }
    e.start = s;
    this.merke('start');
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
    this.merke('ende');
    this.leiste();
    this.spieler.springe(ziehen ? s : Math.max(start, s - 3), !ziehen);
    if (!ziehen) { this.spieler.spiele(); this.uebernehmen(); }
  }

  /** Eigene Änderung an einem Vorschlag merken: dieses Feld folgt dann nicht mehr dem Katalog */
  merke(feld) {
    const e = this.wahl?.e;
    if (!e || !istVorschlag(e)) return;
    e.geaendert ??= [];
    if (!e.geaendert.includes(feld)) e.geaendert.push(feld);
  }

  feldGeaendert(name) {
    const e = this.wahl?.e, f = this.form;
    if (!e) return;
    if (name !== 'an') this.merke(name === 'von' || name === 'bis' ? 'von' : name);
    if (name === 'von' || name === 'bis') this.merke('bis');
    if (name === 'url') {
      const url = f.url.value.trim();
      if (url === e.url) return;
      e.url = url;
      // ein YouTube-Link mit Zeitmarke (t=90, t=1m30s) setzt den Start
      const m = /[?&#](?:t|start)=([\dhms]+)/.exec(url);
      if (m && !e.start) { e.start = sekunden(m[1]); this.merke('start'); }
      if (!e.titel && url && !youtubeId(url)) e.titel = f.titel.value = dateiTitel(url);
      delete this.v.fehler[e.id];
      this.lade();
    }
    if (name === 'titel') e.titel = f.titel.value.trim();
    if (name === 'land') e.land = f.land.value.trim();
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
    if (was === 'info') {
      const r = this.el.querySelector('.vf-regel'), k = this.el.querySelector('.vf-info');
      r.hidden = !r.hidden;
      k.setAttribute('aria-expanded', !r.hidden);
      return;
    }
    if (was === 'rueckgaengig' && this.geloescht) {
      const { e: x, i } = this.geloescht;
      this.geloescht = null;
      if (!L.some(y => y.id === x.id)) L.splice(Math.min(i, L.length), 0, x);
      this.v.speichern();
      return this.waehleAus(x);
    }
    if (!e) return;
    if (was === 'spiel') { if (sp.laeuft) sp.pause(); else sp.spiele(); }
    if (was === '-5' || was === '+5') sp.springe(Math.max(0, Math.min(this.dauer || Infinity, sp.zeit + +was)));
    if (was === 'start-hier' && this.dauer) this.setzeStart(sp.zeit);
    if (was === 'ende-hier' && this.dauer) this.setzeEnde(sp.zeit);
    if (was === 'ganz') { e.start = 0; e.ende = 0; this.merke('start'); this.merke('ende'); this.leiste(); this.uebernehmen(); }
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
    if (was === 'weg') this.loesche(e);
    if (was === 'zuruecksetzen') {
      const neu = { ...VORSCHLAEGE.find(x => x.id === e.id), an: e.an };
      L[L.indexOf(e)] = neu;
      this.v.speichern();
      this.waehleAus(neu);
    }
    if (was === 'hintergrund') { this.zu(); this.v.vorschau(e); }
  }

  /** Video löschen; ein gelöschter Vorschlag kommt nicht von selbst wieder, lässt sich aber einblenden und zurückholen */
  loesche(e) {
    const L = this.v.einst.liste, i = L.indexOf(e);
    if (i < 0) return;
    L.splice(i, 1);
    this.v.speichern();
    this.geloescht = { e, i };
    if (this.wahl?.e === e) {
      if (istVorschlag(e) && this.geloeschteZeigen) this.wahl.art = 'vorschlag';
      else { this.wahl = null; this.spieler.weg(); }
    }
    this.zeigeEditor();
    this.zeichne();
  }

  /** Gelöschte Vorschläge wieder aufnehmen, soweit sie in Jahre ohne Video fallen */
  fuellen() {
    const L = this.v.einst.liste;
    for (const v of VORSCHLAEGE) {
      if (L.some(x => x.id === v.id)) continue;
      let frei = false;
      for (let j = v.von; j <= v.bis && !frei; j++) frei = !this.v.waehle(j);
        if (frei && !this.v.abgewaehlt(v)) L.push({ ...v, an: true });
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
    const r = q('[data-tun="rueckgaengig"]');
    r.hidden = !this.geloescht;
    if (!w) return;
    if (document.activeElement?.form !== f) {
      f.url.value = e.url; f.titel.value = e.titel || ''; f.von.value = e.von; f.bis.value = e.bis; f.an.checked = e.an !== false;
      f.land.value = e.land || '';
    }
    if (this.geloescht) r.textContent = t('↶ „{titel}“ wiederherstellen', { titel: (this.geloescht.e.titel || t('Video')).slice(0, 40) });
    this.leiste();
    const dazu = q('[data-tun="dazu"]');
    dazu.hidden = w.art === 'liste';
    dazu.textContent = w.art === 'neu' ? t('Hinzufügen') : t('Wieder aufnehmen');
    q('[data-tun="weg"]').hidden = w.art !== 'liste';
    q('[data-tun="zuruecksetzen"]').hidden = !(w.art === 'liste' && istVorschlag(e) && e.geaendert?.length);
    q('[data-tun="hintergrund"]').hidden = !e.url;
    const id = youtubeId(e.url);
    const quelle = sichereUrl(e.quelle || (id ? `https://www.youtube.com/watch?v=${id}` : e.url));
    q('.vf-quelle').innerHTML = quelle ? `${esc(t('Quelle'))}: <a href="${esc(quelle)}" target="_blank" rel="noopener">${esc(e.quelle ? new URL(quelle).hostname : id ? 'YouTube' : t('Datei'))}</a>`
      + [e.urheber, e.lizenz].filter(Boolean).map(x => ' · ' + esc(x)).join('') + (e.inhalt ? `<br>${esc(e.inhalt)}` : '') : '';
  }

  zeichne() {
    if (!this.el || this.el.hidden) return;
    const L = this.v.einst.liste, wid = this.wahl?.e.id, aus = this.v.einst.aus;
    const fehlen = VORSCHLAEGE.filter(v => !L.some(x => x.id === v.id));

    // Länder (in der Reihenfolge ihres Vorrangs) und Regionen der Liste, mit Anzahl
    const zahl = Object.create(null);
    for (const e of L) { zahl[regionVon(e)] = (zahl[regionVon(e)] || 0) + 1; zahl['l:' + landVon(e)] = (zahl['l:' + landVon(e)] || 0) + 1; }
    const laender = this.v.reihenfolge().filter(l => zahl['l:' + l]);
    const regionen = REGIONEN.filter(r => zahl[r]);
    const regionDes = l => regionVon({ land: l === 'Ohne Land' ? '' : l });
    const laenderIn = r => laender.filter(l => regionDes(l) === r && l !== r);

    // Liste: nach Land gefiltert; gelöschte Vorschläge nur auf Wunsch, blass mit ＋
    const passt = e => !this.filter || (this.filter.startsWith('r:') ? regionVon(e) === this.filter.slice(2) : landVon(e) === this.filter.slice(2));
    const zeilen = [...L.map(e => ({ e, drin: true })), ...(this.geloeschteZeigen ? fehlen.map(e => ({ e, drin: false })) : [])]
      .filter(z => passt(z.e) || z.e.id === wid)
      .sort((x, y) => x.e.von - y.e.von || x.e.bis - y.e.bis);
    this.liste.innerHTML = zeilen.map(({ e, drin }) => {
      const abgewaehlt = this.v.abgewaehlt(e);
      const info = [youtubeId(e.url) ? 'YouTube' : t('Datei'), landVon(e) === 'Ohne Land' ? t('ohne Land') : landVon(e)];
      if (e.start || e.ende) info.push(`${uhr(e.start)}–${e.ende ? uhr(e.ende) : t('Ende')}`);
      if (istVorschlag(e)) info.push(drin ? t('Vorschlag') : t('gelöscht'));
      if (abgewaehlt) info.push(t('Land abgewählt'));
      const f = this.v.fehler[e.id];
      return `<li class="vf-zeile${e.id === wid ? ' gewaehlt' : ''}${drin && e.an && !abgewaehlt ? '' : ' blass'}" data-id="${esc(e.id)}">
        ${drin ? `<input type="checkbox" data-an="${esc(e.id)}"${e.an ? ' checked' : ''} aria-label="${esc(t('während der Zeitreise zeigen'))}">`
          : `<button class="vf-dazu" data-dazu="${esc(e.id)}" title="${esc(t('Wieder aufnehmen'))}">＋</button>`}
        <span class="vf-jahre">${e.von}–${e.bis}</span><span class="vf-name">${esc(e.titel || e.url)}</span>
        ${drin ? `<button class="vf-loeschen" data-loeschen="${esc(e.id)}" title="${esc(t('Löschen'))}" aria-label="${esc(t('Löschen'))}">✕</button>` : ''}
        <small>${esc(info.join(' · '))}${f ? ` · <b class="warnung">⚠ ${esc(f)}</b>` : ''}</small></li>`;
    }).join('') || `<li class="vf-zeile blass">${esc(this.filter ? t('Keine Videos für dieses Land.') : t('Noch keine Videos.'))}</li>`;

    const filter = this.el.querySelector('.vf-filter');
    filter.innerHTML = `<option value="">${esc(t('Alle Länder'))} (${L.length})</option>` + regionen.map(r =>
      `<option value="r:${esc(r)}">${esc(t(r))} (${zahl[r] || 0})</option>`
      + laenderIn(r).map(l => `<option value="l:${esc(l)}">  · ${esc(l)} (${zahl['l:' + l] || 0})</option>`).join('')).join('');
    filter.value = this.filter;
    if (filter.value !== this.filter) { this.filter = ''; filter.value = ''; }

    // Zeitstrahl: je Land eine Bahn mit dem dort jeweils vorrangigen Video; abgewählte Länder und Regionen blass
    const jetzt = new Date().getFullYear();
    const A = Math.min(1600, ...L.map(e => e.von)), B = Math.max(jetzt, ...L.map(e => e.bis)) + 1;
    const pos = j => (j - A) / (B - A) * 100;
    const laeufe = waehle => {
      const r = [];
      for (let j = A; j < B; j++) {
        const e = waehle(j), l = r.at(-1);
        if (l && l.e === e) l.bis = j; else r.push({ e, von: j, bis: j });
      }
      return r;
    };
    const bahn = nur => {
      let n = 0;
      return laeufe(j => this.v.waehle(j, nur)).map(l => {
        const stil = `left:${pos(l.von)}%;width:${pos(l.bis + 1) - pos(l.von)}%`, jahre = l.von === l.bis ? l.von : `${l.von}–${l.bis}`;
        if (!l.e) return `<button class="vf-lauf luecke" style="${stil}" data-luecke="${l.von}-${l.bis}" title="${esc(t('{jahre} ohne Video – Klick: Video für diese Jahre hinzufügen', { jahre }))}"></button>`;
        return `<button class="vf-lauf${n++ % 2 ? ' b' : ''}${l.e.id === wid ? ' gewaehlt' : ''}" style="${stil}" data-id="${esc(l.e.id)}" title="${esc(`${jahre} · ${l.e.titel || l.e.url} (${landVon(l.e)})`)}"></button>`;
      }).join('');
    };
    // Regionen in der Reihenfolge ihres ersten Landes; zugeklappt eine Sammelbahn, aufgeklappt die Länder darunter
    const gruppen = [];
    for (const l of laender) {
      const r = regionDes(l);
      let g = gruppen.find(x => x.r === r);
      if (!g) gruppen.push(g = { r, laender: [] });
      g.laender.push(l);
    }
    const griff = name => `<button class="vf-zieh" title="${esc(t('Ziehen oder Pfeiltasten: Vorrang ändern'))}" aria-label="${esc(t('Vorrang von {name} ändern', { name }))}">⠿</button>`;
    this.bahnen.innerHTML = gruppen.map(({ r, laender: ls }) => {
      const nurEines = ls.length === 1 && ls[0] === r, offen = !nurEines && this.v.einst.offen.includes(r);
      const anzahl = ls.reduce((n, l) => n + zahl['l:' + l], 0);
      const kopf = `<div class="vf-bahn vf-gruppen-bahn">${griff(t(r))}
        <span class="vf-gruppen-name">${nurEines ? '' : `<button class="vf-auf" aria-expanded="${offen}" title="${esc(offen ? t('Länder zuklappen') : t('Länder aufklappen'))}">${offen ? '▾' : '▸'}</button>`}
          <label class="haken" title="${esc(t('Videos dieser Region während der Zeitreise zeigen'))}"><input type="checkbox" data-aus="${esc(r)}"${aus.includes(r) ? '' : ' checked'}> ${esc(t(r))} <small>${anzahl}</small></label></span>
        <div class="vf-strahl">${bahn({ region: r })}</div></div>`;
      const laenderBahnen = nurEines ? '' : `<div class="vf-laender-bahnen"${offen ? '' : ' hidden'}>` + ls.map(l => `<div class="vf-bahn${aus.includes(l) ? ' aus' : ''}" data-land="${esc(l)}">
        ${griff(t(l))}
        <label class="haken" title="${esc(t('Videos dieses Landes während der Zeitreise zeigen'))}"><input type="checkbox" data-aus="${esc(l)}"${aus.includes(l) ? '' : ' checked'}${aus.includes(r) ? ' disabled' : ''}> ${esc(t(l))} <small>${zahl['l:' + l]}</small></label>
        <div class="vf-strahl">${bahn({ land: l })}</div></div>`).join('') + '</div>';
      return `<div class="vf-gruppe${aus.includes(r) ? ' aus' : ''}" data-region="${esc(r)}" data-laender="${esc(ls.join('|'))}">${kopf}${laenderBahnen}</div>`;
    }).join('');
    const marken = [];
    for (let j = Math.ceil(A / 50) * 50; j < B; j += 50) marken.push(`<span style="left:${pos(j)}%">${j}</span>`);
    this.el.querySelector('.vf-skala').innerHTML = marken.join('');

    // was die Zeitreise mit der jetzigen Auswahl abdeckt
    const luecken = laeufe(j => this.v.waehle(j)).filter(l => !l.e);
    this.el.querySelector('.vf-luecken span').textContent = luecken.length
      ? t('Zeitreise ohne Video: {jahre}', { jahre: luecken.map(l => l.von === l.bis ? l.von : `${l.von}–${l.bis}`).join(', ') })
      : t('Die Zeitreise hat von {a} bis {b} in jedem Jahr ein Video.', { a: A, b: B - 1 });
    this.el.querySelector('[data-tun="fuellen"]').hidden = !fehlen.some(v => !this.v.abgewaehlt(v) && luecken.some(l => v.von <= l.bis && v.bis >= l.von));
  }
}
