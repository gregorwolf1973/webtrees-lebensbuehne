"""Historische Grenzen für die Karte „Lebensweg“: Europa-Ausschnitt aus „historical-basemaps“ (A. Ourednik, GPL-3.0).

Aufruf: python3 tools/grenzen.py <ordner-mit-world_JJJJ.geojson>
Quelle: https://github.com/aourednik/historical-basemaps (Ordner geojson/)
Ergebnis: resources/data/grenzen/JJJJ.json (vereinfacht, Koordinaten auf 0,01° gerundet, deutsche Namen)

Nur Standardbibliothek. Die Polygone werden nicht zugeschnitten, sondern nur ausgewählt, wenn sie Europa berühren.
"""
import glob
import json
import os
import re
import sys

JAHRE = [1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2010]
EUROPA = (-11.0, 34.0, 45.0, 71.0)   # West, Süd, Ost, Nord
TOLERANZ = 0.04                      # Grad, für die Vereinfachung (Douglas-Peucker)

NAMEN = {
    'Albania': 'Albanien', 'Algeria': 'Algerien', 'Algeria (FR)': 'Algerien (Frankreich)', 'Algeria (France)': 'Algerien (Frankreich)',
    'Austria': 'Österreich', 'Austria Hungary': 'Österreich-Ungarn', 'Austro-Hungarian Empire': 'Österreich-Ungarn',
    'Austrian Empire': 'Kaisertum Österreich', 'Austrian Netherlands': 'Österreichische Niederlande', 'Azerbaijan': 'Aserbaidschan',
    'Bavaria': 'Bayern', 'Belgium': 'Belgien', 'Bosnia and Herzegovina': 'Bosnien und Herzegowina', 'Bosnia-Herzegovina': 'Bosnien-Herzegowina',
    'Brunswick': 'Braunschweig', 'Bulgaria': 'Bulgarien', 'Byelarus': 'Weißrussland', 'Croatia': 'Kroatien', 'Cyprus': 'Zypern',
    'Czech Republic': 'Tschechien', 'Czechoslovakia': 'Tschechoslowakei', 'Denmark': 'Dänemark', 'Denmark-Norway': 'Dänemark-Norwegen',
    'Dutch Republic': 'Niederländische Republik', 'East Germany': 'DDR', 'East Prussia': 'Ostpreußen', 'Electoral Hesse': 'Kurhessen',
    'England and Ireland': 'England und Irland', 'Estonia': 'Estland', 'Finland': 'Finnland', 'France': 'Frankreich',
    'Geneva': 'Genf', 'Genoa': 'Genua', 'Georgia': 'Georgien', 'German Empire': 'Deutsches Reich', 'Germany': 'Deutschland',
    'Germany (France)': 'Deutschland (frz. Zone)', 'Germany (Soviet)': 'Deutschland (sowj. Zone)', 'Germany (UK)': 'Deutschland (brit. Zone)',
    'Germany (USA)': 'Deutschland (amerik. Zone)', 'Grand Duchy of Hesse': 'Großherzogtum Hessen', 'Greece': 'Griechenland',
    'Hanover': 'Hannover', 'Helvetic Republic': 'Helvetische Republik', 'Holy Roman Empire': 'Heiliges Römisches Reich',
    'Hungary': 'Ungarn', 'Ireland': 'Irland', 'Italy': 'Italien', 'Kingdom of Ireland': 'Königreich Irland', 'Kingdom of Italy': 'Königreich Italien',
    'Kingdom of Sardinia': 'Königreich Sardinien', 'Kingdom of the Two Sicilies': 'Königreich beider Sizilien', 'Latvia': 'Lettland',
    'Lebanon': 'Libanon', 'Lithuania': 'Litauen', 'Lombardy': 'Lombardei', 'Macedonia': 'Mazedonien', 'Milan': 'Mailand',
    'Milano (Austria)': 'Mailand (Österreich)', 'Moldova': 'Moldau', 'Morocco': 'Marokko', 'Morocco (France)': 'Marokko (Frankreich)',
    'Naples': 'Neapel', 'Netherlands': 'Niederlande', 'Norway': 'Norwegen', 'Ottoman Empire': 'Osmanisches Reich',
    'Ottoman Sultanate': 'Osmanisches Reich', 'Palatinate': 'Pfalz', 'Papal States': 'Kirchenstaat', 'Persia': 'Persien',
    'Poland': 'Polen', 'Polish–Lithuanian Commonwealth': 'Polen-Litauen', 'Prussia': 'Preußen', 'Republic of Kraków': 'Freie Stadt Krakau',
    'Republic of Turkey': 'Türkei', 'Romania': 'Rumänien', 'Russia': 'Russland', 'Russian Empire': 'Russisches Reich',
    'Saar Protectorate': 'Saarland', 'Sardinia': 'Sardinien', 'Sardinia-Piedmont': 'Sardinien-Piemont', 'Saxony': 'Sachsen',
    'Scotland': 'Schottland', 'Serbia': 'Serbien', 'Sicily': 'Sizilien', 'Slovakia': 'Slowakei', 'Slovenia': 'Slowenien',
    'South Russia': 'Südrussland', 'Spain': 'Spanien', 'Spanish Morocco': 'Spanisch-Marokko', 'Swabia': 'Schwaben', 'Sweden': 'Schweden',
    'Sweden–Norway': 'Schweden-Norwegen', 'Swiss Confederation': 'Eidgenossenschaft', 'Switzerland': 'Schweiz', 'Syria': 'Syrien',
    'Thuringia': 'Thüringen', 'Tsardom of Muscovy': 'Zarentum Russland', 'Tunisia': 'Tunesien', 'Turkey': 'Türkei', 'Tuscany': 'Toskana',
    'USSR': 'Sowjetunion', 'United Kingdom': 'Vereinigtes Königreich', 'United Kingdom of Great Britain and Ireland': 'Vereinigtes Königreich',
    'Venetia': 'Venetien', 'Venice': 'Venedig', 'West Germany': 'Bundesrepublik Deutschland', 'White Russia': 'Weißrussland',
    'Württemberg': 'Württemberg', 'Yugoslavia': 'Jugoslawien',
}


def abstand(p, a, b):
    """Abstand des Punkts p von der Strecke a–b (in Grad, für kleine Toleranzen ausreichend)."""
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5


def vereinfache(punkte):
    behalten = [False] * len(punkte)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(punkte) - 1)]
    while stapel:
        i, j = stapel.pop()
        bester, k = 0.0, None
        for m in range(i + 1, j):
            d = abstand(punkte[m], punkte[i], punkte[j])
            if d > bester:
                bester, k = d, m
        if k is not None and bester > TOLERANZ:
            behalten[k] = True
            stapel += [(i, k), (k, j)]
    return [[round(x, 2), round(y, 2)] for (x, y), b in zip(punkte, behalten) if b]


def beruehrt(ring):
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    w, s, o, n = EUROPA
    return max(xs) >= w and min(xs) <= o and max(ys) >= s and min(ys) <= n


def main(ordner):
    ziel = os.path.join(os.path.dirname(__file__), '..', 'resources', 'data', 'grenzen')
    os.makedirs(ziel, exist_ok=True)
    for jahr in JAHRE:
        roh = json.load(open(os.path.join(ordner, f'world_{jahr}.geojson'), encoding='utf-8'))
        merkmale = []
        for f in roh['features']:
            g, name = f.get('geometry'), (f['properties'].get('NAME') or '').strip()
            if not g or not name or g['type'] not in ('Polygon', 'MultiPolygon'):
                continue
            polygone = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
            neu = []
            for poly in polygone:
                if not beruehrt(poly[0]):
                    continue
                ringe = [vereinfache(r) for r in poly[:1]]   # nur Außenringe: Grenzlinien, keine Löcher
                if len(ringe[0]) >= 4:
                    neu.append(ringe)
            if neu:
                merkmale.append({'type': 'Feature', 'properties': {'name': NAMEN.get(name, name)},
                                 'geometry': {'type': 'MultiPolygon', 'coordinates': neu}})
        pfad = os.path.join(ziel, f'{jahr}.json')
        json.dump({'type': 'FeatureCollection', 'jahr': jahr, 'features': merkmale}, open(pfad, 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        print(jahr, len(merkmale), os.path.getsize(pfad) // 1024, 'kB')


if __name__ == '__main__':
    main(sys.argv[1])
