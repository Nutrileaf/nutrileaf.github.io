import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("review stylesheet is loaded last on catalog and product detail pages", () => {
  const index = read("index.html");
  const detail = read("product.html");
  assert.match(index, /post-publication-polish\.css[\s\S]*cosmetic-review\.css/);
  assert.match(detail, /styles\.css[\s\S]*cosmetic-review\.css/);
});

test("storefront review layer preserves readable responsive product presentation", () => {
  const stylesheet = new URL("../cosmetic-review.css", import.meta.url);
  assert.equal(existsSync(stylesheet), true, "cosmetic review stylesheet must exist");
  const css = readFileSync(stylesheet, "utf8");
  assert.match(css, /\.products\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*250px\),\s*1fr\)\)/s);
  assert.match(css, /\.product-details-link[\s\S]*min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("cosmetic review keeps ordering dormant and privileged credentials absent", () => {
  const stylesheet = new URL("../cosmetic-review.css", import.meta.url);
  assert.equal(existsSync(stylesheet), true, "cosmetic review stylesheet must exist");
  const sources = [read("index.html"), read("product.html"), readFileSync(stylesheet, "utf8")].join("\n");
  assert.match(sources, /id="cartButton" hidden aria-hidden="true"/);
  assert.doesNotMatch(sources, /NUTRILEAF_(?:PROD_)?ADMIN_TOKEN|STRIPE_SECRET|PAYPAL_CLIENT_SECRET|EASYPOST/i);
});
