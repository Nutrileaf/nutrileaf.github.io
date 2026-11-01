import { COMMERCE_CONFIG, commerceApiBase, checkoutStorageKey, ORDER_ID_PATTERN } from "./commerce-config.js";
import { readCheckoutHold } from "./checkout-state.js";

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

export async function submitPaymentInitiation({ config = COMMERCE_CONFIG, orderId, provider, operationId, fetchImpl = fetch }) {
  const apiBase = commerceApiBase(config);
  if (!apiBase) return { action: "disabled", status: 0, payload: null };
  if (!ORDER_ID_PATTERN.test(orderId || "") || !ORDER_ID_PATTERN.test(operationId || "") || !["STRIPE", "PAYPAL"].includes(provider)) return { action: "invalid", status: 0, payload: null };
  try {
    const response = await fetchImpl(`${apiBase}/checkout/orders/${encodeURIComponent(orderId)}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
        if (readCheckoutHold({ storage: holdStorage, config })?.legacy) return { action: "conflict", status: 0, payload: null };
        const storageKey = checkoutStorageKey(`payment-operation:${orderId}`, config);
        const raw = storage.getItem(storageKey);
        const operation = raw ? JSON.parse(raw) : { provider, operationId: uuid() };
        if (!["STRIPE", "PAYPAL"].includes(operation?.provider) || !ORDER_ID_PATTERN.test(operation?.operationId || "") || operation.provider !== provider) return { action: "conflict", status: 0, payload: null };
        // Persist before the request. A lost response or hosted redirect never
        // consumes this identity; a reload must use the same provider/operation.
        if (!raw) storage.setItem(storageKey, JSON.stringify(operation));
        return await submitPaymentInitiation({ config, orderId, provider, operationId: operation.operationId, fetchImpl });
      } catch { return { action: "retry", status: 0, payload: null }; }
      finally { inFlight = false; }
    }
  };
}
