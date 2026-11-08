import test from 'node:test';
import assert from 'node:assert/strict';
import * as payment from '../payment-initiation.js';

test('lost checkout ownership requires status or store reconciliation instead of another payment retry',()=>{
  assert.equal(typeof payment.paymentRecoveryFeedback,'function');
  const feedback=payment.paymentRecoveryFeedback('ownership-required');
  assert.equal(feedback.retryAllowed,false);
  assert.equal(feedback.checkStatus,true);
  assert.match(feedback.message,/ownership/i);
  assert.match(feedback.message,/status.*contact the store/i);
  assert.doesNotMatch(feedback.message,/temporarily unavailable|retry safely/i);
});
test('uncertain transport preserves same-identity retry and conflict permits the original provider replay',()=>{
  assert.equal(typeof payment.paymentRecoveryFeedback,'function');
  for(const action of ['retry','conflict']){
    const feedback=payment.paymentRecoveryFeedback(action);
    assert.equal(feedback.retryAllowed,true);
    assert.equal(feedback.checkStatus,false);
  }
});
test('payment feedback cannot echo untrusted response or ownership material',()=>{
  assert.equal(typeof payment.paymentRecoveryFeedback,'function');
  const feedback=payment.paymentRecoveryFeedback({error:'private-owner-key',message:'<script>private</script>'});
  assert.doesNotMatch(JSON.stringify(feedback),/private|script/);
});

for(const [name,read] of [
  ['malformed JSON',()=>'{'],
  ['invalid ownership record',()=>JSON.stringify({key:123,orderId:null})],
  ['unreadable ownership storage',()=>{throw Error('private storage details');}]
])test(name+' requires reconciliation without minting, transport or saved-state replacement',async()=>{
  const config={enabled:true,environment:'production',apiBase:'https://commerce.example.test',scope:{productId:'product-1',quantity:1}};
  let effects=0;
  const result=await payment.createPaymentController({config,orderId:'11111111-1111-4111-8111-111111111111',
    storage:{getItem(){effects++;return 'original-payment-operation';},setItem(){effects++;}},
    holdStorage:{getItem:read},uuid(){effects++;return '22222222-2222-4222-8222-222222222222';},fetchImpl(){effects++;throw Error('must not send');}
  }).initiate('STRIPE');
  assert.equal(result.action,'ownership-required');assert.equal(effects,0);
  assert.equal(payment.paymentRecoveryFeedback(result.action).retryAllowed,false);
  assert.doesNotMatch(JSON.stringify(result),/private|storage details/);
});
test('TEST ownership storage failures preserve the existing retry outcome',async()=>{
  const config={enabled:true,environment:'test',apiBase:'https://commerce.example.test',scope:{productId:'product-1',quantity:1}};
  const result=await payment.createPaymentController({config,orderId:'11111111-1111-4111-8111-111111111111',storage:{getItem(){throw Error('offline failure');}}}).initiate('STRIPE');
  assert.equal(result.action,'retry');
});
