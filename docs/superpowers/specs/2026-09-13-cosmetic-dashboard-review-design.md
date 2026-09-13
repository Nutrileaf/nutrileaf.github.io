# Cosmetic Dashboard Review Design

## Scope

Create a review-only visual and usability polish layer on `cosmetic-usability-review-dashboard`, based on the established P26 dashboard branch. The work must remain separate from the current public storefront and from P29.

## Design

- Retain the friendly pastel dashboard direction with clearer hierarchy, larger mobile controls, consistent pills, and calmer spacing.
- Keep Products and Orders easy to distinguish through a compact, wrapping section switcher.
- Improve toolbar, filters, cards, editor sections, messages, empty states, and product-image placeholders using CSS only.
- Do not change authentication, logout, session, CSRF, same-origin, API calls, product authority, order reads, or mutation behavior.
- Provide safe local screenshots using synthetic browser fixtures; do not use a production password or production product data.

## Verification

- Test stylesheet placement, touch target size, focus visibility, responsive single-column layout, contained product images, semantic state styling, and absence of privileged credentials.
- Run the complete dashboard/storefront regression suite and JavaScript syntax checks.
- Use a branch-restricted, non-deploying GitHub Actions verifier.
