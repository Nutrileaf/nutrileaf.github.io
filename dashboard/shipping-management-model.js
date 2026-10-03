export const APPROVED_PREDEFINED_PACKAGES = Object.freeze([
  'SmallFlatRateBox',
  'MediumFlatRateBox',
  'LargeFlatRateBox'
]);

const PACKAGE_SET = new Set(APPROVED_PREDEFINED_PACKAGES);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function wholeNumber(value, maximum, field) {
  const text = String(value ?? '').trim();
  if (text.length > 6 || !/^\d+$/.test(text)) throw new Error(`Enter a valid ${field}.`);
  let result = 0;
  for (const digit of text) {
    result = result * 10 + digit.charCodeAt(0) - 48;
    if (!Number.isSafeInteger(result) || result > maximum) throw new Error(`Enter a valid ${field}.`);
  }
  return result;
}

function decimalTenths(value, maximum, field, allowZero) {
  const text = String(value ?? '').trim();
  const match = /^(\d+)(?:\.(\d))?$/.exec(text);
  if (!match) throw new Error(`Enter a valid ${field}.`);
  const whole = wholeNumber(match[1], Math.floor(maximum / 10) + 1, field);
  const result = whole * 10 + Number(match[2] || 0);
  if (result > maximum || (!allowZero && result === 0)) throw new Error(`Enter a valid ${field}.`);
  return result;
}

export function parseWeightTenths(pounds, ounces) {
  const poundsValue = wholeNumber(pounds, 70, 'weight');
  const ouncesValue = decimalTenths(ounces, 159, 'weight', true);
  const result = poundsValue * 160 + ouncesValue;
  if (result < 1 || result > 11200) throw new Error('Enter a valid shipping weight.');
  return result;
}

export function formatWeightTenths(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 11200) throw new Error('Invalid shipping weight.');
  const ounces = value % 160;
  return { pounds: String(Math.floor(value / 160)), ounces: `${Math.floor(ounces / 10)}.${ounces % 10}` };
}

export function parseDimensionTenths(value) {
  return decimalTenths(value, 1080, 'dimension', false);
}

export function formatDimensionTenths(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1080) throw new Error('Invalid shipping dimension.');
  return `${Math.floor(value / 10)}.${value % 10}`;
}

function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Refresh the shipping profile before saving.');
  return value;
}

export function shippingProfileDraft(input, version) {
  const packageMethod = typeof input?.package_method === 'string' ? input.package_method : '';
  if (packageMethod !== 'CUSTOM' && packageMethod !== 'PREDEFINED') throw new Error('Choose a package method.');
  const weight = parseWeightTenths(input?.pounds, input?.ounces);
  const base = {
    expected_version: expectedVersion(version),
    readiness_status: 'CONFIGURED',
    package_method: packageMethod,
    weight_oz_tenths: weight
  };
  if (packageMethod === 'CUSTOM') {
    return {
      ...base,
      length_in_tenths: parseDimensionTenths(input?.length),
      width_in_tenths: parseDimensionTenths(input?.width),
      height_in_tenths: parseDimensionTenths(input?.height),
      predefined_package: null
    };
  }
  if (!PACKAGE_SET.has(input?.predefined_package)) throw new Error('Choose an approved predefined package.');
  return {
    ...base,
    length_in_tenths: null,
    width_in_tenths: null,
    height_in_tenths: null,
    predefined_package: input.predefined_package
  };
}

export function shippingPackageFieldVisibility(packageMethod) {
  if (packageMethod === '') return { custom: false, predefined: false };
  if (packageMethod === 'CUSTOM') return { custom: true, predefined: false };
  if (packageMethod === 'PREDEFINED') return { custom: false, predefined: true };
  throw new Error('Choose a package method.');
}

export function shippingFormFromProfile(profile = {}) {
  let pounds = '';
  let ounces = '';
  if (Number.isSafeInteger(profile.weight_oz_tenths) && profile.weight_oz_tenths > 0) {
    ({ pounds, ounces } = formatWeightTenths(profile.weight_oz_tenths));
  }
  return {
    package_method: profile.package_method === 'CUSTOM' || profile.package_method === 'PREDEFINED' ? profile.package_method : '',
    pounds,
    ounces,
    length: Number.isSafeInteger(profile.length_in_tenths) && profile.length_in_tenths > 0 ? formatDimensionTenths(profile.length_in_tenths) : '',
    width: Number.isSafeInteger(profile.width_in_tenths) && profile.width_in_tenths > 0 ? formatDimensionTenths(profile.width_in_tenths) : '',
    height: Number.isSafeInteger(profile.height_in_tenths) && profile.height_in_tenths > 0 ? formatDimensionTenths(profile.height_in_tenths) : '',
    predefined_package: PACKAGE_SET.has(profile.predefined_package) ? profile.predefined_package : ''
  };
}

function normalizedForm(input = {}) {
  const text = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return {
    package_method: text(input.package_method),
    pounds: text(input.pounds),
    ounces: text(input.ounces),
    length: text(input.length),
    width: text(input.width),
    height: text(input.height),
    predefined_package: text(input.predefined_package)
  };
}

export function shippingProfileFingerprint(input = {}) {
  return JSON.stringify(normalizedForm(input));
}

export function shippingProfileIsDirty(baseline, current) {
  return shippingProfileFingerprint(baseline) !== shippingProfileFingerprint(current);
}

export function createShippingMutationTracker(uuidFactory = () => crypto.randomUUID()) {
  const pending = new Map();
  return Object.freeze({
    idFor(key) {
      if (typeof key !== 'string' || !key) throw new Error('Unable to identify this shipping change.');
      if (!pending.has(key)) {
        const id = uuidFactory();
        if (typeof id !== 'string' || !UUID_V4.test(id)) throw new Error('Unable to identify this shipping change.');
        pending.set(key, id);
      }
      return pending.get(key);
    },
    settle(key, outcome) {
      if (outcome === 'AMBIGUOUS') return;
      if (outcome !== 'DEFINITE') throw new Error('Invalid shipping mutation outcome.');
      pending.delete(key);
    },
    clear() { pending.clear(); }
  });
}
