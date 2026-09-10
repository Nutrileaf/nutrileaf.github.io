import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const script = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("P27 separates the production catalog endpoint from the retained TEST checkout endpoint", () => {
  assert.match(script, /const CATALOG_API_BASE="https:\/\/nutrileaf-catalog-prod\.[^"]+\.workers\.dev";/);
  assert.match(script, /const CHECKOUT_API_BASE="https:\/\/nutrileaf-api\.adam-d-may-20\.workers\.dev";/);
  assert.equal(/const API_BASE=/.test(script), false);
  assert.match(script, /fetch\(`\$\{CATALOG_API_BASE\}\/products`\)/);
  assert.match(script, /resolveProductImage\(p,CATALOG_API_BASE\)/);
  assert.match(script, /submitCheckout\(\{apiBase:CHECKOUT_API_BASE/);
  assert.match(script, /submitPaymentInitiation\(\{apiBase:CHECKOUT_API_BASE/);
});

test("P27 public production catalog is display-only and cannot feed TEST checkout", () => {
  assert.match(script, /Online ordering coming soon/);
  assert.doesNotMatch(script, /data-add-product=/);
  assert.doesNotMatch(script, /addToCart\(button\.dataset\.addProduct\)/);
  assert.match(index, /Online ordering is coming soon/);
  assert.doesNotMatch(index, /TEST checkout creates a pending order only/);
  assert.doesNotMatch(index, /Create pending order/);
});
