const { URL } = require('url');

const SECRET = process.env.SVN_PROXY_SECRET || process.env.PROXY_SECRET || '';

function isAuthorized(req) {
  if (!SECRET) return true;
  const authHeader = (req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    if (authHeader.slice(7).trim() === SECRET) return true;
  }

  const secretHeader = req.headers['x-proxy-secret'] || req.headers['x-svn-proxy-secret'];
  if (secretHeader === SECRET) return true;

  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('secret') === SECRET) return true;
  } catch (err) {
    // ignore malformed URL
  }

  return false;
}

function buildTargetUrl(rawUrl) {
  if (!rawUrl) return null;
  const [pathWithoutQuery, queryString] = rawUrl.split('?');
  if (!pathWithoutQuery.startsWith('/api/')) return null;
  const proxyPath = pathWithoutQuery.slice(5);
  const targetUrl = proxyPath.replace(/^\/(https?)\//, '$1://');
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) return null;
  if (!queryString) return targetUrl;

  const searchParams = new URLSearchParams(queryString);
  searchParams.delete('secret');
  const cleanedQuery = searchParams.toString();
  return cleanedQuery ? `${targetUrl}?${cleanedQuery}` : targetUrl;
}

function filterRequestHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (!value) continue;
    const lower = name.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'accept-encoding') continue;
    result[name] = value;
  }
  return result;
}

function copyResponseHeaders(response, res) {
  for (const [name, value] of response.headers.entries()) {
    if (name.toLowerCase() === 'transfer-encoding') continue;
    if (name.toLowerCase() === 'content-encoding') continue;
    res.setHeader(name, value);
  }
}

module.exports = async function (req, res) {
  if (!isAuthorized(req)) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Bearer realm="tiny-svn-proxy"');
    res.end('Unauthorized. Provide the proxy secret via Authorization, X-Proxy-Secret, or ?secret=.');
    return;
  }

  const targetUrl = buildTargetUrl(req.url);
  if (!targetUrl) {
    res.statusCode = 400;
    res.end('Bad request. Use /api/https/<host>/<path> or /api/http/<host>/<path>');
    return;
  }

  const headers = filterRequestHeaders(req.headers);
  const options = {
    method: req.method,
    headers,
    redirect: 'manual'
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    options.body = req;
  }

  try {
    const upstream = await fetch(targetUrl, options);
    res.statusCode = upstream.status;
    copyResponseHeaders(upstream, res);
    const upstreamBody = upstream.body;
    if (!upstreamBody) {
      res.end();
      return;
    }
    upstreamBody.pipe(res);
  } catch (error) {
    res.statusCode = 502;
    res.end(`Proxy error: ${error.message}`);
  }
};
