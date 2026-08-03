// Every api/ endpoint must have a resolvable module graph.
//
// `astro build` only builds the site; it never bundles api/, so a broken import
// there passes locally and fails at deploy time. That is exactly how deleting
// functions/ took production down for hours while every local check stayed
// green. This imports each endpoint so that failure is caught by `npm test`.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const endpoints = readdirSync(new URL('../api/', import.meta.url))
  .filter((name) => name.endsWith('.js'));

assert.ok(endpoints.length > 0, 'expected at least one api/ endpoint');

for (const name of endpoints) {
  const mod = await import(new URL(`../api/${name}`, import.meta.url));
  assert.equal(
    typeof mod.default, 'function',
    `api/${name} must default-export a handler`
  );
}

console.log(`api import checks passed (${endpoints.length} endpoints)`);
