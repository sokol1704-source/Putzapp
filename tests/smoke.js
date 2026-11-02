// Smoke-Test: öffnet alle Seiten der App mit Testdaten und meldet JavaScript-Fehler,
// leere Seiten, sichtbare Platzhalter („undefined“, „NaN“, „[object …]“) und
// Detailseiten, die still auf eine andere Seite umleiten (falsche oder fehlende ID).
//
// Start: zuerst die App lokal ausliefern (z. B. `python3 -m http.server 8765` im Projektordner),
// dann `npm run test:smoke`. Benötigt Playwright mit Chromium (im Cloud-Container vorinstalliert).
// Optional: APP_URL=http://localhost:8765/ npm run test:smoke

const { chromium, devices } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:8765/';
const ROUTES = [
  '/', '/abwesenheit', '/angebot/:id', '/angebot/neu', '/angebote', '/ausgabe/:id', '/ausgabe/neu', '/ausgaben',
  '/auswertung', '/bestaetigen', '/buchhaltung', '/buchhaltung/tipps', '/einsaetze', '/einsatz/:id', '/einsatz/:id/bearbeiten', '/einsatz/neu',
  '/einstellungen', '/fahrt/:id', '/fahrt/neu', '/fahrten', '/finanzen', '/gruendung', '/kunde/:id', '/kunde/:id/bearbeiten',
  '/kunde/neu', '/kunden', '/leistungen', '/maengel', '/mangel/:id', '/mangel/:id/bearbeiten', '/mangel/neu', '/material',
  '/material/:id', '/material/neu', '/mehr', '/monatsabschluss', '/nachweise', '/objekt/:id', '/objekt/:id/aushang',
  '/objekt/:id/bearbeiten', '/objekt/:id/jahr', '/objekt/:id/nachweis', '/objekt/:id/plan', '/objekt/:id/vertrag', '/objekt/:id/zusatz', '/leistungsverzeichnis',
  '/objekt/neu', '/objekte', '/preise', '/preise/schreiben/:kid', '/rechnung/:id', '/rechnung/neu', '/rechnungen',
  '/suche', '/fotos', '/akquise', '/akquise/:id', '/akquise/neu', '/termin/:id', '/termin/neu', '/termine', '/tour', '/winter', '/winter/:id', '/winter/:id/bearbeiten',
  '/winter/neu', '/winter/protokoll/:id',
];

// Welche ID gehört in welche Detailseite (erstes Pfadstück → Schlüssel aus seed())
const ID_FUER = {
  angebot: 'a', ausgabe: 'aus', einsatz: 'v', fahrt: 'f', kunde: 'k', mangel: 'mg', material: 'mat',
  objekt: 'o', rechnung: 'inv', akquise: 'akq', termin: 'm', winter: 'w',
};
const urlFuer = (route, ids) => {
  const teil = route.split('/')[1];
  const id = route === '/winter/protokoll/:id' ? ids.o : ids[ID_FUER[teil]];
  return route.replace(':id', id).replace(':kid', ids.k);
};

// Testdaten: ein Auftraggeber mit Haus, Einsatz, Rechnung, Angebot, Mangel, Termin, Material, Ausgabe, Fahrt, Winterdienst und Interessent
async function seed(p) {
  return p.evaluate(async () => {
    for (const s of DB.stores) await DB.clear(s);
    const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    await DB.put('settings', { id: 'main', firma: 'PURE TOTH', inhaber: 'Tobias Toth', strasse: 'X 1', plzOrt: '1 A', steuernummer: '1/2/3', iban: 'DE02120300000000202051', bank: 'Sparkasse', kalkV3: true, einfuehrung: true });
    const k = await DB.put('customers', { name: 'Hausverwaltung Test', ansprechpartner: 'Frau Meier', strasse: 'A 1', plzOrt: '1 B', privat: false, notizen: '' });
    const o = await DB.put('objects', { kundeId: k.id, name: '', strasse: 'Musterweg 5', plzOrt: '12345 Musterstadt', etagen: 3, eingaenge: 1, aufzug: false, abrechnung: 'monat', monatspauschale: 25000, stundensatz: 2500, aufgaben: [{ text: 'Treppenaufgang', alleTage: 14 }], aktiv: true, winterAbrechnung: 'einsatz', winterPreis: 2500, fotoPflicht: 2, uhrzeit: '09:00', wochentag: 6, intervallTage: 14, vorOrtName: 'Hausmeister', zugang: 'Schlüsselbox 1234', neuerPreis: { ab: d(40), betrag: 27000, alt: 25000 } });
    const v = await DB.put('visits', { objektId: o.id, kundeId: k.id, datum: d(-7), von: '09:00', bis: '11:00', stunden: 2, aufgaben: [{ text: 'Treppenaufgang', erledigt: true }], extras: [], rechnungId: null, notiz: 'ok' });
    const inv = await DB.put('invoices', { nummer: 'RE-2026-001', kundeId: k.id, kunde: { name: 'Hausverwaltung Test', ansprechpartner: 'Frau Meier', strasse: 'A 1', plzOrt: '1 B' }, absender: { firma: 'PURE TOTH', inhaber: 'Tobias Toth', strasse: 'X 1', plzOrt: '1 A', steuernummer: '1/2/3', iban: 'DE02120300000000202051', bank: 'Sparkasse' }, datum: d(-30), faellig: d(-16), summe: 25000, netto: 25000, arbeitskosten: 25000, positionen: [{ beschreibung: 'Reinigung', menge: 1, einheit: 'Monat', preis: 25000, betrag: 25000, art: 'arbeit' }], status: 'offen', objekte: [{ id: o.id, name: 'Musterweg 5' }], zeitraum: '2026-09', mahnstufe: 1 });
    const a = await DB.put('angebote', { nummer: 'AN-1', datum: d(-20), status: 'offen', objektId: o.id, kundeId: k.id, monatspreis: 25000, empfaenger: { name: 'Hausverwaltung Test', ansprechpartner: 'Frau Meier', strasse: 'A 1', plzOrt: '1 B' }, objekt: { strasse: 'Musterweg 5', plzOrt: '12345', etagen: 3, eingaenge: 1, aufzug: false }, absender: { inhaber: 'T', firma: 'F' }, leistungen: ['Treppenaufgang'], positionen: [{ beschreibung: 'x', menge: 1, einheit: 'Monat', preis: 25000, art: 'arbeit' }], km: 2, zusatz: [], intervallTage: 14 });
    const mg = await DB.put('maengel', { objektId: o.id, datum: d(-20), ort: 'EG', text: 'Lampe defekt', dringend: true, status: 'offen' });
    const ap = await DB.put('appointments', { kundeId: k.id, objektId: o.id, datum: d(2), uhrzeit: '10:00', typ: 'besichtigung', erledigt: false, aufgaben: [], notiz: '', dauer: 60, fahrzeit: 20, ort: '' });
    const mat = await DB.put('material', { name: 'Eimer', bestand: 1, mindest: 2, einheit: 'Stk.', kategorie: 'Werkzeug & Geräte', notiz: '' });
    const aus = await DB.put('ausgaben', { beschreibung: 'Putzmittel', kategorie: 'Material', betrag: 1200, datum: d(-3), privat: 0 });
    const f = await DB.put('fahrten', { datum: d(-3), km: 12, zweck: 'Anfahrt', objektIds: [o.id], von: '', nach: '' });
    const w = await DB.put('winter', { objektId: o.id, datum: d(-2), von: '06:00', bis: '06:45', wetter: 'Schnee', temperatur: '-2', massnahmen: ['Geräumt', 'Gestreut'], flaechen: ['Gehweg'], streumittel: 'Splitt', notiz: '', rechnungId: null });
    const akq = await DB.put('akquise', { name: 'Verwaltung Schmidt', ansprechpartner: 'Herr Schmidt', ort: 'Speyer', telefon: '0123', email: '', status: 'neu', letzterKontakt: d(-20), notiz: '', erstellt: d(-30) });
    return { k: k.id, o: o.id, v: v.id, inv: inv.id, a: a.id, m: ap.id, mg: mg.id, mat: mat.id, aus: aus.id, f: f.id, w: w.id, akq: akq.id };
  });
}

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' })).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + '#/');
  await p.waitForTimeout(300);
  const ids = await seed(p);
  await p.reload(); // Einstellungen neu laden (Einführung aus)
  await p.waitForTimeout(300);

  const report = [];
  for (const route of ROUTES) {
    const ziel = urlFuer(route, ids);
    const errs = [];
    const onErr = (e) => errs.push(e.message);
    p.on('pageerror', onErr);
    await p.goto(BASE + '#' + ziel);
    await p.waitForTimeout(350);
    const [text, hash] = await p.evaluate(() => [document.body.innerText || '', location.hash]);
    p.off('pageerror', onErr);

    const bad = [];
    if (text.trim().length < 40) bad.push('fast leer');
    const platzhalter = text.match(/.{0,30}(\bundefined\b|\bNaN\b|\[object).{0,20}/);
    if (platzhalter) bad.push('Platzhalter im Text: ' + platzhalter[0]);
    if (route.includes(':') && hash.split('?')[0] !== '#' + ziel) bad.push(`umgeleitet nach ${hash}`);
    if (errs.length) bad.push('Fehler: ' + errs.join(' | '));
    if (bad.length) report.push(`${route} → ${bad.join(' ; ')}`);
  }

  console.log(report.length ? report.join('\n') : 'alles ok');
  console.log(`geprüft: ${ROUTES.length} Seiten`);
  await b.close();
  process.exitCode = report.length ? 1 : 0;
})();
