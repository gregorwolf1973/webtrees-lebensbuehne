// Bildauswahl je Person: welche Bilder Bildgeschichte und Zeitreise zeigen und in welcher Reihenfolge. Die Wahl merkt
// sich der Browser (localStorage lb-bilder: { <xref>: { reihe: [Schlüssel …], aus: [Schlüssel …] } }).
// p.alleBilder behält alle Bilder, p.bilder ist die gewählte, geordnete Auswahl, die alle anderen Teile nutzen.
const schluessel = b => b.id || b.src;

let wahl = {};
try { wahl = JSON.parse(localStorage.getItem('lb-bilder') || '{}') || {}; } catch (e) { /* ohne Speicher */ }
const speichern = () => { try { localStorage.setItem('lb-bilder', JSON.stringify(wahl)); } catch (e) { /* ohne Speicher */ } };

/** Alle Bilder in der gewählten Reihenfolge (ohne eigene Reihenfolge wie aus webtrees) */
export function geordnet(p) {
  const alle = p.alleBilder ?? p.bilder, reihe = wahl[p.id]?.reihe;
  if (!reihe?.length) return [...alle];
  const pos = new Map(reihe.map((k, i) => [k, i]));
  return alle.map((b, i) => [b, pos.get(schluessel(b)) ?? reihe.length + i]).sort((x, y) => x[1] - y[1]).map(([b]) => b);
}

export const istAus = (p, b) => !!wahl[p.id]?.aus?.includes(schluessel(b));
export const eigeneReihe = p => !!wahl[p.id]?.reihe?.length;

/** p.bilder aus der Wahl neu bilden */
export function anwenden(p) {
  p.alleBilder ??= p.bilder;
  p.bilder = geordnet(p).filter(b => !istAus(p, b));
}

/** Wahl für eine Person setzen; `reihe` und `aus` sind Bildlisten */
export function setze(p, { reihe, aus }) {
  const w = wahl[p.id] ??= { reihe: [], aus: [] };
  if (reihe) w.reihe = reihe.map(schluessel);
  if (aus) w.aus = aus.map(schluessel);
  if (!w.reihe.length && !w.aus.length) delete wahl[p.id];
  speichern();
  anwenden(p);
}

export function zuruecksetzen(p) {
  delete wahl[p.id];
  speichern();
  anwenden(p);
}
