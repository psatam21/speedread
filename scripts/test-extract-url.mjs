import assert from 'node:assert/strict';
import { isPrivateHost } from '../functions/api/extract.js';

for (const host of ['localhost', '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '::1']) assert.equal(isPrivateHost(host), true);
for (const host of ['example.com', '1.1.1.1', '8.8.8.8']) assert.equal(isPrivateHost(host), false);
