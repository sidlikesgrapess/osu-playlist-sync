// http.js postJson: the one POST helper the YouTube continuation walk uses (todo item 08).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { postJson, UA_PROFILES } from '../src/lib/http.js';

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const stop = (server) => new Promise((resolve) => server.close(resolve));

test('postJson sends a JSON POST with the chosen profile and parses the answer', async () => {
  let seen;
  const { server, url } = await startServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = { method: req.method, headers: req.headers, body };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  try {
    const out = await postJson(url, { continuation: 'T1' }, { profile: 'browserLike', headers: { 'X-Extra': 'yes' } });
    assert.deepEqual(out, { ok: true });
    assert.equal(seen.method, 'POST');
    assert.deepEqual(JSON.parse(seen.body), { continuation: 'T1' });
    assert.equal(seen.headers['content-type'], 'application/json');
    assert.equal(seen.headers['user-agent'], UA_PROFILES.browserLike);
    assert.equal(seen.headers['x-extra'], 'yes');
  } finally {
    await stop(server);
  }
});

test('postJson keeps the byte cap and the timeout of fetchText', async () => {
  const big = await startServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pad: 'x'.repeat(5000) }));
  });
  const slow = await startServer((req) => { req.resume(); });
  try {
    await assert.rejects(() => postJson(big.url, {}, { maxBytes: 100 }), (err) => err.status === 502);
    await assert.rejects(() => postJson(slow.url, {}, { timeoutMs: 100 }), (err) => err.status === 504);
  } finally {
    slow.server.closeAllConnections?.();
    await Promise.all([stop(big.server), stop(slow.server)]);
  }
});
