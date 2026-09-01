import test from "node:test";
import assert from "node:assert/strict";
import { submitCheckout } from "../checkout-submit.js";

const requestBody={customer:{email:"buyer@example.test"},items:[{product_id:"product-1",quantity:1}]};

test("submits only the authoritative checkout request with its idempotency key", async () => {
  let call;
  const result=await submitCheckout({
    apiBase:"https://api.example.test",
    body:requestBody,
    idempotencyKey:"checkout-test-1",
    fetchImpl:async (url,init)=>{call={url,init};return new Response(JSON.stringify({order:{order_number:"NL-1"}}),{status:201});}
  });
  assert.equal(call.url,"https://api.example.test/checkout/orders");
  assert.equal(call.init.headers["Idempotency-Key"],"checkout-test-1");
  assert.deepEqual(JSON.parse(call.init.body),requestBody);
  assert.equal(result.action,"confirm");
});

test("preserves a retry action for network and server failures", async () => {
  const failure=await submitCheckout({apiBase:"https://api.example.test",body:requestBody,idempotencyKey:"checkout-test-1",fetchImpl:async()=>{throw new Error("offline");}});
  const server=await submitCheckout({apiBase:"https://api.example.test",body:requestBody,idempotencyKey:"checkout-test-1",fetchImpl:async()=>new Response("",{status:500})});
  assert.equal(failure.action,"retry");
  assert.equal(server.action,"retry");
});
