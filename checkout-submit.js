import { checkoutResultAction } from "./checkout-state.js";

export async function submitCheckout({ apiBase, body, idempotencyKey, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(`${apiBase}/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(body)
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    return { action: checkoutResultAction(response.status), status: response.status, payload };
  } catch {
    return { action: "retry", status: 0, payload: null };
  }
}
