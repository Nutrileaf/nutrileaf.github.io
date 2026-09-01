# P14 Storefront Authoritative Checkout Test Report

## Scope

P14 connects the static storefront to the TEST NutriLeaf P13 pending-order boundary. It does not deploy, migrate D1, call a payment or shipping provider, or perform any LIVE action.

## Verified behavior

- Catalog products come from `GET /products`; unavailable catalog data disables checkout.
- Cart storage contains only `product_id` and positive integer `quantity` values.
- Legacy cart data is discarded rather than mapped to authoritative product IDs.
- The checkout request builder emits only P13 customer/address fields and authoritative cart items.
- The submission client sends `POST /checkout/orders`, `Content-Type: application/json`, and `Idempotency-Key`.
- Network and 5xx failures retain the checkout attempt for safe retry.
- 400 remains inline, 404 refreshes the catalog, and 409 starts a fresh attempt after review.
- 201 renders a PENDING-order confirmation and never starts payment or fulfillment.
- Product detail pages resolve the string product ID against the API catalog.

## Automated verification

- `npm test`
- `node --check script.js`
- `node --check checkout-state.js`
- `node --check checkout-submit.js`
- `git diff --check`

## Activation gate

Runtime storefront-to-D1 verification remains blocked until the separately reviewed backend release applies `0005_p13_checkout_order_requests.sql` to the intended TEST D1 database and deploys the P13 TEST Worker. PR #1 must not be merged without explicit user approval.
