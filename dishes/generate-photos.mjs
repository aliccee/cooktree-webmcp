#!/usr/bin/env node
/**
 * Generate a realistic photo for each built-in dish → dishes/photos/<id>.jpg
 *
 * Built-in cards flip to the same kind of photo AI-generated dishes get, so the
 * photos come from the same image model and prompt. Run once (or whenever a
 * built-in dish is added); the JPGs are committed.
 *
 *   node dishes/generate-photos.mjs             # all dishes
 *   node dishes/generate-photos.mjs mapo curry  # just these ids
 *
 * Two ways to reach the model:
 *   1. OPENROUTER_API_KEY in the environment → calls OpenRouter directly (cheapest).
 *   2. Otherwise → POSTs the dish name to the deployed /api/generate-dish, which
 *      holds the key server-side, and keeps the photo from its response. This
 *      is the default because `vercel env pull` returns Sensitive variables as
 *      empty strings, so the key is never available locally.
 *
 * Needs Node 18+ (fetch) and macOS `sips` for PNG → JPG conversion + resize.
 */
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'photos');

// Keep in step with DISHES[] in index.html (id, English name, Chinese name).
const DISHES = [
  ['beefstew',  'Tomato Beef Stew',     '番茄牛腩'],
  ['mapo',      'Mapo Tofu',            '麻婆豆腐'],
  ['curry',     'Thai Green Curry',     '泰式绿咖喱'],
  ['friedrice', 'Chicken Fried Rice',   '鸡肉蛋炒饭'],
  ['bolognese', 'Spaghetti Bolognese',  '意式肉酱面'],
  ['steamfish', 'Steamed Sea Bass',     '清蒸鲈鱼'],
  ['broccoli',  'Garlic Broccoli',      '蒜蓉西兰花'],
  ['eggdrop',   'Egg Drop Soup',        '蛋花汤'],
];

const IMAGE_MODEL = 'google/gemini-3.1-flash-lite-image';
const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images';
const SITE_API = process.env.COOKTREE_API || 'https://cooktree-webmcp.vercel.app/api/generate-dish';
const MAX_WIDTH = 800; // card is 186px wide; 800px keeps it crisp on retina without bloating the repo

// Same prompt as generateDishImage() in api/generate-dish.js.
function photoPrompt(description) {
  return `Editorial overhead food photography of the finished dish: ${description}. ` +
    'Appetizing home-cooked plating, soft natural window light, warm cream tabletop, ' +
    'subtle shadows, realistic ingredients, centered composition, no people, no text, ' +
    'no logos, no watermark, no border.';
}

async function viaOpenRouter(apiKey, description) {
  const res = await fetch(OPENROUTER_IMAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://cooktree-webmcp.vercel.app',
      'X-Title': 'CookTree',
    },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt: photoPrompt(description), resolution: '1K', aspect_ratio: '4:3', n: 1 }),
  });
  if (!res.ok) throw new Error(`image model returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const img = data && Array.isArray(data.data) && data.data[0];
  if (!img || !img.b64_json) throw new Error('no image in response');
  return { buf: Buffer.from(img.b64_json, 'base64'), mediaType: img.media_type || 'image/png' };
}

async function viaSiteApi(description) {
  const res = await fetch(SITE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `api returned ${res.status}`);
  const dataUrl = body.dish && body.dish.image;
  if (!dataUrl) throw new Error('api returned no photo (image ' + (body.image && body.image.status) + ')');
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/s);
  if (!m) throw new Error('unexpected image data URL');
  return { buf: Buffer.from(m[2], 'base64'), mediaType: m[1] };
}

const only = process.argv.slice(2);
const apiKey = process.env.OPENROUTER_API_KEY;
console.log(apiKey ? 'using OpenRouter directly' : `no OPENROUTER_API_KEY — using ${SITE_API}`);
mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const [id, en, cn] of DISHES) {
  if (only.length && !only.includes(id)) continue;
  const out = join(outDir, `${id}.jpg`);
  process.stdout.write(`${id.padEnd(10)} ${en} … `);
  try {
    const description = `${en} (${cn})`;
    const { buf, mediaType } = apiKey ? await viaOpenRouter(apiKey, description) : await viaSiteApi(description);
    const raw = join(outDir, `${id}.raw.${mediaType.split('/')[1].replace('jpeg', 'jpg')}`);
    writeFileSync(raw, buf);
    // Convert to JPEG and cap the width; sips writes in place, so convert then rename.
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '--resampleWidth', String(MAX_WIDTH), raw, '--out', out], { stdio: 'ignore' });
    unlinkSync(raw);
    console.log(`ok (${Math.round(readFileSync(out).length / 1024)} KB)`);
  } catch (e) {
    failed++;
    console.log(`FAILED — ${e.message}`);
  }
}
if (failed) { console.error(`${failed} dish(es) failed; re-run with their ids to retry.`); process.exit(1); }
