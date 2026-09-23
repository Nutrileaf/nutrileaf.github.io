import assert from "node:assert/strict";
import test from "node:test";

import { requestShippingRates } from "../shipping-quote-submit.js";

test("P34 binds the checkout email with address and cart IDs for the existing P29 rate endpoint", async () => {
  let call;
  const result = await requestShippingRates({
    apiBase: "https://api.example.test",
    customerEmail: " Buyer@Example.test ",
    body: {
      shipping_address: { name: "Buyer", address_line1: "1 Test St", city: "San Diego", state: "CA", postal_code: "92101", country: "US" },
      items: [{ product_id: "product-1", quantity: 1 }]
    },
    fetchImpl: async (...args) => {
      call = args;
      return new Response(JSON.stringify({ rates: [{ rate_id: "server-rate-1", carrier: "USPS", service: "Ground", amount: 725, currency: "USD" }] }), { status: 200 });
    }
  });
  assert.equal(call[0], "https://api.example.test/checkout/shipping/rates");
  assert.equal(call[1].method, "POST");
  assert.deepEqual(JSON.parse(call[1].body), {
    customer_email: "buyer@example.test",
    shipping_address: { name: "Buyer", address_line1: "1 Test St", city: "San Diego", state: "CA", postal_code: "92101", country: "US" },
    items: [{ product_id: "product-1", quantity: 1 }]
  });
  assert.equal(result.action, "rates");
  assert.equal(result.payload.rates[0].amount, 725);
});

test("P34 leaves review and unavailable decisions authoritative to P29", async () => {
  const result = await requestShippingRates({
    apiBase: "https://api.example.test",
    body: { shipping_address: {}, items: [] },
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: "SHIPPING_NOT_ENABLED" } }), { status: 503 })
  });
  assert.deepEqual(result, { action: "unavailable", status: 503, payload: { error: { code: "SHIPPING_NOT_ENABLED" } } });
});