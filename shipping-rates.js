import { COMMERCE_CONFIG, commerceApiBase, isSupportedCheckoutCart } from "./commerce-config.js";

function safeRate(rate, now) {
  if (typeof rate?.rate_id !== "string" || !rate.rate_id || typeof rate.carrier !== "string" || !rate.carrier ||
      typeof rate.service !== "string" || !rate.service || !Number.isSafeInteger(rate.amount) || rate.amount < 0 ||
      rate.currency !== "USD" || !Number.isSafeInteger(rate.expires_at) || rate.expires_at <= now) return null;
  return Object.fromEntries(["rate_id", "carrier", "service", "amount", "currency", "expires_at"].map(key => [key, rate[key]]));
}

export async function getShippingRates({ config = COMMERCE_CONFIG, body, now = Date.now(), fetchImpl = fetch }) {
  const apiBase = commerceApiBase(config);
  if (!apiBase) return { action: "disabled", status: 0, payload: null };
  if (!isSupportedCheckoutCart(body?.items, config)) return { action: "unsupported-cart", status: 0, payload: null };
  try {
    const response = await fetchImpl(`${apiBase}/checkout/shipping/rates`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "omit", redirect: "error", cache: "no-store", body: JSON.stringify(body)
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.status === 200 && Array.isArray(payload?.rates) && payload.rates.length) {
      const rates = payload.rates.map(rate => safeRate(rate, now));
      if (rates.every(Boolean) && new Set(rates.map(rate => rate.rate_id)).size === rates.length) return { action: "rates", status: 200, payload: { rates } };
    }
    if (response.status === 409 && ["SHIPPING_REVIEW_REQUIRED", "SHIPPING_ADDRESS_REVIEW_REQUIRED"].includes(payload?.error?.code)) return { action: "review-required", status: 409, payload: null };
    return { action: response.status === 400 ? "invalid" : "retry", status: response.status, payload: null };
  } catch { return { action: "retry", status: 0, payload: null }; }
}
