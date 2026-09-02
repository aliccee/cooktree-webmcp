# Deploying CookTree's provider functions (Vercel)

CookTree is still a static site (`index.html`, no build step). It has two
serverless functions:

- `api/generate-dish.js` holds the OpenRouter key and turns free text into a
  plannable dish using `deepseek/deepseek-v4-flash-0731:nitro`.
- `api/create-shopping-list.js` holds the Instacart Developer Platform key and
  turns the computed shortages into a real-product shopping-list link.

The keys never reach the browser or the repo — they live only as
encrypted Vercel environment variables.

## Deploy

```bash
npm i -g vercel        # or: npx vercel
vercel login           # opens a browser tab, log into your Vercel account
vercel link             # links this folder to a Vercel project (first time)
vercel env add OPENROUTER_API_KEY production
vercel env add INSTACART_API_KEY production
# optional only after Instacart approves a production key:
vercel env add INSTACART_API_ENV production
# paste keys when prompted — they're stored encrypted, not written to files here
vercel --prod
```

`INSTACART_API_ENV` defaults to `development`, which calls
`https://connect.dev.instacart.tools`. Do not set it to `production` until the
corresponding production key has been approved. The front end calls both API
routes using same-origin relative URLs.

## Local dev without Vercel

`python3 -m http.server` (or any plain static server) has no `/api` routes,
so the two provider-backed tools fail with clear errors. The client-only tools,
the UI, and the local agent still work with zero setup.

To test the provider functions locally with real keys, use the Vercel dev server:

```bash
vercel dev
```

## What this does NOT do

- No auth or per-user rate limiting. Both API routes are reachable by anyone
  who has the deployed URL — fine for a hackathon demo, not a production
  safeguard. If this
  needs to survive real traffic, add Vercel's rate limiting / Firewall
  rules, or a signed token issued by the page itself.
- No retailer order access. CookTree creates a shopping-list handoff only;
  the user selects the store and completes checkout on the retailer page.
- No persistence. Generated dishes and handoff status live only in the browser
  tab's memory — refresh and they're gone.
