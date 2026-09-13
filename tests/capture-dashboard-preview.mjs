import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const output = "artifacts/cosmetic-dashboard";
mkdirSync(output, { recursive: true });
const products = [
  { id: "review-product-1", sku: "NL-REVIEW-001", name: "Turmeric Carrot Glow Bar", product_type: "Soap", description: "A bright botanical cleansing bar for a gentle everyday routine.", price_cents: 1200, available_stock: 8, status: "IN_STOCK", visible_in_store: true, can_show_in_store: true, photo: { media_key: "review-image" } },
  { id: "review-product-2", sku: "NL-REVIEW-002", name: "Botanical Face Serum", product_type: "Facial Care", description: "A lightweight botanical blend.", price_cents: 1800, available_stock: 0, status: "HIDDEN", visible_in_store: false, can_show_in_store: false, visibility_message: "Product Type tax review is required before this product can be shown in the store.", photo: null },
  { id: "review-product-3", sku: "NL-REVIEW-003", name: "Herbal Tea Blend", product_type: "Tea", description: "An artisan tea blend.", price_cents: 1000, available_stock: 12, status: "IN_STOCK", visible_in_store: true, can_show_in_store: true, photo: null }
];

const browser = await chromium.launch({ headless: true });
for (const [name, config] of Object.entries({
  desktop: { viewport: { width: 1440, height: 1000 }, openEditor: false },
  mobile: { viewport: { width: 390, height: 844 }, openEditor: true }
})) {
  const context = await browser.newContext({ viewport: config.viewport });
  const page = await context.newPage();
  await page.route("**/api/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, csrf_token: "synthetic-review-token" }) }));
  await page.route("**/api/products?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products, next_cursor: null, counts: { total: 3, visible: 2, hidden: 1 } }) }));
  await page.route("**/media/products/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: readFileSync("turmeric-carrot-approved-ad.png") }));
  await page.goto("http://127.0.0.1:8766/dashboard/", { waitUntil: "networkidle" });
  await page.locator(".product-card").first().waitFor();
  if (config.openEditor) {
    await page.locator(".product-card").first().getByRole("button", { name: "Edit Product" }).click();
    await page.locator("#editor").waitFor();
  }
  await page.screenshot({ path: `${output}/dashboard-${name}.png`, fullPage: true });
  await context.close();
}
await browser.close();
