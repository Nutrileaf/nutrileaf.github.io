# P14 Storefront Authoritative Checkout Design

## Status and goal

**Status: approved design / specification review pending.**

P14 replaces the storefront’s demo checkout with a TEST-only request flow to the already merged NutriLeaf API P13 endpoint. Its goal is to let a shopper create a PENDING, server-authoritative order without starting payment, shipping, fulfillment, or export.

## Scope

P14 covers only:

- loading sellable product identity and display data from the NutriLeaf API catalog;
- storing cart entries as authoritative product IDs plus integer quantities;
- collecting the customer and US shipping fields required by P13;
- generating and persisting an idempotency key for one checkout submission;
- submitting the P13 request and rendering its returned pending-order confirmation;
- client-side validation for usability, while retaining Worker validation as the security boundary;
- test coverage and documentation for the static storefront.

P14 does not apply D1 migration `0005`, deploy the API Worker, invoke Stripe or PayPal, calculate tax, quote or purchase shipping, call Microsoft Graph, call EasyPost, expose credentials, create a real payment, or activate LIVE checkout.

## Product identity and catalog

The browser must never assign price, SKU, product name, tax, shipping, total, or payment state. The storefront will request a read-only API catalog and retain each API `product_id` in the cart. It may display API product names/prices for the shopper, but P13 will reread the product record and persist a server-side snapshot when the order is created.

If the existing public catalog route does not return stable D1 product IDs, P14 stops at that interface gap; adding or changing the catalog contract is a distinct API design decision, not an undocumented frontend workaround.

## Checkout request contract

P14 submits exactly:

```json
{
  "customer": {
    "email": "buyer@example.test",
    "first_name": "Buyer",
    "last_name": "Example",
    "phone": null,
    "shipping_address": {
      "name": "Buyer Example",
      "address_line1": "1 Test Street",
      "address_line2": null,
      "city": "San Diego",
      "state": "CA",
      "postal_code": "92101",
      "country": "US"
    }
  },
  "items": [
    { "product_id": "authoritative-product-id", "quantity": 1 }
  ]
}
```

It sends `Content-Type: application/json`, an `Idempotency-Key`, and no browser-provided price/total/product text. The key remains stable while retrying one unsatisfied checkout attempt and is replaced only after a successful order response or the shopper deliberately changes the cart/customer input.

## User experience and failure behavior

The checkout screen has three states:

1. **Cart/form:** editable catalog-backed items and required delivery information.
2. **Submitting:** submit control disabled to prevent accidental duplicate clicks.
3. **Pending order:** display returned order number and total with clear wording that payment and fulfillment have not started.

Validation failures stay inline and preserve entered form data. Network or 5xx failures preserve the same idempotency key and offer a retry. A 409 idempotency conflict asks the shopper to restart the checkout attempt. A 404 or unavailable-product response refreshes the catalog and returns the shopper to the cart. No client behavior may infer payment success.

## Security and storage

The static site stores only cart quantities, non-secret form draft values, and the scoped idempotency key. It must not store access tokens, API secrets, payment data, provider data, or authoritative totals. HTTPS API requests target the configured NutriLeaf TEST API origin. CORS remains enforced by the P13 API.

## Dependencies and gates

Before P14 can be runtime-tested against a deployed API, a separate release must apply P13 migration `0005` to the intended TEST D1 database and deploy the reviewed P13 Worker. Those are explicitly excluded from P14 repository implementation.

Tax, shipping quote selection, provider payment initiation, and fulfillment need later dedicated designs because P13 currently fixes tax and shipping at zero.

## Verification

P14 implementation must use TDD for:

- cart identity retaining API `product_id` and quantity only;
- request shaping without price/total fields;
- idempotency-key reuse on retry and replacement after success/input change;
- form validation and submission state;
- handling 201, 400, 404, 409, and network/5xx responses;
- proof that no payment/provider endpoint is called.

The final repository checkpoint runs the storefront test/build workflow and reviews the exact diff. Runtime activation remains separately gated.
