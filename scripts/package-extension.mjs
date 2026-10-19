/**
 * Build the Chrome Web Store upload.
 *   npm run ext:pack  ->  release/briskread-extension-vX.Y.Z/ (unpacked, what the tests load)
 *                         release/briskread-extension-vX.Y.Z.zip (what you upload)
 * Fails loudly if the manifest points at a missing file, a page loads remote
 * script, or store limits (name/description length, icon sizes) are broken.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXT_DIR = path.join(root, 'chrome-extension');
export const RELEASE_DIR = path.join(root, 'release');

// Docs and store material live next to the code but never ship.
const EXCLUDE = new Set(['README.md', 'store']);

export function stageExtension(outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(EXT_DIR, outDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(EXT_DIR, src);
      const top = rel.split(path.sep)[0];
      return !rel || (!EXCLUDE.has(top) && !path.basename(src).startsWith('.'));
    },
  });
  return outDir;
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? walk(full, base) : [path.relative(base, full).replace(/\\/g, '/')];
  });
}

export async function validateExtension(dir) {
  const problems = [];
  const files = new Set(walk(dir));
  const need = (file, from) => {
    if (!files.has(file)) problems.push(`${from} references missing file: ${file}`);
  };
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) problems.push(`version "${manifest.version}" is not X.Y.Z`);
  if (manifest.name.length > 75) problems.push('name is over 75 characters');
  if (manifest.description.length > 132) problems.push(`description is ${manifest.description.length} chars (max 132)`);
  if (manifest.host_permissions?.length) problems.push(`unexpected host_permissions: ${manifest.host_permissions}`);

  need(manifest.background.service_worker, 'manifest background');
  need(manifest.action.default_popup, 'manifest action');
  need(manifest.options_ui.page, 'manifest options_ui');
  for (const [size, file] of Object.entries(manifest.icons)) {
    need(file, 'manifest icons');
    if (files.has(file)) {
      const meta = await sharp(path.join(dir, file)).metadata();
      if (meta.width !== Number(size) || meta.height !== Number(size)) problems.push(`${file} is ${meta.width}x${meta.height}, expected ${size}`);
    }
  }

  for (const file of files) {
    const text = /\.(js|html)$/.test(file) ? fs.readFileSync(path.join(dir, file), 'utf8') : '';
    if (file.endsWith('.html')) {
      for (const [, ref] of text.matchAll(/(?:src|href)="([^"#?]+)/g)) {
        if (/^(https?:)?\/\//.test(ref)) {
          if (/<script[^>]+src="https?:/.test(text)) problems.push(`${file} loads remote script`);
          continue;
        }
        need(ref, file);
      }
    }
    if (file.endsWith('.js') && !file.startsWith('vendor/')) {
      for (const [, list] of text.matchAll(/importScripts\(([^)]*)\)/g)) for (const [, f] of list.matchAll(/'([^']+)'/g)) need(f, file);
      for (const [, list] of text.matchAll(/files: \[([^\]]*)\]/g)) for (const [, f] of list.matchAll(/'([^']+)'/g)) need(f, file);
      for (const [, f] of text.matchAll(/getURL\('([^']+)'\)/g)) need(f, file);
      if (/\beval\(|new Function\(/.test(text)) problems.push(`${file} uses eval/new Function`);
    }
  }
  return { manifest, files: [...files].sort(), problems };
}

function zip(dir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(dir, false);
    archive.finalize();
  });
}

export async function buildExtension() {
  const { version } = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  const name = `briskread-extension-v${version}`;
  const dir = stageExtension(path.join(RELEASE_DIR, name));
  const report = await validateExtension(dir);
  if (report.problems.length) throw new Error(`Extension validation failed:\n- ${report.problems.join('\n- ')}`);
  const zipPath = path.join(RELEASE_DIR, `${name}.zip`);
  await zip(dir, zipPath);
  return { dir, zipPath, ...report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { zipPath, files } = await buildExtension();
  const kb = (fs.statSync(zipPath).size / 1024).toFixed(1);
  console.log(`Validated ${files.length} files. Packaged ${path.basename(zipPath)} (${kb} KB)\n-> ${zipPath}`);
}
