// (c)AI[CoPilot+Cursor]

const { URL } = require('url');
const { Readable, pipeline } = require('stream');

const { GIT_SHA, isAuthorized, setWwwAuthenticate, wantsHtml } = require('../lib/requestContext');
const { renderStatusPage, sendHtml } = require('../lib/statusPage');

/// <summary>
/// Builds the target URL from the raw URL.
/// </summary>
/// <param name="rawUrl">The raw URL to build the target URL from.</param>
/// <returns>The target URL.</returns>
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

/// <summary>
/// Copies the response headers from the upstream response to the response object.
/// </summary>
/// <param name="response">The upstream response object.</param>
/// <param name="res">The response object to copy the headers to.</param>
function copyResponseHeaders(response, res) {
  for (const [name, value] of response.headers.entries()) {
    if (name.toLowerCase() === 'transfer-encoding') continue;
    if (name.toLowerCase() === 'content-encoding') continue;
    res.setHeader(name, value);
  }
}

function getExternalBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return null;
  return `${proto}://${host}`;
}

function rewriteLocationHeaderIfNeeded(req, targetUrl, res) {
  const location = res.getHeader('location');
  if (!location || Array.isArray(location)) return;

  const externalBase = getExternalBaseUrl(req);
  if (!externalBase) return;

  try {
    const target = new URL(targetUrl);
    const loc = new URL(String(location), target);
    if (loc.host !== target.host) return;

    const proxied = `${externalBase}/api/${target.protocol.replace(':', '')}/${target.host}${loc.pathname}${loc.search}${loc.hash}`;
    res.setHeader('location', proxied);
  } catch (err) {
    // ignore malformed Location
  }
}

/// <summary>
/// Filters the request headers to remove unnecessary headers.
/// </summary>
/// <param name="headers">The request headers to filter.</param>
/// <returns>The filtered headers.</returns>
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

module.exports = async function (req, res) {
  let pathname = '';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname || '';
  } catch (err) {
    pathname = '';
  }

  if (!isAuthorized(req)) {
    if (req.method === 'GET' && wantsHtml(req)) {
      setWwwAuthenticate(res);
      sendHtml(
        res,
        401,
        renderStatusPage({
          title: 'tiny-svn-proxy',
          message: 'Unauthorized. Provide the proxy secret via Authorization: Bearer, X-Proxy-Secret, or ?secret=.',
          statusCode: 401,
          gitSha: GIT_SHA
        })
      );
      return;
    }

    res.statusCode = 401;
    setWwwAuthenticate(res);
    res.end('Unauthorized. Provide the proxy secret via Authorization, X-Proxy-Secret, or ?secret=.');
    return;
  }

  const targetUrl = buildTargetUrl(req.url);
  if (!targetUrl) {
    if (req.method === 'GET' && wantsHtml(req)) {
      sendHtml(
        res,
        400,
        renderStatusPage({
          title: 'tiny-svn-proxy',
          message: 'Bad request. Use /api/https/<host>/<path> or /api/http/<host>/<path>.',
          statusCode: 400,
          gitSha: GIT_SHA
        })
      );
      return;
    }

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
    // Required by undici/node fetch when streaming a request body.
    options.duplex = 'half';
  }

  try {
    const upstream = await fetch(targetUrl, options);
    res.statusCode = upstream.status;
    copyResponseHeaders(upstream, res);
    rewriteLocationHeaderIfNeeded(req, targetUrl, res);
    const upstreamBody = upstream.body;
    if (!upstreamBody) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstreamBody);
    pipeline(nodeStream, res, (err) => {
      if (err && !res.headersSent) {
        res.statusCode = 502;
        res.end(`Proxy streaming error: ${err.message}`);
      }
    });
  } catch (error) {
    res.statusCode = 502;
    res.end(`Proxy error: ${error.message}`);
  }
};
