'use strict';

/* ---------- Reinigungsvertrag ---------- */
const DEFAULT_VERTRAG = { beginn: '', frist: 3, werktags: '07:00', sonntags: '09:00', schluessel: 1, versicherung: '' };

function vertragDoc(o, k, v, sigAG, sigAN) {
  const tl = taskList(o);
  const every = { 7: 'wöchentlich', 14: 'alle zwei Wochen', 21: 'alle drei Wochen', 28: 'alle vier Wochen' }[o.intervallTage] || 'nach Vereinbarung';
  const day = o.wochentag !== '' && o.wochentag != null ? `, in der Regel am ${WEEKDAYS[o.wochentag]}` : '';
  const facts = [o.etagen ? `${o.etagen} Etagen` : '', `${o.eingaenge || 1} Eingang${o.eingaenge > 1 ? 'e' : ''}`, o.aufzug ? 'Aufzug' : ''].filter(Boolean).join(', ');
  const winter = o.winterAbrechnung && o.winterAbrechnung !== 'keiner';
  let n = 0;
  const para = (title, body) => `<h3 class="doc-h3">§ ${++n} ${title}</h3>${body}`;
  return `<article class="invoice-doc vertrag">
    ${docHeader()}
    <h2 class="inv-title">Reinigungsvertrag <span>Treppenhausreinigung</span></h2>
    <div class="parties">
      <div><span class="doc-muted">zwischen</span><br><b>${esc(k.name)}</b>${k.ansprechpartner ? `<br>vertreten durch ${esc(k.ansprechpartner)}` : ''}<br>${esc(k.strasse || '')}<br>${esc(k.plzOrt || '')}<br><span class="doc-muted">– nachfolgend „Auftraggeber“ –</span></div>
      <div><span class="doc-muted">und</span><br><b>${esc(S.firma)}</b><br>Inh. ${esc(S.inhaber)}<br>${esc(S.strasse)}<br>${esc(S.plzOrt)}<br><span class="doc-muted">– nachfolgend „Auftragnehmer“ –</span></div>
    </div>
    ${para('Vertragsgegenstand', `<p>Der Auftragnehmer übernimmt die regelmäßige Reinigung des Objekts <b>${esc(objAddress(o) || objLabel(o))}</b> (${esc(facts)}).</p>`)}
    ${para('Leistungsumfang und Rhythmus', `<p>Die Reinigung erfolgt <b>${every}</b>${day}. Sie umfasst:</p>
      <ul class="doc-list two-col">${tl.map((t) => `<li>${esc(t.text)}${t.alleTage > 0 ? ` <span class="doc-muted">(${freqLabel(t.alleTage)})</span>` : ''}</li>`).join('')}</ul>
      <p>Weitere Leistungen (z. B. Grundreinigung, Entfernen von Sperrmüll) werden nur nach gesonderter Beauftragung gemäß aktueller Preisliste ausgeführt. Festgestellte Mängel im Objekt meldet der Auftragnehmer dem Auftraggeber zeitnah, nach Möglichkeit mit Foto.</p>`)}
    ${para('Vergütung', `<p>${isMonthly(o) ? `Die Vergütung beträgt pauschal <b>${money(o.monatspauschale || 0)} pro Monat</b>.` : `Die Vergütung erfolgt nach Aufwand mit <b>${money(o.stundensatz || 0)} pro Stunde</b>.`}
      Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung). Die Abrechnung erfolgt monatlich nachträglich; Rechnungen sind innerhalb von ${S.zahlungsziel || 14} Tagen ohne Abzug zahlbar. Auf Wunsch erhält der Auftraggeber einen monatlichen Leistungsnachweis.</p>`)}
    ${winter ? para('Winterdienst', `<p>Der Auftragnehmer übernimmt das Räumen und Streuen des Gehwegs vor dem Haus, des Hauseingangs und der Zugänge sowie des Wegs zu den Mülltonnen. Geräumt und gestreut wird bei Schnee- und Eisglätte werktags ab ${esc(v.werktags)} Uhr, sonn- und feiertags ab ${esc(v.sonntags)} Uhr bis 20 Uhr, soweit die örtliche Satzung nichts anderes bestimmt. Verwendet werden abstumpfende Streumittel; jeder Einsatz wird in einem Räum- und Streuprotokoll dokumentiert.
      Vergütung: ${o.winterAbrechnung === 'einsatz' ? `<b>${money(o.winterPreis || 0)} je Einsatz</b>` : 'in der monatlichen Pauschale enthalten'}.</p>`) : ''}
    ${para('Mitwirkung des Auftraggebers', `<p>Der Auftraggeber stellt den Zugang zum Objekt sowie Wasser und Strom unentgeltlich zur Verfügung. Dem Auftragnehmer werden ${Number(v.schluessel) || 1} Schlüssel bzw. die Zugangscodes übergeben; der Auftragnehmer verwahrt sie sorgfältig und meldet einen Verlust unverzüglich.</p>`)}
    ${para('Haftung und Versicherung', `<p>Der Auftragnehmer haftet für Schäden, die er bei der Ausführung schuldhaft verursacht, nach den gesetzlichen Bestimmungen. Er unterhält eine Betriebshaftpflichtversicherung${v.versicherung ? ` (${esc(v.versicherung)})` : ''}.</p>`)}
    ${para('Laufzeit und Kündigung', `<p>Der Vertrag beginnt am <b>${v.beginn ? fmtDate(v.beginn) : '____________'}</b> und läuft auf unbestimmte Zeit. Er kann von beiden Seiten mit einer Frist von <b>${v.frist} Monat${Number(v.frist) === 1 ? '' : 'en'} zum Monatsende</b> in Textform gekündigt werden. Das Recht zur außerordentlichen Kündigung bleibt unberührt.</p>`)}
    ${para('Preisanpassung', '<p>Ändern sich die Kosten des Auftragnehmers (z. B. Löhne, Material, Energie), kann er die Vergütung mit einer Ankündigungsfrist von sechs Wochen angemessen anpassen. Der Auftraggeber kann in diesem Fall zum Zeitpunkt des Wirksamwerdens außerordentlich kündigen.</p>')}
    ${para('Schlussbestimmungen', '<p>Änderungen und Ergänzungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>')}
    <div class="sign-row">${signSlot(sigAG, 'Ort, Datum, Unterschrift Auftraggeber')}${signSlot(sigAN, `Ort, Datum, Unterschrift ${esc(S.firma)}`)}</div>
  </article>`;
}

route('/objekt/:id/vertrag', async ({ id }) => {
  const o = await DB.get('objects', id);
  if (!o) return go('#/objekte', true);
  const k = (await DB.get('customers', o.kundeId)) || { name: '' };
  const v = { ...DEFAULT_VERTRAG, beginn: addDays(lastOfMonth(today().slice(0, 7)), 1), ...o.vertrag };
  if (!v.versicherung) v.versicherung = S.versicherung || '';
  const keyAG = `vertrag_${id}_ag`;
  const keyAN = `vertrag_${id}_an`;
  const [sigAG, sigAN] = await Promise.all([DB.get('unterschriften', keyAG), DB.get('unterschriften', keyAN)]);
  render('Reinigungsvertrag', `
    <form class="card no-print form" id="vf">
      <div class="grid2">
        <label>Vertragsbeginn<input type="date" name="beginn" value="${esc(v.beginn)}"></label>
        <label>Kündigungsfrist<select name="frist">${[1, 2, 3, 6].map((m) => `<option value="${m}" ${Number(v.frist) === m ? 'selected' : ''}>${m} Monat${m === 1 ? '' : 'e'} zum Monatsende</option>`).join('')}</select></label>
      </div>
      <div class="grid3">
        <label>Schlüssel<input type="number" name="schluessel" min="0" value="${esc(v.schluessel)}"></label>
        <label>Winter werktags ab<input type="time" name="werktags" value="${esc(v.werktags)}"></label>
        <label>sonntags ab<input type="time" name="sonntags" value="${esc(v.sonntags)}"></label>
      </div>
      <label>Betriebshaftpflicht bei (optional)<input name="versicherung" value="${esc(v.versicherung)}" placeholder="z. B. Versicherung XY, Nr. 123"></label>
      ${docActionButtons(`<button type="button" class="btn ghost" id="signAG">✍️ ${sigAG ? 'Neu: ' : ''}Auftraggeber</button><button type="button" class="btn ghost" id="signAN">✍️ ${sigAN ? 'Neu: ' : ''}Ich</button>`)}
      <p class="muted small">Muster nach bestem Wissen – keine Rechtsberatung. Leistungen, Preis und Winterdienst kommen aus den Angaben beim Haus.</p>
    </form>
    <div class="doc-wrap" id="docWrap">${vertragDoc(o, k, v, sigAG, sigAN)}</div>
  `);
  $('#vf').addEventListener('change', async () => {
    const fd = new FormData($('#vf'));
    Object.assign(v, { beginn: fd.get('beginn'), frist: Number(fd.get('frist')), schluessel: Number(fd.get('schluessel')), werktags: fd.get('werktags'), sonntags: fd.get('sonntags'), versicherung: fd.get('versicherung').trim() });
    o.vertrag = v;
    await DB.put('objects', o);
    $('#docWrap').innerHTML = vertragDoc(o, k, v, sigAG, sigAN);
  });
  $('#vf').addEventListener('submit', (e) => e.preventDefault());
  const sign = (key, title, name) => async () => {
    const sig = await signaturePad(title, name);
    if (!sig) return;
    await DB.put('unterschriften', { id: key, ...sig });
    toast('✍️ Unterschrift gespeichert');
    router();
  };
  $('#signAG').addEventListener('click', sign(keyAG, 'Unterschrift Auftraggeber', k.ansprechpartner || ''));
  $('#signAN').addEventListener('click', sign(keyAN, 'Deine Unterschrift', S.inhaber));
  wireDocButtons(`Reinigungsvertrag ${objLabel(o)}`, `Guten Tag${k.ansprechpartner ? ` ${k.ansprechpartner}` : ''},\n\nanbei der Reinigungsvertrag für ${objLabel(o)}. Bitte unterschreiben und an mich zurücksenden.\n\nViele Grüße\n${S.inhaber}\n${S.firma}`);
});

/* ---------- Urlaub & Krankheit ---------- */
route('/abwesenheit', async () => {
  const data = await loadAll();
  render('Urlaub & Krankheit', `
    <form id="f" class="form">
      <div class="grid2">
        <label>Von<input type="date" name="von" required value="${today()}"></label>
        <label>Bis<input type="date" name="bis" required value="${addDays(today(), 6)}"></label>
      </div>
      <label>Grund<select name="grund"><option>Urlaub</option><option>Krankheit</option><option>Sonstiges</option></select></label>
      <div class="label">Was passiert mit den Terminen?</div>
      <div class="chip-row">
        <label class="chip toggle on"><input type="radio" name="aktion" value="nachholen" checked hidden>🔁 Nach der Abwesenheit nachholen</label>
        <label class="chip toggle"><input type="radio" name="aktion" value="ausfallen" hidden>✖️ Ausfallen lassen</label>
      </div>
      <div id="preview"></div>
      <button class="btn block" type="submit" id="apply">Termine anpassen</button>
    </form>
    <div id="result"></div>
  `);
  const f = $('#f');
  const affected = () => data.appointments.filter((a) => !a.erledigt && a.datum >= f.von.value && a.datum <= f.bis.value).sort((a, b) => a.datum.localeCompare(b.datum));
  const newDate = (a) => { const o = data.omap[a.objektId]; return snapWeekday(addDays(f.bis.value, 1), o?.wochentag); };
  const preview = () => {
    const list = affected();
    const nach = f.aktion.value === 'nachholen';
    $('#preview').innerHTML = list.length
      ? `<div class="card"><b>${list.length} Termin${list.length === 1 ? '' : 'e'} betroffen</b>${list.map((a) => `<div class="small">🏢 ${esc(objLabel(data.omap[a.objektId]))}: ${fmtDateLong(a.datum)} ${nach ? `→ <b>${fmtDateLong(newDate(a))}</b>` : '→ <span class="danger-text">entfällt</span>'}</div>`).join('')}</div>`
      : '<p class="muted small">In diesem Zeitraum sind keine Termine eingetragen.</p>';
  };
  f.addEventListener('change', (e) => {
    if (e.target.name === 'aktion') $$('.chip', f).forEach((c) => c.classList.toggle('on', $('input', c).checked));
    preview();
  });
  preview();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const list = affected();
    if (!list.length) return toast('Keine Termine im Zeitraum');
    const nach = f.aktion.value === 'nachholen';
    const grund = f.grund.value;
    const changes = [];
    for (const a of list) {
      const target = newDate(a);
      const clash = data.appointments.some((x) => x !== a && !x.erledigt && x.objektId === a.objektId && Math.abs(daysBetween(x.datum, target)) < 3);
      if (nach && !clash) {
        changes.push({ a, alt: a.datum, neu: target });
        a.datum = target;
        a.notiz = [a.notiz, `Nachholtermin (${grund})`].filter(Boolean).join(' · ');
        await DB.put('appointments', a);
      } else {
        changes.push({ a, alt: a.datum, neu: null });
        await DB.del('appointments', a.id);
      }
    }
    scheduleNotifications(true);
    const byCustomer = {};
    changes.forEach((c) => { const kid = data.omap[c.a.objektId]?.kundeId; (byCustomer[kid] ||= []).push(c); });
    const messages = Object.entries(byCustomer).map(([kid, cs]) => {
      const k = data.kmap[kid] || { name: 'Auftraggeber' };
      const text = [`Guten Tag${k.ansprechpartner ? ` ${k.ansprechpartner}` : ''},`, '',
        `wegen ${grund === 'Krankheit' ? 'Krankheit' : grund === 'Urlaub' ? 'Urlaub' : 'einer Abwesenheit'} bin ich vom ${fmtDate(f.von.value)} bis ${fmtDate(f.bis.value)} nicht im Einsatz.`, '',
        ...cs.map((c) => `• ${objLabel(data.omap[c.a.objektId])}: Reinigung vom ${fmtDate(c.alt)} ${c.neu ? `wird am ${fmtDateLong(c.neu)} nachgeholt` : 'entfällt'}.`), '',
        'Vielen Dank für Ihr Verständnis!', '', 'Viele Grüße', S.inhaber, S.firma].join('\n');
      return { k, text };
    });
    $('#result').innerHTML = `<h3 class="section">📣 Auftraggeber informieren</h3>${messages.map((m, i) => `<div class="card"><b>👥 ${esc(m.k.name)}</b><pre class="msg">${esc(m.text)}</pre><button class="btn small" data-msg="${i}">📤 Nachricht senden</button></div>`).join('')}`;
    $('#result').addEventListener('click', (ev) => { const b = ev.target.closest('[data-msg]'); if (b) shareText(messages[b.dataset.msg].text, 'Terminänderung'); });
    $('#apply').disabled = true;
    toast(`✓ ${changes.length} Termine angepasst`);
    $('#result').scrollIntoView({ behavior: 'smooth' });
  });
});

/* ---------- Preisanpassung ---------- */
route('/preise', async () => {
  const data = await loadAll();
  const objs = data.objects.filter((o) => o.aktiv !== false && isMonthly(o));
  const pending = data.objects.filter((o) => o.neuerPreis);
  const firstAfter = (days) => addDays(lastOfMonth(addDays(today(), days).slice(0, 7)), 1);
  render('Preisanpassung', `
    ${pending.length ? `<h3 class="section">Angekündigt</h3>${[...new Set(pending.map((o) => o.kundeId))].map((kid) => `<div class="card">
      <b>👥 ${esc(kundeName(data.kmap, kid))}</b>
      ${pending.filter((o) => o.kundeId === kid).map((o) => `<div class="small">🏢 ${esc(objLabel(o))}: ${money(o.monatspauschale)} → <b>${money(o.neuerPreis.betrag)}</b> ab ${fmtDate(o.neuerPreis.ab)} <button class="icon-btn" data-cancel="${o.id}" aria-label="Zurücknehmen">✕</button></div>`).join('')}
      <a class="btn small mt" href="#/preise/schreiben/${kid}">📄 Anschreiben</a></div>`).join('')}` : ''}
    <form id="f" class="form">
      <h3 class="section">Neue Anpassung</h3>
      <div class="grid3">
        <label>Erhöhung (%)<input name="prozent" type="number" step="0.5" value="5" inputmode="decimal"></label>
        <label>Runden auf<select name="rund"><option value="100">1 €</option><option value="500" selected>5 €</option></select></label>
        <label>Gültig ab<input type="date" name="ab" value="${firstAfter(42)}"></label>
      </div>
      <p class="muted small">Tipp: Mindestens 6 Wochen vorher ankündigen. Bis zum Stichtag wird der alte Preis berechnet, danach automatisch der neue.</p>
      <div id="rows"></div>
      <button class="btn block" type="submit">Preise ankündigen</button>
    </form>
  `);
  const f = $('#f');
  const draw = () => {
    const pct = num(f.prozent.value);
    const r = Number(f.rund.value);
    $('#rows').innerHTML = objs.map((o) => {
      const neu = Math.ceil(((o.monatspauschale || 0) * (1 + pct / 100)) / r) * r;
      return `<label class="card price-row"><input type="checkbox" name="obj" value="${o.id}" checked>
        <span><b>🏢 ${esc(objLabel(o))}</b><br><span class="muted small">${esc(kundeName(data.kmap, o.kundeId))} · bisher ${money(o.monatspauschale || 0)}</span></span>
        <input type="number" step="0.01" class="neu" data-o="${o.id}" value="${centsInput(neu)}" aria-label="Neuer Preis"></label>`;
    }).join('') || '<div class="empty small">Keine Häuser mit Monatspauschale.</div>';
  };
  f.prozent.addEventListener('input', draw);
  f.rund.addEventListener('change', draw);
  draw();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = new FormData(f).getAll('obj');
    if (!ids.length) return;
    if (!confirm(`Neue Preise für ${ids.length} ${ids.length === 1 ? 'Haus' : 'Häuser'} ab ${fmtDate(f.ab.value)} ankündigen?`)) return;
    for (const id of ids) {
      const o = data.omap[id];
      o.neuerPreis = { ab: f.ab.value, betrag: toCents($(`.neu[data-o="${id}"]`).value), alt: o.monatspauschale };
      await DB.put('objects', o);
    }
    toast('✓ Preisanpassung angekündigt');
    router();
  });
  onView('click', async (e) => {
    const c = e.target.closest('[data-cancel]');
    if (!c) return;
    const o = data.omap[c.dataset.cancel];
    delete o.neuerPreis;
    await DB.put('objects', o);
    router();
  });
});

route('/preise/schreiben/:kid', async ({ kid }) => {
  const [k, objects] = await Promise.all([DB.get('customers', kid), DB.by('objects', 'kundeId', kid)]);
  const objs = objects.filter((o) => o.neuerPreis);
  if (!k || !objs.length) return go('#/preise', true);
  const ab = objs.map((o) => o.neuerPreis.ab).sort()[0];
  render('Anschreiben', `
    <div class="card no-print">${docActionButtons()}</div>
    <div class="doc-wrap"><article class="invoice-doc">
      ${docHeader()}
      <div class="inv-row">${recipientBlock(k)}<table class="inv-meta"><tr><td>Datum</td><td>${fmtDate(today())}</td></tr></table></div>
      <h2 class="inv-title">Anpassung der Vergütung <span>ab ${fmtDate(ab)}</span></h2>
      <p>Sehr geehrte Damen und Herren${k.ansprechpartner ? `, sehr geehrte/r ${esc(k.ansprechpartner)}` : ''},</p>
      <p>vielen Dank für die gute Zusammenarbeit. Gestiegene Kosten für Löhne, Reinigungsmittel und Fahrten machen eine Anpassung der monatlichen Vergütung notwendig. Ab dem ${fmtDate(ab)} gelten folgende Preise:</p>
      <table class="inv-items">
        <thead><tr><th>Objekt</th><th class="r">bisher / Monat</th><th class="r">neu / Monat</th></tr></thead>
        <tbody>${objs.map((o) => `<tr><td>${esc(objAddress(o) || objLabel(o))}</td><td class="r">${money(o.monatspauschale || 0)}</td><td class="r"><b>${money(o.neuerPreis.betrag)}</b></td></tr>`).join('')}</tbody>
      </table>
      <p>Der Leistungsumfang bleibt unverändert. Gemäß § 19 UStG wird weiterhin keine Umsatzsteuer berechnet.</p>
      <p>Sollten Sie mit der Anpassung nicht einverstanden sein, können Sie den Vertrag zum Zeitpunkt des Wirksamwerdens kündigen. Über eine kurze Bestätigung freue ich mich – und auf die weitere Zusammenarbeit!</p>
      <p>Mit freundlichen Grüßen<br>${esc(S.inhaber)}</p>
      ${docFooter()}
    </article></div>
  `);
  wireDocButtons(`Preisanpassung ${k.name}`, `Guten Tag${k.ansprechpartner ? ` ${k.ansprechpartner}` : ''},\n\nanbei meine Mitteilung zur Anpassung der Vergütung ab ${fmtDate(ab)}.\n\nViele Grüße\n${S.inhaber}\n${S.firma}`);
});
