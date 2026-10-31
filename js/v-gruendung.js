'use strict';

/* ---------- Gründungs-Checkliste ---------- */
const ort = () => (S.plzOrt || '').replace(/^\d{4,5}\s*/, '').trim();
const search = (q) => `https://www.google.com/search?q=${encodeURIComponent(`${q} ${ort()}`.trim())}`;

// Schritte in sinnvoller Reihenfolge. field: Eingabe, die direkt in die App-Einstellungen übernommen wird.
const GRUENDUNG = [
  {
    id: 'hwk', icon: '📞', title: 'Handwerkskammer anrufen', tag: 'zuerst',
    text: `<p>Kläre vor der Gewerbeanmeldung, ob deine Tätigkeit eine Eintragung braucht. Beschreib genau, was du machst:</p>
      <ul><li>Treppenhausreinigung in Mehrfamilienhäusern</li><li>Winterdienst, Mülltonnen-Service, Außenbereich</li></ul>
      <p>Frag: <i>„Brauche ich eine Eintragung?“</i> und <i>„Wie formuliere ich die Tätigkeit bei der Gewerbeanmeldung?“</i> – und lass dir die Antwort am besten per E-Mail bestätigen. Viele Kammern bieten eine kostenlose Gründungsberatung.</p>`,
    links: [['🔎 Handwerkskammer finden', () => search('Handwerkskammer')]],
    field: { key: 'hwkErgebnis', label: 'Ergebnis', type: 'select', options: ['noch offen', 'Eintragung nötig', 'keine Eintragung nötig'] },
  },
  {
    id: 'hwkEintrag', icon: '📝', title: 'Eintragung bei der Handwerkskammer', tag: 'falls nötig',
    when: (g) => g.hwkErgebnis === 'Eintragung nötig',
    text: '<p>Für ein zulassungsfreies Handwerk brauchst du keinen Meister – es ist eine Eintragung ohne Prüfung. Die Kammer schickt dir die Unterlagen. Der Beitrag ist für Gründer oft reduziert.</p>',
  },
  {
    id: 'gewerbe', icon: '🏛️', title: 'Gewerbe anmelden', tag: 'Pflicht',
    text: `<p>Beim Gewerbeamt deiner Gemeinde – oft online, Kosten meist 20–60 €. Trag die Tätigkeit so ein, wie mit der Kammer besprochen.</p>
      <p>Auf Rechnungen und Briefen muss dein <b>voller Vor- und Nachname</b> stehen; „Toths Reinigungsservice“ ist der Zusatz. Die App druckt das automatisch so.</p>`,
    links: [['🔎 Gewerbeanmeldung online', () => search('Gewerbeanmeldung online')]],
    field: { key: 'beginn', setting: 'betriebsstart', label: 'Gewerbebeginn (Startdatum)', type: 'date' },
  },
  {
    id: 'elster', icon: '🔐', title: 'ELSTER-Konto anlegen', tag: 'früh starten',
    text: '<p>Für das Finanzamt brauchst du ein ELSTER-Konto. Die Freischaltung kommt per Post und dauert oft 1–2 Wochen – also direkt beantragen.</p>',
    links: [['🌐 elster.de', () => 'https://www.elster.de']],
  },
  {
    id: 'finanzamt', icon: '🧾', title: 'Fragebogen zur steuerlichen Erfassung', tag: 'Pflicht', deadline: { from: 'beginn', days: 30 },
    text: `<p>Über ELSTER innerhalb eines Monats nach Gewerbebeginn einreichen. <b>Kleinunternehmerregelung (§ 19 UStG) ankreuzen</b> – dann berechnest du keine Umsatzsteuer.</p>
      <p>Danach bekommst du deine <b>Steuernummer</b> – trag sie hier ein, sie steht dann automatisch auf jeder Rechnung.</p>`,
    links: [['🌐 elster.de', () => 'https://www.elster.de']],
    field: { key: 'steuernummer', label: 'Steuernummer', type: 'text', setting: 'steuernummer', placeholder: 'z. B. 12/345/67890' },
  },
  {
    id: 'bg', icon: '🦺', title: 'Berufsgenossenschaft BG BAU', tag: 'Pflicht', deadline: { from: 'beginn', days: 7 },
    text: '<p>Die BG BAU ist für die Gebäudereinigung zuständig. Die Anmeldung des Betriebs ist Pflicht – innerhalb einer Woche nach Beginn. Frag dort, ob und wie du selbst gegen Arbeitsunfälle versichert bist.</p>',
    links: [['🌐 bgbau.de', () => 'https://www.bgbau.de']],
    field: { key: 'bgNummer', label: 'Mitgliedsnummer', type: 'text' },
  },
  {
    id: 'kasse', icon: '🏥', title: 'Krankenkasse informieren', tag: 'Pflicht',
    text: `<ul><li><b>Nebenberuflich</b> (mit Hauptjob): meist ändert sich nichts – trotzdem melden.</li>
      <li><b>Hauptberuflich</b>: du versicherst dich selbst (freiwillig gesetzlich oder privat). Lass dich vorher beraten – das sind schnell mehrere hundert Euro im Monat.</li></ul>`,
    field: { key: 'kasseArt', label: 'Ich mache das', type: 'select', options: ['nebenberuflich', 'hauptberuflich'] },
  },
  {
    id: 'haftpflicht', icon: '🛡️', title: 'Betriebshaftpflicht abschließen', tag: 'vor dem 1. Auftrag',
    text: `<p>Achte darauf, dass enthalten ist:</p>
      <ul><li><b>Schlüsselverlust</b> – ein verlorener Generalschlüssel kann den Austausch einer ganzen Schließanlage kosten</li><li><b>Winterdienst</b> – falls du räumst und streust</li></ul>
      <p>Hausverwaltungen fragen oft nach dem Nachweis. Der Versicherer erscheint automatisch im Reinigungsvertrag.</p>`,
    links: [['🔎 Angebote vergleichen', () => `https://www.google.com/search?q=${encodeURIComponent('Betriebshaftpflicht Gebäudereinigung Schlüsselverlust Winterdienst')}`]],
    field: { key: 'versicherung', label: 'Versicherer & Nummer', type: 'text', setting: 'versicherung', placeholder: 'z. B. Versicherung XY, Nr. 123' },
  },
  {
    id: 'konto', icon: '🏦', title: 'Eigenes Geschäftskonto', tag: 'empfohlen',
    text: '<p>Keine Pflicht für Einzelunternehmer, macht Buchhaltung und Steuer aber viel einfacher. Die IBAN steht dann automatisch auf deinen Rechnungen.</p>',
    field: { key: 'iban', label: 'IBAN', type: 'text', setting: 'iban', placeholder: 'DE…' },
  },
  {
    id: 'app', icon: '📱', title: 'Firmendaten in der App eintragen', tag: 'automatisch',
    auto: () => settingsComplete(),
    text: '<p>Name, Anschrift und Steuernummer – dann kannst du Rechnungen schreiben. Wird automatisch abgehakt, sobald alles da ist.</p>',
    links: [['⚙️ Zu den Einstellungen', () => '#/einstellungen']],
  },
  {
    id: 'website', icon: '🌐', title: 'Website online stellen', tag: 'empfohlen',
    text: '<p>Die Website ist fertig – es fehlen nur deine Kontaktdaten (Name, Adresse, Telefon, E-Mail, Region). Schick sie an Claude, dann wird sie startklar gemacht.</p>',
  },
  {
    id: 'google', icon: '📍', title: 'Google-Unternehmensprofil', tag: 'empfohlen',
    text: '<p>Kostenlos – damit dich Hausverwaltungen bei „Treppenhausreinigung + Stadt“ finden. Bitte zufriedene Kunden später um eine Bewertung.</p>',
    links: [['🌐 Profil anlegen', () => 'https://www.google.com/business/']],
  },
];

const gState = () => (S.gruendung ||= {});
const visibleSteps = () => GRUENDUNG.filter((s) => !s.when || s.when(gState()));
const isDone = (s) => (s.auto ? s.auto() : !!gState()[s.id]?.done);
const gruendungProgress = () => { const v = visibleSteps(); return { done: v.filter(isDone).length, total: v.length }; };

function deadlineInfo(s) {
  if (!s.deadline || isDone(s)) return '';
  // Der Gewerbebeginn ist das Startdatum in den Einstellungen
  const base = s.deadline.from === 'beginn' ? S.betriebsstart : gState()[s.deadline.from];
  if (!base) return '';
  const due = addDays(base, s.deadline.days);
  const d = daysBetween(today(), due);
  return `<span class="badge ${d < 0 ? 'bad' : d <= 7 ? 'warn' : 'soft'}">${d < 0 ? `seit ${-d} Tagen überfällig` : `bis ${fmtDate(due)}`}</span>`;
}

route('/gruendung', async () => {
  const g = gState();
  const { done, total } = gruendungProgress();
  const fieldHtml = (s) => {
    const f = s.field;
    if (!f) return '';
    const val = f.setting ? S[f.setting] ?? '' : g[f.key] ?? '';
    const input = f.type === 'select'
      ? `<select data-field="${s.id}">${f.options.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : `<input data-field="${s.id}" type="${f.type}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}">`;
    return `<label class="g-field">${f.label}${input}</label>`;
  };

  render('Gründung', `
    <div class="card g-head">
      <div class="row between"><b>🚀 Dein Weg zum eigenen Gewerbe</b><b>${done}/${total}</b></div>
      <div class="bar"><div style="width:${(done / total) * 100}%"></div></div>
      <div class="muted small">${done === total ? '🎉 Alles erledigt – du bist offiziell startklar!' : 'Tippe einen Schritt an für Details. Fristen berechnen sich aus deinem Gewerbebeginn.'}</div>
    </div>
    <div class="g-steps">
      ${visibleSteps().map((s, i) => `<details class="card g-step ${isDone(s) ? 'done' : ''}" data-id="${s.id}" ${!isDone(s) && visibleSteps().findIndex((x) => !isDone(x)) === i ? 'open' : ''}>
        <summary>
          <button type="button" class="g-check" data-check="${s.id}" aria-label="Erledigt" ${s.auto ? 'disabled' : ''}>${isDone(s) ? '✓' : ''}</button>
          <span class="g-title"><span>${s.icon} ${esc(s.title)}</span><span class="g-tags"><span class="badge soft">${esc(s.tag)}</span>${deadlineInfo(s)}${g[s.id]?.datum ? `<span class="muted small">erledigt ${fmtDate(g[s.id].datum)}</span>` : ''}</span></span>
        </summary>
        <div class="g-body">
          ${s.text}
          ${fieldHtml(s)}
          ${s.links ? `<div class="row gap">${s.links.map(([label, url]) => { const u = url(); return `<a class="btn small ghost" href="${esc(u)}" ${u.startsWith('#') ? '' : 'target="_blank" rel="noopener"'}>${label}</a>`; }).join('')}</div>` : ''}
          <label class="g-field">Notiz<textarea data-note="${s.id}" rows="2" placeholder="z. B. Ansprechpartner, Aktenzeichen, Rückruf am …">${esc(g[s.id]?.notiz || '')}</textarea></label>
        </div>
      </details>`).join('')}
    </div>
    <p class="muted small">Allgemeine Hinweise, keine Rechts- oder Steuerberatung. Verbindliche Auskünfte geben Gewerbeamt, Kammer, Finanzamt und BG.</p>
  `);

  const save = () => saveSettings();
  onView('click', async (e) => {
    const btn = e.target.closest('[data-check]');
    if (!btn) return;
    e.preventDefault();
    const s = GRUENDUNG.find((x) => x.id === btn.dataset.check);
    const st = (g[s.id] ||= {});
    st.done = !st.done;
    st.datum = st.done ? today() : null;
    await save();
    vibrate(st.done ? 15 : 5);
    const p = gruendungProgress();
    if (st.done && p.done === p.total) { confetti(); toast('🎉 Geschafft – du bist startklar!'); }
    else if (st.done) toast(`✓ ${s.title}`);
    router();
  });
  onView('change', async (e) => {
    const id = e.target.dataset.field;
    if (!id) return;
    const s = GRUENDUNG.find((x) => x.id === id);
    const val = e.target.value.trim();
    if (s.field.setting) S[s.field.setting] = s.field.setting === 'iban' ? val.toUpperCase().replace(/\s+/g, '') : val;
    else g[s.field.key] = val;
    // Ein eingetragener Wert hakt den Schritt mit ab (außer bei „noch offen“)
    if (val && val !== 'noch offen' && s.field.type !== 'select' && !g[s.id]?.done) g[s.id] = { ...g[s.id], done: true, datum: today() };
    if (s.id === 'hwk' && val !== 'noch offen' && !g.hwk?.done) g.hwk = { ...g.hwk, done: true, datum: today() };
    await save();
    toast('✓ Gespeichert');
    if (s.id === 'hwk' || s.id === 'gewerbe' || !e.target.closest('.g-step').classList.contains('done')) router();
  });
  onView('input', (e) => {
    const id = e.target.dataset.note;
    if (!id) return;
    (g[id] ||= {}).notiz = e.target.value;
    clearTimeout(save.t);
    save.t = setTimeout(save, 600);
  });
});
