const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

function browserWindow() {
  return typeof globalThis.window === "object" ? globalThis.window : null;
}

function configuredRuntime() {
  const runtime = browserWindow();
  if (!runtime) return null;
  const measurementId = runtime.NUTRILEAF_GA4_MEASUREMENT_ID;
  if (typeof measurementId !== "string" || !MEASUREMENT_ID_PATTERN.test(measurementId)) return null;
  if (typeof runtime.gtag !== "function") return null;
  return runtime;
}

function finiteMoney(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function currencyCode(value) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null;
}

function sanitizeItem(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.item_id !== "string" || !item.item_id) return null;
  if (typeof item.item_name !== "string" || !item.item_name) return null;
  if (!finiteMoney(item.price)) return null;
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) return null;
  return {
    item_id: item.item_id,
    item_name: item.item_name,
    price: item.price,
    quantity: item.quantity
  };
}

function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const safe = items.map(sanitizeItem);
  return safe.every(Boolean) ? safe : null;
}

function dispatch(eventName, payload) {
  const runtime = configuredRuntime();
  if (!runtime) return false;
  try {
    runtime.gtag("event", eventName, payload);
    return true;
  } catch {
    return false;
  }
}

export function trackViewItem({ item, currency = "USD" } = {}) {
  const safeItem = sanitizeItem(item);
  const safeCurrency = currencyCode(currency);
  if (!safeItem || !safeCurrency) return false;
  return dispatch("view_item", {
    currency: safeCurrency,
    value: safeItem.price * safeItem.quantity,
    items: [safeItem]
  });
}

export function trackAddToCart({ item, currency = "USD" } = {}) {
  const safeItem = sanitizeItem(item);
  const safeCurrency = currencyCode(currency);
  if (!safeItem || !safeCurrency) return false;
  return dispatch("add_to_cart", {
    currency: safeCurrency,
    value: safeItem.price * safeItem.quantity,
    items: [safeItem]
  });
}

export function trackBeginCheckout({ currency, value, items } = {}) {
  const safeCurrency = currencyCode(currency);
  const safeItems = sanitizeItems(items);
  if (!safeCurrency || !finiteMoney(value) || !safeItems) return false;
  return dispatch("begin_checkout", {
    currency: safeCurrency,
    value,
    items: safeItems
  });
}

export function trackPurchase({ transaction_id, currency, value, tax, shipping, items } = {}) {
  if (typeof transaction_id !== "string" || !transaction_id) return false;
  const safeCurrency = currencyCode(currency);
  const safeItems = sanitizeItems(items);
  if (!safeCurrency || !finiteMoney(value) || !finiteMoney(tax) || !finiteMoney(shipping) || !safeItems) return false;

  const runtime = configuredRuntime();
  if (!runtime) return false;
  const marker = `nutrileaf-ga4-purchase:${transaction_id}`;
  try {
    if (runtime.localStorage?.getItem(marker) === "1") return false;
  } catch {}

  const sent = dispatch("purchase", {
    transaction_id,
    currency: safeCurrency,
    value,
    tax,
    shipping,
    items: safeItems
  });
  if (!sent) return false;
  try { runtime.localStorage?.setItem(marker, "1"); } catch {}
  return true;
}
