// P23 storefront compatibility helpers.

const P23_IMAGE_PATH = /^\/images\/products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;
const SAFE_RELATIVE_IMAGE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;
const URL_SCHEME_PREFIX = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export function normalizeProductAvailability(product) {
  if (!product || typeof product !== "object" || !Object.prototype.hasOwnProperty.call(product, "availability")) return "IN_STOCK";
  if (product.availability === "IN_STOCK" || product.availability === "SOLD_OUT") return product.availability;
  return "UNAVAILABLE";
}

export function isProductPurchasable(product) {
  return normalizeProductAvailability(product) === "IN_STOCK";
}

export function resolveProductImage(product, apiBase) {
  const image = typeof product?.image === "string" ? product.image.trim() : "";
  if (!image) return null;
  if (P23_IMAGE_PATH.test(image)) {
    try {
      const base = new URL(apiBase);
      return base.protocol === "https:" && base.pathname === "/" && !base.search && !base.hash
        ? `${base.origin}${image}`
        : null;
    } catch {
      return null;
    }
  }
  if (/^https:\/\//i.test(image)) {
    try {
      const url = new URL(image);
      return url.protocol === "https:" ? image : null;
    } catch {
      return null;
    }
  }
  if (URL_SCHEME_PREFIX.test(image)) return null;
  return SAFE_RELATIVE_IMAGE.test(image) ? image : null;
}

export function reconcileUnavailableCartItems(cart, productIds) {
  if (!Array.isArray(cart) || !Array.isArray(productIds)) return cart;
  const unavailable = new Set(productIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim()));
  if (unavailable.size === 0) return cart;
  return cart.filter(item => !unavailable.has(String(item?.product_id || "")));
}
