import {
  buildIncidentQuery, incidentActions, incidentReasonLabel, incidentStateLabel,
  incidentTypeLabel, normalizeIncident
} from './incidents-model.js';

const $ = selector => document.querySelector(selector);
const region = $('#operationsIncidents');
const list = $('#incidentsList');
const message = $('#incidentsMessage');
let cursor = null;

const ACTION_LABELS = Object.freeze({
  acknowledge: 'Acknowledge',
  recover: 'Start recovery',
  resolve: 'Resolve'
});

function say(text, kind = '') {
  message.textContent = text || '';
  message.className = `message${kind ? ` ${kind}` : ''}`;
  message.hidden = !text;
}

function formatTime(seconds) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(seconds * 1000));
}

async function sessionCsrf() {
  const response = await fetch('/api/session', { credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.authenticated !== true || typeof body.csrf_token !== 'string') {
    throw new Error('SESSION_EXPIRED');
  }
  return body.csrf_token;
}

async function mutate(incident, action) {
  say(`${ACTION_LABELS[action]}…`);
  try {
    const csrf = await sessionCsrf();
    const response = await fetch(`/api/operations/incidents/${encodeURIComponent(incident.id)}/${action}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
        'X-Request-ID': crypto.randomUUID()
      },
      body: JSON.stringify({ expected_version: incident.version })
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
    if (response.status === 409) throw new Error('VERSION_CONFLICT');
    if (!response.ok || !body?.incident) throw new Error('UNAVAILABLE');
    normalizeIncident(body.incident);
    cursor = null;
    await load(false);
    say(`${ACTION_LABELS[action]} completed.`, 'success');
  } catch (error) {
    const text = error.message === 'SESSION_EXPIRED'
      ? 'Your session expired. Sign in again.'
      : error.message === 'VERSION_CONFLICT'
        ? 'This incident changed. Refresh and try again.'
        : 'That incident change could not be completed. Try again.';
    say(text, 'error');
  }
}

function card(input) {
  const incident = normalizeIncident(input);
  const article = document.createElement('article');
  article.className = 'incident-card';
  const heading = document.createElement('h4');
  heading.textContent = incidentTypeLabel(incident.incident_type);
  const state = document.createElement('span');
  state.className = `status-chip incident-${incident.state.toLowerCase()}`;
  state.textContent = incidentStateLabel(incident.state);
  const reason = document.createElement('p');
  reason.textContent = incidentReasonLabel(incident.reason_code);
  const facts = document.createElement('p');
  facts.className = 'muted incident-facts';
  facts.textContent = `${incident.affected_count} affected · Seen ${incident.occurrence_count} ${incident.occurrence_count === 1 ? 'time' : 'times'} · Last seen ${formatTime(incident.last_seen_at)}`;
  const header = document.createElement('div');
  header.className = 'incident-card-head';
  header.append(heading, state);
  article.append(header, reason, facts);
  const actions = incidentActions(incident.state);
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'action-row incident-actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `pill small ${action === 'resolve' ? 'success' : action === 'recover' ? 'warning' : 'quiet'}`;
      button.textContent = ACTION_LABELS[action];
      button.addEventListener('click', () => mutate(incident, action));
      row.append(button);
    }
    article.append(row);
  }
  return article;
}

async function load(append = false) {
  region.hidden = false;
  say('Checking operational incidents…');
  try {
    const query = buildIncidentQuery({
      state: $('#incidentStateFilter').value,
      incident_type: $('#incidentTypeFilter').value,
      limit: 25,
      cursor: append ? cursor || '' : ''
    });
    const response = await fetch(`/api/operations/incidents?${query}`, { credentials: 'same-origin' });
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    if (!response.ok || !Array.isArray(body?.incidents) ||
        (body.next_cursor !== null && typeof body.next_cursor !== 'string')) throw new Error('UNAVAILABLE');
    const cards = body.incidents.map(card);
    if (append) list.append(...cards); else list.replaceChildren(...cards);
    cursor = body.next_cursor;
    $('#incidentsMore').hidden = !cursor;
    say(list.childElementCount ? '' : 'No incidents match these filters.');
  } catch (error) {
    say(error.message === 'SESSION_EXPIRED'
      ? 'Your session expired. Sign in again.'
      : 'Operational incidents are temporarily unavailable.', 'error');
  }
}

$('#ordersTab').addEventListener('click', () => { cursor = null; load(false); });
$('#ordersRefresh').addEventListener('click', () => { cursor = null; load(false); });
$('#incidentsRefresh').addEventListener('click', () => { cursor = null; load(false); });
$('#incidentsMore').addEventListener('click', () => load(true));
for (const id of ['incidentStateFilter', 'incidentTypeFilter']) {
  $(`#${id}`).addEventListener('change', () => { cursor = null; load(false); });
}
