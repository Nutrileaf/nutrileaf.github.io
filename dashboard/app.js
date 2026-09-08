import {
  P24_PRODUCT_TYPES,
  buildMutationHeaders,
  createMutationRequestId,
  operatorWarning,
  priceInputFromCents,
  productDraft,
  productStatusLabel
} from "./model.js";

const els = {
  loginView: document.querySelector("#loginView"),
  dashboardView: document.querySelector("#dashboardView"),
  loginForm: document.querySelector("#loginForm"),
  password: document.querySelector("#password"),
  loginMessage: document.querySelector("#loginMessage"),
  logoutButton: document.querySelector("#logoutButton"),
  addProductButton: document.querySelector("#addProductButton"),
  refreshButton: document.querySelector("#refreshButton"),
  searchInput: document.querySelector("#searchInput"),
  pageMessage: document.querySelector("#pageMessage"),
  counts: document.querySelector("#counts"),
  productList: document.querySelector("#productList"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  emptyProductsTemplate: document.querySelector("#emptyProductsTemplate"),
  editor: document.querySelector("#editor"),
  editorMode: document.querySelector("#editorMode"),
  editorTitle: document.querySelector("#editorTitle"),
  skuLine: document.querySelector("#skuLine"),
  closeEditorButton: document.querySelector("#closeEditorButton"),
  cancelProductButton: document.querySelector("#cancelProductButton"),
  productForm: document.querySelector("#productForm"),
  productName: document.querySelector("#productName"),
  productType: document.querySelector("#productType"),
  productDescription: document.querySelector("#productDescription"),
  productPrice: document.querySelector("#productPrice"),
  visibilityState: document.querySelector("#visibilityState"),
  showProductButton: document.querySelector("#showProductButton"),
  hideProductButton: document.querySelector("#hideProductButton"),
  readinessWarning: document.querySelector("#readinessWarning"),
  readinessText: document.querySelector("#readinessText"),
  clearWarningButton: document.querySelector("#clearWarningButton"),
  stockSection: document.querySelector("#stockSection"),
  stockValue: document.querySelector("#stockValue"),
  stockQuantity: document.querySelector("#stockQuantity"),
  addStockButton: document.querySelector("#addStockButton"),
  removeStockButton: document.querySelector("#removeStockButton"),
  photoSection: document.querySelector("#photoSection"),
  photoPreview: document.querySelector("#photoPreview"),
  photoInput: document.querySelector("#photoInput"),
  addPhotoButton: document.querySelector("#addPhotoButton"),
  replacePhotoButton: document.querySelector("#replacePhotoButton"),
  removePhotoButton: document.querySelector("#removePhotoButton")
};

const state = {
  csrf: null,
  products: [],
  selected: null,
  nextCursor: null,
  counts: null,
  retryIds: new Map(),
  searchTimer: null
};

for (const type of P24_PRODUCT_TYPES) {
  const option = document.createElement("option");
  option.value = type;
  option.textContent = type;
  els.productType.append(option);
}

function showMessage(element, text, kind = "") {
  element.textContent = text || "";
  element.className = `message${kind ? ` ${kind}` : ""}`;
  element.hidden = !text;
}

function friendlyError(payload, fallback = "That change could not be completed.") {
  const code = payload?.error?.code;
  const messages = {
    STOCK_CONFLICT: "There is not enough stock for that change. Refresh and try again.",
    PRODUCT_NOT_FOUND: "That product could not be found. Refresh the product list.",
    INVALID_PRICE: "Enter a valid product price.",
    INVALID_PRODUCT_TYPE: "Choose one of the available Product Types.",
    IMAGE_TOO_LARGE: "That photo is larger than 2 MB.",
    UNSUPPORTED_IMAGE_TYPE: "Use a JPEG, PNG, or WebP photo.",
    IDEMPOTENCY_CONFLICT: "This change conflicts with an earlier attempt. Refresh before trying again.",
    PHOTO_CONFLICT: "The photo changed during this request. Refresh before trying again.",
    UNAUTHENTICATED: "Your session expired. Sign in again.",
    CSRF_REJECTED: "Your session needs to be refreshed. Sign in again.",
    TOO_MANY_LOGIN_ATTEMPTS: "Too many login attempts. Try again shortly.",
    INVALID_LOGIN: "The dashboard password was not accepted.",
    UPSTREAM_UNAVAILABLE: "The product service is temporarily unavailable. Try again."
  };
  return messages[code] || payload?.error?.message || fallback;
}

async function responsePayload(response) {
  try { return await response.json(); } catch { return null; }
}

function showLogin(message = "") {
  state.csrf = null;
  state.products = [];
  state.selected = null;
  state.retryIds.clear();
  els.dashboardView.hidden = true;
  els.editor.hidden = true;
  els.loginView.hidden = false;
  showMessage(els.loginMessage, message, message ? "error" : "");
  els.password.focus();
}

function showDashboard() {
  els.loginView.hidden = true;
  els.dashboardView.hidden = false;
  showMessage(els.loginMessage, "");
}

async function loadSession() {
  const response = await fetch("/api/session", { method: "GET", credentials: "same-origin" });
  if (!response.ok) return false;
  const body = await responsePayload(response);
  if (!body?.authenticated || typeof body.csrf_token !== "string") return false;
  state.csrf = body.csrf_token;
  return true;
}

function retryId(key) {
  if (!state.retryIds.has(key)) state.retryIds.set(key, createMutationRequestId());
  return state.retryIds.get(key);
}

function completeRetry(key) {
  state.retryIds.delete(key);
}

async function mutateJson(key, path, method, body) {
  const id = retryId(key);
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: buildMutationHeaders(state.csrf, id, true),
    body: JSON.stringify(body)
  });
  const payload = await responsePayload(response);
  if (response.status === 401 || response.status === 403) {
    showLogin(friendlyError(payload, "Your session expired. Sign in again."));
    throw new Error("SESSION_EXPIRED");
  }
  if (!response.ok) throw Object.assign(new Error(friendlyError(payload)), { payload });
  completeRetry(key);
  return payload;
}

async function mutateBinary(key, path, method, file = null) {
  const id = retryId(key);
  const headers = buildMutationHeaders(state.csrf, id, false);
  if (file) headers["Content-Type"] = file.type;
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    ...(file ? { body: file } : {})
  });
  const payload = await responsePayload(response);
  if (response.status === 401 || response.status === 403) {
    showLogin(friendlyError(payload, "Your session expired. Sign in again."));
    throw new Error("SESSION_EXPIRED");
  }
  if (!response.ok) throw Object.assign(new Error(friendlyError(payload)), { payload });
  completeRetry(key);
  return payload;
}

function allowedProduct(product) {
  return product && P24_PRODUCT_TYPES.includes(product.product_type) && typeof product.id === "string";
}

function currency(cents) {
  if (!Number.isSafeInteger(cents) || cents < 1) return "Price not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function statusClass(product) {
  if (product?.status === "IN_STOCK") return "in-stock";
  if (product?.status === "SOLD_OUT") return "sold-out";
  return "hidden";
}

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";
  card.dataset.productId = product.id;

  const photo = document.createElement("div");
  photo.className = "product-card-photo";
  if (product.photo) {
    const image = document.createElement("img");
    image.src = `/media/products/${encodeURIComponent(product.id)}`;
    image.alt = `${product.name} photo`;
    image.loading = "lazy";
    photo.append(image);
  } else {
    photo.textContent = "No photo";
  }

  const body = document.createElement("div");
  body.className = "product-card-body";
  const title = document.createElement("h2");
  title.className = "product-card-title";
  title.textContent = product.name;
  const meta = document.createElement("div");
  meta.className = "product-meta";
  for (const value of [product.product_type, product.sku || "SKU unavailable", currency(product.price_cents), `Stock ${product.available_stock ?? 0}`]) {
    const span = document.createElement("span");
    span.textContent = value;
    meta.append(span);
  }
  const chip = document.createElement("span");
  chip.className = `status-chip ${statusClass(product)}`;
  chip.textContent = productStatusLabel(product);
  body.append(title, meta, document.createElement("br"), chip);

  const warning = operatorWarning(product);
  if (warning) {
    const warningElement = document.createElement("p");
    warningElement.className = "card-warning";
    warningElement.textContent = warning;
    body.append(warningElement);
  }

  const actions = document.createElement("div");
  actions.className = "product-card-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "pill quiet";
  edit.textContent = "Edit Product";
  edit.addEventListener("click", () => openEditor(product));
  actions.append(edit);
  card.append(photo, body, actions);
  return card;
}

function renderCounts() {
  if (!state.counts || typeof state.counts !== "object") {
    els.counts.textContent = `${state.products.length} product${state.products.length === 1 ? "" : "s"}`;
    return;
  }
  const total = Number(state.counts.total);
  const hidden = Number(state.counts.hidden);
  const visible = Number(state.counts.visible);
  const parts = [];
  if (Number.isSafeInteger(total)) parts.push(`${total} total`);
  if (Number.isSafeInteger(visible)) parts.push(`${visible} visible`);
  if (Number.isSafeInteger(hidden)) parts.push(`${hidden} hidden`);
  els.counts.textContent = parts.length ? parts.join(" · ") : `${state.products.length} products loaded`;
}

function renderProducts() {
  els.productList.replaceChildren();
  if (state.products.length === 0) {
    els.productList.append(els.emptyProductsTemplate.content.cloneNode(true));
  } else {
    for (const product of state.products) els.productList.append(createProductCard(product));
  }
  renderCounts();
  els.loadMoreButton.hidden = !state.nextCursor;
}

async function loadProducts({ append = false } = {}) {
  showMessage(els.pageMessage, "Loading products…");
  const params = new URLSearchParams({ limit: "24" });
  const search = els.searchInput.value.trim();
  if (search) params.set("search", search);
  if (append && state.nextCursor) params.set("cursor", state.nextCursor);
  try {
    const response = await fetch(`/api/products?${params}`, { credentials: "same-origin" });
    const body = await responsePayload(response);
    if (response.status === 401) return showLogin("Your session expired. Sign in again.");
    if (!response.ok) throw new Error(friendlyError(body, "Products could not be loaded."));
    const incoming = Array.isArray(body?.products) ? body.products.filter(allowedProduct) : [];
    state.products = append ? [...state.products, ...incoming] : incoming;
    state.nextCursor = typeof body?.next_cursor === "string" && body.next_cursor ? body.next_cursor : null;
    state.counts = body?.counts ?? null;
    renderProducts();
    showMessage(els.pageMessage, "");
  } catch (error) {
    showMessage(els.pageMessage, error.message || "Products could not be loaded.", "error");
  }
}

function updateProductState(product) {
  if (!allowedProduct(product)) return;
  const index = state.products.findIndex((item) => item.id === product.id);
  if (index >= 0) state.products[index] = product;
  else state.products.unshift(product);
  state.selected = product;
  renderProducts();
  populateEditor(product);
}

function setEditorWarning(product) {
  const warning = product ? operatorWarning(product) : null;
  els.readinessWarning.hidden = !warning;
  els.readinessText.textContent = warning || "";
}

function populateEditor(product) {
  const editing = Boolean(product);
  els.editorMode.textContent = editing ? "PRODUCT DETAILS" : "NEW PRODUCT";
  els.editorTitle.textContent = editing ? "Edit Product" : "Add Product";
  els.skuLine.textContent = editing ? `SKU: ${product.sku || "Unavailable"}` : "SKU will be created automatically when this product is saved.";
  els.productName.value = product?.name ?? "";
  els.productType.value = product?.product_type ?? P24_PRODUCT_TYPES[0];
  els.productDescription.value = product?.description ?? "";
  els.productPrice.value = priceInputFromCents(product?.price_cents ?? null);
  els.visibilityState.textContent = editing ? productStatusLabel(product) : "Hidden when created";
  els.stockSection.hidden = !editing;
  els.photoSection.hidden = !editing;
  els.showProductButton.disabled = !editing;
  els.hideProductButton.disabled = !editing;
  els.stockValue.textContent = editing ? String(product.available_stock ?? 0) : "0";
  setEditorWarning(product);
  if (editing && product.photo) {
    els.photoPreview.src = `/media/products/${encodeURIComponent(product.id)}`;
    els.photoPreview.hidden = false;
  } else {
    els.photoPreview.removeAttribute("src");
    els.photoPreview.hidden = true;
  }
}

function openEditor(product = null) {
  state.selected = product;
  populateEditor(product);
  els.editor.hidden = false;
  els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  els.productName.focus();
}

function closeEditor() {
  state.selected = null;
  els.editor.hidden = true;
  els.productForm.reset();
  els.photoInput.value = "";
  setEditorWarning(null);
}

async function saveProduct(event) {
  event.preventDefault();
  try {
    const draft = productDraft({
      name: els.productName.value,
      product_type: els.productType.value,
      description: els.productDescription.value,
      price: els.productPrice.value,
      visible_in_store: state.selected?.visible_in_store === true
    });
    if (!state.selected) draft.visible_in_store = false;
    const bodyFingerprint = JSON.stringify(draft);
    const key = state.selected ? `edit:${state.selected.id}:${bodyFingerprint}` : `create:${bodyFingerprint}`;
    const path = state.selected ? `/api/products/${encodeURIComponent(state.selected.id)}` : "/api/products";
    const method = state.selected ? "PATCH" : "POST";
    const result = await mutateJson(key, path, method, draft);
    if (result?.product) updateProductState(result.product);
    showMessage(els.pageMessage, state.selected ? "Product saved." : "Product added as Hidden.", "success");
    if (!state.selected && result?.product) openEditor(result.product);
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") showMessage(els.pageMessage, error.message, "error");
  }
}

async function changeVisibility(visible) {
  if (!state.selected) return;
  const key = `visibility:${state.selected.id}:${visible}`;
  try {
    const result = await mutateJson(key, `/api/products/${encodeURIComponent(state.selected.id)}`, "PATCH", { visible_in_store: visible });
    if (result?.product) updateProductState(result.product);
    const actuallyVisible = result?.product?.visible_in_store === true;
    showMessage(
      els.pageMessage,
      actuallyVisible ? "Product is shown in the store." : visible ? "Product stayed Hidden because it is not ready for the store." : "Product is Hidden.",
      actuallyVisible || !visible ? "success" : ""
    );
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") showMessage(els.pageMessage, error.message, "error");
  }
}

function stockQuantity() {
  const quantity = Number(els.stockQuantity.value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new Error("Enter a whole stock quantity of 1 or more.");
  return quantity;
}

async function adjustStock(operation) {
  if (!state.selected) return;
  try {
    const quantity = stockQuantity();
    const body = { operation, quantity };
    const key = `stock:${state.selected.id}:${operation}:${quantity}`;
    const result = await mutateJson(key, `/api/products/${encodeURIComponent(state.selected.id)}/stock`, "POST", body);
    if (result?.product) updateProductState(result.product);
    showMessage(els.pageMessage, operation === "ADD" ? "Stock added." : "Stock removed.", "success");
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") showMessage(els.pageMessage, error.message, "error");
  }
}

function selectedPhotoFile() {
  const file = els.photoInput.files?.[0];
  if (!file) throw new Error("Choose a photo first.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPEG, PNG, or WebP photo.");
  if (file.size > 2 * 1024 * 1024) throw new Error("That photo is larger than 2 MB.");
  return file;
}

async function uploadPhoto() {
  if (!state.selected) return;
  try {
    const file = selectedPhotoFile();
    const key = `photo:${state.selected.id}:${file.name}:${file.size}:${file.lastModified}`;
    const result = await mutateBinary(key, `/api/products/${encodeURIComponent(state.selected.id)}/photo`, "PUT", file);
    if (result?.product) updateProductState(result.product);
    els.photoInput.value = "";
    showMessage(els.pageMessage, "Product photo saved.", "success");
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") showMessage(els.pageMessage, error.message, "error");
  }
}

async function removePhoto() {
  if (!state.selected) return;
  const key = `remove-photo:${state.selected.id}`;
  try {
    const result = await mutateBinary(key, `/api/products/${encodeURIComponent(state.selected.id)}/photo`, "DELETE");
    if (result?.product) updateProductState(result.product);
    els.photoInput.value = "";
    showMessage(els.pageMessage, "Product photo removed.", "success");
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") showMessage(els.pageMessage, error.message, "error");
  }
}

async function login(event) {
  event.preventDefault();
  showMessage(els.loginMessage, "Signing in…");
  try {
    const response = await fetch("/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: els.password.value })
    });
    const payload = await responsePayload(response);
    els.password.value = "";
    if (!response.ok) throw new Error(friendlyError(payload, "Sign in failed."));
    if (!await loadSession()) throw new Error("The dashboard session could not be started.");
    showDashboard();
    await loadProducts();
  } catch (error) {
    showMessage(els.loginMessage, error.message || "Sign in failed.", "error");
  }
}

async function logout() {
  if (!state.csrf) return showLogin();
  try {
    await fetch("/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": state.csrf }
    });
  } finally {
    showLogin();
  }
}

els.loginForm.addEventListener("submit", login);
els.logoutButton.addEventListener("click", logout);
els.addProductButton.addEventListener("click", () => openEditor());
els.refreshButton.addEventListener("click", () => loadProducts());
els.loadMoreButton.addEventListener("click", () => loadProducts({ append: true }));
els.closeEditorButton.addEventListener("click", closeEditor);
els.cancelProductButton.addEventListener("click", closeEditor);
els.productForm.addEventListener("submit", saveProduct);
els.showProductButton.addEventListener("click", () => changeVisibility(true));
els.hideProductButton.addEventListener("click", () => changeVisibility(false));
els.addStockButton.addEventListener("click", () => adjustStock("ADD"));
els.removeStockButton.addEventListener("click", () => adjustStock("REMOVE"));
els.addPhotoButton.addEventListener("click", uploadPhoto);
els.replacePhotoButton.addEventListener("click", uploadPhoto);
els.removePhotoButton.addEventListener("click", removePhoto);
els.clearWarningButton.addEventListener("click", () => { els.readinessWarning.hidden = true; });
els.searchInput.addEventListener("input", () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => loadProducts(), 300);
});

(async function boot() {
  try {
    if (await loadSession()) {
      showDashboard();
      await loadProducts();
    } else {
      showLogin();
    }
  } catch {
    showLogin("The dashboard is temporarily unavailable.");
  }
})();
