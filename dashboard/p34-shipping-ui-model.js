const TITLES = Object.freeze({
  ECONOMY: 'Economy',
  STANDARD: 'Standard',
  EXPRESS: 'Express'
});

function money(cents, currency) {
  if (!Number.isSafeInteger(cents) || cents < 0 || currency !== 'USD') return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export function shippingPresentation(value = {}) {
  if (value.state === 'REVIEW') {
    return { title: 'Shipping requires review', service: null, price: null, selectable: false };
  }
  if (value.state === 'UNAVAILABLE') {
    return { title: 'Shipping temporarily unavailable', service: null, price: null, selectable: false };
  }
  const title = TITLES[value.category];
  const price = money(value.amount, value.currency);
  const carrier = typeof value.carrier === 'string' ? value.carrier.trim() : '';
  const service = typeof value.service === 'string' ? value.service.trim() : '';
  if (!title || !price || !carrier || !service) {
    return { title: 'Shipping requires review', service: null, price: null, selectable: false };
  }
  return { title, service: `${carrier} ${service}`, price, selectable: true };
}

export function visibleCustomerActions(value = {}) {
  const actions = [];
  if (value.cancel_order === true) actions.push('CANCEL_ORDER');
  if (value.report_package_not_received === true) actions.push('REPORT_PACKAGE_NOT_RECEIVED');
  return actions;
}
