import { getOrderStatus } from "./order-status.js";
import { trackPurchase } from "./analytics.js";
import { COMMERCE_CONFIG, commerceApiBase, ORDER_ID_PATTERN } from "./commerce-config.js";
import { clearCompletedCheckout } from "./checkout-state.js";

const ORDER_ID = new URLSearchParams(location.search).get("order_id") || "";
const form = document.querySelector("#orderStatusForm");
const result = document.querySelector("#orderStatusResult");

function render(message, kind = "") {
  result.textContent = message;
  result.className = `order-status-result ${kind}`.trim();
}

if (!commerceApiBase()) {
  form.hidden = true;
  render("Order status is currently unavailable. Please contact the store for help.", "error");
} else if (!ORDER_ID_PATTERN.test(ORDER_ID)) {
  form.hidden = true;
  render("We could not identify this order. Return to the store to start a new checkout.", "error");
} else {
  form.hidden = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(new FormData(form).get("email") || "").trim();
    if (!email) return render("Enter the email used at checkout.", "error");
    const button = form.querySelector("button");
    button.disabled = true;
    render("Checking the authoritative order record…");
    const status = await getOrderStatus({ config: COMMERCE_CONFIG, orderId: ORDER_ID, email });
    button.disabled = false;
    if (status.action === "status") {
      const order = status.payload.order;
      const shipping = order.shipping ? ` Shipping: ${order.shipping.carrier} ${order.shipping.service} — ${order.shipping.tracking_status.replaceAll("_", " ").toLowerCase()}.` : "";
      render(`${order.number} (${order.status.replaceAll("_", " ")}): ${order.message}${shipping}`, "success");
      try { clearCompletedCheckout({ storage: sessionStorage, cartStorage: localStorage, config: COMMERCE_CONFIG, orderId: ORDER_ID, statusResult: status }); } catch {}
      if (order.analytics) trackPurchase(order.analytics);
    } else if (status.action === "not-found") {
      render("We could not find a matching order. Check the checkout email and try again.", "error");
    } else if (status.action === "invalid") {
      render("Enter a valid checkout email and try again.", "error");
    } else {
      render("The status service is temporarily unavailable. Please try again.", "error");
    }
  });
}
