'use strict';

/* ---------- Monatsabschluss-Assistent: was ist für den Monat abzurechnen? ---------- */
route('/monatsabschluss', async (_, q) => {
  const m = q.monat || prevMonth();
  const data = await loadAll();
  const ausgaben = (await DB.all('ausgaben')).filter((a) => a.datum.startsWith(m));
  const ohneBeleg = ausgaben.filter((a) => !a.fotoAnzahl).length;
  const omap = data.omap;

  // Jahresrechnungen, die in diesem Monat anstehen: nachträglich fürs Vorjahr, im Voraus ab November fürs Folgejahr
  const jahresFaelligkeit = (o) => {
    const [j, mm] = m.split('-').map(Number);
    const z = zyklusOf(o);
    if (z === 'jahr') return [{ modus: 'nach', jahr: String(j - 1) }];
    if (z === 'voraus' && mm >= 11) return [{ modus: 'voraus', jahr: String(j + 1) }];
    return [];
  };
  const jahrZeile = (j) => `<div class="small mt">📅 ${esc(objLabel(j.o))}: ${j.modus === 'voraus' ? `Vorauszahlung für ${j.jahr}` : `Jahresabrechnung ${j.jahr}, nachträglich · spätestens Mitte Juni ${Number(j.jahr) + 1}`}</div>
    ${j.erstellt ? '<span class="badge ok">✓ Rechnung erstellt</span>' : `<a class="btn small mt" href="#/objekt/${j.o.id}/jahresrechnung?jahr=${j.jahr}&modus=${j.modus}">📅 Jahresrechnung ${j.jahr} vorbereiten</a>`}`;

  const rows = data.customers.map((c) => {
    const objs = data.objects.filter((o) => o.kundeId === c.id && o.aktiv !== false);
    if (!objs.length) return null;
    // Monatlich: Reinigung nur für Häuser mit monatlicher Abrechnung. Winterdienst bleibt immer monatlich.
    const monatlich = objs.filter(monatlichAbgerechnet);
    const jahrJobs = objs.filter((o) => !monatlichAbgerechnet(o)).flatMap((o) => jahresFaelligkeit(o).map((j) => ({ ...j, o, erstellt: data.invoices.some((i) => i.zeitraum === j.jahr && i.status !== 'storniert' && i.objekte?.some((x) => x.id === o.id)) })));
    if (!monatlich.length && !jahrJobs.length) return null;
    const ids = monatlich.map((o) => o.id);
    const visits = data.visits.filter((v) => ids.includes(v.objektId) && v.datum.startsWith(m) && !v.rechnungId);
    const winter = data.winter.filter((w) => objs.some((o) => o.id === w.objektId) && w.datum.startsWith(m) && !w.rechnungId && omap[w.objektId]?.winterAbrechnung === 'einsatz');
    const rechnung = data.invoices.find((i) => i.kundeId === c.id && i.monat === m && i.status !== 'storniert');
    const pauschal = monatlich.some(isMonthly);
    const offen = visits.length + winter.length;
    let status;
    if (rechnung) status = 'done';
    else if (pauschal || offen) status = 'ready';
    else status = 'none';
    return { c, objs, monatlich, jahrJobs, visits, winter, rechnung, pauschal, offen, status };
  }).filter(Boolean).sort((a, b) => (a.status === 'ready' ? 0 : a.status === 'none' ? 2 : 1) - (b.status === 'ready' ? 0 : b.status === 'none' ? 2 : 1));

  // Ratenzahlungen: offen bis Monatsende (auch Altlasten) und im Monat bezahlte
  // Offen sind alle Raten, die bis heute oder bis Monatsende des angezeigten Monats fällig sind
  const bisDatum = lastOfMonth(m) > today() ? lastOfMonth(m) : today();
  const zahlungen = data.invoices.filter((i) => i.raten && i.status !== 'storniert')
    .flatMap((inv) => inv.raten.map((r) => ({ inv, r })))
    .filter(({ r }) => (!r.bezahltAm && r.faellig <= bisDatum) || (r.bezahltAm && r.bezahltAm.startsWith(m)))
    .sort((x, y) => (x.r.bezahltAm ? 1 : 0) - (y.r.bezahltAm ? 1 : 0) || x.r.faellig.localeCompare(y.r.faellig));

  const ready = rows.filter((r) => r.status === 'ready').length;
  const done = rows.filter((r) => r.status === 'done').length;
  const total = rows.filter((r) => r.status !== 'none').length;
  const prev = isoDate(new Date(parseISO(`${m}-01`).getFullYear(), parseISO(`${m}-01`).getMonth() - 1, 1)).slice(0, 7);
  const next = addDays(lastOfMonth(m), 1).slice(0, 7);

  const vorStart = S.betriebsstart && m < S.betriebsstart.slice(0, 7);
  render('Monatsabschluss', `
    ${vorStart ? `<div class="card hint">📅 Dein Betrieb startet am <b>${fmtDate(S.betriebsstart)}</b>. Für ${esc(monthLabel(m))} gibt es noch nichts abzurechnen.</div>` : ''}
    <div class="card month-head">
      <div class="row between">
        <a class="icon-btn" href="#/monatsabschluss?monat=${prev}" aria-label="Vormonat">‹</a>
        <b>${esc(monthLabel(m))}</b>
        <a class="icon-btn" href="#/monatsabschluss?monat=${next}" aria-label="Nächster Monat">›</a>
      </div>
      <div class="bar"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
      <div class="muted small">${total ? `${done} von ${total} Rechnungen erstellt` : 'Für diesen Monat ist nichts abzurechnen.'}${ready ? ` · <b>${ready} ${ready === 1 ? 'fehlt' : 'fehlen'} noch</b>` : ''}</div>
    </div>
    ${ohneBeleg ? `<a class="card hint" href="#/ausgaben">🧾 <b>${ohneBeleg} Ausgabe${ohneBeleg === 1 ? '' : 'n'}</b> ohne Belegfoto in diesem Monat.</a>` : ''}
    ${zahlungen.length ? `<h3 class="doc-h3">💶 Zahlungseingänge</h3>
      <p class="muted small">Ratenzahlungen, die bis Monatsende fällig sind. Abhaken, sobald das Geld da ist.</p>
      ${zahlungen.map(({ inv, r }) => `<div class="card abschluss ${r.bezahltAm ? 'done' : 'ready'}">
        <div class="row between"><b>${esc(inv.kunde?.name || '')}</b><span class="muted small">${esc(inv.nummer)} · Rate ${r.nr}/${inv.raten.length}</span></div>
        <div class="row between small mt"><span>fällig ${fmtDate(r.faellig)} · <b>${money(r.betrag)}</b>${r.bezahltAm ? ` · bezahlt am ${fmtDate(r.bezahltAm)}` : ''}</span>
          <button class="btn small ${r.bezahltAm ? 'ghost' : ''}" data-rate-inv="${inv.id}" data-rate-nr="${r.nr}">${r.bezahltAm ? 'rückgängig' : '✓ bezahlt'}</button></div>
      </div>`).join('')}` : ''}
    ${rows.map((r) => `<div class="card abschluss ${r.status}">
      <div class="row between"><b>👥 ${esc(r.c.name)}</b>
        ${r.status === 'done' ? '<span class="badge ok">✓ erstellt</span>' : r.status === 'ready' ? '<span class="badge warn">offen</span>' : '<span class="badge soft">nichts zu tun</span>'}</div>
      <div class="muted small">${!r.monatlich.length ? 'Jährliche Abrechnung' : r.pauschal ? 'Monatspauschale' : 'Nach Stunden'}${r.visits.length ? ` · ${r.visits.length} Einsatz${r.visits.length === 1 ? '' : 'e'}` : ''}${r.winter.length ? ` · ❄️ ${r.winter.length} Winter` : ''} · ${r.objs.map((o) => esc(objLabel(o))).join(', ')}</div>
      ${r.rechnung ? `<div class="small mt">Rechnung ${esc(r.rechnung.nummer)} · ${money(r.rechnung.summe)}</div>` : ''}
      ${r.jahrJobs.map(jahrZeile).join('')}
      <div class="row gap mt">
        ${r.status === 'ready' ? `<a class="btn small" href="#/rechnung/neu?kunde=${r.c.id}&monat=${m}">🧾 Rechnung vorbereiten</a>` : ''}
        ${r.rechnung ? `<a class="btn small ghost" href="#/rechnung/${r.rechnung.id}">Rechnung ansehen</a>` : ''}
        ${r.objs.map((o) => `<a class="btn small ghost" href="#/objekt/${o.id}/nachweis?monat=${m}">📄 Nachweis</a>`).join('')}
      </div>
    </div>`).join('') || '<div class="empty">Noch keine Auftraggeber mit Häusern.</div>'}
    <p class="muted small">Der Assistent erstellt nichts automatisch. Du prüfst jede Rechnung vor dem Versand.</p>
  `, { tab: '', back: true });
  document.querySelectorAll('[data-rate-inv]').forEach((btn) => btn.addEventListener('click', async () => {
    const inv = await DB.get('invoices', btn.dataset.rateInv);
    const r = inv.raten.find((x) => x.nr === Number(btn.dataset.rateNr));
    r.bezahltAm = r.bezahltAm ? null : today();
    Object.assign(inv, ratenStand(inv));
    await DB.put('invoices', inv);
    if (inv.status === 'bezahlt') toast('🎉 Alle Raten bezahlt');
    router();
  }));
});
