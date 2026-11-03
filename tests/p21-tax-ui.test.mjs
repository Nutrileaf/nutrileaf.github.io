import test from "node:test";
import assert from "node:assert/strict";
import { checkoutResultAction } from "../checkout-state.js";
import { submitCheckout } from "../checkout-submit.js";

test("maps tax outage response to customer-safe checkout action",()=>{assert.equal(checkoutResultAction(503),"tax-outage");});
test("preserves the exact server tax outage message",async()=>{const result=await submitCheckout({config:{enabled:true,environment:"test",apiBase:"https://api.test",scope:{productId:"product-1",quantity:1}},body:{items:[{product_id:"product-1",quantity:1}],shipping_rate_id:"rate-1"},idempotencyKey:"k",fetchImpl:async()=>new Response(JSON.stringify({error:"Tax calculation is temporarily unavailable. Please try again later."}),{status:503,headers:{"Content-Type":"application/json"}})});assert.equal(result.action,"tax-outage");assert.equal(result.payload.error,"Tax calculation is temporarily unavailable. Please try again later.");});
