// Videos zur Zeitgeschichte: Während der Zeitreise läuft halb durchsichtig hinter dem Stammbaum ein Film zu den gerade
// erreichten Jahren – eine Videodatei (etwa von Wikimedia Commons) oder ein YouTube-Video, jeweils auch als Ausschnitt.
// Die Auswahl merkt sich der Browser (localStorage lb-videos); ausgesucht und zugeschnitten wird im Videofenster.
import { t } from 'lb/text.js';
import { VORSCHLAEGE } from 'lb/videovorschlaege.js';

// diese Vorschläge gab es schon, bevor sich der Browser die gesehenen merkte
const FRUEHE_VORSCHLAEGE = ['c-ellis', 'c-ww1', 'c-franzjoseph', 'c-aachen', 'c-truemmer', 'c-mond'];
const VORSCHLAG_IDS = new Set(VORSCHLAEGE.map(v => v.id));
export const istVorschlag = e => VORSCHLAG_IDS.has(e.id);
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
export const uhr = s => (s = Math.floor(s || 0)) >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Meldung zu einem Fehler des YouTube-Players: 101/150 der Kanal erlaubt kein Einbetten, 100 gelöscht oder privat */
export const ytFehler = n => [101, 150].includes(n) ? t('Einbetten nicht erlaubt') : n === 100 ? t('Video nicht gefunden') : t('Fehler {n}', { n });

let ytLaden = null;
export function youtubeApi() {
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
  try { e = JSON.parse(localStorage.getItem('lb-videos') || '{}'); } catch (err) { /* Vorschläge */ }
  const alt = Array.isArray(e.liste);
  const einst = { an: e.an ?? true, ton: e.ton ?? false, deckkraft: e.deckkraft ?? 35, groesse: e.groesse ?? 100,
    liste: alt ? e.liste : [], gesehen: Array.isArray(e.gesehen) ? e.gesehen : alt ? [...FRUEHE_VORSCHLAEGE] : [] };
  // neue Vorschläge kommen einmal von selbst dazu; was jemand entfernt hat, bleibt weg
  for (const v of VORSCHLAEGE) {
    if (einst.gesehen.includes(v.id)) continue;
    if (!einst.liste.some(x => x.id === v.id)) einst.liste.push({ ...v, an: true });
    einst.gesehen.push(v.id);
  }
  return einst;
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
    this.speichern();
    this.aktiv = null;      // { e, huelle, player, seit, vorschau }
    this.fehler = {};       // id → Meldung, wenn ein Video nicht läuft
    this.durchsichtig = false;
    this.schicht.style.setProperty('--video-deckkraft', this.einst.deckkraft / 100);
    this.schicht.style.setProperty('--video-hoehe', this.einst.groesse + '%');
  }

  speichern() {
    try { localStorage.setItem('lb-videos', JSON.stringify(this.einst)); } catch (e) { /* ohne Speicher */ }
  }

  /** Das passende Video zu einem Jahr: unter den eingeschalteten, deren Jahre laufen, gehen eigene Videos den
   *  Vorschlägen vor, danach das zuletzt beginnende */
  waehle(j) {
    let beste = null, rang = -Infinity;
    for (const e of this.einst.liste) {
      if (!e.an || this.fehler[e.id] || j < e.von || j >= e.bis + 1) continue;
      const r = (istVorschlag(e) ? 0 : 10000) + e.von;
      if (r >= rang) { beste = e; rang = r; }
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
    try { YT = await youtubeApi(); } catch (err) { return this.misslungen(a, t('YouTube nicht erreichbar')); }
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
        onError: ev => this.misslungen(a, ytFehler(ev.data)),
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

  /** Untermenü: Schalter und Regler aus seite.phtml beleben; Liste und Zuschnitt stehen im Videofenster */
  menue() {
    const $ = id => document.getElementById(id);
    $('videos-an').checked = this.einst.an;
    $('videos-ton').checked = this.einst.ton;
    $('videos-deckkraft').value = this.einst.deckkraft;
    $('videos-groesse').value = this.einst.groesse;
    $('videos-an').addEventListener('change', ev => { this.einst.an = ev.target.checked; this.speichern(); if (!this.einst.an) this.halt(); });
    $('videos-ton').addEventListener('change', ev => this.ton(ev.target.checked));
    $('videos-deckkraft').addEventListener('input', ev => this.deckkraft(+ev.target.value));
    $('videos-groesse').addEventListener('input', ev => this.groesse(+ev.target.value));
  }
}
