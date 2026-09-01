# CookTree

**An agent-native meal planner. The buttons and the AI call the same API.**

CookTree is a demo of [WebMCP](https://github.com/webmachinelearning/webmcp) — the W3C
draft that lets a website hand an AI agent typed tools instead of making it squint at
pixels. Every dish you click and every sentence you type goes through the *same* eight
tool definitions.

Single HTML file. No dependencies, no build step, no server. Open `index.html`.

**Live demo → https://aliccee.github.io/cooktree-webmcp/**

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
optimize_cart({})

→ 21 ingredient requests across 3 dishes
  → 16 unique ingredients
  → 8 things to buy          ($41.10)
```

Dedupe across dishes, subtract what's already in the kitchen, round up to **real pack
sizes** (garlic is sold as a head, not by the gram). None of these intermediate states are
rendered anywhere. There is nothing to scrape.

### 3. Pay without handing over the card

`checkout()` is declared as requiring human confirmation above a spend limit.

![Confirmation](docs/04-confirm.png)

The site renders its **own** confirmation sheet. The agent is blocked — the console shows
`⏸ awaiting human confirmation` — until a person clicks. Then the tool returns:

```json
{ "orderId": "MM-4821", "total": 26.40, "paymentMethod": "•••• 4242" }
```

A receipt, not credentials. The agent never receives the card number, the billing address,
or the session cookie. A browser-automation agent doing the same task has to screenshot the
whole checkout page — card included.

**This is the argument.** WebMCP's value isn't that it's faster than clicking. It's that the
site keeps its secrets and defines its own permission boundary, in code, instead of hoping a
model behaves.

---

## The tool layer

Eight tools, defined once in `§4 TOOLS[]`. The site's UI calls `invoke()`; so does the agent.

| Tool | What it does |
|---|---|
| `get_kitchen` | What you already own — ingredients, seasonings, cookware |
| `add_to_kitchen` | Record inventory |
| `search_dishes` | Filter by time / cuisine / must-use, ranked by what you already have |
| `plan_week` | Set the week — **returns a diff**, not a page |
| `remove_dish` | Drop a dish — returns which lines vanish and which shrink |
| `explain_shortage` | Why is this on my list, who needs it, what substitutes |
| `optimize_cart` | Dedupe → subtract kitchen → round to pack sizes |
| `checkout` | Human-gated. Card never enters the tool result |

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

Five preset prompts live in the console sidebar. In order:

1. *"I have tofu and beef. Plan three dinners under 45 minutes."* — `search_dishes` → `plan_week`, tree grows
2. *"Why is Sichuan peppercorn on my list?"* — one dish lights up, everything else dims, substitutes appear
3. *"Merge duplicates and show me the real cart."* — 21 → 16 → 8
4. *"Drop Mapo Tofu."* — the diff, in one call
5. *"Check out."* — the confirmation sheet

## Screenshots

| Plan | Diff | Dark |
|---|---|---|
| ![](docs/01-plan.png) | ![](docs/03-diff.png) | ![](docs/05-dark.png) |

## Notes

- The store (*Meridian Market*) is fictional and the card is the standard test number. Nothing
  is charged; there is no backend.
- Pack sizes and prices live in `CATALOG[*].pack`. They're what make merging non-trivial.
- Data (`§1`), engine (`§3`), tools (`§4`), registration (`§5`), agent (`§6`), render (`§9`).

## License

MIT
