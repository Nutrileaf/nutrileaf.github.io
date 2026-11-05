import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMERCE_CONFIG, checkoutStorageKey } from '../commerce-config.js';
import { submitPaymentInitiation, createPaymentController } from '../payment-initiation.js';
const config={enabled:true,environment:'production',apiBase:'https://commerce.example.test',scope:{productId:'product-1',quantity:1}};
const orderId='11111111-1111-4111-8111-111111111111',operationId='22222222-2222-4222-8222-222222222222';
const checkoutKey='checkout-33333333-3333-4333-8333-333333333333';
function storage(){const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const response=()=>Response.json({provider:'STRIPE',operation_id:operationId,redirect_url:'https://checkout.stripe.com/c/pay/cs_live_fixture'},{status:201});
test('production payment sends the original checkout key only in its request header',async()=>{
  let init;const result=await submitPaymentInitiation({config,orderId,provider:'STRIPE',operationId,checkoutKey,fetchImpl:async(url,options)=>{assert.doesNotMatch(url,/checkout-333/);init=options;return response();}});
  assert.equal(result.action,'redirect');assert.equal(init.headers['Idempotency-Key'],checkoutKey);assert.deepEqual(JSON.parse(init.body),{provider:'STRIPE',operation_id:operationId});assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
});
for(const key of [undefined,'known-key','checkout-not-random'])test('missing or weak production ownership fails before transport: '+key,async()=>{
  let calls=0;const result=await submitPaymentInitiation({config,orderId,provider:'STRIPE',operationId,checkoutKey:key,fetchImpl:async()=>{calls++;return response();}});assert.equal(result.action,'ownership-required');assert.equal(calls,0);
});
test('controller binds ownership to this saved order and retains key/operation through unknown response and reload',async()=>{
  const session=storage(),durable=storage();const holdKey=checkoutStorageKey('checkout-hold',config);durable.setItem(holdKey,JSON.stringify({key:checkoutKey,orderId}));
  session.setItem('nutrileaf-cart-v2','unchanged');let calls=0;
  const common={config,orderId,storage:session,holdStorage:durable,uuid:()=>operationId,fetchImpl:async(_url,init)=>{calls++;assert.equal(init.headers['Idempotency-Key'],checkoutKey);assert.equal(JSON.parse(init.body).operation_id,operationId);if(calls===1)throw new Error('lost response');return response();}};
  assert.equal((await createPaymentController(common).initiate('STRIPE')).action,'retry');
  assert.equal((await createPaymentController({...common,uuid:()=>{throw new Error('must reuse identity');}}).initiate('STRIPE')).action,'redirect');
  assert.deepEqual(JSON.parse(durable.getItem(holdKey)),{key:checkoutKey,orderId});assert.equal(session.getItem('nutrileaf-cart-v2'),'unchanged');
});
for(const otherOrder of [null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])test('a hold without this order never supplies payment ownership: '+otherOrder,async()=>{
  const session=storage(),durable=storage();durable.setItem(checkoutStorageKey('checkout-hold',config),JSON.stringify({key:checkoutKey,orderId:otherOrder}));let effects=0;
  const result=await createPaymentController({config,orderId,storage:session,holdStorage:durable,uuid:()=>{effects++;return operationId;},fetchImpl:async()=>{effects++;return response();}}).initiate('STRIPE');
  assert.equal(result.action,'ownership-required');assert.equal(effects,0);assert.equal(session.getItem(checkoutStorageKey(`payment-operation:${orderId}`,config)),null);
});
test('missing hold cannot remove or replace an existing provider operation',async()=>{
  const session=storage(),k=checkoutStorageKey(`payment-operation:${orderId}`,config),saved=JSON.stringify({provider:'STRIPE',operationId});session.setItem(k,saved);
  const result=await createPaymentController({config,orderId,storage:session,uuid:()=>{throw Error('no replacement');},fetchImpl:async()=>{throw Error('no transport');}}).initiate('STRIPE');assert.equal(result.action,'ownership-required');assert.equal(session.getItem(k),saved);
});
test('dormant production config still prevents all payment effects',async()=>{
  let calls=0;const result=await submitPaymentInitiation({config:COMMERCE_CONFIG,orderId,provider:'STRIPE',operationId,checkoutKey,fetchImpl:async()=>{calls++;return response();}});assert.equal(result.action,'disabled');assert.equal(calls,0);
});
