// Guards the Dodo webhook signature check. If this breaks, either real payments
// stop granting Premium, or worse, a forged request could grant it for free.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signatureMatches } from '../api/webhook.js';

const SECRET = `whsec_${Buffer.from('a-test-signing-key-32-bytes-long').toString('base64')}`;
const ID = 'msg_2abc';
const TS = '1754200000';
const BODY = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1' } });

const sign = (id, ts, body, secret = SECRET) => crypto
  .createHmac('sha256', Buffer.from(secret.split('_').pop(), 'base64'))
  .update(`${id}.${ts}.${body}`)
  .digest('base64');

const good = sign(ID, TS, BODY);

// The happy path must pass, or no customer ever gets what they paid for.
assert.ok(signatureMatches(ID, TS, BODY, `v1,${good}`, SECRET), 'valid signature must verify');

// During key rotation Dodo sends several; one good one is enough.
assert.ok(
  signatureMatches(ID, TS, BODY, `v1,${sign(ID, TS, 'other')} v1,${good}`, SECRET),
  'must accept when any provided signature matches'
);

// Everything below must fail, or the endpoint grants Premium to forged requests.
assert.ok(!signatureMatches(ID, TS, `${BODY} `, `v1,${good}`, SECRET), 'tampered body must fail');
assert.ok(!signatureMatches(ID, '1754209999', BODY, `v1,${good}`, SECRET), 'swapped timestamp must fail');
assert.ok(!signatureMatches('msg_other', TS, BODY, `v1,${good}`, SECRET), 'swapped id must fail');
assert.ok(
  !signatureMatches(ID, TS, BODY, `v1,${good}`, `whsec_${Buffer.from('a-different-signing-key-32-byte').toString('base64')}`),
  'wrong secret must fail'
);

// Malformed headers must return false, never throw — timingSafeEqual dies on a
// length mismatch, so the length guard in front of it is load-bearing.
for (const header of ['', 'v1,', 'garbage', 'v1,YWJj', `${good}`]) {
  assert.equal(signatureMatches(ID, TS, BODY, header, SECRET), false, `must reject header: "${header}"`);
}

console.log('webhook signature checks passed');
