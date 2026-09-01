import assert from "node:assert/strict";
import test from "node:test";

import { submitPaymentInitiation } from "../payment-initiation.js";

test("submits only provider and operation ID to the authoritative order payment path", async () => {
  let call;
  const result = await submitPaymentInitiation({
    apiBase: "https://api.example",
    orderId: "11111111-1111-4111-8111-111111111111",
    provider: "STRIPE",
    operationId: "22222222-2222-4222-8222-222222222222",
    fetchImpl: async (...args) => { call = args; return new Response(JSON.stringify({ redirect_url: "https://checkout.stripe.com/c/pay/cs_test" }), { status: 201 }); }
  });
  assert.equal(call[0], "https://api.example/checkout/orders/11111111-1111-4111-8111-111111111111/payments");
  assert.deepEqual(JSON.parse(call[1].body), { provider: "STRIPE", operation_id: "22222222-2222-4222-8222-222222222222" });
  assert.equal(result.action, "redirect");
});
