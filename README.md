# Nutrileaf storefront

This static storefront reads the production public catalog. Online ordering remains closed. Checkout, shipping selection, payment initiation and order confirmation are prepared as dormant source code with a separate, disabled commerce configuration.

## Included
- Responsive storefront
- Product categories
- API catalog-backed product cards
- Shopping cart storing only authoritative product IDs and quantities
- Cart totals and remove buttons
- Disabled pending-order checkout using an idempotency key
- Session-scoped checkout/payment identities for same-tab reload and ambiguous-response recovery
- Server-issued shipping-rate selection with expiry and input invalidation
- Environment-specific hosted payment URL checks
- Disabled, email-verified authoritative order-status lookup
- Cart cleanup only after matching authoritative completion, preserving later edits
- Newsletter UI
- Mobile layout
- Placeholder branding/art

## Commerce safety boundary

The checkout form sends only customer/address fields, authoritative `product_id` values, quantities, a server-issued `shipping_rate_id`, and an `Idempotency-Key`. Prices, totals, product text, tax, shipping amounts, and payment state are never supplied by the browser. A successful response confirms a PENDING order only.

`commerce-config.js` remains source-owned with `enabled: false`, no public ingress and no approved product. It reads no window, query-string, local-storage or catalog fallback configuration. The default helpers do not make commerce requests. The catalog-only production origin and the legacy TEST origin cannot become a production checkout endpoint. All existing hidden ordering controls remain hidden.

The prepared scope is one explicitly approved product at quantity one. No product has been approved by this source change. See [the commerce contract and remaining release gaps](docs/commerce-launch-contract.md). This source preparation includes no deployment or activation.

## Free hosting
This static version can be deployed to Cloudflare Pages or Netlify. No GoDaddy subscription is required for hosting.

## Verification

Run `npm test` and the JavaScript syntax checks defined in `.github/workflows/p14-storefront-verify.yml`.
