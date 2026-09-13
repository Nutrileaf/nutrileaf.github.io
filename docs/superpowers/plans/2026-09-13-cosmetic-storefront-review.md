# Cosmetic Storefront Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a tested, review-only NutriLeaf storefront polish with desktop and mobile previews.

**Architecture:** Add one final CSS override loaded after existing styles so catalog and commerce JavaScript remain untouched. Lock its accessibility, responsiveness, and dormant-commerce boundaries with source-contract tests and a branch-only verification workflow.

**Tech Stack:** Static HTML/CSS, Node.js test runner, GitHub Actions, Playwright for local screenshots

**Spec:** `docs/superpowers/specs/2026-09-13-cosmetic-storefront-review-design.md`

## Global Constraints

- Do not merge or deploy.
- Do not activate checkout, payments, shipping, fulfillment, or privileged browser credentials.
- Do not change catalog authority, identity, SKU, price, stock, Product Type, tax readiness, visibility, or media rules.
- Keep the branch based on storefront `main` SHA `dd9af626a04bceeb6fb583f051e5cfe2f6a63a9b`.

---

### Task 1: Review stylesheet contract

**Files:**
- Create: `tests/cosmetic-storefront-review.test.mjs`
- Create: `cosmetic-review.css`
- Modify: `index.html`
- Modify: `product.html`

**Interfaces:**
- Consumes: existing `.product`, `.product-photo`, `.product-details-link`, `.category-pill`, `.review-*`, and product-detail class names
- Produces: a final `cosmetic-review.css` presentation layer

- [ ] **Step 1: Write the failing test** asserting both pages load the override and the override contains the required responsive grid, contained images, 44px controls, focus-visible, and reduced-motion rules.
- [ ] **Step 2: Run `node --test tests/cosmetic-storefront-review.test.mjs`** and confirm it fails because the stylesheet does not exist.
- [ ] **Step 3: Add the two stylesheet links and the minimal responsive cosmetic layer** without changing JavaScript or commerce markup.
- [ ] **Step 4: Run the focused test and `npm test`** and require zero failures.
- [ ] **Step 5: Commit the tested storefront presentation change.**

### Task 2: Branch-only verification

**Files:**
- Create: `.github/workflows/cosmetic-storefront-review.yml`

**Interfaces:**
- Consumes: branch `cosmetic-usability-review-storefront`
- Produces: non-deploying CI evidence for its exact pushed SHA

- [ ] **Step 1: Add a branch-restricted push/workflow-dispatch verifier** that runs the full suite, JavaScript syntax checks, and a privileged-source scan.
- [ ] **Step 2: Verify workflow syntax structurally and rerun local tests.**
- [ ] **Step 3: Commit and push, then confirm the resulting Actions run event, branch, SHA, and conclusion.**

### Task 3: Safe screenshots

**Files:**
- Create locally only: `storefront-desktop.png`
- Create locally only: `storefront-mobile.png`

**Interfaces:**
- Consumes: local static server plus mocked `GET /products`
- Produces: credential-free review screenshots

- [ ] **Step 1: Launch the branch locally and intercept catalog reads with synthetic fixtures.**
- [ ] **Step 2: Capture a desktop and mobile viewport.**
- [ ] **Step 3: Inspect both images for overflow, cropping, focus, spacing, and accidental commerce controls.**
