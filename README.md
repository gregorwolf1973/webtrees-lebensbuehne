# Lebensbühne für webtrees

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/gregorwolf1973)

Die Lebensbühne zeigt einen Stammbaum als begehbaren 3D-Zeittunnel: Vorfahren, Nachkommen und Partnerfamilien
stehen als Bilderkarten in der Tiefe des Raums, nach Geburtsjahr gestaffelt. Ein Zeitregler und eine Zeitreise
lassen die Generationen aufleuchten und wieder verblassen. Dazu kommen Lebensgeschichten, Fotos, eine Karte des
Lebenswegs und das Zeitgeschehen der jeweiligen Region.

*English: “Lebensbühne” (stage of life) is a webtrees custom module that shows a family tree as a 3D time
tunnel with a time travel, life stories, photos, maps and historical events. The user interface is German.*

## Funktionen

- **Ansichten:** Vorfahren, Nachkommen und die Familie des Partners. Die Hauptperson lässt sich frei wählen, per Suche oder Doppelklick.
- **Zeitreise:** einstellbares Tempo in Jahren pro Minute. Wer geboren wird, leuchtet auf. Wer gestorben ist, verblasst. Ohne Todesdatum verblasst die Person nach 80 Jahren.
- **Zeitgeschehen:** Kriege, Auswanderung, Seuchen und weitere Ereignisse laufen als Abspann mit.
- **Lebensgeschichte zu jeder Person:** Bildgeschichte, Lebenslauf, Bilder und die Karte des Lebenswegs (Leaflet mit OpenStreetMap).
- **Erzählung:** eine ausformulierte Lebensgeschichte je Person, auf Wunsch vom Browser vorgelesen. Dazu die Texte aus dem webtrees-Modul „Geschichten“, wenn es aktiv ist.
- **Historische Grenzen:** Auf der Karte des Lebenswegs erscheinen die Staatsgrenzen zur Zeit der jeweiligen Station, von 1700 bis heute.
- **2,5D-Porträts:** Das Gesicht auf der ersten Seite der Bildgeschichte wird zu einem räumlichen Porträt, das sich sanft bewegt und Maus oder Finger folgt.
- **Ton:** künstlich erzeugte Geräusche passend zur Epoche, auf Wunsch eigene Aufnahmen. Dazu ein eigenes Lied, an dessen Länge sich das Tempo der Zeitreise anpassen lässt. Geburt, Hochzeit und Tod erklingen nur in der hervorgehobenen direkten Linie: von der angeklickten Person zur Hauptperson, ohne Auswahl von der ältesten Person aus.
- **Handy und Tablet:** Suche und Ansichten liegen dort im Menü ☰. Der Überblick passt sich der Bildschirmform an, damit der ganze Stammbaum zu sehen ist.
- **Bilder nur aus webtrees:** Die Fotos kommen aus der Medienverwaltung. Gesichter werden aus den Markierungen des Moduls [webtrees-faces](https://github.com/UksusoFF/webtrees-faces) ausgeschnitten, falls es installiert ist.

## Voraussetzungen

- webtrees 2.2 mit PHP 8.3 oder neuer
- empfohlen: die PHP-Erweiterung Imagick für die Gesichtsausschnitte. Ohne Imagick zeigt das Modul ein mittiges Vorschaubild.

## Installation

1. Unter [Releases](https://github.com/gregorwolf1973/webtrees-lebensbuehne/releases/latest) die Datei `lebensbuehne-<Version>.zip` herunterladen und im Ordner `modules_v4/` von webtrees entpacken. Es entsteht `modules_v4/lebensbuehne/`, darin liegt direkt die Datei `module.php`.
2. In webtrees unter *Verwaltung → Module → Diagramme* prüfen, dass die „Lebensbühne“ aktiviert ist.
3. Aufruf: im Diagramm-Menü einer Person den Punkt „Lebensbühne“ wählen, oder direkt `…/tree/<Baum>/lebensbuehne/<XREF>`.

## Wer darf die Lebensbühne sehen?

Nur **angemeldete Mitglieder** des jeweiligen Stammbaums. Gäste werden zur Anmeldung geschickt. Das gilt für die Seite, die Daten, die Gesichtsausschnitte und die Klänge, und zwar unabhängig von der Einstellung in der Modulverwaltung. Dort lässt sich der Zugang nur weiter einschränken, etwa auf Verwalter.

Die Daten stellt webtrees für den jeweiligen Betrachter zusammen. Dabei gelten die Datenschutz-Einstellungen des Baums: Was ein Mitglied in webtrees nicht sehen darf, erscheint auch nicht in der Lebensbühne.

Die Seite lädt keine Skripte von fremden Servern, three.js, Leaflet und die Grenzdaten liegen im Modul. Nur die Kartenkacheln kommen von OpenStreetMap. Das Vorlesen übernimmt die Sprachausgabe des Browsers; je nach Browser und Gerät kann sie den Text an einen Sprachdienst des Herstellers schicken.

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

## Eigene Klänge und ein eigenes Lied

Das Modul bringt keine Tonaufnahmen mit, alle Geräusche werden im Browser erzeugt. Eigene Aufnahmen kommen in den
Datenordner von webtrees. Dieser Ordner ist nicht öffentlich, die Dateien liefert das Modul nur an Mitglieder aus:

```
data/lebensbuehne/musik.mp3              Lied zur Zeitreise (auch .m4a, .ogg, .opus, .wav)
data/lebensbuehne/klaenge/<name>.mp3     Geräusche (auch .ogg, .wav, .flac, .m4a, .opus)
```

Jedes Mitglied kann außerdem im Ton-Menü über „Datei wählen …“ ein eigenes Lied einbinden. Es bleibt nur im eigenen Browser gespeichert.

**Empfohlene Musik.** Das Modul liefert kein Lied mit, die Datei bringt jeder selbst mit:

- **„Time“ von Hans Zimmer** (Filmmusik zu „Inception“, 2010): ruhiger Aufbau, großer Höhepunkt. Das Tempo der Zeitreise passt sich der Länge an.
- **„Ein Licht geht an“**, das Lied zur Lebensbühne (ca. 17 Minuten, mit Suno komponiert), ein Weg von der Auswanderung ins Banat bis heute: [anhören auf Suno](https://suno.com/song/a7b9fe0a-e52c-4c97-b7ea-6142434f33cc)

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

## Zeitgeschehen anpassen

Die Ereignisse stehen in `resources/data/zeitgeschehen.json`. Mitgeliefert ist eine Auswahl für das Banat, Ungarn, Westdeutschland und Deutschland. Felder eines Eintrags:

- `jahr`, `bis`: Zeitraum
- `regionen`: `banat`, `ungarn`, `westen`, `deutschland` oder `europa`
- `titel`, `text`: Anzeige
- `klang`: Geräusche, mehrere mit `+` verbunden, z. B. `krieg2+totenglocke`

## Lizenz

GNU General Public License v3 oder später (siehe `LICENSE`). Mitgeliefert sind three.js (MIT-Lizenz) und Leaflet (BSD-2-Lizenz), die Lizenztexte liegen in `resources/vendor/`.

## Unterstützen

Wenn dir die Lebensbühne gefällt, freue ich mich über einen Kaffee:

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/gregorwolf1973)
