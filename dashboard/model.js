export const P24_PRODUCT_TYPES = Object.freeze([
  "Soap", "Facial Care", "Body Care", "Hair Care", "Serum", "Lotion", "Tea", "Plant"
]);

const PRODUCT_TYPE_SET = new Set(P24_PRODUCT_TYPES);
const MAX_PRICE_CENTS = 99_999_999;

export function priceCentsFromInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) throw new Error("Enter a valid price.");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_PRICE_CENTS) throw new Error("Enter a valid price.");
  return cents;
}

export function priceInputFromCents(value) {
  if (value == null) return "";
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PRICE_CENTS) return "";
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function productDraft(input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) throw new Error("Enter a product name.");
  const productType = typeof input?.product_type === "string" ? input.product_type.trim() : "";
  if (!PRODUCT_TYPE_SET.has(productType)) throw new Error("Choose a valid Product Type.");
  const descriptionText = typeof input?.description === "string" ? input.description.trim() : "";
  if (descriptionText.length > 2000) throw new Error("Description is too long.");
  const priceCents = priceCentsFromInput(input?.price ?? "");
  const visible = input?.visible_in_store === true;
  if (visible && priceCents === null) throw new Error("Enter a price before showing this product in the store.");
  return {
    name,
    product_type: productType,
    description: descriptionText || null,
    price_cents: priceCents,
    visible_in_store: visible
  };
}

export function productStatusLabel(product) {
  switch (product?.status) {
    case "IN_STOCK": return "In Stock";
    case "SOLD_OUT": return "Sold Out";
    case "HIDDEN": return "Hidden";
    default: return "Needs attention";
  }
}

export function operatorWarning(product) {
  if (product?.can_show_in_store === true) return null;
  const message = typeof product?.visibility_message === "string" ? product.visibility_message.trim() : "";
  if (/tax|classification|review/i.test(message)) {
    return "Tax classification pending — this product cannot be shown in the store yet.";
  }
  return message || "This product is not ready to be shown in the store yet.";
}

export function createMutationRequestId() {
  return crypto.randomUUID();
}

export function buildMutationHeaders(csrfToken, requestId, json = false) {
  if (typeof csrfToken !== "string" || !csrfToken) throw new Error("Your session has expired. Sign in again.");
  if (typeof requestId !== "string" || !requestId) throw new Error("Unable to identify this change.");
  return {
    "X-CSRF-Token": csrfToken,
    "X-Request-ID": requestId,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}
