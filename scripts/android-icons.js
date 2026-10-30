// Erzeugt App-Icons (Web + Android) und Splash-Screens aus icons/icon.svg
// Aufruf: node scripts/android-icons.js   (benötigt playwright)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const res = path.join(__dirname, '..', 'android/app/src/main/res');
const svg = fs.readFileSync(path.join(__dirname, '..', 'icons/icon.svg'), 'utf8');
// Eckiges Icon (Android/iOS runden selbst ab)
const square = svg.replace('rx="112"', 'rx="0"');
// Adaptives Icon: Hintergrund randlos, Motiv etwas kleiner in der sicheren Zone
const bgGroup = square.match(/<g id="bg">[\s\S]*?<\/g>/)[0];
const adaptive = square.replace(bgGroup, '§BG§').replace(/(<\/defs>)([\s\S]*)(<\/svg>)/, (m, a, body, z) =>
  `${a}${body.replace('§BG§', '§BG§<g transform="translate(64 64) scale(.75)">')}</g>${z}`).replace('§BG§', bgGroup);
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (file, w, h, html) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
      .c{width:100%;height:100%;display:flex;align-items:center;justify-content:center}</style>${html}`);
    await page.screenshot({ path: file, omitBackground: true });
  };
  for (const size of [192, 512]) {
    await shot(path.join(__dirname, '..', `icons/icon-${size}.png`), size, size, square.replace('<svg', `<svg width="${size}" height="${size}"`));
  }
  for (const [d, f] of Object.entries(dens)) {
    const dir = path.join(res, `mipmap-${d}`);
    const s = Math.round(48 * f);
    await shot(path.join(dir, 'ic_launcher.png'), s, s, `<div class="c">${svg.replace('<svg', `<svg width="${s}" height="${s}"`)}</div>`);
    await shot(path.join(dir, 'ic_launcher_round.png'), s, s,
      `<div class="c" style="border-radius:50%;overflow:hidden">${square.replace('<svg', `<svg width="${s}" height="${s}"`)}</div>`);
    const fg = Math.round(108 * f);
    await shot(path.join(dir, 'ic_launcher_foreground.png'), fg, fg, `<div class="c">${adaptive.replace('<svg', `<svg width="${fg}" height="${fg}"`)}</div>`);
  }
  // Kleines, einfarbiges Symbol für Benachrichtigungen (Android färbt es selbst ein)
  const stat = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v4h-6v12h-4V8H4z" fill="#fff"/><path d="M19.5 10.5q.5 2 2.5 2.5q-2 .5-2.5 2.5q-.5-2-2.5-2.5q2-.5 2.5-2.5z" fill="#fff"/></svg>`;
  for (const [d, f] of Object.entries(dens)) {
    const dir = path.join(res, `drawable-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    const s = Math.round(24 * f);
    await shot(path.join(dir, 'ic_stat_toths.png'), s, s, stat.replace('<svg', `<svg width="${s}" height="${s}"`));
  }
  // Splash-Screens: Markenfarbe mit Logo und Namen
  for (const dir of fs.readdirSync(res).filter((n) => n.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const logo = Math.round(Math.min(w, h) * 0.3);
    await shot(file, w, h, `<div class="c" style="background:linear-gradient(160deg,#14b8a6,#0f766e 45%,#134e4a);flex-direction:column;gap:${logo * 0.15}px;font-family:sans-serif;color:#fff">
      ${svg.replace('<svg', `<svg width="${logo}" height="${logo}"`)}
      <div style="font-size:${logo * 0.16}px;font-weight:600">Toths Reinigungsservice</div></div>`);
  }
  await browser.close();
  console.log('Android-Icons und Splash-Screens erzeugt');
})();
