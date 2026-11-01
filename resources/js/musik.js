// Freie Musik: Liedsuche auf Wikimedia Commons und Musik der jeweiligen Epoche während der Zeitreise.
// Die Epochenstücke (musikepochen.js) laufen wie die Videos genau in ihren Jahren, in Schleife, mit weicher Überblendung;
// das nächste wird vorab geladen.
import { t } from 'lb/text.js';
import { EPOCHEN } from 'lb/musikepochen.js';

const BLENDE = 2500;     // Überblenden zwischen zwei Stücken (ms)
const MINDEST = 8000;    // ein Stück bleibt so lange, bevor ein genaueres es ablöst, solange seine Jahre laufen
const VORAUS = 10;       // so viele Jahre im Voraus wird das nächste Stück geladen

const ohneHtml = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Freie Aufnahmen auf Commons suchen (ohne MIDI); liefert Titel, Adresse, Urheber und Lizenz */
export async function sucheLieder(begriff) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: '30',
    gsrsearch: `filetype:audio ${begriff}`, prop: 'imageinfo', iiprop: 'url|mime|extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ObjectName',
  });
  const d = await (await fetch('https://commons.wikimedia.org/w/api.php?' + q)).json();
  return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).flatMap(p => {
    const ii = p.imageinfo?.[0], m = ii?.extmetadata || {};
    if (!ii || /midi/.test(ii.mime)) return [];
    const name = p.title.replace(/^File:/, '');
    return [{
      titel: ohneHtml(m.ObjectName?.value) || name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
      url: ii.url, quelle: ii.descriptionurl, urheber: ohneHtml(m.Artist?.value) || t('unbekannt'),
      lizenz: ohneHtml(m.LicenseShortName?.value), lizenzUrl: m.LicenseUrl?.value || ii.descriptionurl, datei: name,
    }];
  });
}

/** Eine Datei herunterladen, auch von fremden Servern mit CORS (Commons); sonst im neuen Tab öffnen */
export async function herunterladen(url, name) {
  try {
    const blob = await (await fetch(url)).blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  } catch (e) {
    open(url, '_blank', 'noopener');
  }
}

/** Lautstärke eines Audio-Elements weich von `von` nach `nach` (Zahl oder Funktion) führen; eine neue Blende löst die
 *  laufende ab. In versteckten Tabs ruht requestAnimationFrame – dann bringt ein Zeitgeber die Blende zu Ende. */
function blende(audio, von, nach, ms, fertig) {
  const id = audio.blendeNr = (audio.blendeNr || 0) + 1, t0 = performance.now(), ziel = () => typeof nach === 'function' ? nach() : nach;
  let fertigGemeldet = false;
  const ende = () => { if (fertigGemeldet || audio.blendeNr !== id) return; fertigGemeldet = true; audio.volume = Math.max(0, Math.min(1, ziel())); fertig?.(); };
  const schritt = jetzt => {
    if (audio.blendeNr !== id || fertigGemeldet) return;
    const f = Math.min(1, (jetzt - t0) / ms);
    audio.volume = Math.max(0, Math.min(1, von + (ziel() - von) * f));
    if (f < 1) requestAnimationFrame(schritt); else ende();
  };
  requestAnimationFrame(schritt);
  setTimeout(ende, ms + 150);
}

const genauer = (x, y) => (x.bis - x.von) - (y.bis - y.von) || y.von - x.von;

export class Epochenmusik {
  constructor(lautstaerke = 0.85) {
    this.laut = lautstaerke;
    this.spur = null;      // { e, audio, seit }
    this.vorrat = null;    // { e, audio }
    this.liste = EPOCHEN;
    this.ersatz = null;    // gewähltes Lied für Jahre ohne Epochenstück
  }

  waehle(j) {
    return this.liste.filter(e => j >= e.von && j < e.bis + 1).sort(genauer)[0] ?? this.ersatz;
  }

  /** Je Bild der Zeitreise aufrufen */
  jahr(j) {
    const s = this.spur, n = this.waehle(j);
    const bleibt = s && (n === s.e || (j >= s.e.von && j < s.e.bis + 1 && performance.now() - s.seit < MINDEST));
    if (!bleibt && (s || n)) this.wechsle(n);
    for (let y = Math.floor(j) + 1; y <= j + VORAUS; y++) {
      const k = this.waehle(y);
      if (k && k !== this.spur?.e) { this.vorausladen(k); break; }
    }
  }

  titel() { return this.spur?.e.titel ?? ''; }

  audio(e) {
    const a = new Audio();
    a.preload = 'auto';
    a.src = e.url;
    if (e.start) a.addEventListener('loadedmetadata', () => { a.currentTime = e.start; }, { once: true });
    // in Schleife, aber vom Startpunkt an
    a.addEventListener('ended', () => { a.currentTime = e.start || 0; a.play().catch(() => {}); });
    return a;
  }

  vorausladen(e) {
    if (this.vorrat?.e === e) return;
    if (this.vorrat) this.vorrat.audio.removeAttribute('src');
    this.vorrat = { e, audio: this.audio(e) };
  }

  wechsle(e) {
    const alt = this.spur;
    if (alt) blende(alt.audio, alt.audio.volume, 0, BLENDE, () => { alt.audio.pause(); alt.audio.removeAttribute('src'); alt.audio.load(); });
    this.spur = null;
    if (!e) return;
    const audio = this.vorrat?.e === e ? this.vorrat.audio : this.audio(e);
    if (this.vorrat?.e === e) this.vorrat = null;
    audio.volume = 0;
    audio.play().catch(() => {});
    blende(audio, 0, () => this.laut, BLENDE);
    this.spur = { e, audio, seit: performance.now() };
  }

  halt() {
    this.wechsle(null);
    if (this.vorrat) { this.vorrat.audio.removeAttribute('src'); this.vorrat = null; }
  }

  lautstaerke(wert) {
    this.laut = wert;
    if (this.spur) this.spur.audio.volume = wert;
  }
}
