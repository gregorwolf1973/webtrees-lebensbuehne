// Daten laden und aufbereiten: geschätzte Jahre, Regionen, Verwandtschaft, Texte für Lebenslauf und Bildgeschichte.

export const JETZT = new Date().getFullYear();
// Im webtrees-Modul setzt die Seite die Adressen (window.LEBENSBUEHNE), lokal gelten die Dateien in data/ und media/
export const LB = window.LEBENSBUEHNE || {};

export async function ladeDaten() {
  const [roh, zeit] = await Promise.all([
    fetch(LB.daten || 'data/personen.json').then(r => { if (!r.ok) throw new Error('Daten: ' + r.status); return r.json(); }),
    fetch(LB.zeitgeschehen || 'data/zeitgeschehen.json').then(r => r.json()),
  ]);
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
        if (q) p.regionen = new Set(q.regionen);
      }

  // Einträge mit „nurKlang“ steuern nur die Geräusche und erscheinen nicht im Zeitgeschehen
  return { personen, byId, zeit: zeit.filter(z => !z.nurKlang), klangZeit: zeit.filter(z => z.klang), start: byId.get(LB.start) || byId.get(roh.start) || personen[0] };
}

// Wer gerade die Hauptperson ist (für Texte wie „der Großvater von Anna“)
let hauptperson = null;

// Personen der Ansicht: die Hauptperson, ihre Vorfahren und/oder Nachkommen; setzt die Ansichtsfelder an den Personen
export function ansicht(daten, root, { vorfahren = true, nachkommen = false, partner = false } = {}) {
  for (const p of daten.personen) {
    p.imBild = false; p.rolle = null; p.generation = null; p.seite = null; p.partnerseite = false; p.bezug = null;
    p.sosa = null; p.zumStart = null; p.mannesstamm = false; p.zweig = null;
  }
  hauptperson = root;
  Object.assign(root, { imBild: true, rolle: 'start', generation: 0, seite: 'start', sosa: 1 });
  const liste = [root];
  // Vorfahren einer Person (Hauptperson oder Partner); bei Partnern zählt die Verwandtschaft von ihnen aus
  const vorfahrenVon = (start, partnerseite) => {
    const reihe = [start];
    while (reihe.length) {
      const x = reihe.shift();
      [[x.vaterP, 0], [x.mutterP, 1]].forEach(([e, add]) => {
        if (!e || e.imBild) return;   // Ahnenschwund: jede Person nur einmal
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
  if (nachkommen) {
    const reihe = [root];
    while (reihe.length) {
      const x = reihe.shift();
      [...x.kinderP].sort((a, b) => a.jahrE - b.jahrE).forEach((c, i) => {
        if (c.imBild) return;
        Object.assign(c, { imBild: true, rolle: 'nachkomme', generation: (x.rolle === 'partner' ? 0 : x.generation) + 1, zumStart: x, seite: 'nachkomme',
          zweig: x === root ? i : x.zweig });
        liste.push(c); reihe.push(c);
      });
    }
  }
  return liste;
}

export function regionenVonOrt(name) {
  const n = name.toLowerCase();
  const r = [];
  if (/banat|temeswar|timi|rum[äa]nien|siebenb|bukarest|constan/.test(n)) r.push('banat');
  if (/ungarn|budapest|szeged|mak[óo]|h[óo]dmez/.test(n)) r.push('ungarn');
  if (/lothringen|luxemburg|belgien|trier|pfalz|saar|elsass|albertshausen|flandern|höllingen|heling/.test(n)) r.push('westen');
  if (/(^|, )d$|deutschland|bayern|münchen|westfalen|baden|geretsried|wolfratshausen/.test(n)) r.push('deutschland');
  return r;
}

export function passtZeitgeschehen(z, p) {
  return z.regionen.some(r => r === 'europa' || p.regionen.has(r) ||
    (r === 'ungarn' && p.regionen.has('banat') && z.jahr < 1920));
}

export function zeitgeschehenFuer(p, alle) {
  const von = p.jahrE, bis = p.ende;
  return alle.filter(z => passtZeitgeschehen(z, p) && (z.bis ?? z.jahr) >= von && z.jahr <= bis);
}

export function verwandtschaft(p) {
  if (p.rolle === 'partner') return p.geschlecht === 'F' ? 'Partnerin' : p.geschlecht === 'M' ? 'Partner' : 'Partner/in';
  if (p.bezug) {   // Vorfahren des Partners: von ihm aus gezählt
    const wort = verwandtschaftEigen(p);
    return `${wort} von ${p.bezug.rufname}`;
  }
  return verwandtschaftEigen(p);
}

function verwandtschaftEigen(p) {
  const g = p.generation;
  if (p.rolle === 'start') return 'Hauptperson';
  if (!p.rolle) return '';
  const m = p.geschlecht === 'M', w = p.geschlecht === 'F';
  const ur = n => n <= 0 ? '' : n === 1 ? 'Ur' : n === 2 ? 'Urur' : `${n}× Ur`;
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
  return `um ${Math.round(p.jahrE / 5) * 5}`;
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
  const t = m ? text.slice(0, m.index) : text;
  return { text: t.replace(/\s*\(Claude[^)]*\)/g, '').trim(), quelle: m ? text.slice(m.index).replace(/^\s+[–-]\s+/, '') : '' };
}

function zeitAngabe(e) {
  const d = e.datum;
  if (!d) return '';
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

export function erzaehle(e, p) {
  e = { ...e, wert: (e.wert || '').replace(/\s*\?$/, '') };  // „Elisabeth ?“ → „Elisabeth“
  const n = p.rufname, z = zeitAngabe(e), o = ortKurz(e.ort);
  const inOrt = o ? `in ${o}` : '';
  const alter = e.jahr && p.geburt && e.jahr > p.geburt ? e.jahr - p.geburt : null;
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
  const k = [{
    typ: 'intro', jahr: p.jahrE, titel: p.name.voll,
    text: `${p.name.rufname ? `${p.name.vorname} „${p.name.rufname}“` : p.rufname} ist ${rolle(p)}. ${lebensdaten(p) || 'Über die Lebensdaten ist wenig bekannt.'}`,
    bild: p.gesicht || p.bilder.find(b => b.art === 'foto')?.src || null, rund: !!p.gesicht,
  }];
  // leere Einträge (ohne Datum, Ort, Wert und Notiz) erzählen nichts – außer dem Tod
  const evs = p.ereignisse.filter(e => e.art !== 'RELI' && (e.art === 'DEAT' || e.datum || e.ort || e.wert || trenneNotiz(e.notiz).text))
    .sort((a, b) => sortJahr(a, p) - sortJahr(b, p));
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const { text: notiz } = trenneNotiz(e.notiz);
    let text = erzaehle(e, p) + (notiz ? ' ' + notiz : '');
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
  if (zg.length > 8) zg = [...zg].sort((a, b) => (a.regionen.includes('europa') ? 1 : 0) - (b.regionen.includes('europa') ? 1 : 0)).slice(0, 8);
  for (const z of zg) {
    const j = Math.max(z.jahr, p.jahrE);
    let zusatz = '';
    if (p.geburt && z.jahr < p.geburt) zusatz = `${p.rufname} kommt in dieser Zeit zur Welt.`;
    else if (p.geburt) zusatz = z.jahr === p.geburt ? `${p.rufname} wird in diesem Jahr geboren.` : `${p.rufname} ist damals ${z.jahr - p.geburt} Jahre alt.`;
    k.push({ typ: 'zeit', jahr: j, titel: z.titel, datum: z.bis ? `${z.jahr}–${z.bis}` : `${z.jahr}`, text: z.text, zusatz });
  }
  k.sort((a, b) => (a.typ === 'intro' ? -1e9 : sortJahr(a, p)) - (b.typ === 'intro' ? -1e9 : sortJahr(b, p)));
  // Fotos lassen sich keinem Ereignis sicher zuordnen (Dateinamen tragen kein Aufnahmedatum): eigene Albumseiten
  const nummern = art => p.bilder.map((b, n) => b.art === art ? n : -1).filter(n => n >= 0);
  const fotoNr = nummern('foto'), dokNr = [...nummern('urkunde'), ...nummern('grab')];
  if (fotoNr.length) k.push({ typ: 'album', titel: 'Aus dem Familienalbum', bilder: fotoNr.slice(0, 6),
    text: `${fotoNr.length === 1 ? 'Ein Foto' : fotoNr.length + ' Fotos'} von ${p.rufname} ${fotoNr.length === 1 ? 'ist' : 'sind'} in webtrees verknüpft. Ein Klick öffnet ein Bild groß.` });
  if (dokNr.length) k.push({ typ: 'album', titel: 'Dokumente', bilder: dokNr.slice(0, 6),
    text: dokNr.length === 1 ? `Ein Dokument zu ${p.rufname}.` : `${dokNr.length} Dokumente zu ${p.rufname}: Urkunden, Ahnentafeln, Grabbilder.` });
  const erhalten = p.bilder.length > 1 ? ` Von ${p.rufname} sind ${p.bilder.length} Bilder und Dokumente erhalten.` : p.bilder.length ? ` Von ${p.rufname} ist ein Bild erhalten.` : '';
  const hp = hauptperson?.name.voll ?? '';
  if (p.rolle === 'vorfahr') k.push({ typ: 'ausklang', jahr: null, titel: 'Was bleibt', bild: null, weiterId: p.zumStart.id,
    text: `${p.rufname} ist ${p.geschlecht === 'F' ? 'die Mutter' : p.geschlecht === 'M' ? 'der Vater' : 'ein Elternteil'} von ${p.zumStart.name.voll} – so führt die Linie weiter bis zu ${hp}.` + erhalten });
  else if (p.rolle === 'nachkomme') k.push({ typ: 'ausklang', jahr: null, titel: 'Was bleibt', bild: null, weiterId: p.zumStart.id,
    text: `${p.rufname} ist ${p.geschlecht === 'F' ? 'die Tochter' : p.geschlecht === 'M' ? 'der Sohn' : 'ein Kind'} von ${p.zumStart.name.voll} – so führt die Linie zurück zu ${hp}.` + erhalten });
  else if (p.kinderP.length) k.push({ typ: 'ausklang', jahr: null, titel: 'Was bleibt', bild: null,
    text: `${p.rufname} hat ${p.kinderP.length === 1 ? 'ein Kind' : p.kinderP.length + ' Kinder'}: ${p.kinderP.map(c => c.rufname).join(', ')}.` + erhalten });
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
  if (p.rolle === 'start' || !p.rolle) return 'der Ausgangspunkt dieser Geschichte';
  const hp = hauptperson.rufname;
  if (p.geschlecht === 'U') return `in der Familie von ${hp} (${verwandtschaft(p)})`;
  if (p.bezug) return `${p.geschlecht === 'F' ? 'die' : 'der'} ${verwandtschaft(p)}, ${p.bezug.geschlecht === 'F' ? 'der Partnerin' : 'des Partners'} von ${hp}`;
  return `${p.geschlecht === 'F' ? 'die' : 'der'} ${verwandtschaft(p)} von ${hp}`;
}
