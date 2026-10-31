// Videos zur Zeitgeschichte: Während der Zeitreise läuft halb durchsichtig hinter dem Stammbaum ein Film zu den gerade
// erreichten Jahren – eine Videodatei (etwa von Wikimedia Commons) oder ein YouTube-Video, jeweils auch als Ausschnitt.
// Die Auswahl merkt sich der Browser (localStorage lb-videos).
import { t } from 'lb/text.js';

// Vorgaben: gemeinfreie Filme von Wikimedia Commons, als abspielbare WebM-Fassung
const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/';
const VORGABEN = [
  { id: 'c-ellis', titel: 'Einwanderer auf Ellis Island', von: 1892, bis: 1913,
    url: COMMONS + 'b/b7/Ellis_Island_immigration_footage.ogv/Ellis_Island_immigration_footage.ogv.240p.vp9.webm' },
  { id: 'c-ww1', titel: 'Erster Weltkrieg: Aufnahmen von der Front', von: 1914, bis: 1918, start: 120,
    url: COMMONS + '3/39/Flashes_of_Action-_Actualities_of_the_World_War.webm/Flashes_of_Action-_Actualities_of_the_World_War.webm.1080p.vp9.webm' },
  { id: 'c-franzjoseph', titel: 'Begräbnis Kaiser Franz Josephs, Wien 1916', von: 1916, bis: 1917,
    url: COMMONS + 'd/dd/Funeral_Franz-Joseph.webm/Funeral_Franz-Joseph.webm.480p.vp9.webm' },
  { id: 'c-aachen', titel: 'Zweiter Weltkrieg: Kampf um Aachen 1944', von: 1939, bis: 1944,
    url: COMMONS + '0/0f/111-adc-2655_Fall_of_Aachen_Germany.webm/111-adc-2655_Fall_of_Aachen_Germany.webm.1080p.vp9.webm' },
  { id: 'c-truemmer', titel: 'Zerstörte Städte 1945: Nürnberg und Darmstadt', von: 1945, bis: 1948,
    url: COMMONS + '1/1e/Bomb-damaged_Nuremberg_and_Darmstadt.webm/Bomb-damaged_Nuremberg_and_Darmstadt.webm.480p.vp9.webm' },
  { id: 'c-mond', titel: 'Mondlandung 1969', von: 1969, bis: 1970,
    url: COMMONS + 'a/a6/Apollo_11_Landing_-_first_steps_on_the_moon.ogv/Apollo_11_Landing_-_first_steps_on_the_moon.ogv.240p.vp9.webm' },
];
const MINDEST = 10000;   // ein Video läuft mindestens so lange (ms), auch wenn die Zeitreise seine Jahre schneller verlässt
const BLENDE = 1200;     // Ein- und Ausblenden (ms), passend zur CSS-Übergangszeit

/** YouTube-Kennung aus einem Link (watch?v=, youtu.be/, shorts/, embed/, live/) oder null */
export function youtubeId(url) {
  const m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url || '');
  return m ? m[1] : null;
}

/** Zeitangabe in Sekunden: „90“, „1:30“, „1:02:03“, „1m30s“ */
export function sekunden(s) {
  s = String(s ?? '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(+s);
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (hms && s) return (+(hms[1] || 0)) * 3600 + (+(hms[2] || 0)) * 60 + (+(hms[3] || 0));
  return s.split(':').reduce((summe, teil) => summe * 60 + (+teil || 0), 0);
}
const uhr = s => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

let ytLaden = null;
function youtube() {
  ytLaden ??= new Promise((ok, fehler) => {
    if (window.YT?.Player) return ok(window.YT);
    const vorher = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { vorher?.(); ok(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytLaden = null; fehler(new Error('YouTube nicht erreichbar')); };
    document.head.appendChild(s);
  });
  return ytLaden;
}

function laden() {
  let e = {};
  try { e = JSON.parse(localStorage.getItem('lb-videos') || '{}'); } catch (err) { /* Vorgaben */ }
  return { an: e.an ?? true, ton: e.ton ?? false, deckkraft: e.deckkraft ?? 35, groesse: e.groesse ?? 100, liste: Array.isArray(e.liste) ? e.liste : VORGABEN.map(v => ({ ...v, an: true })) };
}

export class Videos {
  /** `hintergrund(an)` schaltet die Bühne durchsichtig (Himmel aus), solange ein Video zu sehen ist. */
  constructor(buehne, hintergrund) {
    this.hintergrund = hintergrund;
    this.schicht = document.createElement('div');
    this.schicht.id = 'video-schicht';
    this.schicht.hidden = true;
    this.schicht.setAttribute('aria-hidden', 'true');
    buehne.prepend(this.schicht);
    this.einst = laden();
    this.aktiv = null;      // { e, huelle, player, seit, vorschau }
    this.fehler = {};       // id → Meldung, wenn ein Video nicht läuft
    this.durchsichtig = false;
    this.schicht.style.setProperty('--video-deckkraft', this.einst.deckkraft / 100);
    this.schicht.style.setProperty('--video-hoehe', this.einst.groesse + '%');
  }

  speichern() {
    try { localStorage.setItem('lb-videos', JSON.stringify(this.einst)); } catch (e) { /* ohne Speicher */ }
  }

  /** Das passende Video zu einem Jahr: unter den eingeschalteten das zuletzt beginnende, dessen Jahre laufen */
  waehle(j) {
    let beste = null;
    for (const e of this.einst.liste) {
      if (!e.an || this.fehler[e.id] || j < e.von || j >= e.bis + 1) continue;
      if (!beste || e.von > beste.von) beste = e;
    }
    return beste;
  }

  /** Je Bild der Zeitreise aufrufen */
  jahr(j) {
    if (!this.einst.an) return this.halt();
    const wunsch = this.waehle(j), a = this.aktiv;
    if (a && !a.vorschau && (a.e.id === wunsch?.id || performance.now() - a.seit < MINDEST)) return;
    if (!a && !wunsch) return;
    this.wechsle(wunsch);
  }

  /** Zeitreise angehalten: Video ausblenden */
  halt() {
    if (this.aktiv) this.wechsle(null);
  }

  vorschau(e) {
    if (this.aktiv?.vorschau && this.aktiv.e.id === e.id) return this.wechsle(null);
    this.wechsle(e, true);
  }

  wechsle(e, vorschau = false) {
    const alt = this.aktiv;
    if (alt) {
      alt.huelle.classList.remove('an');
      setTimeout(() => {
        try { alt.player?.destroy?.(); } catch (err) { /* schon weg */ }
        alt.huelle.querySelector('video')?.removeAttribute('src');
        alt.huelle.remove();
        if (!this.aktiv) this.durchsicht(false);
      }, BLENDE);
    }
    this.aktiv = null;
    if (!e) { if (!alt) this.durchsicht(false); return; }
    this.durchsicht(true);
    const huelle = document.createElement('div');
    huelle.className = 'video';
    this.schicht.appendChild(huelle);
    const a = this.aktiv = { e, huelle, seit: performance.now(), vorschau };
    const id = youtubeId(e.url);
    if (id) this.youtube(a, id); else this.datei(a);
    this.melde?.();
  }

  durchsicht(an) {
    if (an === this.durchsichtig) return;
    this.durchsichtig = an;
    this.schicht.hidden = !an;
    this.hintergrund(an);
  }

  datei(a) {
    const { e, huelle } = a, start = e.start || 0, ende = e.ende || 0;
    const v = document.createElement('video');
    v.muted = !this.einst.ton;
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('loadedmetadata', () => {
      v.currentTime = Math.min(start, Math.max(0, v.duration - 1));
      v.play().catch(() => {});
    }, { once: true });
    v.addEventListener('playing', () => huelle.classList.add('an'));
    v.addEventListener('timeupdate', () => { if (ende && v.currentTime >= ende) v.currentTime = start; });
    v.addEventListener('ended', () => { v.currentTime = start; v.play().catch(() => {}); });
    v.addEventListener('error', () => this.misslungen(a, t('Datei lässt sich nicht abspielen')));
    v.src = e.url;
    huelle.appendChild(v);
    a.video = v;
  }

  async youtube(a, id) {
    const { e, huelle } = a;
    huelle.classList.add('yt');
    const ziel = document.createElement('div');
    huelle.appendChild(ziel);
    let YT;
    try { YT = await youtube(); } catch (err) { return this.misslungen(a, t('YouTube nicht erreichbar')); }
    if (this.aktiv !== a) return;
    const start = e.start || 0;
    a.player = new YT.Player(ziel, {
      host: 'https://www.youtube-nocookie.com',
      videoId: id,
      playerVars: { autoplay: 1, mute: this.einst.ton ? 0 : 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
        playsinline: 1, rel: 0, start, ...(e.ende ? { end: e.ende } : {}), origin: location.origin },
      events: {
        onReady: ev => { if (this.einst.ton) ev.target.unMute(); else ev.target.mute(); ev.target.playVideo(); },
        onStateChange: ev => {
          if (ev.data === YT.PlayerState.PLAYING) huelle.classList.add('an');
          if (ev.data === YT.PlayerState.ENDED) { ev.target.seekTo(start, true); ev.target.playVideo(); }
        },
        // 101/150: der Kanal erlaubt kein Einbetten; 100: Video gelöscht oder privat
        onError: ev => this.misslungen(a, [101, 150].includes(ev.data) ? t('Einbetten nicht erlaubt') : ev.data === 100 ? t('Video nicht gefunden') : t('Fehler {n}', { n: ev.data })),
      },
    });
  }

  misslungen(a, meldung) {
    this.fehler[a.e.id] = meldung;
    if (this.aktiv === a) this.wechsle(null);
    this.melde?.();
  }

  ton(an) {
    this.einst.ton = an; this.speichern();
    const a = this.aktiv;
    if (a?.video) a.video.muted = !an;
    if (a?.player?.mute) { if (an) a.player.unMute(); else a.player.mute(); }
  }

  deckkraft(wert) {
    this.einst.deckkraft = wert; this.speichern();
    this.schicht.style.setProperty('--video-deckkraft', wert / 100);
  }

  /** Größe des gemeinsamen Rahmens in Prozent der Bühnenhöhe (über 100 ragt er oben und unten hinaus) */
  groesse(wert) {
    this.einst.groesse = wert; this.speichern();
    this.schicht.style.setProperty('--video-hoehe', wert + '%');
  }

  /** Untermenü: Schalter, Liste und Formular aus seite.phtml beleben */
  menue() {
    const $ = id => document.getElementById(id);
    const liste = $('video-liste'), form = $('video-form');
    let bearbeitet = null;
    $('videos-an').checked = this.einst.an;
    $('videos-ton').checked = this.einst.ton;
    $('videos-deckkraft').value = this.einst.deckkraft;
    $('videos-groesse').value = this.einst.groesse;
    $('videos-an').addEventListener('change', ev => { this.einst.an = ev.target.checked; this.speichern(); if (!this.einst.an) this.halt(); });
    $('videos-ton').addEventListener('change', ev => this.ton(ev.target.checked));
    $('videos-deckkraft').addEventListener('input', ev => this.deckkraft(+ev.target.value));
    $('videos-groesse').addEventListener('input', ev => this.groesse(+ev.target.value));
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const zeige = () => {
      liste.innerHTML = [...this.einst.liste].sort((x, y) => x.von - y.von).map(e => {
        const art = youtubeId(e.url) ? 'YouTube' : t('Datei');
        const aus = e.start || e.ende ? ` · ${uhr(e.start || 0)}–${e.ende ? uhr(e.ende) : t('Ende')}` : '';
        const laeuft = this.aktiv?.e.id === e.id;
        return `<li${laeuft ? ' class="laeuft"' : ''}><label class="haken"><input type="checkbox" data-an="${esc(e.id)}"${e.an ? ' checked' : ''}> <span>${esc(e.titel || e.url)}</span></label>
          <small>${e.von}–${e.bis} · ${art}${aus}${this.fehler[e.id] ? ` · <b class="warnung">⚠ ${esc(this.fehler[e.id])}</b>` : ''}</small>
          <span class="knoepfe"><button class="klein" data-vorschau="${esc(e.id)}" title="${esc(t('Jetzt im Hintergrund abspielen'))}">${laeuft && this.aktiv.vorschau ? '■' : '▶'}</button>
          <button class="klein" data-bearbeiten="${esc(e.id)}" title="${esc(t('Bearbeiten'))}">✎</button>
          <button class="klein" data-loeschen="${esc(e.id)}" title="${esc(t('Entfernen'))}">✕</button></span></li>`;
      }).join('') || `<li class="lied-tipp">${esc(t('Noch keine Videos.'))}</li>`;
    };
    this.melde = zeige;
    const finde = id => this.einst.liste.find(e => e.id === id);
    liste.addEventListener('change', ev => {
      const e = finde(ev.target.dataset.an);
      if (!e) return;
      e.an = ev.target.checked; this.speichern();
      if (!e.an && this.aktiv?.e.id === e.id) this.wechsle(null);
    });
    liste.addEventListener('click', ev => {
      const k = ev.target.closest('button');
      if (!k) return;
      ev.stopPropagation();
      if (k.dataset.vorschau) { const e = finde(k.dataset.vorschau); delete this.fehler[e.id]; this.vorschau(e); zeige(); }
      if (k.dataset.loeschen) {
        this.einst.liste = this.einst.liste.filter(e => e.id !== k.dataset.loeschen); this.speichern();
        if (this.aktiv?.e.id === k.dataset.loeschen) this.wechsle(null);
        zeige();
      }
      if (k.dataset.bearbeiten) {
        const e = finde(k.dataset.bearbeiten);
        bearbeitet = e.id;
        form.url.value = e.url; form.titel.value = e.titel || ''; form.von.value = e.von; form.bis.value = e.bis;
        form.start.value = e.start ? uhr(e.start) : ''; form.ende.value = e.ende ? uhr(e.ende) : '';
        $('video-form-titel').textContent = t('Video bearbeiten');
        $('video-form-neu').hidden = false;
        form.url.focus();
      }
    });
    const zuruecksetzen = () => {
      bearbeitet = null; form.reset();
      $('video-form-titel').textContent = t('Video hinzufügen');
      $('video-form-neu').hidden = true;
    };
    $('video-form-neu').addEventListener('click', zuruecksetzen);
    // ein YouTube-Link mit Zeitmarke (t=90, t=1m30s) setzt den Start des Ausschnitts
    form.url.addEventListener('change', () => {
      const m = /[?&#](?:t|start)=([\dhms]+)/.exec(form.url.value);
      if (m && !form.start.value) form.start.value = uhr(sekunden(m[1]));
    });
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const url = form.url.value.trim();
      const von = +form.von.value, bis = Math.max(von, +form.bis.value);
      const neu = { url, titel: form.titel.value.trim(), von, bis, start: sekunden(form.start.value), ende: sekunden(form.ende.value), an: true };
      if (neu.ende && neu.ende <= neu.start) neu.ende = 0;
      const e = bearbeitet && finde(bearbeitet);
      if (e) { Object.assign(e, neu); delete this.fehler[e.id]; }
      else this.einst.liste.push({ id: 'v' + Date.now().toString(36), ...neu });
      this.speichern(); zuruecksetzen(); zeige();
    });
    $('videos-vorgaben').addEventListener('click', () => {
      const eigene = this.einst.liste.filter(e => !VORGABEN.some(v => v.id === e.id));
      this.einst.liste = [...VORGABEN.map(v => ({ ...v, an: true })), ...eigene]; this.fehler = {};
      this.speichern(); zeige();
    });
    zeige();
  }
}
