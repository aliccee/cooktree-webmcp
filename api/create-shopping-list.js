/**
 * Vercel Serverless Function — POST /api/create-shopping-list
 *
 * Turns CookTree's computed shortages into an Instacart shopping-list link.
 * Instacart performs the real product and retailer matching; CookTree never
 * receives a delivery address, payment method, or Instacart session.
 *
 * Required Vercel env var:
 *   INSTACART_API_KEY=keys.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Optional:
 *   INSTACART_API_ENV=production  (defaults to the development server)
 */

const DEVELOPMENT_ORIGIN = 'https://connect.dev.instacart.tools';
const PRODUCTION_ORIGIN = 'https://connect.instacart.com';
const CREATE_LINK_PATH = '/idp/v1/products/products_link';
const MAX_LINE_ITEMS = 50;

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return Math.round(Math.min(quantity, 10000) * 10) / 10;
}

function measurementUnit(unit) {
  if (unit === 'g' || unit === 'ml') return unit;
  return 'each';
}

function normalizeLineItem(raw) {
  const name = cleanString(raw && raw.name, 100);
  const quantity = cleanQuantity(raw && raw.quantity);
  if (!name || quantity === null) return null;

  const displayText = cleanString(raw && raw.displayText, 150);
  return {
    name,
    ...(displayText ? { display_text: displayText } : {}),
    line_item_measurements: [{
      quantity,
      unit: measurementUnit(raw && raw.unit),
    }],
  };
}

function normalizeInstacartUrl(value) {
  try {
    const url = new URL(value);
    const allowed = url.protocol === 'https:' &&
      (url.hostname === 'instacart.com' || url.hostname.endsWith('.instacart.com') ||
       url.hostname === 'instacart.tools' || url.hostname.endsWith('.instacart.tools'));
    return allowed ? url.href : null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const apiKey = process.env.INSTACART_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'Instacart is not configured yet',
      code: 'INSTACART_NOT_CONFIGURED',
    });
    return;
  }

  const rawItems = Array.isArray(req.body && req.body.lineItems) ? req.body.lineItems : [];
  if (rawItems.length > MAX_LINE_ITEMS) {
    res.status(400).json({ error: `no more than ${MAX_LINE_ITEMS} line items are allowed` });
    return;
  }
  const inputItems = rawItems;
  const lineItems = inputItems.map(normalizeLineItem).filter(Boolean);
  if (!lineItems.length) {
    res.status(400).json({ error: 'at least one valid line item is required' });
    return;
  }
  if (lineItems.length !== inputItems.length) {
    res.status(400).json({ error: 'one or more line items are invalid' });
    return;
  }

  const environment = process.env.INSTACART_API_ENV === 'production'
    ? 'production'
    : 'development';
  const apiOrigin = environment === 'production' ? PRODUCTION_ORIGIN : DEVELOPMENT_ORIGIN;
  const title = cleanString(req.body && req.body.title, 100) || 'CookTree grocery list';
  const linkbackUrl = cleanString(process.env.SITE_URL, 500) ||
    'https://cooktree-webmcp.vercel.app/';
  const payload = {
    title,
    link_type: 'shopping_list',
    expires_in: 30,
    instructions: [
      'Choose a nearby store, review Instacart\u2019s product matches, and confirm current prices before checkout.',
    ],
    line_items: lineItems,
    ...(linkbackUrl ? {
      landing_page_configuration: { partner_linkback_url: linkbackUrl },
    } : {}),
  };

  let upstream;
  try {
    upstream = await fetch(apiOrigin + CREATE_LINK_PATH, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    res.status(502).json({ error: 'Instacart request failed: ' + error.message });
    return;
  }

  let body;
  try {
    body = await upstream.json();
  } catch {
    body = null;
  }

  if (!upstream.ok) {
    console.error('[create-shopping-list] Instacart error', {
      status: upstream.status,
      environment,
    });
    const detail = body && (body.error_description || body.message || body.error);
    res.status(502).json({
      error: 'Instacart could not create the shopping list',
      detail: cleanString(detail, 200),
    });
    return;
  }

  const shoppingUrl = normalizeInstacartUrl(body && body.products_link_url);
  if (!shoppingUrl) {
    res.status(502).json({ error: 'Instacart returned an invalid shopping-list URL' });
    return;
  }

  res.status(200).json({
    shoppingUrl,
    provider: 'Instacart',
    environment,
    itemCount: lineItems.length,
    expiresInDays: 30,
  });
};
