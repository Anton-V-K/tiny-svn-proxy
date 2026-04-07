const fs = require('fs');
const path = require('path');

const TEMPLATE_HTML = fs.readFileSync(path.join(__dirname, 'statusPage.html'), 'utf8');

/// <summary>
/// Escapes HTML characters in a string.
/// </summary>
/// <param name="value">The string to escape.</param>
/// <returns>The escaped string.</returns>
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/// <summary>
/// Sends an HTML response.
/// </summary>
/// <param name="res">The response object to send the HTML to.</param>
/// <param name="statusCode">The status code to send.</param>
/// <param name="html">The HTML to send.</param>
function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}

/// <summary>
/// Renders the status page HTML.
/// </summary>
/// <param name="title">The title of the status page.</param>
/// <param name="message">The message of the status page.</param>
/// <param name="statusCode">The status code of the status page.</param>
/// <param name="gitSha">The git SHA of the status page.</param>
/// <returns>The rendered HTML.</returns>
function renderStatusPage({ title, message, statusCode, gitSha }) {
  const sha = typeof gitSha === 'string' ? gitSha : 'unknown';
  const shaShort = sha.slice(0, 12);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeCode = escapeHtml(statusCode);

  const replacements = {
    title: safeTitle,
    message: safeMessage,
    statusCode: safeCode,
    gitShaShort: escapeHtml(shaShort),
    gitShaFull: escapeHtml(sha)
  };

  return TEMPLATE_HTML.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : match
  );
}

module.exports = {
  renderStatusPage,
  sendHtml
};

