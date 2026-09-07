import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkoutResultAction } from "../checkout-state.js";
import { submitCheckout } from "../checkout-submit.js";
import * as compat from "../p23-storefront-compat.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("P23 PRODUCT_UNAVAILABLE is a distinct checkout action while other 409 conflicts stay unchanged", async () => {
  const payload = { error: { code: "PRODUCT_UNAVAILABLE", message: "One or more products are unavailable", product_ids: ["product-2"] } };
  assert.equal(checkoutResultAction(409, payload), "product-unavailable");
  assert.equal(checkoutResultAction(409, { error: "Conflicting Idempotency-Key" }), "restart-attempt");

  const result = await submitCheckout({
    apiBase: "https://api.example.test",
    body: { items: [] },
    idempotencyKey: "checkout-test",
    fetchImpl: async () => new Response(JSON.stringify(payload), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    })
  });
  assert.equal(result.action, "product-unavailable");
  assert.deepEqual(result.payload?.error?.product_ids, ["product-2"]);
});

test("Task 7 has a dedicated storefront compatibility helper boundary", () => {
  const helperPath = fileURLToPath(new URL("../p23-storefront-compat.js", import.meta.url));
  assert.equal(existsSync(helperPath), true);
});

test("availability is backwards-compatible when absent and fail-closed when explicitly unsupported", () => {
  assert.equal(typeof compat.normalizeProductAvailability, "function");
  assert.equal(typeof compat.isProductPurchasable, "function");

  assert.equal(compat.normalizeProductAvailability({ id: "legacy" }), "IN_STOCK");
  assert.equal(compat.isProductPurchasable({ id: "legacy" }), true);
  assert.equal(compat.normalizeProductAvailability({ availability: "IN_STOCK" }), "IN_STOCK");
  assert.equal(compat.isProductPurchasable({ availability: "IN_STOCK" }), true);
  assert.equal(compat.normalizeProductAvailability({ availability: "SOLD_OUT" }), "SOLD_OUT");
  assert.equal(compat.isProductPurchasable({ availability: "SOLD_OUT" }), false);
  assert.equal(compat.normalizeProductAvailability({ availability: "MAYBE" }), "UNAVAILABLE");
  assert.equal(compat.isProductPurchasable({ availability: "MAYBE" }), false);
  assert.equal(compat.normalizeProductAvailability({ availability: null }), "UNAVAILABLE");
});

test("safe product image resolution supports P23 API image paths and preserves safe legacy images", () => {
  assert.equal(typeof compat.resolveProductImage, "function");
  const apiBase = "https://nutrileaf-api.adam-d-may-20.workers.dev";
  const p23Path = "/images/products/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";
  assert.equal(compat.resolveProductImage({ image: p23Path }, apiBase), `${apiBase}${p23Path}`);
  assert.equal(compat.resolveProductImage({ image: "https://images.example.test/product.jpg" }, apiBase), "https://images.example.test/product.jpg");
  assert.equal(compat.resolveProductImage({ image: "assets/product.png" }, apiBase), "assets/product.png");
  assert.equal(compat.resolveProductImage({ image: null }, apiBase), null);
  assert.equal(compat.resolveProductImage({ image: "javascript:alert(1)" }, apiBase), null);
  assert.equal(compat.resolveProductImage({ image: "/images/products/../../secret.jpg" }, apiBase), null);
});

test("PRODUCT_UNAVAILABLE reconciliation removes only safe affected product IDs", () => {
  assert.equal(typeof compat.reconcileUnavailableCartItems, "function");
  const cart = [
    { product_id: "product-1", quantity: 1 },
    { product_id: "product-2", quantity: 2 },
    { product_id: "product-3", quantity: 1 }
  ];
  assert.deepEqual(compat.reconcileUnavailableCartItems(cart, ["product-2", "", null, "product-2"]), [
    { product_id: "product-1", quantity: 1 },
    { product_id: "product-3", quantity: 1 }
  ]);
  assert.deepEqual(compat.reconcileUnavailableCartItems(cart, "product-2"), cart);
});

test("catalog rendering integrates availability and safe image compatibility without changing filters", async () => {
  const script = await source("script.js");
  assert.match(script, /from "\.\/p23-storefront-compat\.js"/);
  assert.match(script, /normalizeProductAvailability\(p\)/);
  assert.match(script, /resolveProductImage\(p,API_BASE\)/);
  assert.match(script, /isProductPurchasable\(p\)/);
  assert.match(script, /Sold out/);
  assert.match(script, /disabled/);
  assert.match(script, /const list=filter==="All"\?products:products\.filter\(p=>p\.type===filter\)/);
});

test("canonical addToCart blocks unavailable products before analytics and reports success only for a real add", async () => {
  const script = await source("script.js");
  const lookup = script.indexOf("const p=products.find");
  const guard = script.indexOf("isProductPurchasable(p)", lookup);
  const analytics = script.indexOf("trackAddToCart(", lookup);
  assert.ok(lookup >= 0);
  assert.ok(guard > lookup);
  assert.ok(analytics > guard);
  assert.match(script, /return false/);
  assert.match(script, /return true/);
});

test("PRODUCT_UNAVAILABLE reconciles only server-identified cart IDs and never enters payment initiation", async () => {
  const script = await source("script.js");
  const branch = script.indexOf('result.action==="product-unavailable"');
  const reconcile = script.indexOf("reconcileUnavailableCartItems(cart,result.payload?.error?.product_ids)", branch);
  const payment = script.indexOf("submitPaymentInitiation(");
  assert.ok(branch >= 0);
  assert.ok(reconcile > branch);
  assert.ok(payment < branch || payment > reconcile);
  assert.match(script.slice(branch, branch + 900), /localStorage\.removeItem\("nutrileaf-checkout-attempt"\)/);
  assert.match(script.slice(branch, branch + 900), /await loadCatalog\(\)/);
  assert.doesNotMatch(script.slice(branch, branch + 900), /tax|stock|review/i);
});

test("product detail uses the same purchasability guard and cannot show a successful add toast for blocked products", async () => {
  const html = await source("product.html");
  assert.match(html, /nutrileafIsProductPurchasable\(product\)/);
  assert.match(html, /Sold out/);
  const click = html.indexOf('document.querySelector("#detailAdd").onclick');
  const add = html.indexOf("window.nutrileafAddToCart(product.id,amount)", click);
  const success = html.indexOf("added to cart", click);
  assert.ok(click >= 0);
  assert.ok(add > click);
  assert.ok(success > add);
  assert.match(html.slice(add, success), /if\s*\(!/);
});
