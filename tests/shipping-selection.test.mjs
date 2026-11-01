import test from "node:test";
import assert from "node:assert/strict";
import * as state from "../checkout-state.js";
import * as submit from "../checkout-submit.js";

const config = { enabled: true, environment: "production", apiBase: "https://commerce.example.test", scope: { productId: "product-1", quantity: 1 } };
const customer = { email: "Buyer@Example.test", first_name: "Buyer", last_name: "Example", shipping_address: { name: "Buyer Example", address_line1: "1 Test Street", city: "San Diego", state: "ca", postal_code: "92101", country: "US" } };
const rate = { rate_id: "rate-1", carrier: "USPS", service: "GroundAdvantage", amount: 599, currency: "USD", expires_at: 2000 };
const body = { customer_email: "buyer@example.test", shipping_address: { name: "Buyer Example", address_line1: "1 Test Street", address_line2: null, city: "San Diego", state: "CA", postal_code: "92101", country: "US" }, items: [{ product_id: "product-1", quantity: 1 }] };

test("shipping request uses only normalized email, delivery address and IDs with quantities", () => {
  assert.equal(typeof state.createShippingRateRequest, "function");
  assert.deepEqual(state.createShippingRateRequest({ cart: [{ product_id: "product-1", quantity: 1, price: 1 }], customer }), body);
  assert.equal(state.createCheckoutRequest({ cart: body.items, customer, shippingRateId: "rate-1" }).shipping_rate_id, "rate-1");
});

test("selected shipping rate becomes unusable on expiry, destination change or cart change", () => {
  assert.equal(typeof state.selectedShippingRate, "function");
  const selection = { requestFingerprint: "original", rates: [rate], rateId: "rate-1" };
  assert.equal(state.selectedShippingRate(selection, "original", 1999)?.rate_id, "rate-1");
  assert.equal(state.selectedShippingRate(selection, "original", 2000), null);
  assert.equal(state.selectedShippingRate(selection, "changed", 1000), null);
  assert.equal(state.selectedShippingRate({ ...selection, rateId: "browser-invented" }, "original", 1000), null);
});

test("dormant shipping makes no provider-facing request and refuses unsupported carts", async () => {
  assert.equal(typeof submit.getShippingRates, "function");
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response("{}", { status: 200 }); };
  assert.equal((await submit.getShippingRates({ body, fetchImpl })).action, "disabled");
  assert.equal((await submit.getShippingRates({ config, body: { ...body, items: [{ product_id: "product-1", quantity: 2 }] }, fetchImpl })).action, "unsupported-cart");
  assert.equal(calls, 0);
});

test("shipping consumes the P29 public rate projection and never exposes provider or review secrets", async () => {
  assert.equal(typeof submit.getShippingRates, "function");
  let request;
  const result = await submit.getShippingRates({ config, body, now: 1000, fetchImpl: async (url, init) => { request = { url, init }; return new Response(JSON.stringify({ quote_set_id: "quote-1", rates: [{ ...rate, provider_rate_id: "private" }] }), { status: 200 }); } });
  assert.equal(request.url, "https://commerce.example.test/checkout/shipping/rates");
  assert.deepEqual(JSON.parse(request.init.body), body);
  assert.deepEqual(result, { action: "rates", status: 200, payload: { rates: [rate] } });
  const review = await submit.getShippingRates({ config, body, now: 1000, fetchImpl: async () => new Response(JSON.stringify({ error: { code: "SHIPPING_REVIEW_REQUIRED" }, review: { review_id: "private", resume_secret: "secret" } }), { status: 409 }) });
  assert.equal(review.action, "review-required");
  assert.equal(review.payload, null);
});

test("expired or malformed quotes cannot provide a shipping selection", async () => {
  assert.equal(typeof submit.getShippingRates, "function");
  for (const rates of [[{ ...rate, expires_at: 1000 }], [{ ...rate, amount: -1 }], [{ ...rate, currency: "EUR" }], []]) {
    const result = await submit.getShippingRates({ config, body, now: 1000, fetchImpl: async () => new Response(JSON.stringify({ rates }), { status: 200 }) });
    assert.equal(result.action, "retry");
    assert.equal(result.payload, null);
  }
});

test("checkout requires a server rate ID and keeps an ambiguous shipping conflict retryable", async () => {
  let calls = 0;
  const result = await submit.submitCheckout({ config, body: { customer, items: body.items }, idempotencyKey: "key", fetchImpl: async () => { calls++; return new Response("{}", { status: 201 }); } });
  assert.equal(result.action, "shipping-required");
  assert.equal(calls, 0);
  for (const code of ["SHIPPING_RATE_REQUIRED", "SHIPPING_RATE_EXPIRED", "SHIPPING_RATE_UNAVAILABLE", "SHIPPING_RATE_MISMATCH"]) assert.equal(state.checkoutResultAction(409, { error: { code } }), "refresh-shipping");
  assert.equal(state.checkoutResultAction(409, { error: { code: "SHIPPING_RATE_CONFLICT" } }), "retry");
});
