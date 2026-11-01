'use strict';

/* ---------- Sicherung ---------- */
async function buildBackupJson() {
  const data = { app: 'toths-reinigung', version: 3, exportiert: new Date().toISOString() };
  for (const s of DB.stores) data[s] = await DB.all(s);
  data.photos = await Promise.all(data.photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
  return JSON.stringify(data);
}

// Speichert in der Android-App einmal pro Woche selbstständig eine Sicherung im Ordner
// „Dokumente/TothsReinigung“ (die letzten 4 bleiben erhalten). Dort überlebt sie auch ein Deinstallieren der App.
async function autoBackup(force = false) {
  if (!NATIVE || S.autoSicherung === false) return false;
  if (!force && S.letzteAutoSicherung && daysBetween(S.letzteAutoSicherung, today()) < 7) return false;
  if (!(await DB.all('objects')).length) return false;
  const dir = 'TothsReinigung';
  const path = `${dir}/toths-sicherung-${today()}.json`;
  let where = 'DOCUMENTS';
  try {
    const data = await buildBackupJson();
    try {
      await native('Filesystem', 'writeFile', { path, data, directory: where, encoding: 'utf8', recursive: true });
    } catch {
      where = 'EXTERNAL';
      await native('Filesystem', 'writeFile', { path, data, directory: where, encoding: 'utf8', recursive: true });
    }
    try {
      const { files } = await native('Filesystem', 'readdir', { path: dir, directory: where });
      const names = files.map((f) => f.name || f).filter((n) => n.startsWith('toths-sicherung-')).sort();
      for (const n of names.slice(0, -4)) await native('Filesystem', 'deleteFile', { path: `${dir}/${n}`, directory: where });
    } catch { /* Aufräumen ist nicht wichtig */ }
    S.letzteAutoSicherung = today();
    S.autoSicherungOrt = where === 'DOCUMENTS' ? 'Dokumente › TothsReinigung' : 'App-Speicher (wird beim Deinstallieren gelöscht!)';
    S.autoSicherungFehler = '';
    await saveSettings();
    return true;
  } catch (e) {
    S.autoSicherungFehler = e.message;
    await saveSettings();
    return false;
  }
}

/* ---------- Wetter & Glätte (Open-Meteo, kostenlos, ohne Konto) ---------- */
let weatherCache = null;

async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=de&countryCode=DE`);
  const hit = (await r.json()).results?.[0];
  return hit ? { name: hit.name, lat: hit.latitude, lon: hit.longitude } : null;
}

function glaetteRisiko(d) {
  if (d.schnee >= 0.5) return 'Schnee';
  if (d.tmin <= 0.5 && d.regen >= 0.3) return 'Glatteis';
  if (d.tmin <= -1) return 'Frost / Reifglätte';
  return null;
}

async function weatherForecast(force = false) {
  try {
    if (!S.wetterOrt) {
      const city = (S.plzOrt || '').replace(/^\d{4,5}\s*/, '').trim();
      if (!city) return null;
      S.wetterOrt = await geocode(city);
      if (!S.wetterOrt) return null;
      await saveSettings();
    }
    if (!force && weatherCache && Date.now() - weatherCache.t < 3 * 3600e3) return weatherCache.days;
    const { lat, lon } = S.wetterOrt;
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_min,temperature_2m_max,snowfall_sum,precipitation_sum&timezone=Europe%2FBerlin&forecast_days=4`);
    const j = await r.json();
    const days = j.daily.time.map((datum, i) => {
      const d = { datum, tmin: j.daily.temperature_2m_min[i], tmax: j.daily.temperature_2m_max[i], schnee: j.daily.snowfall_sum[i] || 0, regen: j.daily.precipitation_sum[i] || 0 };
      d.risiko = glaetteRisiko(d);
      return d;
    });
    weatherCache = { t: Date.now(), days };
    return days;
  } catch {
    return null;
  }
}

const streuHint = (material) => {
  const low = material.filter((m) => m.kategorie === 'Streumittel' && isLow(m));
  return low.length ? `<a class="small danger-text mt block-link" href="#/material?tab=einkauf">⚠️ Streumittel knapp: ${esc(low.map((m) => `${m.name} (${matNum(m.bestand)} ${m.einheit})`).join(', '))} – jetzt einkaufen</a>` : '';
};

const winterObjects = (objects) => objects.filter((o) => o.aktiv !== false && o.winterAbrechnung && o.winterAbrechnung !== 'keiner');

// Wetterkarte auf der Startseite (wird nachgeladen, wenn Internet da ist)
async function fillWeatherCard(el, objects) {
  const days = await weatherForecast();
  if (!days || !document.body.contains(el)) return;
  const wobjs = winterObjects(objects);
  const next = days.slice(0, 3);
  const risk = next.find((d) => d.risiko && d.datum >= today());
  if (!risk && !isWinter()) return;
  const label = (d) => (d.datum === today() ? 'Heute' : d.datum === addDays(today(), 1) ? 'Morgen' : fmtDateLong(d.datum).slice(0, 3));
  el.innerHTML = `<div class="card weather ${risk ? 'risk' : ''}">
    <div class="row between"><b>${risk ? `❄️ ${esc(risk.risiko)} ${label(risk).toLowerCase()}` : '🌤️ Wetter'}</b><span class="muted small">${esc(S.wetterOrt?.name || '')}</span></div>
    <div class="weather-days">${next.map((d) => `<div class="${d.risiko ? 'risk' : ''}"><span>${label(d)}</span><b>${Math.round(d.tmin)}° / ${Math.round(d.tmax)}°</b><small>${d.schnee >= 0.5 ? `🌨️ ${fmtNum(Math.round(d.schnee * 10) / 10)} cm` : d.regen >= 0.3 ? `🌧️ ${fmtNum(Math.round(d.regen))} mm` : '–'}</small></div>`).join('')}</div>
    ${risk && wobjs.length ? streuHint(await DB.all('material')) : ''}
    ${risk && wobjs.length ? `<div class="small mt">Winterdienst bei <b>${wobjs.length} ${wobjs.length === 1 ? 'Haus' : 'Häusern'}</b>: ${esc(wobjs.map(objLabel).join(', '))}</div>
      <a class="btn small winter-btn mt" href="#/winter/neu">❄️ Einsatz eintragen</a>` : ''}
  </div>`;
}

/* ---------- Benachrichtigungen (nur Android-App) ---------- */
async function notificationsAllowed(ask = true) {
  if (!NATIVE) return false;
  try {
    let p = await native('LocalNotifications', 'checkPermissions');
    if (p.display !== 'granted' && ask) p = await native('LocalNotifications', 'requestPermissions');
    return p.display === 'granted';
  } catch {
    return false;
  }
}

// Plant die Erinnerungen der nächsten Tage neu: am Vorabend die Häuser für morgen, bei Glättegefahr eine Warnung.
let lastSchedule = 0;
// Solange die Zeitmessung läuft: Vordergrunddienst mit laufender Zeit (Minuten, aktualisiert sich jede Minute).
// Schlägt der Dienst fehl, bleibt die feste Benachrichtigung mit Startzeit.
const TIMER_NOTIFICATION_ID = 4001;
let timerUpdate = null;
async function zeigeTimerBenachrichtigung(objektId) {
  if (!NATIVE) return;
  clearInterval(timerUpdate);
  timerUpdate = null;
  if (!S.timer) {
    await native('ForegroundService', 'stopForegroundService', {}).catch(() => {});
    await native('LocalNotifications', 'cancel', { notifications: [{ id: TIMER_NOTIFICATION_ID }] }).catch(() => {});
    return;
  }
  const o = await DB.get('objects', objektId || S.timer.objektId);
  const start = new Date(S.timer.start);
  const titel = '⏱️ Zeitmessung läuft';
  const text = () => {
    const min = Math.max(0, Math.floor((Date.now() - start) / 60000));
    return `${objLabel(o)} · seit ${pad(start.getHours())}:${pad(start.getMinutes())} · ${min} Min.`;
  };
  try {
    // serviceType 1 = Datensynchronisierung (passt zum Eintrag im Manifest)
    const optionen = () => ({ id: TIMER_NOTIFICATION_ID, title: titel, body: text(), smallIcon: 'ic_stat_toths', silent: true, serviceType: 1 });
    await native('ForegroundService', 'startForegroundService', optionen());
    timerUpdate = setInterval(() => native('ForegroundService', 'updateForegroundService', optionen()).catch(() => {}), 60000);
  } catch {
    // Rückfall: feste Benachrichtigung mit Startzeit
    try {
      await native('LocalNotifications', 'schedule', { notifications: [{
        id: TIMER_NOTIFICATION_ID,
        title: `${titel} seit ${pad(start.getHours())}:${pad(start.getMinutes())}`,
        body: `${objLabel(o)} – zum Beenden in der App auf „Fertig“ tippen`,
        schedule: { at: new Date(Date.now() + 500).toISOString() },
        ongoing: true,
        autoCancel: false,
      }] });
    } catch {
      // ohne Benachrichtigungs-Erlaubnis läuft die Zeitmessung trotzdem weiter
    }
  }
}

async function scheduleNotifications(force = false) {
  if (!NATIVE || S.benachrichtigungen === false) return;
  if (!force && Date.now() - lastSchedule < 10 * 60e3) return;
  lastSchedule = Date.now();
  if (!(await notificationsAllowed())) return;
  try {
    const pending = await native('LocalNotifications', 'getPending');
    if (pending.notifications?.length) await native('LocalNotifications', 'cancel', { notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const data = await loadAll();
    const plan = planning(data);
    const [hh, mm] = (S.erinnerungUhrzeit || '19:00').split(':').map(Number);
    const eveningBefore = (datum) => { const d = parseISO(addDays(datum, -1)); d.setHours(hh, mm, 0, 0); return d; };
    const notes = [];
    const lowMat = (await DB.all('material')).filter(isLow).map((m) => m.name);
    for (let i = 1; i <= 14; i++) {
      const datum = addDays(today(), i);
      const items = plan.filter((p) => p.datum === datum).sort((a, b) => (a.uhrzeit || '99').localeCompare(b.uhrzeit || '99'));
      const at = eveningBefore(datum);
      if (!items.length || at < new Date()) continue;
      const names = items.map((p) => objLabel(data.omap[p.objektId]));
      notes.push({
        id: 1000 + i,
        title: `Morgen: ${items.length} ${items.length === 1 ? 'Haus' : 'Häuser'} 🧽`,
        body: `${items[0].uhrzeit ? `Los geht's um ${items[0].uhrzeit} Uhr: ` : ''}${names.join(', ')}${i === 1 && lowMat.length ? ` · 🛒 Fast leer: ${lowMat.join(', ')}` : ''}`,
        schedule: { at: at.toISOString(), allowWhileIdle: true },
      });
    }
    const wobjs = winterObjects(data.objects);
    const days = wobjs.length ? await weatherForecast(true) : null;
    for (const d of (days || []).filter((x) => x.risiko && x.datum > today())) {
      let at = eveningBefore(d.datum);
      if (at < new Date()) at = new Date(Date.now() + 60e3);
      notes.push({
        id: 2000 + daysBetween(today(), d.datum),
        title: `❄️ ${d.risiko} – morgen früh ${Math.round(d.tmin)} °C`,
        body: `Winterdienst bei ${wobjs.length} ${wobjs.length === 1 ? 'Haus' : 'Häusern'}: ${wobjs.map(objLabel).join(', ')}. Wecker stellen!`,
        schedule: { at: at.toISOString(), allowWhileIdle: true },
      });
    }
    // Heute Abend an offene Mängel und unbeantwortete Angebote erinnern
    // Offene Punkte (Mängel, Angebote, überfällige Rechnungen): täglich wiederholt, auch wenn die App geschlossen ist.
    // Der Stand im Text ist der vom letzten Öffnen der App.
    const overdueM = data.maengel.filter((m) => m.status !== 'erledigt' && daysBetween(m.datum, today()) >= NACHFASS_TAGE).length;
    const overdueA = data.angebote.filter(angebotNachfassen).length;
    const overdueR = data.invoices.filter((i) => i.status === 'offen' && i.faellig < today()).length;
    if (overdueM || overdueA || overdueR) {
      const body = [overdueM && `${overdueM} ${overdueM === 1 ? 'offener Mangel' : 'offene Mängel'}`, overdueA && `${overdueA} ${overdueA === 1 ? 'Angebot' : 'Angebote'} ohne Antwort`, overdueR && `${overdueR} ${overdueR === 1 ? 'überfällige Rechnung' : 'überfällige Rechnungen'}`].filter(Boolean).join(' · ');
      const at = parseISO(today());
      at.setHours(hh, mm, 0, 0);
      if (at <= new Date()) at.setDate(at.getDate() + 1);
      notes.push({ id: 3001, title: '⏰ Offene Punkte nachhaken', body: `${body} (Stand beim letzten Öffnen)`, schedule: { at: at.toISOString(), repeats: true, every: 'day', allowWhileIdle: true } });
    }
    if (notes.length) await native('LocalNotifications', 'schedule', { notifications: notes });
    S.geplanteErinnerungen = notes.length;
    await saveSettings();
  } catch (e) {
    console.warn('Benachrichtigungen', e);
  }
}

async function testNotification() {
  if (!(await notificationsAllowed())) return toast('Benachrichtigungen sind nicht erlaubt (Android-Einstellungen → Apps → PURE TOTH)');
  await native('LocalNotifications', 'schedule', { notifications: [{ id: 99, title: '✨ PURE TOTH', body: 'So sehen deine Erinnerungen aus.', schedule: { at: new Date(Date.now() + 3000).toISOString() } }] });
  toast('Test kommt in 3 Sekunden');
}

/* ---------- Angekündigte Preisanpassungen ab Stichtag übernehmen ---------- */
async function applyDuePrices() {
  for (const o of await DB.all('objects')) {
    if (!o.neuerPreis || o.neuerPreis.ab > today()) continue;
    (o.preisHistorie ||= []).push({ ab: o.neuerPreis.ab, alt: o.monatspauschale, neu: o.neuerPreis.betrag });
    o.monatspauschale = o.neuerPreis.betrag;
    delete o.neuerPreis;
    await DB.put('objects', o);
  }
}

/* ---------- Echte Fahrzeiten & Kilometer (OpenStreetMap, nur bei Internet) ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const geoFetch = (url) => fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'Accept-Language': 'de' } }).then((r) => r.json());

// Adresse → Koordinaten. Ergebnis wird am Haus gespeichert, damit nur einmal gesucht wird.
async function ensureGeo(o) {
  const adresse = objAddress(o);
  if (!adresse) return null;
  if (o.geo?.adresse === adresse) return o.geo;
  const hit = (await geoFetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(adresse)}`))[0];
  await sleep(1100); // Nutzungsrichtlinie: höchstens eine Anfrage pro Sekunde
  if (!hit) return null;
  o.geo = { lat: Number(hit.lat), lon: Number(hit.lon), adresse };
  await DB.put('objects', o);
  return o.geo;
}

// Fahrt zwischen zwei Koordinaten: Minuten und Kilometer
async function drivingLeg(a, b) {
  const j = await geoFetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
  const r = j.routes?.[0];
  return r ? { min: Math.max(1, Math.round(r.duration / 60)), km: Math.round(r.distance / 100) / 10 } : null;
}

// Fahrten zwischen aufeinanderfolgenden Häusern. Gibt { [index]: {min, km} } zurück, leer ohne Internet.
async function travelLegs(objs) {
  const legs = {};
  try {
    const geos = [];
    for (const o of objs) geos.push(await ensureGeo(o));
    for (let i = 1; i < objs.length; i++) {
      if (!geos[i - 1] || !geos[i]) continue;
      const leg = await drivingLeg(geos[i - 1], geos[i]);
      if (leg) legs[i] = leg;
    }
  } catch {
    // offline oder Dienst nicht erreichbar: die Schätzwerte aus der Tagestour bleiben
  }
  return legs;
}
