// Copies the Vazirmatn variable web font into www/fonts so the app looks right offline.
// Safe to fail: the CSS falls back to system Arabic/Persian fonts.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const base = path.join(root, 'node_modules', 'vazirmatn');
const out = path.join(root, 'www', 'fonts');

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

const all = walk(base, []).filter((f) => f.toLowerCase().endsWith('.woff2'));
const pick =
  all.find((f) => /wght/i.test(path.basename(f)) && !/(arabic|latin)/i.test(path.basename(f)) && /webfonts/i.test(f)) ||
  all.find((f) => /wght/i.test(path.basename(f))) ||
  all.find((f) => /regular/i.test(path.basename(f))) ||
  all[0];

if (!pick) {
  console.warn('Vazirmatn font not found; using system fonts.');
  process.exit(0);
}
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(pick, path.join(out, 'vazirmatn.woff2'));
console.log('Font copied:', path.relative(root, pick));
