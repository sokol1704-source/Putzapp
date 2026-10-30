'use strict';

/* ---------- Globale Suche: Auftraggeber, Häuser, Rechnungen, Angebote, Ausgaben, Material ---------- */
const SUCHE_GRUPPEN = [['alle', 'Alle'], ['kunden', 'Auftraggeber'], ['haeuser', 'Häuser'], ['rechnungen', 'Rechnungen'], ['angebote', 'Angebote'], ['ausgaben', 'Ausgaben'], ['material', 'Material']];

route('/suche', async (_, q) => {
  const [customers, objects, invoices, angebote, ausgaben, material] = await Promise.all(
    ['customers', 'objects', 'invoices', 'angebote', 'ausgaben', 'material'].map((s) => DB.all(s)),
  );
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const norm = (v) => String(v ?? '').toLowerCase();
  let term = (q.q || '').trim();
  let gruppe = 'alle';
  let nurOffen = false;

  // Nur die Trefferliste wird neu gezeichnet, damit das Eingabefeld den Fokus behält
  const results = () => {
    const hit = (...fields) => fields.some((f) => norm(f).includes(norm(term)));
    if (term.length < 2) return '<div class="empty small">Tippe mindestens zwei Buchstaben, z. B. einen Namen, eine Straße oder eine Rechnungsnummer.</div>';
    const show = (key) => gruppe === 'alle' || gruppe === key;
    const groups = [
      ['kunden', '👥 Auftraggeber', customers.filter((c) => hit(c.name, c.ansprechpartner, c.strasse, c.plzOrt, c.email, c.telefon)).map((c) => ({
        href: `#/kunde/${c.id}`, title: c.name, sub: [c.ansprechpartner, c.plzOrt].filter(Boolean).join(' · ') }))],
      ['haeuser', '🏢 Häuser', objects.filter((o) => hit(o.name, o.strasse, o.plzOrt, o.zugang, o.vorOrtName, o.notizen, kundeName(kmap, o.kundeId))).map((o) => ({
        href: `#/objekt/${o.id}`, title: objLabel(o), sub: `${objAddress(o)} · ${kundeName(kmap, o.kundeId)}` }))],
      ['rechnungen', '🧾 Rechnungen', invoices.filter((i) => (!nurOffen || i.status === 'offen') && hit(i.nummer, i.kunde?.name, i.objekte?.map((o) => o.name).join(' '), i.notiz)).map((i) => ({
        href: `#/rechnung/${i.id}`, title: i.nummer, sub: `${i.kunde?.name ?? ''} · ${fmtDate(i.datum)} · ${money(i.summe)}` }))],
      ['angebote', '📝 Angebote', angebote.filter((a) => (!nurOffen || a.status === 'offen') && hit(a.nummer, a.empfaenger?.name, a.objekt?.strasse)).map((a) => ({
        href: `#/angebot/${a.id}`, title: a.nummer, sub: `${a.empfaenger?.name ?? ''} · ${money(a.monatspreis)}/Monat` }))],
      ['ausgaben', '💸 Ausgaben', ausgaben.filter((a) => hit(a.beschreibung, a.kategorie)).map((a) => ({
        href: `#/ausgabe/${a.id}`, title: a.beschreibung || a.kategorie, sub: `${fmtDate(a.datum)} · ${money(a.betrag)}` }))],
      ['material', '🧴 Material', material.filter((m) => hit(m.name, m.notiz, m.kategorie)).map((m) => ({
        href: '#/material?tab=lager', title: m.name, sub: `${fmtNum(m.bestand)} ${m.einheit} auf Lager` }))],
    ].filter(([key, , list]) => show(key) && list.length);
    const total = groups.reduce((sum, [, , l]) => sum + l.length, 0);
    if (!total) return `<div class="empty">Keine Treffer für „${esc(term)}“${gruppe !== 'alle' || nurOffen ? '. Versuche, den Filter zu ändern.' : '.'}</div>`;
    return `<p class="muted small">${total} Treffer für „${esc(term)}“</p>` + groups.map(([, title, list]) => `<h3 class="section">${title} (${list.length})</h3>
      ${list.slice(0, 20).map((r) => `<a class="card link search-hit" href="${r.href}"><b>${hl(r.title, term)}</b><div class="muted small">${hl(r.sub, term)}</div></a>`).join('')}`).join('');
  };

  render('Suche', `
    <form id="sf" class="search-bar" role="search" onsubmit="return false">
      <input type="search" value="${esc(term)}" placeholder="Name, Adresse, Rechnungsnummer …" enterkeyhint="search" aria-label="Suchen">
    </form>
    <div class="chips mt" id="chips">${SUCHE_GRUPPEN.map(([key, label]) => `<button type="button" data-g="${key}" class="${key === gruppe ? 'active' : ''}">${label}</button>`).join('')}</div>
    <label class="check small mt"><input type="checkbox" id="nurOffen" ${nurOffen ? 'checked' : ''}> Nur offene Rechnungen & Angebote</label>
    <div id="res">${results()}</div>
  `, { tab: '', back: true });
  const input = $('#sf input');
  if (!term) input.focus();
  const update = () => { $('#res').innerHTML = results(); };
  input.addEventListener('input', (e) => { term = e.target.value.trim(); update(); });
  $('#chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-g]');
    if (!chip) return;
    gruppe = chip.dataset.g;
    $('#chips').querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('active', x === chip));
    update();
  });
  $('#nurOffen').addEventListener('change', (e) => { nurOffen = e.target.checked; update(); });
});

// Trefferwort hervorheben (nur sicher escapt)
function hl(text, term) {
  const s = String(text ?? '');
  if (!term) return esc(s);
  const i = s.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return esc(s);
  return `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + term.length))}</mark>${esc(s.slice(i + term.length))}`;
}
