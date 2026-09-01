import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCart,
  createCheckoutRequest,
  checkoutKeyFor,
  checkoutResultAction
} from "../checkout-state.js";

const customer = {
  email: "Buyer@Example.test",
  first_name: "Buyer",
  last_name: "Example",
  shipping_address: {
    name: "Buyer Example",
    address_line1: "1 Test Street",
    city: "San Diego",
    state: "CA",
    postal_code: "92101",
    country: "US"
  }
};

test("normalizes cart entries to authoritative product IDs and quantities", () => {
  assert.deepEqual(normalizeCart([
    { product_id: "product-1", quantity: 2, name: "Browser name", price: 1 },
    { product_id: "product-1", quantity: 1, price: 999 },
    { product_id: "product-2", quantity: 0 }
  ]), [
    { product_id: "product-1", quantity: 3 }
  ]);
});

test("creates a P13 request without browser product text or prices", () => {
  assert.deepEqual(createCheckoutRequest({
    cart: [{ product_id: "product-1", quantity: 2, name: "Browser name", price: 1 }],
    customer
  }), {
    customer: {
      ...customer,
      email: "buyer@example.test",
      phone: null,
      shipping_address: { ...customer.shipping_address, address_line2: null }
    },
    items: [{ product_id: "product-1", quantity: 2 }]
  });
});

test("keeps retry keys for identical input and replaces them after success", () => {
  assert.equal(checkoutKeyFor("same-input", { fingerprint: "same-input", key: "checkout-1" }), "checkout-1");
  assert.notEqual(checkoutKeyFor("changed-input", { fingerprint: "same-input", key: "checkout-1" }), "checkout-1");
});

test("maps checkout results without a payment transition", () => {
  assert.equal(checkoutResultAction(201), "confirm");
  assert.equal(checkoutResultAction(400), "inline-error");
  assert.equal(checkoutResultAction(404), "refresh-catalog");
  assert.equal(checkoutResultAction(409), "restart-attempt");
  assert.equal(checkoutResultAction(500), "retry");
});

