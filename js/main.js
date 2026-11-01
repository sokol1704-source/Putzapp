'use strict';

/* ---------- Navigation ---------- */
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
  const el = e.target.closest('.btn, .stat, .card.link, .tabbar a, .tile, .qa > *');
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

/* ---------- Stoppuhr-Knöpfe & Zeitanzeige ---------- */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-start]');
  if (btn) { e.preventDefault(); startTimer(btn.dataset.start, btn.dataset.termin || ''); return; }
  // Termin ohne Haus (Angebot vor Ort, Gespräch) direkt als erledigt markieren
  const done = e.target.closest('[data-done]');
  if (done) {
    e.preventDefault();
    const t = await DB.get('appointments', done.dataset.done);
    if (!t) return;
    t.erledigt = true;
    await DB.put('appointments', t);
    vibrate(15);
    toast(`✓ ${terminTyp(t).label} erledigt`);
    scheduleNotifications(true);
    router();
  }
});
$('#timerPill').addEventListener('click', () => {
  if (confirm('Zeitmessung beenden und Einsatz erfassen?')) stopTimer();
});

/* ---------- Übernahme der Daten aus Version 1.x ---------- */
// Früher hatte jeder Kunde genau ein „Objekt“ (Adresse, Plan, Preis). Jetzt: Auftraggeber → Häuser.
// Firmenname auf PURE TOTH umstellen (nur einmal, eigene Änderungen bleiben erhalten)
async function umbenennenFirma() {
  if (S.firmaUmbenannt) return;
  if (S.firma === 'Toths Reinigungsservice') S.firma = 'PURE TOTH';
  if (S.slogan === 'Sauber · Zuverlässig · Persönlich') S.slogan = 'Sauberkeit mit Anspruch';
  S.firmaUmbenannt = true;
  await saveSettings();
}

// Bezugsquellen sind wieder entfernt: alte Einträge einmalig aus dem Material löschen
async function bereinigeBezugsquellen() {
  if (S.bezugsquellenBereinigt) return;
  for (const m of await DB.all('material')) {
    if (m.quellen || m.bezugsquelle) {
      delete m.quellen;
      delete m.bezugsquelle;
      await DB.put('material', m);
    }
  }
  S.bezugsquellenBereinigt = true;
  await saveSettings();
}

async function migrate() {
  if (S.schema >= 2) return;
  const [customers, visits, appts] = await Promise.all([DB.all('customers'), DB.all('visits'), DB.all('appointments')]);
  const objects = await DB.all('objects');
  for (const c of customers) {
    if (objects.some((o) => o.kundeId === c.id)) continue;
    const o = await DB.put('objects', {
      kundeId: c.id, name: '', strasse: c.strasse || c.name, plzOrt: c.plzOrt || '', etagen: 0, eingaenge: 1, aufzug: false,
      zugang: '', vorOrtName: '', vorOrtTelefon: '', intervallTage: c.intervallTage || 0, wochentag: c.wochentag ?? '', uhrzeit: c.uhrzeit || '',
      abrechnung: c.abrechnung || 'stunde', monatspauschale: c.monatspauschale || 0, stundensatz: c.stundensatz || S.stundensatz,
      winterAbrechnung: 'keiner', winterPreis: 2500, notizen: c.notizen || '', aktiv: c.aktiv !== false, aufgaben: taskList(c),
    });
    for (const v of visits.filter((x) => x.kundeId === c.id && !x.objektId)) { v.objektId = o.id; await DB.put('visits', v); }
    for (const a of appts.filter((x) => x.kundeId === c.id && !x.objektId)) { a.objektId = o.id; await DB.put('appointments', a); }
  }
  // Haushalts-Vorlagen aus Version 1 gegen die für Mehrfamilienhäuser tauschen, wenn unverändert
  if (S.leistungen.map((l) => l.id).join(',') === OLD_LEISTUNG_IDS) S.leistungen = DEFAULT_LEISTUNGEN;
  S.schema = 2;
  await saveSettings();
}

/* ---------- Android-Zurück-Geste ---------- */
// Wischen vom Rand bzw. Zurück-Taste: erst offene Fenster schließen, dann eine Seite zurück,
// nur auf der Startseite wird die App beendet.
function setupBackButton() {
  const App = window.Capacitor?.Plugins?.App;
  if (!NATIVE || !App) return;
  App.addListener('backButton', () => {
    const sheet = $('.sheet-backdrop');
    if (sheet) { sheet.querySelector('[data-act=cancel]')?.click(); return; }
    if ($('.lightbox')) { $('.lightbox').remove(); return; }
    const path = location.hash.slice(1) || '/';
    if (path !== '/') {
      if (history.length > 1) history.back();
      else go('#/', true);
      return;
    }
    App.exitApp();
  });
}

/* ---------- Einführung: beim ersten Start und nach den Werkseinstellungen ---------- */
const EINFUEHRUNG = [
  ['🧽', 'Willkommen bei PURE TOTH', 'Die App begleitet dich durch den Tag: Häuser, Einsätze, Fotos, Rechnungen und Buchhaltung. Alles bleibt auf diesem Handy.'],
  ['▶️', 'Zeit messen und erfassen', 'Tippe bei einem Haus auf „Start“. Die Zeit läuft weiter, auch wenn du die App schließt. Mit „Fertig“ übernimmst du sie in den Einsatz.'],
  ['📷', 'Fotos und Checkliste', 'Mach Fotos vorher und nachher und hake die Aufgaben ab. Manche Häuser verlangen eine feste Anzahl Fotos.'],
  ['🧾', 'Rechnungen und Monat', 'Der Monatsabschluss zeigt, was abzurechnen ist. Du prüfst jede Rechnung, bevor du sie verschickst.'],
  ['💾', 'Sicherung nicht vergessen', 'Alle Daten liegen nur auf diesem Handy. Mach regelmäßig eine Sicherung in den Einstellungen und speichere sie z. B. in Google Drive.'],
];
function zeigeEinfuehrung(erneut = false) {
  let i = 0;
  const huelle = document.createElement('div');
  huelle.className = 'einfuehrung';
  huelle.setAttribute('role', 'dialog');
  huelle.setAttribute('aria-modal', 'true');
  const zeichne = () => {
    const [icon, titel, text] = EINFUEHRUNG[i];
    const letzte = i === EINFUEHRUNG.length - 1;
    huelle.innerHTML = `<div class="einf-card">
      <div class="einf-icon">${icon}</div>
      <h2>${titel}</h2>
      <p>${text}</p>
      <div class="einf-dots">${EINFUEHRUNG.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      <div class="row gap">
        ${letzte ? '' : '<button class="btn ghost" type="button" data-skip>Überspringen</button>'}
        <button class="btn" type="button" data-next>${letzte ? 'Los geht’s' : 'Weiter'}</button>
      </div>
    </div>`;
  };
  const schliessen = async () => {
    huelle.remove();
    if (!erneut) { S.einfuehrung = true; await saveSettings(); }
  };
  huelle.addEventListener('click', (e) => {
    if (e.target.closest('[data-skip]')) return schliessen();
    if (e.target.closest('[data-next]')) {
      if (i === EINFUEHRUNG.length - 1) return schliessen();
      i++;
      zeichne();
    }
  });
  zeichne();
  document.body.appendChild(huelle);
}

/* ---------- App-Sperre mit Fingerabdruck (nur Android) ---------- */
const SPERRE_NACH_MS = 30000; // nach 30 Sekunden im Hintergrund wieder sperren
let entsperrtUm = Date.now();

async function sperrenWennNoetig(sofort = false) {
  if (!NATIVE || !S.appSperre) return;
  if (!sofort && Date.now() - entsperrtUm < SPERRE_NACH_MS) return;
  document.body.classList.add('gesperrt');
  let sperre = document.querySelector('.sperre');
  if (!sperre) {
    sperre = document.createElement('div');
    sperre.className = 'sperre';
    sperre.innerHTML = '<div class="sperre-card"><div class="einf-icon">🔒</div><h2>PURE TOTH</h2><p>Bitte mit Fingerabdruck oder Gerätesperre entsperren.</p><button class="btn" type="button" id="entsperren">Entsperren</button></div>';
    document.body.appendChild(sperre);
    sperre.querySelector('#entsperren').addEventListener('click', () => entsperren());
  }
  entsperren();
}

async function entsperren() {
  try {
    const { isAvailable } = await native('BiometricAuthNative', 'checkBiometry', {});
    // Ohne Fingerabdruck oder Gerätesperre nicht aussperren
    if (!isAvailable) return entsperrtVerlassen();
    await native('BiometricAuthNative', 'internalAuthenticate', { reason: 'PURE TOTH entsperren', androidTitle: 'Entsperren', cancelTitle: 'Abbrechen', allowDeviceCredential: true });
    entsperrtVerlassen();
  } catch {
    // Abgebrochen: Sperre bleibt, der Knopf zum Erneutversuchen steht darauf
  }
}

function entsperrtVerlassen() {
  entsperrtUm = Date.now();
  document.querySelector('.sperre')?.remove();
  document.body.classList.remove('gesperrt');
}

/* ---------- Start ---------- */
window.addEventListener('hashchange', router);

(async () => {
  await loadSettings();
  await migrate();
  await bereinigeBezugsquellen();
  await umbenennenFirma();
  await applyDuePrices();
  // Alte, zu niedrige Richtwerte für Angebote durch die neuen ersetzen – eigene Änderungen bleiben
  if (!S.kalkV3) {
    if (!S.kalk || S.kalk.proEtage <= 800) S.kalk = { ...DEFAULT_SETTINGS.kalk };
    S.kalkV3 = true;
    await saveSettings();
  }
  router();
  updateTimerPill();
  setupBackButton();
  if (!S.einfuehrung) zeigeEinfuehrung();
  if (S.timer) zeigeTimerBenachrichtigung(S.timer.objektId);
  sperrenWennNoetig(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sperrenWennNoetig(); });
  autoBackup();
  scheduleNotifications();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleNotifications(); });
  navigator.storage?.persist?.();
  if (!NATIVE && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
