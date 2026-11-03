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

test('newsletter region and review summary expose accessible names around the existing embedded form', () => {
  const index = read('index.html');
  assert.match(index, /<section class="newsletter" aria-labelledby="newsletter-title">/);
  assert.match(index, /<h2 id="newsletter-title">[^<]+<\/h2>/);
  assert.match(index, /<div class="kit-newsletter-form">\s*<script async data-uid="399e8d39ce" src="https:\/\/nutrileaf\.kit\.com\/399e8d39ce\/index\.js"><\/script>/);
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

test('post-publication decorator adds product-detail links while the catalog boundary still disables ordering', () => {
  const index = read('index.html');
  const polish = read('post-publication-polish.js');
  const launch = read('p27-catalog-launch.js');
  assert.match(index, /<script type="module" src="post-publication-polish\.js"><\/script>/);
  assert.match(polish, /product\.html\?id=/);
  assert.match(polish, /product-details-link/);
  assert.match(polish, /MutationObserver/);
  assert.match(launch, /Online ordering coming soon/);
  assert.match(launch, /removeAttribute\(['"]data-add-product['"]\)/);
});

test('hidden commerce controls stay hidden despite legacy header cart styling', () => {
  const index = read('index.html');
  const styles = read('post-publication-polish.css');
  assert.match(index, /id="cartButton" hidden aria-hidden="true"/);
  assert.match(styles, /\.header-nav \.cart-btn\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/s);
});

test('collection heading and detail links retain responsive storefront styling', () => {
  const index = read('index.html');
  const styles = read('post-publication-polish.css');
  assert.match(index, /<link rel="stylesheet" href="post-publication-polish\.css">/);
  assert.match(styles, /\.collection-banner h1\s*\{/);
  assert.match(styles, /\.product-details-link\s*\{/);
  assert.match(styles, /\.product-details-link:focus-visible/);
  assert.match(styles, /\.sr-only\s*\{/);
});

test('basic SEO metadata is canonical and product detail metadata follows the selected product', () => {
  const index = read('index.html');
  const detail = read('product.html');
  assert.match(index, /<link rel="canonical" href="https:\/\/nutrileaf\.github\.io\/">/);
  assert.match(detail, /<meta name="description"/);
  assert.match(detail, /<link rel="canonical" id="productCanonical" href="https:\/\/nutrileaf\.github\.io\/product\.html">/);
  assert.match(detail, /document\.title=`\$\{product\.name\} \| Nutrileaf`/);
  assert.match(detail, /productCanonical\.href=/);
});
