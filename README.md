# Lebensbühne für webtrees

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/gregorwolf1973) [![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/Gregor_Wolf/donate)

Die Lebensbühne zeigt einen Stammbaum als begehbaren 3D-Zeittunnel: Vorfahren, Nachkommen und Partnerfamilien
stehen als Bilderkarten in der Tiefe des Raums, nach Geburtsjahr gestaffelt. Ein Zeitregler und eine Zeitreise
lassen die Generationen aufleuchten und wieder verblassen. Dazu kommen Lebensgeschichten, Fotos, eine Karte des
Lebenswegs und das Zeitgeschehen der jeweiligen Region.

*English: “Lebensbühne” (stage of life) is a webtrees custom module that shows a family tree as a 3D time
tunnel with a time travel, life stories, photos, maps and historical events. The user interface is available in German and English.*

## Funktionen

- **Ansichten:** Vorfahren, Nachkommen und die Familie des Partners. Die Hauptperson lässt sich frei wählen, per Suche oder Doppelklick. Die Auswahl „Generationen“ (2 bis 15 oder alle; ohne gemerkte Wahl zeigen Stammbäume bis 1.500 Personen alles, größere starten mit 5 Generationen) legt fest, wie weit der Fächer von der Hauptperson aus reicht; der Browser merkt sich die Wahl, und eine Anzeige nennt, wie viele Personen zu sehen sind und ob weitere Generationen ausgeblendet sind. Bei großen Stammbäumen lässt sich so schrittweise erhöhen, was der Rechner schafft.
- **Geschwister:** Der Knopf „Geschwister“ zeigt die Geschwister der Hauptperson in Geburtsreihenfolge auf dem ersten Ring, dahinter die Eltern. Halbgeschwister (anderer Vater oder andere Mutter) haben einen gestrichelten Rahmen und hängen am gemeinsamen Elternteil. Weiter außen folgen Nichten, Neffen und deren Nachkommen, so weit die Auswahl „Generationen“ reicht. Mit „Partner“ stehen die Partner der Geschwister daneben. Zusammen mit „Vorfahren“ kommen die Geschwister aller Vorfahren dazu – Onkel, Tanten, Großonkel – mit ihren Nachkommen bis zur Generation der Hauptperson (Cousins); die Bezeichnungen zählen den Grad wie üblich (Onkel 2. Grades, Cousin 2. Grades). Die Ansicht lässt sich mit Vorfahren und Nachkommen kombinieren.
- **Netz:** alle Verwandten auf einen Blick, ähnlich der Ansicht „Lineage“, aber räumlich: Jede Familie ist ein Stern – ein leuchtender Punkt, die Eltern dicht daran, die Kinder als Strahlen ringsum. Über die Kinder, die selbst eine Familie gründen, hängen die Sterne aneinander; eine Kräftesimulation ordnet alles im Raum, und das Netz dreht sich langsam. Die Farbe ist der Klang des Familiennamens (Kölner Phonetik, damit „Thöresz“, „Theres“ und „Tyres“ gleich aussehen). Ein Klick hebt die Familiensterne der Person hervor; Zeitreise und Sternhimmel funktionieren wie im Fächer. Wie weit das Netz reicht, stellt die Auswahl „Tiefe“ ein (Schritte über Eltern, Kinder und Partner); höchstens 2.500 Personen, die nächsten zuerst, damit auch Stammbäume mit Zehntausenden Personen den Browser nicht überfordern.
- **Bildansicht:** Ein Klick auf ein Bild öffnet es groß. Mit dem Mausrad lässt es sich zum Mauszeiger hin vergrößern (bis 12-fach), mit gedrückter Maustaste verschieben; Doppelklick vergrößert oder setzt zurück, die Tasten + − 0 zoomen ebenfalls. Pfeiltasten blättern, Esc schließt.
- **Zeitreise:** einstellbares Tempo in Jahren pro Minute. Wer geboren wird, leuchtet auf. Wer gestorben ist, verblasst. Ohne Todesdatum verblasst die Person nach 80 Jahren.
- **Zeitgeschehen:** Kriege, Auswanderung, Seuchen und weitere Ereignisse laufen als Abspann mit. Der Schalter „Weltgeschehen“ blendet allgemeine Ereignisse wie den Kalten Krieg aus; dann bleiben nur die Regionen der Familie und eigene Einträge.
- **Lebensgeschichte zu jeder Person:** Bildgeschichte, Lebenslauf, Bilder und die Karte des Lebenswegs (Leaflet mit OpenStreetMap).
- **Erzählung:** eine ausformulierte Lebensgeschichte je Person, auf Wunsch vom Browser vorgelesen – in ganzen Sätzen, mit einstellbarem Tempo und wählbarer Stimme (beides merkt sich der Browser). Dazu die Texte aus dem webtrees-Modul „Geschichten“, wenn es aktiv ist.
- **Historische Grenzen:** Auf der Karte des Lebenswegs erscheinen die Staatsgrenzen zur Zeit der jeweiligen Station, von 1700 bis heute.
- **2,5D-Porträts:** Das Gesicht auf der ersten Seite der Bildgeschichte wird zu einem räumlichen Porträt, das sich sanft bewegt und Maus oder Finger folgt.
- **Ton:** frei lizenzierte Geräusche passend zur Epoche (sonst im Browser erzeugt), auf Wunsch eigene Aufnahmen. Dazu drei mitgelieferte Lieder oder ein eigenes, an dessen Länge sich das Tempo der Zeitreise anpassen lässt. Geburt, Hochzeit und Tod erklingen nur in der hervorgehobenen direkten Linie: von der angeklickten Person zur Hauptperson, ohne Auswahl von der ältesten Person aus. Es klingt immer nur ein Geräusch: Geburt, Hochzeit und Tod gehen vor, ein Ereignis des Zeitgeschehens ist eine kurze, weich ein- und ausgeblendete Szene – auch wenn es Jahrzehnte dauert.
- **Sternhimmel:** echte Sterne aus dem Yale Bright Star Catalogue (gemeinfrei) mit Helligkeit und Farbe wie am Himmel, dazu die Milchstraße – nur im Hintergrund.
- **Wenig Last für die Grafikkarte:** Alle Karten werden in einem Zug gezeichnet, ihre Bilder liegen gesammelt in wenigen großen Texturen. Jede Karte bekommt nur die Auflösung, die sie auf dem Bildschirm braucht, Gesichter laden erst, wenn die Karte zu sehen ist. Ohne Bewegung zeichnet die Bühne gar nicht; Zeitreise, Drehen und Netz laufen mit der Bildrate aus der Fußleiste (15 bis 60 Bilder pro Sekunde oder „max“, Standard 30).
- **Handy und Tablet:** Suche und Ansichten liegen dort im Menü ☰. Der Überblick passt sich der Bildschirmform an, damit der ganze Stammbaum zu sehen ist.
- **Bilder nur aus webtrees:** Die Fotos kommen aus der Medienverwaltung. Gesichter werden aus den Markierungen des Moduls [webtrees-faces](https://github.com/UksusoFF/webtrees-faces) ausgeschnitten, falls es installiert ist.

## Voraussetzungen

- webtrees 2.2 mit PHP 8.3 oder neuer
- empfohlen: die PHP-Erweiterung Imagick für die Gesichtsausschnitte. Ohne Imagick zeigt das Modul ein mittiges Vorschaubild.

## Installation

1. Unter [Releases](https://github.com/gregorwolf1973/webtrees-lebensbuehne/releases/latest) die Datei `lebensbuehne-<Version>.zip` herunterladen und im Ordner `modules_v4/` von webtrees entpacken. Es entsteht `modules_v4/lebensbuehne/`, darin liegt direkt die Datei `module.php`.
2. In webtrees unter *Verwaltung → Module → Diagramme* prüfen, dass die „Lebensbühne“ aktiviert ist.
3. Aufruf: im Diagramm-Menü einer Person den Punkt „Lebensbühne“ wählen, oder direkt `…/tree/<Baum>/lebensbuehne/<XREF>`.

Die größeren Lieder (Donau, Moldau, Beethoven) liegen nicht im ZIP, sondern als eigene Dateien `musik_*.m4a` am Release. Wer sie haben möchte, legt sie nach `modules_v4/lebensbuehne/resources/musik/`; sie erscheinen dann von selbst in der Liedauswahl.

## Wer darf die Lebensbühne sehen?

Nur **angemeldete Mitglieder** des jeweiligen Stammbaums. Gäste werden zur Anmeldung geschickt. Das gilt für die Seite, die Daten, die Gesichtsausschnitte und die Klänge, und zwar unabhängig von der Einstellung in der Modulverwaltung. Dort lässt sich der Zugang nur weiter einschränken, etwa auf Verwalter.

Die Daten stellt webtrees für den jeweiligen Betrachter zusammen. Dabei gelten die Datenschutz-Einstellungen des Baums: Was ein Mitglied in webtrees nicht sehen darf, erscheint auch nicht in der Lebensbühne.

Die Seite lädt keine Skripte von fremden Servern, three.js, Leaflet, die Grenzdaten, Klänge und Lieder liegen im Modul. Nur die Kartenkacheln kommen von OpenStreetMap. Das Vorlesen übernimmt die Sprachausgabe des Browsers; je nach Browser und Gerät kann sie den Text an einen Sprachdienst des Herstellers schicken.

## Erzählungen

Die Erzählungen sind keine webtrees-Daten, sondern eine Datei im Datenordner, je Stammbaum eine:

```
data/lebensbuehne/geschichten/<Baumname>.json
```

```json
{ "_stand": "25.10.2026", "X123": "Erster Absatz …\n\nZweiter Absatz …" }
```

Absätze trennt eine Leerzeile. Die Texte kann man selbst schreiben oder von einer KI aus den webtrees-Daten schreiben lassen; die Lebensbühne kennzeichnet sie als „Erzählt von Claude (KI)“. Wer die Datei pflegt, sollte jede Aussage gegen webtrees prüfen. Personen, die ein Betrachter nicht sehen darf, bekommen auch keine Erzählung.

## 2,5D-Porträts

Ohne weiteres Zutun bekommt jedes Porträt eine weiche Kopfwölbung. Echtes Relief entsteht mit Tiefenkarten, die einmal auf einem PC berechnet werden:

```
pip install onnxruntime numpy pillow
python3 tools/tiefen.py <webtrees>/data/lebensbuehne/cache <webtrees>/data/lebensbuehne/tiefen
```

Das Skript nimmt die Gesichtsausschnitte, die das Modul beim Ansehen im Zwischenspeicher ablegt, und schätzt die Tiefe mit dem Modell [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small) (Apache-2.0, etwa 100 MB, wird beim ersten Lauf geladen). Vorhandene Tiefenkarten werden übersprungen, neue Gesichter kommen also beim nächsten Lauf dazu.

## Historische Grenzen

Die Grenzen stammen aus [historical-basemaps](https://github.com/aourednik/historical-basemaps) von André Ourednik (GPL-3.0). Mitgeliefert ist ein vereinfachter Europa-Ausschnitt für 15 Stichjahre zwischen 1700 und 2010 in `resources/data/grenzen/`. Erzeugt wird er mit `tools/grenzen.py`. Die Karte zeigt jeweils den letzten Stand vor dem Jahr der Station, also für 1905 die Grenzen von 1900. Die Daten sind für große Maßstäbe gedacht und an Grenzflüssen ungenau.

## Klänge und Lieder

**Mitgeliefert** sind 47 frei lizenzierte Geräusche (Glocken, Babylachen, Kanonen, Sirenen, Dampflok, Wind, Wasser, Marschtritte …) und vier Lieder, alle mit Urheber und Lizenz in [`resources/klaenge/QUELLEN.md`](resources/klaenge/QUELLEN.md):

- **Johann Strauss: „An der schönen blauen Donau“**, United States Marine Band (gemeinfrei) – die Donau als Weg der Auswanderer
- **Bedřich Smetana: „Die Moldau“**, Musopen Symphony Orchestra (CC0) – von der Quelle zum großen Strom
- **Ludwig van Beethoven: Sinfonie Nr. 5, 1. Satz**, Fuldaer Symphonisches Orchester unter Simon Schindler (Open Audio License 1.0) – das Schicksal klopft an
- **Kevin MacLeod: „Eternal Hope“** (CC BY 4.0) – ruhiger Aufbau zu einem hoffnungsvollen Höhepunkt

Das Lied wählt jedes Mitglied im Ton-Menü; das Tempo der Zeitreise passt sich auf Wunsch der Länge an. Fehlt eine Aufnahme, erzeugt der Browser das Geräusch selbst.

**Eigene Aufnahmen** kommen in den Datenordner von webtrees. Dieser Ordner ist nicht öffentlich, die Dateien liefert das Modul nur an Mitglieder aus. Eigene Aufnahmen einer Art ersetzen die mitgelieferten dieser Art ganz:

```
data/lebensbuehne/musik.mp3              Lied der Familie (auch .m4a, .ogg, .opus, .wav)
data/lebensbuehne/musik/lieder.json      weitere Lieder in der Liedauswahl, Format wie resources/musik/lieder.json,
data/lebensbuehne/musik/<datei>.m4a      die Dateien daneben – etwa Aufnahmen, die nur in der EU frei sind
data/lebensbuehne/klaenge/<name>.mp3     Geräusche (auch .ogg, .wav, .flac, .m4a, .opus)
```

Jedes Mitglied kann außerdem im Ton-Menü über „Datei wählen …“ ein eigenes Lied einbinden. Es bleibt nur im eigenen Browser gespeichert. Empfehlungen: **„Time“ von Hans Zimmer** (Filmmusik zu „Inception“) oder **„Ein Licht geht an“**, das Lied zur Lebensbühne (ca. 17 Minuten, mit Suno komponiert): [anhören auf Suno](https://suno.com/song/a7b9fe0a-e52c-4c97-b7ea-6142434f33cc).

Der Dateiname bestimmt den Einsatz. Varianten heißen `kanone_2.mp3`, `kanone_3.mp3` usw.

| Name | Einsatz |
|---|---|
| `kanone`, `gewehr` | Kanonenschuss, Gewehrsalve (Kriege vor 1900, Erster Weltkrieg) |
| `mg1`, `mg2` | Maschinengewehr langsam (Erster Weltkrieg) bzw. schnell (Zweiter Weltkrieg) |
| `bombe`, `stuka`, `luftalarm`, `luftkrieg` | Luftkrieg |
| `totenglocke`, `glocke_tief`, `glocke_hell`, `glocken` | Glocken |
| `geburt`, `lachen`, `hochzeit` | Geburt (Babylachen), Hochzeit (Glocken und Lachen) |
| `marsch`, `klagen`, `wind`, `sturm`, `wasser`, `flut`, `zug`, `jubel`, `menge`, `strom` | Dauerklänge, werden als Schleife gespielt |

Achte bei fremden Aufnahmen und Liedern auf die Lizenz.

## Zeitgeschehen

Mitgeliefert sind Ereignisse für Europa und die Welt sowie für viele Länder und Regionen, zweisprachig, in `resources/data/zeitgeschehen.json`. Welche eine Person sieht, richtet sich nach den Orten ihres Lebens: Die Lebensbühne erkennt Land und Region am Ortsnamen samt Oberorten (deutsch, englisch oder landessprachlich, z. B. „Billed, Timiș, Rumänien“, „Geretsried, D“, „Chicago, Illinois, USA“). Ereignisse für Europa und die Welt sehen alle.

**Eigene Ereignisse** kommen in den Datenordner und bleiben bei Updates erhalten:

```
data/lebensbuehne/zeitgeschehen.json
```

Das Format ist dasselbe wie in der mitgelieferten Datei, eine Liste von Einträgen:

```json
[{ "jahr": 1910, "bis": 1912, "regionen": ["deutschland"], "titel": "Dorfbrand", "text": "…", "titel_en": "Village fire", "text_en": "…", "klang": "glocken" }]
```

- `jahr`, `bis`: Zeitraum
- `orte` (optional): Dorf- oder Stadtgeschichte, z. B. `["grossjetscha", "iecea mare"]`; der Eintrag erscheint dann nur bei Personen, die an einem Ort mit diesem Namensteil gelebt haben (Groß- und Kleinschreibung, „ß“ und Bindestriche zählen nicht)
- `regionen`: `welt`, `europa`, `deutschland`, `oesterreich`, `schweiz`, `ungarn`, `rumaenien`, `serbien`, `banat`, `westen` (Lothringen, Luxemburg, Pfalz, Saarland, Elsass), `frankreich`, `luxemburg`, `belgien`, `niederlande`, `italien`, `polen`, `tschechien`, `slowakei`, `kroatien`, `russland`, `ukraine`, `grossbritannien`, `irland`, `skandinavien`, `usa`, `kanada`, `lateinamerika`, `australien`
- `titel`, `text` (deutsch), `titel_en`, `text_en` (englisch)
- `gruppe`: dasselbe Ereignis in mehreren Fassungen (allgemein und regional); gezeigt wird je Gruppe nur die passendste, eigene Einträge gehen vor
- `klang`: Geräusche, mehrere mit `+` verbunden, z. B. `krieg2+totenglocke`; sie erklingen nacheinander, nie zugleich

## Sprachen

Die Oberfläche folgt der Sprache, die in webtrees eingestellt ist: Deutsch oder Englisch, jede andere Sprache bekommt Englisch; Ereignisnamen wie Geburt, Hochzeit und Tod und einige weitere Wörter kommen dann aus den Übersetzungen von webtrees selbst. Weitere Sprachen lassen sich ergänzen: `resources/lang/en.json` kopieren (z. B. als `fr.json`) und die Werte übersetzen; die Schlüssel sind die deutschen Texte. Erzählungen in einer anderen Sprache kommen als `data/lebensbuehne/geschichten/<Baumname>.<sprache>.json` dazu, sonst wird die deutsche gezeigt.

*English: the interface follows the webtrees language (German or English; other languages fall back to English, with event names such as birth, marriage and death taken from the webtrees translations). Translations live in `resources/lang/<language>.json`, keyed by the German text.*

## Lizenz

GNU General Public License v3 oder später (siehe `LICENSE`). Mitgeliefert sind three.js (MIT-Lizenz) und Leaflet (BSD-2-Lizenz), die Lizenztexte liegen in `resources/vendor/`.

## Unterstützen

Wenn dir die Lebensbühne gefällt, freue ich mich über einen Kaffee:

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/gregorwolf1973) [![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/Gregor_Wolf/donate)
