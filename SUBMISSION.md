# CookTree — submission text

**Live:** https://cooktree-webmcp.vercel.app/
**Repo:** https://github.com/aliccee/cooktree-webmcp (MIT)

Open in Chrome with WebMCP enabled (`chrome://flags`, or the origin trial) — the
header pill turns green and reads `WebMCP connected · 12 tools`. Without it the
pill reads `local agent` and a small built-in intent router drives the identical
tool layer, so nothing in the demo depends on a client being attached.

---

## Why this use case is a strong fit for WebMCP

Meal planning is a dependency graph pretending to be a list: what's in the
kitchen → what you're cooking → what's missing → what you actually buy. Change
one node and the whole graph recomputes, and **none of that recomputation ever
exists in the DOM**. Five dishes wanting garlic is not five rows on a page; it's
one head of garlic after deduping across dishes, subtracting what's already in
the kitchen, and rounding up to a real pack size. There is nothing there to
scrape, because the page never renders it.

But the deeper fit is the account. A grocery site holds a card, a delivery
address, an order history and a spend limit. An agent that can plan dinner has
no business touching any of them. Today there are only two ways to let an agent
act on your behalf: hand it the browser, where it inherits the entire
authenticated session, or issue it a token that outlives the session and can be
replayed elsewhere. Neither is "a little bit of access."

Cooking is the version of this you can understand in ninety seconds. The
mechanism matters most in banking, health portals and internal admin consoles —
places where the list of things a site must *not* hand over is long.

## How it creates a better user experience

One sentence replaces a planning session: *"Three dinners this week, nothing
over 45 minutes."* The tree grows, 21 ingredient requests collapse into 16
unique ingredients and 8 things to actually buy, at $41.10. Say *"drop the mapo
tofu"* and the cart returns what changed — three lines gone, −$14.70 — instead
of a page you have to re-read. Say *"I used up the garlic"* and the buy list
grows to match. Describe a dish the catalogue has never heard of — in English or
in Chinese — and `generate_dish` returns a real recipe with quantities, cookware
and a generated photograph, then plans it through the same engine as the
built-in dishes. The site checks those quantities against its own pack sizes
before accepting them: a model asking for 3 g of onion when an onion is a 200 g
pack is a unit slip, and the console says so. The model is a source, not an
authority.

The site's own buttons call the same twelve functions the agent calls. Clicking
an ingredient fires `explain_shortage`; clicking a dish fires `plan_week`. There
is no separate agent path that can drift out of sync with the UI.

And at the one moment that reaches outside CookTree, the *site* renders the
confirmation — not the agent. The agent is blocked until a person clicks, and
what it gets back is a set of merchant carts, never a payment.

## What people and agents can do together that was difficult or impossible before

**A site can hand over part of itself.** CookTree registers twelve functions.
`update_delivery_address`, `update_payment_method`, `read_order_history` and
`update_spend_limit` are deliberately not among them. Ask the agent to change
the delivery address and it fails through the real unknown-tool path — no fake
refusal branch:

```
→ update_delivery_address { "address": "42 Mission St" }
✕ no such tool — 12 registered, this is not one of them
   the site never exposed it · a click-agent would open Settings and change it
```

That granularity is finer than "categories." `get_order_status` *is* registered
— it covers handoffs this agent created. Reading the merchant account's order
history is a different scope and has no tool. The same noun splits into an
exposed half and a withheld half.

**Capability without credential.** The agent never receives a cookie, a card or
a session — not because they are well guarded, but because they were never in
the tool layer at all.

Checkout is where this stops being a slogan. After an in-page human review,
CookTree sends product names and quantities to the Shopify catalog and gets back
live listings and real carts. Then it stops. **The person completes payment on
the merchant's own page.** CookTree holds no payment method, no delivery address
and no merchant session — so there is nothing there to leak, and nothing an
agent could reach even if it tried. That boundary is the design, not an
unfinished edge: a version of this that took payment would be a version that
had to hold a card, which is the exact thing the argument says a site should not
have to hand over.

**Tool results are deltas, not screenshots.** `plan_week` and `remove_dish`
return the diff plus merge statistics. A pixel-driven agent has to re-read the
whole page after every action and diff two screenshots itself.

Honest boundary: this is least privilege, not a security perimeter. An agent
that already has DOM access can bypass it. The point is that a cooperating agent
never needs that access in the first place, and the site gets to define the
surface it is willing to support.

## How we implemented WebMCP

Twelve tools are defined once in `§4 TOOLS[]` of `index.html` and registered
individually:

```js
document.modelContext.registerTool({
  name: "search_dishes",
  description: "Find dishes by cooking time, cuisine, ingredients to use up…",
  inputSchema: { /* … */ },
  execute: async (input) => { /* … */ }
});
```

Registration reads `document.modelContext ?? navigator.modelContext` — the
property moved during the draft and both spellings still appear in the wild —
and falls back to `provideContext({tools})` where `registerTool` is absent.

Every tool body routes through one `invoke(name, args)` function, which is also
what the site's own buttons call, and which prints each call, its arguments,
result and latency to an on-page agent console. That console is an X-ray for
judging, not a product surface; the toggle says `user view / developer view`.

The app is a single static HTML file with no build step. Two Vercel Functions
sit behind it so their keys stay server-side and never reach the browser or the
repository: `api/generate-dish.js` (free text → a real plannable dish and a generated
photograph of it, via OpenRouter) and `api/create-shopping-list.js` (shortages →
live Shopify listings and real carts). On static hosting with no `/api` route,
those two tools return a clear error and the other ten keep working.
