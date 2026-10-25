// Einblendung zu einer Person: Bildgeschichte, Lebenslauf mit Zeitgeschehen, Bilder, Karte des Lebenswegs.
import { kapitel, lebensdaten, verwandtschaft, jahreKurz, ortKurz, trenneNotiz, zeitgeschehenFuer, erzaehle, sortJahr, LB } from 'lb/daten.js';
import { belebe } from 'lb/tiefe.js';
import { t, EN } from 'lb/text.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Panel {
  constructor(daten, { zuPerson, hauptperson, geschlossen, breite }) {
    this.daten = daten;
    this.cb = { zuPerson, hauptperson, geschlossen, breite };
    this.el = document.getElementById('panel');
    this.offen = false;
    this.lightbox = new Lightbox();
    this.el.addEventListener('click', ev => {
      const ziel = ev.target.closest('[data-person]');
      if (ziel) { ev.preventDefault(); this.cb.zuPerson(ziel.dataset.person); }
      const hp = ev.target.closest('[data-hauptperson]');
      if (hp) this.cb.hauptperson(hp.dataset.hauptperson);
      const tab = ev.target.closest('[data-tab]');
      if (tab) this.tab(tab.dataset.tab);
      if (ev.target.closest('.schliessen')) this.schliesse();
      if (ev.target.closest('.griff')) { this.el.classList.toggle('gross'); requestAnimationFrame(() => this.cb.breite(this.breite())); }
      const bild = ev.target.closest('[data-bild]');
      if (bild && +bild.dataset.bild >= 0) this.lightbox.zeige(this.p.bilder, +bild.dataset.bild);
    });
    // Porträt leicht kippen, solange das 2,5D-Porträt noch nicht bereit ist
    this.el.addEventListener('pointermove', ev => {
      const f = this.el.querySelector('.portraet');
      if (!f || f.querySelector('.tiefe-kopf.an')) return;
      const r = f.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
      if (Math.abs(x) > 2 || Math.abs(y) > 2) return;
      f.style.transform = `perspective(500px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg)`;
    });
  }

  breite() { return this.el.getBoundingClientRect().width; }

  zeige(p) {
    this.p = p;
    this.zrPerson = null;
    clearInterval(this.diashow);
    this.offen = true;
    this.stilleStimme();
    this.modus('voll');
    // mit Erzählung beginnt die Einblendung dort, sonst beim zuletzt gewählten Reiter
    let tabAlt = this.aktiverTab || (p.geschichte ? 'erzaehlung' : 'geschichte');
    if (tabAlt === 'erzaehlung' && !p.geschichte) tabAlt = 'geschichte';
    this.el.innerHTML = `
      <button class="griff" aria-label="${t('Einblendung größer oder kleiner')}"></button>
      <button class="schliessen" aria-label="${t('Schließen')}">✕</button>
      ${this.kopf(p)}
      <nav class="tabs" role="tablist">
        ${p.geschichte ? `<button data-tab="erzaehlung">${t('Erzählung')}</button>` : ''}
        <button data-tab="geschichte">${t('Bildgeschichte')}</button>
        <button data-tab="lebenslauf">${t('Lebenslauf')}</button>
        <button data-tab="bilder">${t('Bilder')} <span class="zahl">${p.bilder.length}</span></button>
        <button data-tab="karte">${t('Lebensweg')}</button>
      </nav>
      <section class="inhalt"></section>`;
    this.tab(tabAlt === 'bilder' && !p.bilder.length ? 'geschichte' : tabAlt);
    this.kopf25d(p);
    requestAnimationFrame(() => this.cb.breite(this.breite()));
  }

  // Kopfbild als bewegtes 2,5D-Porträt: legt sich über das runde Bild, sobald es bereit ist
  kopf25d(p) {
    const rahmen = this.el.querySelector('.portraet');
    if (!rahmen || !p.gesicht) return;
    const ziel = document.createElement('div');
    ziel.className = 'tiefe-kopf';
    rahmen.appendChild(ziel);
    belebe(ziel, p.gesicht, p.tiefe, { name: 'kopf', ring: false }).then(ok => {
      if (!ok) return ziel.remove();
      ziel.classList.add('an');
      const img = rahmen.querySelector('img');
      if (img) img.style.visibility = 'hidden';
    });
  }

  // Zeitreise: zeigt die zuletzt geborene, noch lebende Person; ihre Bilder wechseln im Bildfenster
  zeitreise(p, jahr) {
    if (!p) return;
    this.zrJahr = Math.floor(jahr);
    if (this.zrPerson !== p) {
      this.zrPerson = p;
      this.p = p;
      this.offen = true;
      this.stilleStimme();
      this.modus('zeitreise');
      clearInterval(this.spielt); clearInterval(this.diashow);
      this.karte?.remove(); this.karte = null;
      // Fotos in Aufnahmefolge (datierte zuerst), dann Dokumente; in der Zeitreise nur, was bis zum Jahr schon aufgenommen war
      const fotos = p.bilder.map((b, n) => [b, n]).filter(([b]) => b.art === 'foto')
        .sort(([a], [b]) => (a.jahr ?? 1e4) - (b.jahr ?? 1e4));
      const alleBilder = [...fotos, ...p.bilder.map((b, n) => [b, n]).filter(([b]) => b.art !== 'foto')];
      if (!alleBilder.length && p.gesicht) alleBilder.push([{ src: p.gesicht, titel: t('Porträt') }, -1]);
      const reihe = { get length() { return alleBilder.length; } };
      const aktuell = () => {
        const bis = this.zrJahr ?? 1e4, schon = alleBilder.filter(([b]) => b.jahr == null || b.jahr <= bis);
        return schon.length ? schon : alleBilder;
      };
      this.el.innerHTML = `
        <button class="schliessen" aria-label="${t('Schließen')}">✕</button>
        ${this.kopfKompakt(p)}
        <section class="zeitreise">
          <div class="zr-bild">${reihe.length ? '<img class="zr-a" alt=""><img class="zr-b" alt="">' : `<div class="zr-leer">${silhouette()}<span>${t('Keine Bilder')}</span></div>`}</div>
          <p class="zr-alter"></p>
          <p class="zr-hinweis">${reihe.length ? t(reihe.length === 1 ? '{n} Bild · wechselt während der Zeitreise' : '{n} Bilder · wechseln während der Zeitreise', { n: reihe.length }) : ''}</p>
          <button class="zr-voll" data-person="${p.id}">${t('Ganze Lebensgeschichte öffnen')}</button>
        </section>`;
      this.kopf25d(p);
      if (reihe.length) {
        const a = this.el.querySelector('.zr-a'), b = this.el.querySelector('.zr-b');
        let n = 0, vorn = a;
        const zeige = () => {
          const liste = aktuell();
          const [bild, idx] = liste[n % liste.length];
          const hinten = vorn === a ? b : a;
          hinten.onload = () => { hinten.classList.add('an'); vorn.classList.remove('an'); vorn = hinten; };
          hinten.src = bild.src;
          hinten.dataset.bild = idx;
          n++;
        };
        zeige();
        if (reihe.length > 1) this.diashow = setInterval(zeige, 2600);
      }
      requestAnimationFrame(() => this.cb.breite(this.breite()));
    }
    const alter = Math.floor(jahr) - (p.geburt ?? p.jahrE);
    const el = this.el.querySelector('.zr-alter');
    if (el) el.textContent = `${Math.floor(jahr)} · ${alter <= 0 ? t(p.geschaetzt ? 'geboren um diese Zeit' : 'geboren') : t('{n} Jahre alt', { n: alter })}${p.ende < jahr ? ' · ' + t(p.tod ? 'verstorben' : 'vermutlich verstorben') : ''}`;
  }

  // fester, kompakter Kopf für die Zeitreise: gleich hoch für jede Person, damit das Bild darunter nicht springt
  kopfKompakt(p) {
    return `
      <header class="kopf kompakt">
        <div class="portraet ${p.gesicht ? '' : 'leer'}">${p.gesicht ? `<img src="${p.gesicht}" alt="">` : silhouette()}</div>
        <div class="kopf-text">
          <p class="rolle seite-${p.partnerseite ? 'partner' : p.seite}">${esc(verwandtschaft(p))}</p>
          <h2>${esc(p.name.voll)}</h2>
          <p class="daten">${esc(lebensdaten(p) || jahreKurz(p))}</p>
        </div>
      </header>`;
  }

  kopf(p) {
    return `
      <header class="kopf">
        <div class="portraet ${p.gesicht ? '' : 'leer'}">${p.gesicht ? `<img src="${p.gesicht}" alt="">` : silhouette()}</div>
        <div>
          <p class="rolle seite-${p.partnerseite ? 'partner' : p.seite}">${esc(verwandtschaft(p))}${p.mannesstamm ? ' · ' + t('Mannesstamm') : ''}</p>
          <h2>${esc(p.name.voll)}</h2>
          <p class="daten">${esc(lebensdaten(p) || jahreKurz(p))}</p>
          <p class="linie">${p.eltern.map(e => `<a href="#" data-person="${e.id}" title="${t('Elternteil')}">↑ ${esc(e.name.voll)}</a>`).join('')}${p.partnerP.map(e => `<a href="#" data-person="${e.id}" title="${t('Partner')}">∞ ${esc(e.name.voll)}</a>`).join('')}${p.kinderP.slice(0, 8).map(e => `<a href="#" data-person="${e.id}" title="${t('Kind')}">↓ ${esc(e.name.voll)}</a>`).join('')}${p.kinderP.length > 8 ? `<span>${t('+ {n} weitere', { n: p.kinderP.length - 8 })}</span>` : ''}</p>
          ${p.rolle === 'start' ? '' : `<button class="als-hp" data-hauptperson="${p.id}">${t('Als Hauptperson')}</button>`}
        </div>
      </header>`;
  }

  // voll = Lebensgeschichte, zeitreise = kleine Karte während der Zeitreise; die Seite richtet das Layout danach aus
  modus(m) {
    this.el.hidden = !m;
    this.el.dataset.modus = m || '';
    if (m !== 'voll') this.el.classList.remove('gross');
    document.body.dataset.panel = m || '';
  }

  schliesse() {
    if (!this.offen) return;
    this.offen = false;
    this.modus('');
    this.zrPerson = null;
    this.stilleStimme();
    clearInterval(this.spielt); clearInterval(this.diashow);
    this.karte?.remove(); this.karte = null;
    this.cb.geschlossen();
  }

  tab(name) {
    this.aktiverTab = name;
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('aktiv', b.dataset.tab === name);
    const box = this.el.querySelector('.inhalt');
    clearInterval(this.spielt);
    this.karte?.remove(); this.karte = null;
    this.stilleStimme();
    box.scrollTop = 0;
    ({ erzaehlung: () => this.erzaehlung(box), geschichte: () => this.geschichte(box), lebenslauf: () => this.lebenslauf(box),
       bilder: () => this.bilder(box), karte: () => this.lebensweg(box) })[name]();
  }

  // --- Erzählung: von Claude erzählte Lebensgeschichte, dazu Geschichten aus webtrees; auf Wunsch vorgelesen ----------------
  async erzaehlung(box) {
    const p = this.p;
    box.innerHTML = `<p class="leer-hinweis">${t('Erzählung wird geladen …')}</p>`;
    let d = null;
    try {
      if (LB.geschichte) d = await fetch(LB.geschichte.replace('XREF', encodeURIComponent(p.id))).then(r => r.ok ? r.json() : null);
      else {
        const alle = await (this.lokaleGeschichten ??= fetch('data/geschichten.json').then(r => r.ok ? r.json() : {}).catch(() => ({})));
        d = { erzaehlung: alle[p.id] ?? null, stand: alle._stand ?? '', geschichten: [] };
      }
    } catch (e) { d = null; }
    if (this.p !== p || this.aktiverTab !== 'erzaehlung') return;
    const absaetze = (d?.erzaehlung || '').split(/\n\s*\n/).map(a => a.trim()).filter(Boolean);
    const eigene = d?.geschichten || [];
    if (!absaetze.length && !eigene.length) { box.innerHTML = `<p class="leer-hinweis">${t('Zu dieser Person gibt es noch keine Erzählung.')}</p>`; return; }
    box.innerHTML = `
      ${absaetze.length ? `<div class="erzaehlt">
        <button class="vorlesen" aria-pressed="false" hidden>${t('▶ Vorlesen')}</button>
        ${absaetze.map((a, n) => `<p data-absatz="${n}">${esc(a)}</p>`).join('')}
        <p class="hinweis">${t('Erzählt von Claude (KI) nach den Einträgen in webtrees')}${d.stand ? `, ${t('Stand')} ${esc(d.stand)}` : ''}. ${t('Zeitgeschehen ist allgemeine Geschichte. Fehler bitte in webtrees berichtigen.')}${EN && d.sprache === 'de' ? ' ' + t('(Erzählung auf Deutsch)') : ''}</p>
      </div>` : ''}
      ${eigene.map(g => `<article class="wt-geschichte"><h3>${esc(g.titel)}</h3><div class="wt-text">${g.html}</div></article>`).join('')}`;
    const knopf = box.querySelector('.vorlesen');
    if (!knopf || !('speechSynthesis' in window)) return;
    knopf.hidden = false;
    knopf.onclick = () => {
      if (this.liest) { this.stilleStimme(); return; }
      this.vorlesen(box, absaetze, knopf, d.sprache || 'de');
    };
  }

  // Satzweise vorlesen (lange Texte brechen in manchen Browsern sonst ab); der gelesene Absatz wird hervorgehoben
  vorlesen(box, absaetze, knopf, sprache) {
    const stimmen = speechSynthesis.getVoices().filter(v => new RegExp(`^${sprache}(-|_|$)`, 'i').test(v.lang));
    const stimme = stimmen.find(v => /natural|online|google|neural/i.test(v.name)) || stimmen.find(v => v.localService) || stimmen[0] || null;
    const teile = [];
    absaetze.forEach((a, n) => { for (const s of a.match(/[^.!?…]+[.!?…]+[“”»«"')]*\s*|[^.!?…]+$/g) || [a]) teile.push([n, s.trim()]); });
    speechSynthesis.cancel();
    this.liest = { knopf, box };
    knopf.textContent = t('■ Anhalten');
    knopf.setAttribute('aria-pressed', 'true');
    teile.forEach(([n, satz], i) => {
      const u = new SpeechSynthesisUtterance(satz);
      u.lang = sprache === 'de' ? 'de-DE' : 'en-GB';
      if (stimme) u.voice = stimme;
      u.rate = 0.95;
      u.onstart = () => box.querySelectorAll('[data-absatz]').forEach(el => el.classList.toggle('liest', +el.dataset.absatz === n));
      if (i === teile.length - 1) u.onend = () => this.stilleStimme();
      speechSynthesis.speak(u);
    });
  }

  stilleStimme() {
    if (!this.liest) return;
    const { knopf, box } = this.liest;
    this.liest = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    knopf.textContent = t('▶ Vorlesen');
    knopf.setAttribute('aria-pressed', 'false');
    box.querySelectorAll('.liest').forEach(el => el.classList.remove('liest'));
  }

  // --- Bildgeschichte -----------------------------------------------------------------------------
  geschichte(box) {
    const p = this.p, ks = kapitel(p, this.daten.zeit);
    let i = 0;
    box.innerHTML = `
      <div class="geschichte">
        <div class="bildflaeche"></div>
        <div class="steuerung">
          <button class="zurueck" aria-label="${t('Zurück')}">‹</button>
          <div class="punkte">${ks.map((k, n) => `<span class="punkt typ-${k.typ}" data-n="${n}" title="${esc(k.titel)}"></span>`).join('')}</div>
          <button class="vor" aria-label="${t('Weiter')}">›</button>
        </div>
        <div class="erzaehlung"></div>
        <p class="hinweis">${t('Die Texte sind automatisch aus den Einträgen in webtrees erzeugt; Zeitgeschehen ist allgemeine Geschichte, nicht aus Familienquellen.')}</p>
      </div>`;
    const flaeche = box.querySelector('.bildflaeche'), text = box.querySelector('.erzaehlung');
    const zeige = n => {
      i = (n + ks.length) % ks.length;
      const k = ks[i];
      flaeche.className = `bildflaeche typ-${k.typ}`;
      if (k.typ === 'zeit') flaeche.innerHTML = `<div class="plakat"><span class="plakat-jahr">${esc(k.datum)}</span><span class="plakat-titel">${esc(k.titel)}</span><span class="plakat-label">${t('Zeitgeschehen')}</span></div>`;
      else if (k.typ === 'album') flaeche.innerHTML = `<div class="collage n${k.bilder.length}">${k.bilder.map(n => `<button data-bild="${n}"><img src="${p.bilder[n].src}" alt=""></button>`).join('')}</div>`;
      else if (k.bild) {
        flaeche.innerHTML = `<img class="${k.rund ? 'rund' : ''}" src="${k.bild}" alt="">${k.ort?.lat ? `<div class="ortsmarke">${esc(ortKurz(k.ort))}</div>` : ''}`;
        // Vorstellung: das Gesicht als bewegtes 2,5D-Porträt über das Bild legen, sobald es bereit ist
        if (k.typ === 'intro' && k.rund) {
          const img = flaeche.querySelector('img'), ziel = document.createElement('div');
          ziel.className = 'tiefe-portraet';
          flaeche.appendChild(ziel);
          const groesse = () => { const s = img.offsetWidth || 240; ziel.style.width = ziel.style.height = `${s}px`; };
          groesse();
          img.addEventListener('load', groesse, { once: true });
          belebe(ziel, k.bild, p.tiefe).then(ok => {
            if (!ok) return ziel.remove();
            groesse();
            ziel.classList.add('an');
            img.style.visibility = 'hidden';
          });
        }
      }
      else if (k.ort?.lat) flaeche.innerHTML = kartenKachel(k.ort.lat, k.ort.lon, ortKurz(k.ort));
      else flaeche.innerHTML = `<div class="plakat ruhig"><span class="plakat-jahr">${esc(k.datum || (k.jahr ?? ''))}</span><span class="plakat-titel">${esc(k.titel)}</span></div>`;
      text.innerHTML = `<p class="kap-kopf">${k.typ === 'zeit' ? t('Zeitgeschehen') + ' · ' : ''}${esc(k.datum || '')}${k.datum ? ' · ' : ''}${esc(k.titel)}</p>
        <p>${esc(k.text)}</p>${k.zusatz ? `<p class="zusatz">${esc(k.zusatz)}</p>` : ''}
        ${k.weiterId ? `<p><a href="#" data-person="${k.weiterId}">${esc(t('Weiter zu {name}', { name: this.daten.byId.get(k.weiterId).name.voll }))} →</a></p>` : ''}
        <p class="kap-nr">${i + 1} / ${ks.length}</p>`;
      box.querySelectorAll('.punkt').forEach((d, n) => d.classList.toggle('an', n === i));
    };
    box.querySelector('.zurueck').onclick = () => zeige(i - 1);
    box.querySelector('.vor').onclick = () => zeige(i + 1);
    box.querySelector('.punkte').onclick = ev => { const d = ev.target.closest('[data-n]'); if (d) zeige(+d.dataset.n); };
    this.tasten = ev => {
      if (this.aktiverTab !== 'geschichte' || !this.offen || document.querySelector('.lightbox:not([hidden])')) return;
      if (ev.key === 'ArrowRight') zeige(i + 1);
      if (ev.key === 'ArrowLeft') zeige(i - 1);
    };
    removeEventListener('keydown', this.tastenAlt);
    addEventListener('keydown', this.tasten);
    this.tastenAlt = this.tasten;
    zeige(0);
  }

  // --- Lebenslauf mit Zeitgeschehen ---------------------------------------------------------------------
  lebenslauf(box) {
    const p = this.p;
    const eintraege = p.ereignisse.map(e => ({ typ: 'e', jahr: e.jahr, e }));
    for (const z of zeitgeschehenFuer(p, this.daten.zeit)) eintraege.push({ typ: 'z', jahr: Math.max(z.jahr, p.jahrE), z });
    eintraege.sort((a, b) => sortJahr(a, p) - sortJahr(b, p));
    const notizen = p.notizen.map(trenneNotiz).filter(n => n.text);
    box.innerHTML = `
      ${notizen.length ? `<div class="notizen">${notizen.map(n => `<p>${esc(n.text)}</p>`).join('')}</div>` : ''}
      <ol class="zeitstrahl">${eintraege.map(x => {
        if (x.typ === 'z') return `<li class="zg"><span class="j">${x.z.bis ? `${x.z.jahr}–${x.z.bis}` : x.z.jahr}</span>
          <div><b>${esc(x.z.titel)}</b><span class="marke">${t('Zeitgeschehen')}</span><p>${esc(x.z.text)}</p></div></li>`;
        const e = x.e, n = trenneNotiz(e.notiz), q = [n.quelle, e.quelle].filter(Boolean).join(' · ');
        return `<li class="ev art-${e.art}"><span class="j">${e.jahr ?? '?'}</span>
          <div><b>${esc(e.titel)}</b>${e.datum ? `<span class="datum">${esc(e.datum)}</span>` : ''}
          <p>${esc(erzaehle(e, p))}</p>${n.text ? `<p class="notiz">${esc(n.text)}</p>` : ''}
          ${e.ort ? `<p class="ort">${esc(e.ort.name)}</p>` : ''}
          ${q ? `<details><summary>${t('Quelle')}</summary><p>${esc(q)}</p></details>` : ''}</div></li>`;
      }).join('')}</ol>`;
  }

  // --- Bilder ------------------------------------------------------------------------------------------
  bilder(box) {
    const p = this.p;
    if (!p.bilder.length) { box.innerHTML = `<p class="leer-hinweis">${t('Zu dieser Person sind noch keine Bilder in webtrees verknüpft.')}</p>`; return; }
    const art = { foto: t('Foto'), urkunde: t('Dokument'), grab: t('Grab') };
    box.innerHTML = `<div class="galerie">${p.bilder.map((b, n) =>
      `<button class="bild" data-bild="${n}"><img loading="lazy" src="${b.src}" alt=""><span>${art[b.art]}</span></button>`).join('')}</div>`;
  }

  // --- Lebensweg auf der Karte ---------------------------------------------------------------------------
  lebensweg(box) {
    const p = this.p;
    const stationen = p.ereignisse.filter(e => e.ort?.lat != null);
    if (!stationen.length) { box.innerHTML = `<p class="leer-hinweis">${t('Für diese Person sind keine Orte mit Koordinaten erfasst.')}</p>`; return; }
    box.innerHTML = `<div class="kartenbox"><div id="karte"></div>
      <div class="karten-leiste"><button class="abspielen">${t('▶ Lebensweg abspielen')}</button><span class="station"></span>
        <label class="grenz-schalter" title="${t('Staatsgrenzen zur Zeit der gewählten Station')}"><input type="checkbox" class="grenzen-an"> <span class="grenz-jahr">${t('Historische Grenzen')}</span></label></div>
      <ol class="stationen">${stationen.map((e, n) => `<li data-n="${n}"><span class="nr">${n + 1}</span><b>${esc(e.datum || e.jahr || '?')}</b> ${esc(e.titel)} – ${esc(ortKurz(e.ort))}</li>`).join('')}</ol></div>`;
    const karte = L.map(box.querySelector('#karte'), { zoomControl: true, attributionControl: true });
    this.karte = karte;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      className: 'alte-karte',
    }).addTo(karte);
    const pts = stationen.map(e => [e.ort.lat, e.ort.lon]);
    // gleiche Orte leicht versetzen, damit alle Nummern sichtbar bleiben
    const gesehen = new Map();
    const marker = stationen.map((e, n) => {
      const key = pts[n].join(), k = gesehen.get(key) || 0;
      gesehen.set(key, k + 1);
      const icon = L.divIcon({ className: 'nr-marke', html: `<span>${n + 1}</span>`, iconSize: [24, 24], iconAnchor: [12 - k * 14, 12] });
      return L.marker(pts[n], { icon }).addTo(karte).bindPopup(`<b>${esc(e.titel)}</b><br>${esc(e.datum || '')}<br>${esc(e.ort.name)}`);
    });
    L.polyline(pts, { color: '#d6a24e', weight: 3, opacity: 0.85, dashArray: '6 6' }).addTo(karte);
    const grenzen = L.latLngBounds(pts);
    setTimeout(() => { karte.invalidateSize(); pts.length > 1 ? karte.fitBounds(grenzen.pad(0.3)) : karte.setView(pts[0], 9); }, 50);

    // Staatsgrenzen zur Zeit der Station (historical-basemaps von A. Ourednik, GPL-3.0), umschaltbar und im Browser gemerkt
    karte.attributionControl.addAttribution(t('Grenzen') + ': <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a>');
    const schalter = box.querySelector('.grenzen-an'), grenzText = box.querySelector('.grenz-jahr');
    let grenzSchicht = null, grenzSoll = null;
    try { schalter.checked = localStorage.getItem('lb-grenzen') !== '0'; } catch (e) { schalter.checked = true; }
    const zeigeGrenzen = async jahr => {
      const g = grenzJahr(jahr);
      grenzSoll = g;
      grenzText.textContent = schalter.checked && g ? t('Grenzen von {jahr}', { jahr: g }) : t('Historische Grenzen');
      if (!schalter.checked || !g) { grenzSchicht?.remove(); grenzSchicht = null; return; }
      const daten = await ladeGrenzen(g);
      if (!daten || grenzSoll !== g || this.karte !== karte || !schalter.checked) return;
      grenzSchicht?.remove();
      grenzSchicht = L.geoJSON(daten, {
        style: { color: '#8a3d1c', weight: 1.6, opacity: 0.85, dashArray: '5 4', fillColor: '#e8b04f', fillOpacity: 0.05 },
        onEachFeature: (f, schicht) => schicht.bindTooltip(f.properties.name, { sticky: true, className: 'grenz-name' }),
      }).addTo(karte);
    };
    let grenzStation = stationen[0].jahr ?? p.geburt ?? p.jahrE;
    schalter.addEventListener('change', () => {
      try { localStorage.setItem('lb-grenzen', schalter.checked ? '1' : '0'); } catch (e) { /* ohne Speicher */ }
      zeigeGrenzen(grenzStation);
    });
    zeigeGrenzen(grenzStation);

    const anzeige = box.querySelector('.station');
    const gehe = n => {
      const e = stationen[n];
      if (e.jahr != null) { grenzStation = e.jahr; zeigeGrenzen(e.jahr); }
      marker[n].openPopup();
      karte.flyTo(pts[n], Math.max(karte.getZoom(), 8), { duration: 0.8 });
      anzeige.textContent = `${e.datum || e.jahr || ''} · ${e.titel} · ${ortKurz(e.ort)}`;
      box.querySelectorAll('.stationen li').forEach((li, m) => li.classList.toggle('an', m === n));
    };
    box.querySelector('.stationen').onclick = ev => { const li = ev.target.closest('[data-n]'); if (li) gehe(+li.dataset.n); };
    box.querySelector('.abspielen').onclick = () => {
      clearInterval(this.spielt);
      let n = 0; gehe(0);
      this.spielt = setInterval(() => { n++; if (n >= stationen.length) { clearInterval(this.spielt); karte.flyToBounds(grenzen.pad(0.3)); return; } gehe(n); }, 2200);
    };
  }
}

// Historische Grenzen: der jüngste Stand bis zum Jahr (1905 → Grenzen von 1900); vor 1700 gibt es keine
const GRENZ_JAHRE = [1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2010];
const grenzCache = new Map();
function grenzJahr(j) {
  if (j == null || j < GRENZ_JAHRE[0]) return j == null ? null : GRENZ_JAHRE[0];
  return GRENZ_JAHRE.filter(g => g <= j).pop();
}
function ladeGrenzen(jahr) {
  if (!grenzCache.has(jahr)) {
    const url = LB.grenzen?.[jahr] ?? `data/grenzen/${jahr}.json`;
    grenzCache.set(jahr, fetch(url).then(r => r.ok ? r.json() : null).catch(() => null));
  }
  return grenzCache.get(jahr);
}

// Kartenausschnitt aus OSM-Kacheln (5 × 3) um einen Ort, sepia getönt
function kartenKachel(lat, lon, name, z = 8) {
  const n = 2 ** z, x = (lon + 180) / 360 * n * 256;
  const r = lat * Math.PI / 180, y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * 256;
  const tx = Math.floor(x / 256), ty = Math.floor(y / 256);
  let kacheln = '';
  for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++)
    kacheln += `<img src="https://tile.openstreetmap.org/${z}/${tx + i}/${ty + j}.png" style="left:${(i + 2) * 256}px;top:${(j + 1) * 256}px" alt="">`;
  const dx = x - (tx - 2) * 256, dy = y - (ty - 1) * 256;
  return `<div class="kachelkarte"><div class="kacheln" style="left:calc(50% - ${dx}px);top:calc(50% - ${dy}px)">${kacheln}</div>
    <div class="pin"></div><div class="ortsmarke">${esc(name)}</div><span class="osm">© OpenStreetMap</span></div>`;
}

function silhouette() {
  return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="38" r="18" fill="#3c4656"/><ellipse cx="50" cy="92" rx="34" ry="28" fill="#3c4656"/></svg>';
}

class Lightbox {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'lightbox';
    this.el.hidden = true;
    this.el.innerHTML = `<button class="lb-zu" aria-label="${t('Schließen')}">✕</button><button class="lb-zurueck" aria-label="${t('Zurück')}">‹</button>
      <figure><img alt=""><figcaption></figcaption></figure><button class="lb-vor" aria-label="${t('Weiter')}">›</button>`;
    document.body.appendChild(this.el);
    this.el.querySelector('.lb-zu').onclick = () => this.zu();
    this.el.querySelector('.lb-zurueck').onclick = () => this.gehe(-1);
    this.el.querySelector('.lb-vor').onclick = () => this.gehe(1);
    this.el.addEventListener('click', ev => { if (ev.target === this.el) this.zu(); });
    addEventListener('keydown', ev => {
      if (this.el.hidden) return;
      if (ev.key === 'Escape') { ev.preventDefault(); this.zu(); }
      if (ev.key === 'ArrowRight') this.gehe(1);
      if (ev.key === 'ArrowLeft') this.gehe(-1);
    });
  }
  zeige(bilder, n) { this.bilder = bilder; this.n = n; this.el.hidden = false; this.male(); }
  gehe(d) { this.n = (this.n + d + this.bilder.length) % this.bilder.length; this.male(); }
  male() {
    const b = this.bilder[this.n];
    this.el.querySelector('img').src = b.src;
    const titel = /\.(jpe?g|png|gif|tiff?|webp)$/i.test(b.titel) ? { foto: t('Foto'), urkunde: t('Dokument'), grab: t('Grab') }[b.art] : b.titel;
    this.el.querySelector('figcaption').textContent = `${titel} · ${this.n + 1} / ${this.bilder.length}`;
  }
  zu() { this.el.hidden = true; }
}
