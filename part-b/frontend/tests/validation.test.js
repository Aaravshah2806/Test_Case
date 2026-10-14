import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomer } from '../src/validation.js';

test('accepts trimmed names and leading zero mobile numbers', () => {
  assert.deepEqual(validateCustomer('  Asha Shah  ', '0123456789'), {});
});

test('rejects blank, oversized, and control-character names', () => {
  for (const name of ['', '   ', 'A'.repeat(101), 'Asha\nShah']) {
    assert.ok(validateCustomer(name, '0123456789').customer_name);
  }
});

test('requires exactly ten ASCII digits', () => {
  for (const mobile of ['123', '12345678901', '+919876543210', '１２３４５６７８９０', '12345 6789']) {
    assert.ok(validateCustomer('Asha', mobile).mobile);
  }
});
