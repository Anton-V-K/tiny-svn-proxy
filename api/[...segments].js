// (c)AI[CoPilot+Cursor]

const { URL } = require('url');

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
