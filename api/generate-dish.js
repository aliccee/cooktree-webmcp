/**
 * Vercel Serverless Function — POST /api/generate-dish
 *
 * The only job of this function: hold the OpenRouter key server-side and turn
 * a free-text dish description into the same shape CookTree's own DISHES[]
 * entries use, so the site can add it as a real, plannable dish.
 *
 * The client (index.html) never sees the key — it only ever calls this
 * same-origin route. Set the key with:
 *   vercel env add OPENROUTER_API_KEY
 */

const SYSTEM_PROMPT = `You turn a home cook's free-text dish description into strict JSON for a recipe-planning app. Output ONLY a JSON object, no markdown fences, no commentary.

Schema:
{
  "name": string,            // English dish name, <=40 chars
  "cn": string,               // Chinese name if applicable, else ""
  "cuisine": string,          // one lowercase word, e.g. sichuan, cantonese, thai, italian, home, japanese, korean, mexican
  "min": integer,             // realistic cook time in minutes, 5-240
  "serves": integer,          // default 2 unless the description implies otherwise
  "gear": string[],           // subset of ["wok","pot","steamer"] this dish needs; [] if none of those apply
  "glyph": string,            // closest one of: pot, bowl, plate, noodle, fish
  "ingredients": [
    {
      "name": string,         // ingredient name, plain English, <=30 chars
      "qty": number,           // TOTAL amount needed to cook this whole dish (not per serving)
      "unit": "g" | "ml" | "pc",   // grams for solids, ml for liquids, pc for countable items (eggs, cloves...)
      "category": "ingredient" | "seasoning",
      "packSize": number,      // typical single store-pack size, same unit as "unit"
      "packLabel": string,     // short human label for one pack, e.g. "1 bottle", "1 head", "500 g"
      "packPrice": number      // realistic USD price for one pack, 0.3-40
    }
  ]
}

Rules:
- 3 to 12 ingredients. Merge trivial ones (don't list "water").
- qty is realistic for the stated "serves" count.
- Return nothing but the JSON object.`;

const MODEL = 'deepseek/deepseek-v4-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_DESC_LEN = 300;

function num(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max).trim() : '';
}
function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'item';
}

const ALLOWED_GEAR = new Set(['wok', 'pot', 'steamer']);
const ALLOWED_GLYPH = new Set(['pot', 'bowl', 'plate', 'noodle', 'fish']);
const ALLOWED_UNIT = new Set(['g', 'ml', 'pc']);
const ALLOWED_CAT = new Set(['ingredient', 'seasoning']);

function validateDish(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('model did not return an object');
  const name = str(raw.name, 40);
  if (!name) throw new Error('missing dish name');
  const ingredientsIn = Array.isArray(raw.ingredients) ? raw.ingredients.slice(0, 12) : [];
  if (!ingredientsIn.length) throw new Error('no ingredients');

  const ingredients = ingredientsIn.map((it) => {
    const iname = str(it && it.name, 30);
    if (!iname) throw new Error('ingredient missing name');
    const unit = ALLOWED_UNIT.has(it && it.unit) ? it.unit : 'g';
    const category = ALLOWED_CAT.has(it && it.category) ? it.category : 'ingredient';
    return {
      id: slug(iname),
      name: iname,
      qty: num(it && it.qty, 0.1, 5000, 100),
      unit,
      category,
      packSize: num(it && it.packSize, 1, 5000, unit === 'pc' ? 1 : 100),
      packLabel: str(it && it.packLabel, 20) || '1 pack',
      packPrice: num(it && it.packPrice, 0.1, 50, 2),
    };
  });

  return {
    id: slug(name) + '-' + Math.random().toString(36).slice(2, 6),
    name,
    cn: str(raw.cn, 20),
    cuisine: (str(raw.cuisine, 20) || 'home').toLowerCase(),
    min: Math.round(num(raw.min, 5, 240, 30)),
    serves: Math.round(num(raw.serves, 1, 8, 2)),
    gear: (Array.isArray(raw.gear) ? raw.gear : []).filter((g) => ALLOWED_GEAR.has(g)).slice(0, 3),
    glyph: ALLOWED_GLYPH.has(raw.glyph) ? raw.glyph : 'bowl',
    ingredients,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const description = str(req.body && req.body.description, MAX_DESC_LEN);
  if (!description) { res.status(400).json({ error: 'description is required' }); return; }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'server missing OPENROUTER_API_KEY' }); return; }

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://cooktree-webmcp.vercel.app',
        'X-Title': 'CookTree',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: description },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 700,
      }),
    });
  } catch (e) {
    res.status(502).json({ error: 'openrouter request failed: ' + e.message });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    res.status(502).json({ error: 'openrouter error ' + upstream.status, detail: text.slice(0, 300) });
    return;
  }

  const data = await upstream.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) { res.status(502).json({ error: 'empty response from model' }); return; }

  let parsedRaw;
  try {
    parsedRaw = JSON.parse(content);
  } catch {
    res.status(502).json({ error: 'model did not return valid JSON' });
    return;
  }

  let dish;
  try {
    dish = validateDish(parsedRaw);
  } catch (e) {
    res.status(502).json({ error: 'model output failed validation: ' + e.message });
    return;
  }

  res.status(200).json({ dish });
};
