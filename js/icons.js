'use strict';

/* ---------- Icons statt Emojis ----------
   Schlichte Linien-Icons (nach Feather Icons, MIT-Lizenz) in der Markenfarbe bzw. Textfarbe.
   Emojis im Text werden beim Anzeigen automatisch durch das passende Icon ersetzt.
   In Dokumenten (Rechnung, Angebot, Vertrag …) werden Emojis nur entfernt. */

const ICON_PFADE = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  snow: '<line x1="12" y1="2" x2="12" y2="22"/><line x1="3.3" y1="7" x2="20.7" y2="17"/><line x1="3.3" y1="17" x2="20.7" y2="7"/><path d="M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  fileEdit: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l5-5 2 2-5 5H9z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  checkSquare: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.6 1.4L21 17l-1.4.6L19 19l-.6-1.4L17 17l1.4-.6z"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  euro: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5"/><line x1="4" y1="10" x2="13" y2="10"/><line x1="4" y1="14" x2="13" y2="14"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.74V16h8v-1.26A7 7 0 0 0 12 2z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  barChart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  trendUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M11.4 11.6L21 2M17 6l3 3M14.5 8.5l2 2"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  bank: '<path d="M2 10l10-7 10 7z"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9M3 21h18"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
};

// Emoji → Icon. Nicht aufgeführte Emojis werden entfernt.
const EMOJI_ICON = {
  '🏢': 'building', '🏠': 'home', '🏛️': 'bank', '🏦': 'bank',
  '🧾': 'receipt', '💶': 'euro', '💰': 'euro', '💸': 'euro',
  '❄️': 'snow', '🌨️': 'snow', '🌧️': 'cloud', '🌤️': 'sun',
  '⚠️': 'alert', '🚨': 'alertCircle', '❓': 'info', 'ℹ️': 'info',
  '📝': 'fileEdit', '✏️': 'edit', '✍️': 'edit',
  '📄': 'file', '📜': 'file', '📒': 'book', '📖': 'book', '🧮': 'file',
  '🎉': 'checkCircle', '✅': 'checkCircle', '👍': 'check', '✔️': 'check',
  '⏰': 'clock', '⏱️': 'clock',
  '📷': 'camera', '🖼️': 'image',
  '👥': 'users', '🤝': 'users', '👤': 'user', '🗣️': 'user',
  '🧽': 'checkSquare', '✨': 'spark', '🚀': 'zap',
  '📅': 'calendar', '🗓️': 'calendar', '📆': 'calendar',
  '📤': 'share', '💡': 'bulb', '📞': 'phone', '📱': 'smartphone',
  '🔎': 'search', '🚗': 'truck', '🚐': 'truck',
  '📌': 'pin', '📍': 'pin', '🧭': 'navigation',
  '▶️': 'play', '⏹': 'stop', '🛒': 'cart',
  '📊': 'barChart', '⚖️': 'barChart', '📈': 'trendUp',
  '🌐': 'globe', '➕': 'plus',
  '✉️': 'mail', '📨': 'mail', '💌': 'mail', '📣': 'message', '💬': 'message',
  '🖨️': 'printer', '💾': 'download', '⬇️': 'download', '⬆️': 'upload',
  '🔒': 'lock', '🔐': 'lock', '📋': 'clipboard',
  '⚙️': 'settings', '🔧': 'settings',
  '🧴': 'droplet', '🧂': 'package', '📦': 'package',
  '🔑': 'key', '🎯': 'target', '🎤': 'mic', '🔁': 'repeat',
  '🏆': 'star', '⭐': 'star', '🏷️': 'tag', '🔔': 'bell', '✖️': 'x',
  '💻': 'monitor', '🛡️': 'shield', '🦺': 'shield', '🏥': 'shield',
  '🗑️': 'trash', '☕': 'coffee', '🏖️': 'sun',
};

const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*️?/gu;
const KEIN_EMOJI = new Set(['☐', '☑', '☒', '©', '®', '™']);
const iconCache = {};

function icon(name, klasse = '') {
  const pfad = ICON_PFADE[name];
  if (!pfad) return '';
  return `<svg class="ic${klasse ? ` ${klasse}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pfad}</svg>`;
}

function iconNode(name) {
  if (!iconCache[name]) {
    const t = document.createElement('template');
    t.innerHTML = icon(name);
    iconCache[name] = t.content.firstChild;
  }
  return iconCache[name].cloneNode(true);
}

const normEmoji = (e) => (EMOJI_ICON[e] ? e : EMOJI_ICON[`${e}️`] ? `${e}️` : e.replace(/️/g, ''));

// Ein Textknoten: Emojis durch Icons ersetzen (bzw. in Dokumenten und Auswahllisten entfernen)
function ersetzeEmojis(text) {
  const s = text.nodeValue;
  if (!s || !EMOJI_RE.test(s)) return;
  EMOJI_RE.lastIndex = 0;
  const el = text.parentElement;
  if (!el || el.closest('script, style, textarea, .no-icons')) return;
  const nurEntfernen = el.closest('.invoice-doc, option, select, title, svg');
  const teile = [];
  let pos = 0;
  for (const m of s.matchAll(EMOJI_RE)) {
    if (KEIN_EMOJI.has(m[0])) continue;
    teile.push(s.slice(pos, m.index));
    const name = EMOJI_ICON[normEmoji(m[0])];
    teile.push(nurEntfernen ? null : name || null);
    pos = m.index + m[0].length;
  }
  if (!teile.length) return;
  teile.push(s.slice(pos));
  // Bei entfernten Emojis kein doppeltes Leerzeichen stehen lassen
  for (let i = 1; i < teile.length; i += 2) {
    if (teile[i] !== null) continue;
    const davor = teile[i - 1];
    if (!davor.trim() || /\s$/.test(davor)) teile[i + 1] = teile[i + 1].replace(/^\s+/, '');
  }
  if (nurEntfernen) {
    text.nodeValue = teile.filter((t, i) => i % 2 === 0).join('');
    return;
  }
  const frag = document.createDocumentFragment();
  teile.forEach((t, i) => {
    if (i % 2 === 0) { if (t) frag.appendChild(document.createTextNode(t)); } else if (t) frag.appendChild(iconNode(t));
  });
  text.replaceWith(frag);
}

function iconsIn(root) {
  if (!root) return;
  if (root.nodeType === 3) return ersetzeEmojis(root);
  if (root.nodeType !== 1) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texte = [];
  while (walker.nextNode()) texte.push(walker.currentNode);
  texte.forEach(ersetzeEmojis);
}

// Feste Icons im Gerüst (Navigation, Kopfzeile) über data-icon
function festeIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => { if (!el.querySelector('svg')) el.innerHTML = icon(el.dataset.icon); });
}

// Reiner Text ohne Emojis (Dialoge, Benachrichtigungen)
const ohneEmoji = (t) => String(t ?? '').replace(EMOJI_RE, (e) => (KEIN_EMOJI.has(e) ? e : '')).replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+/gm, '').trim();
['alert', 'confirm', 'prompt'].forEach((fn) => {
  const original = window[fn].bind(window);
  window[fn] = (msg, ...rest) => original(ohneEmoji(msg), ...rest);
});

(function iconsStarten() {
  festeIcons();
  iconsIn(document.body);
  new MutationObserver((mutationen) => {
    for (const m of mutationen) {
      if (m.type === 'characterData') ersetzeEmojis(m.target);
      else m.addedNodes.forEach(iconsIn);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
