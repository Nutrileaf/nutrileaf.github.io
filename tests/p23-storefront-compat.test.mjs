import test from "node:test";
import assert from "node:assert/strict";
import { checkoutResultAction } from "../checkout-state.js";
import { submitCheckout } from "../checkout-submit.js";

test("P23 PRODUCT_UNAVAILABLE is a distinct checkout action while other 409 conflicts stay unchanged", async () => {
  const payload = { error: { code: "PRODUCT_UNAVAILABLE", message: "One or more products are unavailable", product_ids: ["product-2"] } };
  assert.equal(checkoutResultAction(409, payload), "product-unavailable");
  assert.equal(checkoutResultAction(409, { error: "Conflicting Idempotency-Key" }), "restart-attempt");

  const result = await submitCheckout({
    apiBase: "https://api.example.test",
    body: { items: [] },
    idempotencyKey: "checkout-test",
    fetchImpl: async () => new Response(JSON.stringify(payload), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    })
  });
  assert.equal(result.action, "product-unavailable");
  assert.deepEqual(result.payload?.error?.product_ids, ["product-2"]);
});
