"""Tiefenkarten für die 2,5D-Porträts der Lebensbühne.

Liest die Gesichtsausschnitte, die das Modul in data/lebensbuehne/cache/ ablegt, schätzt mit „Depth Anything V2 Small“
(Apache-2.0) die Tiefe und schreibt je Bild eine Graustufen-PNG (hell = nah) nach data/lebensbuehne/tiefen/.
Das Modul findet sie über den gleichen Dateinamen. Vorhandene Tiefenkarten werden übersprungen.

Aufruf:  python3 tools/tiefen.py <cache-ordner> <tiefen-ordner>
Braucht: onnxruntime, numpy, pillow (pip install onnxruntime numpy pillow). Das Modell (~100 MB) wird beim ersten
Lauf nach ~/.cache/lebensbuehne/ geladen.
"""
import os
import sys
import urllib.request

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

MODELL_URL = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx'
GROESSE = 518                     # Eingabegröße des Modells (Vielfaches von 14)
AUSGABE = 256                     # Kantenlänge der Tiefenkarte
MITTEL = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STREUUNG = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def modell():
    pfad = os.path.expanduser('~/.cache/lebensbuehne/depth-anything-v2-small.onnx')
    if not os.path.exists(pfad):
        os.makedirs(os.path.dirname(pfad), exist_ok=True)
        print('Lade Modell …', flush=True)
        urllib.request.urlretrieve(MODELL_URL, pfad + '.tmp')
        os.replace(pfad + '.tmp', pfad)
    return ort.InferenceSession(pfad, providers=['CPUExecutionProvider'])


def tiefe(sitzung, pfad):
    bild = Image.open(pfad).convert('RGB').resize((GROESSE, GROESSE), Image.BICUBIC)
    x = (np.asarray(bild, dtype=np.float32) / 255.0 - MITTEL) / STREUUNG
    x = x.transpose(2, 0, 1)[None]
    eingabe = sitzung.get_inputs()[0].name
    t = sitzung.run(None, {eingabe: x})[0].squeeze()
    # nach der Bildmitte strecken, wo das Gesicht sitzt: Näheres am Rand (Pfosten, Hände) wird abgeschnitten,
    # damit das Gesicht selbst Relief bekommt; danach weichzeichnen, damit die Kanten nicht reißen
    h, w = t.shape
    yy, xx = np.mgrid[0:h, 0:w]
    mitte = ((xx - w / 2) ** 2 + (yy - h / 2) ** 2) < (0.42 * min(h, w)) ** 2
    lo, hi = np.percentile(t[mitte], 3), np.percentile(t[mitte], 99)
    t = np.clip((t - lo) / max(hi - lo, 1e-6), 0, 1)
    karte = Image.fromarray((t * 255).astype(np.uint8)).resize((AUSGABE, AUSGABE), Image.BILINEAR)
    return karte.filter(ImageFilter.GaussianBlur(2))


def main(cache, ziel):
    os.makedirs(ziel, exist_ok=True)
    sitzung = None
    neu = 0
    for name in sorted(os.listdir(cache)):
        if not name.endswith('.jpg'):
            continue
        aus = os.path.join(ziel, name[:-4] + '.png')
        if os.path.exists(aus):
            continue
        sitzung = sitzung or modell()
        try:
            tiefe(sitzung, os.path.join(cache, name)).save(aus + '.tmp', 'PNG')
            os.replace(aus + '.tmp', aus)
            neu += 1
        except Exception as fehler:   # einzelne kaputte Bilder überspringen
            print('übersprungen:', name, fehler, file=sys.stderr)
    print(f'{neu} neue Tiefenkarten in {ziel}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
