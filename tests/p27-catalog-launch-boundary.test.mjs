import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  CATALOG_API_BASE,
  LEGACY_TEST_API_BASE,
  absolutizeCatalogPayload,
  rewriteCatalogRequest
} from "../p27-catalog-launch.js";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const product = fs.readFileSync(new URL("../product.html", import.meta.url), "utf8");
const legacyScript = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");

test("P27 reroutes only legacy public catalog GETs to the production catalog worker", () => {
  assert.equal(CATALOG_API_BASE, "https://nutrileaf-catalog-prod.adam-d-may-20.workers.dev");
  assert.equal(LEGACY_TEST_API_BASE, "https://nutrileaf-api.adam-d-may-20.workers.dev");
  assert.equal(rewriteCatalogRequest(`${LEGACY_TEST_API_BASE}/products`, "GET"), `${CATALOG_API_BASE}/products`);
  assert.equal(rewriteCatalogRequest(`${LEGACY_TEST_API_BASE}/products?limit=24`, "GET"), `${CATALOG_API_BASE}/products?limit=24`);
  assert.equal(rewriteCatalogRequest(`${LEGACY_TEST_API_BASE}/checkout/orders`, "POST"), `${LEGACY_TEST_API_BASE}/checkout/orders`);
  assert.equal(rewriteCatalogRequest(`${LEGACY_TEST_API_BASE}/products`, "POST"), `${LEGACY_TEST_API_BASE}/products`);
  assert.equal(rewriteCatalogRequest("https://example.com/products", "GET"), "https://example.com/products");
});

test("P27 rewrites only safe relative P23 image paths to the production catalog origin", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  const imageId = "22222222-2222-4222-8222-222222222222";
  const safePath = `/images/products/${productId}/${imageId}.webp`;
  const payload = absolutizeCatalogPayload({
    products: [
      { id: productId, image: safePath },
      { id: "other", image: "https://cdn.example/image.webp" },
      { id: "bad", image: "/images/../secret" }
    ]
  });
  assert.equal(payload.products[0].image, `${CATALOG_API_BASE}${safePath}`);
  assert.equal(payload.products[1].image, "https://cdn.example/image.webp");
  assert.equal(payload.products[2].image, "/images/../secret");
});

test("P27 index boots the production catalog adapter before the preserved dormant TEST checkout runtime", () => {
  assert.match(index, /Online ordering is coming soon\./);
  const launchIndex = index.indexOf('src="p27-catalog-launch.js"');
  const legacyIndex = index.indexOf('src="script.js"');
  assert.ok(launchIndex >= 0 && legacyIndex > launchIndex);
  assert.match(index, /id="cartButton"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /id="cartDrawer"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /id="checkoutDialog"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /id="checkoutButton"[^>]*disabled/);
});

test("P27 product detail is display-only while preserving the prior guarded add contract as unreachable regression code", () => {
  const launchIndex = product.indexOf('src="p27-catalog-launch.js"');
  const legacyIndex = product.indexOf('src="script.js"');
  assert.ok(launchIndex >= 0 && legacyIndex > launchIndex);
  assert.match(product, /Online ordering coming soon/);
  assert.match(product, /<div hidden aria-hidden="true">[\s\S]*id="detailAdd"[^>]*disabled[^>]*tabindex="-1"/);
  assert.match(product, /nutrileafIsProductPurchasable\(product\)/);
  assert.match(product, /if\(!window\.nutrileafAddToCart\(product\.id,amount\)\)return;/);
  assert.doesNotMatch(product, />View Cart</);
});

test("P27 preserves the legacy TEST checkout implementation without promoting it to production", () => {
  assert.match(legacyScript, /const API_BASE="https:\/\/nutrileaf-api\.adam-d-may-20\.workers\.dev"/);
  assert.match(legacyScript, /submitCheckout\(\{apiBase:API_BASE/);
  assert.match(legacyScript, /submitPaymentInitiation\(\{apiBase:API_BASE/);
  assert.doesNotMatch(legacyScript, /nutrileaf-catalog-prod/);
});
