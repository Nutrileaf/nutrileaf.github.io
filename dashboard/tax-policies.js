import { policyApprovalBody, policyDisplay, policyEndpoint } from "./tax-policy-model.js";

const $ = selector => document.querySelector(selector);
const panel = $("#taxPoliciesPanel");
const list = $("#taxPoliciesList");
const message = $("#taxPoliciesMessage");
const recommendedCodes = Object.freeze({
  Soap: "txcd_32050006",
  "Facial Care": "txcd_32050013",
  "Body Care": "txcd_32050013",
  "Hair Care": "txcd_32050024",
  Serum: "txcd_32050013",
  Lotion: "txcd_32050013"
});

let csrf = null;
let retryIds = new Map();

function say(text, kind = "") {
  message.textContent = text || "";
  message.className = `message${kind ? ` ${kind}` : ""}`;
  message.hidden = !text;
}

async function json(response) {
  try { return await response.json(); } catch { return null; }
}

async function sessionToken() {
  const response = await fetch("/api/session", { method: "GET", credentials: "same-origin" });
  const body = await json(response);
  if (!response.ok || !body?.authenticated || typeof body.csrf_token !== "string") {
    throw new Error("SESSION_EXPIRED");
  }
  csrf = body.csrf_token;
  return csrf;
}

async function apiGet(path) {
  const response = await fetch(path, { method: "GET", credentials: "same-origin" });
  const body = await json(response);
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(body?.error?.message || "Tax policy request failed");
  return body;
}

function requestId(key) {
  if (!retryIds.has(key)) retryIds.set(key, crypto.randomUUID());
  return retryIds.get(key);
}

async function approvePolicy(productType, taxCode) {
  if (!csrf) await sessionToken();
  const key = `approve:${productType}:${taxCode}`;
  const response = await fetch(policyEndpoint(productType), {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      "X-Request-ID": requestId(key)
    },
    body: JSON.stringify(policyApprovalBody(taxCode))
  });
  const body = await json(response);
  if (response.status === 401 || response.status === 403) {
    csrf = null;
    throw new Error("SESSION_EXPIRED");
  }
  if (!response.ok) throw new Error(body?.error?.message || "Tax policy update failed");
  retryIds.delete(key);
  return body;
}

function reviewedLabel(value) {
  if (!Number.isSafeInteger(value) || value <= 0) return "Not reviewed";
  try { return new Date(value).toLocaleString(); } catch { return "Reviewed"; }
}

function policyCard(policy) {
  const display = policyDisplay(policy);
  const card = document.createElement("article");
  card.className = "product-card";

  const title = document.createElement("h3");
  title.textContent = display.product_type;

  const status = document.createElement("p");
  status.textContent = `${display.status} · ${display.ready ? "Ready for product visibility" : "Products remain fail-closed"}`;

  const current = document.createElement("p");
  current.className = "muted";
  current.textContent = `Current tax code: ${display.stripe_tax_code || "None"} · ${reviewedLabel(display.reviewed_at)}`;

  const label = document.createElement("label");
  label.textContent = "Stripe tax code";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 64;
  input.autocomplete = "off";
  input.value = display.stripe_tax_code || recommendedCodes[display.product_type] || "";
  input.placeholder = "txcd_...";
  label.append(input);

  const button = document.createElement("button");
  button.className = "pill primary";
  button.type = "button";
  button.textContent = display.ready ? "Update approval" : "Approve tax code";
  button.addEventListener("click", async () => {
    button.disabled = true;
    say(`Saving ${display.product_type}…`);
    try {
      await approvePolicy(display.product_type, input.value.trim());
      say(`${display.product_type} tax policy saved.`, "success");
      await loadPolicies();
    } catch (error) {
      say(error?.message === "SESSION_EXPIRED" ? "Your session expired. Sign in again." : error?.message || "Tax policy update failed.", "error");
    } finally {
      button.disabled = false;
    }
  });

  card.append(title, status, current, label, button);
  return card;
}

async function loadPolicies() {
  say("Loading Product Type tax policies…");
  try {
    const body = await apiGet("/api/product-type-tax-policies");
    const policies = Array.isArray(body?.policies) ? body.policies : [];
    list.replaceChildren(...policies.map(policyCard));
    say(policies.length ? "" : "No Product Type tax policies were returned.");
  } catch (error) {
    say(error?.message === "SESSION_EXPIRED" ? "Your session expired. Sign in again." : "Tax policies are temporarily unavailable.", "error");
  }
}

function showTaxReview() {
  $("#productsWorkspace").hidden = true;
  $("#ordersPanel").hidden = true;
  panel.hidden = false;
  loadPolicies();
}

$("#taxPoliciesTab").addEventListener("click", showTaxReview);
$("#productsTab").addEventListener("click", () => { panel.hidden = true; });
$("#ordersTab").addEventListener("click", () => { panel.hidden = true; });
$("#taxPoliciesRefresh").addEventListener("click", loadPolicies);
