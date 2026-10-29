'use strict';

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (v) => esc(v).replace(/\n/g, '<br>');

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmtDate = (s) => (s ? parseISO(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const fmtDateLong = (s) => parseISO(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const money = (c) => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const num = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
const fmtNum = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const centsInput = (c) => (c ? (c / 100).toFixed(2) : '');
const byName = (a, b) => a.name.localeCompare(b.name, 'de');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function go(hash, replace = false) {
  if (replace) location.replace(hash);
  else location.hash = hash;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

let objectUrls = [];
function objUrl(blob) {
  const u = URL.createObjectURL(blob);
  objectUrls.push(u);
  return u;
}

function lightbox(src) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${esc(src)}" alt="Foto">`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}

async function compressImage(file, max = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', quality));
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const blobToDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

/* ---------- Einstellungen ---------- */
const DEFAULT_SETTINGS = {
  id: 'main',
  firma: 'Toths Reinigungsservice',
  inhaber: '',
  strasse: '',
  plzOrt: '',
  telefon: '',
  email: '',
  steuernummer: '',
  bank: '',
  iban: '',
  bic: '',
  stundensatz: 2500,
  zahlungsziel: 14,
  nrPrefix: 'RE',
  nrStart: 1,
};
let S = { ...DEFAULT_SETTINGS };
async function loadSettings() {
  S = { ...DEFAULT_SETTINGS, ...(await DB.get('settings', 'main')) };
}
const settingsComplete = () => S.firma && S.inhaber && S.strasse && S.plzOrt && S.steuernummer;

/* ---------- Daten ---------- */
async function loadAll() {
  const [customers, visits, appointments, invoices] = await Promise.all(
    ['customers', 'visits', 'appointments', 'invoices'].map((s) => DB.all(s)),
  );
  customers.sort(byName);
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  return { customers, visits, appointments, invoices, kmap };
}

const kundeName = (kmap, id) => kmap[id]?.name ?? 'Unbekannter Kunde';

function lastVisit(visits, kundeId) {
  return visits.filter((v) => v.kundeId === kundeId).sort((a, b) => b.datum.localeCompare(a.datum))[0];
}

// Offene Termine + automatisch berechnete Fälligkeiten aus dem Reinigungsintervall
function planning({ customers, visits, appointments }) {
  const items = appointments
    .filter((a) => !a.erledigt)
    .map((a) => ({ type: 'termin', id: a.id, datum: a.datum, uhrzeit: a.uhrzeit, kundeId: a.kundeId, aufgaben: a.aufgaben || [], notiz: a.notiz }));
  for (const c of customers) {
    if (c.aktiv === false || !(c.intervallTage > 0)) continue;
    if (items.some((i) => i.kundeId === c.id)) continue;
    const last = lastVisit(visits, c.id);
    if (!last) continue;
    items.push({ type: 'faellig', datum: addDays(last.datum, c.intervallTage), kundeId: c.id, aufgaben: c.aufgaben || [] });
  }
  return items.sort((a, b) => (a.datum + (a.uhrzeit || '')).localeCompare(b.datum + (b.uhrzeit || '')));
}

function whenLabel(datum) {
  const d = daysBetween(today(), datum);
  if (d === 0) return 'Heute';
  if (d === 1) return 'Morgen';
  if (d < 0) return `${-d} Tag${d === -1 ? '' : 'e'} überfällig`;
  return `${fmtDateLong(datum)} · in ${d} Tagen`;
}

function planCard(it, kmap) {
  const k = kmap[it.kundeId];
  if (!k) return '';
  const overdue = it.datum < today();
  const tasks = it.aufgaben.length ? `<div class="muted small">${esc(it.aufgaben.join(' · '))}</div>` : '';
  const tag = it.type === 'termin'
    ? `<span class="badge">${it.uhrzeit ? esc(it.uhrzeit) + ' Uhr' : 'Termin'}</span>`
    : '<span class="badge soft" title="Berechnet aus dem Reinigungsintervall">Intervall</span>';
  const second = it.type === 'termin'
    ? `<a class="btn small ghost" href="#/termin/${it.id}">Bearbeiten</a>`
    : `<a class="btn small ghost" href="#/termin/neu?kunde=${k.id}&datum=${it.datum}">Termin festlegen</a>`;
  return `<div class="card plan ${overdue ? 'overdue' : ''}">
    <div class="row between"><a class="strong" href="#/kunde/${k.id}">${esc(k.name)}</a>${tag}</div>
    <div class="small ${overdue ? 'danger-text' : 'muted'}">${esc(whenLabel(it.datum))}</div>
    ${tasks}
    ${it.notiz ? `<div class="small">📝 ${esc(it.notiz)}</div>` : ''}
    <div class="row gap mt">
      <a class="btn small" href="#/einsatz/neu?kunde=${k.id}${it.type === 'termin' ? `&termin=${it.id}` : ''}">✓ Erledigt – Einsatz erfassen</a>
      ${second}
    </div>
  </div>`;
}

/* ---------- Router ---------- */
const routes = [];
const route = (pattern, fn) => routes.push([new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn]);

function render(title, html, { tab = '', back = true } = {}) {
  $('#title').textContent = title;
  $('#backBtn').hidden = !back;
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  $('#view').innerHTML = html;
}

async function router() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
  $$('.lightbox').forEach((l) => l.remove());
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    try {
      await fn({ ...m.groups }, query);
    } catch (e) {
      console.error(e);
      render('Fehler', `<div class="card">Es ist ein Fehler aufgetreten: ${esc(e.message)}</div>`);
    }
    window.scrollTo(0, 0);
    return;
  }
  go('#/', true);
}

/* ---------- Start ---------- */
route('/', async () => {
  const data = await loadAll();
  const plan = planning(data);
  const t = today();
  const week = addDays(t, 7);
  const overdue = plan.filter((p) => p.datum < t);
  const heute = plan.filter((p) => p.datum === t);
  const woche = plan.filter((p) => p.datum > t && p.datum <= week);
  const spaeter = plan.filter((p) => p.datum > week).slice(0, 5);
  const unbilled = data.visits.filter((v) => !v.rechnungId).length;
  const offen = data.invoices.filter((i) => i.status === 'offen');
  const offenSumme = offen.reduce((s, i) => s + i.summe, 0);

  const section = (title, items) => (items.length
    ? `<h3 class="section">${title}</h3>${items.map((i) => planCard(i, data.kmap)).join('')}` : '');

  render(S.firma, `
    ${settingsComplete() ? '' : `<a class="card hint" href="#/einstellungen">
      ⚠️ <b>Firmendaten fehlen.</b> Für korrekte Rechnungen bitte Name, Anschrift und Steuernummer in den Einstellungen eintragen.</a>`}
    <div class="quick">
      <a class="btn" href="#/einsatz/neu">🧽 Einsatz erfassen</a>
      <a class="btn ghost" href="#/termin/neu">📅 Termin</a>
      <a class="btn ghost" href="#/kunde/neu">👤 Kunde</a>
    </div>
    <div class="stats">
      <a class="stat" href="#/einsaetze?filter=offen"><b>${unbilled}</b><span>nicht abgerechnet</span></a>
      <a class="stat" href="#/rechnungen?filter=offen"><b>${money(offenSumme)}</b><span>${offen.length} offene Rechnung${offen.length === 1 ? '' : 'en'}</span></a>
    </div>
    ${section('⚠️ Überfällig', overdue)}
    ${section('Heute', heute)}
    ${section('Nächste 7 Tage', woche)}
    ${section('Später', spaeter)}
    ${plan.length ? '' : `<div class="empty">
      <p>Noch keine anstehenden Reinigungen.</p>
      <p class="muted small">Lege Kunden mit Reinigungsintervall an oder plane Termine – dann siehst du hier, wann du wieder putzen musst.</p>
    </div>`}
  `, { tab: 'start', back: false });
});

/* ---------- Kunden ---------- */
route('/kunden', async (_, q) => {
  const data = await loadAll();
  const plan = planning(data);
  const next = (id) => plan.find((p) => p.kundeId === id);
  const list = (search) => data.customers
    .filter((c) => !search || [c.name, c.strasse, c.plzOrt, c.telefon].join(' ').toLowerCase().includes(search.toLowerCase()))
    .map((c) => {
      const n = next(c.id);
      return `<a class="card link" href="#/kunde/${c.id}">
        <div class="row between"><b>${esc(c.name)}</b>${c.aktiv === false ? '<span class="badge soft">inaktiv</span>' : ''}</div>
        <div class="muted small">${esc([c.strasse, c.plzOrt].filter(Boolean).join(', '))}</div>
        ${n ? `<div class="small ${n.datum < today() ? 'danger-text' : ''}">Nächste Reinigung: ${esc(whenLabel(n.datum))}</div>` : ''}
      </a>`;
    }).join('') || '<div class="empty">Keine Kunden gefunden.</div>';

  render('Kunden', `
    <div class="row gap">
      <input type="search" id="search" placeholder="Suchen…" value="${esc(q.q || '')}">
      <a class="btn" href="#/kunde/neu">+ Neu</a>
    </div>
    <div id="list" class="mt">${list(q.q || '')}</div>
  `, { tab: 'kunden', back: false });
  $('#search').addEventListener('input', (e) => { $('#list').innerHTML = list(e.target.value); });
});

route('/kunde/neu', () => customerForm(null));
route('/kunde/:id/bearbeiten', async ({ id }) => customerForm(await DB.get('customers', id)));

function customerForm(c) {
  const isNew = !c;
  c = c || { name: '', strasse: '', plzOrt: '', telefon: '', email: '', privat: true, aktiv: true, intervallTage: 14, stundensatz: S.stundensatz, aufgaben: ['Böden saugen & wischen', 'Bad reinigen', 'Küche reinigen', 'Staub wischen'], notizen: '' };
  render(isNew ? 'Neuer Kunde' : 'Kunde bearbeiten', `
    <form id="f" class="form">
      <label>Name / Firma *<input name="name" required value="${esc(c.name)}" autocomplete="off"></label>
      <label>Straße & Hausnr.<input name="strasse" value="${esc(c.strasse)}"></label>
      <label>PLZ & Ort<input name="plzOrt" value="${esc(c.plzOrt)}"></label>
      <div class="grid2">
        <label>Telefon<input name="telefon" type="tel" value="${esc(c.telefon)}"></label>
        <label>E-Mail<input name="email" type="email" value="${esc(c.email)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="privat" ${c.privat ? 'checked' : ''}> Privatkunde (Rechnung mit Hinweis nach § 35a EStG)</label>
      <div class="grid2">
        <label>Reinigungsintervall
          <select name="intervallTage">
            ${[[0, 'kein festes Intervall'], [7, 'wöchentlich'], [14, 'alle 2 Wochen'], [21, 'alle 3 Wochen'], [28, 'alle 4 Wochen'], [30, 'monatlich (30 Tage)']]
              .map(([v, l]) => `<option value="${v}" ${Number(c.intervallTage) === v ? 'selected' : ''}>${l}</option>`).join('')}
            ${[0, 7, 14, 21, 28, 30].includes(Number(c.intervallTage)) ? '' : `<option value="${c.intervallTage}" selected>alle ${c.intervallTage} Tage</option>`}
          </select>
        </label>
        <label>Stundensatz (€)<input name="stundensatz" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(c.stundensatz)}"></label>
      </div>
      <label>Standard-Aufgaben <span class="muted small">(eine pro Zeile)</span>
        <textarea name="aufgaben" rows="5">${esc((c.aufgaben || []).join('\n'))}</textarea>
      </label>
      <label>Notizen <span class="muted small">(Schlüssel, Zugang, Besonderheiten…)</span>
        <textarea name="notizen" rows="3">${esc(c.notizen)}</textarea>
      </label>
      <label class="check"><input type="checkbox" name="aktiv" ${c.aktiv !== false ? 'checked' : ''}> Aktiver Kunde</label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Kunde löschen</button>'}
    </form>
  `);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.assign(c, {
      name: fd.get('name').trim(),
      strasse: fd.get('strasse').trim(),
      plzOrt: fd.get('plzOrt').trim(),
      telefon: fd.get('telefon').trim(),
      email: fd.get('email').trim(),
      privat: fd.has('privat'),
      aktiv: fd.has('aktiv'),
      intervallTage: Number(fd.get('intervallTage')) || 0,
      stundensatz: Math.round(num(fd.get('stundensatz')) * 100),
      aufgaben: fd.get('aufgaben').split('\n').map((s) => s.trim()).filter(Boolean),
      notizen: fd.get('notizen').trim(),
    });
    await DB.put('customers', c);
    toast('Kunde gespeichert');
    go(`#/kunde/${c.id}`, true);
  });
  $('#del')?.addEventListener('click', async () => {
    const [visits, invoices] = await Promise.all([DB.by('visits', 'kundeId', c.id), DB.by('invoices', 'kundeId', c.id)]);
    if (invoices.length) return alert('Dieser Kunde hat Rechnungen und kann nicht gelöscht werden (Aufbewahrungspflicht). Setze ihn stattdessen auf „inaktiv“.');
    if (!confirm(`„${c.name}“ mit ${visits.length} Einsätzen und allen Fotos wirklich löschen?`)) return;
    for (const v of visits) await deleteVisit(v);
    for (const a of await DB.by('appointments', 'kundeId', c.id)) await DB.del('appointments', a.id);
    await DB.del('customers', c.id);
    toast('Kunde gelöscht');
    go('#/kunden', true);
  });
}

route('/kunde/:id', async ({ id }) => {
  const data = await loadAll();
  const c = data.kmap[id];
  if (!c) return go('#/kunden', true);
  const plan = planning(data).filter((p) => p.kundeId === id);
  const visits = data.visits.filter((v) => v.kundeId === id).sort((a, b) => b.datum.localeCompare(a.datum));
  const invoices = data.invoices.filter((i) => i.kundeId === id).sort((a, b) => b.nummer.localeCompare(a.nummer));
  const addr = [c.strasse, c.plzOrt].filter(Boolean).join(', ');
  const intervall = c.intervallTage > 0 ? `alle ${c.intervallTage} Tage` : 'kein festes Intervall';

  render(c.name, `
    <div class="card">
      ${addr ? `<div>📍 <a href="https://maps.google.com/?q=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${esc(addr)}</a></div>` : ''}
      ${c.telefon ? `<div>📞 <a href="tel:${esc(c.telefon.replace(/\s/g, ''))}">${esc(c.telefon)}</a></div>` : ''}
      ${c.email ? `<div>✉️ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
      <div class="muted small mt">${c.privat ? 'Privatkunde' : 'Geschäftskunde'} · ${esc(intervall)} · ${money(c.stundensatz || 0)}/Std.</div>
      ${c.aufgaben?.length ? `<div class="small mt"><b>Aufgaben:</b> ${esc(c.aufgaben.join(' · '))}</div>` : ''}
      ${c.notizen ? `<div class="small mt">📝 ${nl2br(c.notizen)}</div>` : ''}
      <a class="btn small ghost mt" href="#/kunde/${id}/bearbeiten">Bearbeiten</a>
    </div>
    <div class="quick">
      <a class="btn" href="#/einsatz/neu?kunde=${id}">🧽 Einsatz</a>
      <a class="btn ghost" href="#/termin/neu?kunde=${id}">📅 Termin</a>
      <a class="btn ghost" href="#/rechnung/neu?kunde=${id}">🧾 Rechnung</a>
    </div>
    <h3 class="section">Anstehend</h3>
    ${plan.map((p) => planCard(p, data.kmap)).join('') || '<div class="empty small">Nichts geplant.</div>'}
    <h3 class="section">Einsätze (${visits.length})</h3>
    ${visits.map((v) => visitCard(v, data.kmap, false)).join('') || '<div class="empty small">Noch keine Einsätze.</div>'}
    <h3 class="section">Rechnungen (${invoices.length})</h3>
    ${invoices.map((i) => invoiceCard(i)).join('') || '<div class="empty small">Noch keine Rechnungen.</div>'}
  `);
});

/* ---------- Termine ---------- */
route('/termine', async () => {
  const data = await loadAll();
  const plan = planning(data);
  const done = data.appointments.filter((a) => a.erledigt).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 20);
  render('Termine', `
    <a class="btn block" href="#/termin/neu">+ Termin planen</a>
    <h3 class="section">Anstehend</h3>
    ${plan.map((p) => planCard(p, data.kmap)).join('') || '<div class="empty">Keine anstehenden Termine.</div>'}
    ${done.length ? `<details class="mt"><summary>Erledigte Termine</summary>
      ${done.map((a) => `<a class="card link" href="${a.visitId ? `#/einsatz/${a.visitId}` : `#/termin/${a.id}`}">
        <b>${esc(kundeName(data.kmap, a.kundeId))}</b>
        <div class="muted small">${fmtDateLong(a.datum)} ✓</div></a>`).join('')}
    </details>` : ''}
  `, { tab: 'termine', back: false });
});

route('/termin/neu', (_, q) => appointmentForm(null, q));
route('/termin/:id', async ({ id }) => appointmentForm(await DB.get('appointments', id), {}));

async function appointmentForm(a, q) {
  const customers = (await DB.all('customers')).filter((c) => c.aktiv !== false || c.id === a?.kundeId).sort(byName);
  if (!customers.length) return noCustomers();
  const isNew = !a;
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  a = a || { kundeId: q.kunde || '', datum: q.datum || addDays(today(), 1), uhrzeit: '', aufgaben: [...(kmap[q.kunde]?.aufgaben || [])], notiz: '', erledigt: false };
  const tasks = a.aufgaben.map((text) => ({ text }));

  render(isNew ? 'Termin planen' : 'Termin', `
    <form id="f" class="form">
      ${customerSelect(customers, a.kundeId)}
      <div class="grid2">
        <label>Datum *<input type="date" name="datum" required value="${esc(a.datum)}"></label>
        <label>Uhrzeit<input type="time" name="uhrzeit" value="${esc(a.uhrzeit)}"></label>
      </div>
      <div class="label">Was ist zu tun?</div>
      <ul class="tasks" id="tasks"></ul>
      <label>Notiz<textarea name="notiz" rows="2">${esc(a.notiz)}</textarea></label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : `
        ${a.erledigt ? '' : `<a class="btn ghost block" href="#/einsatz/neu?kunde=${a.kundeId}&termin=${a.id}">✓ Erledigt – Einsatz erfassen</a>`}
        <button class="btn ghost block" type="button" id="ics">📆 In Handy-Kalender übernehmen</button>
        <button class="btn danger ghost block" type="button" id="del">Termin löschen</button>`}
    </form>
  `);
  const editor = taskEditor($('#tasks'), tasks, false);
  $('#f [name=kundeId]').addEventListener('change', (e) => {
    editor.set((kmap[e.target.value]?.aufgaben || []).map((text) => ({ text })));
  });
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.assign(a, {
      kundeId: fd.get('kundeId'),
      datum: fd.get('datum'),
      uhrzeit: fd.get('uhrzeit'),
      aufgaben: tasks.map((t) => t.text),
      notiz: fd.get('notiz').trim(),
    });
    await DB.put('appointments', a);
    toast('Termin gespeichert');
    go('#/termine', true);
  });
  $('#ics')?.addEventListener('click', () => downloadIcs(a, kmap[a.kundeId]));
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Termin löschen?')) return;
    await DB.del('appointments', a.id);
    go('#/termine', true);
  });
}

function downloadIcs(a, k) {
  const icsEsc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const d = a.datum.replace(/-/g, '');
  let dt;
  if (a.uhrzeit) {
    const start = `${d}T${a.uhrzeit.replace(':', '')}00`;
    const end = new Date(parseISO(a.datum).getTime());
    const [h, m] = a.uhrzeit.split(':').map(Number);
    end.setHours(h + 2, m);
    dt = `DTSTART:${start}\r\nDTEND:${isoDate(end).replace(/-/g, '')}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  } else {
    dt = `DTSTART;VALUE=DATE:${d}\r\nDTEND;VALUE=DATE:${addDays(a.datum, 1).replace(/-/g, '')}`;
  }
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Toths Reinigungsservice//DE', 'BEGIN:VEVENT',
    `UID:${a.id}@toths-reinigung`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    dt,
    `SUMMARY:${icsEsc('Reinigung ' + (k?.name || ''))}`,
    `LOCATION:${icsEsc([k?.strasse, k?.plzOrt].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsEsc([...(a.aufgaben || []), a.notiz].filter(Boolean).join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  download(new Blob([ics], { type: 'text/calendar' }), `termin-${a.datum}.ics`);
}

function customerSelect(customers, selected) {
  return `<label>Kunde *<select name="kundeId" required>
    <option value="">– Kunde wählen –</option>
    ${customers.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
  </select></label>`;
}

function noCustomers() {
  render('Hinweis', `<div class="empty"><p>Lege zuerst einen Kunden an.</p><a class="btn" href="#/kunde/neu">+ Kunde anlegen</a></div>`);
}

// Aufgabenliste: mit Haken (erledigt) für Einsätze, ohne Haken für geplante Termine
function taskEditor(el, tasks, withCheck = true) {
  const draw = () => {
    el.innerHTML = tasks.map((t, i) => `<li class="task">
      <label>${withCheck ? `<input type="checkbox" data-i="${i}" ${t.erledigt ? 'checked' : ''}>` : '•'} <span>${esc(t.text)}</span></label>
      <button type="button" class="icon-btn" data-del="${i}" aria-label="Entfernen">✕</button></li>`).join('')
      + `<li class="task add"><input type="text" class="task-new" placeholder="Aufgabe hinzufügen…" enterkeyhint="done"><button type="button" class="btn small" data-add>+</button></li>`;
  };
  const add = () => {
    const v = $('.task-new', el).value.trim();
    if (!v) return;
    tasks.push({ text: v, erledigt: true });
    draw();
    $('.task-new', el).focus();
  };
  el.addEventListener('change', (e) => { if (e.target.dataset.i !== undefined) tasks[e.target.dataset.i].erledigt = e.target.checked; });
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { tasks.splice(Number(d.dataset.del), 1); draw(); }
    if (e.target.closest('[data-add]')) add();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('task-new')) { e.preventDefault(); add(); }
  });
  draw();
  return { set(list) { tasks.splice(0, tasks.length, ...list); draw(); } };
}

/* ---------- Einsätze ---------- */
function visitCard(v, kmap, showName = true) {
  const done = (v.aufgaben || []).filter((t) => t.erledigt).map((t) => t.text);
  return `<a class="card link" href="#/einsatz/${v.id}">
    <div class="row between">
      <b>${showName ? esc(kundeName(kmap, v.kundeId)) : fmtDateLong(v.datum)}</b>
      ${v.rechnungId ? '<span class="badge ok">abgerechnet</span>' : '<span class="badge warn">offen</span>'}
    </div>
    <div class="muted small">${showName ? fmtDateLong(v.datum) + ' · ' : ''}${v.stunden ? fmtNum(v.stunden) + ' Std.' : ''}${v.fotoAnzahl ? ` · 📷 ${v.fotoAnzahl}` : ''}</div>
    ${done.length ? `<div class="small">${esc(done.join(' · '))}</div>` : ''}
  </a>`;
}

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
    <div class="mt">${visits.map((v) => visitCard(v, data.kmap)).join('') || '<div class="empty">Keine Einsätze.</div>'}</div>
  `, { tab: 'einsaetze', back: false });
});

route('/einsatz/neu', (_, q) => visitForm(null, q));
route('/einsatz/:id/bearbeiten', async ({ id }) => visitForm(await DB.get('visits', id), {}));

async function visitForm(v, q) {
  const customers = (await DB.all('customers')).filter((c) => c.aktiv !== false || c.id === v?.kundeId).sort(byName);
  if (!customers.length) return noCustomers();
  const kmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const isNew = !v;
  const termin = q.termin ? await DB.get('appointments', q.termin) : null;
  if (isNew) {
    const kundeId = q.kunde || termin?.kundeId || '';
    const vorlage = termin?.aufgaben || kmap[kundeId]?.aufgaben || [];
    v = { id: DB.uid(), kundeId, datum: today(), von: termin?.uhrzeit || '', bis: '', stunden: '', aufgaben: vorlage.map((text) => ({ text, erledigt: true })), notiz: '', rechnungId: null };
  }
  const tasks = v.aufgaben.map((t) => ({ ...t }));
  const existing = isNew ? [] : await DB.by('photos', 'visitId', v.id);
  const pending = [];

  render(isNew ? 'Einsatz erfassen' : 'Einsatz bearbeiten', `
    <form id="f" class="form">
      ${customerSelect(customers, v.kundeId)}
      <label>Datum *<input type="date" name="datum" required value="${esc(v.datum)}"></label>
      <div class="grid3">
        <label>Von<input type="time" name="von" value="${esc(v.von)}"></label>
        <label>Bis<input type="time" name="bis" value="${esc(v.bis)}"></label>
        <label>Stunden<input type="number" name="stunden" step="0.25" min="0" inputmode="decimal" value="${esc(v.stunden)}"></label>
      </div>
      <div class="label">Was wurde gereinigt?</div>
      <ul class="tasks" id="tasks"></ul>
      <div class="label">Fotos</div>
      <div id="photos"></div>
      <label>Notiz<textarea name="notiz" rows="3" placeholder="z. B. Besonderheiten, Schäden, Material verbraucht…">${esc(v.notiz)}</textarea></label>
      ${v.rechnungId ? '<p class="muted small">Dieser Einsatz ist bereits abgerechnet.</p>' : ''}
      <button class="btn block" type="submit" id="save">Speichern</button>
    </form>
  `);

  const editor = taskEditor($('#tasks'), tasks, true);
  photoEditor($('#photos'), existing, pending);

  const f = $('#f');
  f.kundeId.addEventListener('change', (e) => {
    if (!termin) editor.set((kmap[e.target.value]?.aufgaben || []).map((text) => ({ text, erledigt: true })));
  });
  const calcHours = () => {
    if (!f.von.value || !f.bis.value) return;
    const [h1, m1] = f.von.value.split(':').map(Number);
    const [h2, m2] = f.bis.value.split(':').map(Number);
    let mins = h2 * 60 + m2 - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    f.stunden.value = Math.round(mins / 15) / 4;
  };
  f.von.addEventListener('change', calcHours);
  f.bis.addEventListener('change', calcHours);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#save').disabled = true;
    const fd = new FormData(f);
    Object.assign(v, {
      kundeId: fd.get('kundeId'),
      datum: fd.get('datum'),
      von: fd.get('von'),
      bis: fd.get('bis'),
      stunden: num(fd.get('stunden')) || '',
      aufgaben: tasks,
      notiz: fd.get('notiz').trim(),
    });
    for (const p of pending) {
      await DB.put('photos', { id: p.id, visitId: v.id, typ: p.typ, blob: p.blob, erstellt: new Date().toISOString() });
    }
    v.fotoAnzahl = existing.length + pending.length;
    await DB.put('visits', v);

    if (termin && !termin.erledigt) {
      Object.assign(termin, { erledigt: true, visitId: v.id });
      await DB.put('appointments', termin);
    }
    const k = kmap[v.kundeId];
    if (isNew && k?.intervallTage > 0) {
      const openAppts = (await DB.by('appointments', 'kundeId', k.id)).filter((a) => !a.erledigt);
      const nextDate = addDays(v.datum, k.intervallTage);
      if (!openAppts.length && confirm(`Nächste Reinigung bei ${k.name} am ${fmtDateLong(nextDate)} als Termin eintragen?`)) {
        await DB.put('appointments', { kundeId: k.id, datum: nextDate, uhrzeit: v.von || '', aufgaben: [...(k.aufgaben || [])], notiz: '', erledigt: false });
      }
    }
    toast('Einsatz gespeichert');
    go(`#/einsatz/${v.id}`, true);
  });
}

function photoEditor(el, existing, pending) {
  const thumb = (p, kind) => `<div class="thumb">
    <img src="${p.url || (p.url = objUrl(p.blob))}" alt="Foto" data-view>
    <button type="button" class="thumb-del" data-${kind}="${p.id}" aria-label="Foto entfernen">✕</button></div>`;
  const draw = () => {
    el.innerHTML = ['vorher', 'nachher'].map((typ) => `<div class="photo-group">
      <div class="small muted">${typ === 'vorher' ? 'Vorher' : 'Nachher'}</div>
      <div class="thumbs">
        ${existing.filter((p) => p.typ === typ).map((p) => thumb(p, 'ex')).join('')}
        ${pending.filter((p) => p.typ === typ).map((p) => thumb(p, 'pe')).join('')}
        <label class="thumb add">📷<span>Foto</span><input type="file" accept="image/*" multiple data-typ="${typ}" hidden></label>
      </div></div>`).join('');
  };
  el.addEventListener('change', async (e) => {
    const input = e.target;
    if (!input.files?.length) return;
    toast('Fotos werden verarbeitet…');
    for (const file of input.files) {
      pending.push({ id: DB.uid(), typ: input.dataset.typ, blob: await compressImage(file) });
    }
    draw();
  });
  el.addEventListener('click', async (e) => {
    const img = e.target.closest('[data-view]');
    if (img) return lightbox(img.src);
    const ex = e.target.closest('[data-ex]');
    if (ex && confirm('Foto endgültig löschen?')) {
      await DB.del('photos', ex.dataset.ex);
      existing.splice(existing.findIndex((p) => p.id === ex.dataset.ex), 1);
      draw();
    }
    const pe = e.target.closest('[data-pe]');
    if (pe) {
      pending.splice(pending.findIndex((p) => p.id === pe.dataset.pe), 1);
      draw();
    }
  });
  draw();
}

route('/einsatz/:id', async ({ id }) => {
  const v = await DB.get('visits', id);
  if (!v) return go('#/einsaetze', true);
  const [k, photos, inv] = await Promise.all([
    DB.get('customers', v.kundeId),
    DB.by('photos', 'visitId', id),
    v.rechnungId ? DB.get('invoices', v.rechnungId) : null,
  ]);
  const gallery = (typ, label) => {
    const ps = photos.filter((p) => p.typ === typ);
    return ps.length ? `<div class="small muted mt">${label}</div><div class="thumbs">${ps.map((p) => `<div class="thumb"><img src="${objUrl(p.blob)}" alt="${label}" data-view></div>`).join('')}</div>` : '';
  };
  render('Einsatz', `
    <div class="card">
      <div class="row between"><a class="strong" href="#/kunde/${v.kundeId}">${esc(k?.name || 'Unbekannter Kunde')}</a>
        ${inv ? `<a class="badge ok" href="#/rechnung/${inv.id}">Rechnung ${esc(inv.nummer)}</a>` : '<span class="badge warn">nicht abgerechnet</span>'}</div>
      <div class="muted">${fmtDateLong(v.datum)}${v.von ? ` · ${esc(v.von)}${v.bis ? '–' + esc(v.bis) : ''} Uhr` : ''}${v.stunden ? ` · ${fmtNum(v.stunden)} Std.` : ''}</div>
      <ul class="done-list mt">${(v.aufgaben || []).map((t) => `<li class="${t.erledigt ? 'ok' : 'no'}">${t.erledigt ? '✓' : '✗'} ${esc(t.text)}</li>`).join('')}</ul>
      ${v.notiz ? `<div class="mt">📝 ${nl2br(v.notiz)}</div>` : ''}
      ${gallery('vorher', 'Vorher')}${gallery('nachher', 'Nachher')}
    </div>
    <div class="quick">
      <a class="btn ghost" href="#/einsatz/${id}/bearbeiten">Bearbeiten</a>
      ${photos.length && navigator.canShare ? '<button class="btn ghost" id="share">Fotos teilen</button>' : ''}
      ${v.rechnungId ? '' : `<a class="btn ghost" href="#/rechnung/neu?kunde=${v.kundeId}">🧾 Abrechnen</a>`}
    </div>
    ${v.rechnungId ? '' : '<button class="btn danger ghost block" id="del">Einsatz löschen</button>'}
  `);
  $('#view').addEventListener('click', (e) => { const img = e.target.closest('[data-view]'); if (img) lightbox(img.src); });
  $('#share')?.addEventListener('click', async () => {
    const files = photos.map((p, i) => new File([p.blob], `${v.datum}_${p.typ}_${i + 1}.jpg`, { type: p.blob.type || 'image/jpeg' }));
    if (!navigator.canShare({ files })) return toast('Teilen wird auf diesem Gerät nicht unterstützt');
    try { await navigator.share({ files, title: `Reinigung ${fmtDate(v.datum)}` }); } catch { /* abgebrochen */ }
  });
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Einsatz inkl. Fotos löschen?')) return;
    await deleteVisit(v);
    go('#/einsaetze', true);
  });
});

async function deleteVisit(v) {
  for (const p of await DB.by('photos', 'visitId', v.id)) await DB.del('photos', p.id);
  for (const a of await DB.by('appointments', 'kundeId', v.kundeId)) {
    if (a.visitId === v.id) { a.erledigt = false; delete a.visitId; await DB.put('appointments', a); }
  }
  await DB.del('visits', v.id);
}

/* ---------- Rechnungen ---------- */
const STATUS = { offen: ['offen', 'warn'], bezahlt: ['bezahlt', 'ok'], storniert: ['storniert', 'soft'] };

function invoiceCard(i) {
  const [label, cls] = STATUS[i.status];
  return `<a class="card link" href="#/rechnung/${i.id}">
    <div class="row between"><b>${esc(i.nummer)}</b><span class="badge ${cls}">${label}</span></div>
    <div class="row between small"><span class="muted">${esc(i.kunde.name)} · ${fmtDate(i.datum)}</span><b>${money(i.summe)}</b></div>
  </a>`;
}

route('/rechnungen', async (_, q) => {
  const invoices = (await DB.all('invoices')).sort((a, b) => b.nummer.localeCompare(a.nummer));
  const filter = q.filter || 'alle';
  const year = new Date().getFullYear();
  const umsatz = invoices.filter((i) => i.status !== 'storniert' && i.datum.startsWith(String(year))).reduce((s, i) => s + i.summe, 0);
  const pct = Math.min(100, (umsatz / 2500000) * 100);
  const shown = invoices.filter((i) => filter === 'alle' || i.status === filter);
  render('Rechnungen', `
    <a class="btn block" href="#/rechnung/neu">+ Rechnung erstellen</a>
    <div class="card mt">
      <div class="row between"><span>Umsatz ${year}</span><b>${money(umsatz)}</b></div>
      <div class="bar"><div style="width:${pct}%" class="${pct > 80 ? 'warn' : ''}"></div></div>
      <div class="muted small">Kleinunternehmergrenze: 25.000 € im Vorjahr, 100.000 € im laufenden Jahr (§ 19 UStG).</div>
    </div>
    <div class="seg mt">
      ${['alle', 'offen', 'bezahlt', 'storniert'].map((f) => `<a href="#/rechnungen?filter=${f}" class="${filter === f ? 'active' : ''}">${f[0].toUpperCase() + f.slice(1)}</a>`).join('')}
    </div>
    <div class="mt">${shown.map(invoiceCard).join('') || '<div class="empty">Keine Rechnungen.</div>'}</div>
  `, { tab: 'rechnungen', back: false });
});

function visitToPosition(v, k) {
  const done = (v.aufgaben || []).filter((t) => t.erledigt).map((t) => t.text);
  return {
    visitId: v.id,
    beschreibung: 'Reinigung' + (done.length ? `: ${done.join(', ')}` : ''),
    datum: v.datum,
    menge: v.stunden || 1,
    einheit: v.stunden ? 'Std.' : 'pauschal',
    preis: k.stundensatz || S.stundensatz || 0,
    art: 'arbeit',
  };
}

const positionTotal = (p) => Math.round(num(p.menge) * p.preis);

async function nextInvoiceNumber(datum) {
  const year = datum.slice(0, 4);
  const prefix = `${S.nrPrefix || 'RE'}-${year}-`;
  const nums = (await DB.all('invoices')).filter((i) => i.nummer.startsWith(prefix)).map((i) => parseInt(i.nummer.slice(prefix.length), 10) || 0);
  const n = nums.length ? Math.max(...nums) + 1 : Math.max(1, Number(S.nrStart) || 1);
  return prefix + String(n).padStart(3, '0');
}

route('/rechnung/neu', async (_, q) => {
  const data = await loadAll();
  const customers = data.customers;
  if (!customers.length) return noCustomers();
  if (!settingsComplete()) {
    return render('Rechnung erstellen', `<div class="card hint">
      <p><b>Bitte zuerst deine Firmendaten eintragen.</b></p>
      <p class="small">Eine Rechnung muss nach § 14 UStG deinen vollständigen Namen, deine Anschrift und deine Steuernummer enthalten.</p>
      <a class="btn" href="#/einstellungen">Zu den Einstellungen</a></div>`);
  }
  let positions = [];
  const draft = { kundeId: q.kunde || '', datum: today(), zahlungsziel: S.zahlungsziel };

  render('Rechnung erstellen', `
    <form id="f" class="form">
      ${customerSelect(customers, draft.kundeId)}
      <div class="grid2">
        <label>Rechnungsdatum<input type="date" name="datum" required value="${draft.datum}"></label>
        <label>Zahlungsziel (Tage)<input type="number" name="zahlungsziel" min="0" value="${draft.zahlungsziel}"></label>
      </div>
      <div id="visits"></div>
      <div class="label">Positionen</div>
      <div id="positions"></div>
      <button type="button" class="btn ghost small" id="addPos">+ Position hinzufügen</button>
      <div class="total" id="total"></div>
      <label>Zusätzlicher Text (optional)<textarea name="notiz" rows="2" placeholder="z. B. Vielen Dank für Ihren Auftrag!"></textarea></label>
      <p class="muted small">Die Rechnungsnummer wird beim Erstellen automatisch fortlaufend vergeben. Der Hinweis nach § 19 UStG (Kleinunternehmer) wird automatisch eingefügt.</p>
      <button class="btn block" type="submit" id="save">Rechnung erstellen</button>
    </form>
  `);

  const f = $('#f');
  const drawTotal = () => { $('#total').innerHTML = `Gesamt: <b>${money(positions.reduce((s, p) => s + positionTotal(p), 0))}</b>`; };
  const drawPositions = () => {
    $('#positions').innerHTML = positions.map((p, i) => `<div class="pos card" data-i="${i}">
      <div class="row between"><b>Pos. ${i + 1}</b><button type="button" class="icon-btn" data-rm="${i}" aria-label="Position entfernen">✕</button></div>
      <label>Leistung<textarea data-k="beschreibung" rows="2">${esc(p.beschreibung)}</textarea></label>
      <div class="grid2">
        <label>Leistungsdatum<input type="date" data-k="datum" value="${esc(p.datum)}"></label>
        <label>Art<select data-k="art">
          ${[['arbeit', 'Arbeitsleistung'], ['fahrt', 'Fahrtkosten'], ['material', 'Material']].map(([v, l]) => `<option value="${v}" ${p.art === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      </div>
      <div class="grid3">
        <label>Menge<input type="number" step="0.25" min="0" inputmode="decimal" data-k="menge" value="${esc(p.menge)}"></label>
        <label>Einheit<select data-k="einheit">
          ${['Std.', 'pauschal', 'km', 'Stk.'].map((u) => `<option ${p.einheit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select></label>
        <label>Preis (€)<input type="number" step="0.01" min="0" inputmode="decimal" data-k="preis" value="${centsInput(p.preis)}"></label>
      </div>
      <div class="right small">Betrag: <b data-sum>${money(positionTotal(p))}</b></div>
    </div>`).join('') || '<div class="empty small">Noch keine Positionen.</div>';
    drawTotal();
  };
  const drawVisits = () => {
    const k = data.kmap[f.kundeId.value];
    const open = k ? data.visits.filter((v) => v.kundeId === k.id && !v.rechnungId).sort((a, b) => a.datum.localeCompare(b.datum)) : [];
    positions = positions.filter((p) => !p.visitId);
    positions.unshift(...open.map((v) => visitToPosition(v, k)));
    $('#visits').innerHTML = open.length
      ? `<div class="label">Nicht abgerechnete Einsätze</div>${open.map((v) => `<label class="check"><input type="checkbox" data-visit="${v.id}" checked> ${fmtDate(v.datum)} · ${v.stunden ? fmtNum(v.stunden) + ' Std.' : 'ohne Stundenangabe'}</label>`).join('')}`
      : (k ? '<p class="muted small">Keine offenen Einsätze für diesen Kunden – du kannst Positionen manuell hinzufügen.</p>' : '');
    drawPositions();
  };

  f.kundeId.addEventListener('change', drawVisits);
  $('#visits').addEventListener('change', (e) => {
    const id = e.target.dataset.visit;
    if (!id) return;
    if (e.target.checked) {
      const v = data.visits.find((x) => x.id === id);
      positions.push(visitToPosition(v, data.kmap[v.kundeId]));
      positions.sort((a, b) => (a.visitId ? 0 : 1) - (b.visitId ? 0 : 1) || a.datum.localeCompare(b.datum));
    } else {
      positions = positions.filter((p) => p.visitId !== id);
    }
    drawPositions();
  });
  $('#positions').addEventListener('input', (e) => {
    const key = e.target.dataset.k;
    if (!key) return;
    const box = e.target.closest('.pos');
    const p = positions[box.dataset.i];
    p[key] = key === 'preis' ? Math.round(num(e.target.value) * 100) : e.target.value;
    $('[data-sum]', box).textContent = money(positionTotal(p));
    drawTotal();
  });
  $('#positions').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    const [p] = positions.splice(Number(rm.dataset.rm), 1);
    if (p.visitId) { const cb = $(`[data-visit="${p.visitId}"]`); if (cb) cb.checked = false; }
    drawPositions();
  });
  $('#addPos').addEventListener('click', () => {
    positions.push({ beschreibung: '', datum: today(), menge: 1, einheit: 'pauschal', preis: 0, art: 'arbeit' });
    drawPositions();
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const k = data.kmap[fd.get('kundeId')];
    const items = positions.filter((p) => p.beschreibung.trim() && num(p.menge) > 0);
    if (!items.length) return alert('Bitte mindestens eine Position mit Leistungsbeschreibung und Menge angeben.');
    if (items.some((p) => !p.datum)) return alert('Bitte bei jeder Position das Leistungsdatum angeben (Pflichtangabe).');
    if (!k.strasse || !k.plzOrt) {
      if (!confirm('Beim Kunden fehlt die Anschrift. Rechnungen über 250 € benötigen die vollständige Anschrift des Kunden. Trotzdem erstellen?')) return;
    }
    $('#save').disabled = true;
    const datum = fd.get('datum');
    const ziel = Number(fd.get('zahlungsziel')) || 0;
    const positionen = items.map((p) => ({ ...p, beschreibung: p.beschreibung.trim(), menge: num(p.menge), betrag: positionTotal(p) }));
    const inv = {
      nummer: await nextInvoiceNumber(datum),
      datum,
      faellig: addDays(datum, ziel),
      kundeId: k.id,
      kunde: { name: k.name, strasse: k.strasse, plzOrt: k.plzOrt, privat: !!k.privat },
      absender: Object.fromEntries(['firma', 'inhaber', 'strasse', 'plzOrt', 'telefon', 'email', 'steuernummer', 'bank', 'iban', 'bic'].map((key) => [key, S[key]])),
      positionen,
      summe: positionen.reduce((s, p) => s + p.betrag, 0),
      arbeitskosten: positionen.filter((p) => p.art !== 'material').reduce((s, p) => s + p.betrag, 0),
      notiz: fd.get('notiz').trim(),
      status: 'offen',
      erstellt: new Date().toISOString(),
    };
    await DB.put('invoices', inv);
    for (const p of positionen.filter((x) => x.visitId)) {
      const v = data.visits.find((x) => x.id === p.visitId);
      v.rechnungId = inv.id;
      await DB.put('visits', v);
    }
    toast(`Rechnung ${inv.nummer} erstellt`);
    go(`#/rechnung/${inv.id}`, true);
  });

  drawVisits();
});

function invoiceDoc(inv) {
  const a = inv.absender;
  const k = inv.kunde;
  const dates = inv.positionen.map((p) => p.datum).sort();
  const zeitraum = dates[0] === dates[dates.length - 1] ? fmtDate(dates[0]) : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`;
  return `<article class="invoice-doc ${inv.status === 'storniert' ? 'cancelled' : ''}">
    <header class="inv-head">
      <div class="inv-brand">${esc(a.firma)}</div>
      <div class="inv-contact">${esc(a.inhaber)}<br>${esc(a.strasse)}<br>${esc(a.plzOrt)}
        ${a.telefon ? `<br>Tel. ${esc(a.telefon)}` : ''}${a.email ? `<br>${esc(a.email)}` : ''}</div>
    </header>
    <div class="inv-row">
      <div class="inv-recipient">
        <div class="inv-sender">${esc([a.firma, a.inhaber, a.strasse, a.plzOrt].filter(Boolean).join(' · '))}</div>
        ${esc(k.name)}<br>${esc(k.strasse)}<br>${esc(k.plzOrt)}
      </div>
      <table class="inv-meta">
        <tr><td>Rechnungsnr.</td><td><b>${esc(inv.nummer)}</b></td></tr>
        <tr><td>Rechnungsdatum</td><td>${fmtDate(inv.datum)}</td></tr>
        <tr><td>Leistungszeitraum</td><td>${zeitraum}</td></tr>
        <tr><td>Steuernummer</td><td>${esc(a.steuernummer)}</td></tr>
      </table>
    </div>
    <h2 class="inv-title">Rechnung${inv.status === 'storniert' ? ' – STORNIERT' : ''}</h2>
    <p>Für die erbrachten Leistungen stelle ich Ihnen folgende Beträge in Rechnung:</p>
    <table class="inv-items">
      <thead><tr><th>Pos.</th><th>Datum</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis</th><th class="r">Betrag</th></tr></thead>
      <tbody>${inv.positionen.map((p, i) => `<tr>
        <td>${i + 1}</td><td>${fmtDate(p.datum)}</td><td>${nl2br(p.beschreibung)}</td>
        <td class="r">${fmtNum(p.menge)} ${esc(p.einheit)}</td><td class="r">${money(p.preis)}</td><td class="r">${money(p.betrag)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="5" class="r"><b>Gesamtbetrag</b></td><td class="r"><b>${money(inv.summe)}</b></td></tr></tfoot>
    </table>
    <p class="inv-note">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</p>
    ${k.privat ? `<p class="inv-note">Im Rechnungsbetrag sind Arbeits- und Fahrtkosten in Höhe von <b>${money(inv.arbeitskosten)}</b> enthalten (haushaltsnahe Dienstleistung, § 35a EStG). Die Steuerermäßigung setzt eine Zahlung per Überweisung voraus.</p>
    <p class="inv-note small">Bitte bewahren Sie diese Rechnung zwei Jahre auf (§ 14b Abs. 1 Satz 5 UStG).</p>` : ''}
    <p>Bitte überweisen Sie den Gesamtbetrag ${inv.faellig > inv.datum ? `bis zum <b>${fmtDate(inv.faellig)}</b>` : '<b>sofort ohne Abzug</b>'} unter Angabe der Rechnungsnummer auf das unten genannte Konto.</p>
    ${inv.notiz ? `<p>${nl2br(inv.notiz)}</p>` : ''}
    <p>Mit freundlichen Grüßen<br>${esc(a.inhaber)}</p>
    <footer class="inv-foot">
      <div>${esc(a.firma)}<br>Inh. ${esc(a.inhaber)}<br>${esc(a.strasse)}, ${esc(a.plzOrt)}</div>
      <div>${a.telefon ? `Tel. ${esc(a.telefon)}<br>` : ''}${esc(a.email)}<br>Steuernr.: ${esc(a.steuernummer)}</div>
      <div>${esc(a.bank)}<br>IBAN: ${esc(a.iban)}${a.bic ? `<br>BIC: ${esc(a.bic)}` : ''}</div>
    </footer>
  </article>`;
}

route('/rechnung/:id', async ({ id }) => {
  const inv = await DB.get('invoices', id);
  if (!inv) return go('#/rechnungen', true);
  const [label, cls] = STATUS[inv.status];
  render(inv.nummer, `
    <div class="card no-print">
      <div class="row between"><span>Status</span><span class="badge ${cls}">${label}${inv.bezahltAm ? ` am ${fmtDate(inv.bezahltAm)}` : ''}</span></div>
      <div class="quick">
        <button class="btn" id="print">🖨️ Drucken / PDF</button>
        ${inv.status === 'offen' ? '<button class="btn ghost" id="paid">✓ Bezahlt</button>' : ''}
        ${inv.status === 'bezahlt' ? '<button class="btn ghost" id="unpaid">Wieder offen</button>' : ''}
      </div>
      <p class="muted small">Tipp: Im Druckdialog „Als PDF sichern“ wählen und dann per WhatsApp oder E-Mail an den Kunden senden.</p>
    </div>
    <div class="doc-wrap">${invoiceDoc(inv)}</div>
    ${inv.status !== 'storniert' ? '<button class="btn danger ghost block no-print" id="storno">Rechnung stornieren</button>' : ''}
  `);
  $('#print').addEventListener('click', () => {
    const old = document.title;
    document.title = `Rechnung ${inv.nummer}`;
    window.print();
    setTimeout(() => { document.title = old; }, 1000);
  });
  $('#paid')?.addEventListener('click', async () => {
    Object.assign(inv, { status: 'bezahlt', bezahltAm: today() });
    await DB.put('invoices', inv);
    toast('Als bezahlt markiert');
    router();
  });
  $('#unpaid')?.addEventListener('click', async () => {
    Object.assign(inv, { status: 'offen', bezahltAm: null });
    await DB.put('invoices', inv);
    router();
  });
  $('#storno')?.addEventListener('click', async () => {
    if (!confirm(`Rechnung ${inv.nummer} stornieren? Die Nummer bleibt vergeben, die Einsätze können neu abgerechnet werden.`)) return;
    inv.status = 'storniert';
    inv.storniertAm = today();
    await DB.put('invoices', inv);
    for (const v of await DB.by('visits', 'kundeId', inv.kundeId)) {
      if (v.rechnungId === inv.id) { v.rechnungId = null; await DB.put('visits', v); }
    }
    toast('Rechnung storniert');
    router();
  });
});

/* ---------- Einstellungen & Datensicherung ---------- */
route('/einstellungen', async () => {
  const field = (name, label, attrs = '') => `<label>${label}<input name="${name}" value="${esc(S[name])}" ${attrs}></label>`;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  render('Einstellungen', `
    <form id="f" class="form">
      <h3 class="section">Firma (erscheint auf Rechnungen)</h3>
      ${field('firma', 'Firmenname *', 'required')}
      ${field('inhaber', 'Inhaber/in (Vor- und Nachname) *')}
      ${field('strasse', 'Straße & Hausnr. *')}
      ${field('plzOrt', 'PLZ & Ort *')}
      <div class="grid2">${field('telefon', 'Telefon', 'type="tel"')}${field('email', 'E-Mail', 'type="email"')}</div>
      ${field('steuernummer', 'Steuernummer (vom Finanzamt) *')}
      <h3 class="section">Bankverbindung</h3>
      ${field('bank', 'Bank')}
      <div class="grid2">${field('iban', 'IBAN')}${field('bic', 'BIC')}</div>
      <h3 class="section">Rechnungen</h3>
      <div class="grid2">
        <label>Standard-Stundensatz (€)<input name="stundensatz" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(S.stundensatz)}"></label>
        <label>Zahlungsziel (Tage)<input name="zahlungsziel" type="number" min="0" value="${esc(S.zahlungsziel)}"></label>
      </div>
      <div class="grid2">
        ${field('nrPrefix', 'Nummernkreis-Präfix')}
        <label>Erste Rechnungsnr. im Jahr<input name="nrStart" type="number" min="1" value="${esc(S.nrStart)}"></label>
      </div>
      <p class="muted small">Format: ${esc(S.nrPrefix)}-${new Date().getFullYear()}-001. Die Nummern werden lückenlos fortlaufend vergeben.</p>
      <button class="btn block" type="submit">Speichern</button>
    </form>

    <h3 class="section">Datensicherung</h3>
    <div class="card">
      <p class="small">Alle Daten und Fotos liegen <b>nur auf diesem Handy</b>. Erstelle regelmäßig eine Sicherung (z. B. in Google Drive / iCloud speichern) – Rechnungen musst du 10 Jahre aufbewahren.</p>
      ${est ? `<p class="muted small">Belegter Speicher: ${(est.usage / 1048576).toFixed(1)} MB${persisted ? ' · dauerhaft gespeichert ✓' : ''}</p>` : ''}
      <div class="quick">
        <button class="btn" id="export">⬇️ Sicherung erstellen</button>
        <label class="btn ghost">⬆️ Wiederherstellen<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
    </div>

    <h3 class="section">App auf den Startbildschirm</h3>
    <div class="card small">
      <p><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“.</p>
      <p><b>Android (Chrome):</b> Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</p>
    </div>
    <p class="muted small center">Toths Reinigungsservice · Version 1.0</p>
  `);

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const key of ['firma', 'inhaber', 'strasse', 'plzOrt', 'telefon', 'email', 'steuernummer', 'bank', 'iban', 'bic', 'nrPrefix']) S[key] = fd.get(key).trim();
    S.iban = S.iban.toUpperCase();
    S.stundensatz = Math.round(num(fd.get('stundensatz')) * 100);
    S.zahlungsziel = Number(fd.get('zahlungsziel')) || 0;
    S.nrStart = Math.max(1, Number(fd.get('nrStart')) || 1);
    await DB.put('settings', S);
    toast('Einstellungen gespeichert');
  });
  $('#export').addEventListener('click', exportBackup);
  $('#import').addEventListener('change', (e) => e.target.files[0] && importBackup(e.target.files[0]));
});

async function exportBackup() {
  toast('Sicherung wird erstellt…');
  const data = { app: 'toths-reinigung', version: 1, exportiert: new Date().toISOString() };
  for (const s of DB.stores) data[s] = await DB.all(s);
  data.photos = await Promise.all(data.photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
  const name = `toths-sicherung-${today()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  download(blob, name);
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return alert('Die Datei ist keine gültige Sicherung.'); }
  if (data.app !== 'toths-reinigung') return alert('Die Datei ist keine Sicherung dieser App.');
  if (!confirm(`Sicherung vom ${new Date(data.exportiert).toLocaleString('de-DE')} wiederherstellen?\nAlle aktuellen Daten auf diesem Gerät werden ersetzt!`)) return;
  for (const s of DB.stores) {
    await DB.clear(s);
    for (const item of data[s] || []) {
      if (s === 'photos') item.blob = await (await fetch(item.blob)).blob();
      await DB.put(s, item);
    }
  }
  await loadSettings();
  toast('Sicherung wiederhergestellt');
  go('#/', true);
}

/* ---------- Start ---------- */
$('#backBtn').addEventListener('click', () => (history.length > 1 ? history.back() : go('#/')));
window.addEventListener('hashchange', router);

(async () => {
  await loadSettings();
  router();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
