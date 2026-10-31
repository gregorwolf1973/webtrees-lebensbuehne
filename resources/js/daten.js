// Daten laden und aufbereiten: geschätzte Jahre, Regionen, Verwandtschaft, Texte für Lebenslauf und Bildgeschichte.
import { t, EN } from 'lb/text.js';

export const JETZT = new Date().getFullYear();
// Im webtrees-Modul setzt die Seite die Adressen (window.LEBENSBUEHNE), lokal gelten die Dateien in data/ und media/
export const LB = window.LEBENSBUEHNE || {};

export async function ladeDaten() {
  const [roh, zeitMit] = await Promise.all([
    fetch(LB.daten || 'data/personen.json').then(r => { if (!r.ok) throw new Error('Daten: ' + r.status); return r.json(); }),
    fetch(LB.zeitgeschehen || 'data/zeitgeschehen.json').then(r => r.json()),
  ]);
  // eigene Ereignisse der Installation (data/lebensbuehne/zeitgeschehen.json) kommen dazu und gehen in ihrer Gruppe vor
  const zeit = [...zeitMit, ...(LB.zeitgeschehenEigen || []).map(z => ({ ...z, eigen: true }))]
    .map(z => EN ? { ...z, titel: z.titel_en || z.titel, text: z.text_en || z.text } : z)
    .sort((a, b) => a.jahr - b.jahr);
  const personen = roh.personen;
  const byId = new Map(personen.map(p => [p.id, p]));

  for (const p of personen) {
    p.vaterP = byId.get(p.vater) || null;
    p.mutterP = byId.get(p.mutter) || null;
    p.eltern = [p.vaterP, p.mutterP].filter(Boolean);
    p.kinderP = (p.kinder || []).map(x => byId.get(x)).filter(Boolean);
    p.partnerP = (p.partner || []).map(x => byId.get(x)).filter(Boolean);
    p.rufname = p.name.rufname || (p.name.vorname && p.name.vorname !== '?' ? p.name.vorname.split(' ')[0] : p.name.voll);
    p.regionen = new Set();
    for (const e of p.ereignisse) if (e.ort) for (const r of regionenVonOrt(e.ort.name)) p.regionen.add(r);
    p.orteText = p.ereignisse.filter(e => e.ort).map(e => ortSchluessel(e.ort.name)).join('|');
    // Jahr für die Zeitachse: Geburt, sonst aus Heirat oder Tod geschätzt, sonst später aus der Verwandtschaft
    const ehe = p.ereignisse.find(e => e.art === 'MARR' && e.jahr);
    p.geschaetzt = !p.geburt;
    p.jahrE = p.geburt ?? (ehe ? ehe.jahr - 25 : p.tod ? p.tod - 60 : null);
  }
  // Fehlende Jahre über Eltern, Kinder und Partner schätzen (mehrere Durchgänge, damit sich Schätzungen fortpflanzen)
  for (let runde = 0; runde < 12; runde++) {
    let offen = 0;
    for (const p of personen) {
      if (p.jahrE != null) continue;
      const k = p.kinderP.filter(c => c.jahrE != null).map(c => c.jahrE - 28);
      const e = p.eltern.filter(x => x.jahrE != null).map(x => x.jahrE + 28);
      const pa = p.partnerP.filter(x => x.jahrE != null).map(x => x.jahrE);
      const werte = k.length ? [Math.min(...k)] : e.length ? [Math.max(...e)] : pa;
      if (werte.length) p.jahrE = Math.round(werte[0]); else offen++;
    }
    if (!offen) break;
  }
  for (const p of personen) {
    if (p.jahrE == null) p.jahrE = 1900;
    const k = p.kinderP.filter(c => !c.geschaetzt).map(c => c.jahrE);
    if (p.geschaetzt && k.length) p.jahrE = Math.min(p.jahrE, Math.min(...k) - 16);
    p.ende = p.tod ?? (p.geburt ?? p.jahrE) + 80;   // ohne bekanntes Todesjahr: 80 Jahre nach der Geburt
  }
  // Ohne eigene Orte: Region von Kindern oder Eltern übernehmen
  for (let runde = 0; runde < 4; runde++)
    for (const p of personen)
      if (!p.regionen.size) {
        const q = [...p.kinderP, ...p.eltern].find(x => x.regionen.size);
        if (q) { p.regionen = new Set(q.regionen); p.orteText = q.orteText; }
      }

  // Einträge mit „nurKlang“ steuern nur die Geräusche und erscheinen nicht im Zeitgeschehen
  return { personen, byId, zeit: zeit.filter(z => !z.nurKlang), klangZeit: zeit.filter(z => z.klang), start: byId.get(LB.start) || byId.get(roh.start) || personen[0] };
}

// Wer gerade die Hauptperson ist (für Texte wie „der Großvater von Anna“)
let hauptperson = null;

// Personen der Ansicht: die Hauptperson, ihre Vorfahren und/oder Nachkommen; setzt die Ansichtsfelder an den Personen
// `generationen` begrenzt, wie weit der Fächer von der Hauptperson (und vom Partner) aus reicht; `liste.gekuerzt` sagt, ob dadurch Personen fehlen
export function ansicht(daten, root, { vorfahren = true, nachkommen = false, partner = false, geschwister = false, generationen = Infinity } = {}) {
  for (const p of daten.personen) {
    p.imBild = false; p.rolle = null; p.generation = null; p.seite = null; p.partnerseite = false; p.bezug = null;
    p.sosa = null; p.zumStart = null; p.mannesstamm = false; p.zweig = null; p.halb = false;
  }
  hauptperson = root;
  Object.assign(root, { imBild: true, rolle: 'start', generation: 0, seite: 'start', sosa: 1 });
  const liste = [root];
  let gekuerzt = false;
  // Vorfahren einer Person (Hauptperson oder Partner); bei Partnern zählt die Verwandtschaft von ihnen aus
  const vorfahrenVon = (start, partnerseite) => {
    const reihe = [start];
    while (reihe.length) {
      const x = reihe.shift();
      [[x.vaterP, 0], [x.mutterP, 1]].forEach(([e, add]) => {
        if (!e || e.imBild) return;   // Ahnenschwund: jede Person nur einmal
        if (x.generation >= generationen) { gekuerzt = true; return; }
        Object.assign(e, { imBild: true, rolle: 'vorfahr', generation: x.generation + 1, sosa: x.sosa * 2 + add, zumStart: x,
          seite: x === start ? (add ? 'mutter' : 'vater') : x.seite, partnerseite, bezug: partnerseite ? start : null,
          mannesstamm: !partnerseite && add === 0 && (x === start || x.mannesstamm) });
        liste.push(e); reihe.push(e);
      });
    }
  };
  if (vorfahren) vorfahrenVon(root, false);
  if (partner) for (const pa of root.partnerP) {
    if (pa.imBild) continue;
    Object.assign(pa, { imBild: true, rolle: 'partner', generation: 0, sosa: 1, seite: 'partner', partnerseite: true, zumStart: root });
    liste.push(pa);
    vorfahrenVon(pa, true);
  }
  // Geschwister: die Eltern gehören immer dazu (auch ohne Vorfahren), von ihnen aus fächern sich die Geschwister auf.
  // Halbgeschwister (anderer Vater oder andere Mutter) sind gekennzeichnet und hängen am gemeinsamen Elternteil.
  // Mit „Partner“ stehen die Partner der Geschwister daneben; darunter Nichten, Neffen und deren Nachkommen.
  if (geschwister) {
    [[root.vaterP, 0], [root.mutterP, 1]].forEach(([e, add]) => {
      if (!e || e.imBild) return;
      Object.assign(e, { imBild: true, rolle: 'vorfahr', generation: 1, sosa: 2 + add, zumStart: root, seite: add ? 'mutter' : 'vater', mannesstamm: add === 0 });
      liste.push(e);
    });
    const kinder = [...new Set([root.vaterP, root.mutterP].filter(Boolean).flatMap(e => e.kinderP))]
      .filter(c => c !== root && !c.imBild).sort((a, b) => a.jahrE - b.jahrE);
    kinder.forEach((g, i) => {
      // voll nur bei genau denselben beiden Eltern; kennt man nur einen Elternteil der Hauptperson, bleibt es offen (voll)
      const halb = !!(root.vaterP && root.mutterP) && !(g.vaterP === root.vaterP && g.mutterP === root.mutterP);
      const gemeinsam = g.vaterP && g.vaterP === root.vaterP ? root.vaterP : g.mutterP && g.mutterP === root.mutterP ? root.mutterP : root.vaterP ?? root.mutterP;
      Object.assign(g, { imBild: true, rolle: 'geschwister', generation: 0, seite: 'geschwister', zumStart: gemeinsam, zweig: i, halb });
      liste.push(g);
    });
    for (const g of kinder) {
      if (partner) for (const pa of g.partnerP) {
        if (pa.imBild) continue;
        Object.assign(pa, { imBild: true, rolle: 'schwager', generation: 0, seite: 'partner', partnerseite: true, zumStart: g, zweig: g.zweig });
        liste.push(pa);
      }
      const reihe = [g];
      while (reihe.length) {
        const x = reihe.shift();
        [...x.kinderP].sort((a, b) => a.jahrE - b.jahrE).forEach(c => {
          if (c.imBild) return;
          if (x.generation >= generationen) { gekuerzt = true; return; }
          Object.assign(c, { imBild: true, rolle: 'neffe', generation: x.generation + 1, seite: 'nachkomme', zumStart: x, zweig: g.zweig });
          liste.push(c); reihe.push(c);
        });
      }
    }
  }
  if (nachkommen) {
    const reihe = [root];
    while (reihe.length) {
      const x = reihe.shift();
      [...x.kinderP].sort((a, b) => a.jahrE - b.jahrE).forEach((c, i) => {
        if (c.imBild) return;
        if ((x.rolle === 'partner' ? 0 : x.generation) >= generationen) { gekuerzt = true; return; }
        Object.assign(c, { imBild: true, rolle: 'nachkomme', generation: (x.rolle === 'partner' ? 0 : x.generation) + 1, zumStart: x, seite: 'nachkomme',
          zweig: x === root ? i : x.zweig });
        liste.push(c); reihe.push(c);
      });
    }
  }
  liste.gekuerzt = gekuerzt;
  return liste;
}

// Netz (wie die Ansicht „Lineage“): Personen, die über Eltern, Kinder oder Partner mit der Hauptperson verbunden sind,
// höchstens `tiefe` Schritte entfernt und nie mehr als NETZ_HOECHSTENS, die nächsten zuerst – Stammbäume mit
// Zehntausenden Personen überfordern sonst den Browser. Vorfahren, Nachkommen und Partner behalten ihre Rollen aus der
// Fächeransicht, die übrigen heißen „verwandt“. `liste.gekuerzt` sagt, ob Verwandte weggelassen wurden.
export const NETZ_HOECHSTENS = 2500;
export function netz(daten, root, tiefe = Infinity) {
  const abstand = new Map([[root, 0]]);
  const liste = [root];
  let gekuerzt = false;
  for (let i = 0; i < liste.length; i++) {
    const x = liste[i], d = abstand.get(x);
    for (const y of [...x.eltern, ...x.kinderP, ...x.partnerP]) {
      if (abstand.has(y)) continue;
      if (d >= tiefe || liste.length >= NETZ_HOECHSTENS) { gekuerzt = true; continue; }
      abstand.set(y, d + 1);
      liste.push(y);
    }
  }
  ansicht(daten, root, { vorfahren: true, nachkommen: true, partner: true });
  for (const p of daten.personen) {
    if (!p.imBild) continue;
    if (!abstand.has(p)) Object.assign(p, { imBild: false, rolle: null });
  }
  for (const y of liste) if (!y.imBild) Object.assign(y, { imBild: true, rolle: 'verwandt' });
  liste.gekuerzt = gekuerzt;
  return liste;
}

// Kölner Phonetik: gleich klingende Familiennamen („Thöresz“, „Theres“, „Tyres“) bekommen im Netz dieselbe Farbe
export function phonetik(name) {
  const s = name.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 's').replace(/[^a-z]/g, '');
  let code = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], v = s[i - 1] || '', n = s[i + 1] || '';
    let z = '';
    if ('aeijouy'.includes(c)) z = '0';
    else if (c === 'h') z = '';
    else if (c === 'b') z = '1';
    else if (c === 'p') z = n === 'h' ? '3' : '1';
    else if ('dt'.includes(c)) z = 'csz'.includes(n) ? '8' : '2';
    else if ('fvw'.includes(c)) z = '3';
    else if ('gkq'.includes(c)) z = '4';
    else if (c === 'c') z = i === 0 ? ('ahkloqrux'.includes(n) ? '4' : '8') : ('sz'.includes(v) || !'ahkoqux'.includes(n) ? '8' : '4');
    else if (c === 'x') z = 'ckq'.includes(v) ? '8' : '48';
    else if (c === 'l') z = '5';
    else if ('mn'.includes(c)) z = '6';
    else if (c === 'r') z = '7';
    else if ('sz'.includes(c)) z = '8';
    code += z;
  }
  return code.replace(/(.)\1+/g, '$1').replace(/(?!^)0/g, '');
}

// Regionen eines Orts aus seinem Namen samt Oberorten („Billed, Timiș, Rumänien“, „Geretsried, D“); deutsche, englische
// und landessprachliche Namen. Die Schlüssel entsprechen den Regionen in zeitgeschehen.json.
const REGIONEN = [
  ['banat', /banat|temes|timi[sș]|torontál|torontal|krass[oó]|cara[sș]|werschetz|vr[sš]ac|zrenjanin|betschkerek|kikinda|hatzfeld|jimbolia|lugosch|lugoj|reschitz|re[sș]i[tț]a/],
  ['westen', /lothring|lorraine|luxemb|pfalz|palatin|saar|elsass|elsaß|alsace|trier/],
  ['deutschland', /deutschland|germany|(^|, )d$|bayern|bavaria|baden|württemberg|hessen|sachsen|thüringen|westfalen|rheinland|niedersachsen|brandenburg|mecklenburg|holstein|preußen|preussen|prussia|franken|schwaben|pfalz|saarland|berlin|hamburg|bremen|münchen|munich|köln|cologne|frankfurt|stuttgart/],
  ['oesterreich', /österreich|oesterreich|austria|steiermark|styria|kärnten|carinthia|tirol|salzburg|wien|vienna|burgenland|vorarlberg|(^|, )a$/],
  ['schweiz', /schweiz|switzerland|suisse|svizzera|(^|, )ch$/],
  ['ungarn', /ungarn|hungary|magyarorsz|budapest|szeged|debrecen|pécs|fünfkirchen|batschka|bácska|baranya|tolna|(^|, )h$/],
  ['rumaenien', /rumänien|romania|românia|siebenbürgen|transylvania|ardeal|bukarest|bucure[sș]ti|sathmar|satu mare|maramure|moldau|(^|, )ro$/],
  ['serbien', /serbien|serbia|srbija|vojvodina|woiwodina|belgrad|beograd|batschka|(^|, )srb?$/],
  ['frankreich', /frankreich|france|lothring|lorraine|elsass|elsaß|alsace|paris|(^|, )f$/],
  ['luxemburg', /luxemb/],
  ['belgien', /belgien|belgium|belgique|belgië/],
  ['niederlande', /niederlande|netherlands|holland|nederland/],
  ['italien', /italien|italy|italia|südtirol|south tyrol/],
  ['polen', /polen|poland|polska|schlesien|silesia|pommern|pomerania|ostpreußen|westpreußen|danzig|gdańsk|posen|poznań|galizien|galicia/],
  ['tschechien', /tschech|czech|böhmen|bohemia|mähren|moravia|sudeten|prag|praha/],
  ['slowakei', /slowakei|slovakia|slovensko|pressburg|bratislava|zips/],
  ['kroatien', /kroatien|croatia|hrvatska|slawonien|slavonia|syrmien|srijem/],
  ['russland', /russland|russia|wolga|volga|sibirien|siberia|sowjet|soviet|udssr|ussr/],
  ['ukraine', /ukraine|donbas|stalino|donezk|donetsk|bessarabien|bessarabia|odessa|galizien|galicia|wolhynien|volhynia/],
  ['grossbritannien', /england|great britain|united kingdom|großbritannien|schottland|scotland|wales|london/],
  ['irland', /irland|ireland|éire/],
  ['skandinavien', /schweden|sweden|norwegen|norway|dänemark|denmark|finnland|finland/],
  ['usa', /\busa\b|vereinigte staaten|united states|new york|pennsylvania|ohio|illinois|wisconsin|texas|california|michigan|minnesota|chicago|(^|, )us$/],
  ['kanada', /kanada|canada|ontario|québec|quebec|saskatchewan|alberta/],
  ['lateinamerika', /brasil|brazil|argentin|mexiko|mexico|chile|paraguay|uruguay|venezuela/],
  ['australien', /australien|australia|neuseeland|new zealand/],
];
export function regionenVonOrt(name) {
  const n = name.toLowerCase();
  return REGIONEN.filter(([, muster]) => muster.test(n)).map(([r]) => r);
}

// Ortsnamen vergleichbar machen: klein, ß → ss, ohne Bindestriche („Groß-Jetscha“ = „Grossjetscha“)
const ortSchluessel = name => name.toLowerCase().replace(/ß/g, 'ss').replace(/-/g, '');

// Passt eine Region eines Eintrags zur Person? Das Banat gehörte bis 1920 zu Ungarn, danach größtenteils zu Rumänien
function passtRegion(r, z, p) {
  return p.regionen.has(r) || (r === 'ungarn' && p.regionen.has('banat') && z.jahr < 1920) ||
    (r === 'rumaenien' && p.regionen.has('banat') && (z.bis ?? z.jahr) >= 1919);
}

// Allgemeines Welt- und Europageschehen (etwa der Kalte Krieg) lässt sich abschalten; regionale und eigene Einträge bleiben
let mitWeltgeschehen = true;
export function weltgeschehenZeigen(an) { mitWeltgeschehen = an; }

// Gehört ein Eintrag zu einer Person? Welt und Europa immer, sonst über die Regionen ihrer Orte. Dorfgeschichte mit „orte“
// (Namensteile wie „grossjetscha“) erscheint nur bei Personen, die dort gelebt haben.
export function passtZeitgeschehen(z, p) {
  if (z.orte && !z.orte.some(o => p.orteText?.includes(ortSchluessel(o)))) return false;
  if (!mitWeltgeschehen && !z.eigen) return z.regionen.some(r => r !== 'welt' && r !== 'europa' && passtRegion(r, z, p));
  return z.regionen.some(r => r === 'welt' || r === 'europa' || passtRegion(r, z, p));
}

// Je Gruppe (dasselbe Ereignis in mehreren Fassungen) nur die passendste: die Fassung, deren Regionen auf die meisten
// der Personen zutreffen, die damals lebten; eigene Einträge gehen immer vor, allgemeine (Europa, Welt) kommen zuletzt
function besteJeGruppe(liste, personen) {
  const wert = z => {
    const damals = personen.filter(p => (z.bis ?? z.jahr) >= p.jahrE && z.jahr <= p.ende);
    const regional = (damals.length ? damals : personen)
      .filter(p => z.regionen.some(r => r !== 'welt' && r !== 'europa' && passtRegion(r, z, p))).length;
    return (z.eigen ? 1e6 : 0) + regional * 10 + (z.regionen.includes('europa') ? 1 : 0);
  };
  const beste = new Map();
  for (const z of liste) if (z.gruppe && (!beste.has(z.gruppe) || wert(z) > wert(beste.get(z.gruppe)))) beste.set(z.gruppe, z);
  return liste.filter(z => !z.gruppe || beste.get(z.gruppe) === z);
}

export function zeitgeschehenFuer(p, alle) {
  const von = p.jahrE, bis = p.ende;
  return besteJeGruppe(alle.filter(z => passtZeitgeschehen(z, p) && (z.bis ?? z.jahr) >= von && z.jahr <= bis), [p]);
}

// Zeitgeschehen für alle Personen einer Ansicht (Abspann, Marken am Boden, Geräusche)
export function zeitFuerAnsicht(personen, alle) {
  return besteJeGruppe(alle.filter(z => personen.some(p => passtZeitgeschehen(z, p))), personen);
}

export function verwandtschaft(p) {
  if (p.rolle === 'partner') return EN ? 'Partner' : p.geschlecht === 'F' ? 'Partnerin' : p.geschlecht === 'M' ? 'Partner' : 'Partner/in';
  if (p.bezug) {   // Vorfahren des Partners: von ihm aus gezählt
    const wort = verwandtschaftEigen(p);
    return EN ? `${wort} of ${p.bezug.rufname}` : `${wort} von ${p.bezug.rufname}`;
  }
  return verwandtschaftEigen(p);
}

function verwandtschaftEigen(p) {
  const g = p.generation;
  if (p.rolle === 'start') return t('Hauptperson');
  if (!p.rolle) return '';
  const m = p.geschlecht === 'M', w = p.geschlecht === 'F';
  if (EN) {
    const great = n => n <= 0 ? '' : n === 1 ? 'great-' : n === 2 ? 'great-great-' : `${n}× great-`;
    const gross = s => s[0].toUpperCase() + s.slice(1);
    if (p.rolle === 'geschwister') return (p.halb ? 'Half-' : '') + (p.halb ? (m ? 'brother' : w ? 'sister' : 'sibling') : (m ? 'Brother' : w ? 'Sister' : 'Sibling'));
    if (p.rolle === 'schwager') return m ? 'Brother-in-law' : w ? 'Sister-in-law' : 'Sibling-in-law';
    if (p.rolle === 'neffe') {
      const grund = m ? 'nephew' : w ? 'niece' : 'nibling';
      return gross(g === 1 ? grund : great(g - 2) + 'grand' + grund);
    }
    if (p.rolle === 'nachkomme') {
      if (g === 1) return m ? 'Son' : w ? 'Daughter' : 'Child';
      return gross(great(g - 2) + (m ? 'grandson' : w ? 'granddaughter' : 'grandchild'));
    }
    if (g === 1) return m ? 'Father' : w ? 'Mother' : 'Parent';
    const wort = great(g - 2) + (m ? 'grandfather' : w ? 'grandmother' : 'grandparent');
    return `${p.seite === 'vater' ? 'Paternal' : 'Maternal'} ${wort}`;
  }
  const ur = n => n <= 0 ? '' : n === 1 ? 'Ur' : n === 2 ? 'Urur' : `${n}× Ur`;
  if (p.rolle === 'geschwister') {
    const grund = m ? 'Bruder' : w ? 'Schwester' : 'Geschwister';
    return p.halb ? 'Halb' + grund.toLowerCase() : grund;
  }
  if (p.rolle === 'schwager') return m ? 'Schwager' : w ? 'Schwägerin' : 'Schwager/Schwägerin';
  if (p.rolle === 'neffe') {
    const wort = grund => g === 1 ? grund : ur(g - 2) + (g === 2 ? 'Groß' : 'groß') + grund.toLowerCase();
    return m ? wort('Neffe') : w ? wort('Nichte') : `${wort('Neffe')}/${wort('Nichte')}`;
  }
  if (p.rolle === 'nachkomme') {
    if (g === 1) return m ? 'Sohn' : w ? 'Tochter' : 'Kind';
    const grund = m ? 'Enkel' : w ? 'Enkelin' : 'Enkelkind';
    return g === 2 ? grund : ur(g - 2) + grund.toLowerCase();
  }
  const grund = g === 1 ? (m ? 'Vater' : w ? 'Mutter' : 'Elternteil')
    : (m ? 'Großvater' : w ? 'Großmutter' : 'Großelternteil');
  const vor = ur(g - 2);
  const wort = vor ? vor + grund.toLowerCase() : grund;
  return g === 1 ? wort : `${wort} ${p.seite === 'vater' ? 'väterlicherseits' : 'mütterlicherseits'}`;
}

export function lebensdaten(p) {
  const geb = p.ereignisse.find(e => ['BIRT', 'CHR', 'BAPM'].includes(e.art) && (e.datum || e.ort));
  const tod = p.ereignisse.find(e => ['DEAT', 'BURI'].includes(e.art) && (e.datum || e.ort));
  const teil = (zeichen, e) => e ? `${zeichen} ${[e.datum, e.ort && ortKurz(e.ort)].filter(Boolean).join(' in ')}` : '';
  return [teil('*', geb), teil('†', tod)].filter(Boolean).join('  ·  ');
}

export function jahreKurz(p) {
  if (p.geburt && p.tod) return `${p.geburt} – ${p.tod}`;
  if (p.geburt) return `* ${p.geburt}`;
  if (p.tod) return `† ${p.tod}`;
  return `${EN ? 'c.' : 'um'} ${Math.round(p.jahrE / 5) * 5}`;
}

export function ortKurz(o) {
  if (!o) return '';
  return o.name.split(',')[0].replace(/\s*\([^)]*\)/g, '').trim();
}

// Notizen enthalten oft angehängte Herkunftsangaben („… – Gelesen aus …“); die gehören in die Quelle, nicht in die Geschichte
export function trenneNotiz(text) {
  if (!text) return { text: '', quelle: '' };
  // Bearbeitungsvermerke (Korrekturen, Anlage durch Claude, Bestätigungen) sind Quellenangaben, keine Lebensgeschichte
  if (/^(Angelegt|Geändert|Datum korrigiert|Korrigiert|Ergänzt|Übernommen|Abgleich|Hinweis)/.test(text) || /Gregor bestätigt|\(Claude, \d/.test(text) && !/ [–-] (Gelesen|Online gefunden|Gefunden)/.test(text))
    return { text: '', quelle: text };
  const m = text.match(/\s+[–-]\s+(Gelesen|Online gefunden|Gefunden|Laut )/);
  const t0 = m ? text.slice(0, m.index) : text;
  return { text: t0.replace(/\s*\(Claude[^)]*\)/g, '').trim(), quelle: m ? text.slice(m.index).replace(/^\s+[–-]\s+/, '') : '' };
}

function zeitAngabe(e) {
  const d = e.datum;
  if (!d) return '';
  if (EN) {   // „10 Jan 1901“, „Jan 1901“, „1901“ bekommen eine Präposition; „about 1850“, „between …“ stehen für sich
    if (/^\d{1,2} [A-Z][a-z]{2} \d{3,4}$/.test(d)) return `on ${d}`;
    if (/^([A-Z][a-z]{2} )?\d{3,4}$/.test(d)) return `in ${d}`;
    return d;
  }
  if (/^\d{1,2}\. /.test(d)) return `Am ${d}`;
  if (/^(vor|nach) \d{1,2}\. /.test(d)) return d[0].toUpperCase() + d.slice(1).replace(/^(or|ach) /, '$1 dem ');
  if (/^(um|ca\.|vor|nach|zwischen|von) /.test(d)) return d[0].toUpperCase() + d.slice(1);
  if (/^[A-ZÄÖÜ][a-zäöü]+\.? \d{3,4}$/.test(d)) return `Im ${d}`;
  return d;
}

function satz(zeit, subjekt, verb, rest) {
  const s = zeit ? `${zeit} ${verb} ${subjekt}${rest ? ' ' + rest : ''}` : `${subjekt} ${verb}${rest ? ' ' + rest : ''}`;
  return s.replace(/\s+/g, ' ').trim() + '.';
}

// englischer Satz: Subjekt, Aussage, Ort, Zeit („Michael is born in Billed on 10 Jan 1901.“)
function satzEn(subjekt, aussage, ort, zeit) {
  return [subjekt, aussage, ort ? `in ${ort}` : '', zeit].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + '.';
}

export function erzaehle(e, p) {
  e = { ...e, wert: (e.wert || '').replace(/\s*\?$/, '') };  // „Elisabeth ?“ → „Elisabeth“
  const n = p.rufname, z = zeitAngabe(e), o = ortKurz(e.ort);
  const alter = e.jahr && p.geburt && e.jahr > p.geburt ? e.jahr - p.geburt : null;
  if (EN) {
    switch (e.art) {
      case 'BIRT': return satzEn(n, 'is born', o, z);
      case 'CHR': case 'BAPM': return satzEn(n, 'is baptised', o, z);
      case 'MARR': return satzEn(n, `marries${e.wert ? ' ' + e.wert : ''}`, o, z);
      case 'ENGA': return satzEn(n, `gets engaged${e.wert ? ' to ' + e.wert : ''}`, o, z);
      case 'DIV': return satzEn('The marriage', `${e.wert ? 'to ' + e.wert + ' ' : ''}ends in divorce`, '', z);
      case 'DEAT': return satzEn(n, 'dies', o, z).replace(/\.$/, alter ? `, aged ${alter}.` : '.') + (e.ursache ? ` Cause: ${e.ursache}.` : '');
      case 'BURI': return satzEn(n, 'is buried', o, z);
      case 'CREM': return satzEn(n, 'is cremated', o, z);
      case 'OCCU': return satzEn(n, `works as ${e.wert || '…'}`, o, z);
      case 'RESI': return o ? satzEn(n, 'lives', o, z) : satzEn(n, `lives${e.wert ? ': ' + e.wert : ''}`, '', z);
      case 'EMIG': return satzEn(n, `emigrates${o ? ' from ' + o : ''}`, '', z);
      case 'IMMI': return satzEn(n, `immigrates${o ? ' to ' + o : ''}`, '', z);
      case 'RELI': return `Religion: ${e.wert || '–'}.`;
      default: return `${z ? z[0].toUpperCase() + z.slice(1) + ': ' : ''}${e.wert || e.titel}${o ? ' in ' + o : ''}.`;
    }
  }
  const inOrt = o ? `in ${o}` : '';
  switch (e.art) {
    case 'BIRT': return satz(z, n, 'kommt', `${inOrt} zur Welt`);
    case 'CHR': case 'BAPM': return satz(z, n, 'wird', `${inOrt} getauft`);
    case 'MARR': return satz(z, n, 'heiratet', `${e.wert || ''} ${inOrt}`);
    case 'ENGA': return satz(z, n, 'verlobt sich', `${e.wert ? 'mit ' + e.wert : ''} ${inOrt}`);
    case 'DIV': return z ? `${z} wird die Ehe${e.wert ? ' mit ' + e.wert : ''} geschieden.` : `Die Ehe${e.wert ? ' mit ' + e.wert : ''} wird geschieden.`;
    case 'DEAT': return satz(z, n, 'stirbt', `${inOrt}${alter ? `, ${alter} Jahre alt` : ''}`) + (e.ursache ? ` Ursache: ${e.ursache}.` : '');
    case 'BURI': return satz(z, n, 'wird', `${inOrt} begraben`);
    case 'CREM': return satz(z, n, 'wird', `${inOrt} eingeäschert`);
    case 'OCCU': return satz(z, n, 'arbeitet', `als ${e.wert || '…'} ${inOrt}`);
    case 'RESI': return o ? satz(z, n, 'lebt', inOrt) : satz(z, n, 'wohnt', e.wert ? `: ${e.wert}` : '');
    case 'EMIG': return satz(z, n, 'wandert', `${o ? 'aus ' + o + ' ' : ''}aus`);
    case 'IMMI': return satz(z, n, 'wandert', o ? `nach ${o} ein` : 'ein');
    case 'RELI': return `Religion: ${e.wert || '–'}.`;
    default: return `${z ? z + ': ' : ''}${e.wert || e.titel}${o ? ' in ' + o : ''}.`;
  }
}

// Kapitel der Bildgeschichte: Vorstellung, Lebensereignisse, Zeitgeschehen dazwischen, Ausklang
export function kapitel(p, alleZeit) {
  const name = p.name.rufname ? `${p.name.vorname} „${p.name.rufname}“` : p.rufname;
  const k = [{
    typ: 'intro', jahr: p.jahrE, titel: p.name.voll,
    text: EN ? `${name} is ${rolle(p)}. ${lebensdaten(p) || 'Little is known about the dates of this life.'}`
      : `${name} ist ${rolle(p)}. ${lebensdaten(p) || 'Über die Lebensdaten ist wenig bekannt.'}`,
    bild: p.gesicht || p.bilder.find(b => b.art === 'foto')?.src || null, rund: !!p.gesicht,
  }];
  // leere Einträge (ohne Datum, Ort, Wert und Notiz) erzählen nichts – außer dem Tod
  const evs = p.ereignisse.filter(e => e.art !== 'RELI' && (e.art === 'DEAT' || e.datum || e.ort || e.wert || trenneNotiz(e.notiz).text))
    .sort((a, b) => sortJahr(a, p) - sortJahr(b, p));
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const { text: notiz } = trenneNotiz(e.notiz);
    const text = erzaehle(e, p) + (notiz ? ' ' + notiz : '');
    // Taufe zur Geburt und Begräbnis zum Tod ziehen
    const vorher = k[k.length - 1];
    if (((e.art === 'CHR' || e.art === 'BAPM') && vorher.art === 'BIRT') || (e.art === 'BURI' && vorher.art === 'DEAT')) {
      vorher.text += ' ' + text;
      continue;
    }
    k.push({ typ: 'ereignis', art: e.art, jahr: e.jahr, titel: e.titel, datum: e.datum, text, ort: e.ort, bild: null });
  }
  // Zeitgeschehen: regionale Ereignisse vorziehen, höchstens acht
  let zg = zeitgeschehenFuer(p, alleZeit);
  const allgemein = z => z.regionen.includes('europa') || z.regionen.includes('welt') ? 1 : 0;
  if (zg.length > 8) zg = [...zg].sort((a, b) => allgemein(a) - allgemein(b)).slice(0, 8);
  for (const z of zg) {
    const j = Math.max(z.jahr, p.jahrE);
    let zusatz = '';
    if (p.geburt && z.jahr < p.geburt) zusatz = EN ? `${p.rufname} is born around this time.` : `${p.rufname} kommt in dieser Zeit zur Welt.`;
    else if (p.geburt) zusatz = z.jahr === p.geburt ? (EN ? `${p.rufname} is born this year.` : `${p.rufname} wird in diesem Jahr geboren.`)
      : (EN ? `${p.rufname} is ${z.jahr - p.geburt} years old at the time.` : `${p.rufname} ist damals ${z.jahr - p.geburt} Jahre alt.`);
    k.push({ typ: 'zeit', jahr: j, titel: z.titel, datum: z.bis ? `${z.jahr}–${z.bis}` : `${z.jahr}`, text: z.text, zusatz });
  }
  k.sort((a, b) => (a.typ === 'intro' ? -1e9 : sortJahr(a, p)) - (b.typ === 'intro' ? -1e9 : sortJahr(b, p)));
  // Fotos lassen sich keinem Ereignis sicher zuordnen (Dateinamen tragen kein Aufnahmedatum): eigene Albumseiten
  const nummern = art => p.bilder.map((b, n) => b.art === art ? n : -1).filter(n => n >= 0);
  const fotoNr = nummern('foto'), dokNr = [...nummern('urkunde'), ...nummern('grab'), ...nummern('zeitung')], ortNr = nummern('ort');
  const r = p.rufname, nf = fotoNr.length, nd = dokNr.length;
  if (nf) k.push({ typ: 'album', titel: t('Aus dem Familienalbum'), bilder: fotoNr.slice(0, 6),
    text: EN ? `${nf === 1 ? 'One photo' : nf + ' photos'} of ${r} ${nf === 1 ? 'is' : 'are'} linked in webtrees. Click a picture to enlarge it.`
      : `${nf === 1 ? 'Ein Foto' : nf + ' Fotos'} von ${r} ${nf === 1 ? 'ist' : 'sind'} in webtrees verknüpft. Ein Klick öffnet ein Bild groß.` });
  if (nd) k.push({ typ: 'album', titel: t('Dokumente'), bilder: dokNr.slice(0, 6),
    text: EN ? (nd === 1 ? `One document about ${r}.` : `${nd} documents about ${r}: certificates, pedigree charts, grave photos.`)
      : (nd === 1 ? `Ein Dokument zu ${r}.` : `${nd} Dokumente zu ${r}: Urkunden, Ahnentafeln, Grabbilder.`) });
  if (ortNr.length) k.push({ typ: 'album', titel: t('Orte und Zeit'), bilder: ortNr.slice(0, 6),
    text: EN ? `Views of the places and the times in which ${r} lived.` : `Ansichten der Orte und der Zeit, in der ${r} lebte.` });
  const nb = p.bilder.length;
  const erhalten = EN ? (nb > 1 ? ` ${nb} pictures and documents of ${r} have been preserved.` : nb ? ` One picture of ${r} has been preserved.` : '')
    : (nb > 1 ? ` Von ${r} sind ${nb} Bilder und Dokumente erhalten.` : nb ? ` Von ${r} ist ein Bild erhalten.` : '');
  const hp = hauptperson?.name.voll ?? '';
  const f = p.geschlecht === 'F', m = p.geschlecht === 'M';
  if (p.rolle === 'vorfahr') k.push({ typ: 'ausklang', jahr: null, titel: t('Was bleibt'), bild: null, weiterId: p.zumStart.id,
    text: (EN ? `${r} is the ${f ? 'mother' : m ? 'father' : 'parent'} of ${p.zumStart.name.voll} – this is how the line continues down to ${hp}.`
      : `${r} ist ${f ? 'die Mutter' : m ? 'der Vater' : 'ein Elternteil'} von ${p.zumStart.name.voll} – so führt die Linie weiter bis zu ${hp}.`) + erhalten });
  else if (p.rolle === 'nachkomme') k.push({ typ: 'ausklang', jahr: null, titel: t('Was bleibt'), bild: null, weiterId: p.zumStart.id,
    text: (EN ? `${r} is the ${f ? 'daughter' : m ? 'son' : 'child'} of ${p.zumStart.name.voll} – this is how the line leads back to ${hp}.`
      : `${r} ist ${f ? 'die Tochter' : m ? 'der Sohn' : 'ein Kind'} von ${p.zumStart.name.voll} – so führt die Linie zurück zu ${hp}.`) + erhalten });
  else if (p.kinderP.length) k.push({ typ: 'ausklang', jahr: null, titel: t('Was bleibt'), bild: null,
    text: (EN ? `${r} has ${p.kinderP.length === 1 ? 'one child' : p.kinderP.length + ' children'}: ${p.kinderP.map(c => c.rufname).join(', ')}.`
      : `${r} hat ${p.kinderP.length === 1 ? 'ein Kind' : p.kinderP.length + ' Kinder'}: ${p.kinderP.map(c => c.rufname).join(', ')}.`) + erhalten });
  return k;
}

// Ereignisse ohne Jahr: Geburt nach vorn, Tod ans Ende, alles andere davor
// Geburt steht vor allem anderen desselben Jahres; nichts liegt vor der Geburt (z. B. „Wohnort ab 1900“ bei Geburt 1901)
export function sortJahr(x, p) {
  const art = x.art ?? x.e?.art;
  const geburt = ['BIRT', 'CHR', 'BAPM'].includes(art);
  const folge = { BIRT: -0.5, CHR: -0.45, BAPM: -0.45, DEAT: 0.3, BURI: 0.4, CREM: 0.4 }[art] ?? 0;
  if (x.jahr != null) return geburt ? x.jahr + folge : Math.max(x.jahr, p?.geburt ?? -1e9) + folge;
  if (geburt) return -1e8;
  if (['DEAT', 'BURI', 'CREM'].includes(art)) return 1e9;
  return 1e9 - 1;
}

function rolle(p) {
  if (p.rolle === 'start' || !p.rolle) return EN ? 'the starting point of this story' : 'der Ausgangspunkt dieser Geschichte';
  const hp = hauptperson.rufname;
  const v = verwandtschaft(p);
  if (EN) {
    const klein = v[0].toLowerCase() + v.slice(1);
    if (p.geschlecht === 'U') return `in the family of ${hp} (${klein})`;
    if (p.bezug) return `the ${klein}, the partner of ${hp}`;
    return `the ${klein} of ${hp}`;
  }
  if (p.geschlecht === 'U') return `in der Familie von ${hp} (${v})`;
  if (p.bezug) return `${p.geschlecht === 'F' ? 'die' : 'der'} ${v}, ${p.bezug.geschlecht === 'F' ? 'der Partnerin' : 'des Partners'} von ${hp}`;
  return `${p.geschlecht === 'F' ? 'die' : 'der'} ${v} von ${hp}`;
}
