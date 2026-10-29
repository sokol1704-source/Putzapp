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
const monthLabel = (m) => parseISO(`${m}-01`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const lastOfMonth = (m) => { const [y, mo] = m.split('-').map(Number); return isoDate(new Date(y, mo, 0)); };
const prevMonth = () => { const d = new Date(); d.setDate(0); return isoDate(d).slice(0, 7); };
const isMonthly = (k) => k?.abrechnung === 'monat';
const priceLabel = (k) => (isMonthly(k) ? `${money(k.monatspauschale || 0)}/Monat` : `${money(k.stundensatz || 0)}/Std.`);

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

// In der Android-App (Capacitor) laufen Drucken und Teilen über native Plugins
const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const native = (plugin, method, options) => window.Capacitor.nativePromise(plugin, method, options);

// Dateien teilen (WhatsApp, E-Mail, Drive …). Gibt false zurück, wenn das Gerät kein Teilen kann.
async function shareFiles(files, title) {
  try {
    if (NATIVE) {
      const uris = [];
      for (const f of files) {
        const data = (await blobToDataUrl(f.blob)).split(',')[1];
        uris.push((await native('Filesystem', 'writeFile', { path: f.name, data, directory: 'CACHE' })).uri);
      }
      await native('Share', 'share', { title, dialogTitle: title, files: uris });
      return true;
    }
    const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
    if (!navigator.canShare?.({ files: list })) return false;
    await navigator.share({ files: list, title });
  } catch (e) {
    if (!/cancel|abort/i.test(`${e.name} ${e.message}`)) toast('Teilen fehlgeschlagen: ' + e.message);
  }
  return true;
}

async function shareText(text, title) {
  try {
    if (NATIVE) return await native('Share', 'share', { title, text, dialogTitle: title });
    if (navigator.share) return await navigator.share({ title, text });
    await navigator.clipboard.writeText(text);
    toast('Plan in die Zwischenablage kopiert');
  } catch (e) {
    if (!/cancel|abort/i.test(`${e.name} ${e.message}`)) toast('Teilen fehlgeschlagen: ' + e.message);
  }
}

async function saveFile(blob, name) {
  if (!(await shareFiles([{ blob, name }], name))) download(blob, name);
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
  box.addEventListener('click', () => {
    box.classList.add('closing');
    setTimeout(() => box.remove(), 200);
  });
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
  slogan: 'Sauber · Zuverlässig · Persönlich',
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
  abrechnung: 'monat',
  monatspauschale: 25000,
  zahlungsziel: 14,
  nrPrefix: 'RE',
  nrStart: 1,
  // Zusatzleistungen mit Richtpreisen (frei änderbar unter Einstellungen → Leistungen & Preise)
  leistungen: [
    { id: 'muell', name: 'Müll rausbringen', preis: 250, einheit: 'Mal', art: 'arbeit' },
    { id: 'tonnen', name: 'Mülltonnen an die Straße & zurück', preis: 300, einheit: 'Tonne', art: 'arbeit' },
    { id: 'fenster', name: 'Fenster putzen', preis: 2500, einheit: 'Std.', art: 'arbeit' },
    { id: 'buegeln', name: 'Bügeln', preis: 2200, einheit: 'Std.', art: 'arbeit' },
    { id: 'waesche', name: 'Wäsche waschen & aufhängen', preis: 600, einheit: 'Maschine', art: 'arbeit' },
    { id: 'betten', name: 'Betten neu beziehen', preis: 500, einheit: 'Bett', art: 'arbeit' },
    { id: 'kuehlschrank', name: 'Kühlschrank reinigen', preis: 2000, einheit: 'pauschal', art: 'arbeit' },
    { id: 'backofen', name: 'Backofen reinigen', preis: 3000, einheit: 'pauschal', art: 'arbeit' },
    { id: 'balkon', name: 'Balkon / Terrasse reinigen', preis: 1500, einheit: 'pauschal', art: 'arbeit' },
    { id: 'pflanzen', name: 'Blumen gießen', preis: 300, einheit: 'Mal', art: 'arbeit' },
    { id: 'einkauf', name: 'Einkaufen', preis: 1000, einheit: 'Mal', art: 'arbeit' },
    { id: 'anfahrt', name: 'Anfahrt', preis: 30, einheit: 'km', art: 'fahrt' },
  ],
};
const UNITS = ['Monat', 'Std.', 'pauschal', 'Mal', 'Stk.', 'Tonne', 'Maschine', 'Bett', 'km'];
const unitPrice = (l) => `${money(l.preis)}${l.einheit === 'pauschal' ? ' pauschal' : `/${l.einheit}`}`;
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

/* ---------- Reinigungsplan ---------- */
const FREQS = [[0, 'jedes Mal'], [14, 'alle 2 Wochen'], [28, 'alle 4 Wochen'], [56, 'alle 2 Monate'], [91, 'alle 3 Monate'], [182, 'alle 6 Monate'], [365, 'einmal im Jahr']];
const freqLabel = (d) => FREQS.find(([v]) => v === Number(d))?.[1] ?? `alle ${d} Tage`;
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
// Typische Aufgaben mit üblicher Häufigkeit (Vorschläge im Plan-Editor)
const TASK_SUGGESTIONS = [
  ['Böden saugen & wischen', 0], ['Bad reinigen', 0], ['Küche reinigen', 0], ['Staub wischen', 0], ['Müll rausbringen', 0],
  ['Betten neu beziehen', 14], ['Kühlschrank auswischen', 28], ['Heizkörper & Fußleisten abwischen', 28],
  ['Bad gründlich (Fugen, Entkalken)', 28], ['Backofen reinigen', 56], ['Fenster putzen', 91], ['Schränke auswischen', 91],
  ['Dunstabzugshaube & Filter', 91], ['Gardinen waschen', 182], ['Lampen & Leuchten reinigen', 182], ['Matratzen absaugen', 182],
];

// Aufgaben eines Kunden als [{ text, alleTage, start }], auch aus dem alten Format (nur Text)
const taskList = (c) => (c?.aufgaben || []).map((t) => (typeof t === 'string' ? { text: t, alleTage: 0 } : t));
const planStep = (c) => (c.intervallTage > 0 ? c.intervallTage : 14);

function snapWeekday(datum, wochentag) {
  if (wochentag === '' || wochentag == null) return datum;
  return addDays(datum, (Number(wochentag) - parseISO(datum).getDay() + 7) % 7);
}

// Termine im Rhythmus des Kunden, jeweils auf den Wunsch-Wochentag geschoben
function planDates(c, from, count) {
  const dates = [];
  let d = snapWeekday(from, c.wochentag);
  for (let i = 0; i < count; i++) {
    dates.push(d);
    d = snapWeekday(addDays(d, planStep(c)), c.wochentag);
  }
  return dates;
}

// Nächster Termin laut Rhythmus: letzter Einsatz + Intervall, frühestens heute
function nextPlanStart(c, visits) {
  const last = lastVisit(visits, c.id);
  const base = last ? addDays(last.datum, planStep(c)) : today();
  return base < today() ? today() : base;
}

function rhythmLabel(c) {
  if (!(c.intervallTage > 0)) return 'kein fester Rhythmus';
  const every = { 7: 'jede Woche', 14: 'alle 2 Wochen', 21: 'alle 3 Wochen', 28: 'alle 4 Wochen' }[c.intervallTage] || `alle ${c.intervallTage} Tage`;
  const day = c.wochentag !== '' && c.wochentag != null ? ` · ${WEEKDAYS[c.wochentag].slice(0, 2)}.` : '';
  return every + day + (c.uhrzeit ? ` · ${c.uhrzeit} Uhr` : '');
}

function lastDone(c, visits) {
  const last = {};
  for (const v of visits) {
    if (v.kundeId !== c.id) continue;
    for (const t of v.aufgaben || []) if (t.erledigt && !(last[t.text] >= v.datum)) last[t.text] = v.datum;
  }
  return last;
}

// Für jeden Termin die fälligen Aufgaben bestimmen. Eine Aufgabe ist fällig, wenn seit dem
// letzten Erledigen ihr Abstand (mit halbem Termin-Intervall Spielraum) vergangen ist.
function buildPlan(c, visits, dates) {
  const tol = Math.floor(planStep(c) / 2);
  const last = lastDone(c, visits);
  const tasks = taskList(c);
  for (const t of tasks) if (t.alleTage > 0 && !last[t.text] && t.start) last[t.text] = addDays(t.start, -t.alleTage);
  return dates.map((datum) => {
    const due = tasks.filter((t) => !(t.alleTage > 0) || !last[t.text] || daysBetween(last[t.text], datum) >= t.alleTage - tol);
    due.forEach((t) => { last[t.text] = datum; });
    return { datum, aufgaben: due };
  });
}
const dueTasks = (c, visits, datum) => (c ? buildPlan(c, visits, [datum])[0].aufgaben.map((t) => t.text) : []);

// Große Aufgaben, die noch nie erledigt wurden, gleichmäßig auf die ersten Termine verteilen
function assignStarts(c, visits, oldTasks) {
  const last = lastDone(c, visits);
  const dates = planDates(c, nextPlanStart(c, visits), 30);
  let k = 0;
  for (const t of c.aufgaben) {
    if (!(t.alleTage > 0) || last[t.text]) continue;
    const old = oldTasks.find((o) => o.text === t.text);
    if (old?.start && Number(old.alleTage) === Number(t.alleTage)) { t.start = old.start; continue; }
    t.start = dates[k++ % Math.max(1, Math.round(t.alleTage / planStep(c)))];
  }
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
    const datum = snapWeekday(addDays(last.datum, c.intervallTage), c.wochentag);
    items.push({ type: 'faellig', datum, uhrzeit: c.uhrzeit, kundeId: c.id, aufgaben: dueTasks(c, visits, datum) });
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

let navDirection = 'forward';
const TABS = [
  { name: 'start', hash: '#/', label: 'Start', icon: '🏠' },
  { name: 'kunden', hash: '#/kunden', label: 'Kunden', icon: '👥' },
  { name: 'termine', hash: '#/termine', label: 'Termine', icon: '📅' },
  { name: 'einsaetze', hash: '#/einsaetze', label: 'Einsätze', icon: '🧽' },
  { name: 'rechnungen', hash: '#/rechnungen', label: 'Rechnungen', icon: '🧾' },
];
let currentTab = -1; // Index des Tabs, wenn eine Hauptseite angezeigt wird, sonst -1
const vibrate = (ms = 10) => navigator.vibrate?.(ms);
const ANIMATED = '.card, .stat, .section, .quick, .seg, .empty, .form > label, .form > .grid2, .form > .grid3, .form > .tasks, .form > .btn, .doc-wrap';

function render(title, html, { tab = '', back = true } = {}) {
  const view = $('#view');
  const titleEl = $('#title');
  if (titleEl.textContent !== title) {
    titleEl.textContent = title;
    titleEl.classList.remove('swap');
    void titleEl.offsetWidth;
    titleEl.classList.add('swap');
  }
  $('#backBtn').hidden = !back;
  $('#brandLogo').hidden = back;
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  currentTab = back ? -1 : TABS.findIndex((t) => t.name === tab);
  moveTabIndicator(TABS.findIndex((t) => t.name === tab));
  view.innerHTML = html;
  view.style.transform = view.style.opacity = view.style.transition = '';
  view.classList.remove('enter-forward', 'enter-back', 'enter-tab', 'enter-next', 'enter-prev');
  void view.offsetWidth; // Animation neu starten
  view.classList.add(`enter-${navDirection}`);
  navDirection = 'forward';
  $$(ANIMATED, view).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
  $$('[data-count]', view).forEach(countUp);
}

// Zahlen von 0 hochzählen lassen
function countUp(el) {
  const target = Number(el.dataset.count);
  const fmt = (n) => ('money' in el.dataset ? money(Math.round(n)) : String(Math.round(n)));
  if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / 700);
    el.textContent = fmt(target * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  el.textContent = fmt(0);
  requestAnimationFrame(step);
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
  const pm = prevMonth();
  const monatFaellig = data.customers.filter((c) => c.aktiv !== false && isMonthly(c)
    && data.visits.some((v) => v.kundeId === c.id && v.datum.startsWith(pm))
    && !data.invoices.some((i) => i.kundeId === c.id && i.monat === pm && i.status !== 'storniert'));

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
      <a class="stat" href="#/einsaetze?filter=offen"><b data-count="${unbilled}">${unbilled}</b><span>nicht abgerechnet</span></a>
      <a class="stat" href="#/rechnungen?filter=offen"><b data-count="${offenSumme}" data-money>${money(offenSumme)}</b><span>${offen.length} offene Rechnung${offen.length === 1 ? '' : 'en'}</span></a>
    </div>
    ${monatFaellig.length ? `<h3 class="section">🧾 Monatsrechnung ${esc(monthLabel(pm))}</h3>
      ${monatFaellig.map((c) => `<div class="card plan">
        <div class="row between"><a class="strong" href="#/kunde/${c.id}">${esc(c.name)}</a><span class="badge">${money(c.monatspauschale || 0)}</span></div>
        <div class="row gap mt"><a class="btn small" href="#/rechnung/neu?kunde=${c.id}&monat=${pm}">Rechnung erstellen</a></div>
      </div>`).join('')}` : ''}
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

// Aufgaben mit Häufigkeit bearbeiten, dazu Vorschläge zum Antippen
function planTaskEditor(el, suggestEl, tasks) {
  const freqSelect = (val, attrs) => `<select ${attrs}>${FREQS.map(([v, l]) => `<option value="${v}" ${Number(val) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const draw = (fresh = -1) => {
    el.innerHTML = tasks.map((t, i) => `<li class="task ${i === fresh ? 'new' : ''} ${t.alleTage > 0 ? 'periodic' : ''}">
      <input class="t-text" data-i="${i}" value="${esc(t.text)}" aria-label="Aufgabe">
      ${freqSelect(t.alleTage, `class="t-freq" data-i="${i}" aria-label="Wie oft"`)}
      <button type="button" class="icon-btn" data-del="${i}" aria-label="Entfernen">✕</button></li>`).join('')
      + `<li class="task add"><input class="t-new" placeholder="Neue Aufgabe…" enterkeyhint="done">${freqSelect(0, 'class="t-newfreq" aria-label="Wie oft"')}<button type="button" class="btn small" data-add>+</button></li>`;
    const free = TASK_SUGGESTIONS.filter(([text]) => !tasks.some((t) => t.text === text));
    suggestEl.innerHTML = free.length ? `<div class="muted small">Vorschläge antippen:</div>${free.map(([text, d]) => `<button type="button" class="chip" data-s="${TASK_SUGGESTIONS.findIndex(([x]) => x === text)}">+ ${esc(text)} <span>${freqLabel(d)}</span></button>`).join('')}` : '';
  };
  const add = () => {
    const text = $('.t-new', el).value.trim();
    if (!text) return;
    tasks.push({ text, alleTage: Number($('.t-newfreq', el).value) });
    draw(tasks.length - 1);
    $('.t-new', el).focus();
  };
  el.addEventListener('input', (e) => { if (e.target.classList.contains('t-text')) tasks[e.target.dataset.i].text = e.target.value; });
  el.addEventListener('change', (e) => {
    if (!e.target.classList.contains('t-freq')) return;
    tasks[e.target.dataset.i].alleTage = Number(e.target.value);
    e.target.closest('.task').classList.toggle('periodic', Number(e.target.value) > 0);
  });
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (d) {
      d.closest('.task').classList.add('leaving');
      setTimeout(() => { tasks.splice(Number(d.dataset.del), 1); draw(); }, 200);
    }
    if (e.target.closest('[data-add]')) add();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('t-new')) { e.preventDefault(); add(); } });
  suggestEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-s]');
    if (!chip) return;
    const [text, alleTage] = TASK_SUGGESTIONS[chip.dataset.s];
    tasks.push({ text, alleTage });
    draw(tasks.length - 1);
  });
  draw();
}

function customerForm(c) {
  const isNew = !c;
  c = c || { name: '', strasse: '', plzOrt: '', telefon: '', email: '', privat: true, aktiv: true, intervallTage: 14, wochentag: '', uhrzeit: '', abrechnung: S.abrechnung, monatspauschale: S.monatspauschale, stundensatz: S.stundensatz, aufgaben: TASK_SUGGESTIONS.slice(0, 4).map(([text, alleTage]) => ({ text, alleTage })), notizen: '' };
  const oldTasks = taskList(c);
  const tasks = oldTasks.map((t) => ({ ...t }));
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
        <label>Abrechnung
          <select name="abrechnung">
            <option value="monat" ${isMonthly(c) ? 'selected' : ''}>Monatspauschale</option>
            <option value="stunde" ${isMonthly(c) ? '' : 'selected'}>Nach Stunden</option>
          </select>
        </label>
        <label id="pauschaleField" ${isMonthly(c) ? '' : 'hidden'}>Monatspauschale (€)<input name="monatspauschale" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(c.monatspauschale)}"></label>
      </div>
      <label>Stundensatz (€) <span class="muted small">(für Stunden- und Extra-Arbeiten)</span><input name="stundensatz" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(c.stundensatz)}"></label>

      <h3 class="section">🗓️ Reinigungsplan</h3>
      <div class="grid3">
        <label>Wie oft?
          <select name="intervallTage">
            ${[[0, 'kein fester Rhythmus'], [7, 'jede Woche'], [14, 'alle 2 Wochen'], [21, 'alle 3 Wochen'], [28, 'alle 4 Wochen']]
              .map(([v, l]) => `<option value="${v}" ${Number(c.intervallTage) === v ? 'selected' : ''}>${l}</option>`).join('')}
            ${[0, 7, 14, 21, 28].includes(Number(c.intervallTage)) ? '' : `<option value="${c.intervallTage}" selected>alle ${c.intervallTage} Tage</option>`}
          </select>
        </label>
        <label>Wochentag
          <select name="wochentag">
            <option value="">egal</option>
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${String(c.wochentag) === String(d) ? 'selected' : ''}>${WEEKDAYS[d]}</option>`).join('')}
          </select>
        </label>
        <label>Uhrzeit<input type="time" name="uhrzeit" value="${esc(c.uhrzeit || '')}"></label>
      </div>
      <div class="label">Aufgaben & wie oft</div>
      <ul class="tasks plan-tasks" id="planTasks"></ul>
      <div class="chips" id="suggest"></div>
      <label>Notizen <span class="muted small">(Schlüssel, Zugang, Besonderheiten…)</span>
        <textarea name="notizen" rows="3">${esc(c.notizen)}</textarea>
      </label>
      <label class="check"><input type="checkbox" name="aktiv" ${c.aktiv !== false ? 'checked' : ''}> Aktiver Kunde</label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Kunde löschen</button>'}
    </form>
  `);
  $('#f [name=abrechnung]').addEventListener('change', (e) => { $('#pauschaleField').hidden = e.target.value !== 'monat'; });
  planTaskEditor($('#planTasks'), $('#suggest'), tasks);
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
      wochentag: fd.get('wochentag'),
      uhrzeit: fd.get('uhrzeit'),
      abrechnung: fd.get('abrechnung'),
      monatspauschale: Math.round(num(fd.get('monatspauschale')) * 100),
      stundensatz: Math.round(num(fd.get('stundensatz')) * 100),
      aufgaben: tasks.filter((t) => t.text.trim()).map((t) => ({ text: t.text.trim(), alleTage: Number(t.alleTage) || 0 })),
      notizen: fd.get('notizen').trim(),
    });
    assignStarts(c, isNew ? [] : await DB.by('visits', 'kundeId', c.id), oldTasks);
    await DB.put('customers', c);
    toast('✓ Kunde gespeichert');
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
  const tl = taskList(c);
  const regular = tl.filter((t) => !(t.alleTage > 0)).map((t) => t.text);
  const periodic = tl.filter((t) => t.alleTage > 0);

  render(c.name, `
    <div class="card">
      ${addr ? `<div>📍 <a href="https://maps.google.com/?q=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${esc(addr)}</a></div>` : ''}
      ${c.telefon ? `<div>📞 <a href="tel:${esc(c.telefon.replace(/\s/g, ''))}">${esc(c.telefon)}</a></div>` : ''}
      ${c.email ? `<div>✉️ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
      <div class="muted small mt">${c.privat ? 'Privatkunde' : 'Geschäftskunde'} · ${esc(rhythmLabel(c))} · ${priceLabel(c)}</div>
      ${regular.length ? `<div class="small mt"><b>Jedes Mal:</b> ${esc(regular.join(' · '))}</div>` : ''}
      ${periodic.length ? `<div class="small mt">${periodic.map((t) => `<span class="chip static">✨ ${esc(t.text)} <span>${freqLabel(t.alleTage)}</span></span>`).join('')}</div>` : ''}
      ${c.notizen ? `<div class="small mt">📝 ${nl2br(c.notizen)}</div>` : ''}
      <a class="btn small ghost mt" href="#/kunde/${id}/bearbeiten">Bearbeiten</a>
    </div>
    <div class="quick">
      <a class="btn" href="#/einsatz/neu?kunde=${id}">🧽 Einsatz</a>
      <a class="btn ghost" href="#/termin/neu?kunde=${id}">📅 Termin</a>
      <a class="btn ghost" href="#/rechnung/neu?kunde=${id}">🧾 Rechnung</a>
      <a class="btn ghost" href="#/kunde/${id}/plan">🗓️ Reinigungsplan</a>
    </div>
    <h3 class="section">Anstehend</h3>
    ${plan.map((p) => planCard(p, data.kmap)).join('') || '<div class="empty small">Nichts geplant.</div>'}
    <h3 class="section">Einsätze (${visits.length})</h3>
    ${visits.map((v) => visitCard(v, data.kmap, false)).join('') || '<div class="empty small">Noch keine Einsätze.</div>'}
    <h3 class="section">Rechnungen (${invoices.length})</h3>
    ${invoices.map((i) => invoiceCard(i)).join('') || '<div class="empty small">Noch keine Rechnungen.</div>'}
  `);
});

route('/kunde/:id/plan', async ({ id }, q) => {
  const [c, visits, appts] = await Promise.all([DB.get('customers', id), DB.all('visits'), DB.by('appointments', 'kundeId', id)]);
  if (!c) return go('#/kunden', true);
  const monate = Number(q.monate) || 3;
  if (!(c.intervallTage > 0)) {
    return render('Reinigungsplan', `<div class="card hint"><p><b>Für ${esc(c.name)} ist noch kein Rhythmus festgelegt.</b></p>
      <p class="small">Lege beim Kunden fest, wie oft (z. B. alle 2 Wochen), an welchem Wochentag und welche Aufgaben wie oft anfallen – dann erstelle ich daraus den Plan.</p>
      <a class="btn" href="#/kunde/${id}/bearbeiten">Plan einrichten</a></div>`);
  }
  const start = nextPlanStart(c, visits);
  const end = addDays(start, Math.round(monate * 30.4));
  const dates = planDates(c, start, 200).filter((d) => d <= end);
  const entries = buildPlan(c, visits, dates);
  const manual = appts.filter((a) => !a.erledigt && !a.ausPlan);
  const counts = {};
  entries.forEach((e) => e.aufgaben.forEach((t) => { if (t.alleTage > 0) counts[t.text] = (counts[t.text] || 0) + 1; }));

  render('Reinigungsplan', `
    <div class="card">
      <div class="row between"><b>${esc(c.name)}</b><a class="small" href="#/kunde/${id}/bearbeiten">Plan ändern</a></div>
      <div class="muted small">${esc(rhythmLabel(c))} · ${dates.length} Termine bis ${fmtDate(end)}</div>
      ${Object.keys(counts).length ? `<div class="small mt">${Object.entries(counts).map(([t, n]) => `<span class="chip static">✨ ${esc(t)} <span>${n}×</span></span>`).join('')}</div>` : ''}
    </div>
    <div class="seg">${[1, 3, 6, 12].map((m) => `<a href="#/kunde/${id}/plan?monate=${m}" class="${m === monate ? 'active' : ''}">${m} ${m === 1 ? 'Monat' : 'Monate'}</a>`).join('')}</div>
    <div class="timeline mt">
      ${entries.map((e) => {
        const reg = e.aufgaben.filter((t) => !(t.alleTage > 0));
        const per = e.aufgaben.filter((t) => t.alleTage > 0);
        const clash = manual.find((a) => Math.abs(daysBetween(a.datum, e.datum)) < 3);
        return `<div class="card plan-entry ${per.length ? 'big' : ''}">
          <div class="row between"><b>${fmtDateLong(e.datum)}</b>${c.uhrzeit ? `<span class="badge">${esc(c.uhrzeit)} Uhr</span>` : ''}</div>
          ${reg.length ? `<div class="muted small">${esc(reg.map((t) => t.text).join(' · '))}</div>` : ''}
          ${per.length ? `<div class="mt">${per.map((t) => `<span class="chip static hot">✨ ${esc(t.text)}</span>`).join('')}</div>` : ''}
          ${clash ? `<div class="small muted mt">ℹ️ Eigener Termin am ${fmtDate(clash.datum)} vorhanden – wird nicht doppelt eingetragen.</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <button class="btn block" id="create">📅 Plan als Termine eintragen</button>
    <button class="btn ghost block" id="share">💬 Plan an Kunden schicken</button>
    <p class="muted small">Bereits aus dem Plan eingetragene Termine werden beim erneuten Eintragen ersetzt. Selbst angelegte Termine bleiben unverändert.</p>
  `);

  $('#create').addEventListener('click', async () => {
    if (!confirm(`${entries.length} Termine bis ${fmtDate(end)} für ${c.name} eintragen?`)) return;
    for (const a of appts) if (a.ausPlan && !a.erledigt) await DB.del('appointments', a.id);
    let n = 0;
    for (const e of entries) {
      if (manual.some((a) => Math.abs(daysBetween(a.datum, e.datum)) < 3)) continue;
      await DB.put('appointments', { kundeId: id, datum: e.datum, uhrzeit: c.uhrzeit || '', aufgaben: e.aufgaben.map((t) => t.text), notiz: '', erledigt: false, ausPlan: true });
      n++;
    }
    vibrate(15);
    toast(`✓ ${n} Termine eingetragen`);
    navDirection = 'tab';
    go('#/termine');
  });
  $('#share').addEventListener('click', () => {
    const text = [`Reinigungsplan ${S.firma}`, `für ${c.name}`, '', ...entries.map((e) => {
      const per = e.aufgaben.filter((t) => t.alleTage > 0).map((t) => t.text);
      return `• ${fmtDateLong(e.datum)}${c.uhrzeit ? `, ${c.uhrzeit} Uhr` : ''}${per.length ? ` – zusätzlich: ${per.join(', ')}` : ''}`;
    }), '', `Viele Grüße${S.inhaber ? `\n${S.inhaber}` : ''}`].join('\n');
    shareText(text, 'Reinigungsplan');
  });
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
  const visits = await DB.all('visits');
  if (!a) {
    const k = kmap[q.kunde];
    const datum = q.datum || (k ? snapWeekday(nextPlanStart(k, visits), k.wochentag) : addDays(today(), 1));
    a = { kundeId: q.kunde || '', datum, uhrzeit: k?.uhrzeit || '', aufgaben: dueTasks(k, visits, datum), notiz: '', erledigt: false };
  }
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
    const k = kmap[e.target.value];
    if (k?.uhrzeit && !$('#f [name=uhrzeit]').value) $('#f [name=uhrzeit]').value = k.uhrzeit;
    editor.set(dueTasks(k, visits, $('#f [name=datum]').value || today()).map((text) => ({ text })));
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
    toast('✓ Termin gespeichert');
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
  saveFile(new Blob([ics], { type: 'text/calendar' }), `termin-${a.datum}.ics`);
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
  const draw = (fresh = -1) => {
    el.innerHTML = tasks.map((t, i) => `<li class="task ${i === fresh ? 'new' : ''}">
      <label>${withCheck ? `<input type="checkbox" data-i="${i}" ${t.erledigt ? 'checked' : ''}>` : '•'} <span>${esc(t.text)}</span></label>
      <button type="button" class="icon-btn" data-del="${i}" aria-label="Entfernen">✕</button></li>`).join('')
      + `<li class="task add"><input type="text" class="task-new" placeholder="Aufgabe hinzufügen…" enterkeyhint="done"><button type="button" class="btn small" data-add>+</button></li>`;
  };
  const add = () => {
    const v = $('.task-new', el).value.trim();
    if (!v) return;
    tasks.push({ text: v, erledigt: true });
    draw(tasks.length - 1);
    $('.task-new', el).focus();
  };
  el.addEventListener('change', (e) => { if (e.target.dataset.i !== undefined) tasks[e.target.dataset.i].erledigt = e.target.checked; });
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (d) {
      d.closest('.task').classList.add('leaving');
      setTimeout(() => { tasks.splice(Number(d.dataset.del), 1); draw(); }, 200);
    }
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
    ${v.extras?.length ? `<div class="small">➕ ${esc(v.extras.map((x) => (x.menge > 1 ? `${fmtNum(x.menge)}× ` : '') + x.name).join(' · '))}</div>` : ''}
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
  const allVisits = await DB.all('visits');
  if (isNew) {
    const kundeId = q.kunde || termin?.kundeId || '';
    const vorlage = termin?.aufgaben || dueTasks(kmap[kundeId], allVisits, today());
    v = { id: DB.uid(), kundeId, datum: today(), von: termin?.uhrzeit || '', bis: '', stunden: '', aufgaben: vorlage.map((text) => ({ text, erledigt: true })), notiz: '', rechnungId: null };
  }
  const tasks = v.aufgaben.map((t) => ({ ...t }));
  const extras = (v.extras || []).map((x) => ({ ...x }));
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
      <div class="label">Zusatzleistungen <span class="muted small">(werden extra berechnet)</span></div>
      <ul class="tasks extras" id="extras"></ul>
      <div class="label">Fotos</div>
      <div id="photos"></div>
      <label>Notiz<textarea name="notiz" rows="3" placeholder="z. B. Besonderheiten, Schäden, Material verbraucht…">${esc(v.notiz)}</textarea></label>
      ${v.rechnungId ? '<p class="muted small">Dieser Einsatz ist bereits abgerechnet.</p>' : ''}
      <button class="btn block" type="submit" id="save">Speichern</button>
    </form>
  `);

  const editor = taskEditor($('#tasks'), tasks, true);
  extrasEditor($('#extras'), extras);
  photoEditor($('#photos'), existing, pending);

  const f = $('#f');
  f.kundeId.addEventListener('change', (e) => {
    if (!termin) editor.set(dueTasks(kmap[e.target.value], allVisits, f.datum.value || today()).map((text) => ({ text, erledigt: true })));
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
      extras: extras.filter((x) => num(x.menge) > 0).map((x) => ({ ...x, menge: num(x.menge) })),
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
      const nextDate = snapWeekday(addDays(v.datum, k.intervallTage), k.wochentag);
      if (!openAppts.length && confirm(`Nächste Reinigung bei ${k.name} am ${fmtDateLong(nextDate)} als Termin eintragen?`)) {
        await DB.put('appointments', { kundeId: k.id, datum: nextDate, uhrzeit: k.uhrzeit || v.von || '', aufgaben: dueTasks(k, await DB.all('visits'), nextDate), notiz: '', erledigt: false });
      }
    }
    toast('✓ Einsatz gespeichert');
    go(`#/einsatz/${v.id}`, true);
  });
}

// Zusatzleistungen aus dem Katalog abhaken, Menge angeben
function extrasEditor(el, extras) {
  const catalog = [...S.leistungen];
  for (const x of extras) if (!catalog.some((l) => l.name === x.name)) catalog.push(x);
  const draw = () => {
    el.innerHTML = catalog.map((l, i) => {
      const x = extras.find((e) => e.name === l.name);
      return `<li class="task ${x ? 'on' : ''}">
        <label><input type="checkbox" data-x="${i}" ${x ? 'checked' : ''}>
          <span>${esc(l.name)}<br><span class="muted small">${unitPrice(x || l)}</span></span></label>
        ${x ? `<input type="number" class="qty" data-q="${i}" min="0" step="0.5" inputmode="decimal" value="${esc(x.menge)}" aria-label="Menge">` : ''}
      </li>`;
    }).join('') || '<li class="task muted small">Keine Zusatzleistungen im Katalog.</li>';
  };
  el.addEventListener('change', (e) => {
    const i = e.target.dataset.x;
    if (i === undefined) return;
    const l = catalog[i];
    if (e.target.checked) extras.push({ name: l.name, preis: l.preis, einheit: l.einheit, art: l.art || 'arbeit', menge: 1 });
    else extras.splice(extras.findIndex((x) => x.name === l.name), 1);
    draw();
  });
  el.addEventListener('input', (e) => {
    const i = e.target.dataset.q;
    if (i === undefined) return;
    extras.find((x) => x.name === catalog[i].name).menge = e.target.value;
  });
  draw();
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
        <label class="thumb add">📷<span>Kamera</span><input type="file" accept="image/*" capture="environment" data-typ="${typ}" hidden></label>
        <label class="thumb add">🖼️<span>Galerie</span><input type="file" accept="image/*" multiple data-typ="${typ}" hidden></label>
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
      ${v.extras?.length ? `<div class="small muted mt">Zusatzleistungen</div><ul class="done-list">${v.extras.map((x) => `<li class="ok">➕ ${esc(x.name)} · ${fmtNum(x.menge)} ${esc(x.einheit)} à ${money(x.preis)}</li>`).join('')}</ul>` : ''}
      ${v.notiz ? `<div class="mt">📝 ${nl2br(v.notiz)}</div>` : ''}
      ${gallery('vorher', 'Vorher')}${gallery('nachher', 'Nachher')}
    </div>
    <div class="quick">
      <a class="btn ghost" href="#/einsatz/${id}/bearbeiten">Bearbeiten</a>
      ${photos.length && (NATIVE || navigator.canShare) ? '<button class="btn ghost" id="share">Fotos teilen</button>' : ''}
      ${v.rechnungId ? '' : `<a class="btn ghost" href="#/rechnung/neu?kunde=${v.kundeId}">🧾 Abrechnen</a>`}
    </div>
    ${v.rechnungId ? '' : '<button class="btn danger ghost block" id="del">Einsatz löschen</button>'}
  `);
  $('#view').addEventListener('click', (e) => { const img = e.target.closest('[data-view]'); if (img) lightbox(img.src); });
  $('#share')?.addEventListener('click', async () => {
    const files = photos.map((p, i) => ({ blob: p.blob, name: `${v.datum}_${p.typ}_${i + 1}.jpg` }));
    if (!(await shareFiles(files, `Reinigung ${fmtDate(v.datum)}`))) toast('Teilen wird auf diesem Gerät nicht unterstützt');
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

// Gleiche Zusatzleistungen mehrerer Einsätze zu einer Rechnungsposition zusammenfassen
function extraPositions(visits) {
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
      beschreibung: x.name + (many ? ` (am ${dates.map((d) => fmtDate(d).slice(0, 6)).join(', ')})` : ''),
      datum: dates[0],
      ...(many ? { datumBis: dates[dates.length - 1] } : {}),
      menge: x.menge,
      einheit: x.einheit,
      preis: x.preis,
      art: x.art || 'arbeit',
    };
  });
}

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
  const selected = new Set();
  const draft = { kundeId: q.kunde || '', datum: today(), zahlungsziel: S.zahlungsziel };
  // Bis zum 15. wird standardmäßig der Vormonat abgerechnet, danach der laufende Monat
  const defaultMonth = q.monat || (new Date().getDate() <= 15 ? prevMonth() : today().slice(0, 7));

  render('Rechnung erstellen', `
    <form id="f" class="form">
      ${customerSelect(customers, draft.kundeId)}
      <label id="monthField" hidden>Abrechnungsmonat<input type="month" name="monat" value="${defaultMonth}"></label>
      <div class="grid2">
        <label>Rechnungsdatum<input type="date" name="datum" required value="${draft.datum}"></label>
        <label>Zahlungsziel (Tage)<input type="number" name="zahlungsziel" min="0" value="${draft.zahlungsziel}"></label>
      </div>
      <div id="visits"></div>
      <div class="label">Positionen</div>
      <div id="positions"></div>
      <datalist id="units">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>
      <div class="row gap">
        <select id="addExtra" class="add-extra">
          <option value="">➕ Zusatzleistung hinzufügen…</option>
          ${S.leistungen.map((l, i) => `<option value="${i}">${esc(l.name)} – ${unitPrice(l)}</option>`).join('')}
        </select>
        <button type="button" class="btn ghost small" id="addPos">+ Freie Position</button>
      </div>
      <div class="total" id="total"></div>
      <label>Zusätzlicher Text (optional)<textarea name="notiz" rows="2" placeholder="z. B. Vielen Dank für Ihren Auftrag!"></textarea></label>
      <p class="muted small">Die Rechnungsnummer wird beim Erstellen automatisch fortlaufend vergeben. Der Hinweis nach § 19 UStG (Kleinunternehmer) wird automatisch eingefügt.</p>
      <button class="btn block" type="submit" id="save">Rechnung erstellen</button>
    </form>
  `);

  const f = $('#f');
  const kunde = () => data.kmap[f.kundeId.value];
  const openVisits = () => {
    const k = kunde();
    if (!k) return [];
    return data.visits
      .filter((v) => v.kundeId === k.id && !v.rechnungId && (!isMonthly(k) || v.datum.startsWith(f.monat.value)))
      .sort((a, b) => a.datum.localeCompare(b.datum));
  };
  // Positionen, die aus den angehakten Einsätzen entstehen (Pauschale oder je Einsatz nach Stunden)
  const autoPositions = () => {
    const k = kunde();
    if (!k) return [];
    const sel = openVisits().filter((v) => selected.has(v.id));
    if (!isMonthly(k)) return [...sel.map((v) => ({ ...visitToPosition(v, k), auto: true })), ...extraPositions(sel)];
    const m = f.monat.value;
    if (!m) return [];
    const old = positions.find((p) => p.pauschale);
    return [{
      auto: true,
      pauschale: true,
      visitIds: sel.map((v) => v.id),
      beschreibung: `Reinigung – Monatspauschale ${monthLabel(m)}`
        + (sel.length ? `\nEinsätze am ${sel.map((v) => fmtDate(v.datum).slice(0, 6)).join(', ')}` : ''),
      datum: `${m}-01`,
      datumBis: lastOfMonth(m),
      menge: 1,
      einheit: 'Monat',
      preis: old ? old.preis : k.monatspauschale || S.monatspauschale || 0,
      art: 'arbeit',
    }, ...extraPositions(sel)];
  };
  const rebuild = () => {
    positions = [...autoPositions(), ...positions.filter((p) => !p.auto)];
    drawPositions();
  };
  const drawTotal = () => { $('#total').innerHTML = `Gesamt: <b>${money(positions.reduce((s, p) => s + positionTotal(p), 0))}</b>`; };
  const drawPositions = () => {
    $('#positions').innerHTML = positions.map((p, i) => `<div class="pos card" data-i="${i}">
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
    drawTotal();
  };
  const drawVisits = () => {
    const k = kunde();
    const monthly = isMonthly(k);
    $('#monthField').hidden = !monthly;
    const open = openVisits();
    selected.clear();
    open.forEach((v) => selected.add(v.id));
    positions = positions.filter((p) => !p.auto);
    const title = monthly ? `Einsätze im ${monthLabel(f.monat.value)}` : 'Nicht abgerechnete Einsätze';
    $('#visits').innerHTML = open.length
      ? `<div class="label">${esc(title)}</div>${open.map((v) => `<label class="check"><input type="checkbox" data-visit="${v.id}" checked> ${fmtDateLong(v.datum)}${v.stunden ? ` · ${fmtNum(v.stunden)} Std.` : ''}</label>`).join('')}`
      : (k ? `<p class="muted small">${monthly ? `Keine offenen Einsätze im ${esc(monthLabel(f.monat.value))}.` : 'Keine offenen Einsätze für diesen Kunden – du kannst Positionen manuell hinzufügen.'}</p>` : '');
    rebuild();
  };

  f.kundeId.addEventListener('change', drawVisits);
  f.monat.addEventListener('change', drawVisits);
  $('#visits').addEventListener('change', (e) => {
    const id = e.target.dataset.visit;
    if (!id) return;
    if (e.target.checked) selected.add(id);
    else selected.delete(id);
    rebuild();
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
    const box = rm.closest('.pos');
    box.classList.add('leaving');
    setTimeout(() => {
      const [p] = positions.splice(Number(rm.dataset.rm), 1);
      for (const id of p.visitIds || (p.visitId ? [p.visitId] : [])) {
        selected.delete(id);
        const cb = $(`[data-visit="${id}"]`);
        if (cb) cb.checked = false;
      }
      drawPositions();
    }, 200);
  });
  $('#addExtra').addEventListener('change', (e) => {
    const l = S.leistungen[e.target.value];
    e.target.value = '';
    if (!l) return;
    positions.push({ beschreibung: l.name, datum: today(), menge: 1, einheit: l.einheit, preis: l.preis, art: l.art || 'arbeit' });
    drawPositions();
    $('#positions .pos:last-child').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#addPos').addEventListener('click', () => {
    positions.push({ beschreibung: '', datum: today(), menge: 1, einheit: 'pauschal', preis: 0, art: 'arbeit' });
    drawPositions();
    $('#positions .pos:last-child').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const monat = isMonthly(k) && items.some((p) => p.pauschale) ? fd.get('monat') : null;
    if (monat && data.invoices.some((i) => i.kundeId === k.id && i.monat === monat && i.status !== 'storniert')
      && !confirm(`Für ${k.name} gibt es schon eine Rechnung für ${monthLabel(monat)}. Trotzdem noch eine erstellen?`)) return;
    $('#save').disabled = true;
    const datum = fd.get('datum');
    const ziel = Number(fd.get('zahlungsziel')) || 0;
    const positionen = items.map(({ auto, ...p }) => ({ ...p, beschreibung: p.beschreibung.trim(), menge: num(p.menge), betrag: positionTotal(p) }));
    const inv = {
      nummer: await nextInvoiceNumber(datum),
      datum,
      faellig: addDays(datum, ziel),
      monat,
      kundeId: k.id,
      kunde: { name: k.name, strasse: k.strasse, plzOrt: k.plzOrt, privat: !!k.privat },
      absender: Object.fromEntries(['firma', 'slogan', 'inhaber', 'strasse', 'plzOrt', 'telefon', 'email', 'steuernummer', 'bank', 'iban', 'bic'].map((key) => [key, S[key]])),
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
    toast(`✓ Rechnung ${inv.nummer} erstellt`);
    go(`#/rechnung/${inv.id}`, true);
  });

  drawVisits();
});

function invoiceDoc(inv) {
  const a = inv.absender;
  const k = inv.kunde;
  const von = inv.positionen.map((p) => p.datum).sort()[0];
  const bis = inv.positionen.map((p) => p.datumBis || p.datum).sort().pop();
  const zeitraum = von === bis ? fmtDate(von) : `${fmtDate(von)} – ${fmtDate(bis)}`;
  const [first, ...rest] = (a.firma || '').split(' ');
  const slogan = a.slogan ?? S.slogan;
  return `<article class="invoice-doc ${inv.status === 'storniert' ? 'cancelled' : ''}">
    <header class="inv-head">
      <img class="inv-logo" src="icons/icon.svg" alt="">
      <div class="inv-brandbox">
        <div class="inv-brand"><b>${esc(first)}</b> ${esc(rest.join(' '))}</div>
        ${slogan ? `<div class="inv-slogan">${esc(slogan)}</div>` : ''}
      </div>
      <div class="inv-contact">${esc(a.inhaber)}<br>${esc(a.strasse)}<br>${esc(a.plzOrt)}
        ${a.telefon ? `<br>Tel. ${esc(a.telefon)}` : ''}${a.email ? `<br>${esc(a.email)}` : ''}</div>
    </header>
    <div class="inv-accent"></div>
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
    <h2 class="inv-title">${inv.monat ? `Monatsrechnung <span>${esc(monthLabel(inv.monat))}</span>` : 'Rechnung'}${inv.status === 'storniert' ? ' – STORNIERT' : ''}</h2>
    <p>Für die erbrachten Leistungen stelle ich Ihnen folgende Beträge in Rechnung:</p>
    <table class="inv-items">
      <thead><tr><th>Pos.</th><th>Datum</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis</th><th class="r">Betrag</th></tr></thead>
      <tbody>${inv.positionen.map((p, i) => `<tr>
        <td>${i + 1}</td><td class="nowrap">${fmtDate(p.datum)}${p.datumBis && p.datumBis !== p.datum ? `&nbsp;–<br>${fmtDate(p.datumBis)}` : ''}</td><td>${nl2br(p.beschreibung)}</td>
        <td class="r">${fmtNum(p.menge)} ${esc(p.einheit)}</td><td class="r">${money(p.preis)}</td><td class="r">${money(p.betrag)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="4"></td><td class="r inv-total-label">Gesamtbetrag</td><td class="r inv-total">${money(inv.summe)}</td></tr></tfoot>
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
      <p class="muted small">Tipp: Im Druckdialog als Drucker „Als PDF speichern“ wählen und die PDF dann per WhatsApp oder E-Mail an den Kunden senden.</p>
    </div>
    <div class="doc-wrap">${invoiceDoc(inv)}</div>
    ${inv.status !== 'storniert' ? '<button class="btn danger ghost block no-print" id="storno">Rechnung stornieren</button>' : ''}
  `);
  $('#print').addEventListener('click', () => {
    const old = document.title;
    document.title = `Rechnung ${inv.nummer}`;
    if (NATIVE) native('Printer', 'print', { name: `Rechnung ${inv.nummer}` }).catch((e) => toast(e.message));
    else window.print();
    setTimeout(() => { document.title = old; }, 1000);
  });
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
      ${field('slogan', 'Slogan (unter dem Namen auf der Rechnung)')}
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
        <label>Standard-Abrechnung neuer Kunden
          <select name="abrechnung">
            <option value="monat" ${S.abrechnung === 'monat' ? 'selected' : ''}>Monatspauschale</option>
            <option value="stunde" ${S.abrechnung === 'monat' ? '' : 'selected'}>Nach Stunden</option>
          </select>
        </label>
        <label>Standard-Monatspauschale (€)<input name="monatspauschale" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(S.monatspauschale)}"></label>
      </div>
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

    <a class="card link mt" href="#/leistungen"><div class="row between"><b>💶 Leistungen & Preise</b><span class="muted">›</span></div>
      <div class="muted small">${S.leistungen.length} Zusatzleistungen, z. B. Müll rausbringen, Fenster putzen, Bügeln</div></a>

    <h3 class="section">Datensicherung</h3>
    <div class="card">
      <p class="small">Alle Daten und Fotos liegen <b>nur auf diesem Handy</b>. Erstelle regelmäßig eine Sicherung (z. B. in Google Drive / iCloud speichern) – Rechnungen musst du 10 Jahre aufbewahren.</p>
      ${est ? `<p class="muted small">Belegter Speicher: ${(est.usage / 1048576).toFixed(1)} MB${persisted ? ' · dauerhaft gespeichert ✓' : ''}</p>` : ''}
      <div class="quick">
        <button class="btn" id="export">⬇️ Sicherung erstellen</button>
        <label class="btn ghost">⬆️ Wiederherstellen<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
    </div>

    ${NATIVE ? '' : `<h3 class="section">App auf den Startbildschirm</h3>
    <div class="card small">
      <p><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“.</p>
      <p><b>Android (Chrome):</b> Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</p>
    </div>`}
    <p class="muted small center">Toths Reinigungsservice · Version 1.4</p>
  `);

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const key of ['firma', 'slogan', 'inhaber', 'strasse', 'plzOrt', 'telefon', 'email', 'steuernummer', 'bank', 'iban', 'bic', 'nrPrefix']) S[key] = fd.get(key).trim();
    S.iban = S.iban.toUpperCase();
    S.stundensatz = Math.round(num(fd.get('stundensatz')) * 100);
    S.abrechnung = fd.get('abrechnung');
    S.monatspauschale = Math.round(num(fd.get('monatspauschale')) * 100);
    S.zahlungsziel = Number(fd.get('zahlungsziel')) || 0;
    S.nrStart = Math.max(1, Number(fd.get('nrStart')) || 1);
    await DB.put('settings', S);
    toast('✓ Einstellungen gespeichert');
  });
  $('#export').addEventListener('click', exportBackup);
  $('#import').addEventListener('change', (e) => e.target.files[0] && importBackup(e.target.files[0]));
});

route('/leistungen', () => {
  const list = S.leistungen.map((l) => ({ ...l }));
  const draw = () => {
    $('#items').innerHTML = list.map((l, i) => `<div class="card pos" data-i="${i}">
      <div class="row between"><input data-k="name" value="${esc(l.name)}" placeholder="Bezeichnung" aria-label="Bezeichnung">
        <button type="button" class="icon-btn" data-rm="${i}" aria-label="Leistung entfernen">✕</button></div>
      <div class="grid3">
        <label>Preis (€)<input type="number" step="0.01" min="0" inputmode="decimal" data-k="preis" value="${centsInput(l.preis)}"></label>
        <label>pro<input data-k="einheit" list="units" value="${esc(l.einheit)}"></label>
        <label>Art<select data-k="art">
          ${[['arbeit', 'Arbeit'], ['fahrt', 'Fahrt'], ['material', 'Material']].map(([v, t]) => `<option value="${v}" ${l.art === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
      </div>
    </div>`).join('') || '<div class="empty small">Noch keine Leistungen.</div>';
  };
  render('Leistungen & Preise', `
    <p class="muted small">Diese Zusatzleistungen kannst du beim Einsatz abhaken. Sie werden dann automatisch zusätzlich zur Pauschale bzw. zu den Stunden berechnet.</p>
    <datalist id="units">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>
    <div id="items" class="form"></div>
    <button type="button" class="btn ghost block" id="add">+ Leistung hinzufügen</button>
    <button type="button" class="btn block" id="save">Speichern</button>
    <details class="mt"><summary>💡 Woher kommen die Vorschlagspreise?</summary>
      <div class="card small mt">Richtwerte für ein Kleingewerbe ohne Umsatzsteuer, zwischen privater Putzhilfe (ca. 15–20 €/Std.) und Reinigungsfirma (ca. 23–35 €/Std.).
      Müll rausbringen ca. 2–3 € pro Mal, Mülltonnen-Service ca. 2–4 € pro Tonne und Leerung. Passe die Preise an deine Region und deine Kunden an.</div>
    </details>
  `);
  draw();
  $('#items').addEventListener('input', (e) => {
    const key = e.target.dataset.k;
    if (!key) return;
    const l = list[e.target.closest('[data-i]').dataset.i];
    l[key] = key === 'preis' ? Math.round(num(e.target.value) * 100) : e.target.value;
  });
  $('#items').addEventListener('change', (e) => { if (e.target.dataset.k === 'art') list[e.target.closest('[data-i]').dataset.i].art = e.target.value; });
  $('#items').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    rm.closest('.pos').classList.add('leaving');
    setTimeout(() => { list.splice(Number(rm.dataset.rm), 1); draw(); }, 200);
  });
  $('#add').addEventListener('click', () => {
    list.push({ id: DB.uid(), name: '', preis: 0, einheit: 'pauschal', art: 'arbeit' });
    draw();
    $('#items .pos:last-child input').focus();
  });
  $('#save').addEventListener('click', async () => {
    S.leistungen = list.filter((l) => l.name.trim()).map((l) => ({ ...l, name: l.name.trim(), einheit: l.einheit.trim() || 'pauschal' }));
    await DB.put('settings', S);
    toast('✓ Leistungen gespeichert');
    history.back();
  });
});

async function exportBackup() {
  toast('Sicherung wird erstellt…');
  const data = { app: 'toths-reinigung', version: 1, exportiert: new Date().toISOString() };
  for (const s of DB.stores) data[s] = await DB.all(s);
  data.photos = await Promise.all(data.photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
  const name = `toths-sicherung-${today()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  await saveFile(blob, name);
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
$('#backBtn').addEventListener('click', () => {
  navDirection = 'back';
  if (history.length > 1) history.back();
  else go('#/');
});
$('#tabbar').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const i = TABS.findIndex((t) => t.name === a.dataset.tab);
  const from = TABS.findIndex((t) => t.name === $('#tabbar a.active')?.dataset.tab);
  navDirection = from < 0 || i === from ? 'tab' : i > from ? 'next' : 'prev';
});

/* ---------- Tab-Markierung & Wischgesten ---------- */
const tabIndicator = document.createElement('div');
tabIndicator.className = 'tab-indicator';
$('#tabbar').appendChild(tabIndicator);

function moveTabIndicator(index, offset = 0) {
  tabIndicator.style.opacity = index < 0 ? 0 : 1;
  if (index >= 0) tabIndicator.style.transform = `translateX(${(index + offset) * 100}%)`;
}

// Hinweise am Rand: zeigen beim Wischen, welcher Tab links/rechts kommt
const swipeHints = ['left', 'right'].map((side) => {
  const el = document.createElement('div');
  el.className = `swipe-hint ${side}`;
  document.body.appendChild(el);
  return el;
});

(function setupSwipe() {
  const view = $('#view');
  const THRESHOLD = 90;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let decided = false;
  let target = null;
  let ready = false;

  const targetFor = (dir) => {
    if (currentTab >= 0) {
      const t = TABS[currentTab + (dir < 0 ? 1 : -1)];
      return t ? { ...t, dir: dir < 0 ? 'next' : 'prev' } : null;
    }
    return dir > 0 ? { label: 'Zurück', icon: '‹', dir: 'back', back: true } : null;
  };
  const resetHints = () => swipeHints.forEach((h) => { h.classList.remove('show', 'ready'); h.style.transform = ''; });

  view.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || $('.lightbox')) return;
    if (e.target.closest('input, textarea, select, .doc-wrap, .thumbs')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    decided = false;
    dx = 0;
  }, { passive: true });

  view.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const x = e.touches[0].clientX - startX;
    const y = e.touches[0].clientY - startY;
    if (!decided) {
      if (Math.abs(x) < 12 && Math.abs(y) < 12) return;
      decided = true;
      if (Math.abs(x) < Math.abs(y) * 1.4) { tracking = false; return; }
      target = targetFor(x);
    }
    if (Math.sign(x) !== Math.sign(dx || x)) target = targetFor(x);
    dx = target ? x : x / 4; // ohne Ziel nur mit Widerstand bewegen
    const progress = Math.min(Math.abs(dx) / THRESHOLD, 1);
    view.style.transition = 'none';
    view.style.transform = `translateX(${dx * 0.6}px)`;
    view.style.opacity = 1 - progress * 0.25;
    if (currentTab >= 0) moveTabIndicator(currentTab, target ? -dx / window.innerWidth : 0);
    const hint = swipeHints[dx > 0 ? 0 : 1];
    swipeHints[dx > 0 ? 1 : 0].classList.remove('show', 'ready');
    if (target) {
      hint.innerHTML = `<span class="ico">${target.icon}</span><span>${esc(target.label)}</span>`;
      hint.classList.add('show');
      hint.style.transform = `translateY(-50%) translateX(${(dx > 0 ? -1 : 1) * (1 - progress) * 110}%)`;
      if (progress >= 1 && !ready) vibrate(8);
      ready = progress >= 1;
      hint.classList.toggle('ready', ready);
    }
  }, { passive: true });

  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (decided && target && Math.abs(dx) >= THRESHOLD) {
      const t = target;
      view.style.transition = 'transform .16s ease-in, opacity .16s ease-in';
      view.style.transform = `translateX(${dx > 0 ? 40 : -40}%)`;
      view.style.opacity = 0;
      setTimeout(() => {
        resetHints();
        navDirection = t.dir;
        if (t.back) history.length > 1 ? history.back() : go('#/');
        else go(t.hash);
      }, 140);
    } else {
      view.style.transition = 'transform .3s cubic-bezier(.2, .8, .2, 1), opacity .3s';
      view.style.transform = '';
      view.style.opacity = '';
      if (currentTab >= 0) moveTabIndicator(currentTab);
      resetHints();
    }
    ready = false;
    target = null;
  };
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', end);
})();

/* ---------- Wellen-Effekt beim Tippen ---------- */
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .stat, .card.link, .tabbar a');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

/* ---------- Konfetti, wenn eine Rechnung bezahlt ist ---------- */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#14b8a6', '#0f766e', '#fcd34d', '#f472b6', '#60a5fa', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.background = colors[i % colors.length];
    c.style.left = `${50 + (Math.random() - 0.5) * 20}vw`;
    document.body.appendChild(c);
    const angle = (Math.random() - 0.5) * Math.PI * 0.9;
    const power = 300 + Math.random() * 350;
    c.animate([
      { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.sin(angle) * power}px, ${-Math.cos(angle) * power * 0.9}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${Math.sin(angle) * power * 1.3}px, ${window.innerHeight * 0.6}px) rotate(${Math.random() * 1440}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 900, easing: 'cubic-bezier(.2, .6, .4, 1)' }).onfinish = () => c.remove();
  }
}
window.addEventListener('hashchange', router);

(async () => {
  await loadSettings();
  router();
  navigator.storage?.persist?.();
  if (!NATIVE && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
