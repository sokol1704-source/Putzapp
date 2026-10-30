'use strict';

/* ---------- Einstellungen ---------- */
route('/einstellungen', async () => {
  const field = (name, label, attrs = '') => `<label>${label}<input name="${name}" value="${esc(S[name])}" ${attrs}></label>`;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  render('Einstellungen', `
    <form id="f" class="form">
      <h3 class="section">🏷️ Firma (erscheint auf Rechnungen)</h3>
      ${field('firma', 'Firmenname *', 'required')}
      ${field('slogan', 'Slogan (unter dem Namen)')}
      ${field('inhaber', 'Inhaber/in (Vor- und Nachname) *')}
      ${field('strasse', 'Straße & Hausnr. *')}
      ${field('plzOrt', 'PLZ & Ort *')}
      <div class="grid2">${field('telefon', 'Telefon', 'type="tel"')}${field('email', 'E-Mail', 'type="email"')}</div>
      ${field('steuernummer', 'Steuernummer (vom Finanzamt) *')}
      <h3 class="section">🏦 Bankverbindung</h3>
      ${field('bank', 'Bank')}
      <div class="grid2">${field('iban', 'IBAN')}${field('bic', 'BIC')}</div>
      <h3 class="section">🧾 Rechnungen & neue Häuser</h3>
      <div class="grid2">
        <label>Standard-Abrechnung
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
      <p class="muted small">Format: ${esc(S.nrPrefix)}-${new Date().getFullYear()}-001. Die Nummern werden lückenlos fortlaufend vergeben. Als Kleinunternehmer musst du keine E-Rechnung ausstellen – die PDF reicht.</p>
      <button class="btn block" type="submit">Speichern</button>
    </form>

    <a class="card link mt" href="#/leistungen"><div class="row between"><b>💶 Leistungen & Preise</b><span class="muted">›</span></div>
      <div class="muted small">${S.leistungen.length} Zusatzleistungen, z. B. Grundreinigung, Sperrmüll, Winterdienst</div></a>

    <h3 class="section">🔔 Erinnerungen & Wetter</h3>
    <div class="card form">
      ${NATIVE ? `<label class="check"><input type="checkbox" id="notif" ${S.benachrichtigungen !== false ? 'checked' : ''}> Am Vorabend an die Häuser von morgen erinnern</label>
      <label>Uhrzeit der Erinnerung<input type="time" id="notifTime" value="${esc(S.erinnerungUhrzeit || '19:00')}"></label>
      <p class="muted small">Bei Häusern mit Winterdienst warnt die App zusätzlich am Vorabend vor Schnee und Glätte.${S.geplanteErinnerungen != null ? ` Aktuell geplant: ${S.geplanteErinnerungen} Erinnerungen.` : ''}</p>
      <button class="btn ghost small" type="button" id="testNotif">Test-Benachrichtigung</button>` : '<p class="muted small">Erinnerungen und Glätte-Warnungen gibt es in der Android-App.</p>'}
      <label class="mt">Ort für die Wettervorhersage
        <div class="row gap"><input id="wOrt" value="${esc(S.wetterOrt?.name || '')}" placeholder="z. B. Mannheim"><button class="btn small" type="button" id="wSearch">Suchen</button></div>
      </label>
    </div>

    <h3 class="section" id="sicherung">💾 Datensicherung</h3>
    <div class="card">
      <p class="small">Alle Daten und Fotos liegen <b>nur auf diesem Handy</b>. Erstelle regelmäßig eine Sicherung und speichere sie z. B. in Google Drive – Rechnungen musst du 10 Jahre aufbewahren.</p>
      ${NATIVE ? `<label class="check"><input type="checkbox" id="autoBk" ${S.autoSicherung !== false ? 'checked' : ''}> Jede Woche automatisch sichern</label>
      <p class="muted small">${S.letzteAutoSicherung ? `Letzte automatische Sicherung: ${fmtDateLong(S.letzteAutoSicherung)} · ${esc(S.autoSicherungOrt || '')}` : 'Noch keine automatische Sicherung.'}${S.autoSicherungFehler ? ` <span class="danger-text">Fehler: ${esc(S.autoSicherungFehler)}</span>` : ''}</p>
      <button class="btn ghost small" type="button" id="autoNow">Jetzt automatisch sichern</button>` : ''}
      <p class="muted small">Letzte Sicherung zum Teilen: ${S.letzteSicherung ? fmtDateLong(S.letzteSicherung) : 'noch nie'}${est ? ` · Speicher: ${(est.usage / 1048576).toFixed(1)} MB` : ''}${persisted ? ' · dauerhaft gespeichert ✓' : ''}</p>
      <div class="quick">
        <button class="btn" id="export">⬇️ Sicherung erstellen</button>
        <label class="btn ghost">⬆️ Wiederherstellen<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
    </div>

    ${NATIVE ? '' : `<h3 class="section">📱 App auf den Startbildschirm</h3>
    <div class="card small">
      <p><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“.</p>
      <p><b>Android (Chrome):</b> Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</p>
    </div>`}
    <p class="muted small center">Toths Reinigungsservice · Version 2.5</p>
  `);

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const key of ['firma', 'slogan', 'inhaber', 'strasse', 'plzOrt', 'telefon', 'email', 'steuernummer', 'bank', 'iban', 'bic', 'nrPrefix']) S[key] = fd.get(key).trim();
    S.iban = S.iban.toUpperCase();
    S.stundensatz = toCents(fd.get('stundensatz'));
    S.abrechnung = fd.get('abrechnung');
    S.monatspauschale = toCents(fd.get('monatspauschale'));
    S.zahlungsziel = Number(fd.get('zahlungsziel')) || 0;
    S.nrStart = Math.max(1, Number(fd.get('nrStart')) || 1);
    await saveSettings();
    toast('✓ Einstellungen gespeichert');
  });
  $('#export').addEventListener('click', exportBackup);
  $('#notif')?.addEventListener('change', async (e) => { S.benachrichtigungen = e.target.checked; await saveSettings(); scheduleNotifications(true); });
  $('#notifTime')?.addEventListener('change', async (e) => { S.erinnerungUhrzeit = e.target.value || '19:00'; await saveSettings(); scheduleNotifications(true); toast('✓ Gespeichert'); });
  $('#testNotif')?.addEventListener('click', testNotification);
  $('#autoBk')?.addEventListener('change', async (e) => { S.autoSicherung = e.target.checked; await saveSettings(); });
  $('#autoNow')?.addEventListener('click', async () => { toast('Sicherung läuft…'); toast((await autoBackup(true)) ? '✓ Gesichert in ' + S.autoSicherungOrt : 'Sicherung fehlgeschlagen'); });
  $('#wSearch').addEventListener('click', async () => {
    const name = $('#wOrt').value.trim();
    if (!name) return;
    try {
      const hit = await geocode(name);
      if (!hit) return toast('Ort nicht gefunden');
      S.wetterOrt = hit;
      await saveSettings();
      $('#wOrt').value = hit.name;
      toast(`✓ Wetter für ${hit.name}`);
    } catch {
      toast('Keine Internetverbindung');
    }
  });
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
    ${unitsDatalist()}
    <div id="items" class="form"></div>
    <button type="button" class="btn ghost block" id="add">+ Leistung hinzufügen</button>
    <button type="button" class="btn block" id="save">Speichern</button>
    <button type="button" class="btn ghost block" id="reset">Vorlagen für Mehrfamilienhäuser laden</button>
    <details class="mt"><summary>💡 Woher kommen die Vorschlagspreise?</summary>
      <div class="card small mt">Richtwerte für ein Kleingewerbe ohne Umsatzsteuer. Treppenhausreinigung kostet bei Firmen meist 25–80 € pro Etage und Monat (wöchentlich), für ein kleines Mehrfamilienhaus 80–250 € im Monat – zzgl. 19 % USt. Mülltonnen-Service ca. 2–4 € pro Tonne und Leerung. Passe die Preise an deine Region an.</div>
    </details>
  `);
  draw();
  $('#items').addEventListener('input', (e) => {
    const key = e.target.dataset.k;
    if (!key) return;
    const l = list[e.target.closest('[data-i]').dataset.i];
    l[key] = key === 'preis' ? toCents(e.target.value) : e.target.value;
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
  $('#reset').addEventListener('click', () => {
    if (!confirm('Liste durch die Vorlagen für Mehrfamilienhäuser ersetzen?')) return;
    list.splice(0, list.length, ...DEFAULT_LEISTUNGEN.map((l) => ({ ...l })));
    draw();
  });
  $('#save').addEventListener('click', async () => {
    S.leistungen = list.filter((l) => l.name.trim()).map((l) => ({ ...l, name: l.name.trim(), einheit: l.einheit.trim() || 'pauschal' }));
    await saveSettings();
    toast('✓ Leistungen gespeichert');
    history.back();
  });
});

/* ---------- Datensicherung ---------- */
async function exportBackup() {
  toast('Sicherung wird erstellt…');
  const name = `toths-sicherung-${today()}.json`;
  await saveFile(new Blob([await buildBackupJson()], { type: 'application/json' }), name);
  S.letzteSicherung = today();
  await saveSettings();
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
  await migrate();
  toast('Sicherung wiederhergestellt');
  go('#/', true);
}
