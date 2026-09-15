const TYPES = Object.freeze({
  STUCK_ORDER: 'Stuck order',
  EXPIRED_INVENTORY_RESERVATION: 'Expired inventory reservation',
  FAILED_WEBHOOK: 'Failed webhook',
  REFUND_INCONSISTENCY: 'Refund inconsistency',
  SHIPPING_ANOMALY: 'Shipping anomaly',
  READINESS_REGRESSION: 'Readiness regression'
});

const REASONS = Object.freeze({
  ORDER_STALLED: 'An order has remained incomplete longer than expected',
  RESERVATION_EXPIRED: 'A stock reservation passed its expiry time',
  WEBHOOK_PROCESSING_FAILED: 'A webhook could not be processed',
  REFUND_STATE_CONFLICT: 'Refund records do not agree',
  SHIPPING_RECONCILIATION_REQUIRED: 'Shipping records require review',
  READINESS_ATTENTION_REQUIRED: 'Operational readiness needs attention'
});

const STATES = Object.freeze({
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  RECOVERING: 'Recovery in progress',
  RESOLVED: 'Resolved'
});

const ACTIONS = Object.freeze({
  OPEN: ['acknowledge', 'recover', 'resolve'],
  ACKNOWLEDGED: ['recover', 'resolve'],
  RECOVERING: ['resolve'],
  RESOLVED: []
});

const INCIDENT_KEYS = Object.freeze([
  'acknowledged_at', 'affected_count', 'first_seen_at', 'id', 'incident_type',
  'last_seen_at', 'occurrence_count', 'reason_code', 'recovery_started_at',
  'resolved_at', 'state', 'updated_at', 'version'
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid() { throw new Error('Invalid incident data.'); }

export function buildIncidentQuery({ state = '', incident_type = '', limit = 25, cursor = '' } = {}) {
  if ((state && !Object.hasOwn(STATES, state)) ||
      (incident_type && !Object.hasOwn(TYPES, incident_type)) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 25 ||
      (cursor && (typeof cursor !== 'string' || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)))) {
    throw new Error('Invalid incident filters.');
  }
  const query = new URLSearchParams();
  if (state) query.set('state', state);
  if (incident_type) query.set('incident_type', incident_type);
  query.set('limit', String(limit));
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}

export function normalizeIncident(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== [...INCIDENT_KEYS].sort().join(',') ||
      !UUID.test(value.id || '') || !Object.hasOwn(TYPES, value.incident_type) ||
      !Object.hasOwn(REASONS, value.reason_code) || !Object.hasOwn(STATES, value.state)) invalid();
  for (const key of ['affected_count', 'occurrence_count', 'first_seen_at', 'last_seen_at', 'updated_at']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) invalid();
  }
  if (value.affected_count < 1 || value.occurrence_count < 1 ||
      !Number.isSafeInteger(value.version) || value.version < 1) invalid();
  for (const key of ['acknowledged_at', 'recovery_started_at', 'resolved_at']) {
    if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0)) invalid();
  }
  return { ...value };
}

export function incidentTypeLabel(value) { if (!Object.hasOwn(TYPES, value)) invalid(); return TYPES[value]; }
export function incidentReasonLabel(value) { if (!Object.hasOwn(REASONS, value)) invalid(); return REASONS[value]; }
export function incidentStateLabel(value) { if (!Object.hasOwn(STATES, value)) invalid(); return STATES[value]; }
export function incidentActions(value) { if (!Object.hasOwn(ACTIONS, value)) invalid(); return [...ACTIONS[value]]; }
