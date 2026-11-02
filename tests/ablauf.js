// Ablauf-Test: legt über die echten Formulare Datensätze an, bearbeitet sie und prüft,
// ob sie in der Datenbank landen. Meldet JavaScript-Fehler und Formulare, die nicht speichern.
//
// Start wie beim Smoke-Test: App lokal ausliefern, dann `npm run test:ablauf`.

const { chromium, devices } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:8765/';

// Formular zum Neuanlegen → Datenbank-Speicher, in dem danach ein Eintrag mehr sein muss
const NEU = [
  ['/kunde/neu', 'customers'],
  ['/objekt/neu', 'objects'],
  ['/einsatz/neu', 'visits'],
  ['/termin/neu', 'appointments'],
  ['/mangel/neu', 'maengel'],
  ['/material/neu', 'material'],
  ['/ausgabe/neu', 'ausgaben'],
  ['/fahrt/neu', 'fahrten'],
  ['/akquise/neu', 'akquise'],
  ['/winter/neu', 'winter'],
  ['/angebot/neu', 'angebote'],
];

// Pflichtfelder sinnvoll füllen, die noch leer sind
async function pflichtfelderFuellen(p) {
  await p.evaluate(() => {
    const heute = new Date().toISOString().slice(0, 10);
    const form = [...document.querySelectorAll('main form, form')].find((f) => f.querySelector('[type=submit], button:not([type])'));
    if (!form) return;
    for (const el of form.querySelectorAll('input[required], select[required], textarea[required]')) {
      if (el.value) continue;
      if (el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.value);
        if (opt) el.value = opt.value;
      } else {
        el.value = { date: heute, time: '09:00', number: '1', email: 'test@example.com', tel: '0123456' }[el.type] || 'Test';
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

async function absenden(p) {
  return p.evaluate(() => {
    const form = [...document.querySelectorAll('main form, form')].find((f) => f.querySelector('[type=submit], button:not([type])'));
    if (!form) return 'kein Formular';
    const btn = form.querySelector('[type=submit], button:not([type])');
    form.requestSubmit(btn);
    return '';
  });
}

const anzahl = (p, store) => p.evaluate((s) => DB.all(s).then((r) => r.length), store);

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' })).newPage();
  const fehler = [];
  let seite = '';
  p.on('pageerror', (e) => fehler.push(`${seite}: ${e.message}`));
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'LÖSCHEN' : undefined));
  const report = [];
  const ok = [];
  const geh = async (hash) => { seite = hash; await p.goto(BASE + '#' + hash); await p.waitForTimeout(400); };

  await p.goto(BASE + '#/');
  await p.waitForTimeout(300);
  await p.evaluate(async () => {
    for (const s of DB.stores) await DB.clear(s);
    await DB.put('settings', { id: 'main', firma: 'PURE TOTH', inhaber: 'Tobias Toth', strasse: 'X 1', plzOrt: '67105 Schifferstadt', steuernummer: '1/2/3', iban: 'DE02120300000000202051', bank: 'Sparkasse', kalkV3: true, einfuehrung: true });
  });
  await p.reload();
  await p.waitForTimeout(300);

  // 1) Alle Neu-Formulare
  for (const [route, store] of NEU) {
    await geh(route);
    const vorher = await anzahl(p, store);
    // Haus ist beim Termin kein Pflichtfeld (Gespräch im Büro), für eine Reinigung aber nötig
    if (route === '/termin/neu') await p.evaluate(() => { const s = document.querySelector('select[name=objektId]'); s.value = [...s.options].find((o) => o.value).value; });
    await pflichtfelderFuellen(p);
    const msg = await absenden(p);
    await p.waitForTimeout(700);
    const nachher = await anzahl(p, store);
    if (msg) report.push(`${route}: ${msg}`);
    else if (nachher !== vorher + 1) report.push(`${route}: nicht gespeichert (${store}: ${vorher} → ${nachher}), Seite: ${await p.evaluate(() => location.hash)}`);
    else ok.push(`${route} gespeichert`);
  }

  // 2) Bearbeiten-Formulare ohne Änderung speichern: Anzahl gleich, keine Fehler
  const ids = await p.evaluate(async () => {
    const first = async (s) => (await DB.all(s))[0]?.id;
    return { kunde: await first('customers'), objekt: await first('objects'), einsatz: await first('visits'), mangel: await first('maengel'), winter: await first('winter') };
  });
  for (const [route, store] of [[`/kunde/${ids.kunde}/bearbeiten`, 'customers'], [`/objekt/${ids.objekt}/bearbeiten`, 'objects'], [`/einsatz/${ids.einsatz}/bearbeiten`, 'visits'], [`/mangel/${ids.mangel}/bearbeiten`, 'maengel'], [`/winter/${ids.winter}/bearbeiten`, 'winter']]) {
    if (route.includes('undefined')) { report.push(`${route}: kein Datensatz zum Bearbeiten`); continue; }
    await geh(route);
    const vorher = await anzahl(p, store);
    const msg = await absenden(p);
    await p.waitForTimeout(600);
    const nachher = await anzahl(p, store);
    if (msg || nachher !== vorher) report.push(`${route}: ${msg || `Anzahl geändert ${vorher} → ${nachher}`}`);
    else ok.push(`${route} gespeichert`);
  }

  // 3) Rechnung: Einsatz abrechnen, bezahlt, wieder offen, stornieren, löschen
  // Abrechnungsmonat = aktueller Monat, damit der heute erfasste Einsatz dabei ist
  const monat = new Date().toISOString().slice(0, 7);
  await geh(`/rechnung/neu?kunde=${ids.kunde}&monat=${monat}`);
  const rVorher = await anzahl(p, 'invoices');
  await pflichtfelderFuellen(p);
  await absenden(p);
  await p.waitForTimeout(800);
  const inv = await p.evaluate(async () => (await DB.all('invoices'))[0]);
  if (!inv || (await anzahl(p, 'invoices')) !== rVorher + 1) report.push(`/rechnung/neu: keine Rechnung erstellt, Seite ${await p.evaluate(() => location.hash)}`);
  else {
    ok.push(`Rechnung ${inv.nummer} erstellt über ${inv.summe / 100} €`);
    const einsatzVerknuepft = await p.evaluate(async (id) => (await DB.all('visits')).some((v) => v.rechnungId === id), inv.id);
    if (!einsatzVerknuepft) report.push('Rechnung: Einsatz nicht mit Rechnung verknüpft');
    await geh(`/rechnung/${inv.id}`);
    await p.click('#paid'); await p.waitForTimeout(500);
    const s1 = await p.evaluate(async (id) => (await DB.get('invoices', id)).status, inv.id);
    await p.click('#unpaid'); await p.waitForTimeout(400);
    const s2 = await p.evaluate(async (id) => (await DB.get('invoices', id)).status, inv.id);
    await p.click('#storno'); await p.waitForTimeout(500);
    const s3 = await p.evaluate(async (id) => (await DB.get('invoices', id)).status, inv.id);
    const frei = await p.evaluate(async (id) => !(await DB.all('visits')).some((v) => v.rechnungId === id), inv.id);
    if (`${s1},${s2},${s3}` !== 'bezahlt,offen,storniert' || !frei) report.push(`Rechnungsstatus falsch: ${s1},${s2},${s3}, Einsätze frei: ${frei}`);
    else ok.push('Rechnung bezahlt → offen → storniert, Einsätze wieder frei');
    await p.click('#loeschen'); await p.waitForTimeout(600);
    const weg = !(await p.evaluate(async (id) => DB.get('invoices', id), inv.id));
    if (!weg) report.push('Rechnung löschen: noch vorhanden');
    else ok.push('Rechnung gelöscht');
    // Nummer wird wieder vergeben
    await geh(`/rechnung/neu?kunde=${ids.kunde}&monat=${monat}`);
    await pflichtfelderFuellen(p);
    await absenden(p);
    await p.waitForTimeout(800);
    const neu = await p.evaluate(async () => (await DB.all('invoices'))[0]);
    if (neu?.nummer !== inv.nummer) report.push(`Nummer nach Löschen nicht wieder vergeben: ${inv.nummer} → ${neu?.nummer}`);
    else ok.push(`Nummer ${neu.nummer} nach Löschen wieder vergeben`);
  }

  // 4) Zusätzliche Arbeit: Rechnung über Leistungen
  await geh(`/objekt/${ids.objekt}/zusatz`);
  const zVorher = await anzahl(p, 'invoices');
  await p.fill('#zf input[name=m0]', '2');
  await p.click('#zSave'); await p.waitForTimeout(800);
  const zNeu = await p.evaluate(async () => (await DB.all('invoices')).sort((a, b) => b.nummer.localeCompare(a.nummer))[0]);
  if ((await anzahl(p, 'invoices')) !== zVorher + 1) report.push('Zusatzleistung: keine Rechnung erstellt');
  else ok.push(`Zusatzleistung abgerechnet: ${zNeu.nummer}, ${zNeu.summe / 100} €`);

  // 5) Mangel erledigen, Akquise gewonnen → Kunde
  await geh(`/mangel/${ids.mangel}`);
  const erledigtBtn = await p.$('#done');
  if (erledigtBtn) {
    await erledigtBtn.click(); await p.waitForTimeout(500);
    const st = await p.evaluate(async (id) => (await DB.get('maengel', id)).status, ids.mangel);
    if (st === 'offen') report.push('Mangel: Erledigt-Knopf ändert Status nicht'); else ok.push(`Mangel → ${st}`);
  } else report.push('Mangel: kein Erledigt-Knopf gefunden');

  const akq = await p.evaluate(async () => (await DB.all('akquise'))[0]?.id);
  await geh(`/akquise/${akq}`);
  const kVorher = await anzahl(p, 'customers');
  const gewonnen = await p.$('button:has-text("Gewonnen")');
  if (gewonnen) {
    await gewonnen.click(); await p.waitForTimeout(800);
    if ((await anzahl(p, 'customers')) !== kVorher + 1) report.push('Akquise gewonnen: kein Kunde angelegt'); else ok.push('Akquise gewonnen → Kunde angelegt');
  } else report.push('Akquise: kein Gewonnen-Knopf gefunden');

  // 6) Material: Bestand ändern und löschen
  const mat = await p.evaluate(async () => (await DB.all('material'))[0]?.id);
  await geh(`/material/${mat}`);
  await p.evaluate(() => { const f = document.querySelector('main form, form'); if (f.bestand) f.bestand.value = '7'; });
  await absenden(p); await p.waitForTimeout(500);
  const bestand = await p.evaluate(async (id) => (await DB.get('material', id))?.bestand, mat);
  if (Number(bestand) !== 7) report.push(`Material: Bestand nicht gespeichert (${bestand})`); else ok.push('Material-Bestand geändert');
  await geh(`/material/${mat}`);
  const del = await p.$('button:has-text("Löschen"), button:has-text("löschen")');
  if (del) {
    await del.click(); await p.waitForTimeout(500);
    if (await p.evaluate(async (id) => DB.get('material', id), mat)) report.push('Material: Löschen hat nicht gelöscht'); else ok.push('Material gelöscht');
  } else report.push('Material: kein Löschen-Knopf');

  // 7) Suche
  await geh('/suche');
  await p.fill('input[type=search]', 'Test');
  await p.waitForTimeout(500);
  const treffer = await p.evaluate(() => document.querySelectorAll('main a[href^="#/"]').length);
  if (!treffer) report.push('Suche nach „Test“ ohne Treffer'); else ok.push(`Suche: ${treffer} Treffer`);

  // 8) Einstellungen speichern
  await geh('/einstellungen');
  await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); const f = document.querySelector('#f'); f.telefon.value = '06235 1234'; f.requestSubmit(); });
  await p.waitForTimeout(500);
  const tel = await p.evaluate(async () => (await DB.get('settings', 'main')).telefon);
  if (tel !== '06235 1234') report.push(`Einstellungen: Telefon nicht gespeichert (${tel})`); else ok.push('Einstellungen gespeichert');

  // 9) Alle Seiten nach den Abläufen noch einmal öffnen (Daten aus echten Formularen)
  for (const r of ['/', '/termine', '/rechnungen', '/finanzen', '/buchhaltung', '/auswertung', '/monatsabschluss', '/nachweise', '/maengel', '/winter', '/tour', '/material', '/kunden', '/objekte', '/akquise', '/fotos', `/objekt/${ids.objekt}`, `/kunde/${ids.kunde}`, `/objekt/${ids.objekt}/nachweis`, `/objekt/${ids.objekt}/jahr`, `/winter/protokoll/${ids.objekt}`]) {
    await geh(r);
    const text = await p.evaluate(() => document.body.innerText);
    const ph = text.match(/.{0,30}(\bundefined\b|\bNaN\b|\[object).{0,20}/);
    if (ph) report.push(`${r}: Platzhalter „${ph[0]}“`);
  }

  // 10) PDFs: Rechnung, Vertrag, Zusatz-Katalog, Leistungsverzeichnis, Leistungsnachweis
  const rechnungId = await p.evaluate(async () => (await DB.all('invoices'))[0]?.id);
  const angebotId = await p.evaluate(async () => (await DB.all('angebote'))[0]?.id);
  for (const r of [`/rechnung/${rechnungId}`, `/angebot/${angebotId}`, `/objekt/${ids.objekt}/aushang`, `/objekt/${ids.objekt}/jahr`, `/objekt/${ids.objekt}/vertrag`, `/objekt/${ids.objekt}/zusatz`, '/leistungsverzeichnis', `/objekt/${ids.objekt}/nachweis`, `/winter/protokoll/${ids.objekt}`]) {
    await geh(r);
    const res = await p.evaluate(async () => {
      const doc = document.querySelector('.invoice-doc');
      if (!doc) return { fehler: 'kein Dokument auf der Seite' };
      try {
        const blob = await docToPdf(doc);
        const head = await blob.slice(0, 5).text();
        return { kb: Math.round(blob.size / 1024), head };
      } catch (e) { return { fehler: e.message }; }
    });
    if (res.fehler) report.push(`PDF ${r}: ${res.fehler}`);
    else if (res.head !== '%PDF-' || res.kb < 5) report.push(`PDF ${r}: ungültig (${res.head}, ${res.kb} KB)`);
    else ok.push(`PDF ${r}: ${res.kb} KB`);
  }

  // 11) Sicherung erstellen und wiederherstellen (mit Foto)
  const sicherung = await p.evaluate(async () => {
    const png = await (await fetch('icons/icon-192.png')).blob();
    await DB.put('photos', { id: 'testfoto', visitId: (await DB.all('visits'))[0].id, typ: 'vorher', blob: png });
    const vorher = Object.fromEntries(await Promise.all(DB.stores.map(async (s) => [s, (await DB.all(s)).length])));
    const json = await buildBackupJson();
    for (const s of DB.stores) await DB.clear(s);
    await importBackup(new File([json], 'sicherung.json', { type: 'application/json' }));
    const nachher = Object.fromEntries(await Promise.all(DB.stores.map(async (s) => [s, (await DB.all(s)).length])));
    const foto = await DB.get('photos', 'testfoto');
    return { vorher, nachher, fotoOk: foto?.blob instanceof Blob && foto.blob.size === png.size, mb: (json.length / 1e6).toFixed(2) };
  });
  const abw = Object.keys(sicherung.vorher).filter((s) => sicherung.vorher[s] !== sicherung.nachher[s]);
  if (abw.length || !sicherung.fotoOk) report.push(`Sicherung: abweichend ${abw.map((s) => `${s} ${sicherung.vorher[s]}→${sicherung.nachher[s]}`).join(', ')} Foto ok: ${sicherung.fotoOk}`);
  else ok.push(`Sicherung + Wiederherstellung: alle ${Object.keys(sicherung.vorher).length} Bereiche gleich, Foto intakt (${sicherung.mb} MB)`);

  console.log('OK:\n  ' + ok.join('\n  '));
  console.log(report.length || fehler.length ? `\nPROBLEME:\n  ${[...report, ...fehler].join('\n  ')}` : '\nalles ok');
  await b.close();
  process.exitCode = report.length || fehler.length ? 1 : 0;
})();
