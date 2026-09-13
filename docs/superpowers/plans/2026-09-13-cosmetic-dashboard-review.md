# Cosmetic Dashboard Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a tested, review-only NutriLeaf dashboard polish with desktop and mobile previews.

**Architecture:** Add one CSS override after the existing dashboard stylesheet and preserve all HTML identifiers and JavaScript behavior. Validate the visual contract with source tests and a non-deploying branch-only workflow.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js test runner, GitHub Actions, Playwright for local screenshots

**Spec:** `docs/superpowers/specs/2026-09-13-cosmetic-dashboard-review-design.md`

## Global Constraints

- Do not merge or deploy.
- Do not change authentication, authorization, CSRF, sessions, API routing, or server authority.
- Do not change real products, orders, stock, visibility, payments, shipping, or providers.
- Keep the branch based on P26 dashboard SHA `da3a25d499709facda3eb5e5bc57039e70f3c843`.

---

### Task 1: Review stylesheet contract

**Files:**
- Create: `tests/cosmetic-dashboard-review.test.mjs`
- Create: `dashboard/cosmetic-review.css`
- Modify: `dashboard/index.html`

**Interfaces:**
- Consumes: established P24–P26 dashboard class names and immutable element IDs
- Produces: a final review-only presentation layer

- [ ] **Step 1: Write the failing source-contract test** for stylesheet order, 48px mobile controls, visible focus, responsive stacking, contained images, and state colors.
- [ ] **Step 2: Run `node --test tests/cosmetic-dashboard-review.test.mjs`** and confirm failure because the stylesheet does not exist.
- [ ] **Step 3: Add the stylesheet link and minimal CSS overrides** without editing behavior scripts.
- [ ] **Step 4: Run the focused test and `npm test`** and require zero failures.
- [ ] **Step 5: Commit the tested dashboard presentation change.**

### Task 2: Branch-only verification

**Files:**
- Create: `.github/workflows/cosmetic-dashboard-review.yml`

**Interfaces:**
- Consumes: branch `cosmetic-usability-review-dashboard`
- Produces: non-deploying CI evidence for its exact pushed SHA

- [ ] **Step 1: Add a branch-restricted push/workflow-dispatch verifier** that runs full tests, dashboard syntax checks, and a privileged-source scan.
- [ ] **Step 2: Verify workflow structure and rerun local tests.**
- [ ] **Step 3: Commit and push, then confirm the Actions run event, branch, SHA, and conclusion.**

### Task 3: Safe screenshots

**Files:**
- Create locally only: `dashboard-desktop.png`
- Create locally only: `dashboard-mobile.png`

**Interfaces:**
- Consumes: local dashboard with mocked same-origin session and catalog reads
- Produces: credential-free review screenshots

- [ ] **Step 1: Intercept login/session/catalog requests with synthetic responses.**
- [ ] **Step 2: Capture desktop and mobile Products views without any real credentials or data.**
- [ ] **Step 3: Inspect both images for overflow, hierarchy, touch sizing, and state clarity.**
