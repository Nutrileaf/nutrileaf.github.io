import { getOrderStatus } from "./order-status.js";

const API_BASE = "https://nutrileaf-api.adam-d-may-20.workers.dev";
const ORDER_ID = new URLSearchParams(location.search).get("order_id") || "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const form = document.querySelector("#orderStatusForm");
const result = document.querySelector("#orderStatusResult");

function render(message, kind = "") {
  result.textContent = message;
  result.className = `order-status-result ${kind}`.trim();
}

if (!UUID.test(ORDER_ID)) {
  form.hidden = true;
  render("We could not identify this order. Return to the store to start a new checkout.", "error");
} else {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(new FormData(form).get("email") || "").trim();
    if (!email) return render("Enter the email used at checkout.", "error");
    const button = form.querySelector("button");
    button.disabled = true;
    render("Checking the authoritative order record…");
    const status = await getOrderStatus({ apiBase: API_BASE, orderId: ORDER_ID, email });
    button.disabled = false;
    if (status.action === "status") {
      const order = status.payload.order;
      render(`${order.number}: ${order.message}`, "success");
    } else if (status.action === "not-found") {
      render("We could not find a matching order. Check the checkout email and try again.", "error");
    } else if (status.action === "invalid") {
      render("Enter a valid checkout email and try again.", "error");
    } else {
      render("The status service is temporarily unavailable. Please try again.", "error");
    }
  });
}
