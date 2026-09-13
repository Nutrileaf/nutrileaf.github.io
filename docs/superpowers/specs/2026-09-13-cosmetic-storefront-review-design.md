# Cosmetic Storefront Review Design

## Scope

Create a review-only visual polish layer on `cosmetic-usability-review-storefront`, based on the verified public storefront `main` baseline. The branch must not deploy or merge automatically.

## Design

- Keep the existing botanical identity while using a softer pastel canvas, rounded cards, pill controls, and stronger spacing hierarchy.
- Make product imagery consistent with a square, contained presentation that does not crop labels or packaging.
- Keep product names, descriptions, prices, categories, and catalog filtering behavior unchanged.
- Keep checkout and every ordering control dormant.
- Preserve one visible `h1`, keyboard focus, accessible names, reduced-motion behavior, and at least 44px mobile controls.
- Use a final CSS override so the change is isolated and reversible.
- Provide local desktop and mobile screenshots with mocked public catalog responses; do not deploy a preview or use private data.

## Verification

- Test the stylesheet link, responsive grid, focus indicators, image containment, pill controls, reduced-motion support, and dormant checkout boundary.
- Run the complete storefront regression suite and JavaScript syntax checks.
- Use a branch-restricted, non-deploying GitHub Actions verifier.
