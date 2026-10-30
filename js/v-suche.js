'use strict';

/* ---------- Globale Suche: Auftraggeber, Häuser, Rechnungen, Angebote, Ausgaben, Material ---------- */
route('/suche', async (_, q) => {
  const [customers, objects, invoices, angebote, ausgaben, material] = await Promise.all(
    ['customers', 'objects', 'invoices', 'angebote', 'ausgaben', 'material'].map((s) => DB.all(s)),
  );
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const norm = (v) => String(v ?? '').toLowerCase();

  // Nur die Trefferliste wird neu gezeichnet, damit das Eingabefeld den Fokus behält
  const results = (term) => {
    const hit = (...fields) => fields.some((f) => norm(f).includes(norm(term)));
    if (term.length < 2) return '<div class="empty small">Tippe mindestens zwei Buchstaben, z. B. einen Namen, eine Straße oder eine Rechnungsnummer.</div>';
    const groups = [
      ['👥 Auftraggeber', customers.filter((c) => hit(c.name, c.ansprechpartner, c.strasse, c.plzOrt, c.email, c.telefon)).map((c) => ({
        href: `#/kunde/${c.id}`, title: c.name, sub: [c.ansprechpartner, c.plzOrt].filter(Boolean).join(' · ') }))],
      ['🏢 Häuser', objects.filter((o) => hit(o.name, o.strasse, o.plzOrt, o.zugang, o.vorOrtName, o.notizen, kundeName(kmap, o.kundeId))).map((o) => ({
        href: `#/objekt/${o.id}`, title: objLabel(o), sub: `${objAddress(o)} · ${kundeName(kmap, o.kundeId)}` }))],
      ['🧾 Rechnungen', invoices.filter((i) => hit(i.nummer, i.kunde?.name, i.objekte?.map((o) => o.name).join(' '), i.notiz)).map((i) => ({
        href: `#/rechnung/${i.id}`, title: i.nummer, sub: `${i.kunde?.name ?? ''} · ${fmtDate(i.datum)} · ${money(i.summe)}` }))],
      ['📝 Angebote', angebote.filter((a) => hit(a.nummer, a.empfaenger?.name, a.objekt?.strasse)).map((a) => ({
        href: `#/angebot/${a.id}`, title: a.nummer, sub: `${a.empfaenger?.name ?? ''} · ${money(a.monatspreis)}/Monat` }))],
      ['💸 Ausgaben', ausgaben.filter((a) => hit(a.beschreibung, a.kategorie)).map((a) => ({
        href: `#/ausgabe/${a.id}`, title: a.beschreibung || a.kategorie, sub: `${fmtDate(a.datum)} · ${money(a.betrag)}` }))],
      ['🧴 Material', material.filter((m) => hit(m.name, m.notiz, m.kategorie)).map((m) => ({
        href: '#/material?tab=lager', title: m.name, sub: `${fmtNum(m.bestand)} ${m.einheit} auf Lager` }))],
    ].filter(([, list]) => list.length);
    const total = groups.reduce((sum, [, l]) => sum + l.length, 0);
    if (!total) return `<div class="empty">Keine Treffer für „${esc(term)}“.</div>`;
    return `<p class="muted small">${total} Treffer für „${esc(term)}“</p>` + groups.map(([title, list]) => `<h3 class="section">${title} (${list.length})</h3>
      ${list.slice(0, 20).map((r) => `<a class="card link search-hit" href="${r.href}"><b>${hl(r.title, term)}</b><div class="muted small">${hl(r.sub, term)}</div></a>`).join('')}`).join('');
  };

  const term0 = (q.q || '').trim();
  render('Suche', `
    <form id="sf" class="search-bar" role="search" onsubmit="return false">
      <input type="search" value="${esc(term0)}" placeholder="Name, Adresse, Rechnungsnummer …" enterkeyhint="search" aria-label="Suchen">
    </form>
    <div id="res">${results(term0)}</div>
  `, { tab: '', back: true });
  const input = $('#sf input');
  if (!term0) input.focus();
  input.addEventListener('input', (e) => { $('#res').innerHTML = results(e.target.value.trim()); });
});

// Trefferwort hervorheben (nur sicher escapt)
function hl(text, term) {
  const s = String(text ?? '');
  if (!term) return esc(s);
  const i = s.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return esc(s);
  return `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + term.length))}</mark>${esc(s.slice(i + term.length))}`;
}
