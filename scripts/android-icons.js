// Erzeugt App-Icons und Splash-Screens für Android aus icons/icon.svg
// Aufruf: node scripts/android-icons.js   (benötigt playwright)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const res = path.join(__dirname, '..', 'android/app/src/main/res');
const svg = fs.readFileSync(path.join(__dirname, '..', 'icons/icon.svg'), 'utf8');
// Nur das Motiv (ohne grünen Hintergrund) für das adaptive Icon
const glyph = svg.replace(/<rect[^>]*\/>/, '');
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
  for (const [d, f] of Object.entries(dens)) {
    const dir = path.join(res, `mipmap-${d}`);
    const s = Math.round(48 * f);
    await shot(path.join(dir, 'ic_launcher.png'), s, s, `<div class="c">${svg.replace('<svg', `<svg width="${s}" height="${s}"`)}</div>`);
    await shot(path.join(dir, 'ic_launcher_round.png'), s, s,
      `<div class="c" style="border-radius:50%;overflow:hidden">${svg.replace('rx="96"', 'rx="0"').replace('<svg', `<svg width="${s}" height="${s}"`)}</div>`);
    const fg = Math.round(108 * f);
    const inner = Math.round(fg * 0.62);
    await shot(path.join(dir, 'ic_launcher_foreground.png'), fg, fg, `<div class="c">${glyph.replace('<svg', `<svg width="${inner}" height="${inner}"`)}</div>`);
  }
  // Splash-Screens: Markenfarbe mit Logo und Namen
  for (const dir of fs.readdirSync(res).filter((n) => n.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const logo = Math.round(Math.min(w, h) * 0.3);
    await shot(file, w, h, `<div class="c" style="background:#0f766e;flex-direction:column;gap:${logo * 0.15}px;font-family:sans-serif;color:#fff">
      ${svg.replace('<svg', `<svg width="${logo}" height="${logo}"`)}
      <div style="font-size:${logo * 0.16}px;font-weight:600">Toths Reinigungsservice</div></div>`);
  }
  await browser.close();
  console.log('Android-Icons und Splash-Screens erzeugt');
})();
