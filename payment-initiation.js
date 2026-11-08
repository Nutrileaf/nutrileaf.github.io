import { COMMERCE_CONFIG, commerceApiBase, checkoutStorageKey, ORDER_ID_PATTERN } from "./commerce-config.js";
import { readCheckoutHold } from "./checkout-state.js";
const CHECKOUT_OWNER_KEY = /^checkout-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function paymentRecoveryFeedback(action) {
  if (action === "ownership-required") return {
    retryAllowed: false, checkStatus: true,
    message: "Your saved checkout ownership is unavailable. Check this order's status or contact the store before making another payment."
  };
  return { retryAllowed: true, checkStatus: false, message: action === "conflict"
    ? "This order already has a payment attempt. Please use its existing payment page."
    : "The payment service is temporarily unavailable. Retry safely." };
}

function safeRedirect(value, provider, environment) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (provider === "STRIPE") return url.hostname === "checkout.stripe.com" &&
      new RegExp(`^/(?:c/)?pay/cs_${environment === "production" ? "live" : "test"}_[A-Za-z0-9_]+$`).test(url.pathname);
    return provider === "PAYPAL" && url.hostname === (environment === "production" ? "www.paypal.com" : "www.sandbox.paypal.com") &&
      url.pathname === "/checkoutnow" && Boolean(url.searchParams.get("token"));
  } catch { return false; }
}

export async function submitPaymentInitiation({ config = COMMERCE_CONFIG, orderId, provider, operationId, checkoutKey, fetchImpl = fetch }) {
  const apiBase = commerceApiBase(config);
  if (!apiBase) return { action: "disabled", status: 0, payload: null };
  if (!ORDER_ID_PATTERN.test(orderId || "") || !ORDER_ID_PATTERN.test(operationId || "") || !["STRIPE", "PAYPAL"].includes(provider)) return { action: "invalid", status: 0, payload: null };
  if (config.environment === "production" && !CHECKOUT_OWNER_KEY.test(checkoutKey || "")) return { action: "ownership-required", status: 0, payload: null };
  try {
    const response = await fetchImpl(`${apiBase}/checkout/orders/${encodeURIComponent(orderId)}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(CHECKOUT_OWNER_KEY.test(checkoutKey || "") ? { "Idempotency-Key": checkoutKey } : {}) },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      body: JSON.stringify({ provider, operation_id: operationId })
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if ((response.status === 200 || response.status === 201) && payload?.provider === provider &&
        payload.operation_id === operationId && safeRedirect(payload.redirect_url, provider, config.environment)) {
      return { action: "redirect", status: response.status, payload: { provider, operation_id: operationId, redirect_url: payload.redirect_url } };
    }
    return { action: response.status === 409 ? "conflict" : "retry", status: response.status, payload: null };
  } catch {
    return { action: "retry", status: 0, payload: null };
  }
}

export function createPaymentController({ config = COMMERCE_CONFIG, orderId, storage, holdStorage = storage, fetchImpl = fetch, uuid = () => crypto.randomUUID() }) {
  let inFlight = false;
  return {
    async initiate(provider) {
      if (!commerceApiBase(config)) return { action: "disabled", status: 0, payload: null };
      if (inFlight) return { action: "busy", status: 0, payload: null };
      if (!ORDER_ID_PATTERN.test(orderId || "") || !["STRIPE", "PAYPAL"].includes(provider)) return { action: "invalid", status: 0, payload: null };
      inFlight = true;
      try {
        let hold;
        try { hold = readCheckoutHold({ storage: holdStorage, config }); }
        catch { return { action: config.environment === "production" ? "ownership-required" : "retry", status: 0, payload: null }; }
        if (hold?.legacy) return { action: "conflict", status: 0, payload: null };
        if (config.environment === "production" && (hold?.orderId !== orderId || !CHECKOUT_OWNER_KEY.test(hold?.key || ""))) return { action: "ownership-required", status: 0, payload: null };
        const storageKey = checkoutStorageKey(`payment-operation:${orderId}`, config);
        const raw = storage.getItem(storageKey);
        const operation = raw ? JSON.parse(raw) : { provider, operationId: uuid() };
        if (!["STRIPE", "PAYPAL"].includes(operation?.provider) || !ORDER_ID_PATTERN.test(operation?.operationId || "") || operation.provider !== provider) return { action: "conflict", status: 0, payload: null };
        // Persist before the request. A lost response or hosted redirect never
        // consumes this identity; a reload must use the same provider/operation.
        if (!raw) storage.setItem(storageKey, JSON.stringify(operation));
        return await submitPaymentInitiation({ config, orderId, provider, operationId: operation.operationId, checkoutKey: hold?.key, fetchImpl });
      } catch { return { action: "retry", status: 0, payload: null }; }
      finally { inFlight = false; }
    }
  };
}
