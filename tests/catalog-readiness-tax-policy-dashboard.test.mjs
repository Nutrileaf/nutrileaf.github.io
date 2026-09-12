import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  policyDisplay,
  policyApprovalBody,
  policyEndpoint
} from "../dashboard/tax-policy-model.js";

const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../dashboard/tax-policies.js", import.meta.url), "utf8");

test("dashboard contains an authenticated Product Type Tax Review workspace without exposing it on public pages", () => {
  assert.match(html, /id="taxPoliciesTab"[^>]*>Tax Review</);
  assert.match(html, /id="taxPoliciesPanel"[^>]*hidden/);
  assert.match(html, /Product Type Tax Review/);
  assert.match(html, /id="taxPoliciesList"/);
  assert.match(html, /src="\.\/tax-policies\.js"/);
  assert.doesNotMatch(html, /NUTRILEAF_PROD_ADMIN_TOKEN|Bearer\s+[A-Za-z0-9]/);
});

test("tax policy model formats readiness and builds only approved policy payloads", () => {
  assert.deepEqual(policyDisplay({ product_type: "Soap", stripe_tax_code: "txcd_32050006", review_status: "APPROVED", reviewed_at: 123 }), {
    product_type: "Soap",
    stripe_tax_code: "txcd_32050006",
    status: "Approved",
    ready: true,
    reviewed_at: 123
  });
  assert.deepEqual(policyDisplay({ product_type: "Lotion", stripe_tax_code: null, review_status: "PENDING_REVIEW", reviewed_at: null }), {
    product_type: "Lotion",
    stripe_tax_code: null,
    status: "Needs review",
    ready: false,
    reviewed_at: null
  });
  assert.deepEqual(policyApprovalBody("txcd_32050013"), { review_status: "APPROVED", stripe_tax_code: "txcd_32050013" });
  assert.throws(() => policyApprovalBody("bad"), /INVALID_TAX_CODE/);
});

test("tax policy endpoint allows only the fixed Product Type set", () => {
  assert.equal(policyEndpoint("Facial Care"), "/api/product-type-tax-policies/Facial%20Care");
  assert.throws(() => policyEndpoint("Medicine"), /INVALID_PRODUCT_TYPE/);
});

test("tax policy browser code uses same-origin session/CSRF request flow and never embeds bearer auth", () => {
  assert.match(js, /\/api\/session/);
  assert.match(js, /X-CSRF-Token/);
  assert.match(js, /X-Request-ID/);
  assert.match(js, /credentials:\s*["']same-origin["']/);
  assert.match(js, /\/api\/product-type-tax-policies/);
  assert.doesNotMatch(js, /Authorization|Bearer|NUTRILEAF_PROD_ADMIN_TOKEN/);
});
