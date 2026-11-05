# Dormant storefront commerce contract

## Current release boundary

`commerce-config.js` is the only storefront commerce release configuration. It is frozen, disabled, has no ingress, and has no approved product. Existing P27 hidden controls and click interception remain in place. Direct cart additions, form submissions, shipping, payment and email-status requests also fail closed in JavaScript. Production catalog reads use the existing catalog origin directly and never supply a commerce origin.

No URL parameter, browser global, stored value, customer input or catalog response can choose the commerce environment, ingress or product scope. An explicit source change is required before separately reviewed activation. This change does not provide that activation or authorize an endpoint.

## Required public interface

The following are the existing backend P13/P15/P16/P29 path and body contracts. `apiBase` is deliberately unset; no publicly reachable production ingress has been accepted for this storefront. A future ingress must preserve these public contracts and CORS support for `https://nutrileaf.github.io` without exposing an operator or administrative route or browser credential.

| Path | Browser request | Accepted response |
| --- | --- | --- |
| `POST /checkout/shipping/rates` | JSON `{customer_email, shipping_address, items:[{product_id, quantity}]}` | `200 {rates:[{rate_id, carrier, service, amount, currency, expires_at}]}`. Amounts are integer cents, currency USD, expiry is an epoch time in milliseconds. |
| `POST /checkout/orders` | JSON `{customer, items:[{product_id, quantity}], shipping_rate_id}` plus `Idempotency-Key` | `201` for a new order or `200` for replay, with `{order:{id, order_number, status, currency:"USD", subtotal, tax, shipping, total}}`. ID must be a UUID; amounts must be nonnegative safe integer cents with consistent total. Only PENDING enables payment selection; other recognized states require P16 lookup. |
| `POST /checkout/orders/:id/payments` | JSON `{provider:"STRIPE"\|"PAYPAL", operation_id:<UUID>}` plus the original production `Idempotency-Key` header | `200` or `201 {provider, operation_id, redirect_url}`, with matching operation/provider and a hosted URL for the configured environment. |
| `POST /checkout/orders/:id/status` | JSON `{email}` | `200 {order:{number,status,fulfillment_ready,message,shipping?,analytics?}}`; `404` for no matching order/email. Only known public fields survive frontend projection. |

All four requests use JSON, omit credentials and caching, and reject HTTP redirects. No merchant/provider/Access tokens or administrative endpoints are used. The existing original checkout key is a sensitive per-checkout capability; it is never placed in a URL, log, analytics event or payment body. OPTIONS must permit `Content-Type`; order creation and production payment must also permit `Idempotency-Key`.

The local production-payment ownership correction pairs with backend `ownsCheckoutOrder`: the exact key/order must exist in the original checkout request record before payment/hosted-URL replay. The controller uses only the original durable hold for the same order and preserves it across unknown responses/reloads. Missing, malformed, weak, legacy or other-order holds block before a new operation or transport; no replacement key or provider operation is minted. TEST behavior remains separate. This source contract needs paired backend/frontend review, CI and isolated runtime acceptance before future public activation; it creates no ingress or publishing authority. Email/status alone is not payment authority.

## Prepared behavior

- Shipping and checkout accept only the source-approved product at quantity one. The source product remains unset. Backend inventory, tax, packing and shipping policies remain authoritative.
- Rate selections exist in memory, are bound to normalized email/address/cart input, and expire at the server time. Address, email or cart changes invalidate them; stale asynchronous quote responses are discarded. Checkout requires a current selected rate.
- `SHIPPING_RATE_REQUIRED`, `SHIPPING_RATE_EXPIRED`, `SHIPPING_RATE_UNAVAILABLE` and `SHIPPING_RATE_MISMATCH` return to rate selection. An ambiguous `SHIPPING_RATE_CONFLICT` remains retryable with the same checkout idempotency key.
- The exact checkout request/key, cart revision and known order are saved in `sessionStorage` before leaving the pending-order step. Unknown responses and reloads within the same tab session resume the original request/rate/key before another attempt can begin. Retrying an already-created order accepts P13's HTTP 200 replay. Recognized nonpending responses lead to status verification without enabling payment.
- Customer drafts, complete request/fingerprint, pending-order records and payment provider/operation records use `sessionStorage`. Their keys are scoped to the source environment, ingress and approved product. `localStorage` retains the existing cart, cart revision and analytics marker, plus a minimal checkout hold containing only `{key, orderId}`. No raw email, customer body, address or request fingerprint is written to `localStorage`.
- A lost/closed tab session cannot silently start another attempt while its durable hold exists. A known order can be verified through P16; an unknown-order hold requires store reconciliation using its retained checkout reference. The client does not discard the hold to mint a new identity. If P16 releases a hold without the original session, the cart is retained because its original contents cannot be verified.
- Legacy TEST personal draft/fingerprint keys are removed while retaining any valid retry key in a separate legacy TEST hold. Future enabled TEST configurations treat that hold as reconciliation-only; malformed legacy holds fail closed. Existing `nutrileaf-payment-operation:<order>:<provider>` records also remain intact and block replacement TEST attempts/operations until reconciled. No legacy identity is adopted or replayed through the new namespace. Production ignores these legacy TEST records. All newly created personal/payment records use the tab session; retaining old nonpersonal operation IDs is an explicit reconciliation exception.
- Shipping-review responses block checkout. The UI does not expose, persist or act on the review ID or resume secret.
- Payment navigation requires a matching provider and operation ID. Stripe URLs must use `checkout.stripe.com` and the correct `cs_live_`/`cs_test_` session path. PayPal must use the production or Sandbox checkout host for the declared environment. Unknown or cross-environment URLs do not navigate.
- A payment controller serializes provider selection. The selected provider and operation ID are saved to the tab session before transport and retained across unknown results, hosted redirects and same-tab reloads. Other providers cannot start a competing operation for that saved order.
- Confirmation reads only `order_id` from the return URL. A return URL never establishes payment. Email verification uses P16 only when the source-owned ingress is available. Purchase analytics require an authoritative paid-state status response.
- Hosted navigation never clears a cart or a saved operation. A P16 paid/fulfilled response clears only the matching order's original cart revision and items, preserving later cart edits. Durable cleanup also requires the matching checkout key/order identity, reread before removal. A stale tab's status or definitive rejection cannot remove a newer checkout hold or cart. A verified CANCELLED, FAILED or REFUNDED response releases only the matching saved checkout while retaining its cart. Pending/unknown responses preserve both.
- Shipping progress displays only carrier, service and tracking status. Tracking links, internal IDs and customer-action flags are excluded from the UI. No customer shipping mutations are implied.

## Remaining release gaps

1. A reviewed public production ingress and its runtime/CORS acceptance are required. The production commerce Worker is currently intentionally nonpublic and disabled in backend source. The catalog endpoint and operator ingress are not substitutes.
2. A specific product must be approved and its inventory, tax classification, package/address and active shipping service policy must be accepted. The storefront does not choose or approve a SKU.
3. Existing P27 HTML/control gates, production backend flags and credentials require a separate authorized release. Changing this config alone does not activate those controls.
4. A customer-safe shipping review/resume and order-action interface is not integrated. Review-required destinations stop and direct the customer to the store. No administrative interface is exposed as a workaround.
5. Existing P15 error responses do not provide a customer-safe, authoritative distinction between a definitively failed operation and an unknown provider effect. The client therefore retains the same provider/operation and cannot automatically switch providers or mint a replacement operation after an ambiguous error. Safely resetting such an operation requires an accepted public response contract establishing a terminal no-effect outcome. No reset endpoint or administrative workaround is added here.
6. Verification here is offline. No provider, TEST, live commerce, migration, deployment or activation was exercised.
7. Complete checkout/payment resumption is limited to the original tab session. Cross-tab/browser-close recovery has no personal request or operation record to replay; it uses the durable identity hold and P16/manual reconciliation. No automatic replacement identity is created.

## Existing newsletter test correction

The existing main page uses an externally loaded Kit form inside the named newsletter region. The previous test expected a removed local `newsletterEmail` input/label and failed on unchanged main source. The assertion now checks the named section/heading and the unchanged embedded-form hook. The third-party form's generated field accessibility is unverified offline; no newsletter behavior or integration changed.
