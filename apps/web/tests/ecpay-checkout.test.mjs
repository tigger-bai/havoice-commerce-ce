import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { submitEcpayForm } from '../src/lib/ecpay-form.ts';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.submitted = false;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  submit() {
    this.submitted = true;
  }
}

function createFakeDocument() {
  return {
    body: new FakeElement('body'),
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
}

test('creates and submits an ECPay POST form from the response payload', () => {
  const documentRef = createFakeDocument();
  const payload = {
    MerchantID: 'test-merchant',
    MerchantTradeNo: 'ORDER123',
    CheckMacValue: 'test-checksum',
  };

  const form = submitEcpayForm(
    'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    payload,
    documentRef,
  );

  assert.equal(form.method, 'POST');
  assert.equal(form.action, 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
  assert.equal(form.submitted, true);
  assert.equal(form.children.length, Object.keys(payload).length);
  assert.deepEqual(
    form.children.map(({ name, value, type }) => ({ name, value, type })),
    Object.entries(payload).map(([name, value]) => ({ name, value, type: 'hidden' })),
  );
});

test('does not create or submit a form when payment data is incomplete', () => {
  const documentRef = createFakeDocument();

  assert.throws(
    () => submitEcpayForm('', {}, documentRef),
    /ECPay payment form data is incomplete/,
  );
  assert.equal(documentRef.body.children.length, 0);
});

test('CSP permits ECPay stage and production form actions', async () => {
  const require = createRequire(import.meta.url);
  const nextConfig = require('../next.config.js');
  const headerRules = await nextConfig.headers();
  const csp = headerRules
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy')?.value;

  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /https:\/\/payment-stage\.ecpay\.com\.tw/);
  assert.match(csp, /https:\/\/payment\.ecpay\.com\.tw/);
});

test('API create-order response includes the ECPay action URL contract', () => {
  const controllerSource = readFileSync(
    new URL('../../api/src/controllers/order.controller.ts', import.meta.url),
    'utf8',
  );

  assert.match(controllerSource, /ecpayPayload,\s+ecpayActionUrl,/);
});

test('incomplete online-payment data returns before the cart is cleared', () => {
  const checkoutSource = readFileSync(
    new URL('../src/app/checkout/page.tsx', import.meta.url),
    'utf8',
  );
  const incompleteDataCheck = checkoutSource.indexOf('!order.ecpayActionUrl');
  const onlinePaymentReturn = checkoutSource.indexOf(
    'submitEcpayForm(order.ecpayActionUrl, order.ecpayPayload);',
  );
  const clearCart = checkoutSource.indexOf('clearCart();', onlinePaymentReturn);

  assert.notEqual(incompleteDataCheck, -1);
  assert.notEqual(onlinePaymentReturn, -1);
  assert.notEqual(clearCart, -1);
  assert.ok(incompleteDataCheck < onlinePaymentReturn);
  assert.ok(onlinePaymentReturn < clearCart);
});
