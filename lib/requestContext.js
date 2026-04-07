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

  // Allow SVN clients (e.g. TortoiseSVN) to authenticate via Basic auth.
  // Convention: user can enter any username and use the proxy secret as the password.
  if (authHeader.toLowerCase().startsWith('basic ')) {
    try {
      const encoded = authHeader.slice(6).trim();
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const username = sep >= 0 ? decoded.slice(0, sep) : decoded;
      const password = sep >= 0 ? decoded.slice(sep + 1) : '';
      if (password === SECRET || username === SECRET) return true;
    } catch (err) {
      // ignore malformed basic auth
    }
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
  // Offer both schemes so SVN clients prompt for credentials.
  res.setHeader('WWW-Authenticate', 'Basic realm="tiny-svn-proxy", Bearer realm="tiny-svn-proxy"');
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

