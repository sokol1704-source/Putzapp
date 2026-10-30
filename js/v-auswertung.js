'use strict';

/* ---------- Auswertung ---------- */
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const KU_GRENZE = 2500000; // Kleinunternehmer: 25.000 € Vorjahresumsatz

// Gut lesbare Achsenwerte (1, 2, 5 × 10^n)
function niceMax(v) {
  if (v <= 0) return 10000;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v);
}
const shortEuro = (c) => (c >= 100000 ? `${fmtNum(Math.round(c / 10000) / 10)}k €` : `${Math.round(c / 100)} €`);

function delta(now, before) {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(pct)} % zum Vorjahr</span>`;
}

async function analyticsData(jahr) {
  const data = await loadAll();
  const [ausgaben, fahrten] = await Promise.all([DB.all('ausgaben'), DB.all('fahrten')]);
  const y = Number(jahr);
  const isCurrent = y === new Date().getFullYear();
  const curMonth = new Date().getMonth();
  const vmap = Object.fromEntries(data.visits.map((v) => [v.id, v]));
  const inv = data.invoices.filter((i) => i.status !== 'storniert');
  const invY = inv.filter((i) => yearOf(i.datum) === jahr);

  const umsatzM = Array(12).fill(0);
  const kostenM = Array(12).fill(0);
  invY.forEach((i) => { umsatzM[Number(i.datum.slice(5, 7)) - 1] += i.summe; });
  ausgaben.filter((a) => yearOf(a.datum) === jahr).forEach((a) => { kostenM[Number(a.datum.slice(5, 7)) - 1] += a.betrag; });
  fahrten.filter((f) => yearOf(f.datum) === jahr).forEach((f) => { kostenM[Number(f.datum.slice(5, 7)) - 1] += Math.round(num(f.km) * KM_SATZ); });
  const umsatz = umsatzM.reduce((s, v) => s + v, 0);
  const kosten = kostenM.reduce((s, v) => s + v, 0);

  // Vorjahr im gleichen Zeitraum (bei laufendem Jahr nur bis zum aktuellen Monat)
  const upTo = isCurrent ? curMonth : 11;
  const umsatzVJ = inv.filter((i) => yearOf(i.datum) === String(y - 1) && Number(i.datum.slice(5, 7)) - 1 <= upTo).reduce((s, i) => s + i.summe, 0);
  const umsatzBisher = umsatzM.slice(0, upTo + 1).reduce((s, v) => s + v, 0);

  const visitsY = data.visits.filter((v) => yearOf(v.datum) === jahr);
  const winterY = data.winter.filter((w) => yearOf(w.datum) === jahr);
  const stunden = visitsY.reduce((s, v) => s + num(v.stunden), 0);
  const visitsVJ = data.visits.filter((v) => yearOf(v.datum) === String(y - 1) && Number(v.datum.slice(5, 7)) - 1 <= upTo);

  // Umsatz je Haus und je Auftraggeber
  const perObj = {};
  const perKunde = {};
  for (const i of invY) {
    perKunde[i.kundeId] = (perKunde[i.kundeId] || 0) + i.summe;
    for (const p of i.positionen) {
      const oid = p.objektId || vmap[p.visitId]?.objektId || (i.objekte?.length === 1 ? i.objekte[0].id : '?');
      perObj[oid] = (perObj[oid] || 0) + (p.betrag ?? 0);
    }
  }
  const monthly = data.objects.filter((o) => o.aktiv !== false && isMonthly(o));
  const fest = monthly.reduce((s, o) => s + priceFor(o, today().slice(0, 7)), 0);

  // Grobe Hochrechnung: bisheriger Umsatz + noch offene Rechnungsmonate × feste Pauschalen
  const openMonths = isCurrent ? umsatzM.slice(curMonth).filter((v) => !v).length : 0;
  const prognose = umsatz + openMonths * fest;

  const houses = data.objects.map((o) => {
    const vs = visitsY.filter((v) => v.objektId === o.id);
    const h = vs.reduce((s, v) => s + num(v.stunden), 0);
    const u = perObj[o.id] || 0;
    const months = isCurrent ? curMonth + 1 : 12;
    const hoursPerMonth = vs.length ? h / Math.max(1, new Set(vs.map((v) => v.datum.slice(0, 7))).size) : 0;
    return { o, umsatz: u, hours: h, count: vs.length, wage: h ? Math.round(u / h) : null, hoursPerMonth, months };
  }).filter((r) => r.umsatz || r.count).sort((a, b) => (b.wage ?? -1) - (a.wage ?? -1));

  return { data, jahr, isCurrent, umsatzM, kostenM, umsatz, kosten, umsatzVJ, umsatzBisher, stunden, visitsY, visitsVJ, winterY, perKunde, fest, monthly, prognose, houses };
}

function insights(a) {
  const out = [];
  const best = a.umsatzM.indexOf(Math.max(...a.umsatzM));
  if (a.umsatz) out.push(['🏆', `Stärkster Monat war der <b>${MONTHS[best]}</b> mit ${money(a.umsatzM[best])} Umsatz.`]);
  const rated = a.houses.filter((h) => h.wage != null);
  if (rated.length > 1) {
    out.push(['⭐', `Am meisten bringt <b>${esc(objLabel(rated[0].o))}</b> mit ${money(rated[0].wage)} pro Stunde.`]);
    const worst = rated[rated.length - 1];
    if (worst.wage < 2500) out.push(['💡', `<b>${esc(objLabel(worst.o))}</b> bringt nur ${money(worst.wage)} pro Stunde – hier lohnt sich ein Gespräch über den Preis.`]);
  }
  const shares = Object.values(a.perKunde).sort((x, y) => y - x);
  if (shares.length > 1 && shares[0] / a.umsatz > 0.5) {
    const kid = Object.keys(a.perKunde).find((k) => a.perKunde[k] === shares[0]);
    out.push(['⚖️', `${Math.round((shares[0] / a.umsatz) * 100)} % deines Umsatzes kommt von <b>${esc(kundeName(a.data.kmap, kid))}</b>. Ein, zwei weitere Auftraggeber machen dich unabhängiger.`]);
  }
  const overdue = a.data.invoices.filter((i) => i.status === 'offen' && i.faellig < today());
  if (overdue.length) out.push(['⏰', `${overdue.length} Rechnung${overdue.length === 1 ? '' : 'en'} über ${money(overdue.reduce((s, i) => s + i.summe, 0))} sind überfällig – <a href="#/rechnungen?filter=offen">jetzt erinnern</a>.`]);
  const winterUmsatz = a.data.invoices.filter((i) => i.status !== 'storniert' && yearOf(i.datum) === a.jahr)
    .flatMap((i) => i.positionen).filter((p) => p.winterIds?.length).reduce((s, p) => s + (p.betrag || 0), 0);
  if (winterUmsatz) out.push(['❄️', `Der Winterdienst hat ${money(winterUmsatz)} eingebracht.`]);
  if (a.kosten && a.umsatz) out.push(['🧾', `Deine Kosten liegen bei ${Math.round((a.kosten / a.umsatz) * 100)} % vom Umsatz.`]);
  return out;
}

route('/auswertung', async (_, q) => {
  const jahr = q.jahr || String(new Date().getFullYear());
  const a = await analyticsData(jahr);
  const gewinn = a.umsatz - a.kosten;
  // Wochen seit dem ersten Einsatz des Jahres (bzw. ganzes Jahr)
  const firstVisit = a.visitsY.map((v) => v.datum).sort()[0];
  const weeks = firstVisit ? Math.max(1, daysBetween(firstVisit, a.isCurrent ? today() : `${jahr}-12-31`) / 7) : 1;
  const wage = a.stunden ? Math.round(a.umsatz / a.stunden) : 0;
  const wageVJ = (() => {
    const h = a.visitsVJ.reduce((s, v) => s + num(v.stunden), 0);
    return h && a.umsatzVJ ? Math.round(a.umsatzVJ / h) : 0;
  })();

  // Monatsdiagramm
  const max = niceMax(Math.max(...a.umsatzM, ...a.kostenM));
  const months = a.isCurrent ? new Date().getMonth() + 1 : 12;
  const avg = a.umsatz ? Math.round(a.umsatzM.slice(0, months).reduce((s, v) => s + v, 0) / months) : 0;
  const pct = (v) => (v / max) * 100;

  // Umsatzanteile je Auftraggeber (bis zu 4 + Sonstige)
  const kunden = Object.entries(a.perKunde).sort((x, y) => y[1] - x[1]);
  const shares = kunden.slice(0, 4).map(([kid, v]) => ({ name: kundeName(a.data.kmap, kid), v }));
  const rest = kunden.slice(4).reduce((s, [, v]) => s + v, 0);
  if (rest) shares.push({ name: 'Sonstige', v: rest });

  const grenze = Math.min(100, (a.umsatz / KU_GRENZE) * 100);
  const prog = Math.min(100, (a.prognose / KU_GRENZE) * 100);
  const tips = insights(a);
  const maxWage = Math.max(3500, ...a.houses.map((h) => h.wage || 0));

  render('Auswertung', `
    <div class="viz">
    ${yearSeg('#/auswertung', jahr, lastYears())}

    <div class="kpis mt">
      <div class="kpi hero-kpi"><span>Umsatz ${jahr}</span><b data-count="${a.umsatz}" data-money>${money(a.umsatz)}</b>${a.isCurrent ? delta(a.umsatzBisher, a.umsatzVJ) : delta(a.umsatz, a.umsatzVJ)}</div>
      <div class="kpi"><span>Ergebnis</span><b class="${gewinn < 0 ? 'neg' : ''}" ${gewinn > 0 ? `data-count="${gewinn}" data-money` : ''}>${money(gewinn)}</b><small>Umsatz − Kosten</small></div>
      <div class="kpi"><span>Ø Stundenlohn</span><b ${wage ? `data-count="${wage}" data-money` : ''}>${wage ? money(wage) : '–'}</b>${wageVJ ? delta(wage, wageVJ) : '<small>Umsatz ÷ Arbeitsstunden</small>'}</div>
      <div class="kpi"><span>Arbeitsstunden</span><b data-count="${Math.round(a.stunden)}">${fmtNum(Math.round(a.stunden))}</b><small>${a.visitsY.length} Reinigungen · ${a.winterY.length} × Winter</small></div>
      <div class="kpi"><span>Fester Monatsumsatz</span><b data-count="${a.fest}" data-money>${money(a.fest)}</b><small>${a.monthly.length} ${a.monthly.length === 1 ? 'Haus' : 'Häuser'} mit Pauschale</small></div>
      <div class="kpi"><span>Ø pro Woche</span><b>${fmtNum(Math.round((a.stunden / Math.max(1, weeks)) * 10) / 10)} Std.</b><small>Arbeitszeit vor Ort</small></div>
      <div class="kpi"><span>Kosten</span><b data-count="${a.kosten}" data-money>${money(a.kosten)}</b><small>Ausgaben + Fahrten</small></div>
    </div>

    ${a.isCurrent ? `<div class="card ku ${a.prognose > KU_GRENZE ? 'over' : ''}">
      <div class="row between"><b>Kleinunternehmergrenze</b><span class="muted small">25.000 €</span></div>
      <div class="ku-bar"><span class="ku-now" style="width:${grenze}%"></span><span class="ku-prog" style="width:${prog}%"></span><i style="left:100%"></i></div>
      <div class="small">Bisher <b>${money(a.umsatz)}</b> · grobe Hochrechnung bis Dezember <b>${money(a.prognose)}</b></div>
      ${a.prognose > KU_GRENZE
        ? `<div class="status-note critical">⚠️ <b>Achtung:</b> Liegt dein Umsatz ${jahr} über 25.000 €, gilt ab ${Number(jahr) + 1} die Kleinunternehmerregelung nicht mehr – dann musst du Umsatzsteuer berechnen. Sprich rechtzeitig mit deinem Steuerbüro.</div>`
        : `<div class="status-note good">✓ Noch ${money(KU_GRENZE - a.prognose)} Luft bis zur Grenze.</div>`}
    </div>` : ''}

    <div class="card chart-card">
      <div class="row between"><b>Umsatz & Kosten pro Monat</b></div>
      <div class="legend"><span><i class="sw s1"></i>Umsatz</span><span><i class="sw s2"></i>Kosten</span>${avg ? '<span><i class="sw avg"></i>Ø Umsatz</span>' : ''}</div>
      <div class="readout" id="readout">Tippe auf einen Monat für Details.</div>
      <div class="chart2">
        <div class="yaxis">${[max, max / 2, 0].map((v) => `<span>${shortEuro(v)}</span>`).join('')}</div>
        <div class="plot">
          <div class="grid-lines"><i></i><i></i><i></i></div>
          ${avg ? `<div class="avg-line" style="bottom:calc(18px + (100% - 18px) * ${pct(avg) / 100})"><span>Ø ${shortEuro(avg)}</span></div>` : ''}
          ${a.umsatzM.map((u, i) => `<button class="mcol ${a.isCurrent && i === new Date().getMonth() ? 'current' : ''}" style="--n:${i}" data-m="${i}" aria-label="${MONTHS[i]}: Umsatz ${money(u)}, Kosten ${money(a.kostenM[i])}">
            <span class="b s1" style="height:${u ? Math.max(1.5, pct(u)) : 0}%"></span><span class="b s2" style="height:${a.kostenM[i] ? Math.max(1.5, pct(a.kostenM[i])) : 0}%"></span>
            <em>${MONTHS[i][0]}</em></button>`).join('')}
        </div>
      </div>
    </div>

    ${shares.length ? `<div class="card">
      <b>Umsatz nach Auftraggeber</b>
      <div class="share-bar">${shares.map((s, i) => `<span class="s${i + 1}" style="flex:${s.v}" title="${esc(s.name)}"></span>`).join('')}</div>
      <ul class="share-list">${shares.map((s, i) => `<li><i class="sw s${i + 1}"></i><span>${esc(s.name)}</span><b>${money(s.v)}</b><small>${Math.round((s.v / a.umsatz) * 100)} %</small></li>`).join('')}</ul>
    </div>` : ''}

    <h3 class="section">Was bringt welches Haus?</h3>
    ${a.houses.map((r) => {
      const need = r.wage != null && r.wage < 2500 && isMonthly(r.o) && r.hoursPerMonth ? Math.ceil((r.hoursPerMonth * 2500) / 500) * 500 : 0;
      const cls = r.wage != null ? wageClass(r.wage) : '';
      return `<a class="card link wage-row" href="#/objekt/${r.o.id}">
        <div class="row between"><b>🏢 ${esc(objLabel(r.o))}</b><b>${r.wage != null ? `${money(r.wage)}/Std.` : '–'}</b></div>
        <div class="wbar"><span class="${cls}" style="width:${r.wage ? Math.min(100, (r.wage / maxWage) * 100) : 0}%"></span><i style="left:${(2500 / maxWage) * 100}%" title="Ziel 25 €/Std."></i></div>
        <div class="muted small">${money(r.umsatz)} Umsatz · ${r.count} Einsätze · ${fmtNum(r.hours)} Std.${cls ? ` · <span class="st ${cls}">${cls === 'ok' ? '✓ gut' : cls === 'warn' ? '◐ geht so' : '✕ zu niedrig'}</span>` : ''}</div>
        ${need && need > (r.o.monatspauschale || 0) ? `<div class="small mt">💡 Für 25 €/Std. wären ca. <b>${money(need)}/Monat</b> nötig (+${money(need - (r.o.monatspauschale || 0))}).</div>` : ''}
      </a>`;
    }).join('') || '<div class="empty">Noch keine Daten für dieses Jahr.</div>'}
    ${a.houses.some((r) => r.wage != null && r.wage < 2500) ? '<a class="btn ghost block" href="#/preise">📈 Zur Preisanpassung</a>' : ''}

    ${tips.length ? `<h3 class="section">💡 Erkenntnisse</h3><div class="card insights">${tips.map(([ico, t]) => `<div class="insight"><span>${ico}</span><p>${t}</p></div>`).join('')}</div>` : ''}
    </div>
  `);

  const readout = $('#readout');
  const show = (col) => {
    const i = Number(col.dataset.m);
    $$('.mcol').forEach((c) => c.classList.toggle('active', c === col));
    const erg = a.umsatzM[i] - a.kostenM[i];
    readout.innerHTML = `<b>${MONTHS[i]} ${jahr}</b> · Umsatz <b>${money(a.umsatzM[i])}</b> · Kosten <b>${money(a.kostenM[i])}</b> · Ergebnis <b class="${erg < 0 ? 'neg' : ''}">${money(erg)}</b>`;
  };
  $('.plot').addEventListener('click', (e) => { const c = e.target.closest('.mcol'); if (c) show(c); });
  $('.plot').addEventListener('pointerover', (e) => { const c = e.target.closest('.mcol'); if (c && e.pointerType === 'mouse') show(c); });
  const cur = $('.mcol.current') || $$('.mcol').filter((c) => a.umsatzM[c.dataset.m]).pop();
  if (cur) show(cur);
});
