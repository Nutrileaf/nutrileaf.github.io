import test from "node:test";
import assert from "node:assert/strict";

import {
  P24_PRODUCT_TYPES,
  buildProductListQuery,
  editorFingerprint,
  hasUnsavedProductChanges,
  readinessGuidance,
  requiresStockRemovalConfirmation
} from "../dashboard/model.js";

test("product-list query serializes only bounded search and filters", () => {
  const query = buildProductListQuery({
    search: "  NL-000042  ",
    product_type: "Tea",
    visibility: "hidden",
    stock_status: "sold_out",
    limit: 24,
    cursor: "cursor-1"
  });
  assert.equal(query.toString(), "limit=24&search=NL-000042&product_type=Tea&visibility=hidden&stock_status=sold_out&cursor=cursor-1");

  const empty = buildProductListQuery({ search: " ", product_type: "", visibility: "", stock_status: "", limit: 24 });
  assert.equal(empty.toString(), "limit=24");

  for (const input of [
    { product_type: "test-fixture", limit: 24 },
    { visibility: "unknown", limit: 24 },
    { stock_status: "unknown", limit: 24 },
    { search: "x".repeat(101), limit: 24 },
    { limit: 0 },
    { limit: 51 },
    { cursor: "x".repeat(513), limit: 24 }
  ]) {
    assert.throws(() => buildProductListQuery(input));
  }
  assert.equal(P24_PRODUCT_TYPES.includes("Tea"), true);
});

test("editor fingerprint normalizes editable product details and excludes identity or operator state", () => {
  const base = editorFingerprint({
    name: " Rose Soap ",
    product_type: "Soap",
    description: "  Fresh  ",
    price: "12.30",
    sku: "NL-000001",
    id: "do-not-track",
    stock: 2,
    photo: "media-key"
  });
  assert.equal(base, editorFingerprint({
    name: "Rose Soap",
    product_type: "Soap",
    description: "Fresh",
    price: "12.30",
    sku: "NL-999999",
    id: "different",
    stock: 99,
    photo: null
  }));
  assert.notEqual(base, editorFingerprint({ name: "Rose Tea", product_type: "Soap", description: "Fresh", price: "12.30" }));
});

test("unsaved product-change detection compares normalized editable details", () => {
  const baseline = { name: "Rose Soap", product_type: "Soap", description: "Fresh", price: "12.30" };
  assert.equal(hasUnsavedProductChanges(baseline, { ...baseline, stock: 8 }), false);
  assert.equal(hasUnsavedProductChanges(baseline, { ...baseline, description: " Fresh " }), false);
  assert.equal(hasUnsavedProductChanges(baseline, { ...baseline, price: "12.31" }), true);
});

test("stock removal confirmation is reserved for removing all currently available stock", () => {
  assert.equal(requiresStockRemovalConfirmation(10, 1), false);
  assert.equal(requiresStockRemovalConfirmation(10, 9), false);
  assert.equal(requiresStockRemovalConfirmation(10, 10), true);
  assert.equal(requiresStockRemovalConfirmation(10, 11), false);
  assert.equal(requiresStockRemovalConfirmation(0, 0), false);
});

test("readiness guidance remains server-driven and plain-language", () => {
  assert.equal(readinessGuidance({ can_show_in_store: true }), null);
  assert.equal(
    readinessGuidance({ can_show_in_store: false, visibility_message: "Product Type tax review is required before this product can be shown in the store." }),
    "Tax review is still required before this product can be shown in the store."
  );
  assert.equal(
    readinessGuidance({ can_show_in_store: false, visibility_message: "A positive price is required before this product can be shown in the store." }),
    "Add a price before showing this product in the store."
  );
  assert.equal(
    readinessGuidance({ can_show_in_store: false, visibility_message: "Inventory must be available before this product can be shown in the store." }),
    "Inventory must be ready before this product can be shown in the store."
  );
  assert.equal(
    readinessGuidance({ can_show_in_store: false, visibility_message: "A server-defined readiness rule is blocking visibility." }),
    "A server-defined readiness rule is blocking visibility."
  );
});
