'use strict';

const KATEGORIEN = ['Reinigungsmittel', 'Streumittel', 'Arbeitsmaterial & Geräte', 'Arbeitskleidung', 'Fahrzeug (Tanken, Werkstatt)', 'Computer, Handy & Software', 'Büromaterial & Porto', 'Telefon & Internet', 'Versicherungen', 'Werbung', 'Sonstiges'];
// Nur der berufliche Anteil zählt (z. B. Laptop zu 50 % privat genutzt)
const betrieblich = (a) => Math.round((a.betrag * (100 - (Number(a.privat) || 0))) / 100);
// Positionen der Anlage EÜR (Bezeichnungen des Formulars). Zeilennummern bitte im ELSTER-Formular des Steuerjahres prüfen.
const EUER_POSITION = {
  'Reinigungsmittel': 'Material & Hilfsstoffe', 'Streumittel': 'Material & Hilfsstoffe',
  'Arbeitsmaterial & Geräte': 'Sonstige Betriebsausgaben', 'Arbeitskleidung': 'Sonstige Betriebsausgaben',
  'Fahrzeug (Tanken, Werkstatt)': 'Kfz-Kosten', 'Computer, Handy & Software': 'Sonstige Betriebsausgaben',
  'Büromaterial & Porto': 'Büromaterial & Porto', 'Telefon & Internet': 'Telefon & Internet',
  'Versicherungen': 'Versicherungsbeiträge', 'Werbung': 'Werbekosten', 'Sonstiges': 'Sonstige Betriebsausgaben',
};
// Summen je Position: Betriebseinnahmen, Betriebsausgaben (inkl. Fahrtkosten-Pauschale)
const euerPositionen = (d) => {
  const ausgaben = {};
  d.aus.forEach((a) => { const p = EUER_POSITION[a.kategorie] || 'Sonstige Betriebsausgaben'; ausgaben[p] = (ausgaben[p] || 0) + betrieblich(a); });
  if (d.fahrtkosten) ausgaben['Fahrtkosten (0,30 € je km)'] = d.fahrtkosten;
  return { einnahmen: d.sumE, ausgaben: Object.entries(ausgaben).sort((a, b) => b[1] - a[1]), sumA: d.sumA, gewinn: d.gewinn, kfz: d.byKat['Fahrzeug (Tanken, Werkstatt)'] || 0 };
};

// Was im Fahrtenbuch noch fehlt (Finanzamt verlangt Datum, km-Stand, Strecke, Zweck und Ziel)
const fahrtMaengel = (f) => {
  const m = [];
  if (!f.datum) m.push('Datum fehlt');
  const start = num(f.kmStart);
  const ende = num(f.kmEnde);
  if (!f.kmStart || !f.kmEnde) m.push('km-Stand fehlt');
  else if (ende < start) m.push('km-Stand Ende ist kleiner als Start');
  else if (num(f.km) !== ende - start) m.push('Strecke passt nicht zum km-Stand');
  if (!num(f.km)) m.push('Strecke fehlt');
  if (!String(f.zweck || '').trim()) m.push('Zweck fehlt');
  if (!String(f.ziel || '').trim() && !f.objektIds?.length) m.push('Ziel fehlt');
  return m;
};
function steuerHinweis(kategorie, betrag) {
  if (kategorie === 'Computer, Handy & Software') return '💻 Computer, Zubehör und Software sind im Kaufjahr komplett absetzbar (Nutzungsdauer 1 Jahr).';
  if (betrag > 80000 && /Geräte|Fahrzeug|Sonstiges/.test(kategorie)) return '📆 Über 800 €: wird in der Regel über mehrere Jahre abgeschrieben – kurz mit dem Steuerbüro klären.';
  if (betrag > 0 && betrag <= 80000 && /Geräte/.test(kategorie)) return '✓ Bis 800 € (brutto, da Kleinunternehmer) sofort voll absetzbar.';
  return '';
}
const yearOf = (d) => (d || '').slice(0, 4);
const yearSeg = (base, jahr, years) => `<div class="seg">${years.map((y) => `<a href="${base}?jahr=${y}" class="${String(y) === String(jahr) ? 'active' : ''}">${y}</a>`).join('')}</div>`;
const lastYears = () => { const y = new Date().getFullYear(); return [y - 2, y - 1, y]; };

/* ---------- Ausgaben ---------- */
route('/ausgaben', async (_, q) => {
  const jahr = q.jahr || String(new Date().getFullYear());
  const list = (await DB.all('ausgaben')).filter((a) => yearOf(a.datum) === jahr).sort((a, b) => b.datum.localeCompare(a.datum));
  const sum = list.reduce((s, a) => s + a.betrag, 0);
  const months = [...new Set(list.map((a) => a.datum.slice(0, 7)))];
  render('Ausgaben', `
    <a class="btn block" href="#/ausgabe/neu">+ Ausgabe mit Beleg erfassen</a>
    <div class="mt">${yearSeg('#/ausgaben', jahr, lastYears())}</div>
    <div class="card mt"><div class="row between"><span>Ausgaben ${jahr}</span><b data-count="${sum}" data-money>${money(sum)}</b></div></div>
    ${months.map((m) => {
      const items = list.filter((a) => a.datum.startsWith(m));
      return `<h3 class="section">${esc(monthLabel(m))} · ${money(items.reduce((s, a) => s + a.betrag, 0))}</h3>${items.map((a) => `<a class="card link" href="#/ausgabe/${a.id}">
        <div class="row between"><b>${esc(a.beschreibung || a.kategorie)}</b><b>${money(betrieblich(a))}</b></div>
        <div class="muted small">${fmtDate(a.datum)} · ${esc(a.kategorie)}${a.privat ? ` · ${a.privat} % privat (von ${money(a.betrag)})` : ''}${a.fotoAnzahl ? ' · 🧾 Beleg' : ' · <span class="danger-text">kein Beleg</span>'}</div></a>`).join('')}`;
    }).join('') || '<div class="empty">Noch keine Ausgaben.<br><span class="small">Putzmittel, Streusalz, Werkzeug … mit Foto vom Kassenzettel erfassen.</span></div>'}
  `);
});

route('/ausgabe/neu', () => ausgabeForm(null));
route('/ausgabe/:id', async ({ id }) => ausgabeForm(await DB.get('ausgaben', id)));

async function ausgabeForm(a) {
  const isNew = !a;
  a = a || { id: DB.uid(), datum: today(), betrag: 0, kategorie: KATEGORIEN[0], beschreibung: '', zahlung: 'Karte' };
  const existing = isNew ? [] : await DB.by('photos', 'visitId', a.id);
  const pending = [];
  render(isNew ? 'Neue Ausgabe' : 'Ausgabe', `
    <form id="f" class="form">
      <div class="label">Beleg fotografieren</div>
      <div id="photos"></div>
      <div class="grid2">
        <label>Betrag (€) *<input name="betrag" type="number" step="0.01" min="0" inputmode="decimal" required value="${centsInput(a.betrag)}"></label>
        <label>Datum<input type="date" name="datum" value="${esc(a.datum)}"></label>
      </div>
      <label>Kategorie<select name="kategorie">${KATEGORIEN.map((k) => `<option ${k === a.kategorie ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Was / wo gekauft?<input name="beschreibung" value="${esc(a.beschreibung)}" placeholder="z. B. Bodenreiniger, Mikrofasertücher – Großhandel"></label>
      <label>Privater Anteil <span class="muted small">(z. B. Laptop oder Handy auch privat genutzt)</span><select name="privat">${[0, 10, 20, 25, 30, 40, 50, 60, 70, 75].map((pct) => `<option value="${pct}" ${Number(a.privat || 0) === pct ? 'selected' : ''}>${pct ? `${pct} % privat – ${100 - pct} % absetzbar` : 'rein beruflich – 100 % absetzbar'}</option>`).join('')}</select></label>
      <div class="card ok-note small" id="steuerHint" hidden></div>
      <label>Bezahlt mit<select name="zahlung">${['Karte', 'Bar', 'Überweisung', 'PayPal'].map((z) => `<option ${z === a.zahlung ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
      <p class="muted small">Tipp: Fährst du mit dem eigenen Auto, trage die Kilometer im Fahrtenbuch ein (0,30 €/km) – dann Tankquittungen nicht zusätzlich als Ausgabe erfassen.</p>
      <button class="btn block" type="submit" id="save">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Löschen</button>'}
    </form>
  `);
  photoEditor($('#photos'), existing, pending, [['beleg', 'Beleg']]);
  const hint = () => {
    const f = $('#f');
    const t = steuerHinweis(f.kategorie.value, toCents(f.betrag.value));
    $('#steuerHint').hidden = !t;
    $('#steuerHint').textContent = t;
  };
  $('#f').addEventListener('input', hint);
  $('#f').addEventListener('change', hint);
  hint();
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.assign(a, { betrag: toCents(fd.get('betrag')), datum: fd.get('datum'), kategorie: fd.get('kategorie'), beschreibung: fd.get('beschreibung').trim(), zahlung: fd.get('zahlung'), privat: Number(fd.get('privat')) || 0 });
    if (!a.betrag) return alert('Bitte einen Betrag eintragen.');
    $('#save').disabled = true;
    await savePhotos(a.id, pending);
    a.fotoAnzahl = existing.length + pending.length;
    await DB.put('ausgaben', a);
    toast('✓ Ausgabe gespeichert');
    go('#/ausgaben', true);
  });
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Ausgabe inkl. Beleg löschen?')) return;
    await deletePhotos(a.id);
    await DB.del('ausgaben', a.id);
    go('#/ausgaben', true);
  });
}

/* ---------- Fahrtenbuch ---------- */
route('/fahrten', async (_, q) => {
  const jahr = q.jahr || String(new Date().getFullYear());
  const [all, objects] = await Promise.all([DB.all('fahrten'), DB.all('objects')]);
  const omap = Object.fromEntries(objects.map((o) => [o.id, o]));
  const list = all.filter((f) => yearOf(f.datum) === jahr).sort((a, b) => b.datum.localeCompare(a.datum));
  const km = list.reduce((s, f) => s + num(f.km), 0);
  render('Fahrtenbuch', `
    <a class="btn block" href="#/fahrt/neu">+ Fahrt eintragen</a>
    <div class="mt">${yearSeg('#/fahrten', jahr, lastYears())}</div>
    <div class="stats mt">
      <div class="stat"><b data-count="${Math.round(km)}">${fmtNum(km)}</b><span>km in ${jahr}</span></div>
      <div class="stat"><b data-count="${Math.round(km * KM_SATZ)}" data-money>${money(Math.round(km * KM_SATZ))}</b><span>absetzbar (0,30 €/km)</span></div>
    </div>
    ${list.some((f) => fahrtMaengel(f).length) ? `<div class="card hint mt">⚠️ <b>${list.filter((f) => fahrtMaengel(f).length).length} von ${list.length} Fahrten sind unvollständig.</b> Das Finanzamt verlangt Datum, km-Stand, Strecke, Zweck und Ziel.</div>` : (list.length ? `<div class="card ok-note mt">✓ Alle ${list.length} Fahrten in ${jahr} sind vollständig.</div>` : '')}
    <div class="mt">${list.map((f) => `<a class="card link" href="#/fahrt/${f.id}">
      <div class="row between"><b>${fmtDateLong(f.datum)}</b><b>${fmtNum(f.km)} km</b></div>
      <div class="muted small">${esc(f.zweck)}${f.objektIds?.length ? ` · 🏢 ${esc(f.objektIds.map((id) => objLabel(omap[id])).join(', '))}` : f.ziel ? ` · ${esc(f.ziel)}` : ''}</div>${fahrtMaengel(f).length ? `<div class="danger-text small">⚠️ ${esc(fahrtMaengel(f).join(' · '))}</div>` : ''}</a>`).join('') || '<div class="empty">Noch keine Fahrten.<br><span class="small">Tipp: In der Tagestour mit einem Tipp eintragen.</span></div>'}</div>
  `);
});

route('/fahrt/neu', (_, q) => fahrtForm(null, q));
route('/fahrt/:id', async ({ id }) => fahrtForm(await DB.get('fahrten', id), {}));

async function fahrtForm(f, q) {
  const objects = (await DB.all('objects')).filter((o) => o.aktiv !== false || f?.objektIds?.includes(o.id)).sort((a, b) => objLabel(a).localeCompare(objLabel(b), 'de'));
  const isNew = !f;
  const pre = (q.objekte || '').split(',').filter(Boolean);
  f = f || { datum: q.datum || today(), km: q.km || '', kmStart: '', kmEnde: '', zweck: pre.length ? 'Reinigungstour' : '', objektIds: pre };
  render(isNew ? 'Fahrt eintragen' : 'Fahrt', `
    <form id="f" class="form">
      <label>Datum<input type="date" name="datum" value="${esc(f.datum)}"></label>
      <div class="grid3">
        <label>km-Stand Start<input name="kmStart" type="number" inputmode="numeric" value="${esc(f.kmStart)}"></label>
        <label>km-Stand Ende<input name="kmEnde" type="number" inputmode="numeric" value="${esc(f.kmEnde)}"></label>
        <label>Gefahren (km) *<input name="km" type="number" step="0.1" min="0" inputmode="decimal" required value="${esc(f.km)}"></label>
      </div>
      <label>Zweck<input name="zweck" value="${esc(f.zweck)}" placeholder="z. B. Reinigungstour, Einkauf Großhandel"></label>
      <label>Ziel, wenn kein Haus <span class="muted small">(z. B. Großhandel, Lager)</span><input name="ziel" value="${esc(f.ziel || '')}"></label>
      <div class="label">Angefahrene Häuser</div>
      <div class="chip-row">${objects.map((o) => `<label class="chip toggle ${f.objektIds.includes(o.id) ? 'on' : ''}"><input type="checkbox" name="objektIds" value="${o.id}" ${f.objektIds.includes(o.id) ? 'checked' : ''} hidden>🏢 ${esc(objLabel(o))}</label>`).join('') || '<span class="muted small">Noch keine Häuser.</span>'}</div>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Löschen</button>'}
    </form>
  `);
  const form = $('#f');
  const calc = () => { if (form.kmStart.value && form.kmEnde.value) form.km.value = Math.max(0, Number(form.kmEnde.value) - Number(form.kmStart.value)); };
  form.kmStart.addEventListener('input', calc);
  form.kmEnde.addEventListener('input', calc);
  form.addEventListener('change', (e) => { const chip = e.target.closest('.chip'); if (chip) chip.classList.toggle('on', e.target.checked); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    Object.assign(f, { datum: fd.get('datum'), kmStart: fd.get('kmStart'), kmEnde: fd.get('kmEnde'), km: num(fd.get('km')), zweck: fd.get('zweck').trim() || 'Betriebliche Fahrt', ziel: fd.get('ziel').trim(), objektIds: fd.getAll('objektIds') });
    await DB.put('fahrten', f);
    toast(`🚗 ${fmtNum(f.km)} km eingetragen`);
    go('#/fahrten', true);
  });
  $('#del')?.addEventListener('click', async () => { if (confirm('Fahrt löschen?')) { await DB.del('fahrten', f.id); go('#/fahrten', true); } });
}

/* ---------- Finanzen / EÜR ---------- */
async function financeData(jahr) {
  const [invoices, ausgaben, fahrten] = await Promise.all([DB.all('invoices'), DB.all('ausgaben'), DB.all('fahrten')]);
  // Einnahmen zählen bei der EÜR, wenn das Geld da ist (Zuflussprinzip)
  const einnahmen = invoices.filter((i) => i.status === 'bezahlt' && yearOf(i.bezahltAm || i.datum) === jahr).sort((a, b) => (a.bezahltAm || a.datum).localeCompare(b.bezahltAm || b.datum));
  const aus = ausgaben.filter((a) => yearOf(a.datum) === jahr).sort((a, b) => a.datum.localeCompare(b.datum));
  const fa = fahrten.filter((f) => yearOf(f.datum) === jahr).sort((a, b) => a.datum.localeCompare(b.datum));
  const km = fa.reduce((s, f) => s + num(f.km), 0);
  const fahrtkosten = Math.round(km * KM_SATZ);
  const sumE = einnahmen.reduce((s, i) => s + i.summe, 0);
  const byKat = {};
  aus.forEach((a) => { byKat[a.kategorie] = (byKat[a.kategorie] || 0) + betrieblich(a); });
  const sumA = aus.reduce((s, a) => s + betrieblich(a), 0) + fahrtkosten;
  const offen = invoices.filter((i) => i.status === 'offen').reduce((s, i) => s + i.summe, 0);
  const umsatz = invoices.filter((i) => i.status !== 'storniert' && yearOf(i.datum) === jahr).reduce((s, i) => s + i.summe, 0);
  const gewinn = sumE - sumA;
  const ruecklage = Math.max(0, Math.round((gewinn * (S.steuerRuecklage ?? 25)) / 100));
  return { einnahmen, aus, fa, km, fahrtkosten, sumE, sumA, byKat, gewinn, ruecklage, offen, umsatz };
}

route('/finanzen', async (_, q) => {
  const jahr = q.jahr || String(new Date().getFullYear());
  const d = await financeData(jahr);
  const kats = Object.entries(d.byKat).sort((a, b) => b[1] - a[1]);
  render('Finanzen', `
    ${yearSeg('#/finanzen', jahr, lastYears())}
    <div class="card profit mt">
      <div class="muted small">Gewinn ${jahr} (vorläufig)</div>
      <div class="profit-value ${d.gewinn < 0 ? 'neg' : ''}" ${d.gewinn > 0 ? `data-count="${d.gewinn}" data-money` : ''}>${money(d.gewinn)}</div>
      <div class="row between small"><span>Einnahmen (bezahlt)</span><b>${money(d.sumE)}</b></div>
      <div class="row between small"><span>Ausgaben inkl. Fahrten</span><b>− ${money(d.sumA)}</b></div>
      ${d.offen ? `<div class="row between small muted"><span>Noch offen (nicht im Gewinn)</span><span>${money(d.offen)}</span></div>` : ''}
    </div>
    <div class="card mt">
      <div class="row between"><b>🏦 Steuer-Rücklage</b><b>${money(d.ruecklage)}</b></div>
      <div class="muted small">${S.steuerRuecklage ?? 25} % vom Gewinn ${jahr} – das ist ein Richtwert, keine Steuerberechnung. Pro Monat ca. ${money(Math.round(d.ruecklage / 12))} zur Seite legen. Den Satz änderst du in den Einstellungen.</div>
    </div>
    <h3 class="section">Ausgaben nach Kategorie</h3>
    <div class="card">
      ${kats.map(([k, v]) => `<div class="row between small"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join('')}
      <div class="row between small"><span>Fahrten (${fmtNum(d.km)} km × 0,30 €)</span><b>${money(d.fahrtkosten)}</b></div>
      ${!kats.length && !d.km ? '<div class="muted small">Noch keine Ausgaben erfasst.</div>' : ''}
    </div>
    <div class="quick">
      <a class="btn ghost" href="#/ausgabe/neu">🧾 Ausgabe</a>
      <a class="btn ghost" href="#/fahrt/neu">🚗 Fahrt</a>
      <a class="btn ghost" href="#/auswertung?jahr=${jahr}">📊 Auswertung</a>
    </div>
    <h3 class="section">Für die Anlage EÜR in ELSTER</h3>
    <div class="card">
      <div class="row between small"><span>Betriebseinnahmen</span><b>${money(euerPositionen(d).einnahmen)}</b></div>
      ${euerPositionen(d).ausgaben.map(([name, v]) => `<div class="row between small"><span>${esc(name)}</span><b>${money(v)}</b></div>`).join('') || '<div class="muted small">Noch keine Ausgaben in diesem Jahr.</div>'}
      <div class="row between small"><b>Summe Betriebsausgaben</b><b>${money(euerPositionen(d).sumA)}</b></div>
      <div class="row between small"><b>Gewinn</b><b>${money(euerPositionen(d).gewinn)}</b></div>
      ${euerPositionen(d).kfz ? `<p class="danger-text small mt">⚠️ Fahrzeug-Kosten (${money(euerPositionen(d).kfz)}) sind mit der Kilometerpauschale von 0,30 € schon abgegolten. Bitte nicht zusätzlich eintragen – kläre das mit dem Finanzamt, bevor du die Erklärung abgibst.</p>` : ''}
      <p class="muted small">Die Namen entsprechen den Positionen der Anlage EÜR. Die Zeilennummern findest du im ELSTER-Formular deines Steuerjahres.</p>
    </div>
    <h3 class="section">Für die Steuer</h3>
    <div class="card">
      <p class="small">Die Datei enthält alle Einnahmen, Ausgaben und Fahrten ${jahr} – öffnet sich in Excel, Numbers oder Google Tabellen. Ideal für die Anlage EÜR oder dein Steuerbüro.</p>
      <div class="quick"><button class="btn" id="csv">📊 Excel-Datei (CSV) teilen</button><button class="btn ghost" id="belege">🧾 Alle Belege teilen</button></div>
      <p class="muted small">Kleinunternehmergrenze: ${money(d.umsatz)} von 25.000 € Umsatz (Rechnungen ${jahr}). Vereinfachte Übersicht – ersetzt keine Steuerberatung.</p>
    </div>
  `);
  $('#csv').addEventListener('click', () => {
    const c = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const eur = (cents) => (cents / 100).toFixed(2).replace('.', ',');
    const rows = [[`Einnahmen-Überschuss-Rechnung ${jahr} – ${S.firma}`], [], ['Datum', 'Art', 'Kategorie', 'Beschreibung', 'Betrag (EUR)', 'Beleg']];
    d.einnahmen.forEach((i) => rows.push([fmtDate(i.bezahltAm || i.datum), 'Einnahme', 'Betriebseinnahme (§ 19 UStG)', `${i.nummer} ${i.kunde.name}`, eur(i.summe), i.nummer]));
    d.aus.forEach((a) => rows.push([fmtDate(a.datum), 'Ausgabe', a.kategorie, `${a.beschreibung} (${a.zahlung})${a.privat ? ` – ${100 - a.privat} % beruflich von ${eur(a.betrag)} €` : ''}`, eur(-betrieblich(a)), a.fotoAnzahl ? 'Foto in App' : 'fehlt']));
    d.fa.forEach((f) => rows.push([fmtDate(f.datum), 'Ausgabe', 'Fahrtkosten (0,30 €/km)', `${fmtNum(f.km)} km – ${f.zweck}`, eur(-Math.round(num(f.km) * KM_SATZ)), 'Fahrtenbuch']));
    rows.push([], ['', 'Ausgaben nach Kategorie'], ...Object.entries(d.byKat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ['', k, '', '', eur(-v)]));
    const pos = euerPositionen(d);
    rows.push([], ['', 'Übertrag für die Anlage EÜR (Positionen des Formulars, Zeilennummern im Formular prüfen)'], ['', 'Betriebseinnahmen', '', '', eur(pos.einnahmen)], ...pos.ausgaben.map(([name, v]) => ['', name, '', '', eur(v)]), ['', 'Summe Betriebsausgaben', '', '', eur(pos.sumA)]);
    rows.push([], ['', 'Summe Einnahmen', '', '', eur(d.sumE)], ['', 'Summe Ausgaben', '', '', eur(-d.sumA)], ['', 'Gewinn', '', '', eur(d.gewinn)], ['', 'Steuer-Rücklage (Richtwert)', '', '', eur(d.ruecklage)]);
    const csv = '﻿' + rows.map((r) => r.map(c).join(';')).join('\r\n');
    saveFile(new Blob([csv], { type: 'text/csv' }), `EUeR-${jahr}-Toths-Reinigung.csv`);
  });
  $('#belege').addEventListener('click', async () => {
    const files = [];
    for (const a of d.aus) {
      const photos = await DB.by('photos', 'visitId', a.id);
      photos.forEach((p, i) => files.push({ blob: p.blob, name: `${a.datum}_${a.kategorie.split(' ')[0]}_${eur2(a.betrag)}${i ? `_${i + 1}` : ''}.jpg` }));
    }
    if (!files.length) return toast('Keine Belegfotos in diesem Jahr');
    if (!(await shareFiles(files, `Belege ${jahr}`))) toast('Teilen wird auf diesem Gerät nicht unterstützt');
  });
});
const eur2 = (cents) => (cents / 100).toFixed(2).replace('.', ',') + 'EUR';


/* ---------- Buchhaltung (Übersicht) ---------- */
route('/buchhaltung', async () => {
  const jahr = String(new Date().getFullYear());
  const d = await financeData(jahr);
  const invoices = await DB.all('invoices');
  const offen = invoices.filter((i) => i.status === 'offen');
  const overdue = offen.filter((i) => i.faellig < today());
  const objects = await DB.all('objects');
  const visits = await DB.all('visits');
  const belegeFehlen = d.aus.filter((a) => !a.fotoAnzahl).length;
  // Jahresabschluss-Checkliste: was am Jahresende erledigt sein sollte
  const monatStart = `${today().slice(0, 7)}-01`;
  const abzurechnen = visits.filter((v) => v.datum.startsWith(jahr) && !v.rechnungId && v.datum < monatStart).length;
  const sicherungJung = S.letzteSicherung && daysBetween(S.letzteSicherung, today()) <= 30;
  const checks = [
    ['Keine offenen Rechnungen', offen.length === 0, '#/rechnungen?filter=offen'],
    ['Alle Ausgaben haben ein Belegfoto', belegeFehlen === 0, '#/ausgaben'],
    ['Alle vergangenen Einsätze sind abgerechnet', abzurechnen === 0, '#/monatsabschluss'],
    ['Datensicherung in den letzten 30 Tagen', !!sicherungJung, '#/einstellungen'],
    ['Fahrtenbuch vollständig', (await DB.all('fahrten')).filter((f) => yearOf(f.datum) === jahr && fahrtMaengel(f).length).length === 0, '#/fahrten'],
  ];
  render('Buchhaltung', `
    <div class="card profit">
      <div class="muted small">Gewinn ${jahr} (vorläufig)</div>
      <div class="profit-value ${d.gewinn < 0 ? 'neg' : ''}" ${d.gewinn > 0 ? `data-count="${d.gewinn}" data-money` : ''}>${money(d.gewinn)}</div>
      <div class="row between small"><span>Einnahmen (bezahlt)</span><b>${money(d.sumE)}</b></div>
      <div class="row between small"><span>Ausgaben inkl. Fahrten</span><b>− ${money(d.sumA)}</b></div>
      ${offen.length ? `<div class="row between small"><span>Offene Rechnungen</span><b>${money(offen.reduce((s, i) => s + i.summe, 0))}</b></div>` : ''}
    </div>
    ${overdue.length ? `<a class="card hint" href="#/rechnungen?filter=offen">⏰ <b>${overdue.length} Rechnung${overdue.length === 1 ? '' : 'en'} überfällig</b> – jetzt Zahlungserinnerung schicken.</a>` : ''}
    ${belegeFehlen ? `<a class="card hint" href="#/ausgaben">🧾 Bei <b>${belegeFehlen} Ausgabe${belegeFehlen === 1 ? '' : 'n'}</b> fehlt noch das Belegfoto.</a>` : ''}
    <div class="card mt">
      <b>✅ Jahresabschluss ${jahr}</b>
      <ul class="done-list mt">${checks.map(([text, ok, href]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} <a href="${href}">${text}</a></li>`).join('')}</ul>
      <div class="muted small">${checks.every(([, ok]) => ok) ? 'Alles erledigt – gut gemacht.' : 'Offene Punkte vor der Steuererklärung klären.'}</div>
    </div>
    <div class="quick">
      <a class="btn" href="#/ausgabe/neu">🧾 Ausgabe erfassen</a>
      <a class="btn ghost" href="#/fahrt/neu">🚗 Fahrt eintragen</a>
    </div>
    <div class="tiles">
      ${tile('#/finanzen', '📒', 'Finanzen & Steuer', 'Gewinn, EÜR-Export, Belege')}
      ${tile('#/auswertung', '📊', 'Auswertung', 'Was bringt welches Haus?')}
      ${tile('#/ausgaben', '🧾', 'Ausgaben', `${d.aus.length} in ${jahr} · ${money(d.aus.reduce((s, a) => s + betrieblich(a), 0))}`, belegeFehlen || '')}
      ${tile('#/fahrten', '🚗', 'Fahrtenbuch', `${fmtNum(d.km)} km in ${jahr}`)}
      ${tile('#/rechnungen?filter=offen', '💶', 'Offene Rechnungen', `${offen.length} offen`, overdue.length || '')}
      ${tile('#/monatsabschluss', '🗓️', 'Monatsabschluss', 'Was ist abzurechnen?')}
      ${tile('#/preise', '📈', 'Preisanpassung', 'Preise erhöhen & ankündigen', objects.some((o) => o.neuerPreis) ? '!' : '')}
    </div>
  `);
});
