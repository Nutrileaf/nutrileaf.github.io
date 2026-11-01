import { checkoutResultAction, normalizeCheckoutOrder } from "./checkout-state.js";
import { COMMERCE_CONFIG, commerceApiBase, isSupportedCheckoutCart } from "./commerce-config.js";
export { getShippingRates } from "./shipping-rates.js";

export async function submitCheckout({ config = COMMERCE_CONFIG, body, idempotencyKey, fetchImpl = fetch }) {
  const apiBase = commerceApiBase(config);
  if (!apiBase) return { action: "disabled", status: 0, payload: null };
  if (!isSupportedCheckoutCart(body?.items, config)) return { action: "unsupported-cart", status: 0, payload: null };
  if (typeof body?.shipping_rate_id !== "string" || !body.shipping_rate_id.trim()) return { action: "shipping-required", status: 0, payload: null };
  try {
    const response = await fetchImpl(`${apiBase}/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      body: JSON.stringify(body)
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.status === 200 || response.status === 201) {
      const order = normalizeCheckoutOrder(payload?.order);
      return order ? { action: order.status === "PENDING" ? "confirm" : "status-required", status: response.status, payload: { order } } : { action: "retry", status: response.status, payload: null };
    }
    return { action: checkoutResultAction(response.status, payload), status: response.status, payload };
  } catch {
    return { action: "retry", status: 0, payload: null };
  }
}
