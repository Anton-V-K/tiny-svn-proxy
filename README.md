# Tiny SVN HTTPS Reverse Proxy (for Vercel)

This is a small Vercel proxy function that forwards SVN HTTPS traffic to an upstream SVN server.

> Note: This is a path-based reverse proxy, not a generic CONNECT tunnel proxy. Use it by pointing your SVN repository URL at the proxy endpoint.

## How it works

- Request format: `https://<vercel-app>.vercel.app/api/https/<svn-host>/<svn-path>`
- The proxy rewrites that request to `https://<svn-host>/<svn-path>` and forwards the response.
- Internally (on Vercel), `vercel.json` routes `/api/<anything>` into `api/proxy.js`.

## Status page

Opening `https://<vercel-app>.vercel.app/api` in a browser shows a small “service is running” page including the deployed git commit hash (from `VERCEL_GIT_COMMIT_SHA` when available).

## Deployment

## Deploy on Vercel (Free Tier)

This project is a Vercel Serverless Function (`api/proxy.js`) and includes `vercel.json` to run on Node.js 24.

### Option A: Deploy via Vercel Dashboard (recommended)

1. Push this repo to GitHub / GitLab / Bitbucket.
2. In the Vercel Dashboard, click **Add New → Project** and import the repo.
3. When asked for build settings:
   - **Framework Preset**: Other
   - **Build Command**: none
   - **Output Directory**: none
   - **Install Command**: default (or none)
4. (Optional but recommended) Add an access secret:
   - In **Project → Settings → Environment Variables**, add **one** of:
     - `SVN_PROXY_SECRET` (preferred), or
     - `PROXY_SECRET`
   - Use a long random value.
5. Click **Deploy**.
6. After deploy, note your URL, e.g. `https://tiny-svn-proxy.vercel.app`.

### Option B: Deploy via Vercel CLI

1. Install Vercel CLI if needed:

   ```bash
   npm install -g vercel
   ```

2. Deploy:

   ```bash
   cd .../tiny-svn-proxy
   vercel --prod
   ```

3. (Optional) Set the proxy secret for production:

   ```bash
   vercel env add SVN_PROXY_SECRET production
   vercel --prod
   ```

### Free tier notes / limitations

- **Timeouts**: Vercel Serverless Functions have execution time limits. Large SVN operations may fail if they take too long.
- **Bandwidth/transfer**: Very large checkouts through the proxy can be slow or hit limits; keep repo sizes and operations moderate.
- **Auth headers**: Many SVN clients won’t send custom headers. If that’s your case, you can use `?secret=...` (less secure than headers).
- **Upstream access**: Your upstream SVN server must be reachable from Vercel’s public network (no private/VPN-only hosts unless exposed).

## Usage with TortoiseSVN

1. In TortoiseSVN, create or use a repository URL in the proxy form.

   Example:
   - Original SVN server: `https://svn.example.com/repo`
   - Proxy URL: `https://tiny-svn-proxy.vercel.app/api/https/svn.example.com/repo`

2. Use that proxy URL as the repository URL for checkout, switch, update, etc.

3. If your SVN path contains spaces or special characters, URL-encode them.

## Authentication

If you set the environment variable `SVN_PROXY_SECRET` or `PROXY_SECRET`, the proxy requires that secret for every request.

- For SVN clients (recommended): use **Basic auth** and set the **password** to the proxy secret (username can be anything).
- Preferred: send an HTTP header:
  - `Authorization: Bearer <secret>`
- Alternative headers:
  - `X-Proxy-Secret: <secret>`
  - `X-SVN-Proxy-Secret: <secret>`
- If headers are not available, append the secret as a query parameter:
  - `?secret=<secret>`

Example:

```text
https://tiny-svn-proxy.vercel.app/api/https/svn.example.com/svn/myproject?secret=YOUR_SECRET
```

> Note: the query-string form is convenient for clients that cannot set custom request headers, but sending the secret in a URL is less secure than using headers.

## Smoke tests

These are intended to help diagnose issues where SVN clients (e.g. TortoiseSVN) can’t connect, by exercising SVN/WebDAV-like HTTP methods (`OPTIONS`, `PROPFIND`) against a **public SVN repo** through the proxy.

### Local smoke tests (no Vercel needed)

Run the proxy handler locally and verify it can talk to the public upstream:

```bash
node --test test/all.test.js
```

or:

```bash
npm test
```

### Remote smoke tests (against deployed Vercel URL)

This is the fastest way to detect platform/routing issues (for example, if a front proxy rejects WebDAV methods before your function runs).

Set the base URL of your deployment:

```bash
VERCEL_BASE_URL=https://tiny-svn-proxy.vercel.app node --test test/remote.vercel-smoke.test.js
```

If your deployment is protected by a proxy secret, provide it so the test sends **Basic auth**:

```bash
VERCEL_BASE_URL=https://tiny-svn-proxy.vercel.app SVN_PROXY_SECRET=YOUR_SECRET node --test test/remote.vercel-smoke.test.js
```

Or via npm:

```bash
VERCEL_BASE_URL=https://tiny-svn-proxy.vercel.app SVN_PROXY_SECRET=YOUR_SECRET npm run test:remote
```

#### Workarounds for restrictive networks (no VPN)

If the smoke tests succeed on VPN but fail on your normal network, it is often due to **broken/blocked IPv6** or **DNS restrictions** on your local network.

- **Force IPv4 for the smoke tests** (recommended):

```bash
SMOKE_FORCE_IPV4=1 VERCEL_BASE_URL=https://tiny-svn-proxy.vercel.app npm run test:remote
```

- **Skip the remote smoke tests when the local network cannot reach Vercel** (opt-in):

```bash
SMOKE_SKIP_ON_NETWORK_FAILURE=1 VERCEL_BASE_URL=https://tiny-svn-proxy.vercel.app npm run test:remote
```

This keeps the tests strict by default, but allows you to run the rest of the suite in environments that block Vercel.

## Example

If your upstream server is:

```
https://svn.example.com/svn/myproject
```

Use this URL in TortoiseSVN:

```
https://tiny-svn-proxy.vercel.app/api/https/svn.example.com/svn/myproject
```

## Notes

- The proxy forwards headers and body data to the upstream SVN server.
- It is intended for use on Vercel free tier.
- For best results, keep repository sizes moderate and avoid very large checkouts through the proxy.
