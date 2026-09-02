function isSafeOrder(order) {
  return Boolean(
    order &&
    typeof order.number === "string" &&
    typeof order.status === "string" &&
    typeof order.fulfillment_ready === "boolean" &&
    typeof order.message === "string"
  );
}

export async function getOrderStatus({ apiBase, orderId, email, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(`${apiBase}/checkout/orders/${encodeURIComponent(orderId)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.status === 200 && isSafeOrder(payload?.order)) return { action: "status", status: 200, payload };
    if (response.status === 404) return { action: "not-found", status: 404, payload };
    if (response.status === 400) return { action: "invalid", status: 400, payload };
    return { action: "retry", status: response.status, payload: null };
  } catch {
    return { action: "retry", status: 0, payload: null };
  }
}
