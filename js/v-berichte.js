'use strict';

const signLines = (left = 'Ort, Datum', right = 'Unterschrift Auftraggeber') => `<div class="sign-lines"><div>${left}</div><div>${right}</div></div>`;
const docButtons = (extra = '') => `<div class="card no-print">${docActionButtons(extra)}</div>`;

/* ---------- Leistungsnachweise ---------- */
route('/nachweise', async () => {
  const data = await loadAll();
  const pm = prevMonth();
  const cm = today().slice(0, 7);
  render('Leistungsnachweise', `
    <p class="muted small">Monatlicher Nachweis aller Reinigungen mit Zeiten, Arbeiten und Fotos – für Hausverwaltungen und die Betriebskostenabrechnung.</p>
    ${data.objects.filter((o) => o.aktiv !== false).map((o) => `<div class="card">
      <b>🏢 ${esc(objLabel(o))}</b><div class="muted small">${esc(kundeName(data.kmap, o.kundeId))}</div>
      <div class="row gap mt">
        <a class="btn small" href="#/objekt/${o.id}/nachweis?monat=${pm}">${esc(monthLabel(pm))}</a>
        <a class="btn small ghost" href="#/objekt/${o.id}/nachweis?monat=${cm}">${esc(monthLabel(cm))}</a>
      </div></div>`).join('') || '<div class="empty">Noch keine Häuser.</div>'}
  `);
});

route('/objekt/:id/nachweis', async ({ id }, q) => {
  const data = await loadAll();
  const o = data.omap[id];
  if (!o) return go('#/objekte', true);
  const k = data.kmap[o.kundeId] || { name: '' };
  const m = q.monat || prevMonth();
  const prev = isoDate(new Date(parseISO(`${m}-01`).getFullYear(), parseISO(`${m}-01`).getMonth() - 1, 1)).slice(0, 7);
  const next = addDays(lastOfMonth(m), 1).slice(0, 7);
  const visits = data.visits.filter((v) => v.objektId === id && v.datum.startsWith(m)).sort((a, b) => a.datum.localeCompare(b.datum));
  const winter = data.winter.filter((w) => w.objektId === id && w.datum.startsWith(m)).sort((a, b) => a.datum.localeCompare(b.datum));
  const maengel = data.maengel.filter((x) => x.objektId === id && x.datum.startsWith(m));
  const photos = [];
  for (const v of visits) {
    const ps = await DB.by('photos', 'visitId', v.id);
    const pick = ps.filter((p) => p.typ === 'nachher').concat(ps.filter((p) => p.typ !== 'nachher')).slice(0, 2);
    pick.forEach((p) => photos.push({ ...p, datum: v.datum }));
  }
  const hours = visits.reduce((s, v) => s + num(v.stunden), 0);
  const sigKey = `nachweis_${id}_${m}`;
  const sig = await DB.get('unterschriften', sigKey);

  render('Leistungsnachweis', `
    <div class="card no-print row between">
      <a class="icon-btn" href="#/objekt/${id}/nachweis?monat=${prev}" aria-label="Vormonat">‹</a>
      <b>${esc(monthLabel(m))}</b>
      <a class="icon-btn" href="#/objekt/${id}/nachweis?monat=${next}" aria-label="Nächster Monat">›</a>
    </div>
    ${docButtons(sig ? '<button class="btn ghost" id="unsign">Unterschrift entfernen</button>' : '<button class="btn ghost" id="sign">✍️ Unterschreiben lassen</button>')}
    <div class="doc-wrap"><article class="invoice-doc">
      ${docHeader()}
      <div class="inv-row">
        ${recipientBlock(k)}
        <table class="inv-meta">
          <tr><td>Objekt</td><td><b>${esc(objLabel(o))}</b></td></tr>
          <tr><td>Adresse</td><td>${esc(objAddress(o))}</td></tr>
          <tr><td>Zeitraum</td><td>${fmtDate(`${m}-01`)} – ${fmtDate(lastOfMonth(m))}</td></tr>
          <tr><td>Erstellt am</td><td>${fmtDate(today())}</td></tr>
        </table>
      </div>
      <h2 class="inv-title">Leistungsnachweis <span>${esc(monthLabel(m))}</span></h2>
      <p>Im genannten Zeitraum wurden im Objekt folgende Reinigungsleistungen erbracht:</p>
      <table class="inv-items">
        <thead><tr><th>Datum</th><th>Zeit</th><th>Erledigte Arbeiten</th><th class="r">Dauer</th></tr></thead>
        <tbody>${visits.map((v) => `<tr>
          <td class="nowrap">${fmtDateLong(v.datum)}</td>
          <td class="nowrap">${v.von ? `${esc(v.von)}–${esc(v.bis || '')}` : '–'}</td>
          <td>${esc((v.aufgaben || []).filter((t) => t.erledigt).map((t) => t.text).join(', '))}${v.extras?.length ? `<br><i>Zusätzlich: ${esc(v.extras.map((x) => x.name).join(', '))}</i>` : ''}${v.notiz ? `<br><span class="doc-muted">${esc(v.notiz)}</span>` : ''}</td>
          <td class="r">${v.stunden ? `${fmtNum(v.stunden)} Std.` : '–'}</td></tr>`).join('') || '<tr><td colspan="4">Keine Einsätze in diesem Monat.</td></tr>'}
        </tbody>
        <tfoot><tr><td colspan="2"></td><td class="r inv-total-label">${visits.length} Reinigung${visits.length === 1 ? '' : 'en'}</td><td class="r inv-total">${fmtNum(hours)} Std.</td></tr></tfoot>
      </table>
      ${winter.length ? `<h3 class="doc-h3">❄️ Winterdienst</h3><table class="inv-items small-table">
        <thead><tr><th>Datum</th><th>Uhrzeit</th><th>Wetter</th><th>Maßnahmen</th><th>Streumittel</th></tr></thead>
        <tbody>${winter.map((w) => `<tr><td class="nowrap">${fmtDateLong(w.datum)}</td><td class="nowrap">${esc(w.von)}${w.bis ? `–${esc(w.bis)}` : ''}</td><td>${esc(w.wetter)}</td><td>${esc((w.massnahmen || []).join(', '))}</td><td>${esc(w.streumittel || '–')}</td></tr>`).join('')}</tbody>
      </table>` : ''}
      ${maengel.length ? `<h3 class="doc-h3">⚠️ Gemeldete Mängel</h3><ul class="doc-list">${maengel.map((x) => `<li>${fmtDate(x.datum)} · ${esc(x.ort)}: ${esc(x.text)} ${x.status === 'erledigt' ? '(behoben)' : ''}</li>`).join('')}</ul>` : ''}
      ${photos.length ? `<h3 class="doc-h3">📷 Fotodokumentation</h3><div class="doc-photos">${photos.map((p) => `<figure><img src="${objUrl(p.blob)}" alt=""><figcaption>${fmtDate(p.datum)}</figcaption></figure>`).join('')}</div>` : ''}
      <p class="inv-note">Die Arbeiten wurden ordnungsgemäß gemäß Leistungsverzeichnis ausgeführt.</p>
      <div class="sign-row">${signSlot(null, 'Ort, Datum')}${signSlot(sig, 'Bestätigung Auftraggeber / Hausmeister')}</div>
      ${docFooter()}
    </article></div>
  `);
  wireDocButtons(`Leistungsnachweis ${objLabel(o)} ${monthLabel(m)}`, `Guten Tag,\n\nanbei der Leistungsnachweis für ${objLabel(o)} (${monthLabel(m)}).\n\nViele Grüße\n${S.inhaber}\n${S.firma}`);
  $('#sign')?.addEventListener('click', async () => {
    const sig = await signaturePad(`Leistungsnachweis ${monthLabel(m)} bestätigen`, o.vorOrtName || '');
    if (!sig) return;
    await DB.put('unterschriften', { id: sigKey, ...sig });
    vibrate(15);
    toast('✍️ Unterschrift gespeichert');
    router();
  });
  $('#unsign')?.addEventListener('click', async () => { if (confirm('Unterschrift entfernen?')) { await DB.del('unterschriften', sigKey); router(); } });
});

/* ---------- Aushang fürs Treppenhaus ---------- */
route('/objekt/:id/aushang', async ({ id }) => {
  const [o, visits, appts] = await Promise.all([DB.get('objects', id), DB.all('visits'), DB.by('appointments', 'objektId', id)]);
  if (!o) return go('#/objekte', true);
  const planned = appts.filter((a) => !a.erledigt && a.datum >= today()).map((a) => a.datum).sort();
  const dates = planned.length >= 4 ? planned.slice(0, 8) : (o.intervallTage > 0 ? planDates(o, nextPlanStart(o, visits), 8) : planned);
  const tl = taskList(o);
  const every = { 7: 'jede Woche', 14: 'alle zwei Wochen', 21: 'alle drei Wochen', 28: 'alle vier Wochen' }[o.intervallTage];
  const day = o.wochentag !== '' && o.wochentag != null ? ` am ${WEEKDAYS[o.wochentag]}` : '';

  render('Aushang', `
    ${docButtons()}
    <div class="doc-wrap"><article class="invoice-doc aushang">
      ${docHeader()}
      <h1 class="aushang-title">Treppenhausreinigung</h1>
      <p class="aushang-sub">${esc(objAddress(o) || objLabel(o))}</p>
      ${every ? `<p class="aushang-big">Dieses Haus wird <b>${every}${day}</b>${o.uhrzeit ? ` ab ca. <b>${esc(o.uhrzeit)} Uhr</b>` : ''} gereinigt.</p>` : ''}
      ${dates.length ? `<h3 class="doc-h3">📅 Die nächsten Termine</h3><div class="aushang-dates">${dates.map((d) => `<span>${fmtDateLong(d)}</span>`).join('')}</div>` : ''}
      <h3 class="doc-h3">✨ Unsere Leistungen</h3>
      <ul class="doc-list two-col">${tl.map((t) => `<li>${esc(t.text)}${t.alleTage > 0 ? ` <span class="doc-muted">(${freqLabel(t.alleTage)})</span>` : ''}</li>`).join('')}</ul>
      ${o.winterAbrechnung && o.winterAbrechnung !== 'keiner' ? '<p class="inv-note">❄️ <b>Winterdienst:</b> Bei Schnee und Glätte räumen und streuen wir die Zugänge und den Gehweg.</p>' : ''}
      <p class="inv-note">Bitte halten Sie Treppen und Flure an den Reinigungstagen frei von Schuhen und Gegenständen. Vielen Dank!</p>
      <div class="aushang-contact">Fragen, Lob oder Hinweise?<br><b>${esc(S.firma)}</b> · ${esc(S.inhaber)}${S.telefon ? `<br>📞 ${esc(S.telefon)}` : ''}${S.email ? ` · ✉️ ${esc(S.email)}` : ''}</div>
    </article></div>
  `);
  wireDocButtons(`Aushang ${objLabel(o)}`, `Aushang Treppenhausreinigung ${objLabel(o)}`);
});

/* ---------- Mängel ---------- */
const ORTE = ['Hauseingang', 'Treppenhaus EG', 'Treppenhaus 1. OG', 'Treppenhaus 2. OG', 'Treppenhaus 3. OG', 'Treppenhaus 4. OG', 'Keller', 'Dachboden', 'Aufzug', 'Mülltonnenplatz', 'Außenbereich', 'Tiefgarage'];

function mangelCard(m, data) {
  return `<a class="card link mangel ${m.dringend && m.status !== 'erledigt' ? 'urgent' : ''}" href="#/mangel/${m.id}">
    <div class="row between"><b>${m.dringend ? '🚨' : '⚠️'} ${esc(m.text.split('\n')[0].slice(0, 60))}</b>
      ${m.status === 'erledigt' ? '<span class="badge ok">behoben</span>' : m.gemeldetAm ? '<span class="badge">gemeldet</span>' : '<span class="badge warn">neu</span>'}</div>
    <div class="muted small">🏢 ${esc(objLabel(data.omap[m.objektId]))} · ${esc(m.ort)} · ${fmtDate(m.datum)}${m.fotoAnzahl ? ` · 📷 ${m.fotoAnzahl}` : ''}</div>
  </a>`;
}

route('/maengel', async (_, q) => {
  const data = await loadAll();
  const filter = q.filter || 'offen';
  const list = data.maengel.filter((m) => (filter === 'offen' ? m.status !== 'erledigt' : m.status === 'erledigt')).sort((a, b) => b.datum.localeCompare(a.datum));
  render('Mängel', `
    <a class="btn block" href="#/mangel/neu">+ Mangel melden</a>
    <div class="seg mt">
      <a href="#/maengel?filter=offen" class="${filter === 'offen' ? 'active' : ''}">Offen</a>
      <a href="#/maengel?filter=erledigt" class="${filter === 'erledigt' ? 'active' : ''}">Behoben</a>
    </div>
    <div class="mt">${list.map((m) => mangelCard(m, data)).join('') || `<div class="empty">${filter === 'offen' ? 'Keine offenen Mängel 👍' : 'Noch nichts behoben.'}</div>`}</div>
  `);
});

route('/mangel/neu', (_, q) => mangelForm(null, q));
route('/mangel/:id/bearbeiten', async ({ id }) => mangelForm(await DB.get('maengel', id), {}));

async function mangelForm(m, q) {
  const [objects, customers] = await Promise.all([DB.all('objects'), DB.all('customers')]);
  if (!objects.length) return noObjects();
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const isNew = !m;
  m = m || { id: DB.uid(), objektId: q.objekt || '', datum: today(), ort: '', text: '', dringend: false, status: 'offen' };
  const existing = isNew ? [] : await DB.by('photos', 'visitId', m.id);
  const pending = [];
  render(isNew ? 'Mangel melden' : 'Mangel bearbeiten', `
    <form id="f" class="form">
      ${objectSelect(objects.filter((o) => o.aktiv !== false || o.id === m.objektId), kmap, m.objektId)}
      <div class="grid2">
        <label>Wo?<input name="ort" list="orte" value="${esc(m.ort)}" placeholder="z. B. 3. OG links"></label>
        <label>Datum<input type="date" name="datum" value="${esc(m.datum)}"></label>
      </div>
      <datalist id="orte">${ORTE.map((x) => `<option value="${x}">`).join('')}</datalist>
      <label>Was ist los? *<textarea name="text" rows="3" required placeholder="z. B. Deckenlampe defekt, Graffiti an der Haustür, Sperrmüll im Keller…">${esc(m.text)}</textarea></label>
      <label class="check"><input type="checkbox" name="dringend" ${m.dringend ? 'checked' : ''}> 🚨 Dringend (z. B. Gefahr, Wasserschaden)</label>
      <div class="label">Fotos</div>
      <div id="photos"></div>
      <button class="btn block" type="submit" id="save">Speichern</button>
    </form>
  `);
  photoEditor($('#photos'), existing, pending, [['mangel', 'Fotos']]);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#save').disabled = true;
    const fd = new FormData(e.target);
    Object.assign(m, { objektId: fd.get('objektId'), ort: fd.get('ort').trim() || 'Objekt', datum: fd.get('datum'), text: fd.get('text').trim(), dringend: fd.has('dringend') });
    await savePhotos(m.id, pending);
    m.fotoAnzahl = existing.length + pending.length;
    await DB.put('maengel', m);
    toast('✓ Mangel gespeichert');
    go(`#/mangel/${m.id}`, true);
  });
}

route('/mangel/:id', async ({ id }) => {
  const m = await DB.get('maengel', id);
  if (!m) return go('#/maengel', true);
  const [o, photos] = await Promise.all([DB.get('objects', m.objektId), DB.by('photos', 'visitId', id)]);
  const k = o ? await DB.get('customers', o.kundeId) : null;
  render('Mangel', `
    <div class="card ${m.dringend ? 'urgent' : ''}">
      <div class="row between"><a class="strong" href="#/objekt/${m.objektId}">🏢 ${esc(objLabel(o))}</a>
        ${m.status === 'erledigt' ? '<span class="badge ok">behoben</span>' : m.dringend ? '<span class="badge bad">dringend</span>' : '<span class="badge warn">offen</span>'}</div>
      <div class="muted small">${esc(m.ort)} · festgestellt am ${fmtDateLong(m.datum)}${m.gemeldetAm ? ` · gemeldet am ${fmtDate(m.gemeldetAm)}` : ''}</div>
      <p>${nl2br(m.text)}</p>
      ${gallery(photos)}
    </div>
    <button class="btn block" id="send">📤 An ${esc(k?.name || 'Auftraggeber')} senden</button>
    <div class="quick">
      ${m.status === 'erledigt' ? '<button class="btn ghost" id="reopen">Wieder öffnen</button>' : '<button class="btn ghost" id="done">✓ Behoben</button>'}
      <a class="btn ghost" href="#/mangel/${id}/bearbeiten">Bearbeiten</a>
    </div>
    <button class="btn danger ghost block" id="del">Löschen</button>
  `);
  $('#view').addEventListener('click', (e) => { const img = e.target.closest('[data-view]'); if (img) lightbox(img.src); });
  $('#send').addEventListener('click', async () => {
    const text = [`${m.dringend ? '🚨 DRINGEND – ' : ''}Mängelmeldung: ${objLabel(o)}${objAddress(o) && objAddress(o) !== objLabel(o) ? `, ${objAddress(o)}` : ''}`, '',
      `Ort: ${m.ort}`, `Festgestellt am: ${fmtDateLong(m.datum)}`, '', m.text, '',
      'Bitte um Prüfung bzw. Beauftragung der Behebung.', '', 'Viele Grüße', S.inhaber, S.firma, S.telefon].filter((x) => x !== undefined).join('\n');
    if (photos.length) {
      if (!(await shareFiles(photoFiles(photos, `Mangel_${m.datum}`), 'Mängelmeldung', text))) await shareText(text, 'Mängelmeldung');
    } else {
      await shareText(text, 'Mängelmeldung');
    }
    if (!m.gemeldetAm) { m.gemeldetAm = today(); await DB.put('maengel', m); }
  });
  $('#done')?.addEventListener('click', async () => { m.status = 'erledigt'; m.erledigtAm = today(); await DB.put('maengel', m); vibrate(15); toast('✓ Als behoben markiert'); router(); });
  $('#reopen')?.addEventListener('click', async () => { m.status = 'offen'; await DB.put('maengel', m); router(); });
  $('#del').addEventListener('click', async () => {
    if (!confirm('Mangel inkl. Fotos löschen?')) return;
    await deletePhotos(id);
    await DB.del('maengel', id);
    go('#/maengel', true);
  });
});

/* ---------- Winterdienst ---------- */
const WETTER = ['Schneefall', 'Schneedecke', 'Glatteis / überfrierende Nässe', 'Reif / Glätte', 'Schneeregen'];
const MASSNAHMEN = ['Geräumt', 'Gestreut', 'Kontrollgang (nicht nötig)'];
const FLAECHEN = ['Gehweg vor dem Haus', 'Hauseingang & Zugang', 'Weg zu den Mülltonnen', 'Außentreppen', 'Zufahrt / Parkplatz'];
const STREUMITTEL = ['Splitt', 'Sand', 'Granulat (abstumpfend)', 'Auftausalz (wo erlaubt)'];

route('/winter', async (_, q) => {
  const data = await loadAll();
  const seasons = [...new Set([seasonOf(today()), ...data.winter.map((w) => seasonOf(w.datum))])].sort().reverse();
  const season = q.saison || seasons[0];
  const list = data.winter.filter((w) => seasonOf(w.datum) === season).sort((a, b) => (b.datum + b.von).localeCompare(a.datum + a.von));
  const perObj = data.objects.filter((o) => o.winterAbrechnung && o.winterAbrechnung !== 'keiner' || list.some((w) => w.objektId === o.id));
  render('Winterdienst', `
    <a class="btn block winter-btn" href="#/winter/neu">❄️ Einsatz eintragen</a>
    <div class="seg mt">${seasons.slice(0, 3).map((s) => `<a href="#/winter?saison=${encodeURIComponent(s)}" class="${s === season ? 'active' : ''}">Saison ${s}</a>`).join('')}</div>
    ${perObj.length ? `<h3 class="section">Protokolle</h3>${perObj.map((o) => {
      const n = list.filter((w) => w.objektId === o.id).length;
      return `<a class="card link" href="#/winter/protokoll/${o.id}?saison=${encodeURIComponent(season)}"><div class="row between"><b>🏢 ${esc(objLabel(o))}</b><span class="badge">${n} Einsätze</span></div>
        <div class="muted small">Räum- & Streuprotokoll ansehen / drucken</div></a>`;
    }).join('')}` : '<p class="muted small mt">Tipp: Beim Haus unter „Winterdienst“ einstellen, ob du ihn pro Einsatz abrechnest.</p>'}
    <h3 class="section">Einsätze</h3>
    ${list.map((w) => `<a class="card link" href="#/winter/${w.id}">
      <div class="row between"><b>❄️ ${esc(objLabel(data.omap[w.objektId]))}</b>${w.rechnungId ? '<span class="badge ok">abgerechnet</span>' : ''}</div>
      <div class="muted small">${fmtDateLong(w.datum)} · ${esc(w.von)}${w.bis ? `–${esc(w.bis)}` : ''} Uhr · ${esc(w.wetter)}</div>
      <div class="small">${esc((w.massnahmen || []).join(', '))}${w.streumittel ? ` · ${esc(w.streumittel)}` : ''}</div>
    </a>`).join('') || '<div class="empty">Noch keine Einsätze in dieser Saison.</div>'}
  `);
});

route('/winter/neu', (_, q) => winterForm(null, q));
route('/winter/:id/bearbeiten', async ({ id }) => winterForm(await DB.get('winter', id), {}));

async function winterForm(w, q) {
  const [objects, customers] = await Promise.all([DB.all('objects'), DB.all('customers')]);
  if (!objects.length) return noObjects();
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const winterObjs = objects.filter((o) => o.winterAbrechnung && o.winterAbrechnung !== 'keiner');
  const isNew = !w;
  w = w || {
    id: DB.uid(), objektId: q.objekt || (winterObjs.length === 1 ? winterObjs[0].id : ''), datum: today(), von: nowTime(), bis: '',
    wetter: WETTER[0], temperatur: '', massnahmen: ['Geräumt', 'Gestreut'], flaechen: FLAECHEN.slice(0, 2), streumittel: STREUMITTEL[0], notiz: '',
  };
  const existing = isNew ? [] : await DB.by('photos', 'visitId', w.id);
  const pending = [];
  const sorted = [...winterObjs, ...objects.filter((o) => !winterObjs.includes(o))].filter((o) => o.aktiv !== false || o.id === w.objektId);
  const checks = (name, options, selected) => `<div class="chip-row">${options.map((x) => `<label class="chip toggle ${selected.includes(x) ? 'on' : ''}"><input type="checkbox" name="${name}" value="${esc(x)}" ${selected.includes(x) ? 'checked' : ''} hidden>${esc(x)}</label>`).join('')}</div>`;
  render(isNew ? 'Winterdienst' : 'Winterdienst bearbeiten', `
    <form id="f" class="form">
      ${objectSelect(sorted, kmap, w.objektId)}
      <div class="grid3">
        <label>Datum<input type="date" name="datum" value="${esc(w.datum)}"></label>
        <label>Von<input type="time" name="von" value="${esc(w.von)}"></label>
        <label>Bis<input type="time" name="bis" value="${esc(w.bis)}"></label>
      </div>
      <div class="grid2">
        <label>Wetter<select name="wetter">${WETTER.map((x) => `<option ${x === w.wetter ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Temperatur (°C)<input name="temperatur" type="number" step="1" inputmode="numeric" value="${esc(w.temperatur)}"></label>
      </div>
      <div class="label">Was wurde gemacht?</div>${checks('massnahmen', MASSNAHMEN, w.massnahmen)}
      <div class="label">Welche Flächen?</div>${checks('flaechen', FLAECHEN, w.flaechen)}
      <label>Streumittel<select name="streumittel"><option value="">– keins –</option>${STREUMITTEL.map((x) => `<option ${x === w.streumittel ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Notiz<textarea name="notiz" rows="2" placeholder="z. B. zweiter Durchgang um 14 Uhr nötig">${esc(w.notiz)}</textarea></label>
      <div class="label">Fotos <span class="muted small">(Beweis bei Unfällen)</span></div>
      <div id="photos"></div>
      <button class="btn block winter-btn" type="submit" id="save">❄️ Speichern</button>
    </form>
  `);
  photoEditor($('#photos'), existing, pending, [['winter', 'Fotos']]);
  const f = $('#f');
  f.addEventListener('change', (e) => { const chip = e.target.closest('.chip'); if (chip) chip.classList.toggle('on', e.target.checked); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#save').disabled = true;
    const fd = new FormData(f);
    Object.assign(w, {
      objektId: fd.get('objektId'), datum: fd.get('datum'), von: fd.get('von'), bis: fd.get('bis'), wetter: fd.get('wetter'),
      temperatur: fd.get('temperatur'), massnahmen: fd.getAll('massnahmen'), flaechen: fd.getAll('flaechen'), streumittel: fd.get('streumittel'), notiz: fd.get('notiz').trim(),
    });
    await savePhotos(w.id, pending);
    w.fotoAnzahl = existing.length + pending.length;
    await DB.put('winter', w);
    vibrate(15);
    toast('❄️ Winterdienst gespeichert');
    go(`#/winter/${w.id}`, true);
  });
}

route('/winter/:id', async ({ id }) => {
  const w = await DB.get('winter', id);
  if (!w) return go('#/winter', true);
  const [o, photos] = await Promise.all([DB.get('objects', w.objektId), DB.by('photos', 'visitId', id)]);
  render('Winterdienst', `
    <div class="card winter-card">
      <div class="row between"><a class="strong" href="#/objekt/${w.objektId}">🏢 ${esc(objLabel(o))}</a>${w.rechnungId ? '<span class="badge ok">abgerechnet</span>' : ''}</div>
      <div class="muted">${fmtDateLong(w.datum)} · ${esc(w.von)}${w.bis ? `–${esc(w.bis)}` : ''} Uhr</div>
      <div class="mt">🌨️ ${esc(w.wetter)}${w.temperatur !== '' && w.temperatur != null ? ` · ${esc(w.temperatur)} °C` : ''}</div>
      <div>✅ ${esc((w.massnahmen || []).join(', '))}</div>
      <div>📍 ${esc((w.flaechen || []).join(', '))}</div>
      ${w.streumittel ? `<div>🧂 ${esc(w.streumittel)}</div>` : ''}
      ${w.notiz ? `<div class="mt">📝 ${nl2br(w.notiz)}</div>` : ''}
      ${gallery(photos)}
    </div>
    <div class="quick">
      <a class="btn ghost" href="#/winter/${id}/bearbeiten">Bearbeiten</a>
      <a class="btn ghost" href="#/winter/protokoll/${w.objektId}?saison=${encodeURIComponent(seasonOf(w.datum))}">📄 Protokoll</a>
    </div>
    ${w.rechnungId ? '' : '<button class="btn danger ghost block" id="del">Löschen</button>'}
  `);
  $('#view').addEventListener('click', (e) => { const img = e.target.closest('[data-view]'); if (img) lightbox(img.src); });
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Eintrag löschen?')) return;
    await deletePhotos(id);
    await DB.del('winter', id);
    go('#/winter', true);
  });
});

route('/winter/protokoll/:id', async ({ id }, q) => {
  const [o, all] = await Promise.all([DB.get('objects', id), DB.by('winter', 'objektId', id)]);
  if (!o) return go('#/winter', true);
  const k = await DB.get('customers', o.kundeId) || { name: '' };
  const season = q.saison || seasonOf(today());
  const list = all.filter((w) => seasonOf(w.datum) === season).sort((a, b) => (a.datum + a.von).localeCompare(b.datum + b.von));
  render('Streuprotokoll', `
    ${docButtons()}
    <div class="doc-wrap"><article class="invoice-doc">
      ${docHeader()}
      <div class="inv-row">
        ${recipientBlock(k)}
        <table class="inv-meta">
          <tr><td>Objekt</td><td><b>${esc(objLabel(o))}</b></td></tr>
          <tr><td>Adresse</td><td>${esc(objAddress(o))}</td></tr>
          <tr><td>Saison</td><td>${esc(season)}</td></tr>
          <tr><td>Einsätze</td><td>${list.length}</td></tr>
        </table>
      </div>
      <h2 class="inv-title">Räum- und Streuprotokoll <span>Winter ${esc(season)}</span></h2>
      <table class="inv-items small-table">
        <thead><tr><th>Datum</th><th>Uhrzeit</th><th>Wetter</th><th>Maßnahmen</th><th>Flächen</th><th>Streumittel</th></tr></thead>
        <tbody>${list.map((w) => `<tr><td class="nowrap">${fmtDateLong(w.datum)}</td><td class="nowrap">${esc(w.von)}${w.bis ? `–${esc(w.bis)}` : ''}</td>
          <td>${esc(w.wetter)}${w.temperatur !== '' && w.temperatur != null ? `, ${esc(w.temperatur)} °C` : ''}</td><td>${esc((w.massnahmen || []).join(', '))}</td>
          <td>${esc((w.flaechen || []).join(', '))}</td><td>${esc(w.streumittel || '–')}</td></tr>`).join('') || '<tr><td colspan="6">Keine Einsätze in dieser Saison.</td></tr>'}
        </tbody>
      </table>
      <p class="inv-note">Die Räum- und Streuarbeiten wurden zu den angegebenen Zeiten durchgeführt. Das Protokoll dient als Nachweis der Verkehrssicherung.</p>
      ${signLines('Ort, Datum', `Unterschrift ${esc(S.firma)}`)}
      ${docFooter()}
    </article></div>
  `);
  wireDocButtons(`Streuprotokoll ${objLabel(o)} ${season}`, `Guten Tag,\n\nanbei das Räum- und Streuprotokoll für ${objLabel(o)} (Winter ${season}).\n\nViele Grüße\n${S.inhaber}\n${S.firma}`);
});
