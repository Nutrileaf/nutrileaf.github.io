import assert from "node:assert/strict";
import test from "node:test";

import { getOrderStatus } from "../order-status.js";

test("P16 status lookup sends only the customer email to the authoritative endpoint", async () => {
  let call;
  const result = await getOrderStatus({
    apiBase: "https://api.example.test",
    orderId: "11111111-1111-4111-8111-111111111111",
    email: "buyer@example.test",
    fetchImpl: async (url, init) => {
      call = { url, init };
      return new Response(JSON.stringify({ order: { number: "NL-TEST-1", status: "PENDING", fulfillment_ready: false, message: "Checking" } }), { status: 200 });
    }
  });
  assert.equal(call.url, "https://api.example.test/checkout/orders/11111111-1111-4111-8111-111111111111/status");
  assert.deepEqual(JSON.parse(call.init.body), { email: "buyer@example.test" });
  assert.equal(call.init.headers["Content-Type"], "application/json");
  assert.equal(result.action, "status");
  assert.equal(result.payload.order.status, "PENDING");
});

test("P16 status lookup treats URL and transport data as non-authoritative", async () => {
  const result = await getOrderStatus({
    apiBase: "https://api.example.test",
    orderId: "11111111-1111-4111-8111-111111111111",
    email: "buyer@example.test",
    fetchImpl: async () => new Response(JSON.stringify({ payment: "PAID", total: 1000 }), { status: 200 })
  });
  assert.equal(result.action, "retry");
});
