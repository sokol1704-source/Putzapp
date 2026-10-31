'use strict';

/* ---------- Start ---------- */
route('/', async () => {
  const data = await loadAll();
  const plan = planning(data);
  const t = today();
  const week = addDays(t, 7);
  const overdue = plan.filter((p) => p.datum < t);
  const heute = plan.filter((p) => p.datum === t);
  const woche = plan.filter((p) => p.datum > t && p.datum <= week);
  const spaeter = plan.filter((p) => p.datum > week).slice(0, 3);
  const unbilled = data.visits.filter((v) => !v.rechnungId).length;
  const offen = data.invoices.filter((i) => i.status === 'offen');
  const offenSumme = offen.reduce((s, i) => s + i.summe, 0);
  const maengelOffen = data.maengel.filter((m) => m.status !== 'erledigt').length;
  const fastLeer = (await DB.all('material')).filter(isLow);
  const umsatzMonat = data.invoices.filter((i) => i.status !== 'storniert' && i.datum.startsWith(t.slice(0, 7))).reduce((s, i) => s + i.summe, 0);

  // Auftraggeber mit nicht abgerechneten Einsätzen im Vormonat → Monatsrechnung fällig
  const pm = prevMonth();
  const dueCustomers = data.customers.filter((c) => data.visits.some((v) => v.kundeId === c.id && !v.rechnungId && v.datum.startsWith(pm))
    || data.winter.some((w) => data.omap[w.objektId]?.kundeId === c.id && !w.rechnungId && w.datum.startsWith(pm) && data.omap[w.objektId]?.winterAbrechnung === 'einsatz'));

  // Mit automatischer Sicherung (Android-App) reicht es, ab und zu eine Kopie in die Cloud zu legen
  const backupDue = data.visits.length > 0 && (!S.letzteSicherung || daysBetween(S.letzteSicherung, t) > (S.letzteAutoSicherung ? 30 : 7));
  const ueberfaellig = data.invoices.filter((i) => i.status === 'offen' && i.faellig < t);
  const morgenPlan = plan.filter((p) => p.datum === addDays(t, 1) && p.objektId);
  const preisAlt = data.objects.filter((o) => o.aktiv !== false && isMonthly(o) && !o.neuerPreis && (() => {
    const letzte = o.preisHistorie?.length ? o.preisHistorie[o.preisHistorie.length - 1].ab : data.visits.filter((v) => v.objektId === o.id).map((v) => v.datum).sort()[0];
    return letzte && daysBetween(letzte, t) >= 365;
  })());
  const maengelAlt = data.maengel.filter((m) => m.status !== 'erledigt' && daysBetween(m.datum, t) >= NACHFASS_TAGE).length;
  const angeboteAlt = data.angebote.filter(angebotNachfassen).length;
  const gp = gruendungProgress();
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Guten Abend';
  const firstName = (S.inhaber || '').split(' ')[0];
  const todayCount = heute.length + overdue.length;
  const section = (title, items) => (items.length ? `<h3 class="section">${title}</h3>${items.map((i) => planCard(i, data)).join('')}` : '');

  render(S.firma, `
    <div class="hero">
      <div class="hero-bubbles"><span></span><span></span><span></span><span></span></div>
      <div class="hero-date">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div class="hero-title">${greet}${firstName ? `, ${esc(firstName)}` : ''} 👋</div>
      <div class="hero-sub">${todayCount ? `Heute stehen <b>${todayCount} ${todayCount === 1 ? 'Haus' : 'Häuser'}</b> an${overdue.length ? ` (davon ${overdue.length} überfällig)` : ''}.` : 'Heute ist nichts geplant – Zeit für Büroarbeit ☕'}</div>
      <div class="row gap mt">
        <a class="btn light" href="#/tour">🚐 Tour heute</a>
        <a class="btn glass" href="#/einsatz/neu">🧽 Einsatz erfassen</a>
      </div>
    </div>
    ${ueberfaellig.length ? `<a class="card hint" href="#/rechnungen">💶 <b>${ueberfaellig.length} ${ueberfaellig.length === 1 ? 'Rechnung ist' : 'Rechnungen sind'} überfällig</b> – zusammen ${money(ueberfaellig.reduce((s, i) => s + i.summe, 0))}. Erinnerung oder Mahnung mit einem Klick.</a>` : ''}
    ${data.objects.length ? '' : `<div class="card">
      <b>👋 So fängst du an</b>
      <ol class="small">
        <li><a href="#/einstellungen">Firmendaten</a> eintragen (für Rechnungen Pflicht)</li>
        <li><a href="#/kunde/neu">Auftraggeber</a> anlegen, z. B. die Hausverwaltung</li>
        <li><a href="#/objekt/neu">Haus</a> mit Adresse, Intervall und Preis anlegen</li>
        <li><a href="#/einsatz/neu">Einsatz</a> erfassen oder mit „Start“ die Zeit messen</li>
      </ol>
      <div class="muted small">Für eine Vertretung: Im Haus stehen Zugang, Aufgaben und die Fotopflicht. Alles bleibt auf diesem Handy, mach deshalb regelmäßig eine Sicherung.</div>
    </div>`}
    ${morgenPlan.length ? `<a class="card hint" href="#/bestaetigen">📨 <b>Morgen ${morgenPlan.length} ${morgenPlan.length === 1 ? 'Termin' : 'Termine'}</b> – Auftraggeber kurz Bescheid geben.</a>` : ''}
    ${preisAlt.length ? `<a class="card hint" href="#/preise">📈 <b>${preisAlt.length} ${preisAlt.length === 1 ? 'Haus hat' : 'Häuser haben'} seit über einem Jahr keine Preisanpassung.</b> Eine frühe Ankündigung ist fair.</a>` : ''}
    ${maengelAlt ? `<a class="card hint" href="#/maengel">⏰ <b>${maengelAlt} ${maengelAlt === 1 ? 'Mangel ist' : 'Mängel sind'} seit über ${NACHFASS_TAGE} Tagen offen.</b> Kurz bei der Verwaltung nachhaken.</a>` : ''}
    ${angeboteAlt ? `<a class="card hint" href="#/angebote">✉️ <b>${angeboteAlt} ${angeboteAlt === 1 ? 'Angebot wartet' : 'Angebote warten'} auf Antwort.</b> Eine Nachfrage hilft oft.</a>` : ''}
    ${backupDue ? `<a class="card hint" href="#/einstellungen">💾 <b>Zeit für eine Datensicherung!</b> ${S.letzteSicherung ? `Die letzte ist vom ${fmtDate(S.letzteSicherung)}.` : 'Du hast noch keine erstellt.'} Alle Daten liegen nur auf diesem Handy.</a>` : ''}
    ${gp.done < gp.total && !S.gruendungAusgeblendet ? `<a class="card link g-start" href="#/gruendung">
      <div class="row between"><b>🚀 Gründung: ${gp.done} von ${gp.total} erledigt</b><span class="muted">›</span></div>
      <div class="bar"><div style="width:${(gp.done / gp.total) * 100}%"></div></div>
      <div class="muted small">Nächster Schritt: ${esc(visibleSteps().find((s) => !isDone(s))?.title || '')}</div></a>` : ''}
    ${settingsComplete() ? '' : `<a class="card hint" href="#/einstellungen">⚠️ <b>Firmendaten fehlen.</b> Für korrekte Rechnungen bitte Name, Anschrift und Steuernummer eintragen.</a>`}
    ${fastLeer.length ? `<a class="card link shop-hint" href="#/material?tab=einkauf"><div class="row between"><b>🛒 ${fastLeer.length} ${fastLeer.length === 1 ? 'Sache' : 'Sachen'} fast leer</b><span class="muted">›</span></div>
      <div class="muted small">${esc(fastLeer.map((m) => m.name).join(', '))}</div></a>` : ''}
    <div id="weather"></div>
    <div class="qa">
      <a href="#/mangel/neu"><span>⚠️</span>Mangel melden</a>
      <a href="#/winter/neu"><span>❄️</span>Winterdienst</a>
      <a href="#/objekt/neu"><span>🏢</span>Neues Haus</a>
      <a href="#/angebot/neu"><span>📝</span>Angebot</a>
    </div>
    <div class="stats">
      <a class="stat" href="#/einsaetze?filter=offen"><b data-count="${unbilled}">${unbilled}</b><span>Einsätze nicht abgerechnet</span></a>
      <a class="stat" href="#/rechnungen?filter=offen"><b data-count="${offenSumme}" data-money>${money(offenSumme)}</b><span>${offen.length} offene Rechnung${offen.length === 1 ? '' : 'en'}</span></a>
      <a class="stat" href="#/maengel"><b data-count="${maengelOffen}">${maengelOffen}</b><span>offene Mängel</span></a>
      <a class="stat" href="#/rechnungen"><b data-count="${umsatzMonat}" data-money>${money(umsatzMonat)}</b><span>Umsatz ${new Date().toLocaleDateString('de-DE', { month: 'long' })}</span></a>
    </div>
    ${dueCustomers.length ? `<h3 class="section">🧾 Rechnungen für ${esc(monthLabel(pm))}</h3>
      ${dueCustomers.map((c) => `<div class="card plan">
        <div class="row between"><a class="strong" href="#/kunde/${c.id}">👥 ${esc(c.name)}</a><span class="badge warn">fällig</span></div>
        <div class="row gap mt"><a class="btn small" href="#/rechnung/neu?kunde=${c.id}&monat=${pm}">Rechnung erstellen</a></div>
      </div>`).join('')}` : ''}
    ${section('⚠️ Überfällig', overdue)}
    ${section('📍 Heute', heute)}
    ${section('🗓️ Nächste 7 Tage', woche)}
    ${section('Später', spaeter)}
    ${plan.length ? '' : `<div class="empty">
      <p>Noch keine anstehenden Reinigungen.</p>
      <p class="muted small">Lege Häuser mit Reinigungsplan an – dann siehst du hier, wann du wo putzen musst.</p>
      <a class="btn" href="#/objekt/neu">+ Erstes Haus anlegen</a>
    </div>`}
  `, { tab: 'start', back: false });
  fillWeatherCard($('#weather'), data.objects);
});

/* ---------- Mehr ---------- */
route('/mehr', async () => {
  const data = await loadAll();
  const maengelOffen = data.maengel.filter((m) => m.status !== 'erledigt').length;
  const season = seasonOf(today());
  const winterCount = data.winter.filter((w) => seasonOf(w.datum) === season).length;
  const angeboteOffen = data.angebote.filter((a) => a.status === 'offen').length;
  const unbilled = data.visits.filter((v) => !v.rechnungId).length;
  const material = await DB.all('material');
  const overdue = data.invoices.filter((i) => i.status === 'offen' && i.faellig < today()).length;
  render('Mehr', `
    <div class="tiles">
      ${tile('#/buchhaltung', '💰', 'Buchhaltung', 'Finanzen, Ausgaben, Fahrten, Auswertung', overdue || '')}
      ${tile('#/material', '🧴', 'Material', 'Lager & Einkaufsliste', material.filter(isLow).length || '')}
      ${tile('#/abwesenheit', '🏖️', 'Urlaub & Krankheit', 'Termine verschieben')}
      ${tile('#/angebote', '📝', 'Angebote', 'Preise berechnen & anbieten', angeboteOffen || '')}
      ${tile('#/kunden', '👥', 'Auftraggeber', `${data.customers.length} Hausverwaltungen & Eigentümer`)}
      ${tile('#/einsaetze', '🧽', 'Einsätze', `${data.visits.length} erfasst`, unbilled || '')}
      ${tile('#/maengel', '⚠️', 'Mängel', 'Schäden melden & verfolgen', maengelOffen || '')}
      ${tile('#/winter', '❄️', 'Winterdienst', `Saison ${season}: ${winterCount} Einsätze`)}
    </div>
  `, { tab: 'mehr', back: false });
});

/* ---------- Tagestour ---------- */
const tourLegCache = {};

// Luftlinie in km zwischen zwei Koordinaten
const entfernung = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

route('/tour', async (_, q) => {
  const data = await loadAll();
  const datum = q.datum || today();
  const items = planning(data)
    .filter((p) => p.datum === datum || (datum === today() && p.datum < datum))
    .sort((a, b) => (a.uhrzeit || '99').localeCompare(b.uhrzeit || '99'));
  const done = (oid) => data.visits.some((v) => v.objektId === oid && v.datum === datum);
  let stops = items.map((it) => ({ it, o: data.omap[it.objektId] })).filter((s) => s.o || (s.it.typ && s.it.typ !== 'reinigung') || s.it.ort);
  // Kürzeste Route: immer zum nächsten Haus mit Koordinaten (Luftlinie als Näherung); ohne Koordinaten ans Ende
  const optimiert = q.route === '1';
  let ohneKoordinaten = 0;
  if (optimiert) {
    const rest = stops.filter((s) => s.o?.geo);
    const reihe = rest.length ? [rest.shift()] : [];
    while (rest.length) {
      const last = reihe[reihe.length - 1].o.geo;
      let best = 0;
      rest.forEach((s, i) => { if (entfernung(last, s.o.geo) < entfernung(last, rest[best].o.geo)) best = i; });
      reihe.push(rest.splice(best, 1)[0]);
    }
    const ohne = stops.filter((s) => !s.o?.geo);
    ohneKoordinaten = ohne.filter((s) => s.o).length;
    stops = [...reihe, ...ohne];
  }
  // Zeitplan: Dauer je Haus aus den letzten Einsätzen, dazwischen 20 Min. Fahrt
  const avgHours = (oid) => {
    const hs = data.visits.filter((v) => v.objektId === oid && num(v.stunden) > 0).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 3).map((v) => num(v.stunden));
    return hs.length ? hs.reduce((s, h) => s + h, 0) / hs.length : 2;
  };
  const addMin = (hhmm, mins) => { const [h, m] = hhmm.split(':').map(Number); const t = h * 60 + m + mins; return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
  // Pro Termin: Fahrzeit bis dorthin, Startzeit (frühestens feste Uhrzeit), Dauer (Art oder Erfahrung)
  // Echte Fahrzeiten zwischen den Häusern (wenn Internet da ist, sonst Schätzung)
  const objStops = stops.filter((s) => s.o);
  // Sofort mit den Schätzwerten zeichnen; echte Fahrzeiten werden nachgeladen und zwischengespeichert
  const legKey = objStops.map((s) => s.o.id).join('|');
  const legs = tourLegCache[legKey] || {};
  if (!tourLegCache[legKey]) {
    travelLegs(objStops.map((s) => s.o)).then((found) => {
      if (!Object.keys(found).length) return;
      tourLegCache[legKey] = found;
      if (location.hash.startsWith('#/tour')) router();
    });
  }
  let clock = stops.find((s) => s.it.uhrzeit)?.it.uhrzeit || '08:00';
  const plan = {};
  let fahrtGesamt = 0;
  let kmGesamt = 0;
  let arbeitGesamt = 0;
  stops.forEach(({ it, o }, idx) => {
    const key = o ? o.id : it.id;
    if (o && done(o.id)) return;
    const k = o ? objStops.findIndex((s) => s.o.id === o.id) : -1;
    const real = k > 0 ? legs[k] : null;
    const fahrt = idx === 0 ? 0 : (real && !it.fahrzeitManuell ? real.min : (it.fahrzeit ?? 20));
    const km = idx === 0 ? 0 : (real?.km || 0);
    fahrtGesamt += fahrt;
    kmGesamt += km;
    const arrival = addMin(clock, fahrt);
    const start = !optimiert && it.uhrzeit && it.uhrzeit > arrival ? it.uhrzeit : arrival;
    const dauer = it.dauer || terminTyp(it).dauer || (o ? Math.round(avgHours(o.id) * 60) : 60);
    arbeitGesamt += dauer;
    const end = addMin(start, dauer);
    plan[key] = { start, end, fahrt, dauer, km };
    clock = end;
  });
  const addrs = stops.map((s) => objAddress(s.o)).filter(Boolean);
  const routeUrl = addrs.length
    ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(addrs[addrs.length - 1])}${addrs.length > 1 ? `&waypoints=${encodeURIComponent(addrs.slice(0, -1).join('|'))}` : ''}`
    : '';
  const doneCount = stops.filter((s) => s.o && done(s.o.id)).length;

  render('Tagestour', `
    <div class="card tour-head">
      <div class="row between">
        <a class="icon-btn" href="#/tour?datum=${addDays(datum, -1)}" aria-label="Vorheriger Tag">‹</a>
        <div class="center"><b>${datum === today() ? 'Heute' : fmtDateLong(datum)}</b><div class="muted small">${stops.length} ${stops.length === 1 ? 'Termin' : 'Termine'} · ${doneCount} erledigt · Fahrweg ca. ${fmtNum(fahrtGesamt / 60)} Std.${kmGesamt ? ` (${fmtNum(kmGesamt)} km)` : ''} · Arbeit ca. ${fmtNum(arbeitGesamt / 60)} Std.</div></div>
        <a class="icon-btn" href="#/tour?datum=${addDays(datum, 1)}" aria-label="Nächster Tag">›</a>
      </div>
      ${stops.length ? `<div class="bar"><div style="width:${(doneCount / stops.length) * 100}%"></div></div>` : ''}
      ${routeUrl ? `<a class="btn block" href="${routeUrl}" target="_blank" rel="noopener">🧭 Ganze Route in Google Maps</a>` : ''}
      ${stops.filter((s) => s.o).length > 1 ? `<a class="btn ghost block" href="#/tour?datum=${datum}${optimiert ? '' : '&route=1'}">${optimiert ? '⏰ Nach Uhrzeit sortieren' : '🧭 Kürzeste Route berechnen'}</a>` : ''}
      ${optimiert && ohneKoordinaten ? `<p class="muted small">${ohneKoordinaten} ${ohneKoordinaten === 1 ? 'Haus hat' : 'Häuser haben'} noch keine Koordinaten und stehen deshalb am Ende. Mit Internet werden sie beim ersten Öffnen der Tour ergänzt.</p>` : ''}
      ${stops.some((s) => s.o) ? `<a class="btn ghost block" href="#/fahrt/neu?datum=${datum}&km=${kmGesamt ? fmtNum(kmGesamt).replace(',', '.') : ''}&objekte=${stops.filter((s) => s.o).map((s) => s.o.id).join(',')}">🚗 Fahrt ins Fahrtenbuch</a>` : ''}
    </div>
    <div class="timeline">
      ${stops.map(({ it, o }, i) => {
        const p = plan[o ? o.id : it.id];
        const isDone = o && done(o.id);
        const t = terminTyp(it);
        const titel = o ? objLabel(o) : (it.ort || t.label);
        const adresse = o ? objAddress(o) : it.ort;
        const ziel = adresse || it.ort;
        return `<div class="card plan-entry tour-stop ${isDone ? 'done' : ''} ${isReinigung(it) ? '' : 'termin-typ'}">
        <div class="row between"><b>${i + 1}. ${isReinigung(it) ? '' : `${t.icon} `}${esc(titel)}</b>${isDone ? '<span class="badge ok">✓ erledigt</span>' : p ? `<span class="badge">${esc(p.start)}–${esc(p.end)} Uhr</span>` : ''}</div>
        ${!isDone && p ? `<div class="small muted">${p.fahrt ? `🚗 ${p.fahrt} Min.${p.km ? ` · ${fmtNum(p.km)} km` : ''} Fahrt · ` : ''}${isReinigung(it) ? '🧽' : t.icon} ${esc(t.label)} · ca. ${p.dauer} Min.</div>` : ''}
        ${o && adresse ? `<div class="muted small">${esc(adresse)}${it.datum < datum ? ` · <span class="danger-text">${esc(whenLabel(it.datum))}</span>` : ''}</div>` : ''}
        ${o?.zugang ? `<div class="small">🔑 ${esc(o.zugang)}</div>` : ''}
        ${o && (o.vorOrtName || o.vorOrtTelefon) ? `<div class="small">👤 ${esc(o.vorOrtName || 'Ansprechpartner')}${o.vorOrtTelefon ? ` · <a href="tel:${esc(o.vorOrtTelefon.replace(/\s/g, ''))}">${esc(o.vorOrtTelefon)}</a>` : ''}</div>` : ''}
        ${o && isReinigung(it) ? taskSummary(o, it.aufgaben) : ''}
        ${it.notiz ? `<div class="small">📝 ${esc(it.notiz)}</div>` : ''}
        ${isDone ? '' : `<div class="row gap mt">
          ${ziel ? `<a class="btn small ghost" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ziel)}" target="_blank" rel="noopener">🧭 Hinfahren</a>` : ''}
          ${isReinigung(it) && o ? `<button class="btn small" data-start="${o.id}" data-termin="${it.id}">▶️ Start</button>` : ''}
          ${isReinigung(it) && o ? `<a class="btn small ghost" href="#/einsatz/neu?objekt=${o.id}&termin=${it.id}">✓ Erledigt</a>` : `<button class="btn small ghost" data-done="${it.id}">✓ Erledigt</button>`}
        </div>`}
      </div>`;
      }).join('') || '<div class="empty">Für diesen Tag ist nichts geplant.</div>'}
    </div>
  `);
});
