import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPROVED_PREDEFINED_PACKAGES,
  SHIPPING_SERVICE_DEFINITIONS,
  createShippingMutationTracker,
  formatDimensionTenths,
  formatWeightTenths,
  parseDimensionTenths,
  parseWeightTenths,
  normalizeShippingPolicies,
  shippingPackageFieldVisibility,
  shippingProfileDisplayState,
  shippingFormFromProfile,
  shippingProfileDraft,
  shippingProfileFingerprint,
  shippingProfileIsDirty,
  shippingPolicyDraft,
  shippingPolicyIsDirty,
  shippingServicesStatus
} from '../dashboard/shipping-management-model.js';

test('invalid configured profiles display needs repair instead of configured', () => {
  assert.deepEqual(shippingProfileDisplayState({
    readiness_status: 'CONFIGURED',
    configuration_error: 'INVALID_PACKAGE_PROFILE'
  }), { configured: false, label: 'Needs repair' });
  assert.deepEqual(shippingProfileDisplayState({
    readiness_status: 'CONFIGURED',
    configuration_error: null
  }), { configured: true, label: 'Configured' });
});

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
  assert.match(app, /\/api\/products\/\$\{encodeURIComponent\(state\.shippingSelected\.id\)\}\/shipping-profile/);
  assert.match(app, /client_mutation_id/);
  const shippingFunction = app.match(/async function saveShippingProfile[\s\S]*?\n}\n/);
  assert.ok(shippingFunction);
  for (const forbidden of ['visible_in_store', 'price_cents', 'available_stock', 'product_type', 'photo']) {
    assert.equal(shippingFunction[0].includes(forbidden), false, forbidden);
  }
});

test('shipping service model accepts exactly the two reviewed USPS registry entries', () => {
  assert.deepEqual(SHIPPING_SERVICE_DEFINITIONS, [
    { service_key: 'usps-ground-advantage', display_name: 'USPS Ground Advantage', carrier: 'USPS', provider_service: 'GroundAdvantage', category: 'ECONOMY', speed_rank: 10 },
    { service_key: 'usps-priority-mail', display_name: 'USPS Priority Mail', carrier: 'USPS', provider_service: 'Priority', category: 'STANDARD', speed_rank: 20 }
  ]);
  const policies = normalizeShippingPolicies({ policies: [
    { service_key: 'usps-ground-advantage', carrier: 'USPS', provider_service: 'GroundAdvantage', category: 'ECONOMY', speed_rank: 10, active: false, policy_revision: 0, updated_at: null },
    { service_key: 'usps-priority-mail', carrier: 'USPS', provider_service: 'Priority', category: 'STANDARD', speed_rank: 20, active: true, policy_revision: 2, updated_at: 100 }
  ] });
  assert.equal(policies.length, 2);
  assert.throws(() => normalizeShippingPolicies({ policies: [{ ...policies[0], category: 'STANDARD' }, policies[1]] }), /service policy/i);
  assert.throws(() => normalizeShippingPolicies({ policies: [...policies, { service_key: 'ups-ground' }] }), /service policy/i);
});

test('service controls have independent dirty state and revision-only mutation authority', () => {
  const ground = { service_key: 'usps-ground-advantage', active: false, policy_revision: 3 };
  const priority = { service_key: 'usps-priority-mail', active: true, policy_revision: 5 };
  assert.equal(shippingPolicyIsDirty(ground, false), false);
  assert.equal(shippingPolicyIsDirty(ground, true), true);
  assert.equal(shippingPolicyIsDirty(priority, true), false);
  assert.deepEqual(shippingPolicyDraft(ground, true), { expected_policy_revision: 3, active: true });
  assert.deepEqual(Object.keys(shippingPolicyDraft(priority, false)).sort(), ['active', 'expected_policy_revision']);
});

test('zero enabled shipping services is an explicit fail-closed state', () => {
  assert.deepEqual(shippingServicesStatus([{ active: false }, { active: false }]), {
    enabled_count: 0,
    message: 'No shipping services are enabled. New shipping quotes remain unavailable.'
  });
  assert.equal(shippingServicesStatus([{ active: true }, { active: false }]).enabled_count, 1);
});

test('shipping services page has fixed controls, revision evidence, and no free-text provider identifiers', () => {
  const html = readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../dashboard/shipping-services.js', import.meta.url), 'utf8');
  for (const id of ['shippingServicesTab', 'shippingServicesPanel', 'shippingServicesList', 'shippingServicesWarning']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(source, /\/api\/shipping-services/);
  assert.match(source, /client_mutation_id/);
  assert.match(source, /SHIPPING_POLICY_CONFLICT/);
  assert.match(source, /AMBIGUOUS/);
  assert.doesNotMatch(html, /<input[^>]+(?:carrier|provider_service|category|speed_rank|service_key)/i);
  assert.doesNotMatch(html, /<textarea[^>]+(?:carrier|service)/i);
});


test('shipping profiles have a dedicated top-level dashboard workspace', () => {
  const html = readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
  for (const id of [
    'shippingProfilesTab', 'shippingProfilesPanel', 'shippingProfilesList',
    'shippingProfilesSearch', 'shippingProfilesRefresh', 'shippingProfileProductTitle',
    'shippingProfileProductSku'
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), id);
  assert.match(html, /Products[\s\S]*Shipping Profiles[\s\S]*Shipping Services[\s\S]*Orders/);
  const editorStart = html.indexOf('id="editor"');
  const profilesStart = html.indexOf('id="shippingProfilesPanel"');
  assert.ok(editorStart >= 0 && profilesStart > editorStart);
  assert.doesNotMatch(html.slice(editorStart, profilesStart), /id=["']shippingProfileSection["']/);
  assert.match(html.slice(profilesStart), /id=["']shippingProfileSection["']/);
  assert.match(app, /shippingSelected/);
  assert.match(app, /loadShippingProfiles/);
  assert.match(app, /shippingProfilesTab/);
});

test('shipping profile workspace keeps product mutations separate from shipping measurements', () => {
  const app = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
  const save = app.match(/async function saveShippingProfile[\s\S]*?\n}\n/);
  assert.ok(save);
  assert.match(save[0], /state\.shippingSelected\.id/);
  for (const forbidden of ['visible_in_store', 'price_cents', 'available_stock', 'product_type', 'photo']) {
    assert.equal(save[0].includes(forbidden), false, forbidden);
  }
});
