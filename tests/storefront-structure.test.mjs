import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("storefront cart is catalog-backed and contains no checkout price fields", () => {
  const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  assert.match(source, /\/products/);
  assert.match(source, /nutrileaf-cart-v2/);
  assert.match(source, /product_id/);
  assert.doesNotMatch(source, /items:\s*.*price/s);
});
