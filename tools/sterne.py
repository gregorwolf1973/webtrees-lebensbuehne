"""Sternhimmel der Lebensbühne aus dem Yale Bright Star Catalogue (5. Ausgabe, Hoffleit & Warren 1991, gemeinfrei).

Aufruf: python3 tools/sterne.py <catalog.gz>
Quelle: https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz (VizieR V/50)
Ergebnis: resources/data/sterne.json – flache Liste [Rektaszension°, Deklination°, Helligkeit (mag), Farbindex B−V, …]
für alle Sterne mit Position und Helligkeit (J2000), auf eine bzw. zwei Nachkommastellen gerundet.
"""
import gzip
import json
import os
import sys


def zahl(text):
    text = text.strip()
    return float(text) if text else None


def main(pfad):
    werte = []
    for zeile in gzip.open(pfad, 'rt', encoding='latin-1'):
        if len(zeile) < 107 or not zeile[75:77].strip():
            continue   # ohne Position (Novae, getilgte Einträge)
        ra = (int(zeile[75:77]) + int(zeile[77:79]) / 60 + float(zeile[79:83]) / 3600) * 15
        dec = int(zeile[84:86]) + int(zeile[86:88]) / 60 + int(zeile[88:90]) / 3600
        if zeile[83] == '-':
            dec = -dec
        mag = zahl(zeile[102:107])
        if mag is None:
            continue
        bv = zahl(zeile[109:114]) if len(zeile) >= 114 else None
        werte += [round(ra, 2), round(dec, 2), round(mag, 2), round(bv if bv is not None else 0.6, 2)]
    ziel = os.path.join(os.path.dirname(__file__), '..', 'resources', 'data', 'sterne.json')
    json.dump(werte, open(ziel, 'w'), separators=(',', ':'))
    print(len(werte) // 4, 'Sterne,', os.path.getsize(ziel) // 1024, 'kB')


if __name__ == '__main__':
    main(sys.argv[1])
