import test from 'node:test';
import assert from 'node:assert/strict';

const ui = await import('../dashboard/p34-shipping-ui-model.js').catch(() => ({}));
const shippingPresentation = ui.shippingPresentation ?? (() => undefined);
const visibleCustomerActions = ui.visibleCustomerActions ?? (() => undefined);

test('P34 checkout renders friendly category, actual service, and exact server price', () => {
  assert.deepEqual(shippingPresentation({
    category: 'STANDARD', carrier: 'USPS', service: 'Ground Advantage', amount: 725, currency: 'USD'
  }), {
    title: 'Standard',
    service: 'USPS Ground Advantage',
    price: '$7.25',
    selectable: true
  });
});

test('P34 never turns review or temporary provider unavailability into an invented price', () => {
  assert.deepEqual(shippingPresentation({ state: 'REVIEW' }), {
    title: 'Shipping requires review',
    service: null,
    price: null,
    selectable: false
  });
  assert.deepEqual(shippingPresentation({ state: 'UNAVAILABLE' }), {
    title: 'Shipping temporarily unavailable',
    service: null,
    price: null,
    selectable: false
  });
});

test('P34 order-status controls follow safe server-projected windows only', () => {
  assert.deepEqual(visibleCustomerActions({ cancel_order: true, report_package_not_received: false }), ['CANCEL_ORDER']);
  assert.deepEqual(visibleCustomerActions({ cancel_order: false, report_package_not_received: true }), ['REPORT_PACKAGE_NOT_RECEIVED']);
  assert.deepEqual(visibleCustomerActions({ cancel_order: false, report_package_not_received: false }), []);
});
