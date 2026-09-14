import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readinessItems, readinessSummary } from '../dashboard/operations-model.js';

test('operations model formats only known nonzero readiness counts', () => {
  const input = {
    status: 'ATTENTION_REQUIRED',
    counts: {
      failed_payments: 2,
      pending_refunds: 0,
      failed_refunds: 1,
      failed_exports: 0,
      expired_inventory_reservations: 3,
      paid_without_fulfillment_readiness: 1,
      shipping_reconciliation_required: null
    },
    reasons: ['PAYMENT_FAILURES', 'REFUND_FAILURES', 'EXPIRED_INVENTORY_RESERVATIONS', 'FULFILLMENT_READINESS_MISSING']
  };
  assert.deepEqual(readinessItems(input), [
    '2 failed payments',
    '1 failed refund',
    '3 expired inventory reservations',
    '1 paid order missing fulfillment readiness'
  ]);
  assert.equal(readinessSummary(input), '4 operational areas need attention.');
});

test('operations model handles clear and invalid input safely', () => {
  assert.deepEqual(readinessItems({ status: 'CLEAR', counts: {}, reasons: [] }), []);
  assert.equal(readinessSummary({ status: 'CLEAR', counts: {}, reasons: [] }), 'No operational exceptions detected.');
  assert.throws(() => readinessItems({ status: 'ATTENTION_REQUIRED', counts: { failed_payments: -1 }, reasons: [] }));
  assert.throws(() => readinessItems({ status: 'READY', counts: {}, reasons: [] }));
});

test('orders screen contains an accessible read-only readiness region', () => {
  const html = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../dashboard/orders.js', import.meta.url), 'utf8');
  assert.match(html, /id="operationsReadiness"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(js, /\/api\/operations\/readiness/);
  assert.match(js, /readinessSummary/);
  assert.match(js, /readinessItems/);
  assert.doesNotMatch(html, /(?:resolve|retry|delete|refund|ship)[^<]*<\/button>/i);
});
