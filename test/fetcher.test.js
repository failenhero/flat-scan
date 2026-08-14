import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchHtml } from '../src/fetcher.js';

function startServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('fetchHtml returns body on 200', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>ok</html>');
  });
  try {
    const html = await fetchHtml(url);
    assert.equal(html, '<html>ok</html>');
  } finally {
    await stopServer(server);
  }
});

test('fetchHtml retries once on 5xx and succeeds', async () => {
  let calls = 0;
  const { server, url } = await startServer((req, res) => {
    calls++;
    if (calls === 1) {
      res.writeHead(503);
      res.end('busy');
    } else {
      res.writeHead(200);
      res.end('<html>second-try</html>');
    }
  });
  try {
    const html = await fetchHtml(url, { retryDelayMs: 0 });
    assert.equal(calls, 2);
    assert.equal(html, '<html>second-try</html>');
  } finally {
    await stopServer(server);
  }
});

test('fetchHtml throws after retry on persistent 5xx', async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(503);
    res.end('busy');
  });
  try {
    await assert.rejects(
      () => fetchHtml(url, { retryDelayMs: 0 }),
      /HTTP 503/,
    );
  } finally {
    await stopServer(server);
  }
});

test('fetchHtml throws on 4xx without retrying', async () => {
  let calls = 0;
  const { server, url } = await startServer((req, res) => {
    calls++;
    res.writeHead(404);
    res.end('not found');
  });
  try {
    await assert.rejects(
      () => fetchHtml(url, { retryDelayMs: 0 }),
      /HTTP 404/,
    );
    assert.equal(calls, 1);
  } finally {
    await stopServer(server);
  }
});

test('fetchHtml times out (and retries once) when server hangs', async () => {
  let calls = 0;
  const { server, url } = await startServer(() => {
    calls++;
    /* never respond */
  });
  try {
    await assert.rejects(
      () => fetchHtml(url, { timeoutMs: 50, retryDelayMs: 0 }),
      /(timeout|abort)/i,
    );
    assert.equal(calls, 2, 'should have retried once before giving up');
  } finally {
    server.closeAllConnections?.();
    await stopServer(server);
  }
});

test('fetchHtml sends a User-Agent that includes contactEmail', async () => {
  let captured;
  const { server, url } = await startServer((req, res) => {
    captured = req.headers['user-agent'];
    res.writeHead(200);
    res.end('<html>ok</html>');
  });
  try {
    await fetchHtml(url, { contactEmail: 'me@example.com' });
    assert.match(captured, /flats-scan\/1\.0/);
    assert.match(captured, /me@example\.com/);
  } finally {
    await stopServer(server);
  }
});
