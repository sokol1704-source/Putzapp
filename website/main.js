'use strict';

// ===== Kontaktdaten – hier eintragen (Telefon und WhatsApp mit Ländervorwahl, nur Ziffern) =====
const KONTAKT = {
  telefon: '',        // z. B. '491701234567'
  whatsapp: '',       // z. B. '491701234567'
  email: '',          // z. B. 'info@toths-reinigung.de'
};
// Richtwerte für den Preis-Schnellcheck (Euro je Reinigung)
// Gleiche Richtwerte wie in der App (Angebotsrechner), je Reinigung in Euro
const PREISE = { proEtage: 12, aufzug: 8, keller: 15, aussen: 10, muellplatz: 7, dachboden: 10, winterJeEinsatz: 25 };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const euro = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Kontakt-Links setzen (solange nichts eingetragen ist, springen sie zum Kontaktformular)
const links = {
  tel: KONTAKT.telefon && `tel:+${KONTAKT.telefon}`,
  wa: KONTAKT.whatsapp && `https://wa.me/${KONTAKT.whatsapp}`,
  mail: KONTAKT.email && `mailto:${KONTAKT.email}`,
};
$$('[data-link]').forEach((a) => {
  const href = links[a.dataset.link];
  if (!href) return;
  a.href = href;
  if (a.dataset.link === 'wa') { a.target = '_blank'; a.rel = 'noopener'; }
});

// Kopfzeile mit Schatten beim Scrollen
const header = $('.header');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });

// Einblenden beim Scrollen
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
$$('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

// Auswahl-Chips
document.addEventListener('change', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) chip.classList.toggle('on', e.target.checked);
});

// Preis-Schnellcheck
const calc = $('#calc');
let lastCalc = null;
function updatePrice() {
  const f = calc.elements;
  const etagen = Number(f.etagen.value);
  const eingaenge = Number(f.eingaenge.value);
  const intervall = Number(f.intervall.value);
  let jeReinigung = etagen * eingaenge * PREISE.proEtage;
  if (f.aufzug.checked) jeReinigung += PREISE.aufzug * eingaenge;
  if (f.keller.checked) jeReinigung += PREISE.keller;
  if (f.aussen.checked) jeReinigung += PREISE.aussen;
  if (f.muellplatz.checked) jeReinigung += PREISE.muellplatz;
  if (f.dachboden.checked) jeReinigung += PREISE.dachboden;
  const proMonat = Math.ceil((jeReinigung * (52 / 12) / (intervall / 7)) / 5) * 5;
  const target = $('#price');
  const from = Number(target.dataset.v || 0);
  target.dataset.v = proMonat;
  // Zahl kurz hochzählen lassen
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / 500);
    target.textContent = `ab ${euro(Math.round(from + (proMonat - from) * (1 - (1 - p) ** 3)))}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  $('#winterNote').textContent = f.winter.checked ? `Winterdienst zusätzlich: ca. ${euro(PREISE.winterJeEinsatz)} je Einsatz` : '';
  lastCalc = { etagen, eingaenge, intervall, proMonat, winter: f.winter.checked };
}
calc.addEventListener('change', updatePrice);
updatePrice();

$('#calcCta').addEventListener('click', () => {
  if (!lastCalc) return;
  const f = $('#anfrage').elements;
  f.etagen.value = lastCalc.etagen;
  f.rhythmus.value = { 7: 'wöchentlich', 14: 'alle 2 Wochen', 28: 'alle 4 Wochen' }[lastCalc.intervall];
  f.winter.checked = lastCalc.winter;
  f.winter.closest('.chip').classList.toggle('on', lastCalc.winter);
  if (!f.nachricht.value) f.nachricht.value = `Der Preis-Schnellcheck ergab ab ${euro(lastCalc.proMonat)} pro Monat (${lastCalc.etagen} Etagen, ${lastCalc.eingaenge === 1 ? "1 Eingang" : `${lastCalc.eingaenge} Eingänge`}).`;
});

// Anfrage per E-Mail oder WhatsApp (keine Speicherung auf der Website)
let via = 'mail';
$$('#anfrage [data-via]').forEach((b) => b.addEventListener('click', () => { via = b.dataset.via; }));
$('#anfrage').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const text = [
    'Anfrage Treppenhausreinigung', '',
    `Name: ${f.name.value}`,
    f.firma.value && `Firma / Hausverwaltung: ${f.firma.value}`,
    `Kontakt: ${f.kontakt.value}`,
    f.objekt.value && `Objekt: ${f.objekt.value}`,
    f.etagen.value && `Etagen: ${f.etagen.value}`,
    `Rhythmus: ${f.rhythmus.value}`,
    `Winterdienst: ${f.winter.checked ? 'ja' : 'nein'}`,
    f.nachricht.value && `\n${f.nachricht.value}`,
  ].filter(Boolean).join('\n');
  if (via === 'wa') {
    if (!KONTAKT.whatsapp) return alert('Die WhatsApp-Nummer ist noch nicht hinterlegt.');
    window.open(`https://wa.me/${KONTAKT.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  } else {
    if (!KONTAKT.email) return alert('Die E-Mail-Adresse ist noch nicht hinterlegt.');
    location.href = `mailto:${KONTAKT.email}?subject=${encodeURIComponent('Anfrage Treppenhausreinigung')}&body=${encodeURIComponent(text)}`;
  }
});

$('#year').textContent = new Date().getFullYear();
