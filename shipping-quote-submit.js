export async function requestShippingRates({ apiBase, body, customerEmail, fetchImpl = fetch }) {
  const customer_email = typeof customerEmail === "string" ? customerEmail.trim().toLowerCase() : "";
  const { customer_email: _ignoredCustomerEmail, ...shippingBody } = body || {};
  try {
    const response = await fetchImpl(`${apiBase}/checkout/shipping/rates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...shippingBody, customer_email })
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.status === 200 && Array.isArray(payload?.rates)) {
      return { action: "rates", status: response.status, payload };
    }
    if (response.status === 409) return { action: "review", status: response.status, payload };
    if (response.status === 503) return { action: "unavailable", status: response.status, payload };
    return { action: "retry", status: response.status, payload };
  } catch {
    return { action: "retry", status: 0, payload: null };
  }
}