import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readDashboard = (name) => readFileSync(new URL(`../dashboard/${name}`, import.meta.url), "utf8");

test("dashboard loads the review stylesheet after its established styles", () => {
  const html = readDashboard("index.html");
  assert.match(html, /\.\/styles\.css[\s\S]*\.\/cosmetic-review\.css/);
});

test("dashboard review layer has comfortable controls and responsive layouts", () => {
  const stylesheet = new URL("../dashboard/cosmetic-review.css", import.meta.url);
  assert.equal(existsSync(stylesheet), true, "dashboard cosmetic review stylesheet must exist");
  const css = readFileSync(stylesheet, "utf8");
  assert.match(css, /\.pill\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.product-card-photo img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.message\.error[\s\S]*border-left/);
  assert.match(css, /\.message\.success[\s\S]*border-left/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("dashboard cosmetic layer does not introduce privileged browser credentials", () => {
  const stylesheet = new URL("../dashboard/cosmetic-review.css", import.meta.url);
  assert.equal(existsSync(stylesheet), true, "dashboard cosmetic review stylesheet must exist");
  const sources = [readDashboard("index.html"), readFileSync(stylesheet, "utf8")].join("\n");
  assert.doesNotMatch(sources, /NUTRILEAF_(?:PROD_)?ADMIN_TOKEN|STRIPE_SECRET|PAYPAL_CLIENT_SECRET|EASYPOST/i);
});
