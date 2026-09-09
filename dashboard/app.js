import {
  P24_PRODUCT_TYPES,
  buildMutationHeaders,
  buildProductListQuery,
  createMutationRequestId,
  hasUnsavedProductChanges,
  operatorWarning,
  priceInputFromCents,
  productDraft,
  productStatusLabel,
  readinessGuidance,
  requiresStockRemovalConfirmation,
  startingStockFromInput
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
  productTypeFilter: document.querySelector("#productTypeFilter"),
  visibilityFilter: document.querySelector("#visibilityFilter"),
  stockStatusFilter: document.querySelector("#stockStatusFilter"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  pageMessage: document.querySelector("#pageMessage"),
  counts: document.querySelector("#counts"),
  productList: document.querySelector("#productList"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  emptyProductsTemplate: document.querySelector("#emptyProductsTemplate"),
  editor: document.querySelector("#editor"),
  editorMode: document.querySelector("#editorMode"),
  editorTitle: document.querySelector("#editorTitle"),
  skuLine: document.querySelector("#skuLine"),
  unsavedIndicator: document.querySelector("#unsavedIndicator"),
  editorStatus: document.querySelector("#editorStatus"),
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
  newProductExtras: document.querySelector("#newProductExtras"),
  startingStock: document.querySelector("#startingStock"),
  startingPhoto: document.querySelector("#startingPhoto"),
  startingPhotoPreview: document.querySelector("#startingPhotoPreview"),
  stockSection: document.querySelector("#stockSection"),
  stockValue: document.querySelector("#stockValue"),
  stockQuantity: document.querySelector("#stockQuantity"),
  addStockButton: document.querySelector("#addStockButton"),
  removeStockButton: document.querySelector("#removeStockButton"),
  photoSection: document.querySelector("#photoSection"),
  photoPreview: document.querySelector("#photoPreview"),
  photoInput: document.querySelector("#photoInput"),
  photoSelectionStatus: document.querySelector("#photoSelectionStatus"),
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
  searchTimer: null,
  editorBaseline: null,
  editPhotoPreviewUrl: null,
  startingPhotoPreviewUrl: null
};

for (const type of P24_PRODUCT_TYPES) {
  const editorOption = document.createElement("option");
  editorOption.value = type;
  editorOption.textContent = type;
  els.productType.append(editorOption);

  const filterOption = document.createElement("option");
  filterOption.value = type;
  filterOption.textContent = type;
  els.productTypeFilter.append(filterOption);
}

function showMessage(element, text, kind = "") {
  element.textContent = text || "";
  element.className = `message${kind ? ` ${kind}` : ""}`;
  element.hidden = !text;
}

function showEditorMessage(text, kind = "") {
  showMessage(els.editorStatus, text, kind);
}

function friendlyError(payload, fallback = "That change could not be completed.") {
  const code = payload?.error?.code;
  const messages = {
    STOCK_CONFLICT: "There is not enough stock for that change. Refresh and try again.",
    PRODUCT_NOT_FOUND: "That product could not be found. Refresh the product list.",
    INVALID_PRICE: "Enter a valid product price.",
    INVALID_PRODUCT_TYPE: "Choose one of the available Product Types.",
    INVALID_PRODUCT: "Check the product details and try again.",
    INVALID_QUERY: "One of the product filters is not valid. Clear the filters and try again.",
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

function revokeObjectUrl(key) {
  if (state[key]) {
    URL.revokeObjectURL(state[key]);
    state[key] = null;
  }
}

function clearPhotoPreviews() {
  revokeObjectUrl("editPhotoPreviewUrl");
  revokeObjectUrl("startingPhotoPreviewUrl");
}

function showLogin(message = "") {
  state.csrf = null;
  state.products = [];
  state.selected = null;
  state.editorBaseline = null;
  state.retryIds.clear();
  clearPhotoPreviews();
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

function currentFilterState(append = false) {
  return {
    search: els.searchInput.value,
    product_type: els.productTypeFilter.value,
    visibility: els.visibilityFilter.value,
    stock_status: els.stockStatusFilter.value,
    limit: 24,
    ...(append && state.nextCursor ? { cursor: state.nextCursor } : {})
  };
}

async function loadProducts({ append = false } = {}) {
  showMessage(els.pageMessage, "Loading products…");
  try {
    const params = buildProductListQuery(currentFilterState(append));
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
  const warning = product ? readinessGuidance(product) : null;
  els.readinessWarning.hidden = !warning;
  els.readinessText.textContent = warning || "";
}

function editorValues() {
  return {
    name: els.productName.value,
    product_type: els.productType.value,
    description: els.productDescription.value,
    price: els.productPrice.value
  };
}

function editorIsDirty() {
  return !els.editor.hidden && state.editorBaseline && hasUnsavedProductChanges(state.editorBaseline, editorValues());
}

function updateUnsavedIndicator() {
  const dirty = Boolean(editorIsDirty());
  els.unsavedIndicator.hidden = !dirty;
  return dirty;
}

function setEditorBaseline() {
  state.editorBaseline = editorValues();
  updateUnsavedIndicator();
}

function validatePhotoFile(file) {
  if (!file) throw new Error("Choose a photo first.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPEG, PNG, or WebP photo.");
  if (file.size > 2 * 1024 * 1024) throw new Error("That photo is larger than 2 MB.");
  return file;
}

function showFilePreview(file, image, stateKey) {
  revokeObjectUrl(stateKey);
  if (!file) {
    image.removeAttribute("src");
    image.hidden = true;
    return;
  }
  validatePhotoFile(file);
  const previewUrl = URL.createObjectURL(file);
  state[stateKey] = previewUrl;
  image.src = previewUrl;
  image.hidden = false;
}

function populateEditor(product) {
  clearPhotoPreviews();
  const editing = Boolean(product);
  els.editorMode.textContent = editing ? "PRODUCT DETAILS" : "NEW PRODUCT";
  els.editorTitle.textContent = editing ? "Edit Product" : "Add Product";
  els.skuLine.textContent = editing ? `SKU: ${product.sku || "Unavailable"}` : "SKU will be created automatically when this product is saved.";
  els.productName.value = product?.name ?? "";
  els.productType.value = product?.product_type ?? P24_PRODUCT_TYPES[0];
  els.productDescription.value = product?.description ?? "";
  els.productPrice.value = priceInputFromCents(product?.price_cents ?? null);
  els.visibilityState.textContent = editing ? productStatusLabel(product) : "Hidden when created";
  els.newProductExtras.hidden = editing;
  els.stockSection.hidden = !editing;
  els.photoSection.hidden = !editing;
  els.showProductButton.disabled = !editing;
  els.hideProductButton.disabled = !editing;
  els.stockValue.textContent = editing ? String(product.available_stock ?? 0) : "0";
  els.startingStock.value = "0";
  els.startingPhoto.value = "";
  els.startingPhotoPreview.removeAttribute("src");
  els.startingPhotoPreview.hidden = true;
  els.photoInput.value = "";
  els.photoSelectionStatus.textContent = "";
  setEditorWarning(product);
  showEditorMessage("");
  if (editing && product.photo) {
    els.photoPreview.src = `/media/products/${encodeURIComponent(product.id)}`;
    els.photoPreview.alt = `${product.name} current product photo`;
    els.photoPreview.hidden = false;
  } else {
    els.photoPreview.removeAttribute("src");
    els.photoPreview.hidden = true;
  }
  els.addPhotoButton.hidden = Boolean(editing && product?.photo);
  els.replacePhotoButton.hidden = Boolean(editing && !product?.photo);
  els.removePhotoButton.disabled = !editing || !product?.photo;
  setEditorBaseline();
}

function confirmDiscardChanges() {
  if (!editorIsDirty()) return true;
  return confirm("Cancel and discard unsaved product changes?");
}

function openEditor(product = null) {
  const switchingProducts = !els.editor.hidden && (state.selected?.id ?? null) !== (product?.id ?? null);
  if (switchingProducts && !confirmDiscardChanges()) return;
  state.selected = product;
  populateEditor(product);
  els.editor.hidden = false;
  updateUnsavedIndicator();
  els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  els.productName.focus();
}

function closeEditor({ force = false } = {}) {
  if (!force && !confirmDiscardChanges()) return;
  state.selected = null;
  state.editorBaseline = null;
  clearPhotoPreviews();
  els.editor.hidden = true;
  els.productForm.reset();
  els.photoInput.value = "";
  els.startingPhoto.value = "";
  els.unsavedIndicator.hidden = true;
  showEditorMessage("");
  setEditorWarning(null);
}

async function applyNewProductExtras(product, startingStock, startingPhoto) {
  let current = product;
  if (startingStock > 0) {
    const result = await mutateJson(
      `starting-stock:${current.id}:${startingStock}`,
      `/api/products/${encodeURIComponent(current.id)}/stock`,
      "POST",
      { operation: "ADD", quantity: startingStock }
    );
    if (result?.product) {
      current = result.product;
      updateProductState(current);
    }
  }
  if (startingPhoto) {
    const result = await mutateBinary(
      `starting-photo:${current.id}:${startingPhoto.name}:${startingPhoto.size}:${startingPhoto.lastModified}`,
      `/api/products/${encodeURIComponent(current.id)}/photo`,
      "PUT",
      startingPhoto
    );
    if (result?.product) {
      current = result.product;
      updateProductState(current);
    }
  }
  return current;
}

async function saveProduct(event) {
  event.preventDefault();
  const wasEditing = Boolean(state.selected);
  let createdProduct = null;
  try {
    const draft = productDraft({
      name: els.productName.value,
      product_type: els.productType.value,
      description: els.productDescription.value,
      price: els.productPrice.value,
      visible_in_store: state.selected?.visible_in_store === true
    });

    let startingStock = 0;
    let startingPhoto = null;
    if (!wasEditing) {
      draft.visible_in_store = false;
      startingStock = startingStockFromInput(els.startingStock.value);
      startingPhoto = els.startingPhoto.files?.[0] || null;
      if (startingPhoto) validatePhotoFile(startingPhoto);
    }

    const bodyFingerprint = JSON.stringify(draft);
    const key = wasEditing ? `edit:${state.selected.id}:${bodyFingerprint}` : `create:${bodyFingerprint}`;
    const path = wasEditing ? `/api/products/${encodeURIComponent(state.selected.id)}` : "/api/products";
    const method = wasEditing ? "PATCH" : "POST";
    const result = await mutateJson(key, path, method, draft);
    if (result?.product) {
      createdProduct = result.product;
      updateProductState(result.product);
    }

    if (wasEditing) {
      setEditorBaseline();
      showEditorMessage("Product details saved.", "success");
      showMessage(els.pageMessage, "Product saved.", "success");
      return;
    }

    if (!createdProduct) throw new Error("The product was created but its saved details could not be loaded.");
    showEditorMessage("Product created safely as Hidden. Finishing optional setup…");
    try {
      await applyNewProductExtras(createdProduct, startingStock, startingPhoto);
      showEditorMessage("Product created as Hidden. Starting stock and photo setup are complete.", "success");
      showMessage(els.pageMessage, "Product added as Hidden.", "success");
    } catch (optionalError) {
      showEditorMessage(`Product was created as Hidden, but an optional setup step could not be completed: ${optionalError.message}`, "error");
      showMessage(els.pageMessage, "Product created safely. Open it to finish the incomplete stock or photo step.", "error");
    }
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") {
      const message = createdProduct ? `Product was created as Hidden, but setup could not be completed: ${error.message}` : error.message;
      showEditorMessage(message, "error");
      showMessage(els.pageMessage, message, "error");
    }
  }
}

async function changeVisibility(visible) {
  if (!state.selected) return;
  const key = `visibility:${state.selected.id}:${visible}`;
  try {
    const result = await mutateJson(key, `/api/products/${encodeURIComponent(state.selected.id)}`, "PATCH", { visible_in_store: visible });
    if (result?.product) updateProductState(result.product);
    const actuallyVisible = result?.product?.visible_in_store === true;
    const message = actuallyVisible
      ? "Product is shown in the store."
      : visible
        ? "Product stayed Hidden because it is not ready for the store."
        : "Product is Hidden.";
    showMessage(els.pageMessage, message, actuallyVisible || !visible ? "success" : "");
    showEditorMessage(message, actuallyVisible || !visible ? "success" : "");
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") {
      showMessage(els.pageMessage, error.message, "error");
      showEditorMessage(error.message, "error");
    }
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
    const currentStock = Number(state.selected.available_stock ?? 0);
    if (operation === "REMOVE" && requiresStockRemovalConfirmation(currentStock, quantity)) {
      if (!confirm("Remove all remaining stock? This product will be Sold Out.")) return;
    }
    const body = { operation, quantity };
    const key = `stock:${state.selected.id}:${operation}:${quantity}`;
    const result = await mutateJson(key, `/api/products/${encodeURIComponent(state.selected.id)}/stock`, "POST", body);
    if (result?.product) updateProductState(result.product);
    const message = operation === "ADD" ? "Stock added." : "Stock removed.";
    showMessage(els.pageMessage, message, "success");
    showEditorMessage(message, "success");
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") {
      showMessage(els.pageMessage, error.message, "error");
      showEditorMessage(error.message, "error");
    }
  }
}

function selectedPhotoFile() {
  return validatePhotoFile(els.photoInput.files?.[0]);
}

function previewEditPhoto() {
  try {
    const file = els.photoInput.files?.[0];
    if (!file) {
      revokeObjectUrl("editPhotoPreviewUrl");
      populateEditor(state.selected);
      return;
    }
    showFilePreview(file, els.photoPreview, "editPhotoPreviewUrl");
    els.photoPreview.alt = "Selected product photo preview";
    els.photoSelectionStatus.textContent = "New photo selected. Use Add photo or Replace photo to save it.";
  } catch (error) {
    els.photoInput.value = "";
    els.photoSelectionStatus.textContent = error.message;
    if (state.selected?.photo) {
      els.photoPreview.src = `/media/products/${encodeURIComponent(state.selected.id)}`;
      els.photoPreview.hidden = false;
    } else {
      els.photoPreview.removeAttribute("src");
      els.photoPreview.hidden = true;
    }
  }
}

function previewStartingPhoto() {
  try {
    const file = els.startingPhoto.files?.[0];
    if (!file) {
      revokeObjectUrl("startingPhotoPreviewUrl");
      els.startingPhotoPreview.removeAttribute("src");
      els.startingPhotoPreview.hidden = true;
      return;
    }
    showFilePreview(file, els.startingPhotoPreview, "startingPhotoPreviewUrl");
  } catch (error) {
    els.startingPhoto.value = "";
    revokeObjectUrl("startingPhotoPreviewUrl");
    els.startingPhotoPreview.removeAttribute("src");
    els.startingPhotoPreview.hidden = true;
    showEditorMessage(error.message, "error");
  }
}

async function uploadPhoto() {
  if (!state.selected) return;
  try {
    const file = selectedPhotoFile();
    showEditorMessage("Saving product photo…");
    const key = `photo:${state.selected.id}:${file.name}:${file.size}:${file.lastModified}`;
    const result = await mutateBinary(key, `/api/products/${encodeURIComponent(state.selected.id)}/photo`, "PUT", file);
    revokeObjectUrl("editPhotoPreviewUrl");
    if (result?.product) updateProductState(result.product);
    els.photoInput.value = "";
    els.photoSelectionStatus.textContent = "";
    showMessage(els.pageMessage, "Product photo saved.", "success");
    showEditorMessage("Product photo saved.", "success");
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") {
      showMessage(els.pageMessage, error.message, "error");
      showEditorMessage(error.message, "error");
    }
  }
}

async function removePhoto() {
  if (!state.selected || !state.selected.photo) return;
  if (!confirm("Remove this product photo?")) return;
  const key = `remove-photo:${state.selected.id}`;
  try {
    const result = await mutateBinary(key, `/api/products/${encodeURIComponent(state.selected.id)}/photo`, "DELETE");
    revokeObjectUrl("editPhotoPreviewUrl");
    if (result?.product) updateProductState(result.product);
    els.photoInput.value = "";
    els.photoSelectionStatus.textContent = "";
    showMessage(els.pageMessage, "Product photo removed.", "success");
    showEditorMessage("Product photo removed.", "success");
  } catch (error) {
    if (error.message !== "SESSION_EXPIRED") {
      showMessage(els.pageMessage, error.message, "error");
      showEditorMessage(error.message, "error");
    }
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
  if (!confirmDiscardChanges()) return;
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

function scheduleProductReload() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => loadProducts(), 300);
}

function clearFilters() {
  els.productTypeFilter.value = "";
  els.visibilityFilter.value = "";
  els.stockStatusFilter.value = "";
  loadProducts();
}

els.loginForm.addEventListener("submit", login);
els.logoutButton.addEventListener("click", logout);
els.addProductButton.addEventListener("click", () => openEditor());
els.refreshButton.addEventListener("click", () => loadProducts());
els.loadMoreButton.addEventListener("click", () => loadProducts({ append: true }));
els.closeEditorButton.addEventListener("click", () => closeEditor());
els.cancelProductButton.addEventListener("click", () => closeEditor());
els.productForm.addEventListener("submit", saveProduct);
els.showProductButton.addEventListener("click", () => changeVisibility(true));
els.hideProductButton.addEventListener("click", () => changeVisibility(false));
els.addStockButton.addEventListener("click", () => adjustStock("ADD"));
els.removeStockButton.addEventListener("click", () => adjustStock("REMOVE"));
els.addPhotoButton.addEventListener("click", uploadPhoto);
els.replacePhotoButton.addEventListener("click", uploadPhoto);
els.removePhotoButton.addEventListener("click", removePhoto);
els.photoInput.addEventListener("change", previewEditPhoto);
els.startingPhoto.addEventListener("change", previewStartingPhoto);
els.clearWarningButton.addEventListener("click", () => { els.readinessWarning.hidden = true; });
els.searchInput.addEventListener("input", scheduleProductReload);
els.productTypeFilter.addEventListener("change", () => loadProducts());
els.visibilityFilter.addEventListener("change", () => loadProducts());
els.stockStatusFilter.addEventListener("change", () => loadProducts());
els.clearFiltersButton.addEventListener("click", clearFilters);
for (const input of [els.productName, els.productType, els.productDescription, els.productPrice]) {
  input.addEventListener("input", updateUnsavedIndicator);
  input.addEventListener("change", updateUnsavedIndicator);
}
window.addEventListener("beforeunload", (event) => {
  if (!editorIsDirty()) return;
  event.preventDefault();
  event.returnValue = "";
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
