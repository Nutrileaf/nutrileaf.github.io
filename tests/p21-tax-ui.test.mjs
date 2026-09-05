import test from "node:test";
import assert from "node:assert/strict";
import { checkoutResultAction } from "../checkout-state.js";
import { submitCheckout } from "../checkout-submit.js";

test("maps tax outage response to customer-safe checkout action",()=>{assert.equal(checkoutResultAction(503),"tax-outage");});
test("preserves the exact server tax outage message",async()=>{const result=await submitCheckout({apiBase:"https://api.test",body:{},idempotencyKey:"k",fetchImpl:async()=>new Response(JSON.stringify({error:"Tax calculation is temporarily unavailable. Please try again later."}),{status:503,headers:{"Content-Type":"application/json"}})});assert.equal(result.action,"tax-outage");assert.equal(result.payload.error,"Tax calculation is temporarily unavailable. Please try again later.");});
