# Tiny SVN HTTPS Reverse Proxy for Vercel

This is a small Vercel proxy function that forwards SVN HTTPS traffic to an upstream SVN server.

> Note: This is a path-based reverse proxy, not a generic CONNECT tunnel proxy. Use it by pointing your SVN repository URL at the proxy endpoint.

## How it works

- Request format: `https://<vercel-app>.vercel.app/api/https/<svn-host>/<svn-path>`
- The proxy rewrites that request to `https://<svn-host>/<svn-path>` and forwards the response.

## Deployment

1. Install Vercel CLI if needed:

   ```bash
   npm install -g vercel
   ```

2. Deploy the project:

   ```bash
   cd .../tiny-proxy
   vercel --prod
   ```

3. Note your deployment URL, e.g. `https://tiny-svn-proxy.vercel.app`.

## Usage with TortoiseSVN

1. In TortoiseSVN, create or use a repository URL in the proxy form.

   Example:
   - Original SVN server: `https://svn.example.com/repo`
   - Proxy URL: `https://tiny-svn-proxy.vercel.app/api/https/svn.example.com/repo`

2. Use that proxy URL as the repository URL for checkout, switch, update, etc.

3. If your SVN path contains spaces or special characters, URL-encode them.

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
