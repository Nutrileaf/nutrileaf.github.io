import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("P22 uses the pre-existing authoritative GA4 measurement ID through one bootstrap", async () => {
  const bootstrap = await source("ga4-bootstrap.js");
  assert.match(bootstrap, /G-8V7YT8ELZ2/);
  assert.match(bootstrap, /NUTRILEAF_GA4_MEASUREMENT_ID/);
  for (const page of ["index.html", "product.html", "confirmation.html"]) {
    const html = await source(page);
    assert.match(html, /<script type="module" src="ga4-bootstrap\.js"><\/script>/);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js\?id=/);
  }
});

test("add_to_cart is emitted only from canonical addToCart after product lookup", async () => {
  const script = await source("script.js");
  const productLookup = script.indexOf("const p=products.find");
  const eventCall = script.indexOf("trackAddToCart(");
  assert.ok(productLookup >= 0);
  assert.ok(eventCall > productLookup);
});

test("begin_checkout is emitted only after authoritative P13 checkout confirmation", async () => {
  const script = await source("script.js");
  const submit = script.indexOf("await submitCheckout(");
  const confirmed = script.indexOf('if(result.action==="confirm")');
  const eventCall = script.indexOf("trackBeginCheckout(");
  assert.ok(submit >= 0);
  assert.ok(confirmed > submit);
  assert.ok(eventCall > confirmed);
});

test("view_item is emitted only after a canonical product detail resolves", async () => {
  const html = await source("product.html");
  const lookup = html.indexOf("window.nutrileafProducts.find");
  const eventCall = html.indexOf("trackViewItem(");
  assert.ok(lookup >= 0);
  assert.ok(eventCall > lookup);
});

test("purchase is emitted only from D1-backed order.analytics on status confirmation", async () => {
  const confirmation = await source("confirmation.js");
  const statusRead = confirmation.indexOf("await getOrderStatus(");
  const statusSuccess = confirmation.indexOf('status.action === "status"');
  const analyticsGuard = confirmation.indexOf("order.analytics");
  const purchase = confirmation.indexOf("trackPurchase(order.analytics)");
  assert.ok(statusRead >= 0);
  assert.ok(statusSuccess > statusRead);
  assert.ok(analyticsGuard > statusSuccess);
  assert.ok(purchase >= analyticsGuard);
});
