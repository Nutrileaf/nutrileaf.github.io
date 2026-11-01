import test from "node:test";
import assert from "node:assert/strict";
import * as state from "../checkout-state.js";
import * as launch from "../commerce-config.js";
import * as payment from "../payment-initiation.js";
import { submitCheckout } from "../checkout-submit.js";

const config = { enabled: true, environment: "production", apiBase: "https://commerce.example.test", scope: { productId: "product-1", quantity: 1 } };
const orderId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const order = { id: orderId, order_number: "NL-1", status: "PENDING", subtotal: 849, tax: 0, shipping: 599, total: 1448, currency: "USD" };
const request = { customer: { email: "buyer@example.test" }, items: [{ product_id: "product-1", quantity: 1 }], shipping_rate_id: "rate-1" };
function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
const response = () => new Response(JSON.stringify({ provider: "STRIPE", operation_id: operationId, redirect_url: "https://checkout.stripe.com/c/pay/cs_live_abc" }), { status: 201 });

test("checkout retry and reload preserve the exact request and key even after inputs or rates change", () => {
  assert.equal(typeof state.prepareCheckoutAttempt, "function");
  assert.equal(typeof state.saveCheckoutAttempt, "function");
  assert.equal(typeof state.readCheckoutAttempt, "function");
  const store = storage();
  const attempt = state.prepareCheckoutAttempt({ request, cartRevision: "cart-1", uuid: () => operationId });
  state.saveCheckoutAttempt({ storage: store, config, attempt });
  const restored = state.readCheckoutAttempt({ storage: store, config });
  assert.equal(restored.key, "checkout-22222222-2222-4222-8222-222222222222");
  assert.deepEqual(restored.request, request);
  const changed = state.prepareCheckoutAttempt({ request: { ...request, shipping_rate_id: "rate-2" }, stored: restored, cartRevision: "cart-2", uuid: () => { throw new Error("must not replace ambiguous identity"); } });
  assert.deepEqual(changed, restored);
});

test("saved checkout identity is isolated by environment, ingress and approved product", () => {
  assert.equal(typeof launch.checkoutStorageKey, "function");
  assert.notEqual(launch.checkoutStorageKey("checkout-attempt", config), launch.checkoutStorageKey("checkout-attempt", { ...config, environment: "test" }));
  assert.notEqual(launch.checkoutStorageKey("checkout-attempt", config), launch.checkoutStorageKey("checkout-attempt", { ...config, apiBase: "https://other.example.test" }));
  assert.notEqual(launch.checkoutStorageKey("checkout-attempt", config), launch.checkoutStorageKey("checkout-attempt", { ...config, scope: { productId: "other", quantity: 1 } }));
  assert.equal(launch.checkoutStorageKey("checkout-attempt"), null);
});

test("simultaneous provider clicks send one initiation and reload reuses its operation", async () => {
  assert.equal(typeof payment.createPaymentController, "function");
  const store = storage();
  let resolvePayment, calls = 0;
  const controller = payment.createPaymentController({ config, orderId, storage: store, uuid: () => operationId, fetchImpl: async () => { calls++; return new Promise(resolve => { resolvePayment = resolve; }); } });
  const first = controller.initiate("STRIPE");
  assert.equal((await controller.initiate("PAYPAL")).action, "busy");
  assert.equal(calls, 1);
  resolvePayment(response());
  assert.equal((await first).action, "redirect");
  const reloaded = payment.createPaymentController({ config, orderId, storage: store, uuid: () => { throw new Error("must reuse stored operation"); }, fetchImpl: async (url, init) => { calls++; assert.deepEqual(JSON.parse(init.body), { provider: "STRIPE", operation_id: operationId }); return response(); } });
  assert.equal((await reloaded.initiate("PAYPAL")).action, "conflict");
  assert.equal((await reloaded.initiate("STRIPE")).action, "redirect");
  assert.equal(calls, 2);
});

test("ambiguous payment failure preserves the operation and the cart for safe retry", async () => {
  assert.equal(typeof payment.createPaymentController, "function");
  const store = storage();
  store.setItem("nutrileaf-cart-v2", JSON.stringify(request.items));
  const first = payment.createPaymentController({ config, orderId, storage: store, uuid: () => operationId, fetchImpl: async () => { throw new Error("response lost"); } });
  assert.equal((await first.initiate("STRIPE")).action, "retry");
  const reload = payment.createPaymentController({ config, orderId, storage: store, uuid: () => { throw new Error("must preserve unknown effect identity"); }, fetchImpl: async (url, init) => { assert.equal(JSON.parse(init.body).operation_id, operationId); return response(); } });
  assert.equal((await reload.initiate("STRIPE")).action, "redirect");
  assert.deepEqual(JSON.parse(store.getItem("nutrileaf-cart-v2")), request.items);
});

test("only matching authoritative paid status clears the original cart and saved checkout", () => {
  assert.equal(typeof state.clearCompletedCheckout, "function");
  const store = storage();
  const attempt = { request, fingerprint: JSON.stringify(request), key: "checkout-1", cartRevision: "cart-1", order };
  state.saveCheckoutAttempt({ storage: store, config, attempt });
  store.setItem("nutrileaf-cart-v2", JSON.stringify(request.items));
  store.setItem(launch.checkoutStorageKey("cart-revision", config), "cart-1");
  for (const statusResult of [{ action: "redirect", status: 201 }, { action: "status", status: 200, payload: { order: { number: "NL-1", status: "PENDING" } } }, { action: "status", status: 200, payload: { order: { number: "OTHER", status: "PAID" } } }]) {
    assert.equal(state.clearCompletedCheckout({ storage: store, config, orderId, statusResult }), false);
    assert.deepEqual(JSON.parse(store.getItem("nutrileaf-cart-v2")), request.items);
  }
  assert.equal(state.clearCompletedCheckout({ storage: store, config, orderId, statusResult: { action: "status", status: 200, payload: { order: { number: "NL-1", status: "PAID" } } } }), true);
  assert.deepEqual(JSON.parse(store.getItem("nutrileaf-cart-v2")), []);
  assert.equal(state.readCheckoutAttempt({ storage: store, config }), null);
});

test("paid confirmation preserves a cart changed after the pending checkout", () => {
  assert.equal(typeof state.clearCompletedCheckout, "function");
  const store = storage();
  state.saveCheckoutAttempt({ storage: store, config, attempt: { request, fingerprint: JSON.stringify(request), key: "checkout-1", cartRevision: "cart-1", order } });
  store.setItem("nutrileaf-cart-v2", JSON.stringify(request.items));
  store.setItem(launch.checkoutStorageKey("cart-revision", config), "new-cart");
  assert.equal(state.clearCompletedCheckout({ storage: store, config, orderId, statusResult: { action: "status", status: 200, payload: { order: { number: "NL-1", status: "DELIVERED" } } } }), false);
  assert.deepEqual(JSON.parse(store.getItem("nutrileaf-cart-v2")), request.items);
  assert.equal(state.readCheckoutAttempt({ storage: store, config }), null);
});

test("P13 HTTP 200 replay resumes its validated pending order instead of creating another attempt", async () => {
  const result = await submitCheckout({ config, body: request, idempotencyKey: "checkout-original", fetchImpl: async (url, init) => {
    assert.equal(init.headers["Idempotency-Key"], "checkout-original");
    assert.deepEqual(JSON.parse(init.body), request);
    return new Response(JSON.stringify({ order }), { status: 200 });
  } });
  assert.equal(result.action, "confirm");
  assert.equal(result.payload.order.id, orderId);
});

test("P13 replay of an already-paid order requires authoritative status without new payment controls", async () => {
  const result = await submitCheckout({ config, body: request, idempotencyKey: "checkout-original", fetchImpl: async () => new Response(JSON.stringify({ order: { ...order, status: "PAID" } }), { status: 200 }) });
  assert.equal(result.action, "status-required");
  assert.equal(result.payload.order.id, orderId);
});

test("authoritative cancelled or failed status releases the saved checkout while retaining its cart", () => {
  for (const status of ["CANCELLED", "FAILED", "REFUNDED"]) {
    const store = storage();
    state.saveCheckoutAttempt({ storage: store, config, attempt: { request, fingerprint: JSON.stringify(request), key: "checkout-1", cartRevision: "cart-1", order } });
    store.setItem("nutrileaf-cart-v2", JSON.stringify(request.items));
    store.setItem(launch.checkoutStorageKey("cart-revision", config), "cart-1");
    assert.equal(state.clearCompletedCheckout({ storage: store, config, orderId, statusResult: { action: "status", status: 200, payload: { order: { number: "NL-1", status } } } }), false);
    assert.deepEqual(JSON.parse(store.getItem("nutrileaf-cart-v2")), request.items);
    assert.equal(state.readCheckoutAttempt({ storage: store, config }), null);
  }
});

test("personal checkout state stays in the tab session while durable hold contains only server identity", () => {
  assert.equal(typeof state.readCheckoutHold, "function");
  const session = storage(), durable = storage();
  const attempt = { request, fingerprint: JSON.stringify(request), key: "checkout-1", cartRevision: "cart-1", order };
  state.saveCheckoutAttempt({ storage: session, holdStorage: durable, config, attempt });
  assert.deepEqual(state.readCheckoutAttempt({ storage: session, config }).request, request);
  assert.equal(durable.getItem(launch.checkoutStorageKey("checkout-attempt", config)), null);
  const hold = JSON.parse(durable.getItem(launch.checkoutStorageKey("checkout-hold", config)));
  assert.deepEqual(hold, { key: "checkout-1", orderId });
  assert.equal(JSON.stringify(hold).includes("buyer@example.test"), false);
});

test("lost tab sessions cannot mint a new checkout identity to bypass an existing hold", () => {
  assert.equal(typeof state.readCheckoutHold, "function");
  const session = storage(), durable = storage();
  state.saveCheckoutAttempt({ storage: session, holdStorage: durable, config, attempt: { request, fingerprint: JSON.stringify(request), key: "checkout-original", cartRevision: "cart-1" } });
  const hold = state.readCheckoutHold({ storage: durable, config });
  assert.throws(() => state.prepareCheckoutAttempt({ request, hold, cartRevision: "cart-1", uuid: () => "must-not-create" }), /reconcil/i);
  assert.equal(hold.key, "checkout-original");
  assert.equal(hold.orderId, null);
});

test("P16 can release the matching durable hold after session loss without clearing an unverifiable cart", () => {
  assert.equal(typeof state.readCheckoutHold, "function");
  const session = storage(), durable = storage();
  state.saveCheckoutAttempt({ storage: session, holdStorage: durable, config, attempt: { request, fingerprint: JSON.stringify(request), key: "checkout-1", cartRevision: "cart-1", order } });
  durable.setItem("nutrileaf-cart-v2", JSON.stringify(request.items));
  const newSession = storage();
  assert.equal(state.clearCompletedCheckout({ storage: newSession, cartStorage: durable, holdStorage: durable, config, orderId, statusResult: { action: "status", status: 200, payload: { order: { number: "NL-1", status: "PAID" } } } }), false);
  assert.equal(state.readCheckoutHold({ storage: durable, config }), null);
  assert.deepEqual(JSON.parse(durable.getItem("nutrileaf-cart-v2")), request.items);
});

test("legacy TEST personal drafts and fingerprints are stripped without discarding their retry identity", () => {
  assert.equal(typeof state.clearLegacyPersonalCheckoutState, "function");
  const durable = storage();
  durable.setItem("nutrileaf-checkout-draft", JSON.stringify({ email: "private@example.test", address_line1: "1 Private Street" }));
  durable.setItem("nutrileaf-checkout-attempt", JSON.stringify({ key: "checkout-legacy", fingerprint: "private@example.test 1 Private Street" }));
  state.clearLegacyPersonalCheckoutState(durable);
  assert.equal(durable.getItem("nutrileaf-checkout-draft"), null);
  assert.equal(durable.getItem("nutrileaf-checkout-attempt"), null);
  assert.deepEqual(JSON.parse(durable.getItem("nutrileaf-legacy-test-checkout-hold")), { key: "checkout-legacy" });
  assert.equal(state.readCheckoutHold({ storage: durable, config }), null);
});
