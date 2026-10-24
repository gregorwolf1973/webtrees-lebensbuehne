# Lebensbühne für webtrees

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
- **Ton:** künstlich erzeugte Geräusche passend zur Epoche, auf Wunsch eigene Aufnahmen. Dazu ein eigenes Lied, an dessen Länge sich das Tempo der Zeitreise anpassen lässt.
- **Bilder nur aus webtrees:** Die Fotos kommen aus der Medienverwaltung. Gesichter werden aus den Markierungen des Moduls [webtrees-faces](https://github.com/UksusoFF/webtrees-faces) ausgeschnitten, falls es installiert ist.

## Voraussetzungen

- webtrees 2.2 mit PHP 8.3 oder neuer
- empfohlen: die PHP-Erweiterung Imagick für die Gesichtsausschnitte. Ohne Imagick zeigt das Modul ein mittiges Vorschaubild.

## Installation

1. Das Repository als ZIP herunterladen und nach `modules_v4/lebensbuehne/` entpacken. Im Ordner muss direkt die Datei `module.php` liegen.
2. In webtrees unter *Verwaltung → Module → Diagramme* prüfen, dass die „Lebensbühne“ aktiviert ist.
3. Aufruf: im Diagramm-Menü einer Person den Punkt „Lebensbühne“ wählen, oder direkt `…/tree/<Baum>/lebensbuehne/<XREF>`.

## Wer darf die Lebensbühne sehen?

Nur **angemeldete Mitglieder** des jeweiligen Stammbaums. Gäste werden zur Anmeldung geschickt. Das gilt für die Seite, die Daten, die Gesichtsausschnitte und die Klänge, und zwar unabhängig von der Einstellung in der Modulverwaltung. Dort lässt sich der Zugang nur weiter einschränken, etwa auf Verwalter.

Die Daten stellt webtrees für den jeweiligen Betrachter zusammen. Dabei gelten die Datenschutz-Einstellungen des Baums: Was ein Mitglied in webtrees nicht sehen darf, erscheint auch nicht in der Lebensbühne.

Die Seite lädt keine Skripte von fremden Servern, three.js und Leaflet liegen im Modul. Nur die Kartenkacheln kommen von OpenStreetMap.

## Eigene Klänge und ein eigenes Lied

Das Modul bringt keine Tonaufnahmen mit, alle Geräusche werden im Browser erzeugt. Eigene Aufnahmen kommen in den
Datenordner von webtrees. Dieser Ordner ist nicht öffentlich, die Dateien liefert das Modul nur an Mitglieder aus:

```
data/lebensbuehne/musik.mp3              Lied zur Zeitreise (auch .m4a, .ogg, .opus, .wav)
data/lebensbuehne/klaenge/<name>.mp3     Geräusche (auch .ogg, .wav, .flac, .m4a, .opus)
```

Jedes Mitglied kann außerdem im Ton-Menü über „Datei wählen …“ ein eigenes Lied einbinden. Es bleibt nur im eigenen Browser gespeichert.

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
