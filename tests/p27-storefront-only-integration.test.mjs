import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (name) => path.join(root, name);
const read = (name) => fs.readFileSync(at(name), "utf8");

test("P27 storefront-only candidate carries the public catalog runtime without dashboard source", () => {
  assert.equal(fs.existsSync(at("p27-catalog-launch.js")), true, "P27 public catalog runtime must exist");
  assert.equal(fs.existsSync(at("dashboard")), false, "dashboard/ must not exist in the storefront-only candidate");

  const index = read("index.html");
  const product = read("product.html");
  const launch = read("p27-catalog-launch.js");

  assert.match(index, /Online ordering is coming soon\./);
  assert.match(index, /src="p27-catalog-launch\.js"/);
  assert.match(product, /Online ordering coming soon/);
  assert.match(product, /src="p27-catalog-launch\.js"/);
  assert.match(launch, /https:\/\/nutrileaf-catalog-prod\.adam-d-may-20\.workers\.dev/);

  for (const [name, content] of [["index.html", index], ["product.html", product], ["p27-catalog-launch.js", launch]]) {
    assert.doesNotMatch(content, /(?:href|src)=["'][^"']*dashboard\//i, `${name} must not link to dashboard/`);
    assert.doesNotMatch(content, /\/admin\/products/i, `${name} must not expose an admin product endpoint`);
  }
});

test("P27 storefront-only candidate keeps production ordering controls dormant", () => {
  const index = read("index.html");
  const product = read("product.html");

  assert.match(index, /id="cartButton"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /id="cartDrawer"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /id="checkoutDialog"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(index, /id="checkoutButton"[^>]*disabled/);
  assert.match(product, /id="detailAdd"[^>]*disabled[^>]*tabindex="-1"/);
});
