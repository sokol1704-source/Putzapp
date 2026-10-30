'use strict';

/* ---------- Termine ---------- */
route('/termine', async () => {
  const data = await loadAll();
  const plan = planning(data);
  const done = data.appointments.filter((a) => a.erledigt).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 20);
  // Nach Woche gruppieren
  const weeks = [];
  for (const p of plan) {
    const d = parseISO(p.datum);
    const monday = addDays(p.datum, -((d.getDay() + 6) % 7));
    let w = weeks.find((x) => x.monday === monday);
    if (!w) weeks.push(w = { monday, items: [] });
    w.items.push(p);
  }
  const weekTitle = (m) => {
    const diff = daysBetween(addDays(today(), -((new Date().getDay() + 6) % 7)), m) / 7;
    const range = `${fmtDay(m)}–${fmtDay(addDays(m, 6))}`;
    return diff < 0 ? `Überfällig` : diff === 0 ? `Diese Woche · ${range}` : diff === 1 ? `Nächste Woche · ${range}` : `KW ${range}`;
  };
  render('Termine', `
    <div class="row gap">
      <a class="btn" href="#/termin/neu">+ Termin</a>
      <a class="btn ghost" href="#/tour">🚐 Tour heute</a>
    </div>
    ${weeks.map((w) => `<h3 class="section">${weekTitle(w.monday)}</h3>${w.items.map((p) => planCard(p, data)).join('')}`).join('')
      || '<div class="empty mt">Keine anstehenden Termine.<br><span class="small">Tipp: Beim Haus unter „Plan“ alle Termine auf einmal eintragen.</span></div>'}
    ${done.length ? `<details class="mt"><summary>Erledigte Termine</summary>
      ${done.map((a) => `<a class="card link" href="${a.visitId ? `#/einsatz/${a.visitId}` : `#/termin/${a.id}`}">
        <b>🏢 ${esc(objLabel(data.omap[a.objektId]))}</b>
        <div class="muted small">${fmtDateLong(a.datum)} ✓</div></a>`).join('')}
    </details>` : ''}
  `, { tab: 'termine', back: false });
});

route('/termin/neu', (_, q) => appointmentForm(null, q));
route('/termin/:id', async ({ id }) => appointmentForm(await DB.get('appointments', id), {}));

async function appointmentForm(a, q) {
  const [allObjects, customers, visits] = await Promise.all([DB.all('objects'), DB.all('customers'), DB.all('visits')]);
  const objects = allObjects.filter((o) => o.aktiv !== false || o.id === a?.objektId).sort((x, y) => objLabel(x).localeCompare(objLabel(y), 'de'));
  if (!objects.length) return noObjects();
  const isNew = !a;
  const omap = Object.fromEntries(objects.map((o) => [o.id, o]));
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  if (!a) {
    const o = omap[q.objekt];
    const datum = q.datum || (o ? snapWeekday(nextPlanStart(o, visits), o.wochentag) : addDays(today(), 1));
    a = { objektId: q.objekt || '', datum, uhrzeit: o?.uhrzeit || '', aufgaben: dueTasks(o, visits, datum), notiz: '', erledigt: false };
  }
  const tasks = a.aufgaben.map((text) => ({ text }));

  render(isNew ? 'Termin planen' : 'Termin', `
    <form id="f" class="form">
      ${objectSelect(objects, kmap, a.objektId)}
      <div class="grid2">
        <label>Datum *<input type="date" name="datum" required value="${esc(a.datum)}"></label>
        <label>Uhrzeit<input type="time" name="uhrzeit" value="${esc(a.uhrzeit)}"></label>
      </div>
      <div class="label">Was ist zu tun?</div>
      <ul class="tasks" id="tasks"></ul>
      <label>Notiz<textarea name="notiz" rows="2">${esc(a.notiz)}</textarea></label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : `
        ${a.erledigt ? '' : `<a class="btn ghost block" href="#/einsatz/neu?objekt=${a.objektId}&termin=${a.id}">✓ Erledigt – Einsatz erfassen</a>`}
        <button class="btn ghost block" type="button" id="ics">📆 In Handy-Kalender übernehmen</button>
        <button class="btn danger ghost block" type="button" id="del">Termin löschen</button>`}
    </form>
  `);
  const f = $('#f');
  const editor = taskEditor($('#tasks'), tasks, false);
  f.objektId.addEventListener('change', () => {
    const o = omap[f.objektId.value];
    if (o?.uhrzeit && !f.uhrzeit.value) f.uhrzeit.value = o.uhrzeit;
    editor.set(dueTasks(o, visits, f.datum.value || today()).map((text) => ({ text })));
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    Object.assign(a, {
      objektId: fd.get('objektId'),
      kundeId: omap[fd.get('objektId')]?.kundeId,
      datum: fd.get('datum'),
      uhrzeit: fd.get('uhrzeit'),
      aufgaben: tasks.map((t) => t.text),
      notiz: fd.get('notiz').trim(),
    });
    await DB.put('appointments', a);
    toast('✓ Termin gespeichert');
    scheduleNotifications(true);
    go('#/termine', true);
  });
  $('#ics')?.addEventListener('click', () => downloadIcs(a, omap[a.objektId]));
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Termin löschen?')) return;
    await DB.del('appointments', a.id);
    go('#/termine', true);
  });
}

function downloadIcs(a, o) {
  const icsEsc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const d = a.datum.replace(/-/g, '');
  let dt;
  if (a.uhrzeit) {
    const [h, m] = a.uhrzeit.split(':').map(Number);
    const end = parseISO(a.datum);
    end.setHours(h + 2, m);
    dt = `DTSTART:${d}T${a.uhrzeit.replace(':', '')}00\r\nDTEND:${isoDate(end).replace(/-/g, '')}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  } else {
    dt = `DTSTART;VALUE=DATE:${d}\r\nDTEND;VALUE=DATE:${addDays(a.datum, 1).replace(/-/g, '')}`;
  }
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Toths Reinigungsservice//DE', 'BEGIN:VEVENT',
    `UID:${a.id}@toths-reinigung`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    dt,
    `SUMMARY:${icsEsc('Reinigung ' + objLabel(o))}`,
    `LOCATION:${icsEsc(objAddress(o))}`,
    `DESCRIPTION:${icsEsc([...(a.aufgaben || []), a.notiz].filter(Boolean).join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  saveFile(new Blob([ics], { type: 'text/calendar' }), `termin-${a.datum}.ics`);
}

/* ---------- Einsätze ---------- */
route('/einsaetze', async (_, q) => {
  const data = await loadAll();
  const filter = q.filter || 'alle';
  const visits = data.visits
    .filter((v) => filter !== 'offen' || !v.rechnungId)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  render('Einsätze', `
    <a class="btn block" href="#/einsatz/neu">+ Einsatz erfassen</a>
    <div class="seg mt">
      <a href="#/einsaetze" class="${filter === 'alle' ? 'active' : ''}">Alle</a>
      <a href="#/einsaetze?filter=offen" class="${filter === 'offen' ? 'active' : ''}">Nicht abgerechnet</a>
    </div>
    <div class="mt">${visits.slice(0, 100).map((v) => visitCard(v, data)).join('') || '<div class="empty">Keine Einsätze.</div>'}</div>
  `);
});

route('/einsatz/neu', (_, q) => visitForm(null, q));
route('/einsatz/:id/bearbeiten', async ({ id }) => visitForm(await DB.get('visits', id), {}));

async function visitForm(v, q) {
  const [allObjects, customers, allVisits] = await Promise.all([DB.all('objects'), DB.all('customers'), DB.all('visits')]);
  const objects = allObjects.filter((o) => o.aktiv !== false || o.id === v?.objektId).sort((x, y) => objLabel(x).localeCompare(objLabel(y), 'de'));
  if (!objects.length) return noObjects();
  const omap = Object.fromEntries(objects.map((o) => [o.id, o]));
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const isNew = !v;
  const termin = q.termin ? await DB.get('appointments', q.termin) : null;
  if (isNew) {
    const objektId = q.objekt || termin?.objektId || '';
    const datum = q.datum || today();
    const vorlage = termin?.aufgaben || dueTasks(omap[objektId], allVisits, datum);
    v = {
      id: DB.uid(), objektId, datum, von: q.von || termin?.uhrzeit || '', bis: q.bis || '',
      stunden: q.von && q.bis ? hoursBetween(q.von, q.bis) : '',
      aufgaben: vorlage.map((text) => ({ text, erledigt: true })), extras: [], notiz: '', rechnungId: null,
    };
  }
  const tasks = v.aufgaben.map((t) => ({ ...t }));
  const extras = (v.extras || []).map((x) => ({ ...x }));
  const existing = isNew ? [] : await DB.by('photos', 'visitId', v.id);
  const pending = [];

  render(isNew ? 'Einsatz erfassen' : 'Einsatz bearbeiten', `
    <form id="f" class="form">
      ${objectSelect(objects, kmap, v.objektId)}
      <label>Datum *<input type="date" name="datum" required value="${esc(v.datum)}"></label>
      <div class="grid3">
        <label>Von<input type="time" name="von" value="${esc(v.von)}"></label>
        <label>Bis<input type="time" name="bis" value="${esc(v.bis)}"></label>
        <label>Stunden<input type="number" name="stunden" step="0.25" min="0" inputmode="decimal" value="${esc(v.stunden)}"></label>
      </div>
      ${q.von && q.bis ? `<div class="card ok-note small">⏱️ Zeit aus der Stoppuhr übernommen: ${esc(q.von)}–${esc(q.bis)} Uhr</div>` : ''}
      <div class="label">Was wurde gereinigt?</div>
      <ul class="tasks" id="tasks"></ul>
      <div class="label">Zusatzleistungen <span class="muted small">(werden extra berechnet)</span></div>
      <ul class="tasks extras" id="extras"></ul>
      <div class="label">Fotos</div>
      <div id="photos"></div>
      <label>Notiz<textarea name="notiz" rows="3" placeholder="z. B. Besonderheiten, Verschmutzungen, Material verbraucht…">${esc(v.notiz)}</textarea></label>
      ${v.rechnungId ? '<p class="muted small">Dieser Einsatz ist bereits abgerechnet.</p>' : ''}
      <button class="btn block" type="submit" id="save">Speichern</button>
    </form>
  `);

  const editor = taskEditor($('#tasks'), tasks, true);
  extrasEditor($('#extras'), extras);
  photoEditor($('#photos'), existing, pending);

  const f = $('#f');
  f.objektId.addEventListener('change', () => {
    if (!termin) editor.set(dueTasks(omap[f.objektId.value], allVisits, f.datum.value || today()).map((text) => ({ text, erledigt: true })));
  });
  const calcHours = () => { if (f.von.value && f.bis.value) f.stunden.value = hoursBetween(f.von.value, f.bis.value); };
  f.von.addEventListener('change', calcHours);
  f.bis.addEventListener('change', calcHours);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#save').disabled = true;
    const fd = new FormData(f);
    const o = omap[fd.get('objektId')];
    Object.assign(v, {
      objektId: o.id,
      kundeId: o.kundeId,
      datum: fd.get('datum'),
      von: fd.get('von'),
      bis: fd.get('bis'),
      stunden: num(fd.get('stunden')) || '',
      aufgaben: tasks,
      extras: extras.filter((x) => num(x.menge) > 0).map((x) => ({ ...x, menge: num(x.menge) })),
      notiz: fd.get('notiz').trim(),
    });
    await savePhotos(v.id, pending);
    v.fotoAnzahl = existing.length + pending.length;
    await DB.put('visits', v);

    if (termin && !termin.erledigt) {
      Object.assign(termin, { erledigt: true, visitId: v.id });
      await DB.put('appointments', termin);
    }
    if (isNew && o.intervallTage > 0) {
      const openAppts = (await DB.by('appointments', 'objektId', o.id)).filter((a) => !a.erledigt);
      const nextDate = snapWeekday(addDays(v.datum, o.intervallTage), o.wochentag);
      if (!openAppts.length && confirm(`Nächste Reinigung in ${objLabel(o)} am ${fmtDateLong(nextDate)} als Termin eintragen?`)) {
        await DB.put('appointments', { kundeId: o.kundeId, objektId: o.id, datum: nextDate, uhrzeit: o.uhrzeit || v.von || '', aufgaben: dueTasks(o, await DB.all('visits'), nextDate), notiz: '', erledigt: false });
      }
    }
    if (isNew) await consumeMaterial('reinigung');
    vibrate(15);
    toast('✓ Einsatz gespeichert');
    go(`#/einsatz/${v.id}`, true);
  });
}

route('/einsatz/:id', async ({ id }) => {
  const v = await DB.get('visits', id);
  if (!v) return go('#/einsaetze', true);
  const [o, photos, inv] = await Promise.all([
    DB.get('objects', v.objektId),
    DB.by('photos', 'visitId', id),
    v.rechnungId ? DB.get('invoices', v.rechnungId) : null,
  ]);
  render('Einsatz', `
    <div class="card">
      <div class="row between"><a class="strong" href="#/objekt/${v.objektId}">🏢 ${esc(objLabel(o))}</a>
        ${inv ? `<a class="badge ok" href="#/rechnung/${inv.id}">Rechnung ${esc(inv.nummer)}</a>` : '<span class="badge warn">nicht abgerechnet</span>'}</div>
      <div class="muted">${fmtDateLong(v.datum)}${v.von ? ` · ${esc(v.von)}${v.bis ? '–' + esc(v.bis) : ''} Uhr` : ''}${v.stunden ? ` · ${fmtNum(v.stunden)} Std.` : ''}</div>
      <ul class="done-list mt">${(v.aufgaben || []).map((t) => `<li class="${t.erledigt ? 'ok' : 'no'}">${t.erledigt ? '✓' : '✗'} ${esc(t.text)}</li>`).join('')}</ul>
      ${v.extras?.length ? `<div class="small muted mt">Zusatzleistungen</div><ul class="done-list">${v.extras.map((x) => `<li class="ok">➕ ${esc(x.name)} · ${fmtNum(x.menge)} ${esc(x.einheit)} à ${money(x.preis)}</li>`).join('')}</ul>` : ''}
      ${v.notiz ? `<div class="mt">📝 ${nl2br(v.notiz)}</div>` : ''}
      ${gallery(photos.filter((p) => p.typ === 'vorher'), 'Vorher')}${gallery(photos.filter((p) => p.typ === 'nachher'), 'Nachher')}
    </div>
    <div class="quick">
      <a class="btn ghost" href="#/einsatz/${id}/bearbeiten">Bearbeiten</a>
      ${photos.length && (NATIVE || navigator.canShare) ? '<button class="btn ghost" id="share">📤 Fotos teilen</button>' : ''}
      <a class="btn ghost" href="#/mangel/neu?objekt=${v.objektId}">⚠️ Mangel melden</a>
    </div>
    ${v.rechnungId ? '' : '<button class="btn danger ghost block" id="del">Einsatz löschen</button>'}
  `);
  $('#view').addEventListener('click', (e) => { const img = e.target.closest('[data-view]'); if (img) lightbox(img.src); });
  $('#share')?.addEventListener('click', async () => {
    if (!(await shareFiles(photoFiles(photos, v.datum), `Reinigung ${objLabel(o)} ${fmtDate(v.datum)}`))) toast('Teilen wird auf diesem Gerät nicht unterstützt');
  });
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Einsatz inkl. Fotos löschen?')) return;
    await deleteVisit(v);
    go('#/einsaetze', true);
  });
});

async function deleteVisit(v) {
  await deletePhotos(v.id);
  for (const a of await DB.by('appointments', 'objektId', v.objektId)) {
    if (a.visitId === v.id) { a.erledigt = false; delete a.visitId; await DB.put('appointments', a); }
  }
  await DB.del('visits', v.id);
}
