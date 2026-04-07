// Kept for backward compatibility in the repo, but Vercel does not treat
// bracketed filenames as catch-all routes for plain Serverless Functions.
// The actual proxy entrypoint is `api/proxy.js` with a rewrite in `vercel.json`.
module.exports = require('./proxy.js');
