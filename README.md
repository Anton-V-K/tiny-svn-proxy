# Tiny SVN HTTPS Reverse Proxy (for Vercel)

This is a small Vercel proxy function that forwards SVN HTTPS traffic to an upstream SVN server.

> Note: This is a path-based reverse proxy, not a generic CONNECT tunnel proxy. Use it by pointing your SVN repository URL at the proxy endpoint.

## How it works

- Request format: `https://<vercel-app>.vercel.app/api/https/<svn-host>/<svn-path>`
- The proxy rewrites that request to `https://<svn-host>/<svn-path>` and forwards the response.

## Deployment

## Deploy on Vercel (Free Tier)

This project is already a Vercel Serverless Function (`api/[...segments].js`) and includes `vercel.json` to run on Node.js 24.

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
