// Oberflächentexte: Der deutsche Text ist der Schlüssel, die Übersetzung steht in resources/lang/<sprache>.json.
// Im webtrees-Modul bettet die Seite Sprache und Übersetzung ein (Sprache von webtrees, sonst Englisch);
// lokal gilt Deutsch, mit ?lang=en zum Ausprobieren.
const LB = window.LEBENSBUEHNE || {};
const lokal = !window.LEBENSBUEHNE && new URLSearchParams(location.search).get('lang');

export const SPRACHE = LB.sprache || lokal || 'de';
export const EN = SPRACHE !== 'de';

let texte = LB.texte || {};
if (lokal && lokal !== 'de') {
  try { texte = await fetch(`lang/${lokal}.json`).then(r => r.json()); } catch (e) { texte = {}; }
}

// t('Hallo {name}', { name }) – fehlt eine Übersetzung, bleibt der deutsche Text stehen
export function t(de, werte) {
  let s = EN ? (texte[de] ?? de) : de;
  if (werte) s = s.replace(/\{(\w+)\}/g, (_, k) => werte[k] ?? '');
  return s;
}
