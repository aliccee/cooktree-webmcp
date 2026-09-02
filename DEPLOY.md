# Deploying `generate_dish` (Vercel)

CookTree is still a static site (`index.html`, no build step). The only
addition is one serverless function, `api/generate-dish.js`, which holds the
OpenRouter key server-side and turns a free-text dish description into a real,
plannable dish using `deepseek/deepseek-v4-flash` through OpenRouter.

The key never reaches the browser or the repo — it lives only as an
encrypted Vercel environment variable.

## Deploy

```bash
npm i -g vercel        # or: npx vercel
vercel login           # opens a browser tab, log into your Vercel account
vercel link             # links this folder to a Vercel project (first time)
vercel env add OPENROUTER_API_KEY production
# paste the key when prompted — it's stored encrypted, not written to any file here
vercel --prod
```

That's it — no URL to copy back into `index.html`. The front end calls the
relative path `/api/generate-dish`, which Vercel serves from the same origin
as the static site once deployed. Open the printed `*.vercel.app` URL, type a
dish description into the "This Week" panel's input, and hit Generate.

## Local dev without Vercel

`python3 -m http.server` (or any plain static server) has no `/api` route,
so `generate_dish` will fail with a clear error telling you to deploy on
Vercel instead — everything else (the other 9 tools, the UI, the local
agent) works exactly as before with zero setup.

To test `/api/generate-dish` locally with the real key, use the Vercel dev
server instead of a plain static server:

```bash
vercel dev
```

## What this does NOT do

- No auth, no per-user rate limiting, no cost cap beyond `max_tokens` per
  call. `/api/generate-dish` is reachable by anyone who has the deployed
  URL — fine for a hackathon demo, not a production safeguard. If this
  needs to survive real traffic, add Vercel's rate limiting / Firewall
  rules, or a signed token issued by the page itself.
- No persistence. Generated dishes live only in the browser tab's memory
  (same as the rest of CookTree's state) — refresh and they're gone.
