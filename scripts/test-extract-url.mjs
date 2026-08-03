import assert from 'node:assert/strict';
import { isPrivateHost } from '../api/extract.js';

for (const host of ['localhost', '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '::1']) assert.equal(isPrivateHost(host), true);
for (const host of ['example.com', '1.1.1.1', '8.8.8.8']) assert.equal(isPrivateHost(host), false);

// Importing api/extract.js also proves the endpoint's module graph resolves.
// A broken import here previously only surfaced at deploy time, never locally.
console.log('extract SSRF checks passed');
