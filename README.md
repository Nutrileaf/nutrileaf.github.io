# Nutrileaf storefront

This static storefront reads its sellable catalog from the NutriLeaf API and creates TEST-only, server-authoritative pending orders through `POST /checkout/orders`.

## Included
- Responsive storefront
- Product categories
- API catalog-backed product cards
- Shopping cart storing only authoritative product IDs and quantities
- Cart totals and remove buttons
- Retry-safe pending-order checkout using an idempotency key
- Newsletter UI
- Mobile layout
- Placeholder branding/art

## P14 safety boundary

The checkout form sends only customer/address fields, authoritative `product_id` values, quantities, and an `Idempotency-Key`. Prices, totals, product text, tax, shipping, and payment state are never supplied by the browser. A successful response confirms a PENDING order only; payment and fulfillment do not start.

Runtime verification is gated on applying backend migration `0005_p13_checkout_order_requests.sql` to TEST D1 and deploying the reviewed P13 TEST Worker. P14 does not include either release action.

## Free hosting
This static version can be deployed to Cloudflare Pages or Netlify. No GoDaddy subscription is required for hosting.

## Verification

Run `npm test` and the JavaScript syntax checks defined in `.github/workflows/p14-storefront-verify.yml`.
