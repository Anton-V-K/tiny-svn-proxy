const test = require('node:test');
const assert = require('node:assert/strict');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function normalizeBaseUrl(input) {
  const s = String(input).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) throw new Error(`VERCEL_BASE_URL must start with http(s)://, got: ${input}`);
  return s;
}

function buildAuthHeaders() {
  const secret = process.env.SVN_PROXY_SECRET || process.env.PROXY_SECRET || process.env.VERCEL_PROXY_SECRET;
  if (!secret) return {};
  // Match proxy behavior: any username, secret as password.
  const token = Buffer.from(`proxy:${secret}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
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
  return /dav/i.test(dav) || /svn/i.test(server) || /xml/i.test(contentType) || res.status === 207;
}

function pickHeaders(res, names) {
  const out = {};
  for (const n of names) {
    const v = res.headers.get(n);
    if (v != null) out[n] = v;
  }
  return out;
}

function prettyJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

test('vercel smoke: OPTIONS reaches upstream SVN/WebDAV', async () => {
  const baseUrl = normalizeBaseUrl(requireEnv('VERCEL_BASE_URL'));
  const upstream = 'svn.apache.org/repos/asf/subversion/trunk/';
  const url = `${baseUrl}/api/https/${upstream}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'OPTIONS',
      redirect: 'manual',
      headers: {
        ...buildAuthHeaders()
      }
    },
    25000
  );
  const body = await readBodySnippet(res);
  const diagHeaders = pickHeaders(res, [
    'server',
    'content-type',
    'x-vercel-id',
    'x-vercel-cache',
    'x-vercel-error',
    'x-vercel-matched-path',
    'x-vercel-deployment-url'
  ]);

  // If Vercel returns its platform 404 ("The page could not be found"), the request likely
  // never reached the serverless function. That's a show-stopper for SVN/WebDAV clients.
  if (res.status === 404 && /page could not be found/i.test(body)) {
    const getRes = await fetchWithTimeout(
      url,
      { method: 'GET', redirect: 'manual', headers: { ...buildAuthHeaders() } },
      25000
    );
    const getBody = await readBodySnippet(getRes);
    const getHeaders = pickHeaders(getRes, [
      'server',
      'content-type',
      'x-vercel-id',
      'x-vercel-cache',
      'x-vercel-error',
      'x-vercel-matched-path'
    ]);
    assert.fail(
      [
        `Vercel returned a platform 404 for OPTIONS; the request likely did NOT reach /api/[...segments].js.`,
        `This commonly breaks SVN/WebDAV clients because they rely on OPTIONS/PROPFIND/REPORT.`,
        ``,
        `OPTIONS ${url}`,
        `status=${res.status}`,
        `headers=${prettyJson(diagHeaders)}`,
        `body=${body}`,
        ``,
        `GET ${url} (probe)`,
        `status=${getRes.status}`,
        `headers=${prettyJson(getHeaders)}`,
        `body=${getBody}`
      ].join('\n')
    );
  }

  // If Vercel/proxy rejects DAV verbs or auth, you'll typically see 404/405/401 here.
  assert.ok(
    res.status >= 200 && res.status < 500,
    `Unexpected status ${res.status}. Body: ${body}`
  );

  // If this assertion fails (e.g. status 404 with HTML), it strongly suggests a platform/routing issue.
  assert.ok(
    isLikelySvnDavResponse(res),
    `Response did not look like SVN/WebDAV. status=${res.status} headers=${prettyJson(diagHeaders)} body=${body}`
  );
});

test('vercel smoke: PROPFIND Depth:0 reaches upstream SVN/WebDAV', async () => {
  const baseUrl = normalizeBaseUrl(requireEnv('VERCEL_BASE_URL'));
  const upstream = 'svn.apache.org/repos/asf/subversion/trunk/';
  const url = `${baseUrl}/api/https/${upstream}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'PROPFIND',
      redirect: 'manual',
      headers: {
        Depth: '0',
        'Content-Type': 'text/xml; charset="utf-8"',
        ...buildAuthHeaders()
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontentlength/>
  </D:prop>
</D:propfind>`
    },
    25000
  );
  const body = await readBodySnippet(res);

  assert.ok(
    [200, 207, 301, 302, 401, 403, 404, 405].includes(res.status),
    `Unexpected status ${res.status}. Body: ${body}`
  );

  // If you get 401 here, set SVN_PROXY_SECRET/PROXY_SECRET env var when running this test
  // to have it send Basic auth to the proxy.
  assert.ok(
    isLikelySvnDavResponse(res) || res.status === 401 || res.status === 403,
    `Response did not look like SVN/WebDAV. status=${res.status} dav=${res.headers.get('dav')} content-type=${res.headers.get('content-type')} body=${body}`
  );
});

