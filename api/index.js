const { renderStatusPage, sendHtml } = require('../lib/statusPage');
const { GIT_SHA } = require('../lib/requestContext');

module.exports = async function (req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end('Method Not Allowed');
    return;
  }

  sendHtml(
    res,
    200,
    renderStatusPage({
      title: 'tiny-svn-proxy',
      message: 'This service is up. Use the /api/https/... endpoint as an SVN reverse proxy.',
      statusCode: 200,
      gitSha: GIT_SHA
    })
  );
};

