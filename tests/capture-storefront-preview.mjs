import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const output = "artifacts/cosmetic-storefront";
mkdirSync(output, { recursive: true });

const products = [
  { id: "review-1", sku: "NL-REVIEW-001", name: "Turmeric Carrot Glow Bar", category: "Soap", description: "A bright botanical cleansing bar made for a gentle everyday routine.", price: 1200, active: 1, availability: "IN_STOCK", image: "turmeric-carrot-approved-ad.png" },
  { id: "review-2", sku: "NL-REVIEW-002", name: "Botanical Face Serum", category: "Facial Care", description: "A lightweight botanical blend designed to complement a simple skin-care ritual.", price: 1800, active: 1, availability: "IN_STOCK", image: "nutrileaf-herbal-hero.png" },
  { id: "review-3", sku: "NL-REVIEW-003", name: "Herbal Tea Blend", category: "Tea", description: "A thoughtfully prepared artisan tea blend with a calm herbal character.", price: 1000, active: 1, availability: "IN_STOCK", image: "nutrileaf-story-herbal.png" },
  { id: "review-4", sku: "NL-REVIEW-004", name: "Nourishing Body Butter", category: "Body Care", description: "A rich botanical body-care option presented in the NutriLeaf collection.", price: 1600, active: 1, availability: "IN_STOCK", image: "turmeric-carrot-ingredients.png" }
];

const browser = await chromium.launch({ headless: true });
for (const [name, viewport] of Object.entries({
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
})) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.route("**/products", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products }) }));
  await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "networkidle" });
  await page.locator(".product").first().waitFor();
  await page.screenshot({ path: `${output}/storefront-${name}.png`, fullPage: true });
  await context.close();
}
await browser.close();
