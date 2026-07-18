/**
 * Zip chrome-extension for Chrome Web Store upload.
 * Output: release/speedread-extension-vX.Y.Z.zip
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const extDir = path.join(root, 'chrome-extension');
const releaseDir = path.join(root, 'release');

// Prefer Imagine source if present; else procedural icons
const imagineSrc = path.join(extDir, 'icons', 'source-imagine.jpg');
const imagineSrcPng = path.join(extDir, 'icons', 'source-imagine.png');
if (fs.existsSync(imagineSrc) || fs.existsSync(imagineSrcPng)) {
  execSync('node scripts/export-extension-icons-from-source.mjs', { cwd: root, stdio: 'inherit' });
} else {
  execSync('node scripts/generate-extension-icons.mjs', { cwd: root, stdio: 'inherit' });
}

const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
const version = manifest.version || '0.0.0';
const zipName = `speedread-extension-v${version}.zip`;
const zipPath = path.join(releaseDir, zipName);

fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const exclude = new Set([
  'README.md',
  'icon.png',
  'source-imagine.jpg',
  'source-imagine.png',
  'source-imagine.webp',
  'icon-master-512.png',
]);

async function zipWithArchiver() {
  const archiver = (await import('archiver')).default;
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    const walk = (dir, base = '') => {
      for (const name of fs.readdirSync(dir)) {
        if (exclude.has(name)) continue;
        if (name.startsWith('.')) continue;
        const full = path.join(dir, name);
        const rel = path.join(base, name).replace(/\\/g, '/');
        if (fs.statSync(full).isDirectory()) walk(full, rel);
        else archive.file(full, { name: rel });
      }
    };
    walk(extDir);
    archive.finalize();
  });
}

function zipWithPowerShell() {
  // Windows fallback: Compress-Archive needs a temp clean folder
  const tmp = path.join(releaseDir, `_ext_pack_${version}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const copy = (dir, dest) => {
    for (const name of fs.readdirSync(dir)) {
      if (exclude.has(name) || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const d = path.join(dest, name);
      if (fs.statSync(full).isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        copy(full, d);
      } else {
        fs.copyFileSync(full, d);
      }
    }
  };
  copy(extDir, tmp);

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${tmp}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );
  fs.rmSync(tmp, { recursive: true, force: true });
}

try {
  await zipWithArchiver();
} catch {
  console.warn('archiver missing — using PowerShell Compress-Archive');
  zipWithPowerShell();
}

const bytes = fs.statSync(zipPath).size;
console.log(`Packaged ${zipName} (${(bytes / 1024).toFixed(1)} KB) → ${zipPath}`);
