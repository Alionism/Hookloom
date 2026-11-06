// Generates Android launcher icons and splash images from assets/icon.svg.
// Runs in CI after `npx cap add android`.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'));
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');

const sizes = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

(async () => {
  const adaptive = path.join(res, 'mipmap-anydpi-v26');
  if (fs.existsSync(adaptive)) fs.rmSync(adaptive, { recursive: true, force: true });

  for (const [folder, size] of Object.entries(sizes)) {
    const dir = path.join(res, folder);
    fs.mkdirSync(dir, { recursive: true });
    const square = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), square);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), square);
    const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + size / 2 + '" fill="#fff"/></svg>');
    const round = await sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), round);
  }

  const logo = await sharp(svg, { density: 300 }).resize(360, 360).png().toBuffer();
  const splash = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: '#0A0A14' } })
    .composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
  const splashes = walk(res, []).filter((f) => path.basename(f) === 'splash.png');
  if (!splashes.length) {
    const d = path.join(res, 'drawable');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'splash.png'), splash);
  }
  splashes.forEach((f) => fs.writeFileSync(f, splash));
  console.log('Icons and splash generated.');
})().catch((e) => { console.error(e); process.exit(1); });
