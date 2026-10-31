<?php

/**
 * Lebensbühne – ein 3D-Zeittunnel für webtrees.
 * Copyright (C) 2026 Gregor Wolf
 * Lizenz: GNU GPL v3 oder später, siehe LICENSE.
 */

declare(strict_types=1);

namespace GregorWolf\Lebensbuehne;

use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\Contracts\UserInterface;
use Fisharebest\Webtrees\DB;
use Fisharebest\Webtrees\Http\Exceptions\HttpAccessDeniedException;
use Fisharebest\Webtrees\Http\Exceptions\HttpNotFoundException;
use Fisharebest\Webtrees\Http\RequestHandlers\LoginPage;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Menu;
use Fisharebest\Webtrees\Module\AbstractModule;
use Fisharebest\Webtrees\Module\ModuleChartInterface;
use Fisharebest\Webtrees\Module\ModuleChartTrait;
use Fisharebest\Webtrees\Module\ModuleCustomInterface;
use Fisharebest\Webtrees\Module\ModuleCustomTrait;
use Fisharebest\Webtrees\Module\ModuleGlobalInterface;
use Fisharebest\Webtrees\Module\ModuleGlobalTrait;
use Fisharebest\Webtrees\Module\ModuleTabInterface;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Services\ModuleService;
use Fisharebest\Webtrees\Tree;
use Fisharebest\Webtrees\Validator;
use Fisharebest\Webtrees\View;
use Fisharebest\Webtrees\Webtrees;
use DOMComment;
use DOMDocument;
use DOMElement;
use DOMNode;
use Imagick;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Throwable;

use function array_filter;
use function array_keys;
use function array_map;
use function array_values;
use function basename;
use function class_exists;
use function extension_loaded;
use function fclose;
use function file_get_contents;
use function file_put_contents;
use function filemtime;
use function filesize;
use function fopen;
use function fread;
use function fseek;
use function glob;
use function htmlspecialchars;
use function implode;
use function in_array;
use function intdiv;
use function is_array;
use function is_dir;
use function is_file;
use function is_object;
use function is_string;
use function iterator_to_array;
use function json_decode;
use function json_encode;
use function libxml_clear_errors;
use function libxml_use_internal_errors;
use function max;
use function md5;
use function min;
use function mkdir;
use function nl2br;
use function pathinfo;
use function preg_match;
use function rawurlencode;
use function redirect;
use function rename;
use function response;
use function route;
use function str_starts_with;
use function strip_tags;
use function strlen;
use function strtolower;
use function strtr;
use function substr;
use function trim;
use function view;

/**
 * Die Lebensbühne als Diagramm-Modul: eine eigene Vollbildseite mit dem 3D-Zeittunnel, dazu geschützte Adressen
 * für die Daten, die Gesichtsausschnitte und eigene Klänge. Alles ist nur für angemeldete Mitglieder des
 * Stammbaums erreichbar – Gäste werden zur Anmeldung geschickt.
 */
final class LebensbuehneModule extends AbstractModule implements ModuleCustomInterface, ModuleChartInterface, ModuleGlobalInterface, RequestHandlerInterface
{
    use ModuleCustomTrait;
    use ModuleChartTrait;
    use ModuleGlobalTrait;

    public const string VERSION = '1.7.2';

    // Oberflächenwörter des Moduls, die webtrees selbst in viele Sprachen übersetzt (deutscher Schlüssel => englische msgid)
    private const array WEBTREES_WOERTER = [
        'Geburt' => 'Birth', 'Tod' => 'Death', 'Hochzeit' => 'Marriage', 'Auswanderung' => 'Emigration',
        'Einwanderung' => 'Immigration', 'Quelle' => 'Source', 'Schließen' => 'Close', 'Weiter' => 'Next',
        'Zurück' => 'Previous', 'Vorfahren' => 'Ancestors', 'Nachkommen' => 'Descendants', 'Kind' => 'Child',
        'Foto' => 'Photo', 'Dokument' => 'Document', 'Grab' => 'Tombstone', 'Zeitung' => 'Newspaper', 'Jahr' => 'Year',
        'geboren' => 'born', 'verstorben' => 'died',
    ];

    private const string ROUTE_SEITE   = 'lebensbuehne-seite';
    private const string ROUTE_DATEN   = 'lebensbuehne-daten';
    private const string ROUTE_GESICHT = 'lebensbuehne-gesicht';
    private const string ROUTE_KLANG   = 'lebensbuehne-klang';
    private const string ROUTE_GESCHICHTE = 'lebensbuehne-geschichte';

    // Tags und Attribute, die aus den Geschichten des webtrees-Moduls „Geschichten“ übernommen werden
    private const array HTML_TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'img',
        'figure', 'figcaption', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr'];

    private const string AUDIO = '/^[\w-]+\.(mp3|ogg|oga|opus|wav|flac|m4a)$/i';

    private const array AUDIO_TYP = [
        'mp3' => 'audio/mpeg', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'opus' => 'audio/ogg',
        'wav' => 'audio/wav', 'flac' => 'audio/flac', 'm4a' => 'audio/mp4',
    ];

    // Standard: nur für Mitglieder (in der Modulverwaltung änderbar; Gäste sind im Code zusätzlich ausgeschlossen)
    protected int $access_level = Auth::PRIV_USER;

    public function boot(): void
    {
        $karte = Registry::routeFactory()->routeMap();
        $karte->get(self::ROUTE_SEITE, '/tree/{tree}/lebensbuehne/{xref}', $this);
        $karte->get(self::ROUTE_DATEN, '/tree/{tree}/lebensbuehne-daten', $this);
        $karte->get(self::ROUTE_GESICHT, '/tree/{tree}/lebensbuehne-gesicht/{xref}/{media}', $this);
        $karte->get(self::ROUTE_KLANG, '/tree/{tree}/lebensbuehne-klang/{datei}', $this);
        $karte->get(self::ROUTE_GESCHICHTE, '/tree/{tree}/lebensbuehne-geschichte/{xref}', $this);

        View::registerNamespace($this->name(), $this->resourcesFolder() . 'views/');
    }

    public function title(): string
    {
        return 'Lebensbühne';
    }

    public function description(): string
    {
        return 'Vorfahren und Nachkommen als begehbarer 3D-Zeittunnel – mit Zeitreise, Lebensgeschichten, Karten und Zeitgeschehen.';
    }

    public function customModuleAuthorName(): string
    {
        return 'Gregor Wolf';
    }

    public function customModuleVersion(): string
    {
        return self::VERSION;
    }

    public function customModuleSupportUrl(): string
    {
        return 'https://github.com/gregorwolf1973/webtrees-lebensbuehne';
    }

    public function customModuleLatestVersionUrl(): string
    {
        return 'https://raw.githubusercontent.com/gregorwolf1973/webtrees-lebensbuehne/main/latest-version.txt';
    }

    public function resourcesFolder(): string
    {
        return __DIR__ . '/../resources/';
    }

    public function chartMenuClass(): string
    {
        return 'menu-chart-lebensbuehne';
    }

    /**
     * Icon für den Eintrag im Menü „Diagramme“. Die mitgelieferten Themes webtrees, clouds, colors und xenea setzen Icon,
     * Einzug und Zeilenhöhe der Einträge über `.menu-chart-…:before`; ohne eigene Regel klebt der Text dort am linken Rand
     * und die Zeile ist zu niedrig. Größe wie deren Icons: 24 px (webtrees), 22 px (clouds, colors, xenea). Themes ohne
     * Icons im Menü (fab, minimal, eigene wie Primer) bleiben unberührt.
     */
    public function headContent(): string
    {
        $datei = $this->resourcesFolder() . 'css/menu-icon.svg';
        $svg   = is_file($datei) ? (string) file_get_contents($datei) : '';
        if ($svg === '') {
            return '';
        }
        $url   = static fn (int $px): string => 'url("data:image/svg+xml,' . rawurlencode(strtr(trim($svg), ['width="24" height="24"' => 'width="' . $px . '" height="' . $px . '"'])) . '")';
        $regel = static fn (array $themes, int $px): string => implode(',', array_map(static fn (string $theme): string => '.wt-theme-' . $theme . ' .menu-chart-lebensbuehne:before', $themes)) . '{content:' . $url($px) . '}';

        return '<style>' . $regel(['webtrees'], 24) . $regel(['clouds', 'colors', 'xenea'], 22) . '</style>';
    }

    public function chartBoxMenu(Individual $individual): Menu|null
    {
        return $this->chartMenu($individual);
    }

    public function chartUrl(Individual $individual, array $parameters = []): string
    {
        return route(self::ROUTE_SEITE, ['tree' => $individual->tree()->name(), 'xref' => $individual->xref()] + $parameters);
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $tree  = Validator::attributes($request)->tree();
        $user  = Validator::attributes($request)->user();
        $route = $request->getAttribute('route');
        $name  = is_object($route) ? (string) $route->name : '';

        // Nur angemeldete Mitglieder dieses Stammbaums – unabhängig von der Einstellung in der Modulverwaltung
        if (!Auth::isMember($tree, $user)) {
            if ($name === self::ROUTE_SEITE) {
                return redirect(route(LoginPage::class, ['tree' => $tree->name(), 'url' => (string) $request->getUri()]));
            }
            throw new HttpAccessDeniedException('Die Lebensbühne ist nur für angemeldete Familienmitglieder.');
        }
        Auth::checkComponentAccess($this, ModuleChartInterface::class, $tree, $user);

        return match ($name) {
            self::ROUTE_SEITE   => $this->seite($request, $tree),
            self::ROUTE_DATEN   => $this->daten($tree, $user),
            self::ROUTE_GESICHT => $this->gesicht($request, $tree),
            self::ROUTE_KLANG   => $this->klang($request, $tree),
            self::ROUTE_GESCHICHTE => $this->geschichte($request, $tree, $user),
            default             => throw new HttpNotFoundException(),
        };
    }

    private function seite(ServerRequestInterface $request, Tree $tree): ResponseInterface
    {
        $xref       = Validator::attributes($request)->isXref()->string('xref');
        $individual = Auth::checkIndividualAccess(Registry::individualFactory()->make($xref, $tree), false, true);

        $importe = [
            'three'                                  => $this->assetUrl('vendor/three/three.module.min.js'),
            'three/addons/controls/OrbitControls.js' => $this->assetUrl('vendor/three/OrbitControls.js'),
        ];
        foreach (['app', 'daten', 'panel', 'klang', 'tiefe', 'text', 'himmel', 'karten'] as $datei) {
            $importe['lb/' . $datei . '.js'] = $this->assetUrl('js/' . $datei . '.js');
        }

        // historische Grenzen je Jahr (resources/data/grenzen/JJJJ.json)
        $grenzen = [];
        foreach (glob($this->resourcesFolder() . 'data/grenzen/*.json') ?: [] as $pfad) {
            $grenzen[basename($pfad, '.json')] = $this->assetUrl('data/grenzen/' . basename($pfad));
        }

        // mitgelieferte freie Klänge (resources/klaenge) und Lieder (resources/musik/lieder.json); eigene Dateien gehen vor
        $klangUrl   = fn (string $datei): string => route(self::ROUTE_KLANG, ['tree' => $tree->name(), 'datei' => 'mit-' . $datei]);
        $klaengeMit = [];
        foreach (glob($this->resourcesFolder() . 'klaenge/*') ?: [] as $pfad) {
            if (preg_match(self::AUDIO, basename($pfad))) {
                $klaengeMit[strtolower((string) pathinfo($pfad, PATHINFO_FILENAME))] = $klangUrl(basename($pfad));
            }
        }
        $lieder = [];
        $liste  = is_file($this->resourcesFolder() . 'musik/lieder.json') ? json_decode((string) file_get_contents($this->resourcesFolder() . 'musik/lieder.json'), true) : [];
        foreach (is_array($liste) ? $liste : [] as $lied) {
            if (is_array($lied) && is_string($lied['datei'] ?? null) && preg_match(self::AUDIO, $lied['datei']) && is_file($this->resourcesFolder() . 'musik/' . $lied['datei'])) {
                $lieder[] = $lied + ['url' => $klangUrl($lied['datei'])];
            }
        }
        // eigene Lieder der Installation (data/lebensbuehne/musik/lieder.json, Format wie oben), etwa Aufnahmen, die nur
        // in der EU frei sind und deshalb nicht im Modul liegen
        $eigeneLieder = Webtrees::DATA_DIR . 'lebensbuehne/musik/';
        $liste        = is_file($eigeneLieder . 'lieder.json') ? json_decode((string) file_get_contents($eigeneLieder . 'lieder.json'), true) : [];
        foreach (is_array($liste) ? $liste : [] as $lied) {
            if (is_array($lied) && is_string($lied['datei'] ?? null) && preg_match(self::AUDIO, $lied['datei']) && is_file($eigeneLieder . $lied['datei'])) {
                $lieder[] = $lied + ['url' => route(self::ROUTE_KLANG, ['tree' => $tree->name(), 'datei' => 'eigen-' . $lied['datei']])];
            }
        }

        // eigenes Zeitgeschehen der Installation (data/lebensbuehne/zeitgeschehen.json, Format wie resources/data/zeitgeschehen.json)
        $eigenePfad = Webtrees::DATA_DIR . 'lebensbuehne/zeitgeschehen.json';
        $eigene     = is_file($eigenePfad) ? json_decode((string) file_get_contents($eigenePfad), true) : [];

        $sprache = $this->sprache();
        $musik   = $this->musikDatei();
        $config  = [
            'sprache'       => $sprache,
            'texte'         => (object) $this->texte($sprache),
            'zeitgeschehenEigen' => is_array($eigene) ? array_values(array_filter($eigene, 'is_array')) : [],
            'klaengeMit'    => (object) $klaengeMit,
            'lieder'        => $lieder,
            'daten'         => route(self::ROUTE_DATEN, ['tree' => $tree->name()]),
            'geschichte'    => route(self::ROUTE_GESCHICHTE, ['tree' => $tree->name(), 'xref' => 'XREF']),
            'grenzen'       => (object) $grenzen,
            'zeitgeschehen' => $this->assetUrl('data/zeitgeschehen.json'),
            'sterne'        => $this->assetUrl('data/sterne.json'),
            'klaenge'       => route(self::ROUTE_KLANG, ['tree' => $tree->name(), 'datei' => 'liste.json']),
            'klangDatei'    => route(self::ROUTE_KLANG, ['tree' => $tree->name(), 'datei' => 'DATEI']),
            'musik'         => $musik !== null ? route(self::ROUTE_KLANG, ['tree' => $tree->name(), 'datei' => basename($musik)]) : null,
            'musikName'     => $sprache === 'de' ? 'Lied der Familie' : 'Family song',
            'start'         => $individual->xref(),
        ];

        $texte = $this->texte($sprache);

        return response(view($this->name() . '::seite', [
            't'          => static fn (string $de): string => $texte[$de] ?? $de,
            'sprache'    => $sprache,
            'titel'      => 'Lebensbühne – ' . $tree->title(),
            'baum'       => $tree->title(),
            'zurueck'    => $individual->url(),
            'config'     => $config,
            'importe'    => $importe,
            'css'        => $this->assetUrl('css/stil.css'),
            'leafletCss' => $this->assetUrl('vendor/leaflet/leaflet.css'),
            'leafletJs'  => $this->assetUrl('vendor/leaflet/leaflet.js'),
            'appJs'      => $importe['lb/app.js'],
        ]));
    }

    private function daten(Tree $tree, UserInterface $user): ResponseInterface
    {
        $stufe = Auth::accessLevel($tree, $user);

        // Zwischenspeicher je Stammbaum und Zugriffsstufe; jede Änderung im Stammbaum erneuert ihn
        $stand = DB::table('change')->where('gedcom_id', '=', $tree->id())
            ->selectRaw("COALESCE(MAX(change_id), 0) AS m, SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS a")
            ->first();
        // Personen mit Erzählung oder webtrees-Geschichte bekommen den Reiter „Erzählung“; neue Tiefenkarten erneuern ihn auch
        $mitGeschichte = $this->geschichtenXrefs($tree, $user);
        $tiefen        = Webtrees::DATA_DIR . 'lebensbuehne/tiefen';
        $sprache       = $this->sprache();
        $schluessel    = 'lebensbuehne-' . $tree->id() . '-' . $stufe . '-' . $sprache . '-' . I18N::languageTag() . '-' . ($stand->m ?? 0) . '-' . ($stand->a ?? 0) . '-' . self::VERSION
            . '-' . md5(implode(',', array_keys($mitGeschichte)) . '|' . (is_dir($tiefen) ? (string) filemtime($tiefen) : ''));

        $json = Registry::cache()->file()->remember($schluessel, function () use ($tree, $stufe, $mitGeschichte, $sprache): string {
            $alle = (new Daten($tree, $stufe, self::ROUTE_GESICHT, $sprache))->alle();
            foreach ($alle['personen'] as &$p) {
                if (isset($mitGeschichte[$p['id']])) {
                    $p['geschichte'] = true;
                }
            }
            unset($p);

            return (string) json_encode($alle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }, 86400);

        return response($json, 200, ['content-type' => 'application/json', 'cache-control' => 'private, no-cache']);
    }

    // Gesichtsausschnitt (bzw. quadratisches Hauptbild) für die Karte, aus der Originaldatei geschnitten
    private function gesicht(ServerRequestInterface $request, Tree $tree): ResponseInterface
    {
        $xref    = Validator::attributes($request)->isXref()->string('xref');
        $mid     = Validator::attributes($request)->isXref()->string('media');
        $quadrat = Validator::queryParams($request)->string('q', '') === '1';

        $person = Registry::individualFactory()->make($xref, $tree);
        $media  = Registry::mediaFactory()->make($mid, $tree);
        $datei  = $media !== null && $media->canShow() ? $media->firstImageFile() : null;
        if ($person === null || !$person->canShow() || $datei === null || $datei->isExternal() || !$datei->fileExists()) {
            throw new HttpNotFoundException();
        }
        $rahmen = $quadrat ? null : $this->rahmen($tree, $mid, $xref);
        if (!$quadrat && $rahmen === null) {
            throw new HttpNotFoundException();
        }

        $ordner = Webtrees::DATA_DIR . 'lebensbuehne/cache/';
        $name   = $tree->id() . '_' . $xref . '_' . $mid . '_' . md5(json_encode($rahmen) . '|' . $datei->filename());
        $ziel   = $ordner . $name . '.jpg';

        // Tiefenkarte für das 2,5D-Porträt (berechnet mit tools/tiefen.py, liegt neben dem Zwischenspeicher)
        if (Validator::queryParams($request)->string('t', '') === '1') {
            $tiefe = Webtrees::DATA_DIR . 'lebensbuehne/tiefen/' . $name . '.png';
            if (!is_file($tiefe)) {
                throw new HttpNotFoundException();
            }

            return response((string) file_get_contents($tiefe), 200, ['content-type' => 'image/png', 'cache-control' => 'private, max-age=2592000']);
        }

        if (!is_file($ziel)) {
            try {
                if (!extension_loaded('imagick')) {
                    return redirect($datei->imageUrl(400, 400, 'crop'));
                }
                if (!is_dir($ordner)) {
                    mkdir($ordner, 0775, true);
                }
                file_put_contents($ziel . '.tmp', $this->schneide($datei->fileContents(), $rahmen));
                rename($ziel . '.tmp', $ziel);
            } catch (Throwable) {
                return redirect($datei->imageUrl(400, 400, 'crop'));
            }
        }

        return response((string) file_get_contents($ziel), 200, ['content-type' => 'image/jpeg', 'cache-control' => 'private, max-age=2592000']);
    }

    /**
     * @param list<int>|null $rahmen [x1, y1, x2, y2] im Originalbild; null = mittig quadratisch
     */
    private function schneide(string $bild, ?array $rahmen): string
    {
        $im = new Imagick();
        $im->readImageBlob($bild);
        if ($im->getNumberImages() > 1) {
            $im->setIteratorIndex(0);
            $im = $im->getImage();
        }
        $im->autoOrient();
        $w = $im->getImageWidth();
        $h = $im->getImageHeight();
        if ($rahmen !== null) {
            [$x1, $y1, $x2, $y2] = $rahmen;
            // Rand um das Gesicht, quadratisch
            $s  = (int) (max($x2 - $x1, $y2 - $y1) * 1.5);
            $cx = intdiv($x1 + $x2, 2);
            $cy = intdiv($y1 + $y2, 2);
            $x  = max(0, min($w - 1, $cx - intdiv($s, 2)));
            $y  = max(0, min($h - 1, $cy - intdiv($s, 2)));
            $s  = min($s, $w - $x, $h - $y);
            $im->cropImage($s, $s, $x, $y);
        } else {
            $s = min($w, $h);
            $im->cropImage($s, $s, intdiv($w - $s, 2), max(0, intdiv($h - $s, 4)));
        }
        $im->setImagePage(0, 0, 0, 0);
        $im->thumbnailImage(400, 400, true);
        $im->setImageFormat('jpeg');
        $im->setImageCompressionQuality(82);
        $im->stripImage();

        return $im->getImageBlob();
    }

    /**
     * Gesichtsrahmen einer Person auf einem Bild (Modul „webtrees-faces“).
     *
     * @return list<int>|null
     */
    private function rahmen(Tree $tree, string $mid, string $xref): ?array
    {
        if (!DB::schema()->hasTable('media_faces')) {
            return null;
        }
        $zeile = DB::table('media_faces')->where('f_m_tree', '=', $tree->id())->where('f_m_id', '=', $mid)->value('f_coordinates');
        foreach (json_decode((string) $zeile, true) ?: [] as $e) {
            if (($e['pid'] ?? null) === $xref && is_array($e['coords'] ?? null) && count($e['coords']) >= 4) {
                return array_map(static fn ($v): int => (int) (float) $v, array_slice($e['coords'], 0, 4));
            }
        }

        return null;
    }

    // Eigene Klänge und das Lied liegen im webtrees-Datenordner unter lebensbuehne/ (nicht öffentlich erreichbar)
    private function klang(ServerRequestInterface $request, Tree $tree): ResponseInterface
    {
        $datei  = Validator::attributes($request)->string('datei');
        $ordner = Webtrees::DATA_DIR . 'lebensbuehne/';

        if ($datei === 'liste.json') {
            $liste = [];
            foreach (glob($ordner . 'klaenge/*') ?: [] as $pfad) {
                $name = basename($pfad);
                if (preg_match(self::AUDIO, $name)) {
                    $liste[strtolower((string) pathinfo($name, PATHINFO_FILENAME))] = $name;
                }
            }

            return response((string) json_encode((object) $liste, JSON_UNESCAPED_UNICODE), 200, ['content-type' => 'application/json', 'cache-control' => 'private, no-cache']);
        }

        // mitgelieferte Aufnahmen aus dem Modul („mit-<Datei>“)
        if (str_starts_with($datei, 'mit-')) {
            $name = substr($datei, 4);
            if (!preg_match(self::AUDIO, $name)) {
                throw new HttpNotFoundException();
            }
            foreach (['klaenge/', 'musik/'] as $unter) {
                if (is_file($this->resourcesFolder() . $unter . $name)) {
                    return $this->dateiAntwort($request, $this->resourcesFolder() . $unter . $name);
                }
            }
            throw new HttpNotFoundException();
        }

        // eigene Lieder der Installation („eigen-<Datei>“ aus data/lebensbuehne/musik/)
        if (str_starts_with($datei, 'eigen-')) {
            $name = substr($datei, 6);
            if (!preg_match(self::AUDIO, $name) || !is_file($ordner . 'musik/' . $name)) {
                throw new HttpNotFoundException();
            }

            return $this->dateiAntwort($request, $ordner . 'musik/' . $name);
        }

        if (!preg_match(self::AUDIO, $datei)) {
            throw new HttpNotFoundException();
        }
        $pfad = preg_match('/^musik\./i', $datei) ? $ordner . $datei : $ordner . 'klaenge/' . $datei;
        if (!is_file($pfad)) {
            throw new HttpNotFoundException();
        }

        return $this->dateiAntwort($request, $pfad);
    }

    // Erzählung (data/lebensbuehne/geschichten/<Baum>.json) und Geschichten aus dem webtrees-Modul „Geschichten“ zu einer Person
    private function geschichte(ServerRequestInterface $request, Tree $tree, UserInterface $user): ResponseInterface
    {
        $xref   = Validator::attributes($request)->isXref()->string('xref');
        $person = Registry::individualFactory()->make($xref, $tree);
        if ($person === null || !$person->canShow()) {
            throw new HttpNotFoundException();
        }
        // Erzählung in der Sprache der Oberfläche, wenn es sie gibt (<Baum>.en.json), sonst die deutsche
        $sprache      = $this->sprache();
        $uebersetzt   = $sprache !== 'de' ? $this->erzaehlungen($tree, $sprache) : [];
        $eigeneSprache = is_string($uebersetzt[$xref] ?? null);
        $erzaehlungen = $eigeneSprache ? $uebersetzt : $this->erzaehlungen($tree);
        $antwort      = [
            'erzaehlung'  => is_string($erzaehlungen[$xref] ?? null) ? $erzaehlungen[$xref] : null,
            'sprache'     => $eigeneSprache ? $sprache : 'de',
            'stand'       => is_string($erzaehlungen['_stand'] ?? null) ? $erzaehlungen['_stand'] : '',
            'geschichten' => $this->webtreesGeschichten($tree, $user, $xref),
        ];

        return response((string) json_encode($antwort, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 200, ['content-type' => 'application/json', 'cache-control' => 'private, no-cache']);
    }

    /**
     * Erzählte Lebensgeschichten eines Baums: {"_stand": "…", "X123": "Absatz\n\nAbsatz", …}; Übersetzungen in <Baum>.<sprache>.json
     *
     * @return array<string,mixed>
     */
    private function erzaehlungen(Tree $tree, string $sprache = 'de'): array
    {
        $pfad = Webtrees::DATA_DIR . 'lebensbuehne/geschichten/' . $tree->name() . ($sprache === 'de' ? '' : '.' . $sprache) . '.json';
        if (!is_file($pfad)) {
            return [];
        }
        $daten = json_decode((string) file_get_contents($pfad), true);

        return is_array($daten) ? $daten : [];
    }

    /**
     * @return array<string,true> Personen mit Erzählung oder webtrees-Geschichte
     */
    private function geschichtenXrefs(Tree $tree, UserInterface $user): array
    {
        $xrefs = [];
        foreach (array_keys($this->erzaehlungen($tree)) as $x) {
            if ($x !== '_stand') {
                $xrefs[(string) $x] = true;
            }
        }
        if ($this->geschichtenModul($tree, $user)) {
            foreach (DB::table('block')->where('gedcom_id', '=', $tree->id())->where('module_name', '=', 'stories')->whereNotNull('xref')->pluck('xref') as $x) {
                $xrefs[(string) $x] = true;
            }
        }

        return $xrefs;
    }

    // Das Modul „Geschichten“ muss aktiv und für den Betrachter freigegeben sein
    private function geschichtenModul(Tree $tree, UserInterface $user): bool
    {
        $modul = Registry::container()->get(ModuleService::class)->findByName('stories');

        return $modul instanceof ModuleTabInterface && Auth::accessLevel($tree, $user) <= $modul->accessLevel($tree, ModuleTabInterface::class);
    }

    /**
     * @return list<array{titel:string,html:string}>
     */
    private function webtreesGeschichten(Tree $tree, UserInterface $user, string $xref): array
    {
        if (!$this->geschichtenModul($tree, $user)) {
            return [];
        }
        $liste = [];
        $ids   = DB::table('block')->where('gedcom_id', '=', $tree->id())->where('module_name', '=', 'stories')->where('xref', '=', $xref)->orderBy('block_id')->pluck('block_id');
        foreach ($ids as $id) {
            $einstellung = DB::table('block_setting')->where('block_id', '=', $id)->pluck('setting_value', 'setting_name');
            $liste[]     = ['titel' => (string) ($einstellung['title'] ?? ''), 'html' => $this->saubereHtml((string) ($einstellung['story_body'] ?? ''))];
        }

        return $liste;
    }

    // Geschichten-HTML auf harmlose Tags und Attribute beschränken (keine Skripte, keine Ereignis-Attribute, keine Stile)
    private function saubereHtml(string $html): string
    {
        if (!class_exists(DOMDocument::class)) {
            return '<p>' . nl2br(htmlspecialchars(strip_tags($html))) . '</p>';
        }
        $dom = new DOMDocument();
        $alt = libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="utf-8"?><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($alt);
        $wurzel = null;
        foreach ($dom->childNodes as $k) {
            if ($k instanceof DOMElement) {
                $wurzel = $k;
                break;
            }
        }
        if ($wurzel === null) {
            return '';
        }
        $saeubere = function (DOMNode $knoten) use (&$saeubere): void {
            foreach (iterator_to_array($knoten->childNodes) as $kind) {
                if ($kind instanceof DOMComment) {
                    $knoten->removeChild($kind);
                    continue;
                }
                if (!$kind instanceof DOMElement) {
                    continue;
                }
                $name = strtolower($kind->nodeName);
                if (in_array($name, ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'], true)) {
                    $knoten->removeChild($kind);
                    continue;
                }
                $saeubere($kind);
                if (!in_array($name, self::HTML_TAGS, true)) {
                    while ($kind->firstChild !== null) {
                        $knoten->insertBefore($kind->firstChild, $kind);
                    }
                    $knoten->removeChild($kind);
                    continue;
                }
                foreach (iterator_to_array($kind->attributes) as $attribut) {
                    $a  = strtolower($attribut->name);
                    $ok = ($name === 'a' && $a === 'href') || ($name === 'img' && in_array($a, ['src', 'alt', 'width', 'height'], true));
                    if ($ok && ($a === 'href' || $a === 'src') && preg_match('/^\s*(javascript|data|vbscript):/i', $attribut->value)) {
                        $ok = false;
                    }
                    if (!$ok) {
                        $kind->removeAttribute($attribut->name);
                    }
                }
                if ($name === 'a') {
                    $kind->setAttribute('target', '_blank');
                    $kind->setAttribute('rel', 'noopener');
                }
            }
        };
        $saeubere($wurzel);
        $ergebnis = '';
        foreach ($wurzel->childNodes as $k) {
            $ergebnis .= $dom->saveHTML($k);
        }

        return $ergebnis;
    }

    // Sprache der Oberfläche: Deutsch, wenn webtrees deutsch spricht, sonst Englisch (weitere Sprachen über resources/lang/<sprache>.json)
    private function sprache(): string
    {
        $tag = strtolower(substr(I18N::languageTag(), 0, 2));
        if ($tag === 'de') {
            return 'de';
        }

        return is_file($this->resourcesFolder() . 'lang/' . $tag . '.json') ? $tag : 'en';
    }

    /**
     * Übersetzungen der Oberfläche (deutscher Text => Übersetzung)
     *
     * @return array<string,string>
     */
    private function texte(string $sprache): array
    {
        $pfad = $this->resourcesFolder() . 'lang/' . $sprache . '.json';
        if ($sprache === 'de' || !is_file($pfad)) {
            return [];
        }
        $texte = json_decode((string) file_get_contents($pfad), true);
        $texte = is_array($texte) ? array_filter($texte, 'is_string') : [];

        // Ohne eigene Übersetzung des Moduls (etwa Französisch, Schwedisch) übernehmen gängige Wörter die von webtrees
        if ($sprache === 'en' && !str_starts_with(I18N::languageTag(), 'en')) {
            foreach (self::WEBTREES_WOERTER as $de => $englisch) {
                $texte[$de] = I18N::translate($englisch);
            }
        }

        return $texte;
    }

    private function musikDatei(): ?string
    {
        foreach (['mp3', 'm4a', 'ogg', 'opus', 'wav'] as $endung) {
            $pfad = Webtrees::DATA_DIR . 'lebensbuehne/musik.' . $endung;
            if (is_file($pfad)) {
                return $pfad;
            }
        }

        return null;
    }

    // Audiodatei ausliefern, mit Teilbereichen (Range), damit der Browser im Lied springen kann
    private function dateiAntwort(ServerRequestInterface $request, string $pfad): ResponseInterface
    {
        $groesse = (int) filesize($pfad);
        $kopf    = [
            'content-type'  => self::AUDIO_TYP[strtolower((string) pathinfo($pfad, PATHINFO_EXTENSION))] ?? 'application/octet-stream',
            'accept-ranges' => 'bytes',
            'cache-control' => 'private, max-age=86400',
        ];

        if (preg_match('/^bytes=(\d*)-(\d*)$/', $request->getHeaderLine('range'), $m) && ($m[1] !== '' || $m[2] !== '')) {
            if ($m[1] === '') {
                $von = max(0, $groesse - (int) $m[2]);
                $bis = $groesse - 1;
            } else {
                $von = (int) $m[1];
                $bis = $m[2] === '' ? $groesse - 1 : min((int) $m[2], $groesse - 1);
            }
            if ($von > $bis || $von >= $groesse) {
                return response('', 416, ['content-range' => 'bytes */' . $groesse]);
            }
            $h = fopen($pfad, 'rb');
            fseek($h, $von);
            $teil = (string) fread($h, $bis - $von + 1);
            fclose($h);

            return response($teil, 206, $kopf + ['content-range' => 'bytes ' . $von . '-' . $bis . '/' . $groesse, 'content-length' => (string) strlen($teil)]);
        }

        return response((string) file_get_contents($pfad), 200, $kopf + ['content-length' => (string) $groesse]);
    }
}
