'use strict';

/* ---------- Material & Einkaufsliste ---------- */
const MAT_KATEGORIEN = ['Reinigungsmittel', 'Verbrauchsmaterial', 'Werkzeug & Geräte', 'Streumittel'];
const MAT_EINHEITEN = ['Kanister', 'Flasche', 'Sack', 'Packung', 'Rolle', 'Stück', 'Paar'];
// Vorlagen für die Treppenhausreinigung: [Name, Einheit, Kategorie, Verbrauch je Reinigung, je Winter-Einsatz, Mindest, Soll, Preis €]
const MAT_VORLAGEN = [
  ['Grundreiniger (Treppenhausboden)', 'Kanister', 'Reinigungsmittel', 0.05, 0, 1, 2, 15],
  ['Neutralreiniger (10 l)', 'Kanister', 'Reinigungsmittel', 0.05, 0, 1, 2, 18],
  ['Glasreiniger', 'Flasche', 'Reinigungsmittel', 0.1, 0, 1, 3, 4],
  ['Müllraum-Reiniger / Geruchsneutralisator', 'Flasche', 'Reinigungsmittel', 0.05, 0, 1, 2, 6],
  ['Mikrofasertücher (10er)', 'Packung', 'Verbrauchsmaterial', 0.05, 0, 1, 2, 9],
  ['Putztücher (Vlies)', 'Packung', 'Verbrauchsmaterial', 0.1, 0, 1, 2, 5],
  ['Wischbezüge', 'Stück', 'Verbrauchsmaterial', 0.02, 0, 2, 4, 8],
  ['Müllbeutel', 'Rolle', 'Verbrauchsmaterial', 0.05, 0, 1, 3, 3],
  ['Einweghandschuhe', 'Packung', 'Verbrauchsmaterial', 0.02, 0, 1, 2, 7],
  ['Streusplitt (25 kg)', 'Sack', 'Streumittel', 0, 0.3, 2, 6, 9],
  ['Streugranulat (abstumpfend)', 'Sack', 'Streumittel', 0, 0.2, 1, 3, 12],
];
// Bestände abrunden – lieber etwas zu wenig anzeigen als zu viel
const matNum = (n) => fmtNum(Math.floor(num(n) * 10 + 1e-9) / 10);
const toBuy = (m) => Math.max(0, Math.ceil((num(m.soll) || num(m.mindest) * 2 || 1) - num(m.bestand)));
const isLow = (m) => num(m.bestand) <= num(m.mindest);

// Wie viele Reinigungen pro Woche anstehen (aus den Rhythmen aller betreuten Häuser)
const cleaningsPerWeek = (objects) => objects.filter((o) => o.aktiv !== false && o.intervallTage > 0).reduce((s, o) => s + 7 / o.intervallTage, 0);

function rangeLabel(m, perWeek) {
  if (!(num(m.proEinsatz) > 0) || !perWeek) return '';
  const weeks = num(m.bestand) / num(m.proEinsatz) / perWeek;
  if (weeks < 1) return `reicht noch ca. ${Math.max(0, Math.round(weeks * 7))} Tage`;
  return `reicht noch ca. ${Math.round(weeks)} Woche${Math.round(weeks) === 1 ? '' : 'n'}`;
}

// Verbrauch beim Speichern eines Einsatzes abziehen (art: 'reinigung' | 'winter')
async function consumeMaterial(art) {
  const field = art === 'winter' ? 'proWinter' : 'proEinsatz';
  const low = [];
  for (const m of await DB.all('material')) {
    const use = num(m[field]);
    if (!(use > 0)) continue;
    const wasLow = isLow(m);
    m.bestand = Math.max(0, Math.round((num(m.bestand) - use) * 1000) / 1000);
    await DB.put('material', m);
    if (!wasLow && isLow(m)) low.push(m.name);
  }
  if (low.length) setTimeout(() => toast(`🛒 Fast leer: ${low.join(', ')} – steht auf der Einkaufsliste`), 1200);
}

route('/material', async (_, q) => {
  const [items, objects] = await Promise.all([DB.all('material'), DB.all('objects')]);
  items.sort((a, b) => MAT_KATEGORIEN.indexOf(a.kategorie) - MAT_KATEGORIEN.indexOf(b.kategorie) || a.name.localeCompare(b.name, 'de'));
  const tab = q.tab || (items.some(isLow) ? 'einkauf' : 'lager');
  const perWeek = cleaningsPerWeek(objects);
  // Erstes Foto je Artikel für die Vorschau
  const fotoVon = {};
  for (const m of items) { const [ph] = await DB.by('photos', 'visitId', m.id); if (ph) fotoVon[m.id] = ph; }
  const einkauf = items.filter(isLow);
  const shopItem = (m) => `<label class="card shop-item">
          <input type="checkbox" data-buy="${m.id}">
          <span class="grow"><b>${esc(m.name)}</b><br><span class="muted small">noch ${matNum(m.bestand)} ${esc(m.einheit)}${m.preis ? ` · ca. ${money(m.preis)} je ${esc(m.einheit)}` : ''}</span></span>
          <span class="qty-box"><input type="number" min="0" step="1" inputmode="numeric" class="buy-qty" data-qty="${m.id}" value="${toBuy(m)}" aria-label="Menge"><small>${esc(m.einheit)}</small></span>
        </label>`;

  const stockCard = (m) => {
    const soll = num(m.soll) || num(m.mindest) * 2 || 1;
    const pct = Math.min(100, (num(m.bestand) / soll) * 100);
    return `<div class="card mat ${isLow(m) ? 'low' : ''}" data-id="${m.id}">
      ${fotoVon[m.id] ? `<img class="mat-thumb" src="${fotoVon[m.id].url || (fotoVon[m.id].url = objUrl(fotoVon[m.id].blob))}" alt="">` : ''}
      <div class="row between">
        <a class="mat-edit strong" href="#/material/${m.id}" aria-label="${esc(m.name)} ändern">${esc(m.name)}<span class="mat-pen">✏️</span></a>
        <div class="stepper"><button class="icon-btn" data-step="-1" aria-label="Weniger">−</button><b>${matNum(m.bestand)}</b><button class="icon-btn" data-step="1" aria-label="Mehr">+</button></div></div>
      <div class="hbar"><span class="${isLow(m) ? 'bad' : pct < 60 ? 'warn' : 'ok'}" style="width:${pct}%"></span></div>
      <a class="mat-edit muted small" href="#/material/${m.id}">${esc(m.einheit)} · Mindestbestand ${matNum(m.mindest)}${rangeLabel(m, perWeek) ? ` · ${rangeLabel(m, perWeek)}` : ''}</a>
    </div>`;
  };

  render('Material', `
    <div class="seg">
      <a href="#/material?tab=einkauf" class="${tab === 'einkauf' ? 'active' : ''}">🛒 Einkaufsliste${einkauf.length ? ` (${einkauf.length})` : ''}</a>
      <a href="#/material?tab=lager" class="${tab === 'lager' ? 'active' : ''}">📦 Lager (${items.length})</a>
    </div>
    ${tab === 'einkauf' ? `
      ${einkauf.length ? `<div class="mt" id="shop">${einkauf.map(shopItem).join('')}</div>
        <div class="total" id="shopTotal"></div>
        <div class="quick"><button class="btn" id="bought">✓ Eingekauft – Bestand auffüllen</button><button class="btn ghost" id="shareList">💬 Liste teilen</button></div>`
      : `<div class="empty">Alles da 👍<br><span class="small">Sobald etwas unter den Mindestbestand fällt, steht es hier.</span></div>`}
    ` : `
      <p class="muted small mt">Tippe auf ein Material, um es zu ändern oder zu löschen. Mit − und + passt du den Bestand an.</p>
      <div class="row3 mt"><a class="btn" href="#/material/neu">+ Material</a><button class="btn ghost" id="scan">📷 Scannen</button><button class="btn ghost" id="vorlagen">${items.length ? '📋 Ergänzen' : '📋 Vorlagen'}</button></div>
      ${MAT_KATEGORIEN.map((k) => { const list = items.filter((m) => m.kategorie === k); return list.length ? `<h3 class="section">${esc(k)}</h3>${list.map(stockCard).join('')}` : ''; }).join('')}
      ${items.length ? '<p class="muted small">Mit − und + korrigierst du den Bestand. Der Verbrauch pro Reinigung bzw. Winter-Einsatz wird beim Speichern automatisch abgezogen.</p>'
        : '<div class="empty">Noch kein Material angelegt.<br><span class="small">Mit „Vorlagen laden“ bekommst du eine typische Grundausstattung für die Treppenhausreinigung.</span></div>'}
    `}
  `);

  const byId = Object.fromEntries(items.map((m) => [m.id, m]));
  const drawTotal = () => {
    const el = $('#shopTotal');
    if (!el) return;
    const sum = einkauf.reduce((s, m) => s + (m.preis || 0) * (Number($(`[data-qty="${m.id}"]`).value) || 0), 0);
    el.innerHTML = sum ? `Geschätzt: <b>${money(sum)}</b>` : '';
  };
  drawTotal();
  $('#shop')?.addEventListener('input', drawTotal);
  $('#shop')?.addEventListener('change', (e) => { if (e.target.dataset.buy) e.target.closest('.shop-item').classList.toggle('done', e.target.checked); });

  $('#shareList')?.addEventListener('click', () => shareText([`🛒 Einkaufsliste ${S.firma}`, '', ...einkauf.map((m) => `☐ ${$(`[data-qty="${m.id}"]`).value} × ${m.name}`)].join('\n'), 'Einkaufsliste'));
  $('#bought')?.addEventListener('click', async () => {
    const bought = $$('[data-buy]:checked').map((cb) => ({ m: byId[cb.dataset.buy], qty: Number($(`[data-qty="${cb.dataset.buy}"]`).value) || 0 })).filter((x) => x.qty > 0);
    if (!bought.length) return toast('Bitte zuerst abhaken, was du gekauft hast');
    for (const { m, qty } of bought) { m.bestand = num(m.bestand) + qty; await DB.put('material', m); }
    vibrate(15);
    const sum = bought.reduce((s, { m, qty }) => s + (m.preis || 0) * qty, 0);
    if (confirm(`Bestand aufgefüllt ✓\n\nEinkauf${sum ? ` (ca. ${money(sum)})` : ''} gleich als Ausgabe erfassen? Danach kannst du den Kassenbon fotografieren.`)) {
      const kat = bought.some(({ m }) => m.kategorie === 'Streumittel') && bought.every(({ m }) => m.kategorie === 'Streumittel') ? 'Streumittel'
        : bought.every(({ m }) => m.kategorie === 'Reinigungsmittel') ? 'Reinigungsmittel' : 'Arbeitsmaterial & Geräte';
      const a = await DB.put('ausgaben', { datum: today(), betrag: sum, kategorie: kat, beschreibung: `Einkauf: ${bought.map(({ m, qty }) => `${qty}× ${m.name}`).join(', ')}`, zahlung: 'Karte' });
      toast('Betrag prüfen und Beleg fotografieren');
      return go(`#/ausgabe/${a.id}`);
    }
    toast('✓ Bestand aufgefüllt');
    router();
  });

  $('#scan')?.addEventListener('click', async () => {
    if (!NATIVE) return toast('Scannen funktioniert in der Android-App');
    try {
      const { available } = await native('BarcodeScanner', 'isGoogleBarcodeScannerModuleAvailable', {});
      if (!available) {
        await native('BarcodeScanner', 'installGoogleBarcodeScannerModule', {});
        return toast('Scanner wird installiert – bitte gleich nochmal tippen');
      }
      const { barcodes } = await native('BarcodeScanner', 'scan', {});
      const code = barcodes?.[0]?.rawValue;
      if (!code) return toast('Kein Code erkannt');
      const bekannt = items.find((m) => m.barcode === code);
      go(bekannt ? `#/material/${bekannt.id}` : `#/material/neu?barcode=${encodeURIComponent(code)}`);
    } catch {
      toast('Scannen nicht möglich');
    }
  });

  $('#vorlagen')?.addEventListener('click', async () => {
    // Nur Artikel ergänzen, die noch nicht in der Liste stehen – vorhandene bleiben unverändert
    const vorhanden = new Set((await DB.all('material')).map((m) => m.name.toLowerCase()));
    let neu = 0;
    for (const [name, einheit, kategorie, proEinsatz, proWinter, mindest, soll, preis] of MAT_VORLAGEN) {
      if (vorhanden.has(name.toLowerCase())) continue;
      await DB.put('material', { name, einheit, kategorie, proEinsatz, proWinter, mindest, soll, bestand: soll, preis: preis * 100, notiz: '' });
      neu++;
    }
    toast(neu ? `✓ ${neu} Artikel ergänzt – bitte Bestände prüfen` : 'Alle Vorlagen sind schon in der Liste');
    router();
  });

  onView('click', async (e) => {
    const step = e.target.closest('[data-step]');
    if (!step) return;
    e.preventDefault();
    const card = step.closest('[data-id]');
    const m = byId[card.dataset.id];
    m.bestand = Math.max(0, Math.round((num(m.bestand) + Number(step.dataset.step)) * 10) / 10);
    await DB.put('material', m);
    vibrate(8);
    const zahl = $('.stepper b', card);
    zahl.textContent = matNum(m.bestand);
    zahl.classList.remove('bump');
    void zahl.offsetWidth; // Animation neu starten
    zahl.classList.add('bump');
    card.classList.toggle('low', isLow(m));
    const soll = num(m.soll) || num(m.mindest) * 2 || 1;
    const bar = $('.hbar span', card);
    bar.style.width = `${Math.min(100, (m.bestand / soll) * 100)}%`;
    bar.className = isLow(m) ? 'bad' : m.bestand / soll < 0.6 ? 'warn' : 'ok';
  });
});

route('/material/neu', (_, q) => materialForm(null, q));
route('/material/:id', async ({ id }) => materialForm(await DB.get('material', id)));

async function materialForm(m, q = {}) {
  const isNew = !m;
  m = m || { id: DB.uid(), name: '', einheit: 'Flasche', kategorie: MAT_KATEGORIEN[0], bestand: 1, mindest: 1, soll: 3, proEinsatz: 0, proWinter: 0, preis: 0, notiz: '', barcode: q.barcode || '' };
  const existing = isNew ? [] : await DB.by('photos', 'visitId', m.id);
  const pending = [];
  render(isNew ? 'Neues Material' : m.name, `
    <form id="f" class="form">
      <label>Bezeichnung *<input name="name" required value="${esc(m.name)}" placeholder="z. B. Neutralreiniger (10 l)"></label>
      <div class="grid2">
        <label>Einheit<input name="einheit" list="matUnits" value="${esc(m.einheit)}"></label>
        <label>Kategorie<select name="kategorie">${MAT_KATEGORIEN.map((k) => `<option ${k === m.kategorie ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      </div>
      <datalist id="matUnits">${MAT_EINHEITEN.map((u) => `<option value="${u}">`).join('')}</datalist>
      <div class="grid3">
        <label>Bestand<input name="bestand" type="number" step="0.1" min="0" inputmode="decimal" value="${esc(m.bestand)}"></label>
        <label>Mindest­bestand<input name="mindest" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(m.mindest)}"></label>
        <label>Soll­bestand<input name="soll" type="number" step="1" min="0" inputmode="decimal" value="${esc(m.soll)}"></label>
      </div>
      <div class="label">Automatischer Verbrauch</div>
      <div class="grid2">
        <label>je Reinigung<input name="proEinsatz" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(m.proEinsatz)}"></label>
        <label>je Winter-Einsatz<input name="proWinter" type="number" step="0.05" min="0" inputmode="decimal" value="${esc(m.proWinter)}"></label>
      </div>
      <p class="muted small">Beispiel: Ein 10-l-Kanister reicht für etwa 20 Reinigungen → 0,05 je Reinigung. Ein Sack Splitt reicht für etwa 3 Einsätze → 0,3.</p>
      <label>Preis je Einheit (€)<input name="preis" type="number" step="0.01" min="0" inputmode="decimal" value="${centsInput(m.preis)}"></label>
      <label>Notiz<input name="notiz" value="${esc(m.notiz)}"></label>
      <label>Barcode <span class="muted small">(wird beim Scannen eingetragen)</span><input name="barcode" value="${esc(m.barcode || '')}"></label>
      <div class="label">Foto</div>
      <div id="photos"></div>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button class="btn danger ghost block" type="button" id="del">Löschen</button>'}
    </form>
  `);
  photoEditor($('#photos'), existing, pending, [['material', 'Foto']]);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.assign(m, {
      name: fd.get('name').trim(), einheit: fd.get('einheit').trim() || 'Stück', kategorie: fd.get('kategorie'),
      bestand: num(fd.get('bestand')), mindest: num(fd.get('mindest')), soll: num(fd.get('soll')),
      proEinsatz: num(fd.get('proEinsatz')), proWinter: num(fd.get('proWinter')),
      preis: toCents(fd.get('preis')), notiz: fd.get('notiz').trim(), barcode: fd.get('barcode').trim(),
    });
    await DB.put('material', m);
    await savePhotos(m.id, pending);
    toast('✓ Gespeichert');
    go('#/material?tab=lager', true);
  });
  $('#del')?.addEventListener('click', async () => { if (confirm(`„${m.name}“ löschen?`)) { await deletePhotos(m.id); await DB.del('material', m.id); go('#/material?tab=lager', true); } });
}
