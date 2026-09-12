import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('home page has one primary heading and keeps the collection inside the main landmark', () => {
  const index = read('index.html');
  assert.equal((index.match(/<main\b/g) || []).length, 1);
  assert.match(index, /<main id="home">[\s\S]*?<section class="shop" id="shop">/);
  assert.equal((index.match(/<h1\b/g) || []).length, 1);
  assert.match(index, /<h1>The Collection<\/h1>/);
});

test('newsletter and review summary expose consistent accessible names', () => {
  const index = read('index.html');
  assert.match(index, /<label[^>]*for="newsletterEmail"[^>]*>Email address<\/label>/);
  assert.match(index, /<input id="newsletterEmail" type="email"/);
  assert.match(index, /aria-label="4\.95 out of 5 stars"/);
});

test('launch placeholder copy is removed from the public home page', () => {
  const index = read('index.html');
  for (const phrase of [
    "your wife's real story",
    'ready to customize with her story',
    'Nutrileaf list for new products',
    "Nutrileaf's email, social links"
  ]) assert.equal(index.includes(phrase), false, `placeholder phrase remains: ${phrase}`);
});

test('each dynamically rendered product card exposes a product-detail link without enabling ordering', () => {
  const script = read('script.js');
  const launch = read('p27-catalog-launch.js');
  assert.match(script, /product\.html\?id=\$\{encodeURIComponent\(String\(p\.id\)\)\}/);
  assert.match(script, /class="product-details-link"/);
  assert.match(script, /data-add-product="\$\{escapeHtml\(p\.id\)\}"/);
  assert.match(launch, /Online ordering coming soon/);
  assert.match(launch, /removeAttribute\(['"]data-add-product['"]\)/);
});

test('collection heading and detail links retain responsive storefront styling', () => {
  const styles = read('styles.css');
  assert.match(styles, /\.collection-banner h1\s*\{/);
  assert.match(styles, /\.product-details-link\s*\{/);
  assert.match(styles, /\.product-details-link:focus-visible/);
});
