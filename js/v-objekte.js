'use strict';

/* ---------- Häuser ---------- */
route('/objekte', async (_, q) => {
  const data = await loadAll();
  const plan = planning(data);
  const list = (search) => data.objects
    .filter((o) => !search || [objLabel(o), o.strasse, o.plzOrt, kundeName(data.kmap, o.kundeId)].join(' ').toLowerCase().includes(search.toLowerCase()))
    .map((o) => {
      const n = plan.find((p) => p.objektId === o.id);
      const mg = data.maengel.filter((m) => m.objektId === o.id && m.status !== 'erledigt').length;
      const w = effectiveWage(o, data.visits);
      return `<a class="card link obj-card" href="#/objekt/${o.id}">
        <div class="row between"><b>🏢 ${esc(objLabel(o))}</b>
          <span>${o.aktiv === false ? '<span class="badge soft">inaktiv</span>' : ''}${mg ? `<span class="badge bad">⚠️ ${mg}</span>` : ''}</span></div>
        <div class="muted small">${esc(objAddress(o))} · ${esc(kundeName(data.kmap, o.kundeId))}</div>
        <div class="row gap small mt">
          <span class="badge soft">${esc(rhythmLabel(o))}</span>
          <span class="badge soft">${priceLabel(o)}</span>
          ${w && isMonthly(o) ? `<span class="badge ${wageClass(w.wage)}">≈ ${money(w.wage)}/Std.</span>` : ''}
        </div>
        ${n ? `<div class="small mt ${n.datum < today() ? 'danger-text' : ''}">Nächste Reinigung: ${esc(whenLabel(n.datum))}</div>` : ''}
      </a>`;
    }).join('') || '<div class="empty">Keine Häuser gefunden.</div>';

  render('Häuser', `
    <div class="row gap">
      <input type="search" id="search" placeholder="Häuser suchen…" value="${esc(q.q || '')}">
      <a class="btn" href="#/objekt/neu">+ Haus</a>
    </div>
    <div id="list" class="mt">${list(q.q || '')}</div>
  `, { tab: 'objekte', back: false });
  $('#search').addEventListener('input', (e) => { $('#list').innerHTML = list(e.target.value); });
});

route('/objekt/neu', async (_, q) => objectForm(null, q));
route('/objekt/:id/bearbeiten', async ({ id }) => objectForm(await DB.get('objects', id), {}));

async function objectForm(o, q) {
  const customers = (await DB.all('customers')).sort(byName);
  const isNew = !o;
  o = o || {
    kundeId: q.kunde || (customers.length === 1 ? customers[0].id : ''), name: '', strasse: '', plzOrt: '', etagen: 3, eingaenge: 1, aufzug: false,
    zugang: '', vorOrtName: '', vorOrtTelefon: '', intervallTage: 7, wochentag: '', uhrzeit: '',
    abrechnung: S.abrechnung, monatspauschale: S.monatspauschale, stundensatz: S.stundensatz,
    winterAbrechnung: 'keiner', winterPreis: 2500, notizen: '', aktiv: true,
    aufgaben: TASK_SUGGESTIONS.slice(0, 6).map(([text, alleTage]) => ({ text, alleTage })).concat([{ text: 'Kellergänge fegen & wischen', alleTage: 28 }, { text: 'Treppenhausfenster putzen', alleTage: 91 }]),
  };
  const oldTasks = taskList(o);
  const tasks = oldTasks.map((t) => ({ ...t }));

  render(isNew ? 'Neues Haus' : 'Haus bearbeiten', `
    <form id="f" class="form">
      ${customerSelect(customers, o.kundeId, { allowNew: true })}
      <label id="newCustomer" hidden>Name des neuen Auftraggebers<input name="neuerKunde" placeholder="z. B. Hausverwaltung Schmidt GmbH"></label>
      <label>Straße & Hausnr. *<input name="strasse" required value="${esc(o.strasse)}" placeholder="Musterstraße 5"></label>
      <div class="grid2">
        <label>PLZ & Ort<input name="plzOrt" value="${esc(o.plzOrt)}"></label>
        <label>Kurzname (optional)<input name="name" value="${esc(o.name)}" placeholder="z. B. Haus A"></label>
      </div>
      <div class="grid3">
        <label>Etagen<input name="etagen" type="number" min="0" inputmode="numeric" value="${esc(o.etagen)}"></label>
        <label>Eingänge<input name="eingaenge" type="number" min="1" inputmode="numeric" value="${esc(o.eingaenge)}"></label>
        <label class="check-col">Aufzug<input type="checkbox" name="aufzug" ${o.aufzug ? 'checked' : ''}></label>
      </div>
      <label>🔑 Zugang <span class="muted small">(Schlüssel, Türcode, Schlüsselbox)</span><input name="zugang" value="${esc(o.zugang)}"></label>
      <div class="grid2">
        <label>👤 Ansprechpartner vor Ort<input name="vorOrtName" value="${esc(o.vorOrtName)}" placeholder="z. B. Hausmeister"></label>
        <label>Telefon<input name="vorOrtTelefon" type="tel" value="${esc(o.vorOrtTelefon)}"></label>
      </div>

      <h3 class="section">💶 Abrechnung</h3>
      <div class="grid2">
        <label>Abrechnung
          <select name="abrechnung">
            <option value="monat" ${isMonthly(o) ? 'selected' : ''}>Monatspauschale</option>
            <option value="stunde" ${isMonthly(o) ? '' : 'selected'}>Nach Stunden</option>
          </select>
        </label>
        <label id="pauschaleField" ${isMonthly(o) ? '' : 'hidden'}>Monatspauschale (€)<input name="monatspauschale" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(o.monatspauschale)}"></label>
      </div>
      <label>Stundensatz (€) <span class="muted small">(für Stunden- und Extra-Arbeiten)</span><input name="stundensatz" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(o.stundensatz)}"></label>
      <div class="grid2">
        <label>❄️ Winterdienst
          <select name="winterAbrechnung">
            <option value="keiner" ${o.winterAbrechnung === 'keiner' ? 'selected' : ''}>kein Winterdienst</option>
            <option value="einsatz" ${o.winterAbrechnung === 'einsatz' ? 'selected' : ''}>pro Einsatz abrechnen</option>
            <option value="pauschal" ${o.winterAbrechnung === 'pauschal' ? 'selected' : ''}>in Pauschale enthalten</option>
          </select>
        </label>
        <label id="winterPreisField" ${o.winterAbrechnung === 'einsatz' ? '' : 'hidden'}>Preis je Einsatz (€)<input name="winterPreis" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(o.winterPreis)}"></label>
      </div>

      <h3 class="section">🗓️ Reinigungsplan</h3>
      <div class="grid3">
        <label>Wie oft?
          <select name="intervallTage">
            ${[[0, 'kein fester Rhythmus'], [7, 'jede Woche'], [14, 'alle 2 Wochen'], [21, 'alle 3 Wochen'], [28, 'alle 4 Wochen']]
              .map(([v, l]) => `<option value="${v}" ${Number(o.intervallTage) === v ? 'selected' : ''}>${l}</option>`).join('')}
            ${[0, 7, 14, 21, 28].includes(Number(o.intervallTage)) ? '' : `<option value="${o.intervallTage}" selected>alle ${o.intervallTage} Tage</option>`}
          </select>
        </label>
        <label>Wochentag
          <select name="wochentag">
            <option value="">egal</option>
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${String(o.wochentag) === String(d) ? 'selected' : ''}>${WEEKDAYS[d]}</option>`).join('')}
          </select>
        </label>
        <label>Uhrzeit<input type="time" name="uhrzeit" value="${esc(o.uhrzeit || '')}"></label>
      </div>
      <div class="label">Aufgaben & wie oft</div>
      <ul class="tasks plan-tasks" id="planTasks"></ul>
      <div class="chips" id="suggest"></div>
      <label>Notizen<textarea name="notizen" rows="3" placeholder="Besonderheiten, Reinigungsmittel, Wasseranschluss…">${esc(o.notizen)}</textarea></label>
      <label class="check"><input type="checkbox" name="aktiv" ${o.aktiv !== false ? 'checked' : ''}> Haus wird aktuell betreut</label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Haus löschen</button>'}
    </form>
  `);
  const f = $('#f');
  planTaskEditor($('#planTasks'), $('#suggest'), tasks);
  f.kundeId.addEventListener('change', () => { $('#newCustomer').hidden = f.kundeId.value !== '__neu'; });
  f.abrechnung.addEventListener('change', () => { $('#pauschaleField').hidden = f.abrechnung.value !== 'monat'; });
  f.winterAbrechnung.addEventListener('change', () => { $('#winterPreisField').hidden = f.winterAbrechnung.value !== 'einsatz'; });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    let kundeId = fd.get('kundeId');
    if (kundeId === '__neu') {
      const name = fd.get('neuerKunde').trim();
      if (!name) return alert('Bitte den Namen des neuen Auftraggebers eintragen.');
      kundeId = (await DB.put('customers', { name, ansprechpartner: '', strasse: '', plzOrt: '', telefon: '', email: '', privat: false, notizen: '' })).id;
    }
    Object.assign(o, {
      kundeId,
      name: fd.get('name').trim(),
      strasse: fd.get('strasse').trim(),
      plzOrt: fd.get('plzOrt').trim(),
      etagen: Number(fd.get('etagen')) || 0,
      eingaenge: Number(fd.get('eingaenge')) || 1,
      aufzug: fd.has('aufzug'),
      zugang: fd.get('zugang').trim(),
      vorOrtName: fd.get('vorOrtName').trim(),
      vorOrtTelefon: fd.get('vorOrtTelefon').trim(),
      abrechnung: fd.get('abrechnung'),
      monatspauschale: toCents(fd.get('monatspauschale')),
      stundensatz: toCents(fd.get('stundensatz')),
      winterAbrechnung: fd.get('winterAbrechnung'),
      winterPreis: toCents(fd.get('winterPreis')),
      intervallTage: Number(fd.get('intervallTage')) || 0,
      wochentag: fd.get('wochentag'),
      uhrzeit: fd.get('uhrzeit'),
      aufgaben: tasks.filter((t) => t.text.trim()).map((t) => ({ text: t.text.trim(), alleTage: Number(t.alleTage) || 0 })),
      notizen: fd.get('notizen').trim(),
      aktiv: fd.has('aktiv'),
    });
    assignStarts(o, isNew ? [] : await DB.by('visits', 'objektId', o.id), oldTasks);
    await DB.put('objects', o);
    toast('✓ Haus gespeichert');
    go(`#/objekt/${o.id}`, true);
  });

  $('#del')?.addEventListener('click', async () => {
    const visits = await DB.by('visits', 'objektId', o.id);
    if (visits.some((v) => v.rechnungId)) return alert('Für dieses Haus gibt es abgerechnete Einsätze. Es kann nicht gelöscht werden – setze es stattdessen auf „nicht betreut“.');
    if (!confirm(`„${objLabel(o)}“ mit ${visits.length} Einsätzen, Mängeln, Winterdienst und allen Fotos wirklich löschen?`)) return;
    for (const v of visits) await deleteVisit(v);
    for (const a of await DB.by('appointments', 'objektId', o.id)) await DB.del('appointments', a.id);
    for (const store of ['maengel', 'winter']) {
      for (const x of await DB.by(store, 'objektId', o.id)) { await deletePhotos(x.id); await DB.del(store, x.id); }
    }
    await DB.del('objects', o.id);
    toast('Haus gelöscht');
    go('#/objekte', true);
  });
}

route('/objekt/:id', async ({ id }) => {
  const data = await loadAll();
  const o = data.omap[id];
  if (!o) return go('#/objekte', true);
  const k = data.kmap[o.kundeId];
  const plan = planning(data).filter((p) => p.objektId === id);
  const visits = data.visits.filter((v) => v.objektId === id).sort((a, b) => b.datum.localeCompare(a.datum));
  const maengel = data.maengel.filter((m) => m.objektId === id && m.status !== 'erledigt');
  const season = seasonOf(today());
  const winter = data.winter.filter((w) => w.objektId === id && seasonOf(w.datum) === season);
  const tl = taskList(o);
  const regular = tl.filter((t) => !(t.alleTage > 0)).map((t) => t.text);
  const periodic = tl.filter((t) => t.alleTage > 0);
  const w = effectiveWage(o, data.visits);
  const addr = objAddress(o);
  const facts = [o.etagen ? `${o.etagen} Etagen` : '', o.eingaenge > 1 ? `${o.eingaenge} Eingänge` : '', o.aufzug ? 'Aufzug' : ''].filter(Boolean);

  render(objLabel(o), `
    <div class="card obj-head">
      ${addr ? `<div>📍 <a href="${mapsUrl(addr)}" target="_blank" rel="noopener">${esc(addr)}</a></div>` : ''}
      <div>👥 <a href="#/kunde/${o.kundeId}">${esc(k?.name || 'Auftraggeber fehlt')}</a></div>
      ${o.zugang ? `<div>🔑 ${esc(o.zugang)}</div>` : ''}
      ${o.vorOrtName || o.vorOrtTelefon ? `<div>👤 ${esc(o.vorOrtName || 'Ansprechpartner')}${o.vorOrtTelefon ? ` · <a href="tel:${esc(o.vorOrtTelefon.replace(/\s/g, ''))}">${esc(o.vorOrtTelefon)}</a>` : ''}</div>` : ''}
      <div class="row gap small mt">
        ${facts.map((x) => `<span class="badge soft">${x}</span>`).join('')}
        <span class="badge soft">${esc(rhythmLabel(o))}</span>
        <span class="badge">${priceLabel(o)}</span>
        ${o.winterAbrechnung && o.winterAbrechnung !== 'keiner' ? '<span class="badge soft">❄️ Winterdienst</span>' : ''}
      </div>
      ${w && isMonthly(o) ? `<div class="wage ${wageClass(w.wage)} mt"><b>≈ ${money(w.wage)} pro Stunde</b><span>bei ${fmtNum(Math.round(w.hoursPerMonth * 10) / 10)} Std. Arbeit im Monat (letzte 90 Tage)</span></div>` : ''}
      ${regular.length ? `<div class="small mt"><b>Jedes Mal:</b> ${esc(regular.join(' · '))}</div>` : ''}
      ${periodic.length ? `<div class="small mt">${periodic.map((t) => `<span class="chip static">✨ ${esc(t.text)} <span>${freqLabel(t.alleTage)}</span></span>`).join('')}</div>` : ''}
      ${o.notizen ? `<div class="small mt">📝 ${nl2br(o.notizen)}</div>` : ''}
      <a class="btn small ghost mt" href="#/objekt/${id}/bearbeiten">Bearbeiten</a>
    </div>
    <div class="qa qa-6">
      <button data-start="${id}"><span>▶️</span>Start</button>
      <a href="#/einsatz/neu?objekt=${id}"><span>🧽</span>Einsatz</a>
      <a href="#/mangel/neu?objekt=${id}"><span>⚠️</span>Mangel</a>
      <a href="#/winter/neu?objekt=${id}"><span>❄️</span>Winter</a>
      <a href="#/objekt/${id}/plan"><span>🗓️</span>Plan</a>
      <a href="#/objekt/${id}/nachweis"><span>📄</span>Nachweis</a>
      <a href="#/objekt/${id}/aushang"><span>📌</span>Aushang</a>
      <a href="#/rechnung/neu?kunde=${o.kundeId}&objekt=${id}"><span>🧾</span>Rechnung</a>
    </div>
    <h3 class="section">Anstehend</h3>
    ${plan.slice(0, 3).map((p) => planCard(p, data)).join('') || '<div class="empty small">Nichts geplant.</div>'}
    ${plan.length > 3 ? `<a class="btn ghost block" href="#/termine">Alle ${plan.length} Termine anzeigen</a>` : ''}
    ${maengel.length ? `<h3 class="section">⚠️ Offene Mängel (${maengel.length})</h3>${maengel.map((m) => mangelCard(m, data)).join('')}` : ''}
    ${winter.length ? `<h3 class="section">❄️ Winterdienst ${season} (${winter.length})</h3>
      <a class="card link" href="#/winter/protokoll/${id}?saison=${encodeURIComponent(season)}"><b>Räum- & Streuprotokoll ansehen</b><div class="muted small">Letzter Einsatz: ${fmtDateLong(winter.map((x) => x.datum).sort().pop())}</div></a>` : ''}
    <h3 class="section">Einsätze (${visits.length})</h3>
    ${visits.slice(0, 15).map((v) => visitCard(v, data, false)).join('') || '<div class="empty small">Noch keine Einsätze.</div>'}
  `);
});

/* ---------- Reinigungsplan ---------- */
route('/objekt/:id/plan', async ({ id }, q) => {
  const [o, visits, appts] = await Promise.all([DB.get('objects', id), DB.all('visits'), DB.by('appointments', 'objektId', id)]);
  if (!o) return go('#/objekte', true);
  const monate = Number(q.monate) || 3;
  if (!(o.intervallTage > 0)) {
    return render('Reinigungsplan', `<div class="card hint"><p><b>Für ${esc(objLabel(o))} ist noch kein Rhythmus festgelegt.</b></p>
      <p class="small">Lege beim Haus fest, wie oft (z. B. jede Woche), an welchem Wochentag und welche Aufgaben wie oft anfallen – dann erstelle ich daraus den Plan.</p>
      <a class="btn" href="#/objekt/${id}/bearbeiten">Plan einrichten</a></div>`);
  }
  const start = nextPlanStart(o, visits);
  const end = addDays(start, Math.round(monate * 30.4));
  const dates = planDates(o, start, 400).filter((d) => d <= end);
  const entries = buildPlan(o, visits, dates);
  const manual = appts.filter((a) => !a.erledigt && !a.ausPlan);
  const counts = {};
  entries.forEach((e) => e.aufgaben.forEach((t) => { if (t.alleTage > 0) counts[t.text] = (counts[t.text] || 0) + 1; }));

  render('Reinigungsplan', `
    <div class="card">
      <div class="row between"><b>🏢 ${esc(objLabel(o))}</b><a class="small" href="#/objekt/${id}/bearbeiten">Plan ändern</a></div>
      <div class="muted small">${esc(rhythmLabel(o))} · ${dates.length} Termine bis ${fmtDate(end)}</div>
      ${Object.keys(counts).length ? `<div class="small mt">${Object.entries(counts).map(([t, n]) => `<span class="chip static">✨ ${esc(t)} <span>${n}×</span></span>`).join('')}</div>` : ''}
    </div>
    <div class="seg">${[1, 3, 6, 12].map((m) => `<a href="#/objekt/${id}/plan?monate=${m}" class="${m === monate ? 'active' : ''}">${m} ${m === 1 ? 'Monat' : 'Monate'}</a>`).join('')}</div>
    <div class="timeline mt">
      ${entries.map((e) => {
        const reg = e.aufgaben.filter((t) => !(t.alleTage > 0));
        const per = e.aufgaben.filter((t) => t.alleTage > 0);
        const clash = manual.find((a) => Math.abs(daysBetween(a.datum, e.datum)) < 3);
        return `<div class="card plan-entry ${per.length ? 'big' : ''}">
          <div class="row between"><b>${fmtDateLong(e.datum)}</b>${o.uhrzeit ? `<span class="badge">${esc(o.uhrzeit)} Uhr</span>` : ''}</div>
          ${reg.length ? `<div class="muted small">${esc(reg.map((t) => t.text).join(' · '))}</div>` : ''}
          ${per.length ? `<div class="mt">${per.map((t) => `<span class="chip static hot">✨ ${esc(t.text)}</span>`).join('')}</div>` : ''}
          ${clash ? `<div class="small muted mt">ℹ️ Eigener Termin am ${fmtDate(clash.datum)} vorhanden – wird nicht doppelt eingetragen.</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <button class="btn block" id="create">📅 Plan als Termine eintragen</button>
    <div class="row gap mt">
      <button class="btn ghost" id="share">💬 Plan schicken</button>
      <a class="btn ghost" href="#/objekt/${id}/aushang">📌 Aushang drucken</a>
    </div>
    <p class="muted small">Bereits aus dem Plan eingetragene Termine werden beim erneuten Eintragen ersetzt. Selbst angelegte Termine bleiben unverändert.</p>
  `);

  $('#create').addEventListener('click', async () => {
    if (!confirm(`${entries.length} Termine bis ${fmtDate(end)} für ${objLabel(o)} eintragen?`)) return;
    for (const a of appts) if (a.ausPlan && !a.erledigt) await DB.del('appointments', a.id);
    let n = 0;
    for (const e of entries) {
      if (manual.some((a) => Math.abs(daysBetween(a.datum, e.datum)) < 3)) continue;
      await DB.put('appointments', { kundeId: o.kundeId, objektId: id, datum: e.datum, uhrzeit: o.uhrzeit || '', aufgaben: e.aufgaben.map((t) => t.text), notiz: '', erledigt: false, ausPlan: true });
      n++;
    }
    vibrate(15);
    toast(`✓ ${n} Termine eingetragen`);
    navDirection = 'tab';
    go('#/termine');
  });
  $('#share').addEventListener('click', () => {
    const text = [`Reinigungsplan ${S.firma}`, `${objLabel(o)}${objAddress(o) && objAddress(o) !== objLabel(o) ? `, ${objAddress(o)}` : ''}`, '', ...entries.map((e) => {
      const per = e.aufgaben.filter((t) => t.alleTage > 0).map((t) => t.text);
      return `• ${fmtDateLong(e.datum)}${o.uhrzeit ? `, ${o.uhrzeit} Uhr` : ''}${per.length ? ` – zusätzlich: ${per.join(', ')}` : ''}`;
    }), '', `Viele Grüße${S.inhaber ? `\n${S.inhaber}` : ''}`].join('\n');
    shareText(text, 'Reinigungsplan');
  });
});

/* ---------- Auftraggeber ---------- */
route('/kunden', async () => {
  const data = await loadAll();
  render('Auftraggeber', `
    <a class="btn block" href="#/kunde/neu">+ Auftraggeber</a>
    <div class="mt">${data.customers.map((c) => {
      const objs = data.objects.filter((o) => o.kundeId === c.id);
      const offen = data.invoices.filter((i) => i.kundeId === c.id && i.status === 'offen');
      return `<a class="card link" href="#/kunde/${c.id}">
        <div class="row between"><b>👥 ${esc(c.name)}</b>${offen.length ? `<span class="badge warn">${money(offen.reduce((s, i) => s + i.summe, 0))} offen</span>` : ''}</div>
        <div class="muted small">${objs.length} ${objs.length === 1 ? 'Haus' : 'Häuser'}${c.ansprechpartner ? ` · ${esc(c.ansprechpartner)}` : ''}</div>
      </a>`;
    }).join('') || '<div class="empty">Noch keine Auftraggeber.</div>'}</div>
  `);
});

route('/kunde/neu', () => customerForm(null));
route('/kunde/:id/bearbeiten', async ({ id }) => customerForm(await DB.get('customers', id)));

function customerForm(c) {
  const isNew = !c;
  c = c || { name: '', ansprechpartner: '', strasse: '', plzOrt: '', telefon: '', email: '', privat: false, notizen: '' };
  render(isNew ? 'Neuer Auftraggeber' : 'Auftraggeber bearbeiten', `
    <form id="f" class="form">
      <label>Name / Firma *<input name="name" required value="${esc(c.name)}" placeholder="z. B. Hausverwaltung Schmidt GmbH" autocomplete="off"></label>
      <label>Ansprechpartner<input name="ansprechpartner" value="${esc(c.ansprechpartner)}" placeholder="z. B. Frau Meier"></label>
      <label>Straße & Hausnr. <span class="muted small">(Rechnungsadresse)</span><input name="strasse" value="${esc(c.strasse)}"></label>
      <label>PLZ & Ort<input name="plzOrt" value="${esc(c.plzOrt)}"></label>
      <div class="grid2">
        <label>Telefon<input name="telefon" type="tel" value="${esc(c.telefon)}"></label>
        <label>E-Mail<input name="email" type="email" value="${esc(c.email)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="privat" ${c.privat ? 'checked' : ''}> Privatperson (z. B. Eigentümer, nicht Hausverwaltung)</label>
      <label>Notizen<textarea name="notizen" rows="3">${esc(c.notizen)}</textarea></label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Auftraggeber löschen</button>'}
    </form>
  `);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const key of ['name', 'ansprechpartner', 'strasse', 'plzOrt', 'telefon', 'email', 'notizen']) c[key] = fd.get(key).trim();
    c.privat = fd.has('privat');
    await DB.put('customers', c);
    toast('✓ Auftraggeber gespeichert');
    go(`#/kunde/${c.id}`, true);
  });
  $('#del')?.addEventListener('click', async () => {
    const [objs, invoices] = await Promise.all([DB.by('objects', 'kundeId', c.id), DB.by('invoices', 'kundeId', c.id)]);
    if (invoices.length) return alert('Dieser Auftraggeber hat Rechnungen und kann nicht gelöscht werden (Aufbewahrungspflicht).');
    if (objs.length) return alert('Bitte zuerst die Häuser dieses Auftraggebers löschen oder einem anderen Auftraggeber zuordnen.');
    if (!confirm(`„${c.name}“ wirklich löschen?`)) return;
    await DB.del('customers', c.id);
    go('#/kunden', true);
  });
}

route('/kunde/:id', async ({ id }) => {
  const data = await loadAll();
  const c = data.kmap[id];
  if (!c) return go('#/kunden', true);
  const objs = data.objects.filter((o) => o.kundeId === id);
  const invoices = data.invoices.filter((i) => i.kundeId === id).sort((a, b) => b.nummer.localeCompare(a.nummer));
  const addr = [c.strasse, c.plzOrt].filter(Boolean).join(', ');
  render(c.name, `
    <div class="card">
      ${c.ansprechpartner ? `<div>👤 ${esc(c.ansprechpartner)}</div>` : ''}
      ${addr ? `<div>📍 ${esc(addr)}</div>` : ''}
      ${c.telefon ? `<div>📞 <a href="tel:${esc(c.telefon.replace(/\s/g, ''))}">${esc(c.telefon)}</a></div>` : ''}
      ${c.email ? `<div>✉️ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
      <div class="muted small mt">${c.privat ? 'Privatperson' : 'Hausverwaltung / Firma'}</div>
      ${c.notizen ? `<div class="small mt">📝 ${nl2br(c.notizen)}</div>` : ''}
      <a class="btn small ghost mt" href="#/kunde/${id}/bearbeiten">Bearbeiten</a>
    </div>
    <div class="quick">
      <a class="btn" href="#/objekt/neu?kunde=${id}">🏢 Haus hinzufügen</a>
      <a class="btn ghost" href="#/rechnung/neu?kunde=${id}">🧾 Rechnung</a>
      <a class="btn ghost" href="#/angebot/neu?kunde=${id}">📝 Angebot</a>
    </div>
    <h3 class="section">Häuser (${objs.length})</h3>
    ${objs.map((o) => `<a class="card link" href="#/objekt/${o.id}"><b>🏢 ${esc(objLabel(o))}</b>
      <div class="muted small">${esc(objAddress(o))} · ${esc(rhythmLabel(o))} · ${priceLabel(o)}</div></a>`).join('') || '<div class="empty small">Noch keine Häuser.</div>'}
    <h3 class="section">Rechnungen (${invoices.length})</h3>
    ${invoices.map((i) => invoiceCard(i)).join('') || '<div class="empty small">Noch keine Rechnungen.</div>'}
  `);
});
