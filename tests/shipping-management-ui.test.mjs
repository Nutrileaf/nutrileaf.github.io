import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPROVED_PREDEFINED_PACKAGES,
  createShippingMutationTracker,
  formatDimensionTenths,
  formatWeightTenths,
  parseDimensionTenths,
  parseWeightTenths,
  shippingPackageFieldVisibility,
  shippingFormFromProfile,
  shippingProfileDraft,
  shippingProfileFingerprint,
  shippingProfileIsDirty
} from '../dashboard/shipping-management-model.js';

test('shipping display conversion uses decimal strings and exact integer tenths', () => {
  assert.equal(parseWeightTenths('0', '0.1'), 1);
  assert.equal(parseWeightTenths('1', '2.3'), 183);
  assert.equal(parseWeightTenths('70', '0.0'), 11200);
  assert.deepEqual(formatWeightTenths(183), { pounds: '1', ounces: '2.3' });
  assert.equal(parseDimensionTenths('6.4'), 64);
  assert.equal(formatDimensionTenths(64), '6.4');
  for (const input of [['', '1.0'], ['-1', '0.0'], ['1', '16.0'], ['70', '0.1'], ['1', '1.23']]) {
    assert.throws(() => parseWeightTenths(...input), /weight/i);
  }
  for (const value of ['', '0', '-1', '1.25', '108.1', '1e2']) {
    assert.throws(() => parseDimensionTenths(value), /dimension/i);
  }
});

test('profile drafts enforce exactly one package representation and exclude unrelated commerce fields', () => {
  assert.deepEqual(shippingProfileDraft({
    package_method: 'CUSTOM', pounds: '1', ounces: '2.3',
    length: '6.0', width: '4.0', height: '2.0', predefined_package: 'SmallFlatRateBox',
    visible_in_store: true, price_cents: 1, inventory: 99, product_type: 'Soap'
  }, 4), {
    expected_version: 4, readiness_status: 'CONFIGURED', package_method: 'CUSTOM',
    weight_oz_tenths: 183, length_in_tenths: 60, width_in_tenths: 40,
    height_in_tenths: 20, predefined_package: null
  });
  assert.deepEqual(shippingProfileDraft({
    package_method: 'PREDEFINED', pounds: '0', ounces: '4.2',
    length: '9.9', width: '9.9', height: '9.9', predefined_package: 'SmallFlatRateBox'
  }, 0), {
    expected_version: 0, readiness_status: 'CONFIGURED', package_method: 'PREDEFINED',
    weight_oz_tenths: 42, length_in_tenths: null, width_in_tenths: null,
    height_in_tenths: null, predefined_package: 'SmallFlatRateBox'
  });
  assert.deepEqual(APPROVED_PREDEFINED_PACKAGES, ['SmallFlatRateBox', 'MediumFlatRateBox', 'LargeFlatRateBox']);
  assert.throws(() => shippingProfileDraft({ package_method: '', pounds: '', ounces: '' }, 0), /package method/i);
  assert.throws(() => shippingProfileDraft({ package_method: 'PREDEFINED', pounds: '0', ounces: '1.0', predefined_package: 'CarrierCustomBox' }, 0), /predefined package/i);
});

test('package mode switching exposes exactly the authoritative field group', () => {
  assert.deepEqual(shippingPackageFieldVisibility(''), { custom: false, predefined: false });
  assert.deepEqual(shippingPackageFieldVisibility('CUSTOM'), { custom: true, predefined: false });
  assert.deepEqual(shippingPackageFieldVisibility('PREDEFINED'), { custom: false, predefined: true });
  assert.throws(() => shippingPackageFieldVisibility('CARRIER_TEXT'), /package method/i);
});

test('profile form hydration invents no measurements and preserves retained inactive values', () => {
  assert.deepEqual(shippingFormFromProfile({
    readiness_status: 'UNCONFIGURED', package_method: null, weight_oz_tenths: null,
    length_in_tenths: null, width_in_tenths: null, height_in_tenths: null,
    predefined_package: null, version: 0
  }), {
    package_method: '', pounds: '', ounces: '', length: '', width: '', height: '',
    predefined_package: ''
  });
  assert.deepEqual(shippingFormFromProfile({
    readiness_status: 'UNCONFIGURED', package_method: 'CUSTOM', weight_oz_tenths: 183,
    length_in_tenths: 60, width_in_tenths: 40, height_in_tenths: 20,
    predefined_package: null, version: 2
  }), {
    package_method: 'CUSTOM', pounds: '1', ounces: '2.3', length: '6.0',
    width: '4.0', height: '2.0', predefined_package: ''
  });
});

test('shipping dirty state is independent and canonical', () => {
  const baseline = { package_method: 'CUSTOM', pounds: '1', ounces: '2.0', length: '6.0', width: '4.0', height: '2.0', predefined_package: '' };
  assert.equal(shippingProfileIsDirty(baseline, { ...baseline }), false);
  assert.equal(shippingProfileIsDirty(baseline, { ...baseline, width: '4.1' }), true);
  assert.equal(shippingProfileFingerprint({ ...baseline, visible_in_store: true }), shippingProfileFingerprint(baseline));
});

test('mutation tracker retains one client ID for ambiguous retry and rotates after a definite result', () => {
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const tracker = createShippingMutationTracker(() => ids.shift());
  assert.equal(tracker.idFor('same-body'), '11111111-1111-4111-8111-111111111111');
  tracker.settle('same-body', 'AMBIGUOUS');
  assert.equal(tracker.idFor('same-body'), '11111111-1111-4111-8111-111111111111');
  tracker.settle('same-body', 'DEFINITE');
  assert.equal(tracker.idFor('same-body'), '22222222-2222-4222-8222-222222222222');
});

test('shipping editor DOM is accessible, explicit, and has no destructive clear action', () => {
  const html = readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  for (const id of [
    'shippingProfileSection', 'shippingReadiness', 'shippingVersion', 'shippingDirtyIndicator',
    'shippingPackageMethod', 'shippingPounds', 'shippingOunces', 'shippingLength',
    'shippingWidth', 'shippingHeight', 'shippingPredefinedPackage', 'saveShippingProfileButton',
    'deactivateShippingProfileButton', 'shippingInactiveWarning'
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), id);
  for (const target of ['shippingPackageMethod', 'shippingPounds', 'shippingOunces', 'shippingLength', 'shippingWidth', 'shippingHeight', 'shippingPredefinedPackage']) {
    assert.match(html, new RegExp(`for=["']${target}["']`), target);
  }
  assert.match(html, /Not configured[^<]*values[^<]*inactive/i);
  assert.match(html, /USPS Priority Mail Flat Rate/i);
  assert.doesNotMatch(html, /clear all shipping|clear shipping measurements/i);
});

test('shipping save path remains separate from product detail mutation fields', () => {
  const app = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
  assert.match(app, /\/api\/products\/\$\{encodeURIComponent\(state\.selected\.id\)\}\/shipping-profile/);
  assert.match(app, /client_mutation_id/);
  const shippingFunction = app.match(/async function saveShippingProfile[\s\S]*?\n}\n/);
  assert.ok(shippingFunction);
  for (const forbidden of ['visible_in_store', 'price_cents', 'available_stock', 'product_type', 'photo']) {
    assert.equal(shippingFunction[0].includes(forbidden), false, forbidden);
  }
});
