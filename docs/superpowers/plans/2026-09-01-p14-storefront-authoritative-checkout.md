# P14 Storefront Authoritative Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the NutriLeaf demo checkout with a TEST-only request flow that creates P13 authoritative pending orders.

**Architecture:** Refactor storefront commerce state into a small browser module that loads the API catalog, stores only D1 product IDs and quantities in the cart, shapes P13 checkout requests, and owns retry-safe idempotency state. The static UI renders catalog data and posts only the allowed P13 fields; the API remains authoritative for money and order snapshots.

**Tech Stack:** Static HTML/CSS, browser JavaScript ES modules, Node built-in test runner for pure checkout-state logic, Cloudflare/GitHub Pages static hosting.

**Spec:** `docs/superpowers/specs/2026-09-01-p14-storefront-authoritative-checkout-design.md`

## Global Constraints

- TEST-only repository work; no API deployment or remote D1 migration.
- No Stripe, PayPal, EasyPost, Microsoft Graph, provider, or LIVE action.
- The browser must never send prices, totals, product text, tax, shipping, or payment state.
- Cart identity is API `product_id` plus positive integer quantity only.
- API base URL is configuration, not a secret; credentials never enter the static site.
- Shipping and tax are display-only from the returned P13 order and remain zero until later policy work.
- Preserve existing product/review content outside the checkout flow.

---

### Task 1: Checkout state module and tests

**Files:**
- Create: `checkout-state.js`
- Create: `tests/checkout-state.test.mjs`
- Create: `package.json`

**Interfaces:**
- Produces `normalizeCatalog(products)`, `normalizeCart(cart)`, `createCheckoutRequest({ cart, customer })`, `checkoutKeyFor(fingerprint, stored)`, and `checkoutResultAction(status)`.
- `createCheckoutRequest` returns only the P13 `customer` object and `items: [{ product_id, quantity }]`.

- [x] Write failing Node tests that reject a cart item without a string `product_id`, remove browser price/name fields from the request, and preserve only positive integer quantities.
- [x] Run `node --test tests/checkout-state.test.mjs`; expect failure because `checkout-state.js` is absent.
- [x] Implement the minimal pure state module with no network calls or provider references.
- [x] Re-run the focused test; expect all assertions to pass.
- [x] Add failing tests for same-input retry key reuse, key replacement after a successful response, and the status mapping for 201, 400, 404, 409, and 5xx/network failure.
- [x] Implement the smallest deterministic fingerprint/key and status-action helpers to satisfy those tests.
- [x] Run `node --test tests/checkout-state.test.mjs` and commit the module, tests, and test script.

### Task 2: Catalog-backed storefront and cart migration

**Files:**
- Modify: `index.html`
- Modify: `script.js`
- Modify: `product.html`
- Modify: `styles.css`
- Test: `tests/storefront-structure.test.mjs`

**Interfaces:**
- Consumes `GET /products` response `{ products: [{ id, sku, name, description, category, price, active }] }`.
- Stores `nutrileaf-cart-v2` as `[{ product_id, quantity }]`.
- Temporarily reads old `nutrileaf-cart` only to discard it with a clear cart-refresh message; it must not map numeric legacy IDs to authoritative IDs.

- [x] Write a failing structural test requiring `script.js` to reference `/products`, `nutrileaf-cart-v2`, and `product_id`, and prohibiting checkout request construction from `.price` or `.name`.
- [x] Run `node --test tests/storefront-structure.test.mjs`; expect failure against the static hard-coded product array.
- [x] Add catalog loading with a configured TEST API base URL, rendering only active API products.
- [x] Replace cart entries with product IDs and quantities; derive all cart display details from the loaded catalog.
- [x] Keep product-page add-to-cart behavior by resolving the page query ID against API product IDs.
- [x] Handle catalog loading failure with a visible unavailable message and disabled checkout, not stale static price fallback.
- [x] Re-run focused tests and commit.

### Task 3: Checkout form and P13 submission flow

**Files:**
- Modify: `index.html`
- Modify: `script.js`
- Modify: `styles.css`
- Test: `tests/checkout-submission.test.mjs`

**Interfaces:**
- Consumes `createCheckoutRequest`, `checkoutKeyFor`, and `checkoutResultAction` from `checkout-state.js`.
- Calls `POST /checkout/orders` with `Content-Type: application/json` and `Idempotency-Key`.
- Renders P13 response `{ order: { order_number, status, subtotal, tax, shipping, total, currency, items } }`.

- [x] Write failing tests for request headers/body, a disabled submit state, retrying a network/5xx failure with the same key, and handling 201/400/404/409 without payment navigation.
- [x] Run `node --test tests/checkout-submission.test.mjs`; expect the absent submission module/UI behavior to fail.
- [x] Add an accessible checkout form with P13-required customer and US shipping fields.
- [x] Wire submission through the pure request builder; never send display price/total/name.
- [x] Render a PENDING-order confirmation only after 201; preserve the attempt key and form data for retryable failure.
- [x] Handle 404 by refreshing catalog, 409 by requiring a new checkout attempt, and 400 inline without clearing form data.
- [x] Re-run the focused tests and commit.

### Task 4: Repository verification and handoff

**Files:**
- Create: `P14_TEST_REPORT.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-01-p14-storefront-authoritative-checkout.md`

- [x] Run `npm test` (Node storefront tests), syntax validation for changed JavaScript, and a static-file structural review.
- [x] Inspect the exact branch diff to confirm it contains no API-worker, migration, provider, credential, or deployment change.
- [x] Document the exact tests and the activation gate: P13 migration `0005` plus reviewed Worker deployment are separate future actions.
- [ ] Create a PR against `main`, run its checks, and mark it ready only after those checks pass.
