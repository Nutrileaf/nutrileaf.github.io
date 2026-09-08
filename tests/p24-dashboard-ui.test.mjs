import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  P24_PRODUCT_TYPES,
  buildMutationHeaders,
  createMutationRequestId,
  operatorWarning,
  priceCentsFromInput,
  priceInputFromCents,
  productDraft,
  productStatusLabel
} from "../dashboard/model.js";

const PRODUCT_TYPES = ["Soap", "Facial Care", "Body Care", "Hair Care", "Serum", "Lotion", "Tea", "Plant"];

function dashboardSource(name) {
  return readFileSync(new URL(`../dashboard/${name}`, import.meta.url), "utf8");
}

test("dashboard model exposes exactly the approved Product Types", () => {
  assert.deepEqual(P24_PRODUCT_TYPES, PRODUCT_TYPES);
  assert.equal(P24_PRODUCT_TYPES.includes("test-fixture"), false);
});

test("price conversion is exact, bounded, and never uses floating-point dollars as API authority", () => {
  assert.equal(priceCentsFromInput("12.34"), 1234);
  assert.equal(priceCentsFromInput("0.01"), 1);
  assert.equal(priceCentsFromInput(""), null);
  assert.equal(priceInputFromCents(1234), "12.34");
  assert.equal(priceInputFromCents(null), "");
  for (const bad of ["0", "0.001", "-1", "1e3", "abc", "1000000.00"]) {
    assert.throws(() => priceCentsFromInput(bad), /price/i, bad);
  }
});

test("product draft sends only mutable P23 fields and never id or sku", () => {
  const draft = productDraft({
    id: "ignored-id",
    sku: "NL-999999",
    name: "  Evening Tea  ",
    product_type: "Tea",
    description: "  Botanical blend  ",
    price: "9.50",
    visible_in_store: true
  });
  assert.deepEqual(draft, {
    name: "Evening Tea",
    product_type: "Tea",
    description: "Botanical blend",
    price_cents: 950,
    visible_in_store: true
  });
  assert.equal(Object.hasOwn(draft, "id"), false);
  assert.equal(Object.hasOwn(draft, "sku"), false);
  assert.throws(() => productDraft({ name: "Tea", product_type: "Not A Type", price: "9.50" }), /Product Type/i);
});

test("operator labels are plain-language and tax pending remains fail-closed", () => {
  assert.equal(productStatusLabel({ status: "HIDDEN" }), "Hidden");
  assert.equal(productStatusLabel({ status: "IN_STOCK" }), "In Stock");
  assert.equal(productStatusLabel({ status: "SOLD_OUT" }), "Sold Out");
  assert.equal(
    operatorWarning({ can_show_in_store: false, visibility_message: "Product tax classification must be reviewed before it can be visible." }),
    "Tax classification pending — this product cannot be shown in the store yet."
  );
  assert.equal(operatorWarning({ can_show_in_store: true, visibility_message: null }), null);
});

test("mutation identity and headers are same-origin, retryable, and never contain bearer authorization", () => {
  const id = createMutationRequestId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const headers = buildMutationHeaders("csrf-state", id, true);
  assert.equal(headers["X-CSRF-Token"], "csrf-state");
  assert.equal(headers["X-Request-ID"], id);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(Object.keys(headers).some((key) => key.toLowerCase() === "authorization"), false);
});

test("dashboard document is buildless, same-origin, accessible, and contains the approved operator actions", () => {
  const html = dashboardSource("index.html");
  assert.match(html, /<link[^>]+href="\.\/styles\.css"/);
  assert.match(html, /<script[^>]+type="module"[^>]+src="\.\/app\.js"/);
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), false);
  for (const text of [
    "Products", "Add Product", "Edit Product", "Add stock", "Remove stock",
    "Add photo", "Replace photo", "Remove photo", "Show in store", "Hide from store", "Log out"
  ]) assert.ok(html.includes(text), text);
  assert.match(html, /type="password"/);
  assert.equal(/name="(?:token|secret|api[_-]?key|authorization)"/i.test(html), false);
});

test("frontend sources do not contain privileged credential names, persistent token storage, or direct commerce API calls", () => {
  const sources = ["index.html", "styles.css", "app.js", "model.js"].map(dashboardSource).join("\n");
  for (const forbidden of [
    "NUTRILEAF_TEST_ADMIN_TOKEN",
    "NUTRILEAF_DASHBOARD_TEST_SESSION_SECRET",
    "NUTRILEAF_DASHBOARD_TEST_PASSWORD_HASH",
    "CLOUDFLARE_API_TOKEN",
    "sk_live_",
    "sk_test_",
    "localStorage",
    "sessionStorage",
    "nutrileaf-api.adam-d-may-20.workers.dev",
    "Authorization"
  ]) assert.equal(sources.includes(forbidden), false, forbidden);
});
