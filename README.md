# House 2028 — API Edition (v2)

An independent, nonpartisan educational PWA. No election advice, endorsements, or candidate recommendations. **The bundled sample names are fictional.** Live mode displays **current House members only**, not verified 2028 candidates.

## What you learn

1. `fetch()` in `public/app.js` calls your own API endpoint.
2. `netlify/functions/representative.mjs` validates input and reads a private API key.
3. The function calls `https://api.congress.gov/v3/member/{STATE}/{DISTRICT}?currentMember=true`.
4. It returns simplified JSON; the browser renders profiles with DOM methods.
5. The service worker caches static files but **never caches API responses**, avoiding outdated live claims when offline.

## Setup (important: NOT a drag-and-drop-only function deployment)

1. Get a free Congress.gov API key from https://api.data.gov/signup/ .
2. Create a GitHub repository and upload **the contents of this folder** (including `netlify.toml`, `public/`, and `netlify/functions/`).
3. In Netlify, choose **Add new project → Import an existing project**, connect the GitHub repo.
4. Netlify reads `netlify.toml`: publish directory `public`, functions directory `netlify/functions`, no build command required.
5. In Netlify project configuration → Environment variables, add `CONGRESS_API_KEY` with the secret value. Ensure it is available to Functions. **Never paste the key into frontend JS, GitHub, or chat.**
6. Trigger a new deployment after adding the environment variable. Open your Netlify HTTPS URL.
7. Select California, district 12, and choose **Live API**. If you have not configured the key yet, choose **Demo data** and California district 12.

**Important:** Dragging the `public` folder into Netlify Drop deploys a static demo but does **not** deploy the serverless function. Use Git-connected Netlify deployment for the full API version. A custom domain is optional. Hosting and API usage are subject to free-plan and rate limits.

## Local development

- Install Node.js and Netlify CLI (`npm install -g netlify-cli`).
- From the project root, set `CONGRESS_API_KEY` in a local `.env` file (do not commit it) or use Netlify's environment configuration.
- Run `netlify dev` to serve both the static app and functions; the CLI will provide a localhost URL.
- For a *static-only demo*, you may run `python -m http.server 8000 --directory public` and select Demo mode. Live mode requires Netlify Functions.

## Troubleshooting

- **API key not configured:** Set `CONGRESS_API_KEY` in Netlify's environment settings and redeploy.
- **Endpoint unavailable / 404:** Deploy the root project through Git integration, not just `public` via drag-and-drop.
- **No member returned:** District could be vacant or invalid; check official sources and the state/district. Some states have at-large district 0.
- **Rate limiting / upstream error:** Retry later. For larger audiences, implement scheduled JSON snapshots or a durable cache.
- **Offline:** Demo assets are cached; live requests need network connectivity. Cached data must not be mistaken for live data.

## Structure

```
netlify.toml
netlify/functions/representative.mjs   # backend API proxy
public/index.html                     # user interface
public/styles.css                     # styling
public/app.js                         # browser API integration
public/sw.js                          # offline static asset cache
public/manifest.webmanifest           # install metadata
public/data/members.json              # clearly fictional sample data
public/icons/                         # PWA icons
```

## Sources

- https://api.congress.gov/
- https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/MemberEndpoint.md
- https://docs.netlify.com/build/functions/configuration/
- https://docs.netlify.com/build/functions/environment-variables/

## Data quality and security

- The API provides current-member records, not an authoritative list of 2028 candidates.
- Member district assignments and House vacancies may change; verify with official records.
- Do not treat FEC filings alone as proof of ballot qualification.
- No user addresses are collected; input is only state/district.
- The API key stays server-side; requests are validated and time-limited.
- This educational prototype has no durable cache or rate-limiter. Before mass-scale launch, add abuse protection, monitoring, and a scheduled data refresh strategy.
