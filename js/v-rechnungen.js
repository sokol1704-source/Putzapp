'use strict';

/* ---------- Rechnungen ---------- */
const STATUS = { offen: ['offen', 'warn'], bezahlt: ['bezahlt', 'ok'], storniert: ['storniert', 'soft'] };

function invoiceCard(i) {
  const [label, cls] = STATUS[i.status];
  const overdue = i.status === 'offen' && i.faellig < today();
  return `<a class="card link" href="#/rechnung/${i.id}">
    <div class="row between"><b>${esc(i.nummer)}</b><span class="badge ${overdue ? 'bad' : cls}">${overdue ? 'überfällig' : label}</span></div>
    <div class="row between small"><span class="muted">${esc(i.kunde.name)} · ${fmtDate(i.datum)}</span><b>${money(i.summe)}</b></div>
    ${i.objekte?.length ? `<div class="muted small">🏢 ${esc(i.objekte.map((o) => o.name).join(', '))}</div>` : ''}
  </a>`;
}

// Nächste fortlaufende Nummer im Format PREFIX-JAHR-001
async function nextNumber(store, prefix, datum, start = 1) {
  const full = `${prefix}-${datum.slice(0, 4)}-`;
  const nums = (await DB.all(store)).filter((i) => i.nummer?.startsWith(full)).map((i) => parseInt(i.nummer.slice(full.length), 10) || 0);
  const n = nums.length ? Math.max(...nums) + 1 : Math.max(1, Number(start) || 1);
  return full + String(n).padStart(3, '0');
}

// Fehlende Rechnungsnummern je Jahr (zwischen der kleinsten und größten vergebenen Nummer)
// Ratenplan: Summe gleichmäßig auf n Monatsraten verteilen, die letzte Rate nimmt die Cent-Reste auf
function ratenPlan(summe, n, ersteRate) {
  const [j, mo, tag] = ersteRate.split('-').map(Number);
  const basis = Math.floor(summe / n);
  const rest = summe - basis * n;
  return Array.from({ length: n }, (_, i) => {
    const letzterTag = new Date(j, mo - 1 + i + 1, 0).getDate();
    return {
      nr: i + 1,
      faellig: isoDate(new Date(j, mo - 1 + i, Math.min(tag, letzterTag))),
      betrag: basis + (i === n - 1 ? rest : 0),
      bezahltAm: null,
    };
  });
}
// Offener Betrag, und ob die Rechnung nach dem Zahlungsstand als bezahlt gilt
const restBetrag = (i) => (i.raten ? i.raten.filter((r) => !r.bezahltAm).reduce((s, r) => s + r.betrag, 0) : i.summe);
function ratenStand(inv) {
  const offen = inv.raten.filter((r) => !r.bezahltAm);
  if (!offen.length) return { status: 'bezahlt', bezahltAm: inv.raten.map((r) => r.bezahltAm).sort().pop(), faellig: inv.raten[inv.raten.length - 1].faellig };
  return { status: 'offen', bezahltAm: null, faellig: offen[0].faellig };
}

function nummernLuecken(invoices) {
  const jahre = {};
  for (const i of invoices) {
    const m = String(i.nummer || '').match(/^(.*)-(\d{4})-(\d+)$/);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    (jahre[key] ||= new Set()).add(Number(m[3]));
  }
  const luecken = [];
  for (const [key, nums] of Object.entries(jahre)) {
    const max = Math.max(...nums);
    const fehlend = [];
    for (let n = 1; n <= max; n++) if (!nums.has(n)) fehlend.push(n);
    if (fehlend.length) luecken.push({ key, fehlend });
  }
  return luecken;
}

route('/rechnungen', async (_, q) => {
  const invoices = (await DB.all('invoices')).sort((a, b) => b.nummer.localeCompare(a.nummer));
  const luecken = nummernLuecken(invoices);
  const filter = q.filter || 'alle';
  const year = new Date().getFullYear();
  // Kleinunternehmergrenze nach Zahlungseingang (§ 19 UStG: vereinnahmte Entgelte)
  const zu = zufluesse(invoices);
  const umsatz = summeIn(zu, String(year));
  const umsatzVJ = summeIn(zu, String(year - 1));
  const pct = Math.min(100, (umsatz / KU_GRENZE_VORJAHR) * 100);
  const pctL = Math.min(100, (umsatz / KU_GRENZE_LAUFEND) * 100);
  const shown = invoices.filter((i) => filter === 'alle' || i.status === filter);
  const overdue = invoices.filter((i) => i.status === 'offen' && i.faellig < today());
  render('Rechnungen', `
    <a class="btn block" href="#/rechnung/neu">+ Rechnung erstellen</a>
    <div class="card mt">
      <div class="row between"><span>Einnahmen ${year}</span><b data-count="${umsatz}" data-money>${money(umsatz)}</b></div>
      <div class="muted small">Nach Zahlungseingang gezählt, so wie bei der Kleinunternehmergrenze (§ 19 UStG).</div>
      <div class="row between small mt"><span>Grenze für ${year + 1}</span><span>${money(umsatz)} von 25.000 €</span></div>
      <div class="bar"><div style="width:${pct}%" class="${pct > 80 ? 'warn' : ''}"></div></div>
      <div class="row between small mt"><span>Grenze im laufenden Jahr</span><span>${money(umsatz)} von 100.000 €</span></div>
      <div class="bar"><div style="width:${pctL}%" class="${pctL > 80 ? 'warn' : ''}"></div></div>
      <div class="muted small mt">Vorjahr ${year - 1}: ${money(umsatzVJ)} – ${umsatzVJ <= KU_GRENZE_VORJAHR ? `unter 25.000 €, damit bist du ${year} Kleinunternehmer.` : `über 25.000 €, damit giltst du ${year} nicht mehr als Kleinunternehmer.`}</div>
    </div>
    ${overdue.length ? `<div class="card hint">⏰ <b>${overdue.length} Rechnung${overdue.length === 1 ? '' : 'en'} überfällig</b> – in der Rechnung auf „Zahlungserinnerung“ tippen.</div>` : ''}
    ${luecken.length ? `<div class="card hint danger-text">⚠️ <b>Lücken in der Rechnungsnummerierung</b>
      ${luecken.map((l) => `<div class="small mt">${esc(l.key)}: fehlt ${l.fehlend.map((n) => String(n).padStart(3, '0')).join(', ')}</div>`).join('')}
      <div class="small mt">Eine gelöschte Rechnung hinterlässt eine Lücke. Für die Buchhaltung solltest du sie erklären können, z. B. „Fehlerhafter Entwurf, nie versendet“. Bereits versendete Rechnungen besser stornieren statt löschen.</div></div>` : ''}
    <div class="seg mt">
      ${['alle', 'offen', 'bezahlt', 'storniert'].map((f) => `<a href="#/rechnungen?filter=${f}" class="${filter === f ? 'active' : ''}">${f[0].toUpperCase() + f.slice(1)}</a>`).join('')}
    </div>
    <div class="mt">${shown.map(invoiceCard).join('') || (invoices.length ? '<div class="empty">Keine Rechnungen in dieser Auswahl.</div>' : '<div class="empty">Noch keine Rechnungen.<br><span class="small">Sie entstehen aus abgerechneten Einsätzen – am einfachsten über den Monatsabschluss.</span><br><a class="btn small mt" href="#/monatsabschluss">🧾 Zum Monatsabschluss</a></div>')}</div>
  `, { tab: 'rechnungen', back: false });
});

function visitToPosition(v, o, prefix = '') {
  const done = (v.aufgaben || []).filter((t) => t.erledigt).map((t) => t.text);
  return {
    visitId: v.id,
    beschreibung: `${prefix}Treppenhausreinigung${done.length ? `: ${done.join(', ')}` : ''}`,
    datum: v.datum,
    menge: v.stunden || 1,
    einheit: v.stunden ? 'Std.' : 'pauschal',
    preis: o.stundensatz || S.stundensatz || 0,
    art: 'arbeit',
  };
}

// Gleiche Zusatzleistungen mehrerer Einsätze zu einer Rechnungsposition zusammenfassen
function extraPositions(visits, prefix = '') {
  const groups = new Map();
  for (const v of visits) {
    for (const x of v.extras || []) {
      const key = `${x.name}|${x.preis}|${x.einheit}`;
      const g = groups.get(key) || { ...x, menge: 0, dates: [] };
      g.menge += num(x.menge);
      g.dates.push(v.datum);
      groups.set(key, g);
    }
  }
  return [...groups.values()].map(({ dates, ...x }) => {
    dates.sort();
    const many = dates.length > 1;
    return {
      auto: true,
      beschreibung: prefix + x.name + (many ? ` (am ${dates.map(fmtDay).join(', ')})` : ''),
      datum: dates[0],
      ...(many ? { datumBis: dates[dates.length - 1] } : {}),
      menge: x.menge,
      einheit: x.einheit,
      preis: x.preis,
      art: x.art || 'arbeit',
    };
  });
}

const positionTotal = (p) => Math.round(num(p.menge) * p.preis);

// Bearbeitbare Positionsliste (Rechnung & Angebot)
function positionsEditor(el, getPositions, onChange) {
  const draw = () => {
    const positions = getPositions();
    el.innerHTML = positions.map((p, i) => `<div class="pos card" data-i="${i}">
      <div class="row between"><b>Pos. ${i + 1}</b><button type="button" class="icon-btn" data-rm="${i}" aria-label="Position entfernen">✕</button></div>
      <label>Leistung<textarea data-k="beschreibung" rows="${p.pauschale ? 3 : 2}">${esc(p.beschreibung)}</textarea></label>
      <div class="grid2">
        <label>${p.datumBis ? 'Leistung von' : 'Leistungsdatum'}<input type="date" data-k="datum" value="${esc(p.datum)}"></label>
        ${p.datumBis ? `<label>bis<input type="date" data-k="datumBis" value="${esc(p.datumBis)}"></label>` : `<label>Art<select data-k="art">
          ${[['arbeit', 'Arbeitsleistung'], ['fahrt', 'Fahrtkosten'], ['material', 'Material']].map(([v, l]) => `<option value="${v}" ${p.art === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>`}
      </div>
      <div class="grid3">
        <label>Menge<input type="number" step="0.25" min="0" inputmode="decimal" data-k="menge" value="${esc(p.menge)}"></label>
        <label>Einheit<input data-k="einheit" list="units" value="${esc(p.einheit)}"></label>
        <label>Preis (€)<input type="number" step="0.01" min="0" inputmode="decimal" data-k="preis" value="${centsInput(p.preis)}"></label>
      </div>
      <div class="right small">Betrag: <b data-sum>${money(positionTotal(p))}</b></div>
    </div>`).join('') || '<div class="empty small">Noch keine Positionen.</div>';
    onChange();
  };
  el.addEventListener('input', (e) => {
    const key = e.target.dataset.k;
    if (!key) return;
    const box = e.target.closest('.pos');
    const p = getPositions()[box.dataset.i];
    p[key] = key === 'preis' ? toCents(e.target.value) : e.target.value;
    $('[data-sum]', box).textContent = money(positionTotal(p));
    onChange();
  });
  return { draw };
}

const unitsDatalist = () => `<datalist id="units">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>`;
const extraSelect = () => `<select id="addExtra" class="add-extra">
    <option value="">➕ Zusatzleistung hinzufügen…</option>
    ${S.leistungen.map((l, i) => `<option value="${i}">${esc(l.name)} – ${unitPrice(l)}</option>`).join('')}
  </select>`;

route('/rechnung/neu', async (_, q) => {
  const data = await loadAll();
  if (!data.objects.length) return noObjects();
  if (!settingsComplete()) {
    return render('Rechnung erstellen', `<div class="card hint">
      <p><b>Bitte zuerst deine Firmendaten eintragen.</b></p>
      <p class="small">Eine Rechnung muss nach § 14 UStG deinen vollständigen Namen, deine Anschrift und deine Steuernummer enthalten.</p>
      <a class="btn" href="#/einstellungen">Zu den Einstellungen</a></div>`);
  }
  const customers = data.customers.filter((c) => data.objects.some((o) => o.kundeId === c.id));
  const kundeId = q.kunde || data.omap[q.objekt]?.kundeId || (customers.length === 1 ? customers[0].id : '');
  const defaultMonth = q.monat || (new Date().getDate() <= 15 ? prevMonth() : today().slice(0, 7));
  // Eigene Rechnung nur für einen Einsatz (keine Monatspauschale, kein Winterdienst)
  const einsatzId = q.einsatz || '';
  let positions = [];
  const objSel = new Set();
  const selV = new Set();
  const selW = new Set();

  render('Rechnung erstellen', `
    <form id="f" class="form">
      ${customerSelect(customers, kundeId)}
      <div id="objBox"></div>
      <label>Abrechnungsmonat<input type="month" name="monat" value="${defaultMonth}"></label>
      <div class="grid2">
        <label>Rechnungsdatum<input type="date" name="datum" required value="${today()}"></label>
        <label>Zahlungsziel (Tage)<input type="number" name="zahlungsziel" min="0" value="${S.zahlungsziel}"></label>
      </div>
      ${einsatzId ? '<p class="muted small">Eigene Rechnung nur für diesen Einsatz. Er taucht danach nicht mehr in der Monatsübersicht auf.</p>' : ''}
      <div id="visits"></div>
      <div class="label">Positionen</div>
      <div id="positions"></div>
      ${unitsDatalist()}
      <div class="row gap">${extraSelect()}<button type="button" class="btn ghost small" id="addPos">+ Freie Position</button></div>
      <div class="total" id="total"></div>
      <label>Zusätzlicher Text (optional)<textarea name="notiz" rows="2" placeholder="z. B. Vielen Dank für die gute Zusammenarbeit!"></textarea></label>
      <p class="muted small">Die Rechnungsnummer wird automatisch fortlaufend vergeben. Der Hinweis nach § 19 UStG (Kleinunternehmer) wird automatisch eingefügt.</p>
      <button class="btn block" type="submit" id="save">Rechnung erstellen</button>
    </form>
  `);

  const f = $('#f');
  const objsOf = () => data.objects.filter((o) => o.kundeId === f.kundeId.value && (o.aktiv !== false || objSel.has(o.id)));
  const month = () => f.monat.value;
  const openVisits = () => data.visits.filter((v) => objSel.has(v.objektId) && !v.rechnungId && v.datum.startsWith(month()) && (!einsatzId || v.id === einsatzId)).sort((a, b) => a.datum.localeCompare(b.datum));
  const openWinter = () => einsatzId ? [] : data.winter.filter((w) => objSel.has(w.objektId) && !w.rechnungId && w.datum.startsWith(month()) && data.omap[w.objektId]?.winterAbrechnung === 'einsatz').sort((a, b) => a.datum.localeCompare(b.datum));

  // Positionen aus Häusern, Einsätzen und Winterdienst des Monats
  const autoPositions = () => {
    const m = month();
    if (!m) return [];
    const multi = objSel.size > 1;
    const out = [];
    for (const o of objsOf().filter((x) => objSel.has(x.id))) {
      const prefix = multi ? `${objLabel(o)}: ` : '';
      const sel = openVisits().filter((v) => v.objektId === o.id && selV.has(v.id));
      if (isMonthly(o) && einsatzId) {
        // Einzelrechnung: die Monatspauschale gehört nicht dazu
      } else if (isMonthly(o)) {
        const old = positions.find((p) => p.pauschale && p.objektId === o.id);
        out.push({
          auto: true, pauschale: true, objektId: o.id, visitIds: sel.map((v) => v.id),
          beschreibung: `${prefix}Treppenhausreinigung – Monatspauschale ${monthLabel(m)}${sel.length ? `\nReinigungen am ${sel.map((v) => fmtDay(v.datum)).join(', ')}` : ''}`,
          datum: `${m}-01`, datumBis: lastOfMonth(m), menge: 1, einheit: 'Monat',
          preis: old ? old.preis : priceFor(o, m), art: 'arbeit',
        });
      } else {
        out.push(...sel.map((v) => ({ ...visitToPosition(v, o, prefix), objektId: o.id, auto: true })));
      }
      out.push(...extraPositions(sel, prefix).map((p) => ({ ...p, objektId: o.id, visitIds: sel.map((v) => v.id) })));
      const ws = openWinter().filter((w) => w.objektId === o.id && selW.has(w.id));
      if (ws.length) {
        out.push({
          auto: true, objektId: o.id, winterIds: ws.map((w) => w.id),
          beschreibung: `${prefix}Winterdienst – Räumen/Streuen (am ${ws.map((w) => fmtDay(w.datum)).join(', ')})`,
          datum: ws[0].datum, ...(ws.length > 1 ? { datumBis: ws[ws.length - 1].datum } : {}),
          menge: ws.length, einheit: 'Einsatz', preis: o.winterPreis || 0, art: 'arbeit',
        });
      }
    }
    return out;
  };
  const drawTotal = () => { $('#total').innerHTML = `Gesamt: <b>${money(positions.reduce((s, p) => s + positionTotal(p), 0))}</b>`; };
  const editor = positionsEditor($('#positions'), () => positions, drawTotal);
  const rebuild = () => { positions = [...autoPositions(), ...positions.filter((p) => !p.auto)]; editor.draw(); };
  const drawVisits = () => {
    const vs = openVisits();
    const ws = openWinter();
    selV.clear(); vs.forEach((v) => selV.add(v.id));
    selW.clear(); ws.forEach((w) => selW.add(w.id));
    const multi = objSel.size > 1;
    $('#visits').innerHTML = (vs.length ? `<div class="label">Einsätze im ${esc(monthLabel(month()))}</div>${vs.map((v) => `<label class="check"><input type="checkbox" data-visit="${v.id}" checked>
        ${multi ? `${esc(objLabel(data.omap[v.objektId]))} · ` : ''}${fmtDateLong(v.datum)}${v.stunden ? ` · ${fmtNum(v.stunden)} Std.` : ''}</label>`).join('')}` : (objSel.size ? `<p class="muted small">Keine offenen Einsätze im ${esc(monthLabel(month()))}.</p>` : ''))
      + (ws.length ? `<div class="label">❄️ Winterdienst-Einsätze</div>${ws.map((w) => `<label class="check"><input type="checkbox" data-winter="${w.id}" checked> ${multi ? `${esc(objLabel(data.omap[w.objektId]))} · ` : ''}${fmtDateLong(w.datum)} ${esc(w.von || '')}</label>`).join('')}` : '');
    positions = positions.filter((p) => !p.auto);
    rebuild();
  };
  const drawObjects = () => {
    const objs = objsOf();
    objSel.clear();
    objs.filter((o) => !q.objekt || o.id === q.objekt).forEach((o) => objSel.add(o.id));
    if (!objSel.size) objs.forEach((o) => objSel.add(o.id));
    q.objekt = '';
    $('#objBox').innerHTML = objs.length > 1 ? `<div class="label">Welche Häuser? <span class="muted small">(mehrere = Sammelrechnung)</span></div>
      <div class="chip-row">${objs.map((o) => `<label class="chip toggle ${objSel.has(o.id) ? 'on' : ''}"><input type="checkbox" data-obj="${o.id}" ${objSel.has(o.id) ? 'checked' : ''} hidden>🏢 ${esc(objLabel(o))}</label>`).join('')}</div>` : '';
    drawVisits();
  };

  f.kundeId.addEventListener('change', drawObjects);
  f.monat.addEventListener('change', drawVisits);
  $('#objBox').addEventListener('change', (e) => {
    const id = e.target.dataset.obj;
    if (!id) return;
    if (e.target.checked) objSel.add(id); else objSel.delete(id);
    e.target.closest('.chip').classList.toggle('on', e.target.checked);
    drawVisits();
  });
  $('#visits').addEventListener('change', (e) => {
    const { visit, winter } = e.target.dataset;
    const set = visit ? selV : winter ? selW : null;
    if (!set) return;
    if (e.target.checked) set.add(visit || winter); else set.delete(visit || winter);
    rebuild();
  });
  $('#positions').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    rm.closest('.pos').classList.add('leaving');
    setTimeout(() => {
      const [p] = positions.splice(Number(rm.dataset.rm), 1);
      for (const id of p.visitIds || (p.visitId ? [p.visitId] : [])) { selV.delete(id); const cb = $(`[data-visit="${id}"]`); if (cb) cb.checked = false; }
      for (const id of p.winterIds || []) { selW.delete(id); const cb = $(`[data-winter="${id}"]`); if (cb) cb.checked = false; }
      editor.draw();
    }, 200);
  });
  $('#addExtra').addEventListener('change', (e) => {
    const l = S.leistungen[e.target.value];
    e.target.value = '';
    if (!l) return;
    positions.push({ beschreibung: l.name, datum: today(), menge: 1, einheit: l.einheit, preis: l.preis, art: l.art || 'arbeit' });
    editor.draw();
    $('#positions .pos:last-child').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#addPos').addEventListener('click', () => {
    positions.push({ beschreibung: '', datum: today(), menge: 1, einheit: 'pauschal', preis: 0, art: 'arbeit' });
    editor.draw();
    $('#positions .pos:last-child').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const k = data.kmap[fd.get('kundeId')];
    const items = positions.filter((p) => p.beschreibung.trim() && num(p.menge) > 0);
    if (!items.length) return alert('Bitte mindestens eine Position mit Leistungsbeschreibung und Menge angeben.');
    if (items.some((p) => !p.datum)) return alert('Bitte bei jeder Position das Leistungsdatum angeben (Pflichtangabe).');
    if ((!k.strasse || !k.plzOrt) && !confirm('Beim Auftraggeber fehlt die Rechnungsadresse. Rechnungen über 250 € benötigen die vollständige Anschrift. Trotzdem erstellen?')) return;
    const monat = items.some((p) => p.pauschale) ? fd.get('monat') : null;
    if (monat && data.invoices.some((i) => i.kundeId === k.id && i.monat === monat && i.status !== 'storniert' && i.objekte?.some((x) => objSel.has(x.id)))
      && !confirm(`Für ${monthLabel(monat)} gibt es schon eine Rechnung für dieses Haus. Trotzdem noch eine erstellen?`)) return;
    const jaehrlich = [...objSel].map((id) => data.omap[id]).filter((o) => o && !monatlichAbgerechnet(o));
    if (jaehrlich.length && !einsatzId && !confirm(`${jaehrlich.map((o) => objLabel(o)).join(', ')} wird jährlich abgerechnet. Trotzdem monatlich abrechnen? Sonst wird doppelt berechnet.`)) return;
    $('#save').disabled = true;
    const datum = fd.get('datum');
    const positionen = items.map(({ auto, ...p }) => ({ ...p, beschreibung: p.beschreibung.trim(), menge: num(p.menge), betrag: positionTotal(p) }));
    const inv = {
      nummer: await nextNumber('invoices', S.nrPrefix || 'RE', datum, S.nrStart),
      datum,
      faellig: addDays(datum, Number(fd.get('zahlungsziel')) || 0),
      monat,
      kundeId: k.id,
      kunde: { name: k.name, ansprechpartner: k.ansprechpartner || '', strasse: k.strasse, plzOrt: k.plzOrt, privat: !!k.privat },
      objekte: [...objSel].map((id) => data.omap[id]).map((o) => ({ id: o.id, name: objLabel(o), adresse: objAddress(o) })),
      absender: absender(),
      positionen,
      summe: positionen.reduce((s, p) => s + p.betrag, 0),
      arbeitskosten: positionen.filter((p) => p.art !== 'material').reduce((s, p) => s + p.betrag, 0),
      notiz: fd.get('notiz').trim(),
      status: 'offen',
      erstellt: new Date().toISOString(),
    };
    await DB.put('invoices', inv);
    for (const id of positionen.flatMap((p) => p.visitIds || (p.visitId ? [p.visitId] : []))) {
      const v = data.visits.find((x) => x.id === id);
      v.rechnungId = inv.id;
      await DB.put('visits', v);
    }
    for (const id of positionen.flatMap((p) => p.winterIds || [])) {
      const w = data.winter.find((x) => x.id === id);
      w.rechnungId = inv.id;
      await DB.put('winter', w);
    }
    vibrate(15);
    toast(`✓ Rechnung ${inv.nummer} erstellt`);
    go(`#/rechnung/${inv.id}`, true);
  });

  drawObjects();
});

function itemsTable(positionen, summe) {
  return `<table class="inv-items">
      <thead><tr><th>Pos.</th><th>Datum</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis</th><th class="r">Betrag</th></tr></thead>
      <tbody>${positionen.map((p, i) => `<tr>
        <td>${i + 1}</td><td class="nowrap">${p.datum ? fmtDate(p.datum) : ''}${p.datumBis && p.datumBis !== p.datum ? `&nbsp;–<br>${fmtDate(p.datumBis)}` : ''}</td><td>${nl2br(p.beschreibung)}</td>
        <td class="r">${fmtNum(p.menge)} ${esc(p.einheit)}</td><td class="r">${money(p.preis)}</td><td class="r">${money(p.betrag ?? positionTotal(p))}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="4"></td><td class="r inv-total-label">Gesamtbetrag</td><td class="r inv-total">${money(summe)}</td></tr></tfoot>
    </table>`;
}

function invoiceDoc(inv) {
  const a = inv.absender;
  const k = inv.kunde;
  const von = inv.positionen.map((p) => p.datum).sort()[0];
  const bis = inv.positionen.map((p) => p.datumBis || p.datum).sort().pop();
  const zeitraum = von === bis ? fmtDate(von) : `${fmtDate(von)} – ${fmtDate(bis)}`;
  return `<article class="invoice-doc ${inv.status === 'storniert' ? 'cancelled' : ''}">
    ${docHeader(a)}
    <div class="inv-row">
      ${recipientBlock(k, a)}
      <table class="inv-meta">
        <tr><td>Rechnungsnr.</td><td><b>${esc(inv.nummer)}</b></td></tr>
        <tr><td>Rechnungsdatum</td><td>${fmtDate(inv.datum)}</td></tr>
        <tr><td>Leistungszeitraum</td><td>${zeitraum}</td></tr>
        <tr><td>Steuernummer</td><td>${esc(a.steuernummer)}</td></tr>
      </table>
    </div>
    <h2 class="inv-title">${inv.monat ? `Monatsrechnung <span>${esc(monthLabel(inv.monat))}</span>` : 'Rechnung'}${inv.status === 'storniert' ? ' – STORNIERT' : ''}</h2>
    ${inv.objekte?.length ? `<p class="inv-object">🏢 <b>Objekt${inv.objekte.length > 1 ? 'e' : ''}:</b> ${esc(inv.objekte.map((o) => o.adresse || o.name).join(' · '))}</p>` : ''}
    <p>für die erbrachten Leistungen stelle ich Ihnen folgende Beträge in Rechnung:</p>
    ${itemsTable(inv.positionen, inv.summe)}
    <p class="inv-note">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</p>
    ${k.privat
      ? `<p class="inv-note">Im Rechnungsbetrag sind Arbeits- und Fahrtkosten in Höhe von <b>${money(inv.arbeitskosten)}</b> enthalten (haushaltsnahe Dienstleistung, § 35a EStG). Die Steuerermäßigung setzt eine Zahlung per Überweisung voraus.</p>
         <p class="inv-note small">Bitte bewahren Sie diese Rechnung zwei Jahre auf (§ 14b Abs. 1 Satz 5 UStG).</p>`
      : `<p class="inv-note">Enthaltene Arbeits- und Fahrtkosten im Sinne des § 35a EStG (z. B. für die Betriebskostenabrechnung): <b>${money(inv.arbeitskosten)}</b>.</p>`}
    ${inv.raten
      ? `<p>Der Gesamtbetrag ist in ${inv.raten.length} Monatsraten zahlbar. Bitte überweisen Sie jede Rate zum genannten Termin unter Angabe der Rechnungsnummer auf das unten genannte Konto.</p>
        <table class="inv-items small-table"><thead><tr><th>Rate</th><th>Fällig am</th><th class="r">Betrag</th></tr></thead><tbody>${inv.raten.map((r) => `<tr><td>${r.nr}</td><td>${fmtDate(r.faellig)}</td><td class="r">${money(r.betrag)}</td></tr>`).join('')}</tbody></table>`
      : `<p>Bitte überweisen Sie den Gesamtbetrag ${inv.faellig > inv.datum ? `bis zum <b>${fmtDate(inv.faellig)}</b>` : '<b>sofort ohne Abzug</b>'} unter Angabe der Rechnungsnummer auf das unten genannte Konto.</p>`}
    ${inv.notiz ? `<p>${nl2br(inv.notiz)}</p>` : ''}
    <p>Mit freundlichen Grüßen<br>${esc(a.inhaber)}</p>
    ${docFooter(a)}
  </article>`;
}

route('/rechnung/:id', async ({ id }) => {
  const inv = await DB.get('invoices', id);
  if (!inv) return go('#/rechnungen', true);
  const [label, cls] = STATUS[inv.status];
  const overdue = inv.status === 'offen' && inv.faellig < today();
  const bezahlteRaten = inv.raten ? inv.raten.filter((r) => r.bezahltAm).length : 0;
  render(inv.nummer, `
    <div class="card no-print">
      <div class="row between"><span>Status</span><span class="badge ${overdue ? 'bad' : cls}">${overdue ? `überfällig seit ${fmtDate(inv.faellig)}` : label}${inv.raten ? ` · ${bezahlteRaten} von ${inv.raten.length} Raten` : ''}${inv.bezahltAm && !inv.raten ? ` am ${fmtDate(inv.bezahltAm)}` : ''}</span></div>
      ${inv.raten ? `<div class="mt">${inv.raten.map((r) => `<div class="row between small mt"><span>Rate ${r.nr} · fällig ${fmtDate(r.faellig)} · <b>${money(r.betrag)}</b></span>
        <button class="btn small ${r.bezahltAm ? 'ghost' : ''}" data-rate="${r.nr}">${r.bezahltAm ? `✓ ${fmtDate(r.bezahltAm)} · rückgängig` : '✓ bezahlt'}</button></div>`).join('')}</div>` : ''}
      <div class="quick">
        <button class="btn" id="sendPdf">📤 Als PDF senden</button>
        <button class="btn ghost" id="print">🖨️ Drucken</button>
        ${inv.raten ? '' : inv.status === 'offen' ? '<button class="btn ghost" id="paid">✓ Bezahlt</button>' : ''}
        ${inv.raten ? '' : inv.status === 'bezahlt' ? '<button class="btn ghost" id="unpaid">Wieder offen</button>' : ''}
        ${overdue ? `<button class="btn ghost" id="remind">${inv.mahnstufe ? `📨 ${inv.mahnstufe + 1}. Mahnung` : '⏰ Zahlungserinnerung'}</button>` : ''}
      </div>
      <p class="muted small">„Als PDF senden“ öffnet WhatsApp, E-Mail & Co. direkt mit der fertigen PDF.</p>
    </div>
    <div class="doc-wrap">${invoiceDoc(inv)}</div>
    ${inv.status !== 'storniert' ? '<button class="btn danger ghost block no-print" id="storno">Rechnung stornieren</button>' : ''}
    <button class="btn danger ghost block no-print mt" id="loeschen">🗑️ Rechnung ${esc(inv.nummer)} löschen</button>
    <p class="muted small no-print">Nur löschen, wenn die Rechnung noch nicht an den Kunden gegangen ist. Sonst bitte stornieren. Die Nummer ${esc(inv.nummer)} wird danach wieder für die nächste Rechnung vergeben, wenn es die neueste war.</p>
  `);
  wireDocButtons(`Rechnung ${inv.nummer}`, `Guten Tag${inv.kunde.ansprechpartner ? ` ${inv.kunde.ansprechpartner}` : ''},\n\nanbei erhalten Sie die Rechnung ${inv.nummer} über ${money(inv.summe)}.\n\nViele Grüße\n${inv.absender.inhaber}\n${inv.absender.firma}`);
  document.querySelectorAll('[data-rate]').forEach((btn) => btn.addEventListener('click', async () => {
    const r = inv.raten.find((x) => x.nr === Number(btn.dataset.rate));
    r.bezahltAm = r.bezahltAm ? null : today();
    Object.assign(inv, ratenStand(inv));
    await DB.put('invoices', inv);
    if (inv.status === 'bezahlt') { confetti(); vibrate([15, 60, 15]); toast('🎉 Alle Raten bezahlt'); }
    router();
  }));
  $('#paid')?.addEventListener('click', async () => {
    Object.assign(inv, { status: 'bezahlt', bezahltAm: today() });
    await DB.put('invoices', inv);
    confetti();
    vibrate([15, 60, 15]);
    toast('🎉 Bezahlt – sehr gut!');
    router();
  });
  $('#unpaid')?.addEventListener('click', async () => {
    Object.assign(inv, { status: 'offen', bezahltAm: null });
    await DB.put('invoices', inv);
    router();
  });
  $('#remind')?.addEventListener('click', async () => {
    const stufe = inv.mahnstufe || 0;
    const frist = fmtDate(addDays(today(), 7));
    const anrede = `Sehr geehrte Damen und Herren${inv.kunde.ansprechpartner ? `, ${inv.kunde.ansprechpartner}` : ''},`;
    const konto = `${inv.absender.bank ? `${inv.absender.bank}, ` : ''}IBAN ${inv.absender.iban}`;
    const text = stufe === 0
      ? [`Zahlungserinnerung – Rechnung ${inv.nummer}`, '', anrede, '',
        `sicher ist es Ihrer Aufmerksamkeit entgangen: Die Rechnung ${inv.nummer} vom ${fmtDate(inv.datum)} über ${money(restBetrag(inv))} war am ${fmtDate(inv.faellig)} fällig.`,
        'Bitte überweisen Sie den Betrag innerhalb der nächsten 7 Tage auf folgendes Konto:',
        konto, `Verwendungszweck: ${inv.nummer}`, '',
        'Sollte sich Ihre Zahlung mit dieser Erinnerung überschnitten haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.', '',
        'Mit freundlichen Grüßen', inv.absender.inhaber, inv.absender.firma].join('\n')
      : [`${stufe + 1}. Mahnung – Rechnung ${inv.nummer}`, '', anrede, '',
        `trotz unserer bisherigen Erinnerung ist die Rechnung ${inv.nummer} vom ${fmtDate(inv.datum)} über ${money(restBetrag(inv))} (fällig seit ${fmtDate(inv.faellig)}) noch nicht bei uns eingegangen.`,
        `Wir bitten Sie, den Betrag bis spätestens ${frist} auf folgendes Konto zu überweisen:`,
        konto, `Verwendungszweck: ${inv.nummer}`, '',
        'Bei Fragen zur Rechnung melden Sie sich bitte umgehend bei mir.', '',
        'Mit freundlichen Grüßen', inv.absender.inhaber, inv.absender.firma].join('\n');
    shareText(text, `${stufe === 0 ? 'Zahlungserinnerung' : `${stufe + 1}. Mahnung`} ${inv.nummer}`);
    inv.mahnstufe = stufe + 1;
    inv.letzteMahnung = today();
    await DB.put('invoices', inv);
    toast(`Gemerkt: ${stufe === 0 ? 'Zahlungserinnerung' : `${stufe + 1}. Mahnung`} gesendet`);
    router();
  });
  $('#storno')?.addEventListener('click', async () => {
    if (!confirm(`Rechnung ${inv.nummer} stornieren? Die Nummer bleibt vergeben, die Einsätze können neu abgerechnet werden.`)) return;
    inv.status = 'storniert';
    inv.storniertAm = today();
    await DB.put('invoices', inv);
    for (const v of await DB.by('visits', 'kundeId', inv.kundeId)) if (v.rechnungId === inv.id) { v.rechnungId = null; await DB.put('visits', v); }
    for (const w of await DB.all('winter')) if (w.rechnungId === inv.id) { w.rechnungId = null; await DB.put('winter', w); }
    toast('Rechnung storniert');
    router();
  });
  $('#loeschen')?.addEventListener('click', async () => {
    if (!confirm(`Rechnung ${inv.nummer} endgültig löschen? Das geht nicht rückgängig. Die Einsätze werden wieder als „nicht abgerechnet“ markiert.`)) return;
    for (const v of await DB.by('visits', 'kundeId', inv.kundeId)) if (v.rechnungId === inv.id) { v.rechnungId = null; await DB.put('visits', v); }
    for (const w of await DB.all('winter')) if (w.rechnungId === inv.id) { w.rechnungId = null; await DB.put('winter', w); }
    await DB.del('invoices', inv.id);
    toast(`Rechnung ${inv.nummer} gelöscht`);
    go('#/rechnungen', true);
  });
});

/* ---------- Angebote ---------- */
const ANGEBOT_STATUS = { offen: ['offen', 'warn'], angenommen: ['angenommen', 'ok'], abgelehnt: ['abgelehnt', 'soft'] };
// Offene Angebote, auf die seit NACHFASS_TAGE keine Antwort kam
const angebotNachfassen = (a) => a.status === 'offen' && daysBetween(a.datum, today()) >= NACHFASS_TAGE;
const OPTIONS = [
  ['aufzug', 'Aufzug reinigen', 'Aufzug reinigen (Kabine & Türen)', 0],
  ['keller', 'Kellergänge', 'Kellergänge fegen & wischen', 28],
  ['dachboden', 'Dachboden', 'Dachboden fegen', 91],
  ['aussen', 'Eingang außen & Gehweg', 'Eingangsbereich außen fegen', 0],
  ['muellplatz', 'Mülltonnenplatz', 'Mülltonnenplatz reinigen', 28],
];
const perMonth = (intervall) => (52 / 12) / (intervall / 7);

const RHYTHMEN = { 7: 'wöchentlich', 14: 'alle 2 Wochen', 28: 'alle 4 Wochen' };
const rhythmusOptionen = (sel) => [7, 14, 28].map((iv) => `<option value="${iv}" ${Number(sel) === iv ? 'selected' : ''}>${RHYTHMEN[iv]}</option>`).join('');
const ABLEHN_GRUENDE = ['Zu teuer', 'Anderer Anbieter', 'Keine Antwort', 'Sonstiges'];
// Standard-Leistungsumfang: Grundaufgaben plus die gewählten Zusatzoptionen
const standardLeistungen = (optionen) => [...TASK_SUGGESTIONS.slice(0, 7).map(([t]) => t), ...OPTIONS.filter(([key]) => optionen.includes(key)).map(([, , t]) => t)];
// Grobe Zeitschätzung je Reinigung: 8 Min. je Etage und Eingang, 10 Min. Rüstzeit, je Zusatzoption 10 Min.
const schaetzeDauer = (etagen, eing, anzahlOptionen) => Math.round(etagen * eing * 8 + 10 + anzahlOptionen * 10);
// Monatspreis, den der Kunde tatsächlich gewählt hat (bei zwei Varianten)
const angebotPreis = (a) => (a.angenommeneVariante === 'B' && a.varianteB ? a.varianteB.monatspreis : a.monatspreis);

route('/angebote', async () => {
  const angebote = await DB.all('angebote');
  angebote.sort((a, b) => b.nummer.localeCompare(a.nummer));
  // Auswertung: Annahmequote, Preis je Etage bei angenommenen und abgelehnten Angeboten, Ablehnungsgründe
  const gewonnen = angebote.filter((a) => a.status === 'angenommen');
  const verloren = angebote.filter((a) => a.status === 'abgelehnt');
  const entschieden = gewonnen.length + verloren.length;
  const quote = entschieden ? Math.round((gewonnen.length / entschieden) * 100) : null;
  const jeEtage = (list) => {
    const xs = list.filter((a) => a.objekt?.etagen).map((a) => angebotPreis(a) / (a.objekt.etagen * (a.objekt.eingaenge || 1)));
    return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
  };
  const pG = jeEtage(gewonnen);
  const pV = jeEtage(verloren);
  const gruende = {};
  verloren.forEach((a) => { const g = a.ablehnGrund || 'ohne Angabe'; gruende[g] = (gruende[g] || 0) + 1; });
  const tipp = pG && pV && pV > pG * 1.15
    ? `Abgelehnte Angebote lagen im Schnitt ${Math.round((pV / pG - 1) * 100)} % über den angenommenen.`
    : (gruende['Zu teuer'] || 0) >= 2 && gruende['Zu teuer'] >= verloren.length / 2 ? 'Die meisten Absagen waren „zu teuer“ – prüfe deinen Preis je Etage.' : '';
  render('Angebote', `
    <a class="btn block" href="#/angebot/neu">+ Angebot berechnen</a>
    ${angebote.length ? `<div class="card mt">
      <b>📊 Auswertung</b>
      <div class="row between small mt"><span>Angebote gesamt</span><b>${angebote.length}</b></div>
      <div class="row between small"><span>Annahmequote</span><b>${quote != null ? `${quote} % (${gewonnen.length} von ${entschieden})` : 'noch keine Entscheidung'}</b></div>
      <div class="row between small"><span>Ø je Etage und Monat – angenommen</span><b>${pG != null ? money(pG) : '–'}</b></div>
      <div class="row between small"><span>Ø je Etage und Monat – abgelehnt</span><b>${pV != null ? money(pV) : '–'}</b></div>
      ${verloren.length ? `<div class="small mt">Absagegründe: ${Object.entries(gruende).sort((x, y) => y[1] - x[1]).map(([g, n]) => `${esc(g)} ${n}×`).join(' · ')}</div>` : ''}
      ${tipp ? `<div class="small mt">💡 ${tipp}</div>` : ''}
    </div>` : ''}
    <div class="mt">${angebote.map((a) => {
      const [label, cls] = ANGEBOT_STATUS[a.status];
      return `<a class="card link" href="#/angebot/${a.id}">
        <div class="row between"><b>${esc(a.nummer)}</b><span class="badge ${cls}">${label}${a.ablehnGrund && a.status === 'abgelehnt' ? ` · ${esc(a.ablehnGrund)}` : ''}</span></div>
        <div class="row between small"><span class="muted">${esc(a.empfaenger.name)} · 🏢 ${esc(a.objekt.strasse)}</span><b>${money(angebotPreis(a))}/Monat</b></div>
        ${a.varianteB && a.status === 'offen' ? `<div class="muted small">oder ${money(a.varianteB.monatspreis)}/Monat (${RHYTHMEN[a.varianteB.intervallTage]})</div>` : ''}
        ${angebotNachfassen(a) ? `<div class="danger-text small">⏰ ohne Antwort seit ${daysBetween(a.datum, today())} Tagen</div>` : ''}
      </a>`;
    }).join('') || `<div class="empty">Noch keine Angebote.<br><span class="small">Mit dem Rechner kalkulierst du in einer Minute einen fairen Monatspreis.</span></div>`}</div>
  `);
});

route('/angebot/neu', (_, q) => angebotForm(null, q));
route('/angebot/:id/bearbeiten', async ({ id }) => {
  const a = await DB.get('angebote', id);
  if (!a) return go('#/angebote', true);
  return angebotForm(a);
});

async function angebotForm(a, q = {}) {
  const customers = (await DB.all('customers')).sort(byName);
  const isNew = !a;
  // Beim Bearbeiten die im Angebot verwendeten Preise nehmen, sonst die Richtwerte
  const K = { ...S.kalk, ...(a?.kalk || {}) };
  const fotosAlt = isNew ? [] : await DB.by('photos', 'visitId', a.id);
  const angebotFotos = [];
  const v = a || { kundeId: q.kunde || '', objekt: { strasse: '', plzOrt: '', etagen: 4, eingaenge: 1 }, intervallTage: 7, optionen: [], km: 0, zusatz: [], winterPreis: 0, notiz: '' };
  const neuerEmpfaenger = !isNew && !v.kundeId;
  const e = neuerEmpfaenger ? v.empfaenger : {};
  const zusatzNamen = (v.zusatz || []).map((z) => z.name);
  const leistungenText = (v.leistungen || standardLeistungen(v.optionen || [])).join('\n');
  render(isNew ? 'Angebot berechnen' : `${a.nummer} bearbeiten`, `
    <form id="f" class="form">
      ${customerSelect(customers, v.kundeId || '', { allowNew: true }).replace('Auftraggeber *', 'Empfänger *')}
      <div id="newRecipient" hidden>
        <label>Name / Firma<input name="eName" value="${esc(e.name || '')}" placeholder="z. B. Hausverwaltung Schmidt GmbH"></label>
        <label>Ansprechpartner<input name="eAnsprech" value="${esc(e.ansprechpartner || '')}"></label>
        <div class="grid2"><label>Straße<input name="eStrasse" value="${esc(e.strasse || '')}"></label><label>PLZ & Ort<input name="ePlzOrt" value="${esc(e.plzOrt || '')}"></label></div>
      </div>
      <h3 class="section">🏢 Objekt</h3>
      <div class="grid2"><label>Straße & Hausnr. *<input name="strasse" required value="${esc(v.objekt.strasse || '')}"></label><label>PLZ & Ort<input name="plzOrt" value="${esc(v.objekt.plzOrt || '')}"></label></div>
      <div class="grid3">
        <label>Etagen<input name="etagen" type="number" min="1" inputmode="numeric" value="${v.objekt.etagen || 4}"></label>
        <label>Eingänge<input name="eingaenge" type="number" min="1" inputmode="numeric" value="${v.objekt.eingaenge || 1}"></label>
        <label>Rhythmus<select name="intervall">${rhythmusOptionen(v.intervallTage)}</select></label>
      </div>
      <label>Zweite Variante zum Vergleich <span class="muted small">(optional, z. B. wöchentlich und alle 2 Wochen)</span><select name="intervall2"><option value="">– keine –</option>${rhythmusOptionen(v.varianteB?.intervallTage)}</select></label>
      <label>Entfernung zum Haus (km, einfach) <span class="muted small">– Anfahrt wird je Reinigung berechnet</span><input name="km" type="number" step="1" min="0" inputmode="numeric" value="${v.km || 0}"></label>
      <div class="label">Zusätzlich je Reinigung</div>
      <div class="chip-row">${OPTIONS.map(([key, label]) => { const on = (v.optionen || []).includes(key); return `<label class="chip toggle ${on ? 'on' : ''}"><input type="checkbox" name="opt_${key}" ${on ? 'checked' : ''} hidden>${label}</label>`; }).join('')}</div>
      <label class="check"><input type="checkbox" name="winter" ${v.winterPreis ? 'checked' : ''}> ❄️ Winterdienst optional anbieten</label>
      <div class="label">Optionale Zusatzleistungen <span class="muted small">(auf Abruf, nicht im Monatspreis)</span></div>
      <div class="chip-row">${S.leistungen.map((l, i) => { const on = zusatzNamen.includes(l.name); return `<label class="chip toggle ${on ? 'on' : ''}"><input type="checkbox" name="zus_${i}" ${on ? 'checked' : ''} hidden>${esc(l.name)} · ${unitPrice(l)}</label>`; }).join('') || '<span class="muted small">Keine Leistungen im Katalog.</span>'}</div>
      <details><summary>⚙️ Preise je Reinigung anpassen (Richtwerte)</summary>
        <div class="grid3 mt">
          <label>pro Etage (€)<input name="k_proEtage" type="number" step="0.5" min="0" value="${K.proEtage / 100}"></label>
          ${OPTIONS.map(([key, label]) => `<label>${label} (€)<input name="k_${key}" type="number" step="0.5" min="0" value="${(K[key] || 0) / 100}"></label>`).join('')}
          <label>Winter je Einsatz (€)<input name="k_winter" type="number" step="0.5" min="0" value="${(v.winterPreis || S.leistungen.find((l) => l.id === 'winter')?.preis || 2500) / 100}"></label>
        </div>
        <label class="check"><input type="checkbox" name="merken"> Diese Preise als Standard merken</label>
      </details>
      <label>Geschätzte Zeit je Reinigung (Min.) <span class="muted small">– nur für deinen Stundenlohn, steht nicht im Angebot</span><input name="dauer" type="number" min="5" step="5" inputmode="numeric" value="${v.dauer || ''}"></label>
      <div class="calc" id="calc"></div>
      <label>Leistungsumfang <span class="muted small">(eine Zeile je Punkt – streichen oder ergänzen)</span><textarea name="leistungen" rows="9">${esc(leistungenText)}</textarea></label>
      <button type="button" class="btn ghost small" id="stdLeist">↺ Standard aus den Optionen übernehmen</button>
      <label>Anmerkung im Angebot (optional)<textarea name="notiz" rows="2" placeholder="z. B. Reinigungsmittel sind im Preis enthalten.">${esc(v.notiz || '')}</textarea></label>
      <div class="label">Fotos des Hauses <span class="muted small">(erscheinen im Angebot)</span></div>
      <div id="angebotFotos"></div>
      <button class="btn block" type="submit">${isNew ? 'Angebot erstellen' : 'Änderungen speichern'}</button>
    </form>
  `);
  photoEditor($('#angebotFotos'), fotosAlt, angebotFotos, [['angebot', 'Fotos']]);
  const f = $('#f');
  if (neuerEmpfaenger) f.kundeId.value = '__neu';
  const zeigeEmpfaenger = () => { $('#newRecipient').hidden = f.kundeId.value !== '__neu'; };
  f.kundeId.addEventListener('change', zeigeEmpfaenger);
  zeigeEmpfaenger();
  const gewaehlteOptionen = () => OPTIONS.filter(([key]) => f[`opt_${key}`].checked).map(([key]) => key);
  $('#stdLeist').addEventListener('click', () => { f.leistungen.value = standardLeistungen(gewaehlteOptionen()).join('\n'); });

  const calc = () => {
    const etagen = Number(f.etagen.value) || 0;
    const eing = Number(f.eingaenge.value) || 1;
    const iv = Number(f.intervall.value);
    const iv2 = Number(f.intervall2.value) || 0;
    const km = num(f.km.value);
    const anfahrt = 2 * km * (KM_SATZ / 100);
    let perClean = etagen * eing * num(f.k_proEtage.value) + anfahrt;
    const opts = gewaehlteOptionen();
    for (const key of opts) perClean += num(f[`k_${key}`].value);
    const monat = (intervall, jeReinigung = perClean) => Math.ceil((jeReinigung * perMonth(intervall)) / 5) * 5;
    const monthly = monat(iv);
    const monthly2 = iv2 && iv2 !== iv ? monat(iv2) : 0;
    const perFloor = etagen ? monthly / (etagen * eing) : 0;
    const market = iv === 7 ? '25–80 €' : iv === 14 ? 'ca. 15–45 €' : 'ca. 10–30 €';
    // Stundenlohn: Preis je Reinigung ohne Fahrtkostenerstattung, geteilt durch Arbeits- und Fahrzeit
    const dauerAuto = schaetzeDauer(etagen, eing, opts.length);
    f.dauer.placeholder = `automatisch ${dauerAuto}`;
    const dauer = num(f.dauer.value) || dauerAuto;
    const fahrMin = Math.round(km * 2 * 1.5);
    const stunden = (dauer + fahrMin) / 60;
    const lohn = stunden ? Math.round(((perClean - anfahrt) * 100) / stunden) : 0;
    const noetig = monat(iv, 25 * stunden + anfahrt);
    $('#calc').innerHTML = `<div class="calc-row"><span>Reinigungen pro Monat</span><b>${fmtNum(Math.round(perMonth(iv) * 100) / 100)}</b></div>
      <div class="calc-row"><span>Preis je Reinigung</span><b>${money(Math.round(perClean * 100))}</b></div>
      ${km ? `<div class="calc-row small"><span>davon Anfahrt (2 × ${fmtNum(km)} km × 0,30 €)</span><b>${money(Math.round(anfahrt * 100))}</b></div>` : ''}
      <div class="calc-total"><span>Monatspreis${monthly2 ? ' (Variante A)' : ''}</span><b>${money(monthly * 100)}</b></div>
      ${monthly2 ? `<div class="calc-row"><span>Variante B (${RHYTHMEN[iv2]})</span><b>${money(monthly2 * 100)}</b></div>` : ''}
      <div class="muted small">= ${money(Math.round(perFloor * 100))} pro Etage und Monat · marktüblich ${market} (Firmen zzgl. 19 % USt – du bist ohne USt günstiger)</div>
      <div class="calc-row mt"><span>Zeit je Reinigung</span><b>${dauer} Min.${fahrMin ? ` + ca. ${fahrMin} Min. Fahrt` : ''}</b></div>
      <div class="calc-row"><span>Dein Stundenlohn</span><b class="st ${wageClass(lohn)}">${money(lohn)}/Std.</b></div>
      ${lohn < 2500 ? `<div class="small danger-text">Unter 25 €/Std. Für 25 €/Std. wären etwa <b>${money(noetig * 100)}/Monat</b> nötig.</div>` : ''}`;
    return { monthly: monthly * 100, monthly2: monthly2 * 100 };
  };
  f.addEventListener('input', calc);
  f.addEventListener('change', (ev) => { if (ev.target.closest('.chip')) ev.target.closest('.chip').classList.toggle('on', ev.target.checked); calc(); });
  calc();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    let empfaenger;
    let kundeId = fd.get('kundeId');
    if (kundeId === '__neu') {
      if (!fd.get('eName').trim()) return alert('Bitte den Namen des Empfängers eintragen.');
      empfaenger = { name: fd.get('eName').trim(), ansprechpartner: fd.get('eAnsprech').trim(), strasse: fd.get('eStrasse').trim(), plzOrt: fd.get('ePlzOrt').trim() };
      kundeId = null;
    } else {
      const c = customers.find((x) => x.id === kundeId);
      empfaenger = { name: c.name, ansprechpartner: c.ansprechpartner || '', strasse: c.strasse, plzOrt: c.plzOrt };
    }
    const leistungen = fd.get('leistungen').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!leistungen.length) return alert('Bitte mindestens einen Punkt im Leistungsumfang angeben.');
    if (fd.has('merken')) {
      S.kalk.proEtage = toCents(fd.get('k_proEtage'));
      for (const [key] of OPTIONS) S.kalk[key] = toCents(fd.get(`k_${key}`));
      await saveSettings();
    }
    const { monthly, monthly2 } = calc();
    const iv = Number(fd.get('intervall'));
    const iv2 = Number(fd.get('intervall2')) || 0;
    const etagen = Number(fd.get('etagen')) || 0;
    const eing = Number(fd.get('eingaenge')) || 1;
    const km = num(fd.get('km'));
    const optionen = gewaehlteOptionen();
    const zusatz = S.leistungen.filter((l, i) => fd.has(`zus_${i}`)).map((l) => ({ name: l.name, preis: l.preis, einheit: l.einheit }));
    // Ein überarbeitetes Angebot bekommt das heutige Datum und eine neue Gültigkeit, die Nummer bleibt
    const datum = today();
    const neu = {
      ...(a || {}),
      nummer: isNew ? await nextNumber('angebote', 'AN', datum) : a.nummer,
      datum,
      gueltigBis: addDays(datum, 30),
      kundeId,
      empfaenger,
      objekt: { strasse: fd.get('strasse').trim(), plzOrt: fd.get('plzOrt').trim(), etagen, eingaenge: eing, aufzug: optionen.includes('aufzug') },
      intervallTage: iv,
      optionen,
      leistungen,
      monatspreis: monthly,
      varianteB: monthly2 ? { intervallTage: iv2, monatspreis: monthly2 } : null,
      positionen: [{ beschreibung: `Treppenhausreinigung ${RHYTHMEN[iv]}${etagen ? ` – ${etagen} Etagen${eing > 1 ? `, ${eing} Eingänge` : ''}` : ''}${km ? `\ninkl. Anfahrt (${fmtNum(km)} km einfach)` : ''}\nLeistungsumfang siehe unten`, menge: 1, einheit: 'Monat', preis: monthly, art: 'arbeit' }],
      km,
      zusatz,
      winterPreis: fd.has('winter') ? toCents(fd.get('k_winter')) : 0,
      notiz: fd.get('notiz').trim(),
      dauer: num(fd.get('dauer')) || 0,
      kalk: Object.fromEntries([['proEtage', toCents(fd.get('k_proEtage'))], ...OPTIONS.map(([key]) => [key, toCents(fd.get(`k_${key}`))])]),
      absender: absender(),
      status: isNew ? 'offen' : a.status,
    };
    await DB.put('angebote', neu);
    await savePhotos(neu.id, angebotFotos);
    toast(isNew ? `✓ Angebot ${neu.nummer} erstellt` : `✓ Angebot ${neu.nummer} gespeichert`);
    go(`#/angebot/${neu.id}`, true);
  });
}

function angebotDoc(a, fotos = []) {
  const k = a.empfaenger;
  const ab = a.absender;
  return `<article class="invoice-doc">
    ${docHeader(ab)}
    <div class="inv-row">
      ${recipientBlock(k, ab)}
      <table class="inv-meta">
        <tr><td>Angebotsnr.</td><td><b>${esc(a.nummer)}</b></td></tr>
        <tr><td>Datum</td><td>${fmtDate(a.datum)}</td></tr>
        <tr><td>Gültig bis</td><td>${fmtDate(a.gueltigBis)}</td></tr>
      </table>
    </div>
    <h2 class="inv-title">Angebot <span>Treppenhausreinigung</span></h2>
    <p class="inv-object">🏢 <b>Objekt:</b> ${esc([a.objekt.strasse, a.objekt.plzOrt].filter(Boolean).join(', '))}</p>
    <p>vielen Dank für Ihr Interesse. Gerne biete ich Ihnen die regelmäßige Reinigung des oben genannten Objekts zu folgenden Konditionen an:</p>
    ${itemsTable(a.positionen, a.monatspreis).replace('Gesamtbetrag', a.varianteB ? 'Monatlich (Variante A)' : 'Monatlich')}
    ${a.varianteB ? `<h3 class="doc-h3">Zwei Varianten zur Wahl</h3>
      <table class="inv-items small-table"><thead><tr><th>Variante</th><th>Rhythmus</th><th class="r">Monatspreis</th></tr></thead><tbody>
        <tr><td>A</td><td>${RHYTHMEN[a.intervallTage]}</td><td class="r">${money(a.monatspreis)}</td></tr>
        <tr><td>B</td><td>${RHYTHMEN[a.varianteB.intervallTage]}</td><td class="r">${money(a.varianteB.monatspreis)}</td></tr>
      </tbody></table>` : ''}
    ${a.zusatz?.length ? `<h3 class="doc-h3">Optionale Zusatzleistungen <span class="doc-muted">(auf Abruf, nicht im Monatspreis enthalten)</span></h3>
      <table class="inv-items small-table"><thead><tr><th>Leistung</th><th class="r">Preis</th></tr></thead>
      <tbody>${a.zusatz.map((z) => `<tr><td>${esc(z.name)}</td><td class="r">${money(z.preis)}${z.einheit === 'pauschal' ? ' pauschal' : ` / ${esc(z.einheit)}`}</td></tr>`).join('')}</tbody></table>` : ''}
    <h3 class="doc-h3">Leistungsumfang</h3>
    <ul class="doc-list">${a.leistungen.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    ${a.winterPreis ? `<p class="inv-note">❄️ <b>Optional Winterdienst:</b> Räumen und Streuen der Zugänge und des Gehwegs bei Schnee und Glätte, inkl. Räum- und Streuprotokoll – ${money(a.winterPreis)} je Einsatz.</p>` : ''}
    <h3 class="doc-h3">Ihre Vorteile</h3>
    <ul class="doc-list">
      <li>Feste Ansprechperson: ${esc(ab.inhaber)}${ab.telefon ? `, Tel. ${esc(ab.telefon)}` : ''}</li>
      <li>Monatlicher Leistungsnachweis mit Fotos – ideal für die Betriebskostenabrechnung</li>
      <li>Festgestellte Mängel im Objekt melde ich Ihnen direkt mit Foto</li>
      <li>Keine Umsatzsteuer (Kleinunternehmer, § 19 UStG) – der genannte Preis ist ein Endpreis</li>
    </ul>
    ${fotos.length ? `<h3 class="doc-h3">Fotos</h3><div class="doc-photos">${fotos.map((p) => `<figure><img src="${objUrl(p.blob)}" alt=""></figure>`).join('')}</div>` : ''}
    ${a.notiz ? `<p>${nl2br(a.notiz)}</p>` : ''}
    <p>Ich freue mich auf Ihren Auftrag!</p>
    <p>Mit freundlichen Grüßen<br>${esc(ab.inhaber)}</p>
    <h3 class="doc-h3">Auftragserteilung</h3>
    <p>Hiermit beauftragen wir ${esc(ab.firma || ab.inhaber)} mit der Reinigung des Objekts ${esc(a.objekt.strasse)} gemäß Angebot ${esc(a.nummer)}${a.varianteB ? ` in der angekreuzten Variante: ☐ A (${RHYTHMEN[a.intervallTage]}) ☐ B (${RHYTHMEN[a.varianteB.intervallTage]})` : ''}.</p>
    <p>Gewünschter Beginn: ______________________</p>
    <div class="sign-row">${signSlot(null, 'Ort, Datum')}${signSlot(null, 'Unterschrift / Stempel Auftraggeber')}</div>
    <p class="doc-muted">Bitte unterschrieben zurücksenden – ein Foto oder Scan per E-Mail oder WhatsApp genügt.</p>
    ${docFooter(ab)}
  </article>`;
}

route('/angebot/:id', async ({ id }) => {
  const a = await DB.get('angebote', id);
  if (!a) return go('#/angebote', true);
  const [label, cls] = ANGEBOT_STATUS[a.status];
  const statusText = `${label}${a.status === 'abgelehnt' && a.ablehnGrund ? ` · ${a.ablehnGrund}` : ''}${a.status === 'angenommen' && a.varianteB ? ` · Variante ${a.angenommeneVariante || 'A'}` : ''}`;
  render(a.nummer, `
    <div class="card no-print">
      <div class="row between"><span>Status</span><span class="badge ${cls}">${esc(statusText)}</span></div>
      <div class="quick">
        <button class="btn" id="sendPdf">📤 Als PDF senden</button>
        <button class="btn ghost" id="print">🖨️ Drucken</button>
        ${a.status === 'offen' ? `<a class="btn ghost" href="#/angebot/${a.id}/bearbeiten">✏️ Bearbeiten</a>` : ''}
        ${a.status === 'offen' ? (a.varianteB
          ? `<button class="btn ghost" data-annehmen="A">🎉 Angenommen: A</button><button class="btn ghost" data-annehmen="B">🎉 Angenommen: B</button>`
          : '<button class="btn ghost" data-annehmen="A">🎉 Angenommen</button>') + '<button class="btn ghost" id="no">Abgelehnt</button>' : ''}
        ${a.objektId ? `<a class="btn ghost" href="#/objekt/${a.objektId}">🏢 Zum Haus</a>` : ''}
        ${a.status === 'angenommen' && a.objektId ? `<a class="btn ghost" href="#/rechnung/neu?kunde=${a.kundeId}&objekt=${a.objektId}">🧾 Erste Rechnung vorbereiten</a><button class="btn ghost" id="willkommen">🎉 Willkommen senden</button>` : ''}
      </div>
      <div id="gruende" class="mt" hidden>
        <div class="small muted">Warum abgelehnt? Hilft dir später bei der Preisfindung.</div>
        <div class="chip-row mt">${ABLEHN_GRUENDE.map((g) => `<button type="button" class="chip" data-grund="${g}">${g}</button>`).join('')}</div>
      </div>
    </div>
    ${angebotNachfassen(a) ? `<div class="card hint no-print"><b>⏰ Seit ${daysBetween(a.datum, today())} Tagen keine Antwort</b>
      <div class="muted small">Eine kurze Nachfrage bringt oft die Entscheidung.</div>
      <button class="btn small mt" id="nachfassen">✉️ Nachfrage senden</button></div>` : ''}
    <div class="doc-wrap">${angebotDoc(a, await DB.by('photos', 'visitId', a.id))}</div>
    <button class="btn danger ghost block no-print" id="del">Angebot löschen</button>
  `);
  wireDocButtons(`Angebot ${a.nummer}`, `Guten Tag${a.empfaenger.ansprechpartner ? ` ${a.empfaenger.ansprechpartner}` : ''},\n\nanbei erhalten Sie mein Angebot für die Treppenhausreinigung ${a.objekt.strasse}. Ich freue mich auf Ihre Rückmeldung!\n\nViele Grüße\n${a.absender.inhaber}\n${a.absender.firma}`);
  $('#willkommen')?.addEventListener('click', () => shareText(`Guten Tag${a.empfaenger.ansprechpartner ? ` ${a.empfaenger.ansprechpartner}` : ''},\n\nvielen Dank für Ihren Auftrag. Ich freue mich auf die Zusammenarbeit für ${a.objekt.strasse}. Bei Fragen melden Sie sich jederzeit bei mir.\n\nViele Grüße\n${a.absender.inhaber}\n${a.absender.firma}`, 'Willkommen'));
  $('#nachfassen')?.addEventListener('click', () => shareText(`Guten Tag${a.empfaenger.ansprechpartner ? ` ${a.empfaenger.ansprechpartner}` : ''},\n\nich wollte kurz nachfragen, ob Sie mein Angebot ${a.nummer} für die Treppenhausreinigung ${a.objekt.strasse} schon prüfen konnten. Gern beantworte ich Ihre Fragen.\n\nViele Grüße\n${a.absender.inhaber}\n${a.absender.firma}`, `Nachfrage ${a.nummer}`));
  $('#no')?.addEventListener('click', () => { $('#gruende').hidden = !$('#gruende').hidden; });
  document.querySelectorAll('[data-grund]').forEach((btn) => btn.addEventListener('click', async () => {
    Object.assign(a, { status: 'abgelehnt', ablehnGrund: btn.dataset.grund });
    await DB.put('angebote', a);
    router();
  }));
  document.querySelectorAll('[data-annehmen]').forEach((btn) => btn.addEventListener('click', async () => {
    const variante = btn.dataset.annehmen;
    const iv = variante === 'B' ? a.varianteB.intervallTage : a.intervallTage;
    const preis = variante === 'B' ? a.varianteB.monatspreis : a.monatspreis;
    if (!confirm(`Angebot angenommen${a.varianteB ? ` (Variante ${variante}: ${RHYTHMEN[iv]}, ${money(preis)}/Monat)` : ''}? Ich lege dann Auftraggeber und Haus mit Plan und Monatspreis an.`)) return;
    let kundeId = a.kundeId;
    if (!kundeId) kundeId = (await DB.put('customers', { ...a.empfaenger, telefon: '', email: '', privat: false, notizen: '' })).id;
    const tasks = a.leistungen.map((text) => ({ text, alleTage: TASK_SUGGESTIONS.find(([t]) => t === text)?.[1] ?? OPTIONS.find(([, , t]) => t === text)?.[3] ?? 0 }));
    const o = {
      kundeId, name: '', strasse: a.objekt.strasse, plzOrt: a.objekt.plzOrt, etagen: a.objekt.etagen, eingaenge: a.objekt.eingaenge, aufzug: a.objekt.aufzug,
      zugang: '', vorOrtName: '', vorOrtTelefon: '', intervallTage: iv, wochentag: '', uhrzeit: '',
      abrechnung: 'monat', monatspauschale: preis, stundensatz: S.stundensatz,
      winterAbrechnung: a.winterPreis ? 'einsatz' : 'keiner', winterPreis: a.winterPreis || 0, notizen: `Aus Angebot ${a.nummer}`, aktiv: true, aufgaben: tasks,
    };
    assignStarts(o, [], []);
    await DB.put('objects', o);
    Object.assign(a, { status: 'angenommen', kundeId, objektId: o.id, angenommeneVariante: variante });
    await DB.put('angebote', a);
    confetti();
    vibrate([15, 60, 15]);
    toast('🎉 Glückwunsch zum neuen Auftrag!');
    go(`#/objekt/${o.id}/bearbeiten`);
  }));
  $('#del').addEventListener('click', async () => {
    if (!confirm('Angebot löschen?')) return;
    await DB.del('angebote', a.id);
    go('#/angebote', true);
  });
});

/* ---------- Jahresrechnung: Reinigung eines Hauses für ein ganzes Jahr ---------- */
// nachträglich: Pauschale je Monat plus Einsätze (bei Stundenabrechnung) des Jahres
// im Voraus: Pauschale für das Folgejahr (nur bei Monatspauschale)
// Winterdienst bleibt monatlich, er wird hier nicht abgerechnet.
route('/objekt/:id/jahresrechnung', async ({ id }, q) => {
  const o = await DB.get('objects', id);
  if (!o) return go('#/objekte', true);
  const k = (await DB.get('customers', o.kundeId)) || { name: '' };
  const modus = q.modus === 'voraus' ? 'voraus' : 'nach';
  const jahr = String(Number(q.jahr) || (modus === 'voraus' ? new Date().getFullYear() + 1 : new Date().getFullYear() - 1));
  const vorhanden = (await DB.all('invoices')).find((i) => i.zeitraum === jahr && i.status !== 'storniert' && i.objekte?.some((x) => x.id === o.id));
  const positionen = [];
  const hinweise = [];
  if (isMonthly(o)) {
    for (let mm = 1; mm <= 12; mm++) {
      const m = `${jahr}-${String(mm).padStart(2, '0')}`;
      positionen.push({ beschreibung: `Treppenhausreinigung – Monatspauschale ${monthLabel(m)}`, datum: `${m}-01`, datumBis: lastOfMonth(m), menge: 1, einheit: 'Monat', preis: priceFor(o, m), art: 'arbeit', objektId: o.id });
    }
  }
  if (modus === 'nach') {
    const visits = (await DB.all('visits')).filter((v) => v.objektId === o.id && v.datum.startsWith(jahr) && !v.rechnungId).sort((a, b) => a.datum.localeCompare(b.datum));
    if (isMonthly(o)) {
      // Einsätze sind durch die Pauschale abgedeckt, werden aber als abgerechnet markiert
      if (positionen[0] && visits.length) positionen[0].visitIds = visits.map((v) => v.id);
    } else {
      positionen.push(...visits.map((v) => ({ ...visitToPosition(v, o), objektId: o.id, visitIds: [v.id] })));
    }
  } else if (!isMonthly(o)) {
    hinweise.push('Im Voraus geht nur mit Monatspauschale. Bei Stundenabrechnung bitte nachträglich abrechnen.');
  }
  const gesperrt = !positionen.length || (modus === 'voraus' && !isMonthly(o));
  const summe = positionen.reduce((s, p) => s + Math.round((p.preis || 0) * (p.menge || 0)), 0);
  render(`Jahresrechnung ${jahr}`, `
    <div class="card">
      <b>${esc(objLabel(o))}</b> · ${esc(k.name)}
      <div class="muted small">${modus === 'voraus' ? `Vorauszahlung für ${jahr}` : `Abrechnung für ${jahr}, nachträglich`}</div>
    </div>
    ${vorhanden ? `<div class="card hint">Für ${jahr} gibt es schon Rechnung ${esc(vorhanden.nummer)}. Trotzdem eine neue erstellen?</div>` : ''}
    ${hinweise.map((h) => `<div class="card hint">${esc(h)}</div>`).join('')}
    <form id="jf" class="form mt">
      <div class="grid2">
        <label>Rechnungsdatum<input type="date" name="datum" required value="${today()}"></label>
        <label id="jziel">Zahlungsziel (Tage)<input type="number" name="zahlungsziel" min="0" value="${S.zahlungsziel}"></label>
      </div>
      <label>Zahlung<select name="zahlung" id="jzahlung"><option value="einmal">in einer Summe</option><option value="raten">in 12 Monatsraten</option></select></label>
      <label id="jrate" hidden>Erste Rate fällig am<input type="date" name="ersteRate" value="${isoDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1))}"></label>
      <div class="label">Positionen</div>
      ${positionen.length ? `<table class="inv-items"><thead><tr><th>Leistung</th><th class="r">Betrag</th></tr></thead><tbody>${positionen.map((p) => `<tr><td>${esc(p.beschreibung)}</td><td class="r">${money(Math.round((p.preis || 0) * (p.menge || 0)))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty small">Im Zeitraum gibt es nichts abzurechnen.</div>'}
      <div class="total">Gesamt: <b>${money(summe)}</b> <span class="muted small">(ohne Umsatzsteuer, Kleinunternehmer)</span></div>
      <p class="muted small">Winterdienst wird weiterhin monatlich abgerechnet.</p>
      <button class="btn block" type="submit" id="jsave" ${gesperrt ? 'disabled' : ''}>Jahresrechnung erstellen</button>
    </form>
  `, { tab: '', back: true });

  $('#jzahlung').addEventListener('change', (e) => {
    const raten = e.target.value === 'raten';
    $('#jrate').hidden = !raten;
    $('#jziel').hidden = raten;
  });

  $('#jf').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (vorhanden && !confirm(`Für ${jahr} gibt es schon Rechnung ${vorhanden.nummer}. Trotzdem noch eine erstellen?`)) return;
    $('#jsave').disabled = true;
    const fd = new FormData(e.target);
    const datum = fd.get('datum');
    const pos = positionen.map((p) => ({ ...p, betrag: Math.round((p.preis || 0) * (p.menge || 0)) }));
    const summeNeu = pos.reduce((s, p) => s + p.betrag, 0);
    const raten = fd.get('zahlung') === 'raten' && fd.get('ersteRate') ? ratenPlan(summeNeu, 12, fd.get('ersteRate')) : null;
    const inv = {
      nummer: await nextNumber('invoices', S.nrPrefix || 'RE', datum, S.nrStart),
      datum,
      faellig: raten ? raten[0].faellig : addDays(datum, Number(fd.get('zahlungsziel')) || 0),
      ...(raten ? { raten } : {}),
      monat: null,
      zeitraum: jahr,
      kundeId: o.kundeId,
      kunde: { name: k.name, ansprechpartner: k.ansprechpartner || '', strasse: k.strasse || '', plzOrt: k.plzOrt || '', privat: !!k.privat },
      objekte: [{ id: o.id, name: objLabel(o), adresse: objAddress(o) }],
      absender: absender(),
      positionen: pos,
      summe: pos.reduce((s, p) => s + p.betrag, 0),
      arbeitskosten: pos.filter((p) => p.art !== 'material').reduce((s, p) => s + p.betrag, 0),
      notiz: '',
      status: 'offen',
      erstellt: new Date().toISOString(),
    };
    await DB.put('invoices', inv);
    for (const id of pos.flatMap((p) => p.visitIds || [])) {
      const v = await DB.get('visits', id);
      if (v) { v.rechnungId = inv.id; await DB.put('visits', v); }
    }
    vibrate(15);
    toast(`✓ Jahresrechnung ${inv.nummer} erstellt`);
    go(`#/rechnung/${inv.id}`, true);
  });
});
