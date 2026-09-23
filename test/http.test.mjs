import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { fetchText, fetchJson, fetchUpstream, UA_PROFILES } from '../src/lib/http.js';

/** Starts a stub server whose behaviour is `handler(req, res)`, and returns its base URL. */
async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('UA_PROFILES has a server and a browser-like profile', () => {
  assert.ok(UA_PROFILES.server);
  assert.ok(UA_PROFILES.browserLike);
  assert.notEqual(UA_PROFILES.server, UA_PROFILES.browserLike);
});

test('a non-2xx response throws an Error tagged with the upstream status', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  try {
    await assert.rejects(() => fetchText(url), (err) => {
      assert.equal(err.status, 404);
      return true;
    });
  } finally {
    await stop(server);
  }
});

test('a request that never responds is aborted and thrown as a 504', async () => {
  const { server, url } = await startServer(() => {
    // Never call res.end() or res.write(); the client must give up on its own.
  });

  try {
    await assert.rejects(
      () => fetchText(url, { timeoutMs: 100 }),
      (err) => {
        assert.equal(err.status, 504);
        return true;
      }
    );
  } finally {
    await stop(server);
  }
});

test('a body over the byte cap throws a 502, counted as bytes actually streamed in', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('x'.repeat(1000));
  });

  try {
    await assert.rejects(
      () => fetchText(url, { maxBytes: 100 }),
      (err) => {
        assert.equal(err.status, 502);
        return true;
      }
    );
  } finally {
    await stop(server);
  }
});

test('fetchText returns the body as a string when everything is within bounds', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hello world');
  });

  try {
    const text = await fetchText(url, { maxBytes: 1000 });
    assert.equal(text, 'hello world');
  } finally {
    await stop(server);
  }
});

test('fetchJson parses the body as JSON', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, n: 42 }));
  });

  try {
    const data = await fetchJson(url);
    assert.deepEqual(data, { ok: true, n: 42 });
  } finally {
    await stop(server);
  }
});

test('fetchUpstream hands back the raw Response without buffering the body itself', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('raw body');
  });

  try {
    const res = await fetchUpstream(url);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, 'raw body');
  } finally {
    await stop(server);
  }
});

test('the request carries a User-Agent from UA_PROFILES', async () => {
  let seenUserAgent = null;
  const { server, url } = await startServer((req, res) => {
    seenUserAgent = req.headers['user-agent'];
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  try {
    await fetchText(url, { profile: 'browserLike' });
    assert.equal(seenUserAgent, UA_PROFILES.browserLike);
  } finally {
    await stop(server);
  }
});
