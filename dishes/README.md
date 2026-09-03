# Dish art

Eight illustrations live here — flat top-down plates drawn to match the page's
palette. They are the front of each dish card. The matching realistic photo, shown
when the card is hovered or flipped, lives in `photos/<id>.jpg`; a missing photo
simply makes that card non-flippable, and a missing illustration falls back to the
line drawing. Nothing breaks.

Filenames:

| file | dish |
|---|---|
| `beefstew.jpg`  | Tomato Beef Stew · 番茄牛腩 |
| `mapo.jpg`      | Mapo Tofu · 麻婆豆腐 |
| `curry.jpg`     | Thai Green Curry · 泰式绿咖喱 |
| `friedrice.jpg` | Chicken Fried Rice · 鸡肉蛋炒饭 |
| `bolognese.jpg` | Spaghetti Bolognese · 意式肉酱面 |
| `steamfish.jpg` | Steamed Sea Bass · 清蒸鲈鱼 |
| `broccoli.jpg`  | Garlic Broccoli · 蒜蓉西兰花 |
| `eggdrop.jpg`   | Egg Drop Soup · 蛋花汤 |

Cards crop to 16:10, so landscape shots work best. Around 800×500 is plenty —
keep each file under ~200 KB so the page stays fast on a conference network.

Any file that is missing simply falls back to the line drawing. Nothing breaks.

Source them somewhere the licence is clear — Unsplash and Pexels both allow free
commercial use with no attribution required.


## Regenerating

`generator.html` draws all eight illustrations from a seeded config — open it and
screenshot each `.plate`, or edit a dish's colours and shape counts in the `DISHES`
object at the top. Same seed, same picture, every time.

## Photos

`photos/<id>.jpg` are generated with the same image model and prompt the live
`generate_dish` tool uses, so built-in and AI-generated cards flip to the same kind
of photo:

```bash
node dishes/generate-photos.mjs   # all eight · or pass ids: mapo curry
```

By default the script asks the deployed `/api/generate-dish` for each photo, so no
key is needed locally (`vercel env pull` returns the Sensitive key as an empty
string anyway). With `OPENROUTER_API_KEY` set in the environment it calls
OpenRouter directly instead, which is cheaper.

Output is JPEG, 800px wide (~100–200 KB each). Add a dish to `DISHES[]` in
`index.html` *and* to the list at the top of the script, then run it for that id.
