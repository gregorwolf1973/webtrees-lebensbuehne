// Videos zur Zeitgeschichte: Während der Zeitreise läuft halb durchsichtig hinter dem Stammbaum ein Film zu den gerade
// erreichten Jahren – eine Videodatei (etwa von Wikimedia Commons) oder ein YouTube-Video, jeweils auch als Ausschnitt.
// Die Auswahl merkt sich der Browser (localStorage lb-videos); ausgesucht und zugeschnitten wird im Videofenster.
import { t } from 'lb/text.js';
import { VORSCHLAEGE } from 'lb/videovorschlaege.js';

// diese Vorschläge gab es schon, bevor sich der Browser die gesehenen merkte
const FRUEHE_VORSCHLAEGE = ['c-ellis', 'c-ww1', 'c-franzjoseph', 'c-aachen', 'c-truemmer', 'c-mond'];
const VORSCHLAG_IDS = new Set(VORSCHLAEGE.map(v => v.id));
export const istVorschlag = e => VORSCHLAG_IDS.has(e.id);
const MINDEST = 10000;   // so lange (ms) bleibt ein Video, bevor ein vorrangiges es ablöst, solange seine Jahre laufen

// Jedes Video gehört zu dem Land, in dem das Ereignis stattfand; ganze Regionen oder einzelne Länder lassen sich
// abwählen (lb-videos.aus). Unbekannte Länder zählen zu „Welt“. Die Reihenfolge der Länder (lb-videos.reihenfolge,
// im Videofenster per Ziehen) ist ihr Vorrang, wenn sich Videos überschneiden.
export const REGIONEN = ['Europa', 'Amerika', 'Welt', 'Ohne Land'];
const REGION_VON = { Deutschland: 'Europa' };
for (const l of ['Österreich', 'Schweiz', 'Frankreich', 'Großbritannien', 'Irland', 'Niederlande', 'Belgien', 'Luxemburg',
  'Dänemark', 'Schweden', 'Norwegen', 'Polen', 'Tschechien', 'Slowakei', 'Ungarn', 'Rumänien', 'Serbien', 'Kroatien',
  'Italien', 'Spanien', 'Portugal', 'Griechenland', 'Russland', 'Ukraine']) REGION_VON[l] = 'Europa';
for (const l of ['USA', 'Kanada', 'Mexiko', 'Brasilien', 'Argentinien']) REGION_VON[l] = 'Amerika';
export const LAENDER = Object.keys(REGION_VON);
// ohne eigene Reihenfolge: eigene Videos ohne Land zuerst, dann Deutschland, das übrige Europa, Amerika
const STANDARD_REIHENFOLGE = ['Ohne Land', ...LAENDER];
export const landVon = e => String(e.land || '').trim() || 'Ohne Land';
export const regionVon = e => { const l = landVon(e); return l === 'Ohne Land' ? l : REGION_VON[l] || 'Welt'; };
/** genauer = kürzere Spanne, bei Gleichstand das später beginnende */
export const genauer = (x, y) => (x.bis - x.von) - (y.bis - y.von) || y.von - x.von;
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
  const einst = { an: e.an ?? true, ton: e.ton ?? false, lautstaerke: e.lautstaerke ?? 70, deckkraft: e.deckkraft ?? 35, groesse: e.groesse ?? 100,
    liste: alt ? e.liste : [], gesehen: Array.isArray(e.gesehen) ? e.gesehen : alt ? [...FRUEHE_VORSCHLAEGE] : [],
    aus: Array.isArray(e.aus) ? e.aus.map(x => x === 'Nordamerika' ? 'Amerika' : x) : [],
    offen: Array.isArray(e.offen) ? e.offen : [],
    reihenfolge: Array.isArray(e.reihenfolge) ? e.reihenfolge : [] };
  // übernommene Vorschläge folgen dem Katalog (berichtigte Adressen, Jahre, Länder); nur selbst Geändertes bleibt
  einst.liste = einst.liste.map(x => {
    const v = VORSCHLAEGE.find(y => y.id === x.id);
    if (!v) return x;
    const geaendert = x.geaendert ?? ['start', 'ende'].filter(k => (x[k] || 0) !== (v[k] || 0));
    const neu = { ...v, an: x.an !== false };
    for (const k of geaendert) neu[k] = x[k];
    if (geaendert.length) neu.geaendert = geaendert;
    return neu;
  });
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

  /** Ist das Land oder seine Region abgewählt? */
  abgewaehlt(e) {
    const aus = this.einst.aus;
    return aus.includes(landVon(e)) || aus.includes(regionVon(e));
  }

  /** Alle Länder in der Reihenfolge ihres Vorrangs: die gewählte, dann die übrigen wie vorgegeben */
  reihenfolge() {
    const r = this.einst.reihenfolge.filter((l, i, a) => a.indexOf(l) === i);
    const rest = [...new Set([...STANDARD_REIHENFOLGE, ...this.einst.liste.map(landVon), ...VORSCHLAEGE.map(landVon)])];
    return [...r, ...rest.filter(l => !r.includes(l))];
  }

  /** Eingeschaltete Videos, deren Jahre laufen, das vorrangige zuerst: das Land weiter oben, im selben Land eigene
   *  Videos vor Vorschlägen, dann das genaueste. Für die Bahnen im Videofenster mit `nur.land` nur aus diesem Land,
   *  mit `nur.region` aus dieser Region (deren eigene Abwahl bleibt dabei unbeachtet). */
  kandidaten(j, nur = {}) {
    const rang = new Map(this.reihenfolge().map((l, i) => [l, i])), aus = this.einst.aus;
    return this.einst.liste.filter(e => e.an && !this.fehler[e.id] && j >= e.von && j < e.bis + 1
      && (nur.land ? landVon(e) === nur.land : nur.region ? regionVon(e) === nur.region && !aus.includes(landVon(e)) : !this.abgewaehlt(e)))
      .sort((x, y) => rang.get(landVon(x)) - rang.get(landVon(y)) || istVorschlag(x) - istVorschlag(y) || genauer(x, y));
  }

  waehle(j, nur) {
    return this.kandidaten(j, nur)[0] ?? null;
  }

  /** Je Bild der Zeitreise aufrufen. Es läuft das vorrangige passende Video, genau in seinen Jahren: Es endet mit dem
   *  Jahr „bis“, wie in den Bahnen des Videofensters, und sein Ausschnitt wiederholt sich so lange. Ein vorrangiges,
   *  das neu beginnt, löst das laufende frühestens nach 10 s ab. */
  jahr(j) {
    if (!this.einst.an) return this.halt();
    const a = this.aktiv, k = this.kandidaten(j), n = k[0] ?? null;
    if (a && !a.vorschau && (n === a.e || (k.includes(a.e) && performance.now() - a.seit < MINDEST))) return;
    if (!a && !n) return;
    this.wechsle(n);
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
    v.volume = this.einst.lautstaerke / 100;
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
        onReady: ev => { ev.target.setVolume(this.einst.lautstaerke); if (this.einst.ton) ev.target.unMute(); else ev.target.mute(); ev.target.playVideo(); },
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

  /** Lautstärke 0–100 der Videos, wenn sie mit Ton laufen (auch für die Vorschau im Videofenster) */
  lautstaerke(wert) {
    this.einst.lautstaerke = wert; this.speichern();
    const a = this.aktiv;
    if (a?.video) a.video.volume = wert / 100;
    a?.player?.setVolume?.(wert);
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
    $('videos-lautstaerke').value = this.einst.lautstaerke;
    $('videos-deckkraft').value = this.einst.deckkraft;
    $('videos-groesse').value = this.einst.groesse;
    $('videos-an').addEventListener('change', ev => { this.einst.an = ev.target.checked; this.speichern(); if (!this.einst.an) this.halt(); });
    $('videos-ton').addEventListener('change', ev => this.ton(ev.target.checked));
    // lauter stellen schaltet den Ton ein
    $('videos-lautstaerke').addEventListener('input', ev => {
      this.lautstaerke(+ev.target.value);
      if (!this.einst.ton && +ev.target.value > 0) { $('videos-ton').checked = true; this.ton(true); }
    });
    $('videos-deckkraft').addEventListener('input', ev => this.deckkraft(+ev.target.value));
    $('videos-groesse').addEventListener('input', ev => this.groesse(+ev.target.value));
  }
}
