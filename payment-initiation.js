export async function submitPaymentInitiation({ apiBase, orderId, provider, operationId, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(`${apiBase}/checkout/orders/${encodeURIComponent(orderId)}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, operation_id: operationId })
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    return { action: response.status === 200 || response.status === 201 ? "redirect" : response.status === 409 ? "conflict" : "retry", status: response.status, payload };
  } catch {
    return { action: "retry", status: 0, payload: null };
  }
}
