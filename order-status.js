import { COMMERCE_CONFIG, commerceApiBase, ORDER_ID_PATTERN } from "./commerce-config.js";

function isSafeOrder(order) {
  return Boolean(
    order &&
    typeof order.number === "string" &&
    typeof order.status === "string" &&
    typeof order.fulfillment_ready === "boolean" &&
    typeof order.message === "string"
  );
}

function publicOrder(order) {
  const safe = { number: order.number, status: order.status, fulfillment_ready: order.fulfillment_ready, message: order.message };
  if (order.shipping && ["carrier", "service", "tracking_status"].every(key => typeof order.shipping[key] === "string" && order.shipping[key])) {
    safe.shipping = Object.fromEntries(["carrier", "service", "tracking_status"].map(key => [key, order.shipping[key]]));
  }
  if (["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status) && order.analytics && Array.isArray(order.analytics.items)) {
    safe.analytics = Object.fromEntries(["transaction_id", "currency", "value", "tax", "shipping"].map(key => [key, order.analytics[key]]));
    safe.analytics.items = order.analytics.items.map(item => Object.fromEntries(["item_id", "item_name", "price", "quantity"].map(key => [key, item?.[key]])));
  }
  return safe;
}

export async function getOrderStatus({ config = COMMERCE_CONFIG, orderId, email, fetchImpl = fetch }) {
  const apiBase = commerceApiBase(config);
  if (!apiBase) return { action: "disabled", status: 0, payload: null };
  if (!ORDER_ID_PATTERN.test(orderId || "") || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) return { action: "invalid", status: 0, payload: null };
  try {
    const response = await fetchImpl(`${apiBase}/checkout/orders/${encodeURIComponent(orderId)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      body: JSON.stringify({ email: email.trim().toLowerCase() })
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.status === 200 && isSafeOrder(payload?.order)) return { action: "status", status: 200, payload: { order: publicOrder(payload.order) } };
    if (response.status === 404) return { action: "not-found", status: 404, payload: null };
    if (response.status === 400) return { action: "invalid", status: 400, payload: null };
    return { action: "retry", status: response.status, payload: null };
  } catch {
    return { action: "retry", status: 0, payload: null };
  }
}
