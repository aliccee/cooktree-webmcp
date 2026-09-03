# CookTree

**An agent-native meal planner. The buttons and the AI call the same API.**

CookTree is a demo of [WebMCP](https://github.com/webmachinelearning/webmcp) — the W3C
draft that lets a website hand an AI agent typed tools instead of making it squint at
pixels. Every dish you click and every sentence you type goes through the *same* thirteen
tool definitions.

The core app is a single HTML file with no dependencies or build step. Most tools run entirely
in the browser; two small Vercel Functions call OpenRouter and Shopify without exposing secrets.

**Live demo → https://cooktree-webmcp.vercel.app/**

![CookTree](docs/02-explain.png)

---

## Why cooking

Meal planning is a dependency graph pretending to be a list.

```
what's in my kitchen  →  what am I cooking  →  what's missing  →  what do I actually buy
```

Change one node and the whole graph recomputes. That recomputation is the thing a
click-driven browser agent cannot see, because **it never exists in the DOM**. It's the
reason a typed tool layer beats screenshots here.

## The three things a click-agent can't do

### 1. Get a diff instead of a screenshot

```js
remove_dish({ dish: "Mapo Tofu" })

→ { removed:  ["Doubanjiang — 1× 1 jar", "Ground pork — 1× 400 g"],
    reduced:  ["Garlic 2× → 1×"],
    delta:    -14.70 }
```

The agent learns exactly what changed. A pixel agent has to re-read the entire page after
every action to find out — and then diff two screenshots itself.

### 2. Merge into things you can actually buy

Five dishes want garlic. A naive list has five garlic rows.

```js
plan_week({ dishes: [...], servings: 2 })

→ merge: { requests: 21, unique: 16, toBuy: 8, total: 41.10 }
```

The merge is part of `plan_week`'s own return, not a second call — asking for the plan and
asking what to buy were never two questions.

Dedupe across dishes, subtract what's already in the kitchen, round up to **real pack
sizes** (garlic is sold as a head, not by the gram). None of these intermediate states are
rendered anywhere. There is nothing to scrape.

### 3. Refuse what was never handed over

Ask the agent to change the delivery address on the account:

```
→ update_delivery_address { "address": "42 Mission St" }
✕ no such tool — 13 registered, this is not one of them
   the site never exposed it · a click-agent would open Settings and change it
```

![Refused](docs/06-refused.png)

The account panel shows the surfaces CookTree deliberately leaves with the retailer:
payment, delivery address, and retailer order history. **None of them is registered as a
tool.** CookTree's agent gets thirteen purpose-built functions and nothing else.

This is the only beat that proves a *structural* difference. The other two only prove
convenience.

### 4. Shop real products without handing over the retailer account

`checkout()` always requires an in-page human review before creating a retailer handoff.

![Confirmation](docs/04-confirm.png)

The site renders its **own** confirmation sheet. The agent is blocked — the console shows
`⏸ awaiting human confirmation` — until a person clicks. CookTree then sends only product
names, quantities, and an optional ZIP code to Shopify's Global Catalog. It searches live
listings, prefers the merchant that covers the most ingredients, and returns one or more
merchant-owned cart links:

```json
{
  "orderId": "CT-K3M9Q2",
  "status": "awaiting_user_checkout",
  "provider": "Shopify Global Catalog",
  "items": 6,
  "groups": [{ "sellerName": "Example Market", "shoppingUrl": "https://.../cart/..." }]
}
```

A handoff, not credentials. The user reviews matched real products, current prices, shipping,
and taxes before completing payment on each Shopify merchant page. CookTree never receives the
card number, full delivery address, or retailer session. The optional ZIP only filters products
that can ship to the area; it is not a claim that a physical store is nearby. Confirming inside
CookTree does not charge the user.

**This is the argument.** WebMCP's value isn't that it's faster than clicking. It's that the
site keeps its secrets and defines its own permission boundary, in code, instead of hoping a
model behaves.

---

## The tool layer

Thirteen tools, defined once in `§4 TOOLS[]`. The site's UI calls `invoke()`; so does the agent.

Twelve stay inside CookTree's planning boundary (including one outside AI call). Exactly one
can create a real-retailer handoff, and it always stops for a human first. Final payment remains
on the retailer page.

| Tool | What it does | If it fired 100× by mistake |
|---|---|---|
| `get_kitchen` | What you already own | nothing happens |
| `add_to_kitchen` | Record inventory | reversible |
| `remove_from_kitchen` | Take something out — you used it up | reversible |
| `search_dishes` | Filter by time / cuisine / must-use | nothing happens |
| `plan_week` | Set the week — returns a **diff plus merge stats**, not a page | a draft gets messy |
| `remove_dish` | Drop a dish — returns what vanishes and what shrinks | a draft gets messy |
| `set_portions` | Rescale one dish and every downstream quantity | a draft gets messy |
| `add_gear_to_cart` | Add missing cookware to the computed list | a draft gets messy |
| `explain_shortage` | Why is this on my list, who needs it, substitutes | nothing happens |
| `set_favorite` | Keep a dish at the front of a long list | reversible |
| `get_order_status` | Status of the retailer handoff **this agent created** | nothing happens |
| `generate_dish` | Free text → a real dish via DeepSeek plus a matching dish image via Nano Banana 2 Lite, merged into the same engine as the built-in 8 | a few extra catalog rows |
| `checkout` | **Human-gated.** Creates a real-product shopping list; payment stays at the retailer | an external list is created |

`generate_dish` calls `/api/generate-dish`; `checkout` calls `/api/create-shopping-list`.
Both are Vercel Functions (see `DEPLOY.md`); only dish generation needs a provider key, which
the browser and git repo never see. On plain static hosting with no `/api` routes, the client-only tools
still work and the two networked tools return clear configuration errors.

Recipe structure and imagery are generated in parallel through the same OpenRouter key. The JSON
recipe uses `deepseek/deepseek-v4-flash-0731:nitro`; the food photo uses
`google/gemini-3.1-flash-lite-image` (Nano Banana 2 Lite). If image generation is unavailable,
the recipe still succeeds and its card falls back to the existing dish glyph.

### How the set was chosen

One question per candidate: **if this fired 100 times by mistake, what happens?**

| Answer | Verdict |
|---|---|
| Nothing happens | expose |
| A draft gets messy, undo fixes it | expose |
| A retailer handoff is created | expose, but always gate it on a human |
| Money moves | keep the final action on the retailer page |
| **The account becomes someone else's** | **never expose** |

Deliberately **not** registered: `update_delivery_address`, `update_payment_method`,
`read_order_history`, `update_spend_limit`. Asking for any of them fails through the real
unknown-tool path — there is no fake refusal branch.

`update_delivery_address` is first on that list for a reason. Changing a delivery address is
the classic first step of account takeover: no card is stolen, every future order just ships
somewhere else, and unlike a card change it usually sends no alert.

**Scope, not category.** `get_order_status` *is* registered — it covers checkout handoffs this
agent created in the current tab. Reading the retailer account's order history is a different
scope and has no tool. The same noun splits into an exposed half and a withheld half; that
granularity is the whole point of registering functions instead of handing over a session.

Clicking an ingredient in the tree fires `explain_shortage`. Clicking a dish card fires
`plan_week`. It all shows up in the console as tool calls, because it's all the same layer.

## WebMCP registration

```js
const mc = document.modelContext ?? navigator.modelContext;   // spec moved; keep both
mc.provideContext({ tools: defs });                            // or registerTool() per tool
```

The status pill goes green when the API is present — Chrome 149+ origin trial, or
`chrome://flags`. When it's absent the pill reads **local agent** and a small built-in intent
router drives the identical tools, so the demo runs anywhere.

## Run it

```bash
open index.html          # that's it
```

Or serve it, if you want an origin for the WebMCP origin trial:

```bash
python3 -m http.server 8000
```

## Demo script

Eight preset prompts live in the console sidebar. In order:

1. *"I have tofu and beef. Plan three dinners under 45 minutes."* — `search_dishes` → `plan_week`, tree grows
2. *"Why is Sichuan peppercorn on my list?"* — one dish lights up, everything else dims, substitutes appear
3. *"Drop Mapo Tofu."* — the diff, in one call
4. *"I used up the garlic."* — inventory shrinks, the buy list grows to match
5. *"Change my delivery address to 42 Mission St."* — **refused; the account row lights up**
6. *"Check out."* — human review, then live Shopify products grouped into merchant carts
7. *"Where is my order?"* — answered for this tab's handoff only; retailer history stays out of scope

## Screenshots

| Plan | Diff | Dark |
|---|---|---|
| ![](docs/01-plan.png) | ![](docs/03-diff.png) | ![](docs/05-dark.png) |

## Notes

- Shopify Global Catalog performs live cross-merchant product matching without an API key.
  Products can be filtered by delivery ZIP, but the catalog does not prove physical proximity.
- CookTree prefers a single merchant and never opens more than three carts: it picks the one to
  three merchants that together carry the most items, and lists anything only a further merchant
  carries for your manual list instead.
- Pack sizes and prices in `CATALOG[*].pack` are planning estimates. The retailer page is the
  source of truth for current product availability and prices.
- Data (`§1`), engine (`§3`), tools (`§4`), registration (`§5`), agent (`§6`), render (`§9`).

## License

MIT
