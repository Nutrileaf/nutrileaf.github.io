import {
  SHIPPING_SERVICE_DEFINITIONS,
  createShippingMutationTracker,
  normalizeShippingPolicies,
  normalizeShippingPolicy,
  shippingPolicyDraft,
  shippingPolicyIsDirty,
  shippingServicesStatus
} from './shipping-management-model.js';

const $ = selector => document.querySelector(selector);
const panel = $('#shippingServicesPanel');
const list = $('#shippingServicesList');
const message = $('#shippingServicesMessage');
const warning = $('#shippingServicesWarning');
const tracker = createShippingMutationTracker();
const state = { policies: [], desired: new Map(), busy: new Set(), loaded: false };

function say(text, kind = '') {
  message.textContent = text || '';
  message.className = `message${kind ? ` ${kind}` : ''}`;
  message.hidden = !text;
}

function definitionFor(serviceKey) {
  return SHIPPING_SERVICE_DEFINITIONS.find((entry) => entry.service_key === serviceKey);
}

function desiredActive(policy) {
  return state.desired.has(policy.service_key) ? state.desired.get(policy.service_key) : policy.active;
}

function hasDirtyPolicies() {
  return state.policies.some((policy) => shippingPolicyIsDirty(policy, desiredActive(policy)));
}

function updateSummary() {
  if (!state.loaded) {
    warning.hidden = true;
    return;
  }
  const summary = shippingServicesStatus(state.policies);
  warning.hidden = summary.enabled_count !== 0;
}

function formatUpdated(value) {
  if (!Number.isSafeInteger(value) || value < 0) return 'Never changed';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value));
}

function serviceCard(policy) {
  const definition = definitionFor(policy.service_key);
  const active = desiredActive(policy);
  const dirty = shippingPolicyIsDirty(policy, active);
  const busy = state.busy.has(policy.service_key);
  const article = document.createElement('article');
  article.className = 'shipping-service-card';
  article.dataset.serviceKey = policy.service_key;

  const heading = document.createElement('div');
  heading.className = 'shipping-service-card-heading';
  const title = document.createElement('h3');
  title.textContent = definition.display_name;
  const category = document.createElement('span');
  category.className = 'status-chip';
  category.textContent = definition.category === 'ECONOMY' ? 'Economy' : 'Standard';
  heading.append(title, category);

  const details = document.createElement('p');
  details.className = 'muted';
  details.textContent = `${definition.carrier} · ${definition.provider_service} · Policy revision ${policy.policy_revision} · ${formatUpdated(policy.updated_at)}`;

  const controls = document.createElement('div');
  controls.className = 'shipping-service-controls';
  const label = document.createElement('label');
  label.className = 'shipping-service-toggle';
  label.htmlFor = `service-enabled-${policy.service_key}`;
  const checkbox = document.createElement('input');
  checkbox.id = `service-enabled-${policy.service_key}`;
  checkbox.type = 'checkbox';
  checkbox.checked = active;
  checkbox.disabled = busy;
  const labelText = document.createElement('span');
  labelText.textContent = active ? 'Enabled' : 'Disabled';
  label.append(checkbox, labelText);

  const dirtyState = document.createElement('span');
  dirtyState.className = 'shipping-service-dirty';
  dirtyState.textContent = busy ? 'Saving…' : dirty ? 'Unsaved change' : 'Saved';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'pill primary small';
  save.textContent = 'Save service policy';
  save.disabled = !dirty || busy;

  checkbox.addEventListener('change', () => {
    state.desired.set(policy.service_key, checkbox.checked);
    render();
  });
  save.addEventListener('click', () => savePolicy(policy));
  controls.append(label, dirtyState, save);
  article.append(heading, details, controls);
  return article;
}

function render() {
  list.replaceChildren(...state.policies.map(serviceCard));
  updateSummary();
}

async function sessionCsrf() {
  const response = await fetch('/api/session', { credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.authenticated !== true || typeof body.csrf_token !== 'string') {
    throw new Error('SESSION_EXPIRED');
  }
  return body.csrf_token;
}

async function load({ preservedDesired = new Map() } = {}) {
  say('Loading shipping services…');
  try {
    const response = await fetch('/api/shipping-services', { credentials: 'same-origin' });
    const body = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
    if (!response.ok) throw new Error('UNAVAILABLE');
    state.policies = normalizeShippingPolicies(body);
    state.loaded = true;
    state.desired.clear();
    for (const policy of state.policies) {
      state.desired.set(policy.service_key,
        preservedDesired.has(policy.service_key) ? preservedDesired.get(policy.service_key) : policy.active);
    }
    render();
    say('');
    return true;
  } catch (error) {
    state.policies = [];
    state.loaded = false;
    state.desired.clear();
    list.replaceChildren();
    warning.hidden = true;
    say(error.message === 'SESSION_EXPIRED'
      ? 'Your session expired. Sign in again.'
      : 'Shipping services are temporarily unavailable.', 'error');
    return false;
  }
}

async function savePolicy(policy) {
  const active = desiredActive(policy);
  const draft = shippingPolicyDraft(policy, active);
  const key = `shipping-policy:${policy.service_key}:${JSON.stringify(draft)}`;
  const clientMutationId = tracker.idFor(key);
  state.busy.add(policy.service_key);
  render();
  say(`Saving ${definitionFor(policy.service_key).display_name}…`);
  try {
    const csrf = await sessionCsrf();
    let response;
    try {
      response = await fetch(`/api/shipping-services/${encodeURIComponent(policy.service_key)}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ client_mutation_id: clientMutationId, ...draft })
      });
    } catch {
      tracker.settle(key, 'AMBIGUOUS');
      throw new Error('AMBIGUOUS');
    }
    const body = await response.json().catch(() => null);
    const ambiguous = response.status >= 500 || body?.error?.code === 'SHIPPING_OPERATION_IN_PROGRESS';
    tracker.settle(key, ambiguous ? 'AMBIGUOUS' : 'DEFINITE');
    if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
    if (body?.error?.code === 'SHIPPING_POLICY_CONFLICT') throw new Error('SHIPPING_POLICY_CONFLICT');
    if (!response.ok) throw new Error(ambiguous ? 'AMBIGUOUS' : 'UNAVAILABLE');
    const saved = normalizeShippingPolicy(body);
    state.policies = state.policies.map((entry) => entry.service_key === saved.service_key ? saved : entry);
    state.desired.set(saved.service_key, saved.active);
    say(`${definitionFor(saved.service_key).display_name} policy saved.`, 'success');
  } catch (error) {
    if (error.message === 'SHIPPING_POLICY_CONFLICT') {
      const preserved = new Map([...state.desired].filter(([serviceKey]) => serviceKey !== policy.service_key));
      const refreshed = await load({ preservedDesired: preserved });
      say(refreshed
        ? 'That policy changed in another session. The latest revision is shown; review it before saving again.'
        : 'That policy changed, but the latest revision could not be loaded. Refresh before making another change.', 'error');
    } else {
      const text = error.message === 'SESSION_EXPIRED'
        ? 'Your session expired. Sign in again.'
        : error.message === 'AMBIGUOUS'
          ? 'The policy outcome is unknown. Retry the same change before editing it.'
          : 'That shipping service policy could not be saved.';
      say(text, 'error');
    }
  } finally {
    state.busy.delete(policy.service_key);
    render();
  }
}

$('#shippingServicesTab').addEventListener('click', () => {
  panel.hidden = false;
  $('#productsWorkspace').hidden = true;
  $('#ordersPanel').hidden = true;
  load();
});
$('#productsTab').addEventListener('click', () => { panel.hidden = true; });
$('#ordersTab').addEventListener('click', () => { panel.hidden = true; });
$('#shippingServicesRefresh').addEventListener('click', () => {
  if (hasDirtyPolicies() && !confirm('Discard unsaved shipping service changes and refresh?')) return;
  load();
});
