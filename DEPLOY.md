# Deploying CookTree's provider functions (Vercel)

CookTree is still a static site (`index.html`, no build step). It has two
serverless functions:

- `api/generate-dish.js` holds the OpenRouter key and turns free text into a
  plannable dish using `deepseek/deepseek-v4-flash-0731:nitro`, while generating
  its card image in parallel with `google/gemini-3.1-flash-lite-image`.
- `api/create-shopping-list.js` calls Shopify Global Catalog and turns the
  computed shortages into live products grouped by merchant cart.

The OpenRouter key never reaches the browser or the repo — it lives only as an
encrypted Vercel environment variable and is reused by both generation models.

## Deploy

```bash
npm i -g vercel        # or: npx vercel
vercel login           # opens a browser tab, log into your Vercel account
vercel link             # links this folder to a Vercel project (first time)
vercel env add OPENROUTER_API_KEY production
# paste keys when prompted — they're stored encrypted, not written to files here
vercel --prod
```

Shopify Global Catalog does not require an API key. The front end calls both API
routes using same-origin relative URLs; the shopping function calls Shopify's
official UCP/MCP endpoint server-side and does not cache its live results.

## Local dev without Vercel

`python3 -m http.server` (or any plain static server) has no `/api` routes,
so the two provider-backed tools fail with clear errors. The client-only tools,
the UI, and the local agent still work with zero setup.

To test both provider functions locally, use the Vercel dev server. Only dish
generation requires `OPENROUTER_API_KEY`:

```bash
vercel dev
```

## What this does NOT do

- No auth or per-user rate limiting. Both API routes are reachable by anyone
  who has the deployed URL — fine for a hackathon demo, not a production
  safeguard. If this
  needs to survive real traffic, add Vercel's rate limiting / Firewall
  rules, or a signed token issued by the page itself.
- No retailer order access. CookTree creates Shopify cart links only; the user
  reviews each merchant's products, shipping, taxes, and completes checkout there.
- A ZIP filters deliverability, not distance. Shopify Global Catalog is not a
  directory of nearby physical supermarkets or a source of in-store inventory.
- No persistence. Generated dishes and handoff status live only in the browser
  tab's memory — refresh and they're gone.
