import { COMMERCE_CONFIG, checkoutStorageKey, isSupportedCheckoutCart, ORDER_ID_PATTERN } from "./commerce-config.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCatalog(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(product =>
    typeof product?.id === "string" && product.id.trim() &&
    (product.active === 1 || product.active === true)
  );
}

export function normalizeCart(cart) {
  if (!Array.isArray(cart)) return [];
  const quantities = new Map();
  for (const item of cart) {
    const productId = cleanText(item?.product_id);
    const quantity = item?.quantity;
    if (!productId || !Number.isInteger(quantity) || quantity < 1) continue;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
}

export function createCheckoutRequest({ cart, customer, shippingRateId }) {
  const address = customer?.shipping_address || {};
  return {
    customer: {
      email: cleanText(customer?.email).toLowerCase(),
      first_name: cleanText(customer?.first_name),
      last_name: cleanText(customer?.last_name),
      phone: cleanText(customer?.phone) || null,
      shipping_address: {
        name: cleanText(address.name),
        address_line1: cleanText(address.address_line1),
        address_line2: cleanText(address.address_line2) || null,
        city: cleanText(address.city),
        state: cleanText(address.state).toUpperCase(),
        postal_code: cleanText(address.postal_code),
        country: cleanText(address.country).toUpperCase()
      }
    },
    items: normalizeCart(cart),
    ...(cleanText(shippingRateId) ? { shipping_rate_id: cleanText(shippingRateId) } : {})
  };
}

export function createShippingRateRequest(input) {
  const request = createCheckoutRequest(input);
  return { customer_email: request.customer.email, shipping_address: request.customer.shipping_address, items: request.items };
}

export function selectedShippingRate(selection, requestFingerprint, now = Date.now()) {
  if (!selection || selection.requestFingerprint !== requestFingerprint) return null;
  return selection.rates?.find(rate => rate.rate_id === selection.rateId && Number.isSafeInteger(rate.expires_at) && rate.expires_at > now) || null;
}

export function checkoutFingerprint(request) {
  return JSON.stringify(request);
}

export function normalizeCheckoutOrder(order) {
  if (!ORDER_ID_PATTERN.test(order?.id || "") || typeof order.order_number !== "string" || !order.order_number ||
      !["PENDING", "PAYMENT_PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "FAILED"].includes(order.status) || order.currency !== "USD" ||
      ![order.subtotal, order.tax, order.shipping, order.total].every(value => Number.isSafeInteger(value) && value >= 0) ||
      order.total !== order.subtotal + order.tax + order.shipping) return null;
  return Object.fromEntries(["id", "order_number", "status", "currency", "subtotal", "tax", "shipping", "total"].map(key => [key, order[key]]));
}

export function prepareCheckoutAttempt({ request, stored = null, hold = null, cartRevision, uuid = () => crypto.randomUUID() }) {
  // An unknown or pending server effect must be resolved using the original
  // request and identity, including its original shipping rate.
  if (stored) return stored;
  if (hold) throw new Error("Previous checkout requires reconciliation");
  return { request, fingerprint: checkoutFingerprint(request), key: `checkout-${uuid()}`, cartRevision };
}

export function readCheckoutHold({ storage, config = COMMERCE_CONFIG }) {
  const storageKey = checkoutStorageKey("checkout-hold", config);
  if (!storageKey) return null;
  const raw = storage.getItem(storageKey);
  if (!raw) return null;
  const hold = JSON.parse(raw);
  if (!hold || typeof hold.key !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(hold.key) ||
      !(hold.orderId === null || (typeof hold.orderId === "string" && ORDER_ID_PATTERN.test(hold.orderId)))) throw new Error("Saved checkout requires reconciliation");
  return { key: hold.key, orderId: hold.orderId };
}

export function clearLegacyPersonalCheckoutState(storage) {
  const raw = storage.getItem("nutrileaf-checkout-attempt");
  if (raw) {
    let key = null;
    try { const attempt = JSON.parse(raw); if (typeof attempt?.key === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(attempt.key)) key = attempt.key; } catch {}
    // Legacy state belongs to TEST. Retain only its retry identity in a
    // separate namespace; it cannot become a production recovery record.
    storage.setItem("nutrileaf-legacy-test-checkout-hold", JSON.stringify({ key }));
    storage.removeItem("nutrileaf-checkout-attempt");
  }
  storage.removeItem("nutrileaf-checkout-draft");
}

export function readCheckoutAttempt({ storage, config = COMMERCE_CONFIG }) {
  const storageKey = checkoutStorageKey("checkout-attempt", config);
  if (!storageKey) return null;
  const raw = storage.getItem(storageKey);
  if (!raw) return null;
  const attempt = JSON.parse(raw);
  if (!attempt || typeof attempt.key !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(attempt.key) ||
      !isSupportedCheckoutCart(attempt.request?.items, config) || !cleanText(attempt.request?.shipping_rate_id) ||
      typeof attempt.request?.customer?.email !== "string" || typeof attempt.cartRevision !== "string" || !attempt.cartRevision ||
      attempt.fingerprint !== checkoutFingerprint(attempt.request) || (attempt.order && !normalizeCheckoutOrder(attempt.order))) {
    throw new Error("Saved checkout requires review");
  }
  return { request: attempt.request, fingerprint: attempt.fingerprint, key: attempt.key, cartRevision: attempt.cartRevision,
    ...(attempt.order ? { order: normalizeCheckoutOrder(attempt.order) } : {}) };
}

export function saveCheckoutAttempt({ storage, holdStorage = storage, config = COMMERCE_CONFIG, attempt }) {
  const storageKey = checkoutStorageKey("checkout-attempt", config);
  if (!storageKey) return false;
  const priorHold = readCheckoutHold({ storage: holdStorage, config });
  if (priorHold && priorHold.key !== attempt.key) throw new Error("Previous checkout requires reconciliation");
  storage.setItem(storageKey, JSON.stringify(attempt));
  holdStorage.setItem(checkoutStorageKey("checkout-hold", config), JSON.stringify({ key: attempt.key, orderId: attempt.order?.id || priorHold?.orderId || null }));
  return true;
}

export function clearCompletedCheckout({ storage, cartStorage = storage, holdStorage = cartStorage, config = COMMERCE_CONFIG, orderId, statusResult }) {
  const publicOrder = statusResult?.payload?.order;
  const paid = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(publicOrder?.status);
  const terminal = ["CANCELLED", "FAILED", "REFUNDED"].includes(publicOrder?.status);
  if (statusResult?.action !== "status" || statusResult.status !== 200 || (!paid && !terminal)) return false;
  try {
    const attempt = readCheckoutAttempt({ storage, config });
    const hold = readCheckoutHold({ storage: holdStorage, config });
    const knownAttempt = attempt?.order?.id === orderId && attempt.order.order_number === publicOrder.number;
    if (attempt?.order ? !knownAttempt : hold?.orderId !== orderId) return false;
    const revisionKey = checkoutStorageKey("cart-revision", config);
    const currentCart = normalizeCart(JSON.parse(cartStorage.getItem("nutrileaf-cart-v2") || "[]"));
    const clearCart = paid && knownAttempt && cartStorage.getItem(revisionKey) === attempt.cartRevision &&
      checkoutFingerprint(currentCart) === checkoutFingerprint(attempt.request.items);
    if (clearCart) { cartStorage.setItem("nutrileaf-cart-v2", "[]"); cartStorage.removeItem(revisionKey); }
    for (const name of ["checkout-attempt", "checkout-draft", `payment-operation:${orderId}`]) storage.removeItem(checkoutStorageKey(name, config));
    holdStorage.removeItem(checkoutStorageKey("checkout-hold", config));
    return clearCart;
  } catch { return false; }
}

export function validateCheckoutRequest(request) {
  const errors = {};
  const customer = request?.customer || {};
  const address = customer.shipping_address || {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || "")) errors.email = "Enter a valid email address.";
  if (!customer.first_name) errors.first_name = "Enter a first name.";
  if (!customer.last_name) errors.last_name = "Enter a last name.";
  if (!address.name) errors.name = "Enter the recipient name.";
  if (!address.address_line1) errors.address_line1 = "Enter a street address.";
  if (!address.city) errors.city = "Enter a city.";
  if (!/^[A-Z]{2}$/.test(address.state || "")) errors.state = "Enter a two-letter state code.";
  if (!/^\d{5}(?:-\d{4})?$/.test(address.postal_code || "")) errors.postal_code = "Enter a valid US ZIP code.";
  if (address.country !== "US") errors.country = "Shipping country must be US.";
  if (!Array.isArray(request?.items) || request.items.length === 0) errors.items = "Add at least one available product to your cart.";
  return errors;
}

export function checkoutKeyFor(fingerprint, stored) {
  if (stored?.fingerprint === fingerprint && typeof stored.key === "string" && stored.key) return stored.key;
  return `checkout-${crypto.randomUUID()}`;
}

export function checkoutResultAction(status, payload = null) {
  if (status === 201) return "confirm";
  if (status === 400) return "inline-error";
  if (status === 404) return "refresh-catalog";
  if (status === 409 && payload?.error?.code === "PRODUCT_UNAVAILABLE") return "product-unavailable";
  if (status === 409 && ["SHIPPING_RATE_REQUIRED", "SHIPPING_RATE_EXPIRED", "SHIPPING_RATE_UNAVAILABLE", "SHIPPING_RATE_MISMATCH"].includes(payload?.error?.code)) return "refresh-shipping";
  if (status === 409 && payload?.error?.code === "SHIPPING_RATE_CONFLICT") return "retry";
  if (status === 409) return "restart-attempt";
  if (status === 503) return "tax-outage";
  return "retry";
}
