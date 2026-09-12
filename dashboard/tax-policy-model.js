export const TAX_POLICY_PRODUCT_TYPES = Object.freeze([
  "Soap", "Facial Care", "Body Care", "Hair Care", "Serum", "Lotion", "Tea", "Plant"
]);

const PRODUCT_TYPES = new Set(TAX_POLICY_PRODUCT_TYPES);
const TAX_CODE_PATTERN = /^txcd_[A-Za-z0-9]+$/;

export function policyDisplay(policy) {
  if (!policy || !PRODUCT_TYPES.has(policy.product_type)) throw new Error("INVALID_PRODUCT_TYPE");
  const approved = policy.review_status === "APPROVED" &&
    typeof policy.stripe_tax_code === "string" && TAX_CODE_PATTERN.test(policy.stripe_tax_code) &&
    Number.isSafeInteger(policy.reviewed_at) && policy.reviewed_at > 0;
  return {
    product_type: policy.product_type,
    stripe_tax_code: policy.stripe_tax_code ?? null,
    status: approved ? "Approved" : "Needs review",
    ready: approved,
    reviewed_at: policy.reviewed_at == null ? null : Number(policy.reviewed_at)
  };
}

export function policyApprovalBody(taxCode) {
  if (typeof taxCode !== "string" || !TAX_CODE_PATTERN.test(taxCode.trim())) throw new Error("INVALID_TAX_CODE");
  return { review_status: "APPROVED", stripe_tax_code: taxCode.trim() };
}

export function policyEndpoint(productType) {
  if (!PRODUCT_TYPES.has(productType)) throw new Error("INVALID_PRODUCT_TYPE");
  return `/api/product-type-tax-policies/${encodeURIComponent(productType)}`;
}
