// (c)AI[Cursor]

const { URL } = require('url');

const GIT_SHA =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  process.env.COMMIT_SHA ||
  process.env.GIT_SHA ||
  'unknown';

const SECRET = process.env.SVN_PROXY_SECRET || process.env.PROXY_SECRET || '';

/// <summary>
/// Checks if the request is authorized.
/// </summary>
/// <param name="req">The request object.</param>
/// <returns>True if the request is authorized, false otherwise.</returns>
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

/// <summary>
/// Sets the WWW-Authenticate header.
/// </summary>
/// <param name="res">The response object to set the header on.</returns>
function setWwwAuthenticate(res) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="tiny-svn-proxy"');
}

/// <summary>
/// Checks if the request wants HTML.
/// </summary>
/// <param name="req">The request object.</param>
/// <returns>True if the request wants HTML, false otherwise.</returns>
function wantsHtml(req) {
  return String(req.headers.accept || '').includes('text/html');
}

module.exports = {
  SECRET,
  GIT_SHA,
  wantsHtml,
  isAuthorized,
  setWwwAuthenticate
};

