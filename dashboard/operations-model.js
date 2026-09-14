const LABELS = Object.freeze({
  failed_payments: ['failed payment', 'failed payments'],
  pending_refunds: ['pending refund', 'pending refunds'],
  failed_refunds: ['failed refund', 'failed refunds'],
  failed_exports: ['failed order export', 'failed order exports'],
  expired_inventory_reservations: ['expired inventory reservation', 'expired inventory reservations'],
  paid_without_fulfillment_readiness: ['paid order missing fulfillment readiness', 'paid orders missing fulfillment readiness'],
  shipping_reconciliation_required: ['shipping reconciliation item', 'shipping reconciliation items']
});

export function readinessItems(value) {
  if (!value || !new Set(['CLEAR', 'ATTENTION_REQUIRED']).has(value.status) ||
      !value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts)) {
    throw new Error('Invalid operations readiness.');
  }
  for (const key of Object.keys(value.counts)) if (!Object.hasOwn(LABELS, key)) throw new Error('Invalid operations readiness.');
  const items = [];
  for (const [key, labels] of Object.entries(LABELS)) {
    const count = value.counts[key] ?? 0;
    if (key === 'shipping_reconciliation_required' && value.counts[key] === null) continue;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid operations readiness.');
    if (count > 0) items.push(`${count} ${count === 1 ? labels[0] : labels[1]}`);
  }
  if (value.status === 'CLEAR' && items.length) throw new Error('Invalid operations readiness.');
  if (value.status === 'ATTENTION_REQUIRED' && !items.length) throw new Error('Invalid operations readiness.');
  return items;
}

export function readinessSummary(value) {
  const items = readinessItems(value);
  return items.length ? `${items.length} operational ${items.length === 1 ? 'area needs' : 'areas need'} attention.` : 'No operational exceptions detected.';
}
