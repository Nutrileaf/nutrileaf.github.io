// Source-owned release inputs. Public commerce remains unavailable until a
// separately reviewed ingress and a specific product scope are accepted.
export const COMMERCE_CONFIG = Object.freeze({
  enabled: false,
  environment: "production",
  apiBase: null,
  scope: Object.freeze({ productId: null, quantity: 1 })
});

const TEST_ORIGIN = "https://nutrileaf-api.adam-d-may-20.workers.dev";
const CATALOG_ORIGIN = "https://nutrileaf-catalog-prod.adam-d-may-20.workers.dev";
export const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function commerceApiBase(config = COMMERCE_CONFIG) {
  if (config?.enabled !== true || !["test", "production"].includes(config.environment) ||
      typeof config.scope?.productId !== "string" || !config.scope.productId.trim() || config.scope.quantity !== 1) return null;
  try {
    const url = new URL(config.apiBase);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash || url.origin === CATALOG_ORIGIN ||
        (config.environment === "production" && url.origin === TEST_ORIGIN)) return null;
    return url.origin;
  } catch { return null; }
}

export function isSupportedCheckoutCart(items, config = COMMERCE_CONFIG) {
  return Boolean(commerceApiBase(config) && Array.isArray(items) && items.length === 1 &&
    items[0]?.product_id === config.scope.productId && items[0]?.quantity === 1);
}

export function checkoutStorageKey(name, config = COMMERCE_CONFIG) {
  const apiBase = commerceApiBase(config);
  return apiBase ? `nutrileaf:${config.environment}:${encodeURIComponent(apiBase)}:${encodeURIComponent(config.scope.productId)}:${name}` : null;
}
