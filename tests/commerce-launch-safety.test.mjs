import test from "node:test";
import assert from "node:assert/strict";
import { submitCheckout } from "../checkout-submit.js";
import { submitPaymentInitiation } from "../payment-initiation.js";
import { getOrderStatus } from "../order-status.js";

const orderId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const config = { enabled: true, environment: "production", apiBase: "https://commerce.example.test", scope: { productId: "product-1", quantity: 1 } };
const body = { customer: { email: "buyer@example.test" }, items: [{ product_id: "product-1", quantity: 1 }], shipping_rate_id: "rate-1" };
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status });

test("dormant commerce helpers never send checkout, payment, or email to any endpoint", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json({}); };
  const results = await Promise.all([
    submitCheckout({ body, idempotencyKey: "key", fetchImpl }),
    submitPaymentInitiation({ orderId, provider: "STRIPE", operationId, fetchImpl }),
    getOrderStatus({ orderId, email: "buyer@example.test", fetchImpl })
  ]);
  assert.equal(calls, 0);
  assert.deepEqual(results.map(result => result.action), ["disabled", "disabled", "disabled"]);
});

test("production commerce refuses the legacy TEST origin and catalog-only origin before transport", async () => {
  let calls = 0;
  for (const apiBase of ["https://nutrileaf-api.adam-d-may-20.workers.dev", "https://nutrileaf-catalog-prod.adam-d-may-20.workers.dev", "https://user:pass@commerce.example.test", "http://commerce.example.test", "https://commerce.example.test/admin"]) {
    const result = await submitCheckout({ config: { ...config, apiBase }, body, idempotencyKey: "key", fetchImpl: async () => { calls++; return json({}); } });
    assert.equal(result.action, "disabled", apiBase);
  }
  assert.equal(calls, 0);
});

test("checkout refuses carts outside the explicitly configured single product and quantity", async () => {
  let calls = 0;
  for (const items of [[{ product_id: "product-1", quantity: 2 }], [{ product_id: "other", quantity: 1 }], [{ product_id: "product-1", quantity: 1 }, { product_id: "other", quantity: 1 }]]) {
    const result = await submitCheckout({ config, body: { ...body, items }, idempotencyKey: "key", fetchImpl: async () => { calls++; return json({}); } });
    assert.equal(result.action, "unsupported-cart");
  }
  assert.equal(calls, 0);
});

test("malformed successful order responses cannot enter payment selection", async () => {
  const result = await submitCheckout({ config, body, idempotencyKey: "key", fetchImpl: async () => json({ order: { order_number: "NL-1", status: "PENDING" } }, 201) });
  assert.equal(result.action, "retry");
});

test("payment accepts only the matching operation and environment-specific hosted provider URL", async () => {
  for (const redirect_url of ["javascript:alert(1)", "https://checkout.stripe.com.evil.test/c/pay/cs_live_abc", "https://checkout.stripe.com@evil.test/c/pay/cs_live_abc", "https://checkout.stripe.com/c/pay/cs_test_abc", "https://www.sandbox.paypal.com/checkoutnow?token=abc"]) {
    const result = await submitPaymentInitiation({ config, orderId, provider: "STRIPE", operationId, fetchImpl: async () => json({ provider: "STRIPE", operation_id: operationId, redirect_url }, 201) });
    assert.equal(result.action, "retry", redirect_url);
  }
  const result = await submitPaymentInitiation({ config, orderId, provider: "STRIPE", operationId, fetchImpl: async () => json({ provider: "STRIPE", operation_id: operationId, redirect_url: "https://checkout.stripe.com/c/pay/cs_live_abc#fid" }, 201) });
  assert.equal(result.action, "redirect");
  for (const mismatch of [{ provider: "PAYPAL", operation_id: operationId }, { provider: "STRIPE", operation_id: orderId }]) {
    const invalid = await submitPaymentInitiation({ config, orderId, provider: "STRIPE", operationId, fetchImpl: async () => json({ ...mismatch, redirect_url: "https://checkout.stripe.com/c/pay/cs_live_abc" }, 201) });
    assert.equal(invalid.action, "retry");
  }
});

test("status never passes unexpected customer or provider data through to the confirmation UI", async () => {
  const result = await getOrderStatus({ config, orderId, email: "buyer@example.test", fetchImpl: async () => json({ secret: "private", order: { number: "NL-1", status: "PENDING", fulfillment_ready: false, message: "Checking", customer_email: "private@example.test", provider_payment_id: "private" } }) });
  assert.deepEqual(result.payload, { order: { number: "NL-1", status: "PENDING", fulfillment_ready: false, message: "Checking" } });
});

test("status exposes read-only shipping progress without links, action flags, or internal shipment IDs", async () => {
  const result = await getOrderStatus({ config, orderId, email: "buyer@example.test", fetchImpl: async () => json({ order: { number: "NL-1", status: "SHIPPED", fulfillment_ready: true, message: "Shipped", shipping: { carrier: "USPS", service: "GroundAdvantage", tracking_status: "IN_TRANSIT", tracking_url: "https://untrusted.example.test", cancel_order: true, shipment_id: "private" } } }) });
  assert.deepEqual(result.payload.order.shipping, { carrier: "USPS", service: "GroundAdvantage", tracking_status: "IN_TRANSIT" });
});

test("hosted PayPal URLs follow the source-owned environment and never cross to Sandbox", async () => {
  for (const [environment, host] of [["production", "www.paypal.com"], ["test", "www.sandbox.paypal.com"]]) {
    const result = await submitPaymentInitiation({ config: { ...config, environment }, orderId, provider: "PAYPAL", operationId, fetchImpl: async () => json({ provider: "PAYPAL", operation_id: operationId, redirect_url: `https://${host}/checkoutnow?token=abc` }, 201) });
    assert.equal(result.action, "redirect");
    const cross = await submitPaymentInitiation({ config: { ...config, environment }, orderId, provider: "PAYPAL", operationId, fetchImpl: async () => json({ provider: "PAYPAL", operation_id: operationId, redirect_url: `https://${host === "www.paypal.com" ? "www.sandbox.paypal.com" : "www.paypal.com"}/checkoutnow?token=abc` }, 201) });
    assert.equal(cross.action, "retry");
  }
});

test("catalog storefront blocks direct add and checkout form submission while commerce is dormant", async () => {
  const previous = Object.fromEntries(["window", "document", "location", "localStorage", "fetch", "FormData"].map(key => [key, globalThis[key]]));
  const events = new Map();
  const submit = { disabled: true, textContent: "Create pending order" };
  const form = { elements: {}, addEventListener: (name, handler) => events.set(name, handler) };
  const elements = { "#checkoutForm": form, "#checkoutSubmit": submit, "#checkoutStatus": { textContent: "" }, "#checkoutErrors": { innerHTML: "" }, "#reviewGrid": { addEventListener() {}, querySelectorAll: () => [] } };
  for (const selector of ["#reviewsEmpty", "#reviewsMore", "#reviewsLess"]) elements[selector] = { addEventListener() {} };
  const data = new Map();
  data.set("nutrileaf-cart-v2", JSON.stringify([{ product_id: "product-1", quantity: 1 }]));
  let calls = 0;
  try {
    globalThis.window = {};
    globalThis.document = { querySelector: selector => elements[selector] || null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, addEventListener() {} }), addEventListener() {}, body: { children: [], appendChild() {} } };
    globalThis.location = { search: "?environment=test&checkout=1" };
    globalThis.localStorage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
    globalThis.fetch = async () => { calls++; return json({}); };
    globalThis.window.fetch = globalThis.fetch;
    globalThis.FormData = class { get(key) { return { email: "buyer@example.test", first_name: "Buyer", last_name: "Example", name: "Buyer Example", address_line1: "1 Test Street", city: "San Diego", state: "CA", postal_code: "92101", country: "US" }[key] || ""; } };
    await import(`../script.js?dormant=${Date.now()}`);
    window.nutrileafProducts.push({ id: "product-1", active: 1, availability: "IN_STOCK", price: 8.49 });
    assert.equal(window.nutrileafAddToCart("product-1"), false);
    await events.get("submit")({ preventDefault() {} });
    assert.equal(calls, 0);
    assert.equal(submit.disabled, true);
    assert.equal(data.has("nutrileaf-checkout-attempt"), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test("confirmation hides customer email collection while its public ingress is unset", async () => {
  const previous = Object.fromEntries(["document", "location", "fetch"].map(key => [key, globalThis[key]]));
  const form = { hidden: false, addEventListener() {} };
  const result = { textContent: "", className: "" };
  let calls = 0;
  try {
    globalThis.document = { querySelector: selector => selector === "#orderStatusForm" ? form : result };
    globalThis.location = { search: `?order_id=${orderId}&environment=test` };
    globalThis.fetch = async () => { calls++; return json({}); };
    await import(`../confirmation.js?dormant=${Date.now()}`);
    assert.equal(form.hidden, true);
    assert.equal(calls, 0);
    assert.match(result.textContent, /unavailable/i);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
