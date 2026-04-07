const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const handler = require('../api/proxy.js');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Mimic Vercel/edge forwarding headers so redirect rewriting is exercised.
      req.headers['x-forwarded-proto'] = 'http';
      req.headers['x-forwarded-host'] = req.headers.host;
      handler(req, res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind test server'));
        return;
      }
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`
      });
    });
  });
}

async function readBodySnippet(res, maxBytes = 4096) {
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const truncated = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
  return truncated.toString('utf8');
}

function isLikelySvnDavResponse(res) {
  const dav = res.headers.get('dav') || '';
  const server = res.headers.get('server') || '';
  const contentType = res.headers.get('content-type') || '';
  return (
    /dav/i.test(dav) ||
    /svn/i.test(server) ||
    /xml/i.test(contentType) ||
    res.status === 207 // Multi-Status is typical for PROPFIND
  );
}

test('proxy: OPTIONS to public SVN repo succeeds', async () => {
  // Public SVN repository (Apache Subversion).
  const upstream = 'svn.apache.org/repos/asf/subversion/trunk/';

  const { server, baseUrl } = await startServer();
  try {
    const url = `${baseUrl}/api/https/${upstream}`;
    assert.equal(
      handler._buildTargetUrl(new URL(url).pathname),
      `https://${upstream}`,
      'Local URL mapping should produce upstream HTTPS URL'
    );
    const res = await fetch(url, { method: 'OPTIONS', redirect: 'manual' });

    assert.ok(
      res.status >= 200 && res.status < 500,
      `Unexpected status ${res.status}. Body: ${await readBodySnippet(res)}`
    );
    assert.ok(
      isLikelySvnDavResponse(res),
      `Response did not look like SVN/WebDAV. status=${res.status} dav=${res.headers.get('dav')} content-type=${res.headers.get('content-type')}`
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('proxy: PROPFIND Depth:0 to public SVN repo returns a WebDAV-ish response', async () => {
  const upstream = 'svn.apache.org/repos/asf/subversion/trunk/';

  const { server, baseUrl } = await startServer();
  try {
    const url = `${baseUrl}/api/https/${upstream}`;
    assert.equal(
      handler._buildTargetUrl(new URL(url).pathname),
      `https://${upstream}`,
      'Local URL mapping should produce upstream HTTPS URL'
    );
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Depth: '0',
        'Content-Type': 'text/xml; charset="utf-8"'
      },
      // Minimal body is optional; many DAV servers accept empty PROPFIND too.
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontentlength/>
  </D:prop>
</D:propfind>`
    });

    assert.ok(
      // Many DAV servers respond 207; some may 200/301/403 depending on path rules.
      [200, 207, 301, 302, 403].includes(res.status),
      `Unexpected status ${res.status}. Body: ${await readBodySnippet(res)}`
    );
    assert.ok(
      isLikelySvnDavResponse(res),
      `Response did not look like SVN/WebDAV. status=${res.status} dav=${res.headers.get('dav')} content-type=${res.headers.get('content-type')}`
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('proxy: accepts full-scheme incoming path form', async () => {
  const upstream = 'https://svn.apache.org/repos/asf/subversion/trunk/';

  const { server, baseUrl } = await startServer();
  try {
    const url = `${baseUrl}/api/${upstream}`;
    const res = await fetch(url, { method: 'OPTIONS', redirect: 'manual' });
    assert.ok(
      res.status >= 200 && res.status < 500,
      `Unexpected status ${res.status}. Body: ${await readBodySnippet(res)}`
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});

