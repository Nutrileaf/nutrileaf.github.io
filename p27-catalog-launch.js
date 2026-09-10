export const CATALOG_API_BASE = "https://nutrileaf-catalog-prod.adam-d-may-20.workers.dev";
export const LEGACY_TEST_API_BASE = "https://nutrileaf-api.adam-d-may-20.workers.dev";

const P23_IMAGE_PATH = /^\/images\/products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.href;
  if (input && typeof input.url === "string") return input.url;
  return String(input ?? "");
}

export function rewriteCatalogRequest(input, method = "GET") {
  const original = requestUrl(input);
  if (String(method || "GET").toUpperCase() !== "GET") return original;
  let url;
  try { url = new URL(original); } catch { return original; }
  if (url.origin !== LEGACY_TEST_API_BASE) return original;
  if (!(url.pathname === "/products" || /^\/products\/[^/]+$/.test(url.pathname))) return original;
  return `${CATALOG_API_BASE}${url.pathname}${url.search}`;
}

export function absolutizeCatalogPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.products)) return payload;
  return {
    ...payload,
    products: payload.products.map((product) => {
      if (!product || typeof product !== "object" || Array.isArray(product) || typeof product.image !== "string" || !P23_IMAGE_PATH.test(product.image)) return product;
      return { ...product, image: `${CATALOG_API_BASE}${product.image}` };
    })
  };
}

export async function catalogLaunchFetch(nativeFetch, input, init) {
  const method = init?.method || (input && typeof input === "object" && typeof input.method === "string" ? input.method : "GET");
  const original = requestUrl(input);
  const rewritten = rewriteCatalogRequest(input, method);
  const response = await nativeFetch(rewritten === original ? input : rewritten, init);
  if (rewritten === original || !response.ok) return response;
  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  let payload;
  try { payload = await response.clone().json(); } catch { return response; }
  return new Response(JSON.stringify(absolutizeCatalogPayload(payload)), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

function disablePurchaseControls(root) {
  if (!root?.querySelectorAll) return;
  for (const button of root.querySelectorAll("[data-add-product]")) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.removeAttribute("data-add-product");
    button.textContent = "Online ordering coming soon";
  }
}

export function installCatalogLaunch(win = window, doc = document) {
  const nativeFetch = win.fetch.bind(win);
  win.fetch = (input, init) => catalogLaunchFetch(nativeFetch, input, init);

  doc.addEventListener("click", (event) => {
    const target = event.target?.closest?.("[data-add-product], #detailAdd, #checkoutButton, #checkoutSubmit");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  disablePurchaseControls(doc);
  const Observer = win.MutationObserver || globalThis.MutationObserver;
  if (Observer) {
    const observer = new Observer(() => disablePurchaseControls(doc));
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    return observer;
  }
  return null;
}

if (typeof window !== "undefined" && typeof document !== "undefined") installCatalogLaunch(window, document);
