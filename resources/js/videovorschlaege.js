// Videovorschläge zur deutschen Geschichte: frei lizenzierte Filme, vor allem von Wikimedia Commons (als abspielbare
// VP9-WebM-Fassung, Chrome spielt kein Theora mehr). Neue Einträge erscheinen einmal von selbst in der Auswahl jedes
// Browsers; die id darf sich darum nie ändern. start/ende in Sekunden schneiden einen Ausschnitt zu.
const C = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/';
const SEITE = 'https://commons.wikimedia.org/wiki/File:';

export const VORSCHLAEGE = [
  { id: 'c-ellis', titel: 'Einwanderer auf Ellis Island', von: 1892, bis: 1913,
    url: C + 'b/b7/Ellis_Island_immigration_footage.ogv/Ellis_Island_immigration_footage.ogv.240p.vp9.webm',
    quelle: SEITE + 'Ellis_Island_immigration_footage.ogv', lizenz: 'gemeinfrei' },
  { id: 'c-ww1', titel: 'Erster Weltkrieg: Aufnahmen von der Front', von: 1914, bis: 1918, start: 120,
    url: C + '3/39/Flashes_of_Action-_Actualities_of_the_World_War.webm/Flashes_of_Action-_Actualities_of_the_World_War.webm.1080p.vp9.webm',
    quelle: SEITE + 'Flashes_of_Action-_Actualities_of_the_World_War.webm', lizenz: 'gemeinfrei' },
  { id: 'c-franzjoseph', titel: 'Begräbnis Kaiser Franz Josephs, Wien 1916', von: 1916, bis: 1917,
    url: C + 'd/dd/Funeral_Franz-Joseph.webm/Funeral_Franz-Joseph.webm.480p.vp9.webm',
    quelle: SEITE + 'Funeral_Franz-Joseph.webm', lizenz: 'gemeinfrei' },
  { id: 'c-aachen', titel: 'Zweiter Weltkrieg: Kampf um Aachen 1944', von: 1939, bis: 1944,
    url: C + '0/0f/111-adc-2655_Fall_of_Aachen_Germany.webm/111-adc-2655_Fall_of_Aachen_Germany.webm.1080p.vp9.webm',
    quelle: SEITE + '111-adc-2655_Fall_of_Aachen_Germany.webm', lizenz: 'gemeinfrei' },
  { id: 'c-truemmer', titel: 'Zerstörte Städte 1945: Nürnberg und Darmstadt', von: 1945, bis: 1948,
    url: C + '1/1e/Bomb-damaged_Nuremberg_and_Darmstadt.webm/Bomb-damaged_Nuremberg_and_Darmstadt.webm.480p.vp9.webm',
    quelle: SEITE + 'Bomb-damaged_Nuremberg_and_Darmstadt.webm', lizenz: 'gemeinfrei' },
  { id: 'c-mond', titel: 'Mondlandung 1969', von: 1969, bis: 1970,
    url: C + 'a/a6/Apollo_11_Landing_-_first_steps_on_the_moon.ogv/Apollo_11_Landing_-_first_steps_on_the_moon.ogv.240p.vp9.webm',
    quelle: SEITE + 'Apollo_11_Landing_-_first_steps_on_the_moon.ogv', lizenz: 'gemeinfrei' },
];
