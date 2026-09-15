import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildIncidentQuery,
  incidentActions,
  incidentReasonLabel,
  incidentStateLabel,
  incidentTypeLabel,
  normalizeIncident
} from '../dashboard/incidents-model.js';

const incident = {
  id: '22222222-2222-4222-8222-222222222222',
  incident_type: 'EXPIRED_INVENTORY_RESERVATION',
  reason_code: 'RESERVATION_EXPIRED',
  state: 'OPEN',
  affected_count: 3,
  occurrence_count: 2,
  version: 4,
  first_seen_at: 1_700_000_000,
  last_seen_at: 1_700_000_100,
  acknowledged_at: null,
  recovery_started_at: null,
  resolved_at: null,
  updated_at: 1_700_000_100
};

test('incident model builds only bounded approved list filters', () => {
  assert.equal(buildIncidentQuery({ state: 'OPEN', incident_type: 'FAILED_WEBHOOK', limit: 25 }),
    'state=OPEN&incident_type=FAILED_WEBHOOK&limit=25');
  assert.equal(buildIncidentQuery({ limit: 10, cursor: 'abc_DEF-123' }), 'limit=10&cursor=abc_DEF-123');
  for (const bad of [
    { state: 'UNKNOWN' },
    { incident_type: 'PAYMENT_ACTION' },
    { limit: 26 },
    { cursor: 'not valid!' }
  ]) assert.throws(() => buildIncidentQuery(bad), /incident filters/i);
});

test('incident model validates the redacted response shape', () => {
  assert.deepEqual(normalizeIncident(incident), incident);
  for (const bad of [
    { ...incident, customer_email: 'private@example.test' },
    { ...incident, state: 'UNKNOWN' },
    { ...incident, affected_count: -1 },
    { ...incident, reason_code: 'PAYMENT_SECRET' }
  ]) assert.throws(() => normalizeIncident(bad), /incident/i);
});

test('resolved incidents accept the backend zero affected-count contract', () => {
  const resolved = {
    ...incident,
    state: 'RESOLVED',
    affected_count: 0,
    version: 5,
    resolved_at: 1_700_000_200,
    updated_at: 1_700_000_200
  };
  assert.deepEqual(normalizeIncident(resolved), resolved);
});

test('incident labels and lifecycle actions stay plain-language and bounded', () => {
  assert.equal(incidentTypeLabel('EXPIRED_INVENTORY_RESERVATION'), 'Expired inventory reservation');
  assert.equal(incidentReasonLabel('RESERVATION_EXPIRED'), 'A stock reservation passed its expiry time');
  assert.equal(incidentStateLabel('ACKNOWLEDGED'), 'Acknowledged');
  assert.deepEqual(incidentActions('OPEN'), ['acknowledge', 'recover', 'resolve']);
  assert.deepEqual(incidentActions('ACKNOWLEDGED'), ['recover', 'resolve']);
  assert.deepEqual(incidentActions('RECOVERING'), ['resolve']);
  assert.deepEqual(incidentActions('RESOLVED'), []);
});

test('orders screen includes an accessible incident workspace with safe mutations', () => {
  const html = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../dashboard/incidents.js', import.meta.url), 'utf8');
  assert.match(html, /id="operationsIncidents"/);
  assert.match(html, /id="incidentsMessage"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /src="\.\/incidents\.js"/);
  assert.match(js, /\/api\/operations\/incidents/);
  assert.match(js, /X-CSRF-Token/);
  assert.match(js, /X-Request-ID/);
  assert.match(js, /expected_version/);
  assert.doesNotMatch(js, /Authorization|localStorage|sessionStorage/);
  assert.doesNotMatch(js, /\/(?:payments?|refunds?|shipping|labels?)(?:\/|\?)/i);
});
