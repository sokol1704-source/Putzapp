// Logik-Test: prüft Rechenregeln, bei denen Fehler nicht sofort auffallen
// (Terminplanung, Rechnungsnummern, Kassenbon-Erkennung, EÜR-Summen).
//
// Start wie beim Smoke-Test: App lokal ausliefern, dann `npm run test:logik`.

const { chromium, devices } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:8765/';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' })).newPage();
  const fehler = [];
  p.on('pageerror', (e) => fehler.push(e.message));
  await p.goto(BASE + '#/');
  await p.waitForTimeout(400);

  const ergebnisse = await p.evaluate(async () => {
    const out = [];
    const pruefe = (name, ist, soll) => out.push({ name, ok: JSON.stringify(ist) === JSON.stringify(soll), ist, soll });
    const wtag = (iso) => new Date(iso + 'T12:00:00').getDay();

    /* Terminplanung */
    const leer = { visits: [], appointments: [] };
    const basis = { aktiv: true, intervallTage: 14, aufgaben: [], wochentag: '' };
    pruefe('Haus ohne Einsatz und ohne Startdatum wird nicht geplant',
      planning({ ...leer, objects: [{ ...basis, id: 'a' }] }).length, 0);
    pruefe('Haus mit Startdatum: erster Termin am Startdatum',
      planning({ ...leer, objects: [{ ...basis, id: 'a', startdatum: '2030-03-04' }] })[0]?.datum, '2030-03-04');
    pruefe('Letzter Einsatz + 14 Tage',
      planning({ ...leer, objects: [{ ...basis, id: 'a' }], visits: [{ objektId: 'a', datum: '2030-03-01' }] })[0]?.datum, '2030-03-15');
    pruefe('Übersprungener Termin setzt den Zyklus neu',
      planning({ ...leer, objects: [{ ...basis, id: 'a', uebersprungen: ['2030-03-15'] }], visits: [{ objektId: 'a', datum: '2030-03-01' }] })[0]?.datum, '2030-03-29');
    pruefe('Nichts vor dem Startdatum planen',
      planning({ ...leer, objects: [{ ...basis, id: 'a', startdatum: '2030-06-01' }], visits: [{ objektId: 'a', datum: '2030-03-01' }] })[0]?.datum >= '2030-06-01', true);
    const mitTag = planning({ ...leer, objects: [{ ...basis, id: 'a', wochentag: 3 }], visits: [{ objektId: 'a', datum: '2030-03-01' }] })[0]?.datum;
    pruefe('Wochentag wird eingehalten (Mittwoch)', wtag(mitTag), 3);
    pruefe('Inaktives Haus wird nicht geplant',
      planning({ ...leer, objects: [{ ...basis, id: 'a', aktiv: false, startdatum: '2030-03-04' }] }).length, 0);
    pruefe('Offener Termin ersetzt die automatische Planung',
      planning({ objects: [{ ...basis, id: 'a', startdatum: '2030-03-04' }], visits: [], appointments: [{ id: 't', objektId: 'a', datum: '2030-03-10', erledigt: false }] }).map((i) => i.type), ['termin']);

    /* Rechnungsnummern */
    for (const s of DB.stores) await DB.clear(s);
    pruefe('Erste Nummer im Jahr', await nextNumber('invoices', 'RE', '2030-01-05'), 'RE-2030-001');
    pruefe('Startnummer aus den Einstellungen', await nextNumber('invoices', 'RE', '2030-01-05', 17), 'RE-2030-017');
    await DB.put('invoices', { nummer: 'RE-2030-001' });
    await DB.put('invoices', { nummer: 'RE-2030-002' });
    await DB.put('invoices', { nummer: 'RE-2029-045' });
    pruefe('Fortlaufend im selben Jahr', await nextNumber('invoices', 'RE', '2030-06-01'), 'RE-2030-003');
    pruefe('Neues Jahr beginnt wieder bei 001', await nextNumber('invoices', 'RE', '2031-01-02'), 'RE-2031-001');

    pruefe('Lücke in der Rechnungsnummer wird gefunden',
      nummernLuecken([{ nummer: 'RE-2026-001' }, { nummer: 'RE-2026-003' }, { nummer: 'RE-2026-004' }, { nummer: 'RE-2027-001' }]),
      [{ key: 'RE-2026', fehlend: [2] }]);
    pruefe('Lückenlose Nummern melden nichts', nummernLuecken([{ nummer: 'RE-2026-001' }, { nummer: 'RE-2026-002' }]), []);

    /* Abrechnungsart je Haus */
    pruefe('Standard-Abrechnung ist monatlich', zyklusOf({}), 'monat');
    pruefe('Jährlich nachträglich wird nicht monatlich abgerechnet', monatlichAbgerechnet({ vertrag: { zyklus: 'jahr' } }), false);
    pruefe('Im Voraus wird nicht monatlich abgerechnet', monatlichAbgerechnet({ vertrag: { zyklus: 'voraus' } }), false);

    /* Kassenbon */
    pruefe('Bon mit SUMME-Zeile', parseBon('REWE\nMilch 1,29\nPutzmittel 4,99\nSUMME EUR 6,28\n02.11.2026 10:15'), { betrag: 628, datum: '2026-11-02' });
    pruefe('Bon mit Tausenderpunkt und 2-stelligem Jahr', parseBon('Bauhaus\nHochdruckreiniger 1.249,00\nGesamt 1.249,00\n05.03.26'), { betrag: 124900, datum: '2026-03-05' });
    pruefe('Bon ohne Summe: größter Betrag', parseBon('Kiosk\n2,50\n3,80\n01.01.2027'), { betrag: 380, datum: '2027-01-01' });
    pruefe('Unsinniges Datum wird ignoriert', parseBon('Summe 1,00\n45.19.2026').datum, null);

    /* EÜR */
    for (const s of DB.stores) await DB.clear(s);
    S.steuerRuecklage = 25;
    await DB.put('invoices', { nummer: 'RE-2030-001', status: 'bezahlt', datum: '2030-12-20', bezahltAm: '2031-01-05', summe: 50000 });
    await DB.put('invoices', { nummer: 'RE-2030-002', status: 'bezahlt', datum: '2030-05-01', bezahltAm: '2030-05-10', summe: 30000 });
    await DB.put('invoices', { nummer: 'RE-2030-003', status: 'offen', datum: '2030-06-01', summe: 20000 });
    await DB.put('invoices', { nummer: 'RE-2030-004', status: 'storniert', datum: '2030-06-02', summe: 99900 });
    await DB.put('ausgaben', { datum: '2030-02-01', betrag: 10000, kategorie: 'Reinigungsmittel', privat: 0 });
    await DB.put('ausgaben', { datum: '2030-02-02', betrag: 20000, kategorie: 'Telefon & Internet', privat: 50 });
    await DB.put('ausgaben', { datum: '2030-02-03', betrag: 8000, kategorie: KFZ_KATEGORIE, privat: 0 });
    await DB.put('fahrten', { datum: '2030-03-01', km: 100 });
    const d = await financeData('2030');
    pruefe('Einnahmen nach Zahlungseingang (Dezember-Rechnung erst im Folgejahr)', d.sumE, 30000);
    pruefe('Ausgaben: privater Anteil abgezogen, Tanken nicht doppelt, km × 0,30 €', d.sumA, 10000 + 10000 + 3000);
    pruefe('Gewinn', d.gewinn, 30000 - 23000);
    pruefe('Steuer-Rücklage 25 %', d.ruecklage, 1750);
    pruefe('Umsatz ohne Storno (für Kleinunternehmergrenze)', d.umsatz, 50000 + 30000 + 20000);
    pruefe('Offene Rechnungen', d.offen, 20000);
    const d31 = await financeData('2031');
    pruefe('Dezember-Rechnung zählt im Jahr der Zahlung', d31.sumE, 50000);

    /* Ratenzahlung */
    const plan = ratenPlan(10001, 12, '2027-01-15');
    pruefe('Ratenplan: 12 Raten', plan.length, 12);
    pruefe('Ratenplan: Summe bleibt exakt', plan.reduce((s, r) => s + r.betrag, 0), 10001);
    pruefe('Ratenplan: letzte Rate nimmt den Cent-Rest auf', plan[11].betrag, Math.floor(10001 / 12) + (10001 - Math.floor(10001 / 12) * 12));
    pruefe('Ratenplan: erste und letzte Fälligkeit', [plan[0].faellig, plan[11].faellig], ['2027-01-15', '2027-12-15']);
    pruefe('Ratenplan: Monatsende wird geklemmt', ratenPlan(1200, 12, '2027-01-31')[1].faellig, '2027-02-28');
    const teil = { raten: plan.map((r, i) => ({ ...r, bezahltAm: i < 2 ? '2027-02-01' : null })) };
    pruefe('Teilzahlung: Rechnung bleibt offen, nächste Fälligkeit', [ratenStand(teil).status, ratenStand(teil).faellig], ['offen', '2027-03-15']);
    const voll = { raten: plan.map((r) => ({ ...r, bezahltAm: '2027-06-01' })) };
    pruefe('Alle Raten bezahlt: Rechnung bezahlt', ratenStand(voll).status, 'bezahlt');
    for (const s of DB.stores) await DB.clear(s);
    await DB.put('invoices', { nummer: 'RE-2030-010', status: 'offen', datum: '2030-01-01', faellig: '2030-02-01', summe: 1200, kunde: { name: 'R' }, raten: ratenPlan(1200, 12, '2030-02-01').map((r, i) => ({ ...r, bezahltAm: i < 3 ? '2030-03-0' + (i + 1) : (i === 3 ? '2031-01-05' : null) })) });
    const rd = await financeData('2030');
    pruefe('EÜR: jede bezahlte Rate zählt im Monat ihres Eingangs (3 Raten 2030)', rd.sumE, 300);
    pruefe('EÜR: Rate aus 2031 zählt nicht in 2030', rd.einnahmen.length, 3);
    pruefe('Offener Betrag = Summe der unbezahlten Raten', restBetrag({ raten: ratenPlan(1200, 12, '2030-02-01').map((r, i) => ({ ...r, bezahltAm: i < 3 ? 'x' : null })) }), 900);
    for (const s of DB.stores) await DB.clear(s);

    for (const s of DB.stores) await DB.clear(s);
    return out;
  });

  for (const e of ergebnisse) console.log(`${e.ok ? '✓' : '✗'} ${e.name}${e.ok ? '' : `\n    ist:  ${JSON.stringify(e.ist)}\n    soll: ${JSON.stringify(e.soll)}`}`);
  const falsch = ergebnisse.filter((e) => !e.ok).length;
  console.log(`\n${ergebnisse.length - falsch}/${ergebnisse.length} richtig${fehler.length ? `\nFehler: ${fehler.join(' | ')}` : ''}`);
  await b.close();
  process.exitCode = falsch || fehler.length ? 1 : 0;
})();
