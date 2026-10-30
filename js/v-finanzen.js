'use strict';

const KATEGORIEN = ['Reinigungsmittel', 'Streumittel', 'Arbeitsmaterial & Geräte', 'Arbeitskleidung', 'Fahrzeug (Tanken, Werkstatt)', 'Telefon & Internet', 'Versicherungen', 'Werbung', 'Büro & Porto', 'Sonstiges'];
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
        <div class="row between"><b>${esc(a.beschreibung || a.kategorie)}</b><b>${money(a.betrag)}</b></div>
        <div class="muted small">${fmtDate(a.datum)} · ${esc(a.kategorie)}${a.fotoAnzahl ? ' · 🧾 Beleg' : ' · <span class="danger-text">kein Beleg</span>'}</div></a>`).join('')}`;
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
      <label>Bezahlt mit<select name="zahlung">${['Karte', 'Bar', 'Überweisung', 'PayPal'].map((z) => `<option ${z === a.zahlung ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
      <p class="muted small">Tipp: Fährst du mit dem eigenen Auto, trage die Kilometer im Fahrtenbuch ein (0,30 €/km) – dann Tankquittungen nicht zusätzlich als Ausgabe erfassen.</p>
      <button class="btn block" type="submit" id="save">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Löschen</button>'}
    </form>
  `);
  photoEditor($('#photos'), existing, pending, [['beleg', 'Beleg']]);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.assign(a, { betrag: toCents(fd.get('betrag')), datum: fd.get('datum'), kategorie: fd.get('kategorie'), beschreibung: fd.get('beschreibung').trim(), zahlung: fd.get('zahlung') });
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
    <div class="mt">${list.map((f) => `<a class="card link" href="#/fahrt/${f.id}">
      <div class="row between"><b>${fmtDateLong(f.datum)}</b><b>${fmtNum(f.km)} km</b></div>
      <div class="muted small">${esc(f.zweck)}${f.objektIds?.length ? ` · 🏢 ${esc(f.objektIds.map((id) => objLabel(omap[id])).join(', '))}` : ''}</div></a>`).join('') || '<div class="empty">Noch keine Fahrten.<br><span class="small">Tipp: In der Tagestour mit einem Tipp eintragen.</span></div>'}</div>
  `);
});

route('/fahrt/neu', (_, q) => fahrtForm(null, q));
route('/fahrt/:id', async ({ id }) => fahrtForm(await DB.get('fahrten', id), {}));

async function fahrtForm(f, q) {
  const objects = (await DB.all('objects')).filter((o) => o.aktiv !== false || f?.objektIds?.includes(o.id)).sort((a, b) => objLabel(a).localeCompare(objLabel(b), 'de'));
  const isNew = !f;
  const pre = (q.objekte || '').split(',').filter(Boolean);
  f = f || { datum: q.datum || today(), km: '', kmStart: '', kmEnde: '', zweck: pre.length ? 'Reinigungstour' : '', objektIds: pre };
  render(isNew ? 'Fahrt eintragen' : 'Fahrt', `
    <form id="f" class="form">
      <label>Datum<input type="date" name="datum" value="${esc(f.datum)}"></label>
      <div class="grid3">
        <label>km-Stand Start<input name="kmStart" type="number" inputmode="numeric" value="${esc(f.kmStart)}"></label>
        <label>km-Stand Ende<input name="kmEnde" type="number" inputmode="numeric" value="${esc(f.kmEnde)}"></label>
        <label>Gefahren (km) *<input name="km" type="number" step="0.1" min="0" inputmode="decimal" required value="${esc(f.km)}"></label>
      </div>
      <label>Zweck<input name="zweck" value="${esc(f.zweck)}" placeholder="z. B. Reinigungstour, Einkauf Großhandel"></label>
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
    Object.assign(f, { datum: fd.get('datum'), kmStart: fd.get('kmStart'), kmEnde: fd.get('kmEnde'), km: num(fd.get('km')), zweck: fd.get('zweck').trim() || 'Betriebliche Fahrt', objektIds: fd.getAll('objektIds') });
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
  aus.forEach((a) => { byKat[a.kategorie] = (byKat[a.kategorie] || 0) + a.betrag; });
  const sumA = aus.reduce((s, a) => s + a.betrag, 0) + fahrtkosten;
  const offen = invoices.filter((i) => i.status === 'offen').reduce((s, i) => s + i.summe, 0);
  const umsatz = invoices.filter((i) => i.status !== 'storniert' && yearOf(i.datum) === jahr).reduce((s, i) => s + i.summe, 0);
  return { einnahmen, aus, fa, km, fahrtkosten, sumE, sumA, byKat, gewinn: sumE - sumA, offen, umsatz };
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
    d.aus.forEach((a) => rows.push([fmtDate(a.datum), 'Ausgabe', a.kategorie, `${a.beschreibung} (${a.zahlung})`, eur(-a.betrag), a.fotoAnzahl ? 'Foto in App' : 'fehlt']));
    d.fa.forEach((f) => rows.push([fmtDate(f.datum), 'Ausgabe', 'Fahrtkosten (0,30 €/km)', `${fmtNum(f.km)} km – ${f.zweck}`, eur(-Math.round(num(f.km) * KM_SATZ)), 'Fahrtenbuch']));
    rows.push([], ['', 'Summe Einnahmen', '', '', eur(d.sumE)], ['', 'Summe Ausgaben', '', '', eur(-d.sumA)], ['', 'Gewinn', '', '', eur(d.gewinn)]);
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

