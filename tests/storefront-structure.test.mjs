import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("storefront cart is catalog-backed and contains no checkout price fields", () => {
  const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  assert.match(source, /\/products/);
  assert.match(source, /nutrileaf-cart-v2/);
  assert.match(source, /product_id/);
  assert.match(source, /cart\s*=\s*normalizeCart\(cart\)/);
  assert.doesNotMatch(source, /const legacyProducts/);
  assert.doesNotMatch(source, /items:\s*.*price/s);
});

test("storefront exposes an accessible pending-order checkout form", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  assert.match(html, /id="checkoutForm"/);
  assert.match(html, /id="checkoutDialog"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="checkoutButton"[^>]*disabled/);
  assert.match(html, /id="checkoutStatus"[^>]*aria-live="polite"/);
  assert.match(html, /name="email"[^>]*required/);
  assert.match(html, /name="address_line1"[^>]*required/);
  assert.match(html, /name="country"[^>]*value="US"/);
  assert.match(html, /script type="module" src="script\.js"/);
  assert.match(source, /submitCheckout/);
  assert.match(source, /submitPaymentInitiation/);
  assert.match(source, /data-payment-provider="STRIPE"/);
  assert.match(source, /data-payment-provider="PAYPAL"/);
  assert.doesNotMatch(source, /sk_(test|live)_|paypal.*secret/i);
  assert.match(source, /refresh-catalog[\s\S]*setCheckoutOpen\(false\)/);
  assert.match(source, /checkoutForm\.hidden\s*=\s*false/);
  assert.match(source, /child\.inert\s*=\s*open/);
});

test("product detail resolves the authoritative catalog product ID", () => {
  const html = readFileSync(new URL("../product.html", import.meta.url), "utf8");
  assert.match(html, /script type="module" src="script\.js"/);
  assert.match(html, /nutrileafCatalogReady/);
  assert.doesNotMatch(html, /Number\(id\)/);
});
