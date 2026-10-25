<?php

/**
 * Lebensbühne – ein 3D-Zeittunnel für webtrees.
 * Copyright (C) 2026 Gregor Wolf
 * Lizenz: GNU GPL v3 oder später, siehe LICENSE.
 */

declare(strict_types=1);

namespace GregorWolf\Lebensbuehne;

use Fisharebest\Webtrees\DB;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Tree;
use Fisharebest\Webtrees\Webtrees;

use function array_column;
use function array_filter;
use function array_map;
use function array_slice;
use function array_values;
use function basename;
use function count;
use function explode;
use function implode;
use function in_array;
use function is_file;
use function json_decode;
use function json_encode;
use function md5;
use function mb_strtolower;
use function mb_strtoupper;
use function mb_substr;
use function min;
use function preg_match;
use function preg_match_all;
use function preg_replace;
use function preg_replace_callback;
use function round;
use function route;
use function str_contains;
use function str_replace;
use function str_starts_with;
use function strlen;
use function strtoupper;
use function strtr;
use function substr;
use function trim;
use function usort;

/**
 * Baut die Daten der Lebensbühne: alle Personen, die der Betrachter sehen darf, mit Familienbeziehungen,
 * Ereignissen, Orten mit Koordinaten, Bildern und Gesichtern.
 *
 * Grundlage ist das GEDCOM, das webtrees für die Zugriffsstufe des Betrachters freigibt (privatizeGedcom).
 * Bilder kommen ausschließlich aus der webtrees-Medienverwaltung.
 */
final class Daten
{
    private const string BILD = '/\.(jpe?g|png|webp|gif|tiff?)$/i';

    private const array MON = [
        'JAN' => 1, 'FEB' => 2, 'MAR' => 3, 'APR' => 4, 'MAY' => 5, 'JUN' => 6,
        'JUL' => 7, 'AUG' => 8, 'SEP' => 9, 'OCT' => 10, 'NOV' => 11, 'DEC' => 12,
    ];

    private const array MON_DE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

    private const array FAKTEN = [
        'BIRT' => 'Geburt', 'CHR' => 'Taufe', 'BAPM' => 'Taufe', 'DEAT' => 'Tod', 'BURI' => 'Begräbnis',
        'CREM' => 'Einäscherung', 'RESI' => 'Wohnort', 'OCCU' => 'Beruf', 'EMIG' => 'Auswanderung',
        'IMMI' => 'Einwanderung', 'EDUC' => 'Ausbildung', 'GRAD' => 'Abschluss', 'RELI' => 'Religion',
        'EVEN' => 'Ereignis', 'FACT' => 'Tatsache', 'NATU' => 'Einbürgerung', 'CENS' => 'Volkszählung',
        'CONF' => 'Firmung', 'MARR' => 'Hochzeit', 'DIV' => 'Scheidung', 'ENGA' => 'Verlobung',
    ];

    // Notizen, die mit diesen Wörtern beginnen, sind Quellenangaben und stehen getrennt vom Text
    private const array QUELLE = ['Online gefunden', 'Gelesen', 'Gefunden', 'http', 'Korrigiert', 'Abgleich'];

    /** @var array<string,string> XREF => freigegebenes GEDCOM der Personen */
    private array $personen = [];

    /** @var array<string,string> XREF => freigegebenes GEDCOM der Familien */
    private array $familien = [];

    /** @var array<string,array<string,string>|null> */
    private array $medien = [];

    /** @var array<string,array{0:float,1:float}> Ortsname (klein, mit Oberorten) => Koordinaten */
    private array $koord = [];

    /** @var array<string,list<array{0:string,1:list<int>}>> Person => [[Medium, Gesichtsrahmen], …] */
    private array $rahmenVon = [];

    /** @var array<string,int> Medium => Zahl der markierten Personen */
    private array $personenAuf = [];

    public function __construct(
        private readonly Tree $tree,
        private readonly int $stufe,
        private readonly string $gesichtRoute,
    ) {
    }

    /**
     * @return array{start:string,personen:list<array<string,mixed>>}
     */
    public function alle(): array
    {
        $this->ladeDatensaetze();
        $this->ladeOrte();
        $this->ladeGesichter();

        $liste = [];
        foreach ($this->personen as $xref => $gedcom) {
            $liste[] = $this->person((string) $xref, $gedcom);
        }

        // Verweise auf Personen, die der Betrachter nicht sehen darf, entfernen
        $sichtbar = fn (?string $x): bool => $x !== null && isset($this->personen[$x]);
        foreach ($liste as &$p) {
            $p['vater']   = $sichtbar($p['vater']) ? $p['vater'] : null;
            $p['mutter']  = $sichtbar($p['mutter']) ? $p['mutter'] : null;
            $p['kinder']  = array_values(array_filter($p['kinder'], $sichtbar));
            $p['partner'] = array_values(array_filter($p['partner'], $sichtbar));
        }
        unset($p);

        return ['start' => $this->tree->getPreference('PEDIGREE_ROOT_ID'), 'personen' => $liste];
    }

    private function ladeDatensaetze(): void
    {
        $zeilen = DB::table('individuals')->where('i_file', '=', $this->tree->id())->pluck('i_gedcom', 'i_id');
        foreach ($zeilen as $xref => $gedcom) {
            $person = Registry::individualFactory()->make((string) $xref, $this->tree, $gedcom);
            if ($person !== null && $person->canShow($this->stufe)) {
                $this->personen[(string) $xref] = $person->privatizeGedcom($this->stufe);
            }
        }

        $zeilen = DB::table('families')->where('f_file', '=', $this->tree->id())->pluck('f_gedcom', 'f_id');
        foreach ($zeilen as $xref => $gedcom) {
            $familie = Registry::familyFactory()->make((string) $xref, $this->tree, $gedcom);
            if ($familie !== null && $familie->canShow($this->stufe)) {
                $this->familien[(string) $xref] = $familie->privatizeGedcom($this->stufe);
            }
        }
    }

    // Ortskoordinaten über die Ortshierarchie von webtrees („Billed, Timiș, Rumänien“)
    private function ladeOrte(): void
    {
        $orte = [];
        foreach (DB::table('place_location')->select(['id', 'parent_id', 'place', 'latitude', 'longitude'])->get() as $o) {
            $orte[(int) $o->id] = $o;
        }
        foreach ($orte as $o) {
            if ($o->latitude === null || $o->longitude === null) {
                continue;
            }
            $teile = [$o->place];
            $q     = $o;
            for ($schutz = 0; $q->parent_id !== null && isset($orte[(int) $q->parent_id]) && $schutz < 20; $schutz++) {
                $q       = $orte[(int) $q->parent_id];
                $teile[] = $q->place;
            }
            $this->koord[mb_strtolower(implode(', ', $teile))] = [(float) $o->latitude, (float) $o->longitude];
        }
    }

    // Gesichtsrahmen aus dem Modul „webtrees-faces“ (Tabelle media_faces), falls installiert
    private function ladeGesichter(): void
    {
        if (!DB::schema()->hasTable('media_faces')) {
            return;
        }
        foreach (DB::table('media_faces')->where('f_m_tree', '=', $this->tree->id())->select(['f_m_id', 'f_coordinates'])->get() as $f) {
            $liste = json_decode((string) $f->f_coordinates, true);
            if (!is_array($liste)) {
                continue;
            }
            foreach ($liste as $e) {
                if (!isset($e['pid'], $e['coords']) || !is_array($e['coords']) || count($e['coords']) < 4) {
                    continue;
                }
                $c = array_map(static fn ($v): int => (int) (float) $v, array_slice($e['coords'], 0, 4));
                $this->rahmenVon[(string) $e['pid']][] = [(string) $f->f_m_id, $c];
                $this->personenAuf[(string) $f->f_m_id] = ($this->personenAuf[(string) $f->f_m_id] ?? 0) + 1;
            }
        }
    }

    /**
     * Ein Bild aus webtrees, wenn der Betrachter es sehen darf; Urkunden und Grabbilder werden erkannt.
     *
     * @return array<string,string>|null
     */
    private function medium(string $mid): ?array
    {
        if (!array_key_exists($mid, $this->medien)) {
            $this->medien[$mid] = null;
            $media = Registry::mediaFactory()->make($mid, $this->tree);
            $datei = $media !== null && $media->canShow($this->stufe) ? $media->firstImageFile() : null;
            if ($datei !== null && !$datei->isExternal() && preg_match(self::BILD, $datei->filename())) {
                $name = $datei->filename();
                $art  = preg_match('/URKUNDE|PASS|TAUFSCHEIN|AHNEN/i', $name) ? 'urkunde' : (str_contains(strtoupper($name), 'GRAB') ? 'grab' : 'foto');

                $this->medien[$mid] = [
                    'datei' => $name,
                    'titel' => $datei->title(),
                    'art'   => $art,
                    'url'   => $datei->imageUrl(1400, 1400, 'contain'),
                ];
            }
        }

        return $this->medien[$mid];
    }

    /**
     * @return array<string,mixed>
     */
    private function person(string $x, string $g): array
    {
        $p = [
            'id'         => $x,
            'name'       => $this->name($g),
            'geschlecht' => preg_match('/\n1 SEX (\w)/', $g, $m) ? $m[1] : 'U',
            'ereignisse' => [],
            'bilder'     => [],
            'gesicht'    => null,
        ];

        $mids       = [];
        $ebene1     = [];
        $amEreignis = [];
        foreach ($this->bloecke($g) as $b) {
            $tag = explode(' ', $b[0])[1] ?? '';
            if ($tag === 'OBJE' && preg_match_all('/@([^@]+)@/', $b[0], $mm)) {
                $ebene1 = [...$ebene1, ...$mm[1]];
            }
            $jb       = $tag !== 'OBJE' ? $this->datum($this->unter($b, 'DATE')[0] ?? '')[0] : null;
            $objekte  = implode("\n", array_filter($b, static fn (string $z): bool => str_contains($z, ' OBJE ')));
            if (preg_match_all('/@([^@]+)@/', $objekte, $mm)) {
                foreach ($mm[1] as $mref) {
                    if (!in_array($mref, $mids, true)) {
                        $mids[] = $mref;
                    }
                    if ($jb !== null && $tag !== 'OBJE') {
                        $amEreignis[$mref] ??= $jb;   // Bild hängt an einem datierten Ereignis
                    }
                }
            }
            if (!isset(self::FAKTEN[$tag])) {
                continue;
            }
            [$j, $text, $genau] = $this->datum($this->unter($b, 'DATE')[0] ?? '');
            $kopf  = '1 ' . $tag . ' ';
            $wert  = strlen($b[0]) > strlen($kopf) ? trim(substr($b[0], strlen($kopf))) : '';
            $alle  = array_values(array_filter($this->texte($b, 'NOTE'), static fn (string $n): bool => !str_starts_with($n, '@')));
            $p['ereignisse'][] = [
                'art'     => $tag,
                'titel'   => self::FAKTEN[$tag],
                'jahr'    => $j,
                'datum'   => $text,
                'genau'   => $genau,
                'ort'     => $this->ort($this->unter($b, 'PLAC')[0] ?? null),
                'wert'    => $wert === 'Y' ? '' : $wert,
                'ursache' => $this->unter($b, 'CAUS')[0] ?? '',
                'notiz'   => mb_substr(implode(' ', array_filter($alle, fn (string $n): bool => !$this->istQuelle($n))), 0, 600),
                'quelle'  => mb_substr(implode(' ', array_filter($alle, fn (string $n): bool => $this->istQuelle($n))), 0, 300),
            ];
        }

        // Lebensbeschreibung aus den Notizen der Person (Ebene 1)
        $zeilen       = explode("\n", $g);
        $p['notizen'] = array_slice(array_values(array_map(
            static fn (string $n): string => mb_substr($n, 0, 1500),
            array_filter($this->texte($zeilen, 'NOTE', 1), fn (string $n): bool => $n !== '' && !str_starts_with($n, '@') && !$this->istQuelle($n))
        )), 0, 4);

        // Familienereignisse und Partner
        foreach ($this->verweise('/\n1 FAMS @([^@]+)@/', $g) as $fam) {
            $fg      = $this->familien[$fam] ?? '';
            $partner = array_values(array_filter($this->verweise('/\n1 (?:HUSB|WIFE) @([^@]+)@/', $fg), static fn (string $m): bool => $m !== $x));
            $pname   = $partner !== [] && isset($this->personen[$partner[0]]) ? $this->name($this->personen[$partner[0]])['voll'] : '';
            foreach ($this->bloecke($fg) as $b) {
                $tag = explode(' ', $b[0])[1] ?? '';
                if (!in_array($tag, ['MARR', 'DIV', 'ENGA'], true)) {
                    continue;
                }
                [$j, $text, $genau] = $this->datum($this->unter($b, 'DATE')[0] ?? '');
                $notiz = array_filter($this->texte($b, 'NOTE'), fn (string $n): bool => !str_starts_with($n, '@') && !$this->istQuelle($n));
                $p['ereignisse'][] = [
                    'art' => $tag, 'titel' => self::FAKTEN[$tag], 'jahr' => $j, 'datum' => $text, 'genau' => $genau,
                    'ort' => $this->ort($this->unter($b, 'PLAC')[0] ?? null), 'wert' => $pname, 'ursache' => '',
                    'notiz' => mb_substr(implode(' ', $notiz), 0, 600), 'quelle' => '',
                ];
            }
        }
        usort($p['ereignisse'], static fn (array $a, array $b): int => [$a['jahr'] === null, $a['jahr'] ?? 0] <=> [$b['jahr'] === null, $b['jahr'] ?? 0]);

        $geb = null;
        $tod = null;
        foreach ($p['ereignisse'] as $e) {
            if ($geb === null && $e['jahr'] && in_array($e['art'], ['BIRT', 'CHR', 'BAPM'], true)) {
                $geb = $e['jahr'];
            }
            if ($tod === null && $e['jahr'] && in_array($e['art'], ['DEAT', 'BURI'], true)) {
                $tod = $e['jahr'];
            }
        }
        $jahre       = array_values(array_filter(array_column($p['ereignisse'], 'jahr')));
        $p['geburt'] = $geb;
        $p['tod']    = $tod;
        $p['jahr']   = $geb ?? ($jahre !== [] ? min($jahre) : null);

        // Aufnahmejahr eines Fotos: datiertes Ereignis, an dem es hängt > Jahr im Titel > „Aufnahme 1876“ in einer
        // Notiz zum Dateinamen > Jahr vorn im Dateinamen, wenn die Datei der Person gehört und es nicht ihr Geburtsjahr ist
        $notiztext = implode("\n", $this->texte($zeilen, 'NOTE', 1));
        foreach ($this->bloecke($g) as $b) {
            $notiztext .= "\n" . implode("\n", $this->texte($b, 'NOTE'));
        }
        $fotojahr = function (string $mid) use ($amEreignis, $notiztext, $p, $geb, $tod): ?int {
            $m = $this->medium($mid);
            if ($m === null) {
                return null;
            }
            if (isset($amEreignis[$mid])) {
                return $amEreignis[$mid];
            }
            if (preg_match('/\b(1[89]\d\d|20[0-3]\d)\b/', $m['titel'], $t)) {
                return (int) $t[1];
            }
            $datei = basename($m['datei']);
            foreach (explode("\n", $notiztext) as $z) {
                if ($datei !== '' && str_contains($z, $datei)
                    && preg_match("/Aufnahme[^0-9]{0,12}(1[89]\\d\\d|20[0-3]\\d)|['„](1[89]\\d\\d|20[0-3]\\d)['“] auf dem Foto/u", $z, $a)) {
                    return (int) (($a[1] ?? '') !== '' ? $a[1] : $a[2]);
                }
            }
            if (preg_match('/^(1[89]\d\d|20[0-3]\d)_\d\d_([A-Z]+)_([A-Z]+)/', self::asciiGross($datei), $v)
                && $v[2] === explode(' ', self::asciiGross($p['name']['nachname']))[0]
                && str_starts_with(self::asciiGross($p['name']['vorname']), substr($v[3], 0, 4))
                && $geb !== null && (int) $v[1] !== $geb && $geb < (int) $v[1] && (int) $v[1] <= ($tod ?? $geb + 100)) {
                return (int) $v[1];
            }

            return null;
        };

        // Bilder (höchstens 40 je Person), mit Aufnahmejahr, soweit bekannt
        foreach (array_slice($mids, 0, 40) as $mid) {
            $m = $this->medium($mid);
            if ($m !== null) {
                $p['bilder'][] = [
                    'src'   => $m['url'],
                    'titel' => $m['titel'] !== '' ? $m['titel'] : basename($m['datei']),
                    'art'   => $m['art'],
                    'jahr'  => $fotojahr($mid),
                ];
            }
        }

        // Gesicht für die Karte: 1. markiertes Gesicht auf dem Hauptbild (erstes verknüpftes Foto),
        // 2. Porträts (nur diese Person markiert) vor Gruppenbildern, jeweils das größte, 3. sonst das Hauptbild quadratisch
        $flaeche   = static fn (array $c): int => ($c[2] - $c[0]) * ($c[3] - $c[1]);
        $istFoto   = fn (string $mid): bool => ($this->medium($mid)['art'] ?? '') === 'foto';
        $rahmen    = array_values(array_filter($this->rahmenVon[$x] ?? [], fn (array $r): bool => $this->medium($r[0]) !== null));
        $hauptbild = null;
        foreach ([...$ebene1, ...$mids] as $mid) {
            if ($istFoto($mid)) {
                $hauptbild = $mid;
                break;
            }
        }
        $wahl = null;
        foreach ($rahmen as $r) {
            if ($r[0] === $hauptbild) {
                $wahl = $r;
                break;
            }
        }
        if ($wahl === null) {
            $portraets = array_values(array_filter($rahmen, fn (array $r): bool => ($this->personenAuf[$r[0]] ?? 0) === 1));
            foreach ($portraets !== [] ? $portraets : $rahmen as $r) {
                if ($wahl === null || $flaeche($r[1]) > $flaeche($wahl[1])) {
                    $wahl = $r;
                }
            }
        }
        if ($wahl !== null) {
            $p['gesicht'] = $this->gesichtUrl($x, $wahl[0], $wahl[1]);
            $p['tiefe']   = $this->tiefeUrl($x, $wahl[0], $wahl[1]);
        } elseif ($hauptbild !== null) {
            $p['gesicht'] = $this->gesichtUrl($x, $hauptbild, null);
            $p['tiefe']   = $this->tiefeUrl($x, $hauptbild, null);
        }

        // altersgerechte Gesichter für die Zeitreise: jedes markierte Gesicht auf einem Foto mit bekanntem Aufnahmejahr
        $gesichter = [];
        foreach ($rahmen as [$mid, $c]) {
            $j = $fotojahr($mid);
            if ($j !== null && !isset($gesichter[$mid])) {
                $gesichter[$mid] = ['src' => $this->gesichtUrl($x, $mid, $c), 'jahr' => $j];
            }
        }
        $gesichter = array_values($gesichter);
        usort($gesichter, static fn (array $a, array $b): int => $a['jahr'] <=> $b['jahr']);
        $p['gesichter'] = $gesichter;

        // Eltern, Kinder, Partner (für Linien und Ansichten)
        $famc        = $this->verweise('/\n1 FAMC @([^@]+)@/', $g)[0] ?? null;
        $fg          = $famc !== null ? ($this->familien[$famc] ?? '') : '';
        $p['vater']  = $this->verweise('/\n1 HUSB @([^@]+)@/', $fg)[0] ?? null;
        $p['mutter'] = $this->verweise('/\n1 WIFE @([^@]+)@/', $fg)[0] ?? null;
        $p['kinder']  = [];
        $p['partner'] = [];
        foreach ($this->verweise('/\n1 FAMS @([^@]+)@/', $g) as $fam) {
            $fg = $this->familien[$fam] ?? '';
            foreach ($this->verweise('/\n1 CHIL @([^@]+)@/', $fg) as $c) {
                if (!in_array($c, $p['kinder'], true)) {
                    $p['kinder'][] = $c;
                }
            }
            foreach ($this->verweise('/\n1 (?:HUSB|WIFE) @([^@]+)@/', $fg) as $m) {
                if ($m !== $x && !in_array($m, $p['partner'], true)) {
                    $p['partner'][] = $m;
                }
            }
        }

        return $p;
    }

    /**
     * Adresse eines Gesichtsausschnitts; die Prüfsumme ändert sich, wenn der Rahmen oder die Datei wechselt.
     *
     * @param list<int>|null $rahmen null = ganzes Bild quadratisch
     */
    private function gesichtUrl(string $xref, string $mid, ?array $rahmen): string
    {
        $parameter = [
            'tree'  => $this->tree->name(),
            'xref'  => $xref,
            'media' => $mid,
            'v'     => substr(md5(implode(',', $rahmen ?? []) . '|' . ($this->medien[$mid]['datei'] ?? '')), 0, 8),
        ];
        if ($rahmen === null) {
            $parameter['q'] = '1';
        }

        return route($this->gesichtRoute, $parameter);
    }

    /**
     * Tiefenkarte zum Gesichtsausschnitt für das 2,5D-Porträt (tools/tiefen.py), nur wenn sie schon berechnet ist.
     * Der Dateiname folgt dem Zwischenspeicher der Gesichter: Baum_Person_Medium_Prüfsumme.png
     *
     * @param list<int>|null $rahmen
     */
    private function tiefeUrl(string $xref, string $mid, ?array $rahmen): ?string
    {
        $name = $this->tree->id() . '_' . $xref . '_' . $mid . '_' . md5(json_encode($rahmen) . '|' . ($this->medien[$mid]['datei'] ?? '')) . '.png';
        if (!is_file(Webtrees::DATA_DIR . 'lebensbuehne/tiefen/' . $name)) {
            return null;
        }
        $parameter = ['tree' => $this->tree->name(), 'xref' => $xref, 'media' => $mid, 't' => '1'];
        if ($rahmen === null) {
            $parameter['q'] = '1';
        }

        return route($this->gesichtRoute, $parameter);
    }

    /**
     * @return list<string>
     */
    private function verweise(string $muster, string $gedcom): array
    {
        return preg_match_all($muster, $gedcom, $mm) ? $mm[1] : [];
    }

    private function istQuelle(string $notiz): bool
    {
        foreach (self::QUELLE as $anfang) {
            if (str_starts_with($notiz, $anfang)) {
                return true;
            }
        }

        return false;
    }

    /**
     * GEDCOM-Datum → [Jahr für die Zeitachse, Anzeige auf Deutsch, genaues Datum?]
     *
     * @return array{0:int|null,1:string,2:bool}
     */
    private function datum(string $s): array
    {
        $t = trim($s);
        if ($t === '') {
            return [null, '', false];
        }
        $j    = preg_match('/\b(\d{3,4})\b/', $t, $m) ? (int) $m[1] : null;
        $text = $t;
        foreach (['ABT' => 'um ', 'EST' => 'ca. ', 'CAL' => 'ca. ', 'BEF' => 'vor ', 'AFT' => 'nach ', 'BET' => 'zwischen ', 'FROM' => 'von '] as $k => $v) {
            $text = (string) preg_replace('/^' . $k . '\b\s*/', $v, $text);
        }
        $text = str_replace([' AND ', ' TO '], [' und ', ' bis '], $text);
        $text = (string) preg_replace_callback(
            '/\b(\d{1,2}) ([A-Z]{3}) (\d{3,4})\b/',
            static fn (array $m): string => isset(self::MON[$m[2]]) ? ((int) $m[1]) . '. ' . self::MON_DE[self::MON[$m[2]] - 1] . ' ' . $m[3] : $m[0],
            $text
        );
        $text = (string) preg_replace_callback(
            '/\b([A-Z]{3}) (\d{3,4})\b/',
            static fn (array $m): string => isset(self::MON[$m[1]]) ? self::MON_DE[self::MON[$m[1]] - 1] . ' ' . $m[2] : $m[0],
            $text
        );

        return [$j, $text, (bool) preg_match('/^\d{1,2} [A-Z]{3} \d{3,4}$/', $t)];
    }

    // Ereignisblöcke der Ebene 1 mit ihren Unterzeilen
    /**
     * @return list<list<string>>
     */
    private function bloecke(string $g): array
    {
        $out = [];
        $i   = -1;
        foreach (array_slice(explode("\n", $g), 1) as $z) {
            if (str_starts_with($z, '1 ')) {
                $out[] = [$z];
                $i     = count($out) - 1;
            } elseif ($i >= 0) {
                $out[$i][] = $z;
            }
        }

        return $out;
    }

    /**
     * @param list<string> $block
     *
     * @return list<string>
     */
    private function unter(array $block, string $tag, int $ebene = 2): array
    {
        $kopf = $ebene . ' ' . $tag . ' ';
        $out  = [];
        foreach ($block as $z) {
            if (str_starts_with($z, $kopf)) {
                $out[] = substr($z, strlen($kopf));
            }
        }

        return $out;
    }

    /**
     * Wie unter(), aber mit Fortsetzungszeilen (CONT/CONC) der nächsten Ebene.
     *
     * @param list<string> $block
     *
     * @return list<string>
     */
    private function texte(array $block, string $tag, int $ebene = 2): array
    {
        $kopf = $ebene . ' ' . $tag;
        $cont = ($ebene + 1) . ' CONT';
        $conc = ($ebene + 1) . ' CONC';
        $out  = [];
        $i    = -1;
        foreach ($block as $z) {
            if (str_starts_with($z, $kopf)) {
                $out[] = substr($z, strlen($kopf) + 1);
                $i     = count($out) - 1;
            } elseif ($i >= 0 && str_starts_with($z, $cont)) {
                $out[$i] .= "\n" . substr($z, strlen($cont) + 1);
            } elseif ($i >= 0 && str_starts_with($z, $conc)) {
                $out[$i] .= substr($z, strlen($conc) + 1);
            } else {
                $i = -1;
            }
        }

        return array_map('trim', $out);
    }

    /**
     * @return array{voll:string,vorname:string,nachname:string,rufname:string}
     */
    private function name(string $g): array
    {
        $n     = preg_match('/\n1 NAME ([^\n]*)/', $g, $m) ? $m[1] : '?';
        $teile = explode('/', $n);
        $nick  = preg_match('/\n2 NICK ([^\n]*)/', $g, $m) ? $m[1] : '';

        return [
            'voll'     => trim((string) preg_replace('/\s+/', ' ', str_replace('/', ' ', $n))),
            'vorname'  => trim($teile[0]),
            'nachname' => count($teile) > 1 ? trim($teile[1]) : '',
            'rufname'  => $nick,
        ];
    }

    /**
     * @return array{name:string,lat?:float,lon?:float,genau?:bool}|null
     */
    private function ort(?string $ort): ?array
    {
        if ($ort === null || $ort === '') {
            return null;
        }
        $teile = array_map('trim', explode(',', $ort));
        for ($i = 0, $n = count($teile); $i < $n; $i++) {
            $schluessel = mb_strtolower(implode(', ', array_slice($teile, $i)));
            if (isset($this->koord[$schluessel])) {
                [$lat, $lon] = $this->koord[$schluessel];

                return ['name' => $ort, 'lat' => round($lat, 5), 'lon' => round($lon, 5), 'genau' => $i === 0];
            }
        }

        return ['name' => $ort];
    }

    private static function asciiGross(?string $t): string
    {
        $t = strtr(mb_strtoupper($t ?? ''), [
            'Ä' => 'AE', 'Ö' => 'OE', 'Ü' => 'UE', 'ß' => 'SS', 'Á' => 'A', 'É' => 'E',
            'Í' => 'I', 'Ó' => 'O', 'Ő' => 'O', 'Ú' => 'U', 'Ű' => 'U',
        ]);

        return (string) preg_replace('/[^A-Z0-9_ .]/', '', $t);
    }
}
