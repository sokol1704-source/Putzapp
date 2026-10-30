'use strict';

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (v) => esc(v).replace(/\n/g, '<br>');

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmtDate = (s) => (s ? parseISO(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const fmtDateLong = (s) => parseISO(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDay = (s) => fmtDate(s).slice(0, 6);
const money = (c) => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const num = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
const fmtNum = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const centsInput = (c) => (c ? (c / 100).toFixed(2) : '');
const toCents = (v) => Math.round(num(v) * 100);
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'de');
const monthLabel = (m) => parseISO(`${m}-01`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const lastOfMonth = (m) => { const [y, mo] = m.split('-').map(Number); return isoDate(new Date(y, mo, 0)); };
const prevMonth = () => { const d = new Date(); d.setDate(0); return isoDate(d).slice(0, 7); };
const hoursBetween = (von, bis) => {
  const [h1, m1] = von.split(':').map(Number);
  const [h2, m2] = bis.split(':').map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return Math.round(mins / 15) / 4;
};
// Winterdienst-Saison: Oktober bis April, benannt nach dem Startjahr ("2026/27")
const seasonOf = (datum) => { const [y, m] = datum.split('-').map(Number); const start = m >= 7 ? y : y - 1; return `${start}/${String(start + 1).slice(2)}`; };
const isWinter = () => { const m = new Date().getMonth() + 1; return m >= 11 || m <= 3; };

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

const vibrate = (ms = 10) => navigator.vibrate?.(ms);

/* ---------- Teilen, Drucken (Android-App über native Plugins) ---------- */
const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const native = (plugin, method, options) => window.Capacitor.nativePromise(plugin, method, options);

const blobToDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

const isCancel = (e) => /cancel|abort/i.test(`${e.name} ${e.message}`);

// Dateien (und optional Text) teilen: WhatsApp, E-Mail, Drive … Gibt false zurück, wenn das Gerät kein Teilen kann.
async function shareFiles(files, title, text = '') {
  try {
    if (NATIVE) {
      const uris = [];
      for (const f of files) {
        const data = (await blobToDataUrl(f.blob)).split(',')[1];
        uris.push((await native('Filesystem', 'writeFile', { path: f.name, data, directory: 'CACHE' })).uri);
      }
      await native('Share', 'share', { title, dialogTitle: title, files: uris, ...(text ? { text } : {}) });
      return true;
    }
    const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
    if (!navigator.canShare?.({ files: list })) return false;
    await navigator.share({ files: list, title, ...(text ? { text } : {}) });
  } catch (e) {
    if (!isCancel(e)) toast('Teilen fehlgeschlagen: ' + e.message);
  }
  return true;
}

async function shareText(text, title) {
  try {
    if (NATIVE) return await native('Share', 'share', { title, text, dialogTitle: title });
    if (navigator.share) return await navigator.share({ title, text });
    await navigator.clipboard.writeText(text);
    toast('Text in die Zwischenablage kopiert');
  } catch (e) {
    if (!isCancel(e)) toast('Teilen fehlgeschlagen: ' + e.message);
  }
}

async function saveFile(blob, name) {
  if (!(await shareFiles([{ blob, name }], name))) download(blob, name);
}

// Druckt die aktuelle Seite (nur das Dokument, alles andere blendet das Druck-CSS aus)
function printPage(title) {
  const old = document.title;
  document.title = title;
  if (NATIVE) native('Printer', 'print', { name: title }).catch((e) => toast(e.message));
  else window.print();
  setTimeout(() => { document.title = old; }, 1000);
}

/* ---------- Fotos ---------- */
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

async function savePhotos(ownerId, pending) {
  for (const p of pending) {
    await DB.put('photos', { id: p.id, visitId: ownerId, typ: p.typ, blob: p.blob, erstellt: new Date().toISOString() });
  }
}

async function deletePhotos(ownerId) {
  for (const p of await DB.by('photos', 'visitId', ownerId)) await DB.del('photos', p.id);
}

const photoFiles = (photos, prefix) => photos.map((p, i) => ({ blob: p.blob, name: `${prefix}_${p.typ}_${i + 1}.jpg` }));

/* ---------- Einstellungen ---------- */
const DEFAULT_LEISTUNGEN = [
  { id: 'grund', name: 'Grundreinigung Treppenhaus', preis: 2500, einheit: 'Etage', art: 'arbeit' },
  { id: 'tfenster', name: 'Treppenhausfenster putzen', preis: 2500, einheit: 'Std.', art: 'arbeit' },
  { id: 'tonnen', name: 'Mülltonnen raus & rein', preis: 300, einheit: 'Tonne', art: 'arbeit' },
  { id: 'muellplatz', name: 'Mülltonnenplatz reinigen', preis: 1500, einheit: 'pauschal', art: 'arbeit' },
  { id: 'sperrmuell', name: 'Sperrmüll / Unrat entfernen', preis: 3000, einheit: 'Std.', art: 'arbeit' },
  { id: 'laub', name: 'Laub entfernen', preis: 2500, einheit: 'Std.', art: 'arbeit' },
  { id: 'gehweg', name: 'Gehweg & Zugang kehren', preis: 1000, einheit: 'pauschal', art: 'arbeit' },
  { id: 'winter', name: 'Winterdienst-Einsatz', preis: 2500, einheit: 'Einsatz', art: 'arbeit' },
  { id: 'graffiti', name: 'Starke Verschmutzung / Graffiti entfernen', preis: 3000, einheit: 'Std.', art: 'arbeit' },
  { id: 'keller', name: 'Keller entrümpeln', preis: 3000, einheit: 'Std.', art: 'arbeit' },
  { id: 'streugut', name: 'Streumittel', preis: 800, einheit: 'Sack', art: 'material' },
  { id: 'anfahrt', name: 'Anfahrt', preis: 30, einheit: 'km', art: 'fahrt' },
];
// Alte Vorlagen aus Version 1.x (Haushalt) – werden beim Update ersetzt, wenn unverändert
const OLD_LEISTUNG_IDS = 'muell,tonnen,fenster,buegeln,waesche,betten,kuehlschrank,backofen,balkon,pflanzen,einkauf,anfahrt';

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
  leistungen: DEFAULT_LEISTUNGEN,
  // Richtwerte für den Angebotsrechner (je Reinigung)
  kalk: { proEtage: 1200, aufzug: 800, keller: 1500, dachboden: 1000, aussen: 1000, muellplatz: 700 },
  timer: null,
  schema: 0,
};
let S = { ...DEFAULT_SETTINGS };
async function loadSettings() {
  S = { ...DEFAULT_SETTINGS, ...(await DB.get('settings', 'main')) };
  S.kalk = { ...DEFAULT_SETTINGS.kalk, ...S.kalk };
}
const saveSettings = () => DB.put('settings', S);
// Ab so vielen Tagen ohne Rückmeldung bzw. Erledigung erinnern (Mängel, Angebote)
const NACHFASS_TAGE = 14;
// Qualitätscheck am Einsatz: was nach der Reinigung geprüft werden kann
const QUALITAET_PUNKTE = ['Treppenhaus gewischt', 'Geländer & Handläufe', 'Briefkästen', 'Hauseingang & Glastür', 'Fenster & Fensterbänke', 'Mülltonnenplatz sauber', 'Keller / Aufzug geprüft'];
const settingsComplete = () => S.firma && S.inhaber && S.strasse && S.plzOrt && S.steuernummer;
const absender = () => Object.fromEntries(['firma', 'slogan', 'inhaber', 'strasse', 'plzOrt', 'telefon', 'email', 'steuernummer', 'bank', 'iban', 'bic'].map((k) => [k, S[k]]));
const UNITS = ['Monat', 'Std.', 'pauschal', 'Mal', 'Etage', 'Tonne', 'Einsatz', 'Stk.', 'Sack', 'km'];
const unitPrice = (l) => `${money(l.preis)}${l.einheit === 'pauschal' ? ' pauschal' : `/${l.einheit}`}`;

/* ---------- Daten ---------- */
async function loadAll() {
  const names = ['customers', 'objects', 'visits', 'appointments', 'invoices', 'maengel', 'winter', 'angebote'];
  const [customers, objects, visits, appointments, invoices, maengel, winter, angebote] = await Promise.all(names.map((s) => DB.all(s)));
  customers.sort(byName);
  objects.sort((a, b) => objLabel(a).localeCompare(objLabel(b), 'de'));
  return {
    customers, objects, visits, appointments, invoices, maengel, winter, angebote,
    kmap: Object.fromEntries(customers.map((c) => [c.id, c])),
    omap: Object.fromEntries(objects.map((o) => [o.id, o])),
  };
}

const objLabel = (o) => (o ? o.name || o.strasse || 'Haus ohne Namen' : 'Unbekanntes Haus');
const objAddress = (o) => [o?.strasse, o?.plzOrt].filter(Boolean).join(', ');
const kundeName = (kmap, id) => kmap[id]?.name ?? 'Unbekannter Auftraggeber';
const isMonthly = (o) => o?.abrechnung === 'monat';
const priceLabel = (o) => (isMonthly(o) ? `${money(o.monatspauschale || 0)}/Monat` : `${money(o.stundensatz || 0)}/Std.`);
const mapsUrl = (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

/* ---------- Reinigungsplan ---------- */
const FREQS = [[0, 'jedes Mal'], [14, 'alle 2 Wochen'], [28, 'alle 4 Wochen'], [56, 'alle 2 Monate'], [91, 'alle 3 Monate'], [182, 'alle 6 Monate'], [365, 'einmal im Jahr']];
const freqLabel = (d) => FREQS.find(([v]) => v === Number(d))?.[1] ?? `alle ${d} Tage`;
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
// Typische Aufgaben im Mehrfamilienhaus mit üblicher Häufigkeit
const TASK_SUGGESTIONS = [
  ['Treppenhaus fegen & feucht wischen', 0], ['Handläufe & Geländer abwischen', 0], ['Eingangstür & Glas reinigen', 0],
  ['Briefkästen & Klingelanlage abwischen', 0], ['Spinnweben entfernen', 0], ['Lichtschalter & Türgriffe', 0],
  ['Sauberlaufmatten absaugen', 0], ['Eingangsbereich außen fegen', 0], ['Aufzug reinigen (Kabine & Türen)', 0],
  ['Kellergänge fegen & wischen', 28], ['Mülltonnenplatz reinigen', 28], ['Heizkörper & Fensterbänke abwischen', 28],
  ['Wohnungstüren & Zargen abwischen', 28], ['Treppenhausfenster putzen', 91], ['Dachboden fegen', 91],
  ['Lampen im Treppenhaus reinigen', 91], ['Fahrradkeller / Tiefgarage fegen', 91], ['Grundreinigung & Einpflegen', 182],
];

// Aufgaben eines Hauses als [{ text, alleTage, start }], auch aus dem alten Format (nur Text)
const taskList = (o) => (o?.aufgaben || []).map((t) => (typeof t === 'string' ? { text: t, alleTage: 0 } : t));
const planStep = (o) => (o.intervallTage > 0 ? o.intervallTage : 14);

function snapWeekday(datum, wochentag) {
  if (wochentag === '' || wochentag == null) return datum;
  return addDays(datum, (Number(wochentag) - parseISO(datum).getDay() + 7) % 7);
}

function rhythmLabel(o) {
  if (!(o.intervallTage > 0)) return 'kein fester Rhythmus';
  const every = { 7: 'jede Woche', 14: 'alle 2 Wochen', 21: 'alle 3 Wochen', 28: 'alle 4 Wochen' }[o.intervallTage] || `alle ${o.intervallTage} Tage`;
  const day = o.wochentag !== '' && o.wochentag != null ? ` · ${WEEKDAYS[o.wochentag].slice(0, 2)}.` : '';
  return every + day + (o.uhrzeit ? ` · ${o.uhrzeit} Uhr` : '');
}

// Termine im Rhythmus, jeweils auf den Wunsch-Wochentag geschoben
function planDates(o, from, count) {
  const dates = [];
  let d = snapWeekday(from, o.wochentag);
  for (let i = 0; i < count; i++) {
    dates.push(d);
    d = snapWeekday(addDays(d, planStep(o)), o.wochentag);
  }
  return dates;
}

function lastVisit(visits, objektId) {
  return visits.filter((v) => v.objektId === objektId).sort((a, b) => b.datum.localeCompare(a.datum))[0];
}

// Nächster Termin laut Rhythmus: letzter Einsatz + Intervall, frühestens heute
function nextPlanStart(o, visits) {
  const last = lastVisit(visits, o.id);
  const base = last ? addDays(last.datum, planStep(o)) : today();
  return base < today() ? today() : base;
}

function lastDone(o, visits) {
  const last = {};
  for (const v of visits) {
    if (v.objektId !== o.id) continue;
    for (const t of v.aufgaben || []) if (t.erledigt && !(last[t.text] >= v.datum)) last[t.text] = v.datum;
  }
  return last;
}

// Für jeden Termin die fälligen Aufgaben bestimmen. Eine Aufgabe ist fällig, wenn seit dem
// letzten Erledigen ihr Abstand (mit halbem Termin-Intervall Spielraum) vergangen ist.
function buildPlan(o, visits, dates) {
  const tol = Math.floor(planStep(o) / 2);
  const last = lastDone(o, visits);
  const tasks = taskList(o);
  for (const t of tasks) if (t.alleTage > 0 && !last[t.text] && t.start) last[t.text] = addDays(t.start, -t.alleTage);
  return dates.map((datum) => {
    const due = tasks.filter((t) => !(t.alleTage > 0) || !last[t.text] || daysBetween(last[t.text], datum) >= t.alleTage - tol);
    due.forEach((t) => { last[t.text] = datum; });
    return { datum, aufgaben: due };
  });
}
const dueTasks = (o, visits, datum) => (o ? buildPlan(o, visits, [datum])[0].aufgaben.map((t) => t.text) : []);

// Große Aufgaben, die noch nie erledigt wurden, gleichmäßig auf die ersten Termine verteilen
function assignStarts(o, visits, oldTasks) {
  const last = lastDone(o, visits);
  const dates = planDates(o, nextPlanStart(o, visits), 30);
  let k = 0;
  for (const t of o.aufgaben) {
    if (!(t.alleTage > 0) || last[t.text]) continue;
    const old = oldTasks.find((x) => x.text === t.text);
    if (old?.start && Number(old.alleTage) === Number(t.alleTage)) { t.start = old.start; continue; }
    t.start = dates[k++ % Math.max(1, Math.round(t.alleTage / planStep(o)))];
  }
}

// Offene Termine + automatisch berechnete Fälligkeiten aus dem Rhythmus
// Termin-Arten: Dauer in Minuten (0 = automatisch aus den letzten Einsätzen) und Standard-Fahrzeit
const TERMIN_TYPEN = {
  reinigung: { label: 'Reinigung', icon: '🧽', dauer: 0 },
  besichtigung: { label: 'Angebot vor Ort', icon: '📝', dauer: 60 },
  gespraech: { label: 'Kundengespräch', icon: '🤝', dauer: 45 },
  sonstiges: { label: 'Sonstiges', icon: '📌', dauer: 30 },
};
const terminTyp = (a) => TERMIN_TYPEN[a.typ || 'reinigung'] || TERMIN_TYPEN.reinigung;
const isReinigung = (a) => (a.typ || 'reinigung') === 'reinigung';

function planning({ objects, visits, appointments }) {
  const items = appointments
    .filter((a) => !a.erledigt)
    .map((a) => ({ type: 'termin', id: a.id, datum: a.datum, uhrzeit: a.uhrzeit, objektId: a.objektId || '', aufgaben: a.aufgaben || [], notiz: a.notiz,
      typ: a.typ || 'reinigung', ort: a.ort || '', dauer: Number(a.dauer) || 0, fahrzeit: a.fahrzeit ?? 20 }));
  for (const o of objects) {
    if (o.aktiv === false || !(o.intervallTage > 0)) continue;
    if (items.some((i) => i.objektId === o.id)) continue;
    const last = lastVisit(visits, o.id);
    if (!last) continue;
    const datum = snapWeekday(addDays(last.datum, o.intervallTage), o.wochentag);
    items.push({ type: 'faellig', datum, uhrzeit: o.uhrzeit, objektId: o.id, aufgaben: dueTasks(o, visits, datum) });
  }
  return items.sort((a, b) => (a.datum + (a.uhrzeit || '')).localeCompare(b.datum + (b.uhrzeit || '')));
}

// Tatsächlicher Stundenlohn eines Hauses aus den Einsätzen der letzten 90 Tage
function effectiveWage(o, visits) {
  if (!isMonthly(o)) return o.stundensatz ? { wage: o.stundensatz, hoursPerMonth: null } : null;
  const since = addDays(today(), -90);
  const recent = visits.filter((v) => v.objektId === o.id && v.datum >= since && v.datum <= today() && num(v.stunden) > 0);
  if (!recent.length) return null;
  const first = recent.map((v) => v.datum).sort()[0];
  const months = Math.max(1, daysBetween(first, today()) / 30.4);
  const hoursPerMonth = recent.reduce((s, v) => s + num(v.stunden), 0) / months;
  return { wage: Math.round((o.monatspauschale || 0) / hoursPerMonth), hoursPerMonth };
}
const wageClass = (cents) => (cents >= 2500 ? 'ok' : cents >= 1800 ? 'warn' : 'bad');

function whenLabel(datum) {
  const d = daysBetween(today(), datum);
  if (d === 0) return 'Heute';
  if (d === 1) return 'Morgen';
  if (d < 0) return `${-d} Tag${d === -1 ? '' : 'e'} überfällig`;
  return `${fmtDateLong(datum)} · in ${d} Tagen`;
}

/* ---------- Stoppuhr ---------- */
async function startTimer(objektId, terminId = '') {
  if (S.timer && !confirm('Es läuft schon eine Zeitmessung. Neu starten?')) return;
  S.timer = { objektId, terminId, start: new Date().toISOString() };
  await saveSettings();
  vibrate(20);
  toast('⏱️ Zeit läuft – viel Erfolg!');
  updateTimerPill();
}

async function stopTimer() {
  const t = S.timer;
  if (!t) return;
  const start = new Date(t.start);
  S.timer = null;
  await saveSettings();
  updateTimerPill();
  vibrate([20, 60, 20]);
  const von = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  go(`#/einsatz/neu?objekt=${t.objektId}${t.terminId ? `&termin=${t.terminId}` : ''}&datum=${isoDate(start)}&von=${von}&bis=${nowTime()}`);
}

function timerText() {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(S.timer.start)) / 1000));
  return `${Math.floor(secs / 3600)}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
}

let timerTick;
async function updateTimerPill() {
  const pill = $('#timerPill');
  clearInterval(timerTick);
  if (!S.timer) { pill.hidden = true; return; }
  const o = await DB.get('objects', S.timer.objektId);
  pill.hidden = false;
  const draw = () => { pill.innerHTML = `<span class="dot"></span><b>${timerText()}</b><span class="where">${esc(objLabel(o))}</span><span class="stop">⏹ Fertig</span>`; };
  draw();
  timerTick = setInterval(draw, 1000);
}

/* ---------- Router & Seitenaufbau ---------- */
const routes = [];
const route = (pattern, fn) => routes.push([new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn]);

let navDirection = 'forward';
const TABS = [
  { name: 'start', hash: '#/', label: 'Start', icon: '🏠' },
  { name: 'objekte', hash: '#/objekte', label: 'Häuser', icon: '🏢' },
  { name: 'termine', hash: '#/termine', label: 'Termine', icon: '📅' },
  { name: 'rechnungen', hash: '#/rechnungen', label: 'Rechnungen', icon: '🧾' },
  { name: 'mehr', hash: '#/mehr', label: 'Mehr', icon: '✨' },
];
let currentTab = -1;
const ANIMATED = '.card, .stat, .tile, .hero, .section, .quick, .seg, .empty, .form > label, .form > .grid2, .form > .grid3, .form > .tasks, .form > .btn, .doc-wrap';

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

// Ereignisse auf dem Seitenbereich: werden beim nächsten Seitenwechsel automatisch entfernt,
// damit sich Handler beim erneuten Öffnen einer Seite nicht verdoppeln
let viewListeners = [];
function onView(type, fn) {
  $('#view').addEventListener(type, fn);
  viewListeners.push([type, fn]);
}

async function router() {
  viewListeners.forEach(([type, fn]) => $('#view').removeEventListener(type, fn));
  viewListeners = [];
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

/* ---------- Gemeinsame Bausteine ---------- */
function customerSelect(customers, selected, { allowNew = false } = {}) {
  return `<label>Auftraggeber *<select name="kundeId" required>
    <option value="">– Auftraggeber wählen –</option>
    ${customers.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
    ${allowNew ? '<option value="__neu">➕ Neuer Auftraggeber…</option>' : ''}
  </select></label>`;
}

function objectSelect(objects, kmap, selected, label = 'Haus') {
  return `<label>${label} *<select name="objektId" required>
    <option value="">– Haus wählen –</option>
    ${objects.map((o) => `<option value="${o.id}" ${o.id === selected ? 'selected' : ''}>${esc(objLabel(o))} · ${esc(kundeName(kmap, o.kundeId))}</option>`).join('')}
  </select></label>`;
}

const tile = (href, icon, title, sub, badge = '') => `<a class="tile" href="${href}">
    <span class="tile-icon">${icon}</span><b>${title}</b><span class="muted small">${sub}</span>${badge ? `<span class="tile-badge">${badge}</span>` : ''}</a>`;

function noObjects() {
  render('Hinweis', `<div class="empty"><p>Lege zuerst ein Haus an.</p><a class="btn" href="#/objekt/neu">+ Haus anlegen</a></div>`);
}

// Kurzfassung: Standardaufgaben nur zählen, besondere Aufgaben hervorheben
function taskSummary(o, texts) {
  if (!texts.length) return '';
  const periodic = new Set(taskList(o).filter((t) => t.alleTage > 0).map((t) => t.text));
  const special = texts.filter((t) => periodic.has(t));
  const regular = texts.length - special.length;
  return `<div class="small task-sum">${regular ? `<span class="muted">🧽 Standardreinigung (${regular} Aufgabe${regular === 1 ? '' : 'n'})</span>` : ''}
    ${special.map((t) => `<span class="chip static hot">✨ ${esc(t)}</span>`).join('')}</div>`;
}

function planCard(it, data) {
  const o = data.omap[it.objektId];
  if (!o && it.type === 'termin' && it.typ !== 'reinigung') {
    // Termin ohne Haus (z. B. Kundengespräch im Büro)
    const t = TERMIN_TYPEN[it.typ] || TERMIN_TYPEN.sonstiges;
    return `<div class="card plan">
      <div class="row between"><b>${t.icon} ${esc(t.label)}${it.ort ? ` · ${esc(it.ort)}` : ''}</b><span class="badge">${it.uhrzeit ? `${esc(it.uhrzeit)} Uhr` : 'Termin'}</span></div>
      <div class="small muted">${esc(whenLabel(it.datum))}${it.notiz ? ` · 📝 ${esc(it.notiz)}` : ''}</div>
      <div class="row gap mt"><button class="btn small" data-done="${it.id}">✓ Erledigt</button><a class="btn small ghost" href="#/termin/${it.id}">Bearbeiten</a></div>
    </div>`;
  }
  if (!o) return '';
  const overdue = it.datum < today();
  const tasks = taskSummary(o, it.aufgaben);
  const tag = it.type === 'termin'
    ? `<span class="badge">${it.uhrzeit ? esc(it.uhrzeit) + ' Uhr' : 'Termin'}</span>`
    : '<span class="badge soft" title="Berechnet aus dem Rhythmus">Rhythmus</span>';
  const second = it.type === 'termin'
    ? `<a class="btn small ghost" href="#/termin/${it.id}">Bearbeiten</a>`
    : `<a class="btn small ghost" href="#/termin/neu?objekt=${o.id}&datum=${it.datum}">Termin festlegen</a>`;
  return `<div class="card plan ${overdue ? 'overdue' : ''}">
    <div class="row between"><a class="strong" href="#/objekt/${o.id}">🏢 ${esc(objLabel(o))}</a>${tag}</div>
    <div class="small ${overdue ? 'danger-text' : 'muted'}">${esc(whenLabel(it.datum))} · ${esc(kundeName(data.kmap, o.kundeId))}</div>
    ${tasks}
    ${it.notiz ? `<div class="small">📝 ${esc(it.notiz)}</div>` : ''}
    <div class="row gap mt">
      <button class="btn small" data-start="${o.id}" data-termin="${it.type === 'termin' ? it.id : ''}">▶️ Start</button>
      <a class="btn small ghost" href="#/einsatz/neu?objekt=${o.id}${it.type === 'termin' ? `&termin=${it.id}` : ''}">✓ Erledigt</a>
      ${second}
    </div>
  </div>`;
}

function visitCard(v, data, showName = true) {
  const done = (v.aufgaben || []).filter((t) => t.erledigt).map((t) => t.text);
  const o = data.omap[v.objektId];
  return `<a class="card link" href="#/einsatz/${v.id}">
    <div class="row between">
      <b>${showName ? `🏢 ${esc(objLabel(o))}` : fmtDateLong(v.datum)}</b>
      ${v.rechnungId ? '<span class="badge ok">abgerechnet</span>' : '<span class="badge warn">offen</span>'}
    </div>
    <div class="muted small">${showName ? fmtDateLong(v.datum) + ' · ' : ''}${v.von ? `${esc(v.von)}–${esc(v.bis || '')} · ` : ''}${v.stunden ? fmtNum(v.stunden) + ' Std.' : ''}${v.fotoAnzahl ? ` · 📷 ${v.fotoAnzahl}` : ''}</div>
    ${done.length ? `<div class="small">${esc(done.join(' · '))}</div>` : ''}
    ${v.extras?.length ? `<div class="small">➕ ${esc(v.extras.map((x) => (x.menge > 1 ? `${fmtNum(x.menge)}× ` : '') + x.name).join(' · '))}</div>` : ''}
  </a>`;
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
  return { set(list) { extras.splice(0, extras.length, ...list.map((x) => ({ ...x }))); draw(); } };
}

// Fotos aufnehmen/auswählen. Neue Fotos bleiben bis zum Speichern in "pending".
function photoEditor(el, existing, pending, groups = [['vorher', 'Vorher'], ['nachher', 'Nachher']]) {
  const thumb = (p, kind) => `<div class="thumb">
    <img src="${p.url || (p.url = objUrl(p.blob))}" alt="Foto" data-view>
    <button type="button" class="thumb-del" data-${kind}="${p.id}" aria-label="Foto entfernen">✕</button></div>`;
  const draw = () => {
    el.innerHTML = groups.map(([typ, label]) => `<div class="photo-group">
      ${groups.length > 1 ? `<div class="small muted">${label}</div>` : ''}
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
    for (const file of input.files) pending.push({ id: DB.uid(), typ: input.dataset.typ, blob: await compressImage(file) });
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

const gallery = (photos, label = '') => (photos.length
  ? `${label ? `<div class="small muted mt">${label}</div>` : ''}<div class="thumbs">${photos.map((p) => `<div class="thumb"><img src="${objUrl(p.blob)}" alt="Foto" data-view></div>`).join('')}</div>`
  : '');

// Kopf für Druckdokumente (Rechnung, Angebot, Nachweis, Aushang)
function docHeader(a = absender()) {
  const [first, ...rest] = (a.firma || '').split(' ');
  const slogan = a.slogan ?? S.slogan;
  return `<header class="inv-head">
      <img class="inv-logo" src="icons/icon.svg" alt="">
      <div class="inv-brandbox">
        <div class="inv-brand"><b>${esc(first)}</b> ${esc(rest.join(' '))}</div>
        ${slogan ? `<div class="inv-slogan">${esc(slogan)}</div>` : ''}
      </div>
      <div class="inv-contact">${esc(a.inhaber)}<br>${esc(a.strasse)}<br>${esc(a.plzOrt)}
        ${a.telefon ? `<br>Tel. ${esc(a.telefon)}` : ''}${a.email ? `<br>${esc(a.email)}` : ''}</div>
    </header>
    <div class="inv-accent"></div>`;
}

function docFooter(a = absender()) {
  return `<footer class="inv-foot">
      <div>${esc(a.firma)}<br>Inh. ${esc(a.inhaber)}<br>${esc(a.strasse)}, ${esc(a.plzOrt)}</div>
      <div>${a.telefon ? `Tel. ${esc(a.telefon)}<br>` : ''}${esc(a.email)}<br>Steuernr.: ${esc(a.steuernummer)}</div>
      <div>${esc(a.bank)}<br>IBAN: ${esc(a.iban)}${a.bic ? `<br>BIC: ${esc(a.bic)}` : ''}</div>
    </footer>`;
}

const recipientBlock = (k, a = absender()) => `<div class="inv-recipient">
    <div class="inv-sender">${esc([a.firma, a.inhaber, a.strasse, a.plzOrt].filter(Boolean).join(' · '))}</div>
    ${esc(k.name)}${k.ansprechpartner ? `<br>z. Hd. ${esc(k.ansprechpartner)}` : ''}<br>${esc(k.strasse)}<br>${esc(k.plzOrt)}
  </div>`;

/* ---------- PDF direkt erzeugen & teilen ---------- */
const loadedScripts = {};
function loadScript(src) {
  loadedScripts[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(`${src} konnte nicht geladen werden`));
    document.head.appendChild(s);
  });
  return loadedScripts[src];
}

// Rendert ein Dokument (.invoice-doc) als A4-PDF. Lange Dokumente werden auf mehrere Seiten verteilt.
async function docToPdf(docEl) {
  await Promise.all([loadScript('js/vendor/html2canvas.min.js'), loadScript('js/vendor/jspdf.umd.min.js')]);
  const holder = document.createElement('div');
  holder.className = 'pdf-render';
  const clone = docEl.cloneNode(true);
  clone.querySelectorAll('.no-print').forEach((el) => el.remove());
  // html2canvas kann SVG-Verläufe nicht zuverlässig zeichnen → PNG-Logo verwenden
  clone.querySelectorAll('img[src="icons/icon.svg"]').forEach((img) => { img.src = 'icons/icon-512.png'; });
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    await Promise.all([...clone.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    const top = clone.getBoundingClientRect().top;
    const blockRects = [...clone.querySelectorAll('p, li, h2, h3, tr, figure, .sign-row, .parties, .inv-row, .inv-head, .inv-foot, .aushang-dates, .aushang-contact')]
      .map((el) => { const r = el.getBoundingClientRect(); return [r.top - top, r.bottom - top]; });
    const headRects = [...clone.querySelectorAll('h2, h3')].map((el) => { const r = el.getBoundingClientRect(); return [r.top - top, r.bottom - top]; });
    const canvas = await window.html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const k = canvas.width / clone.offsetWidth;
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const pageH = Math.floor((canvas.width * 297) / 210);
    const topPad = Math.round(44 * k);
    let y = 0;
    for (let page = 0; y < canvas.height - 2; page++) {
      const avail = page ? pageH - topPad : pageH;
      let end = Math.min(y + avail, canvas.height);
      // Nicht mitten durch eine Zeile, einen Absatz oder eine Tabellenzeile schneiden
      if (end < canvas.height) {
        const cut = blockRects.filter(([t, b]) => t * k < end && b * k > end && t * k > y + avail * 0.3).map(([t]) => t * k);
        if (cut.length) end = Math.floor(Math.min(...cut)) - 4;
        // Eine Überschrift nicht allein am Seitenende stehen lassen
        const orphan = headRects.filter(([t, b]) => b * k <= end && b * k > end - 60 * k && t * k > y + avail * 0.3).map(([t]) => t * k);
        if (orphan.length) end = Math.floor(Math.min(...orphan)) - 4;
      }
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = end - y;
      slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (page) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', 0, page ? (topPad * 210) / canvas.width : 0, 210, (slice.height * 210) / canvas.width);
      y = end;
    }
    return pdf.output('blob');
  } finally {
    holder.remove();
  }
}

async function sharePdf(docEl, fileBase, text = '') {
  toast('📄 PDF wird erstellt…');
  try {
    const blob = await docToPdf(docEl);
    const name = `${fileBase.replace(/[^\wäöüÄÖÜß.-]+/g, '_')}.pdf`;
    if (!(await shareFiles([{ blob, name }], fileBase, text))) download(blob, name);
  } catch (e) {
    toast('PDF fehlgeschlagen: ' + e.message);
  }
}

// Knöpfe „Drucken“ und „Als PDF senden“ unter einem Dokument verdrahten
function wireDocButtons(fileBase, text = '') {
  $('#print')?.addEventListener('click', () => printPage(fileBase));
  $('#sendPdf')?.addEventListener('click', () => sharePdf($('.invoice-doc'), fileBase, text));
}
const docActionButtons = (extra = '') => `<div class="quick">
    <button class="btn" id="sendPdf">📤 Als PDF senden</button>
    <button class="btn ghost" id="print">🖨️ Drucken</button>${extra}</div>`;

/* ---------- Unterschrift auf dem Display ---------- */
function signaturePad(title, defaultName = '') {
  return new Promise((resolve) => {
    const sheet = document.createElement('div');
    sheet.className = 'sheet-backdrop';
    sheet.innerHTML = `<div class="sheet">
      <h3>${esc(title)}</h3>
      <input class="sig-name" placeholder="Name in Druckbuchstaben" value="${esc(defaultName)}">
      <div class="sig-box"><canvas></canvas><span class="sig-hint">Hier mit dem Finger unterschreiben</span></div>
      <div class="row gap"><button class="btn ghost" data-act="clear">Löschen</button><button class="btn ghost" data-act="cancel">Abbrechen</button><button class="btn" data-act="ok">✓ Übernehmen</button></div>
    </div>`;
    document.body.appendChild(sheet);
    const canvas = $('canvas', sheet);
    const box = $('.sig-box', sheet);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = box.clientWidth * dpr;
    canvas.height = box.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b2545';
    let drawing = false;
    let empty = true;
    let last = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); $('.sig-hint', sheet).hidden = true; });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      empty = false;
    });
    const stop = () => { drawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    const close = (result) => { sheet.classList.add('closing'); setTimeout(() => sheet.remove(), 200); resolve(result); };
    sheet.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'clear') { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; $('.sig-hint', sheet).hidden = false; }
      if (act === 'cancel') close(null);
      if (act === 'ok') {
        if (empty) return toast('Bitte zuerst unterschreiben');
        close({ name: $('.sig-name', sheet).value.trim(), png: canvas.toDataURL('image/png'), datum: today() });
      }
    });
  });
}

// Unterschriftsfeld im Dokument: zeigt eine gespeicherte Unterschrift oder eine leere Linie
const signSlot = (sig, label) => `<div class="sign-slot">
    ${sig ? `<img src="${sig.png}" alt="Unterschrift"><div>${esc(sig.name || '')}${sig.name ? ', ' : ''}${fmtDate(sig.datum)}</div>` : '<div class="sign-empty"></div>'}
    <div class="sign-label">${label}</div></div>`;

/* ---------- Preise ---------- */
// Monatspauschale für einen Monat – berücksichtigt eine angekündigte Preisanpassung
function priceFor(o, month) {
  if (o.neuerPreis && month >= o.neuerPreis.ab.slice(0, 7)) return o.neuerPreis.betrag;
  // Für Monate vor einer bereits übernommenen Anpassung gilt der damalige Preis
  const later = (o.preisHistorie || []).filter((h) => month < h.ab.slice(0, 7)).sort((a, b) => a.ab.localeCompare(b.ab));
  return later.length ? later[0].alt : o.monatspauschale || 0;
}
const KM_SATZ = 30; // 0,30 € je gefahrenem Kilometer (Fahrten mit dem Privat-Pkw)
