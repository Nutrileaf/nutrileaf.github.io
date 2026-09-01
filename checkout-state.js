function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCatalog(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(product =>
    typeof product?.id === "string" && product.id.trim() &&
    (product.active === 1 || product.active === true)
  );
}

export function normalizeCart(cart) {
  if (!Array.isArray(cart)) return [];
  const quantities = new Map();
  for (const item of cart) {
    const productId = cleanText(item?.product_id);
    const quantity = item?.quantity;
    if (!productId || !Number.isInteger(quantity) || quantity < 1) continue;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
}

export function createCheckoutRequest({ cart, customer }) {
  const address = customer?.shipping_address || {};
  return {
    customer: {
      email: cleanText(customer?.email).toLowerCase(),
      first_name: cleanText(customer?.first_name),
      last_name: cleanText(customer?.last_name),
      phone: cleanText(customer?.phone) || null,
      shipping_address: {
        name: cleanText(address.name),
        address_line1: cleanText(address.address_line1),
        address_line2: cleanText(address.address_line2) || null,
        city: cleanText(address.city),
        state: cleanText(address.state),
        postal_code: cleanText(address.postal_code),
        country: cleanText(address.country).toUpperCase()
      }
    },
    items: normalizeCart(cart)
  };
}

export function checkoutFingerprint(request) {
  return JSON.stringify(request);
}

export function validateCheckoutRequest(request) {
  const errors = {};
  const customer = request?.customer || {};
  const address = customer.shipping_address || {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || "")) errors.email = "Enter a valid email address.";
  if (!customer.first_name) errors.first_name = "Enter a first name.";
  if (!customer.last_name) errors.last_name = "Enter a last name.";
  if (!address.name) errors.name = "Enter the recipient name.";
  if (!address.address_line1) errors.address_line1 = "Enter a street address.";
  if (!address.city) errors.city = "Enter a city.";
  if (!/^[A-Z]{2}$/.test(address.state || "")) errors.state = "Enter a two-letter state code.";
  if (!/^\d{5}(?:-\d{4})?$/.test(address.postal_code || "")) errors.postal_code = "Enter a valid US ZIP code.";
  if (address.country !== "US") errors.country = "Shipping country must be US.";
  if (!Array.isArray(request?.items) || request.items.length === 0) errors.items = "Add at least one available product to your cart.";
  return errors;
}

export function checkoutKeyFor(fingerprint, stored) {
  if (stored?.fingerprint === fingerprint && typeof stored.key === "string" && stored.key) return stored.key;
  return `checkout-${crypto.randomUUID()}`;
}

export function checkoutResultAction(status) {
  if (status === 201) return "confirm";
  if (status === 400) return "inline-error";
  if (status === 404) return "refresh-catalog";
  if (status === 409) return "restart-attempt";
  return "retry";
}
