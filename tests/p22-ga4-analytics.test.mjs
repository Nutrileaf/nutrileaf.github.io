import assert from "node:assert/strict";
import test from "node:test";

import {
  trackAddToCart,
  trackBeginCheckout,
  trackPurchase,
  trackViewItem
} from "../analytics.js";

function fakeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function withWindow(windowValue, callback) {
  const previous = globalThis.window;
  globalThis.window = windowValue;
  try { return callback(); }
  finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

const item = {
  item_id: "SKU-1",
  item_name: "Test Product",
  price: 12.34,
  quantity: 2,
  email: "must-not-pass@example.test",
  provider_payment_id: "provider-secret"
};

test("GA4 wrappers are inert without an authoritative measurement ID", () => {
  const calls = [];
  withWindow({ gtag: (...args) => calls.push(args), localStorage: fakeStorage() }, () => {
    assert.equal(trackViewItem({ item }), false);
    assert.equal(trackAddToCart({ item }), false);
    assert.equal(trackBeginCheckout({ currency: "USD", value: 24.68, items: [item] }), false);
    assert.equal(trackPurchase({ transaction_id: "NL-1", currency: "USD", value: 24.68, tax: 1, shipping: 0, items: [item] }), false);
  });
  assert.deepEqual(calls, []);
});

test("GA4 wrappers require window.gtag even when measurement ID is configured", () => {
  withWindow({ NUTRILEAF_GA4_MEASUREMENT_ID: "G-8V7YT8ELZ2", localStorage: fakeStorage() }, () => {
    assert.equal(trackViewItem({ item }), false);
  });
});

test("GA4 emits exact ecommerce event names with privacy-minimized payloads", () => {
  const calls = [];
  withWindow({
    NUTRILEAF_GA4_MEASUREMENT_ID: "G-8V7YT8ELZ2",
    gtag: (...args) => calls.push(args),
    localStorage: fakeStorage()
  }, () => {
    assert.equal(trackViewItem({ item, currency: "USD" }), true);
    assert.equal(trackAddToCart({ item, currency: "USD" }), true);
    assert.equal(trackBeginCheckout({ currency: "USD", value: 24.68, tax: 1.23, shipping: 2, items: [item] }), true);
    assert.equal(trackPurchase({
      transaction_id: "NL-1",
      currency: "USD",
      value: 24.68,
      tax: 1.23,
      shipping: 2,
      items: [item],
      email: "must-not-pass@example.test",
      provider_payment_id: "provider-secret"
    }), true);
  });

  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ["event", "view_item"],
    ["event", "add_to_cart"],
    ["event", "begin_checkout"],
    ["event", "purchase"]
  ]);
  const serialized = JSON.stringify(calls);
  assert.equal(serialized.includes("must-not-pass@example.test"), false);
  assert.equal(serialized.includes("provider-secret"), false);
  assert.deepEqual(calls[3][2], {
    transaction_id: "NL-1",
    currency: "USD",
    value: 24.68,
    tax: 1.23,
    shipping: 2,
    items: [{ item_id: "SKU-1", item_name: "Test Product", price: 12.34, quantity: 2 }]
  });
});

test("purchase dedupe marker is stored only after successful dispatch", () => {
  const storage = fakeStorage();
  const calls = [];
  const analytics = { transaction_id: "NL-77", currency: "USD", value: 10, tax: 0, shipping: 0, items: [{ ...item, quantity: 1 }] };
  withWindow({ NUTRILEAF_GA4_MEASUREMENT_ID: "G-8V7YT8ELZ2", gtag: (...args) => calls.push(args), localStorage: storage }, () => {
    assert.equal(storage.getItem("nutrileaf-ga4-purchase:NL-77"), null);
    assert.equal(trackPurchase(analytics), true);
    assert.equal(storage.getItem("nutrileaf-ga4-purchase:NL-77"), "1");
    assert.equal(trackPurchase(analytics), false);
  });
  assert.equal(calls.length, 1);
});

test("failed purchase dispatch does not write the dedupe marker", () => {
  const storage = fakeStorage();
  const analytics = { transaction_id: "NL-88", currency: "USD", value: 10, tax: 0, shipping: 0, items: [{ ...item, quantity: 1 }] };
  withWindow({ NUTRILEAF_GA4_MEASUREMENT_ID: "G-8V7YT8ELZ2", gtag: () => { throw new Error("synthetic gtag failure"); }, localStorage: storage }, () => {
    assert.equal(trackPurchase(analytics), false);
  });
  assert.equal(storage.getItem("nutrileaf-ga4-purchase:NL-88"), null);
});
