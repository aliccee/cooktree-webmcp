/**
 * Vercel Serverless Function — POST /api/create-shopping-list
 *
 * Resolves CookTree shortages against Shopify's live Global Catalog. No
 * retailer key or shopper account is required: the response contains real
 * products grouped into merchant-owned Shopify cart permalinks. The shopper
 * still reviews products, shipping, taxes, and payment on each merchant site.
 */

const SHOPIFY_CATALOG_URL = 'https://catalog.shopify.com/api/ucp/mcp';
const SHOPIFY_AGENT_PROFILE =
  'https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json';
const MAX_LINE_ITEMS = 20;
const OFFERS_PER_ITEM = 20;
const REQUEST_TIMEOUT_MS = 12_000;

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return Math.max(1, Math.min(99, Math.ceil(quantity)));
}

function cleanPostalCode(value) {
  const postalCode = cleanString(value, 10).toUpperCase();
  if (!postalCode) return '';
  return /^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/.test(postalCode) ? postalCode : null;
}

function normalizeLineItem(raw, index) {
  const name = cleanString(raw && raw.name, 100);
  const quantity = cleanQuantity(raw && raw.quantity);
  if (!name || quantity === null) return null;
  return {
    id: cleanString(raw && raw.id, 80) || `line-${index + 1}`,
    name,
    quantity,
    displayText: cleanString(raw && raw.displayText, 150),
  };
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function variantNumber(id, checkoutUrl) {
  const gidMatch = cleanString(id, 120).match(/ProductVariant\/(\d+)$/);
  if (gidMatch) return gidMatch[1];
  const cartMatch = cleanString(checkoutUrl, 500).match(/\/cart\/(\d+):/);
  return cartMatch ? cartMatch[1] : null;
}

function structuredContent(body) {
  if (body && body.result && body.result.structuredContent) {
    return body.result.structuredContent;
  }
  const blocks = body && body.result && Array.isArray(body.result.content)
    ? body.result.content
    : [];
  const text = blocks.find(block => block && block.type === 'text' && block.text);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.text);
    return parsed.structuredContent || parsed;
  } catch {
    return null;
  }
}

async function searchCatalog(lineItem, postalCode) {
  const location = { country: 'US' };
  const context = { address_country: 'US', currency: 'USD' };
  if (postalCode) {
    location.postal_code = postalCode;
    context.postal_code = postalCode;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(SHOPIFY_CATALOG_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: lineItem.id,
        params: {
          name: 'search_catalog',
          arguments: {
            meta: { 'ucp-agent': { profile: SHOPIFY_AGENT_PROFILE } },
            catalog: {
              // Keep the query to plain product terms. Appending the pack/quantity
              // phrase (e.g. "2 × 1 head") dilutes search relevance and can knock a
              // seller who'd otherwise cover this item out of the results.
              query: `${lineItem.name} grocery`.trim(),
              filters: { available: true, ships_to: location },
              context,
              pagination: { limit: OFFERS_PER_ITEM },
            },
          },
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.error) {
    throw new Error(`Shopify catalog search failed (${response.status})`);
  }

  const content = structuredContent(body);
  const products = content && Array.isArray(content.products) ? content.products : [];
  const offers = [];

  for (const product of products) {
    const variants = Array.isArray(product && product.variants) ? product.variants : [];
    for (const variant of variants) {
      if (variant && variant.availability && variant.availability.available === false) continue;
      const seller = variant && variant.seller;
      const sellerName = cleanString(seller && seller.name, 120);
      const sellerDomain = cleanString(seller && seller.domain, 180).toLowerCase();
      const sellerUrl = safeHttpsUrl(seller && seller.url);
      const checkoutUrl = safeHttpsUrl(variant && variant.checkout_url);
      const productUrl = safeHttpsUrl(variant && variant.url);
      const variantId = variantNumber(variant && variant.id, checkoutUrl);
      const amount = Number(variant && variant.price && variant.price.amount);
      const currency = cleanString(variant && variant.price && variant.price.currency, 3) || 'USD';
      if (!sellerName || !sellerDomain || !sellerUrl || !checkoutUrl || !variantId ||
          !Number.isInteger(amount) || amount < 0 || currency !== 'USD') continue;

      offers.push({
        lineId: lineItem.id,
        requestedName: lineItem.name,
        quantity: lineItem.quantity,
        productTitle: cleanString(product && product.title, 160) || lineItem.name,
        variantTitle: cleanString(variant && variant.title, 160),
        sellerName,
        sellerDomain,
        sellerUrl,
        variantId,
        productUrl,
        checkoutUrl,
        unitAmount: amount,
        totalAmount: amount * lineItem.quantity,
        currency,
      });
    }
  }

  const cheapestBySeller = new Map();
  for (const offer of offers) {
    const previous = cheapestBySeller.get(offer.sellerDomain);
    if (!previous || offer.unitAmount < previous.unitAmount) {
      cheapestBySeller.set(offer.sellerDomain, offer);
    }
  }
  return [...cheapestBySeller.values()];
}

// Greedy maximum-coverage set cover: repeatedly pick whichever seller covers
// the most still-unassigned line items (ties broken by lowest combined price
// for those items), assign it everything it covers, and repeat on what's
// left. This minimizes the number of resulting merchant carts instead of
// picking one "primary" seller and then an independent top match per
// leftover item (which can scatter across many different sellers).
function chooseOffers(searches) {
  const bySeller = new Map(); // sellerDomain -> Map(lineId -> offer)
  searches.forEach(({ lineItem, offers }) => {
    offers.forEach(offer => {
      let items = bySeller.get(offer.sellerDomain);
      if (!items) { items = new Map(); bySeller.set(offer.sellerDomain, items); }
      const existing = items.get(lineItem.id);
      if (!existing || offer.unitAmount < existing.unitAmount) items.set(lineItem.id, offer);
    });
  });

  const remaining = new Map(searches.map(({ lineItem }) => [lineItem.id, lineItem]));
  const selected = [];
  let primaryDomain = null;

  while (remaining.size) {
    let best = null;
    for (const [domain, items] of bySeller) {
      let coverage = 0, total = 0;
      for (const lineId of remaining.keys()) {
        const offer = items.get(lineId);
        if (offer) { coverage += 1; total += offer.totalAmount; }
      }
      if (coverage === 0) continue;
      if (!best || coverage > best.coverage || (coverage === best.coverage && total < best.total)) {
        best = { domain, coverage, total };
      }
    }
    if (!best) break; // no seller covers any remaining item
    if (primaryDomain === null) primaryDomain = best.domain;
    const items = bySeller.get(best.domain);
    for (const lineId of [...remaining.keys()]) {
      const offer = items.get(lineId);
      if (offer) { selected.push(offer); remaining.delete(lineId); }
    }
  }

  const unmatched = [...remaining.values()].map(lineItem => lineItem.name);
  return { selected, unmatched, primaryDomain };
}

function cartUrlForGroup(group) {
  try {
    const origin = new URL(group.sellerUrl).origin;
    const cart = group.items
      .map(item => `${item.variantId}:${item.quantity}`)
      .join(',');
    return `${origin}/cart/${cart}?utm_source=cooktree&utm_medium=agent`;
  } catch {
    return group.items[0] && group.items[0].checkoutUrl;
  }
}

function groupOffers(selected, primaryDomain) {
  const bySeller = new Map();
  selected.forEach(offer => {
    const group = bySeller.get(offer.sellerDomain) || {
      sellerName: offer.sellerName,
      sellerDomain: offer.sellerDomain,
      sellerUrl: offer.sellerUrl,
      items: [],
      subtotalAmount: 0,
      currency: offer.currency,
    };
    group.items.push(offer);
    group.subtotalAmount += offer.totalAmount;
    bySeller.set(offer.sellerDomain, group);
  });

  return [...bySeller.values()]
    .map(group => ({
      ...group,
      shoppingUrl: cartUrlForGroup(group),
      itemCount: group.items.length,
      recommended: group.sellerDomain === primaryDomain,
    }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.itemCount - a.itemCount);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const rawItems = Array.isArray(req.body && req.body.lineItems) ? req.body.lineItems : [];
  if (!rawItems.length) {
    res.status(400).json({ error: 'at least one line item is required' });
    return;
  }
  if (rawItems.length > MAX_LINE_ITEMS) {
    res.status(400).json({ error: `no more than ${MAX_LINE_ITEMS} line items are allowed` });
    return;
  }

  const lineItems = rawItems.map(normalizeLineItem);
  if (lineItems.some(item => !item)) {
    res.status(400).json({ error: 'one or more line items are invalid' });
    return;
  }
  const postalCode = cleanPostalCode(req.body && req.body.postalCode);
  if (postalCode === null) {
    res.status(400).json({ error: 'postal code is invalid' });
    return;
  }

  const results = await Promise.allSettled(
    lineItems.map(lineItem => searchCatalog(lineItem, postalCode))
  );
  const searches = results.map((result, index) => ({
    lineItem: lineItems[index],
    offers: result.status === 'fulfilled' ? result.value : [],
    failed: result.status === 'rejected',
  }));
  const failedSearches = searches.filter(search => search.failed).length;
  const { selected, unmatched, primaryDomain } = chooseOffers(searches);
  if (!selected.length) {
    res.status(502).json({
      error: 'Shopify could not find purchasable products for this list right now',
      code: 'SHOPIFY_NO_MATCHES',
    });
    return;
  }

  const groups = groupOffers(selected, primaryDomain);
  const liveTotalAmount = groups.reduce((sum, group) => sum + group.subtotalAmount, 0);
  res.status(200).json({
    provider: 'Shopify Global Catalog',
    source: 'live',
    postalCode: postalCode || null,
    requestedItemCount: lineItems.length,
    matchedItemCount: selected.length,
    unmatched,
    groups,
    liveTotalAmount,
    currency: 'USD',
    warnings: [
      ...(groups.length > 1 ? [`Products are split across ${groups.length} merchant carts.`] : []),
      ...(failedSearches ? [`${failedSearches} catalog search${failedSearches === 1 ? '' : 'es'} timed out or failed.`] : []),
      'Shipping, taxes, substitutions, and final availability are confirmed by each merchant.',
    ],
  });
};
