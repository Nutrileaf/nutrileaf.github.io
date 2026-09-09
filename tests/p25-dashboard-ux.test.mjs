import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  P24_PRODUCT_TYPES,
  buildProductListQuery,
  editorFingerprint,
  hasUnsavedProductChanges,
  readinessGuidance,
  requiresStockRemovalConfirmation,
  startingStockFromInput
} from "../dashboard/model.js";

function dashboardSource(name) {
  return readFileSync(new URL(`../dashboard/${name}`, import.meta.url), "utf8");
}

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

test("starting stock is optional, whole-number, and bounded", () => {
  assert.equal(startingStockFromInput(""), 0);
  assert.equal(startingStockFromInput("0"), 0);
  assert.equal(startingStockFromInput("12"), 12);
  for (const bad of ["-1", "1.5", "1000001", "abc"]) assert.throws(() => startingStockFromInput(bad), /stock/i);
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

test("dashboard exposes simple server-side Product Type, visibility, and stock filters", () => {
  const html = dashboardSource("index.html");
  const app = dashboardSource("app.js");
  for (const id of ["productTypeFilter", "visibilityFilter", "stockStatusFilter", "clearFiltersButton"]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(id));
  }
  assert.match(app, /buildProductListQuery/);
  assert.match(app, /product_type/);
  assert.match(app, /stock_status/);
});

test("Add Product is a guided hidden-first workflow with optional starting stock and photo", () => {
  const html = dashboardSource("index.html");
  const app = dashboardSource("app.js");
  assert.match(html, /id="startingStock"/);
  assert.match(html, /id="startingPhoto"/);
  assert.match(html, /Hidden when created/);
  assert.match(html, /SKU will be created automatically/);
  assert.match(app, /startingStockFromInput/);
  assert.match(app, /startingStock/);
  assert.match(app, /startingPhoto/);
  assert.match(app, /visible_in_store\s*=\s*false/);
  assert.doesNotMatch(app, /draft\.sku|draft\.id|draft\.stripe_tax_code/);
});

test("editing protects unsaved details and destructive full-stock removal", () => {
  const html = dashboardSource("index.html");
  const app = dashboardSource("app.js");
  assert.match(html, /id="unsavedIndicator"/);
  assert.match(app, /hasUnsavedProductChanges/);
  assert.match(app, /beforeunload/);
  assert.match(app, /requiresStockRemovalConfirmation/);
  assert.match(app, /confirm\(/);
  assert.match(app, /Cancel/);
});

test("photo selection, status announcements, touch targets, and responsive layouts are explicit", () => {
  const html = dashboardSource("index.html");
  const app = dashboardSource("app.js");
  const css = dashboardSource("styles.css");
  assert.match(html, /id="photoSelectionStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="editorStatus"[^>]*aria-live="polite"/);
  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /URL\.revokeObjectURL/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(max-width:\s*900px\)/);
  assert.match(css, /@media \(max-width:\s*640px\)/);
  assert.match(css, /overflow-wrap|word-break/);
});
