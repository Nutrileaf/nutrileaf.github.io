import { normalizeCatalog, normalizeCart, createCheckoutRequest, checkoutFingerprint, checkoutKeyFor, validateCheckoutRequest } from "./checkout-state.js";
import { submitCheckout } from "./checkout-submit.js";

const products=[];
let cart=[];
try { cart=JSON.parse(localStorage.getItem("nutrileaf-cart-v2")||"[]"); } catch { cart=[]; }
cart=normalizeCart(cart);
localStorage.setItem("nutrileaf-cart-v2",JSON.stringify(cart));
if(localStorage.getItem("nutrileaf-cart")){
 localStorage.removeItem("nutrileaf-cart");
 localStorage.setItem("nutrileaf-cart-refresh","1");
}
const API_BASE="https://nutrileaf-api.adam-d-may-20.workers.dev";
const $=s=>document.querySelector(s);
function money(n){return "$"+n.toFixed(2)}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
async function loadCatalog(){
 try {
  const response=await fetch(`${API_BASE}/products`);
  if(!response.ok) throw new Error("Catalog unavailable");
  const payload=await response.json();
  products.splice(0,products.length,...normalizeCatalog(payload.products).map(p=>({...p,type:p.category||"Other",desc:p.description||"",price:Number(p.price)/100,symbol:"✿"})));
  cart=cart.filter(item=>products.some(product=>String(product.id)===item.product_id));
  localStorage.setItem("nutrileaf-cart-v2",JSON.stringify(cart));
  if($("#products"))renderProducts();renderCart();
  if(checkoutButton)checkoutButton.disabled=cart.length===0;
  if(checkoutSubmit)checkoutSubmit.disabled=false;
  if(localStorage.getItem("nutrileaf-cart-refresh")){localStorage.removeItem("nutrileaf-cart-refresh");toast("Your cart was refreshed to use the current catalog.")}
  return true;
 } catch { toast("Catalog is unavailable. Checkout is disabled."); if(checkoutButton)checkoutButton.disabled=true;if(checkoutSubmit)checkoutSubmit.disabled=true;return false; }
}

function renderProducts(filter="All"){
 const list=filter==="All"?products:products.filter(p=>p.type===filter);
 $("#products").innerHTML=list.map(p=>`<article class="product" data-product-id="${escapeHtml(p.id)}"><div class="product-photo">${p.image?`<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">`:p.symbol}</div><div class="product-info"><span class="tag">${escapeHtml(p.type)}</span><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.desc)}</p><div class="product-row"><span class="price">${money(p.price)}</span><button class="add" type="button" data-add-product="${escapeHtml(p.id)}">Add to cart</button></div></div></article>`).join("");
 $("#products").querySelectorAll("[data-add-product]").forEach(button=>button.addEventListener("click",()=>addToCart(button.dataset.addProduct)));
}
function addToCart(id,quantity=1){const p=products.find(x=>String(x.id)===String(id));if(!p)return;const item=cart.find(x=>x.product_id===String(id));item?item.quantity+=quantity:cart.push({product_id:String(id),quantity});save();toast(`${quantity} × ${p.name} added to cart`)}
function save(){cart=normalizeCart(cart);localStorage.setItem("nutrileaf-cart-v2",JSON.stringify(cart));renderCart();if(checkoutButton)checkoutButton.disabled=products.length===0||cart.length===0}
function renderCart(){
 const cartCount=$("#cartCount"),cartItems=$("#cartItems"),cartTotal=$("#cartTotal");
 if(!cartCount||!cartItems||!cartTotal)return;
 cartCount.textContent=cart.reduce((s,x)=>s+x.quantity,0);
 cartItems.innerHTML=cart.length?cart.map(x=>{const product=products.find(p=>String(p.id)===x.product_id);return `<div class="cart-item"><div><strong>${escapeHtml(product?.name||"Unavailable product")}</strong><div>${x.quantity} × ${money(product?.price||0)}</div></div><button class="remove" type="button" data-remove-product="${escapeHtml(x.product_id)}">Remove</button></div>`}).join(""):"<p>Your cart is empty.</p>";
 cartItems.querySelectorAll("[data-remove-product]").forEach(button=>button.addEventListener("click",()=>removeItem(button.dataset.removeProduct)));
 cartTotal.textContent=money(cart.reduce((s,x)=>s+(((products.find(p=>String(p.id)===x.product_id)||{}).price||0)*x.quantity),0));
}
function removeItem(id){cart=cart.filter(x=>x.product_id!==String(id));save()}
function toast(msg){const t=$("#toast");if(!t)return;t.textContent=msg;t.style.display="block";setTimeout(()=>t.style.display="none",1800)}
const categoryPill=$("#categoryPill");
const categoryPillLabel=$("#categoryPillLabel");
const categoryMenu=$("#categoryMenu");
if(categoryPill && categoryMenu && categoryPillLabel){
  categoryPill.onclick=()=>{const open=categoryMenu.classList.toggle("open");categoryPill.setAttribute("aria-expanded",open)};
  categoryMenu.querySelectorAll("button").forEach(btn=>btn.onclick=()=>{const value=btn.dataset.value;categoryPillLabel.textContent=btn.textContent;categoryMenu.classList.remove("open");categoryPill.setAttribute("aria-expanded","false");renderProducts(value)});
  document.addEventListener("click",e=>{if(!categoryPill.contains(e.target)&&!categoryMenu.contains(e.target)){categoryMenu.classList.remove("open");categoryPill.setAttribute("aria-expanded","false")}});
}
document.querySelectorAll(".categories a").forEach(a=>a.addEventListener("click",()=>{setTimeout(()=>renderProducts(a.dataset.filter),0)}));
const cartButton=$("#cartButton"),closeCart=$("#closeCart"),cartDrawer=$("#cartDrawer"),checkoutButton=$("#checkoutButton");
if(cartButton&&cartDrawer)cartButton.onclick=()=>{cartDrawer.classList.add("open");cartDrawer.setAttribute("aria-hidden","false")};
const cartQuery=new URLSearchParams(location.search);
if(cartQuery.get("openCart")==="1" && cartDrawer){
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden","false");
}
if(closeCart&&cartDrawer)closeCart.onclick=()=>{cartDrawer.classList.remove("open");cartDrawer.setAttribute("aria-hidden","true")};
if(cartDrawer&&closeCart)cartDrawer.addEventListener("click",e=>{if(e.target.id==="cartDrawer")closeCart.click()});
const checkoutDialog=$("#checkoutDialog"),closeCheckout=$("#closeCheckout"),checkoutForm=$("#checkoutForm"),checkoutSubmit=$("#checkoutSubmit"),checkoutErrors=$("#checkoutErrors"),checkoutStatus=$("#checkoutStatus");
let checkoutReturnFocus=null;
function setCheckoutOpen(open){
 if(!checkoutDialog)return;
 if(open)checkoutReturnFocus=document.activeElement;
 checkoutDialog.classList.toggle("open",open);
 checkoutDialog.setAttribute("aria-hidden",String(!open));
 for(const child of document.body.children)if(child!==checkoutDialog)child.inert=open;
 if(open)checkoutForm?.elements.first_name?.focus();
 else checkoutReturnFocus?.focus?.();
}
function formCustomer(form){
 const data=new FormData(form);
 return {
  email:data.get("email"),first_name:data.get("first_name"),last_name:data.get("last_name"),phone:data.get("phone"),
  shipping_address:{name:data.get("name"),address_line1:data.get("address_line1"),address_line2:data.get("address_line2"),city:data.get("city"),state:data.get("state"),postal_code:data.get("postal_code"),country:data.get("country")}
 };
}
function showCheckoutErrors(errors){
 if(!checkoutErrors)return;
 checkoutErrors.innerHTML=Object.values(errors).map(message=>`<p>${escapeHtml(message)}</p>`).join("");
}
function restoreCheckoutDraft(){
 if(!checkoutForm)return;
 try { const draft=JSON.parse(localStorage.getItem("nutrileaf-checkout-draft")||"{}"); for(const [name,value] of Object.entries(draft))if(checkoutForm.elements[name]&&typeof value==="string")checkoutForm.elements[name].value=value; } catch {}
}
function saveCheckoutDraft(){
 if(!checkoutForm)return;
 const draft=Object.fromEntries(new FormData(checkoutForm).entries());
 localStorage.setItem("nutrileaf-checkout-draft",JSON.stringify(draft));
}
if(checkoutButton)checkoutButton.onclick=()=>{
 if(!cart.length){toast("Your cart is empty");return}
 if(checkoutForm?.hidden){checkoutForm.hidden=false;checkoutForm.reset();checkoutStatus.textContent="";showCheckoutErrors({})}
 setCheckoutOpen(true);
};
if(closeCheckout)closeCheckout.onclick=()=>setCheckoutOpen(false);
if(checkoutDialog)checkoutDialog.addEventListener("click",event=>{if(event.target===checkoutDialog)setCheckoutOpen(false)});
if(checkoutForm){
 restoreCheckoutDraft();
 checkoutForm.addEventListener("input",saveCheckoutDraft);
 checkoutForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const request=createCheckoutRequest({cart,customer:formCustomer(checkoutForm)});
  const errors=validateCheckoutRequest(request);
  showCheckoutErrors(errors);
  if(Object.keys(errors).length)return;
  const fingerprint=checkoutFingerprint(request);
  let storedAttempt=null;
  try { storedAttempt=JSON.parse(localStorage.getItem("nutrileaf-checkout-attempt")||"null"); } catch {}
  const key=checkoutKeyFor(fingerprint,storedAttempt);
  localStorage.setItem("nutrileaf-checkout-attempt",JSON.stringify({fingerprint,key}));
  checkoutSubmit.disabled=true;
  checkoutSubmit.textContent="Creating pending order…";
  checkoutStatus.textContent="Submitting your TEST pending order.";
  const result=await submitCheckout({apiBase:API_BASE,body:request,idempotencyKey:key});
  checkoutSubmit.disabled=false;
  checkoutSubmit.textContent="Create pending order";
  const message=result.payload?.error?.message||result.payload?.message;
  if(result.action==="confirm"){
   const order=result.payload?.order||{};
   checkoutForm.hidden=true;
   checkoutStatus.innerHTML=`<div class="pending-confirmation"><strong>Pending order ${escapeHtml(order.order_number||"")} created</strong><p>Status: ${escapeHtml(order.status||"PENDING")}</p><p>Total: ${escapeHtml(order.currency||"USD")} ${money(Number(order.total||0)/100)}</p><p>Payment and fulfillment have not started.</p></div>`;
   cart=[];save();
   localStorage.removeItem("nutrileaf-checkout-attempt");
   localStorage.removeItem("nutrileaf-checkout-draft");
  }else if(result.action==="inline-error"){
   showCheckoutErrors({request:message||"Check the highlighted order details and try again."});
   checkoutStatus.textContent="The pending order was not created.";
  }else if(result.action==="refresh-catalog"){
   checkoutStatus.textContent="A cart item is no longer available. Returning to the refreshed cart.";
   setCheckoutOpen(false);
   await loadCatalog();
   if(cartDrawer){cartDrawer.classList.add("open");cartDrawer.setAttribute("aria-hidden","false")}
  }else if(result.action==="restart-attempt"){
   localStorage.removeItem("nutrileaf-checkout-attempt");
   checkoutStatus.textContent="This checkout attempt conflicts with an earlier request. Review the form and submit again to start a new attempt.";
  }else{
   checkoutStatus.textContent="The TEST service is temporarily unavailable. Retry to safely reuse this checkout attempt.";
  }
 });
}
const newsletterForm=$("#newsletterForm");
if(newsletterForm)newsletterForm.onsubmit=e=>{e.preventDefault();toast("Thanks for joining Nutrileaf!");e.target.reset()};
window.nutrileafProducts=products;
window.nutrileafAddToCart=addToCart;
window.nutrileafMoney=money;
window.nutrileafEscapeHtml=escapeHtml;
window.nutrileafCatalogReady=($("#products")||$("#productDetail"))?loadCatalog():Promise.resolve();
if($("#cartCount")&&$("#cartItems")&&$("#cartTotal"))renderCart();


/* CUSTOMER REVIEWS — cleaned Etsy review set */
const customerReviews=[{"id":1,"reviewer":"ThisUsernameKool","date":"07/28/2026","rating":5,"product":"Organic Sulfur Soap","text":"⭐⭐⭐⭐⭐ The Only Soap That Works for My Skin!\n\nI’ve been using this sulfur soap for almost 6 months now, and I’m extremely happy with the results. It has helped keep my pimples away, cleared up my acne, and has made a noticeable difference with my oily skin. My skin feels much cleaner and healthier, and I’ve had a hard time finding anything else that works as well for me.\n\nI also really like that it contains Manuka honey. I can’t say for certain which ingredient makes the biggest difference, but I feel like the combination of sulfur and Manuka honey has really helped my skin heal and stay clear.\n\nThis is honestly the only soap I’ve found that consistently works for my skin, and I plan to continue using it. If you struggle with acne or oily skin and are looking for a sulfur soap, I highly recommend giving this one a try! ⭐⭐⭐⭐⭐"},{"id":2,"reviewer":"Jasara Navarro","date":"07/27/2026","rating":5,"product":"Organic Moringa & Aloe Vera Soap","text":"Second time actually purchasing and loved the product"},{"id":4,"reviewer":"Patty","date":"06/29/2026","rating":5,"product":"Glutathione Milk Soap","text":"Amazing product! Quality made & excellent service! She answered my questions promptly & shipped it rt away! Definitely will buy from this shop again!"},{"id":7,"reviewer":"Kim","date":"06/22/2026","rating":5,"product":"Organic Sulfur Soap","text":"Best sulfer soap I have ever used. Leaves hair so soft when it dries. Literally corrected hair pH after one use. Had a slight breakout on cheek, scrubbed that with soap, gone in hours. I absolutely love it and recommend!"},{"id":8,"reviewer":"Kim","date":"05/15/2026","rating":5,"product":"Vanilla Essence Face and Body Butter","text":"This is my 4th time purchasing from Fe’s business. I have left a review on this soap before but leaving another one because I can’t get over how amazing her products are. I have tried other sulfur soaps from other brands but Fe’s is the most effective and has amazing formulation. My skin has noticeably gotten so much clearer and smoother with her products especially the sulfur soap. I also wear makeup and had a hard time removing it because my skin would breakout from micellar water, oil cleansers, and most foaming cleansers as I have quite sensitive skin. However, Fe’s sulfur soap lathers extremely well and removes makeup with ease on its own. Fe also added in extra soaps which I am so grateful for!! Thank you so much Fe!! I finally regained confidence after almost 9 years of constant stress from my acne."},{"id":9,"reviewer":"Jessica","date":"05/12/2026","rating":5,"product":"Hyaluronic Acid Body Serum (firming and moisturizing)","text":"I like this serum, I am purchasing more soon. I have to shake it up everytime I use it to keep the ingredients together but it makes my skin soft, and it smells good and is gentle on my skin. Im not sure about firming, I have to use it more to review about that. I wish the container was bigger and there was more serum, but I like the product."},{"id":10,"reviewer":"Jennifer","date":"05/12/2026","rating":5,"product":"Organic Sulfur Soap","text":"I'm hoping this sulpher soap will  be what I need for my skin. Thank you 😊"},{"id":11,"reviewer":"Eileen","date":"03/22/2026","rating":5,"product":"Organic Sulfur Soap","text":"This is a repeat order!\r\nVery happy with priduct"},{"id":12,"reviewer":"Bailey","date":"03/22/2026","rating":5,"product":"Hyaluronic Acid Body Serum (firming and moisturizing)","text":"Obsessed with this serum 😍 smells amazing but it’s super runny so the squeeze tube gets a little messy. A pump would be perfect for this!"},{"id":13,"reviewer":"Nic","date":"01/13/2026","rating":5,"product":"Organic Sulfur Soap","text":"Soap has cleared up my hormonal acne, as described! Very happy. Highly recommend seller."},{"id":14,"reviewer":"Deborah","date":"01/09/2026","rating":5,"product":"Exfoliating AHA Facial Toner","text":"This toner made my acne better"},{"id":15,"reviewer":"Glenda","date":"01/07/2026","rating":5,"product":"Organic Aloe Vera and Ginger Hair Mask with Hyaluronic Acid","text":"Tried this past wash day really like the smell"},{"id":16,"reviewer":"Endiyah","date":"01/06/2026","rating":5,"product":"Organic Sulfur Soap","text":"Great soap this is my second purchase."},{"id":17,"reviewer":"Michael Alvarez","date":"01/05/2026","rating":4,"product":"Organic Sulfur Soap","text":"Nice soap but expensive for small size"},{"id":18,"reviewer":"Kim","date":"12/27/2025","rating":5,"product":"Exfoliating AHA Facial Toner","text":"I’ve been having persistent bumps mainly on forehead and chin for almost a year now and I saw significant improvement after 2 days of use. I am usually very cautious of using AHA because I have had bad experiences with other AHA products. However I have bought Fe’s soaps and they have been so gentle but effective that I decided to give the toner a shot and it is amazing! I highly recommend this toner along with her soaps especially for those with acne, sensitive and dry skin, and redness. Thank you Fe for the amazing products and great customer service!"},{"id":19,"reviewer":"Kim","date":"12/06/2025","rating":5,"product":"Organic Sulfur Soap","text":"I was struggling with acne for 8 years and I tried everything. I spent so much on skincare products that never worked and used tretinoin, which did not help at all. I gave sulfur soap a chance and my skin has never been this clear. I used it less than a week, but the improvements I have seen in my skin are incredible. Thank you so much Fe!"},{"id":20,"reviewer":"Eileen","date":"12/05/2025","rating":5,"product":"Organic Sulfur Soap","text":"Item is great, but didn't ship for 10 days until I messaged selker"},{"id":21,"reviewer":"Roma","date":"11/01/2025","rating":4,"product":"Organic Sulfur Soap","text":"Good product, not really sure if it’s helping with rosacea"},{"id":23,"reviewer":"Shelly","date":"08/06/2025","rating":4,"product":"Organic Sulfur Soap","text":"It is a nice size and has a pleasnt natural smelling scent I have to use it for a test result but so far so good"},{"id":24,"reviewer":"Brittney","date":"06/23/2025","rating":5,"product":"Organic Sulfur Soap","text":"For people not aware about sulphur, sulphur soap smells. It's not a super pleasant smell. I knew that going in. But to the meat of the review... I love this soap. My face feels so clean and fresh! The smell doesn't linger on the skin at all in case anyone was worried. My acne (due to summer heat) is clearing up and less is coming in. I use it once a day. I've had sulphur soap before and it was lumpy and scratchy. This is a very smooth bar. It will not scratch your face if you put it directly to your skin. Overall, a fantastic bar of soap! I wish I bought more."},{"id":29,"reviewer":"Kristine","date":"06/14/2025","rating":5,"product":"Organic Sulfur Soap","text":"soap works great I recommend"},{"id":30,"reviewer":"Brannon","date":"05/28/2025","rating":5,"product":"Organic Sulfur Soap","text":"Stinks but doesn’t make my skin stink, Clears my skin & makes me feel good ."},{"id":31,"reviewer":"Carley","date":"05/14/2025","rating":5,"product":"Organic Sulfur Soap","text":"Arrived wrapped in plastic wrap to protect it and came with a free sample. The soap itself smells good!"},{"id":32,"reviewer":"Brendon","date":"04/10/2025","rating":5,"product":"Organic Sulfur Soap","text":"awesome! so far, so good."},{"id":33,"reviewer":"Aurelie","date":"03/27/2025","rating":5,"product":"Glutathione Milk Soap","text":"Very nice soap, helps exfoliate and brighten dark spots."},{"id":34,"reviewer":"Maria Morales","date":"03/11/2025","rating":5,"product":"Gluta-Kojic Beauty Soap","text":"Mis manchas en mi cara se an aclarado, ya no se ven tan obscuras, este producto a llenado mis expectativas!! Excelente !"},{"id":36,"reviewer":"Tanner","date":"02/24/2025","rating":5,"product":"Organic Sulfur Soap","text":"BEST ACNE KILLING SOAP EVER"},{"id":37,"reviewer":"Saren","date":"02/10/2025","rating":5,"product":"Organic Sulfur Soap","text":"Bought for Demodex mites issue / rosacea. It works really well. It doesn't smell bad (and i am super sensitive to smells), it does dry out your skin (its supposed to) so you have to use moisturizer (I recommend Vanicreme) and you will get more pustules for about 2 weeks+ as the mites die off. I am on day 14 of using 2x a day and I have had no new pustules for 3 days. My pores are smaller and my mites issue on my eyes is better. They say you have to use at least 2 months because the mites have a life cycle and you have to kill the eggs too. Thank you for offering this and for quick shipping!"},{"id":38,"reviewer":"Maria Morales","date":"02/01/2025","rating":5,"product":"Glutathione Milk Soap","text":"Excelente calidad, superó mis expectativas,  mucho más cremoso q cualquier otro jabón, dejando mi piel súper humectada!! Lo recomiendo muchísimo!"},{"id":39,"reviewer":"AJ","date":"02/01/2025","rating":5,"product":"Glutathione Milk Soap","text":"This soap is so luxurious. The lather is to die for. It cleanses so well. It removed makeup residue from last night and left my skin so soft and smooth. Highly recommend 10/10"},{"id":40,"reviewer":"amytimco","date":"12/15/2024","rating":5,"product":"Organic Sulfur Soap","text":"The seller popped an extra bar into my package as a Christmas surprise! I can tell this is a very high quality soap. Thank you!"},{"id":41,"reviewer":"April","date":"12/13/2024","rating":5,"product":"Organic Sulfur Soap","text":"Great hand-crafted sulphur soap, lovely seller."},{"id":42,"reviewer":"Sign in with Apple user","date":"11/05/2024","rating":5,"product":"Organic Sulfur Soap","text":"Great soap. Works well for intended purpose."},{"id":45,"reviewer":"Udaya","date":"03/04/2024","rating":4,"product":"Glutathione & Kojic Soap","text":"This soap is really good interns of quality and it rely worked what they hav promised..."},{"id":46,"reviewer":"Haley","date":"02/14/2024","rating":5,"product":"Organic Sulfur Soap","text":"Super quick shipping! Only used once so far but my skin feels softer already"},{"id":47,"reviewer":"Seneida","date":"02/01/2024","rating":5,"product":"Organic Sulfur Soap","text":"Natural high quality ingredients. It's exactly what my skin needed to heal a facial rash doctors couldn't help me with. Thank you so much!!"},{"id":52,"reviewer":"Linda Cortez","date":"01/18/2024","rating":5,"product":"Organic Sulfur Soap","text":"Awesome soap love it definitely ordering again !!"},{"id":55,"reviewer":"Professor Joed","date":"01/05/2024","rating":5,"product":"Organic Sulfur Soap","text":"The soap really helps treat my eczema, would recommend to anyone who has problems with atopic dermititis!"},{"id":57,"reviewer":"Lisa","date":"12/13/2023","rating":5,"product":"High Quality 4 leaf lucky clover necklace (in red ,green,blue and pink)","text":"Beautiful piece and good quality"},{"id":58,"reviewer":"Charyse","date":"12/09/2023","rating":5,"product":"Organic Sulfur Soap","text":"Exactly as advertised and is working great so far!"},{"id":59,"reviewer":"lclark167","date":"12/02/2023","rating":5,"product":"Exfoliating AHA Facial Toner","text":"Large pores closed almost instantaneously!"},{"id":60,"reviewer":"Rebekah","date":"11/13/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Amazing! Clears my hyperpigmentation, brightens my skin, and clears all those pesky dark marks!"},{"id":61,"reviewer":"Stephen","date":"11/05/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"The quality of the soap was great. It lathered perfectly and wasn't too abrasive. It left my skin smooth and clear after every use. I highly recommend it to everyone who is able to use it."},{"id":62,"reviewer":"Rebekah","date":"10/20/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"It's smelly as expected because it literally had Sulphur, so I just shower with cold water when I use it. It's helping my hyperpigmentation and my body acne ALOT. Definitely recommend."},{"id":64,"reviewer":"MOMMYDEALS","date":"09/14/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Great!  no problems getting my soap in fast timing"},{"id":65,"reviewer":"Udaya","date":"09/11/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Worth to buy....my skin is really getting better day by day after using this soap...I had fungal infection now it's a relief that having this soap...thank you so much, 💖🙏"},{"id":76,"reviewer":"𝔳𝔞𝔪𝔭𝔦𝔯𝔞","date":"07/19/2023","rating":5,"product":"Underarm Whitening Cream","text":"I have used this cream about a handful of times and definitely see my underarms becoming brighter! The cream feels  amazing on my skin and smells fresh! I have tried everything under the sun, but this is the only one truly working for me, I'll definitely be back for more, thank you so much!!!!"},{"id":77,"reviewer":"Rachel","date":"07/02/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"This cleared my stubborn acne amazingly well!!! Getting ready to purchase my second bar just so I don’t run out!"},{"id":79,"reviewer":"AJ","date":"06/28/2023","rating":5,"product":"Glutathione & Kojic Soap","text":"This soap 🧼 is like no other, so luxurious. It brightens and moisturizes your skin effortlessly day by day. Combined with the cream it gives you a beautiful luminous complexion."},{"id":84,"reviewer":"Michelle","date":"04/17/2023","rating":5,"product":"Glutathione & Kojic Soap","text":"I love this bar soap it has helped me light up my dark spots. This bar is made of good quality. Shipping and customer service are excellent."},{"id":85,"reviewer":"Professor Joed","date":"04/15/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Can't recommend this soap highly enough! Kept my skin treated for my eczema!"},{"id":87,"reviewer":"Patrick","date":"03/30/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I’ve been using this soap consistently now ,before I was so lazy to used it ,I tried and stop and then I tried again ..this time I can see a big improvement on my face eczema because I’m using it daily .I had eczema since I was In highschool and it’s getting worse and worse,I tried different soaps and creams from doctors prescription nothing of them really works.Thank you Nutrileaf and May God continue bless your hands."},{"id":88,"reviewer":"AJ","date":"03/25/2023","rating":5,"product":"Hyaluronic Acid Body Serum","text":"This is the best serum I have used in my ENTIRE LIFE, Fe was so kind she made a body size serum, so my body gets the same benefits as my face. I have been looking for solutions for my dehydrated skin and Fe created one. Im constantly getting compliments on how smooth my skin is. My skin is the smoothest and softest it has ever been. This serum has changed my life and I will continue to use it forever."},{"id":89,"reviewer":"Janelly","date":"03/02/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I’ve purchased these soaps multiple and will continue to do so. The sulfur soap works so good on my skin. The only soap i use on my face and leaves it glowing. These soaps are the best!!"},{"id":94,"reviewer":"Professor Joed","date":"02/16/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I've had eczema since I was young and there are very few soaps that help me treat my condition. This is one of them. I highly recommend using this soap to treat eczema!"},{"id":95,"reviewer":"Michelle","date":"01/25/2023","rating":5,"product":"Retinol & Hyaluronic Acid Overnight Skin Repair Cream","text":"I love all of her products. I perform facials and her products are on my number one list for my clients. Great service."},{"id":96,"reviewer":"Ira","date":"01/12/2023","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Amazing product and I loved the hand written note!"},{"id":97,"reviewer":"betty","date":"12/06/2022","rating":5,"product":"Retinol & Hyaluronic Acid Overnight Skin Repair Cream","text":"YES YES AND YES !!!!"},{"id":98,"reviewer":"Pamela","date":"11/26/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"This soap is Awesome! The Very Best ingredients ! Amazing for skin !!! Love it !!! So glad I stocked up ! Will Absolutely be back for more !! Super Fast Shipping and Customer Service! Highly Recommend!!! Thank You So Much !!! Happy Holidays!!❤❤😘🤗🎄🎄🎄"},{"id":99,"reviewer":"Kenya","date":"11/18/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I haven't used it yet but i did receive it in a timely fashion thank u"},{"id":100,"reviewer":"jaylas13","date":"11/12/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Great product need a small bar"},{"id":101,"reviewer":"Janelly","date":"10/21/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Love these soaps. Have purchased many times and they always get the job done. Great for acne. Will be purchasing again soon."},{"id":102,"reviewer":"shel","date":"10/20/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I ordered the sulpher soap from her before and loved how it helped with my skin issues. I have started to buy for family and friends as well.  (Thank you for the gift)\nIf you want something that will help you skin heal or if you bumps or something you have been trying to heal your skin, this is the soap yall need!!!  Yall will not regret it!!!"},{"id":103,"reviewer":"shel","date":"10/20/2022","rating":5,"product":"Organic Tawas-Kalamansi Scar Eraser Soap)anti-acne, whiten-your dark under arm ,inner thighs)scar eraser soap","text":"Yall I usually don't rave about products BUT she has AMAZING soaps that really help and do so many things!!! I have started to buy for family and friends, because of the benifits that help with the skin in many ways."},{"id":106,"reviewer":"Patrick","date":"10/07/2022","rating":5,"product":"Ginger & Turmeric Slimming Hot Cream","text":"I liked the product it helped on my back pain and my arms .\nGood job Nutrileaf \nGod bless you more"},{"id":108,"reviewer":"lclark167","date":"10/06/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Works so good! I had a rash on my fingers from an allergic reaction for months. I was trying all sorts of things to clear it up. It would only move the rash around instead of clear it up. I used this and the rash disappeared the next day!!! So happy I found it 🥰"},{"id":109,"reviewer":"Leonila","date":"09/17/2022","rating":5,"product":"Ginger & Turmeric Slimming Hot Cream","text":"I really like this ginger slimming hot cream i used this on my stomach before i went to bed and in the morning i used this also before I exercise and it helps me sweat a lot and its burning my fats i guess .I rub this cream also in my back ,knees and shoulders it helps my arthritis and sciatica.Great product and thank for making this product.God bless Nutrileaf❤️❤️❤️"},{"id":111,"reviewer":"Janelly","date":"06/22/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I’ve purchased this soap many times and it never fails to satisfy my needs. I use it for both my face and body and it doesn’t disappoint. Haven’t broken out once since I’ve purchased this soap. Definitely will continue to purchase!"},{"id":114,"reviewer":"amyhearts1","date":"05/07/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Love this soap! Works great, love the clean organic ingredients. Helped my teen clear up their acne. Thanks!!!!!!!"},{"id":116,"reviewer":"Maria Morales","date":"04/22/2022","rating":5,"product":"Hemp Facial Serum(anti-aging,rejuvenating,glowing)","text":"Lo eh usado ya por una semana y mi piel se muestra brillante!!mas juvenil!!"},{"id":119,"reviewer":"Maria Morales","date":"04/22/2022","rating":5,"product":"Hemp Facial Day Cream(anti-aging,anti-oxidants,hydrating,moisturizing)","text":"Mi piel se mantiene humectada todo el día!!"},{"id":123,"reviewer":"Amparo Aldana","date":"03/14/2022","rating":5,"product":"Glutathione & Kojic Acid Skin whitening and skin tightening Soap","text":"Its been 2 1/2 year i been using this one and i am amazed of the result too my skin. And introduce more friendly by using it uswell. And how too order on it online at etsy online."},{"id":124,"reviewer":"Inactive Etsy Member","date":"03/11/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Amazing. Was looking forward to this product. Blessings and Good Fortune be with you in everything that you do.✨✨✨"},{"id":125,"reviewer":"Amparo Aldana","date":"02/24/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Actually my friend recommended me this shop because her 2 sisters have a very bad eczema and after using this Sulfur soaps she said the dermatologist told them to keep continue using this sulfur instead of prescribing another cream.So I tried and order 6 bars of them and luckily my winter cold rashes was gone I think is because of the weather changes too .\nThanks Nutrileaf it really helps on my arms and hand that super itchy lately."},{"id":126,"reviewer":"John","date":"02/18/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I just love this well made soap"},{"id":127,"reviewer":"Yosha","date":"02/12/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"Got this for my pops psoriasis  skin heard sulfur does wonders he just started using it so far so good.\nThank you"},{"id":132,"reviewer":"Virginia","date":"02/04/2022","rating":5,"product":"Kojic Acid Peppermint Soaps","text":"I like my whitening soaps I’ve been using this whitening soaps for almost two years now and I can see the big difference on my skin before and after. I used to have a lot of pimples and pimple marks on my skin and my daughter also has hormonal acne but now she really loves her her skin same as her mommy. Thanks to the owner of Nutrileaf keep up the good work. Your products are awesome and I will definitely continue using this effective soaps and I will highly recommend this product too. Thanks also for the extra gift the sulfur soaps it will help fighting the virus."},{"id":133,"reviewer":"Candy","date":"01/24/2022","rating":5,"product":"Retinol & Hyaluronic Acid Overnight Skin Repair Cream","text":"|Seller is very nice she pack up a few goodies I wasn`t expecting I will do a follow up on how the cream work for me."},{"id":134,"reviewer":"kemory","date":"01/17/2022","rating":5,"product":"Sulfur Anti-bacterial and antifungal Hand Soap","text":"Exactly as advertised"},{"id":135,"reviewer":"Edna","date":"12/30/2021","rating":5,"product":"Glutathione & Kojic Acid Skin whitening and skin tightening Soap","text":"Great customer service. My order came really quick and fast. I will definitely order more again and tell my friends to order from Nutrileaf. Thank you keep up the good work and more blessings..."},{"id":136,"reviewer":"Haleg","date":"12/28/2021","rating":5,"product":"Sulfur Anti-bacterial and antifungal Soap","text":"I love this soap. After I use my cera ve salicylic acid cleanser, I put this on my face and leave it on for about two minutes and then wash it off. Heads up it does get stiff on your face But I don’t mind because it lets me know that its working. I’ve only used it one time but I can say it has already made my face so much smoother and I’m hoping that with continued use it’ll get rid of acne. And can I just say the ingredients in this soap are just amazing. Love this soap!!!"},{"id":138,"reviewer":"Janelly","date":"10/20/2021","rating":5,"product":"Sulfur Anti-bacterial and antifungal Hand Soap","text":"Love this soap, helped with body acne, my strawberry legs and even relieved dark spots. Definitely will be purchasing again!"},{"id":142,"reviewer":"Maria Morales","date":"06/17/2021","rating":5,"product":"Organic Sulfur Soap","text":"Eh usado este jabón tan solo dos veces y es increíble la suavidad en mi piel!"},{"id":143,"reviewer":"Maria Morales","date":"06/14/2021","rating":5,"product":"3D Toothpaste Holder","text":"No more waste!! And very practical!! And it doesn’t take a lot space!"},{"id":144,"reviewer":"Maria Morales","date":"06/14/2021","rating":5,"product":"Organic Activated Charcoal Soap Bar","text":"Este jabón me a ayudado a limpiar   Mi piel a desintoxicar! A eliminar impurezas como black heads!"},{"id":146,"reviewer":"Maria Morales","date":"05/16/2021","rating":5,"product":"Tea Tree & Organic Aloe Vera Shampoo Bar","text":"Excelente calidad!!! Súper para cabello grasoso"},{"id":148,"reviewer":"Katherine","date":"04/18/2021","rating":5,"product":"Sulfur Anti-bacterial and antifungal Hand Soap","text":"Great item! Good quality. Packaging was greats well."},{"id":149,"reviewer":"Marcy","date":"04/15/2021","rating":5,"product":"Retinol+Rose Water-Collagen Peptide Day Cream","text":"great customer service, great product so far!  I will definitely order again!"},{"id":150,"reviewer":"Maria Morales","date":"04/06/2021","rating":5,"product":"3D Lifesaver Soap Dish","text":"Very handy and useful! I love my black color"},{"id":151,"reviewer":"Angie","date":"03/31/2021","rating":5,"product":"Sulfur Anti-bacterial and antifungal Hand Soap","text":"Gotta try it more, but it got here very fast."},{"id":152,"reviewer":"Michelle","date":"02/13/2021","rating":5,"product":"Exfoliating AHA Facial Toner","text":"I use this face toner for makeup remover. I love how refreshing it leaves my face."},{"id":153,"reviewer":"Michelle","date":"02/13/2021","rating":5,"product":"Glutathione+Kojic+Papaya Soap","text":"I love this soap it has help so much with my dark spots. I have been using for about 1yr as well. I no longer use regular body soap."},{"id":154,"reviewer":"Michelle","date":"02/13/2021","rating":5,"product":"Kojic Acid & Collagen Peptides Body Lotion","text":"I love this lotion I been using this lotion for 1yrs and it has made a big difference on my skin"},{"id":155,"reviewer":"Maria Morales","date":"02/11/2021","rating":5,"product":"Retinol & Hyaluronic Acid Overnight Repair Cream","text":"Me encanta esta crema para la noche, super humectante, muy cremosa!! Lo mejor es que en la mañana tu piel está aún muy hidratada!! Muy buenos resultados!"},{"id":156,"reviewer":"Maria Morales","date":"02/10/2021","rating":5,"product":"Retinol & Hyaluronic Acid Night Serum","text":"Eh usado el Serum por casi dos meses y mi piel se ve mucho mejor!! Esta mas humectada y mis manchas de mi cara se an aclarado!! Estoy muy contenta con tus productos, Fe! Bendiciones!!"},{"id":157,"reviewer":"Michelle","date":"01/14/2021","rating":5,"product":"Glutathione +Kojic Acid & Papaya Collagen Peptides Skin Whitening and Skin Tightening Soap(anti- acne and pimple soap)","text":"I bought this bundle of soaps for me and my mom we love them. The face mask gives me acne so this has helping my face."},{"id":158,"reviewer":"Mama","date":"01/01/2021","rating":3,"product":"Retinol & Hyaluronic Acid Night Serum","text":"I don't have any complaints, but I had to come back to Etsy to read the details because I forgot what it was supposed to do. I haven't seen any noticeable change in my skin yet. I purchased it to help lighten the dark spots left by this darn Mask-ne. My chin looks really bad with all kinds of scar tissue, dark spots, and fresh pimples coming up all the time. I have a cleansing routine to minimize new outbreaks and bought this serum to try to clear up the dark spots. Maybe it's doing something? but I just can't tell yet. On a positive note, it smells really nice and seems to absorb into my skin easily. I feel a slight tightening after its dried. I guess that a good thing? Also, I should note that I don't put this on before bedtime, but rather I use it daily before going in to work at night."},{"id":160,"reviewer":"Aicha","date":"12/10/2020","rating":5,"product":"Kojic Acid & Collagen Peptides Skin Whitening and Skin Tightening Body Lotion","text":"I just started using today after a week I will come back"},{"id":161,"reviewer":"Vergz","date":"10/25/2020","rating":5,"product":"Glutathione +Kojic Acid & Papaya Collagen Peptides Skin Whitening and Skin Tightening Soap(anti- acne and pimple soap)","text":"Me and my Daughter has skin problems so I tried this soaps And I was so impressed the results after two weeks of using it\nAnd my daughter’s acne have cleared up too😁I must continue using this glutathione and Kojic acid skin whitening soaps it’s worth it the price ...in just two weeks you will see improvement\nThanks To the Owner of Nutrileaf...she’s so approachable and knowledgeable in regards to skin problems .I would highly recommend this store ❤️"},{"id":162,"reviewer":"Dulce Rios","date":"09/26/2020","rating":5,"product":"Exfoliating AHA Facial Toner","text":"I will like to thank Fe and also congratulate her for formulating the AHA toner my skin absolutely loves it.I am on my 4th bottle now and the results are amazing.I have notice  a dramatic change on my skin and dark spots are getting lighter well of course I'm also using the Retinol night cream as well as the serum.I did not rate this product higher because it only goes up to 5 stars🤗"},{"id":166,"reviewer":"Michelle","date":"09/19/2020","rating":5,"product":"Retinol & Hyaluronic Acid Night Serum","text":"Love putting this serum on my face it's been helping me with tighten on my cheeks."},{"id":167,"reviewer":"Michelle","date":"09/19/2020","rating":5,"product":"Kojic Acid & Collagen Peptides Skin Whitening and Skin Tightening Body Lotion","text":"If you have dark spots between your legs this the cream I apply it 2x a day in the morning and at night after the shower.  It has help with skin tighten as well."},{"id":171,"reviewer":"Patrick","date":"09/06/2020","rating":5,"product":"Natural Deodorant Stick","text":"Smells soooo good and refreshing I requested the shop owner to make my deodorant in peppermint essential oil and also to make it with whitening 😁\nI need a rescue on my armpit😁thanks Nutrileaf I’m satisfied and happy with my natural deodorant stick .\nMore orders coming up ,,,your product is a great product I will highly recommended.Thanks again."},{"id":172,"reviewer":"Joanna Marie","date":"08/29/2020","rating":5,"product":"Exfoliating AHA Facial Toner","text":"This Exfoliating AHA Toner is super deep cleansing,it’s gently removed dirt,and makes my skin super refreshing and rejuvenating in my morning skin routine.I used this toner morning and evening😉"},{"id":173,"reviewer":"Dulce Rios","date":"08/29/2020","rating":5,"product":"Exfoliating AHA Facial Toner","text":"Second bottle of using the exfoliating toner and I am super excited for the wonderful results I simply love all the natural ingredients in it and rose water feels so refresh and pure and the smell is amazing.Nothing will ever compare this toner to store bought toners I recommend this toner and of course  will purchase more in the future."},{"id":174,"reviewer":"Dulce Rios","date":"08/29/2020","rating":5,"product":"Retinol & Hyaluronic Acid Night Cream","text":"I am very happy with the purchase of the Retinol acid night cream and night serum.My skin feels refresh every night but the real results are very obvious in the morning.My skin feels fresh,non oily which that's my biggest issue,soft,hydrated I simply feel young.Thank you and thank you again Fe🤗"},{"id":176,"reviewer":"Boogers","date":"08/27/2020","rating":5,"product":"Organic Henna-Moringa & Eucalyptus Shampoo Bar","text":"I heard Moringa is supposed to be an \"ancient beauty secret\" for hair growth, and I had actually been actively looking into henna powders to make my own shampoos. So the combo of these ingredients along with the price was irresistible! These bars are only mildly herby, in use the eucalyptus is a little more noticeable but not by much. It lathers easily and big. I'm so pumped about this bar that I bought THREE right out the gate. Since starting testosterone a few years back, my hairline is running away from me and I've scoured the internet trying to revive it; and with three bars to work through, I'm sure that I'll have the time to (hopefully) see improvements. THANK YOU!!!"},{"id":177,"reviewer":"Boogers","date":"08/26/2020","rating":5,"product":"Sulfur & Honey Eucalyptus-Peppermint Soap","text":"I'm having issues controlling the acne on my shoulders and arms so I got this bar in hopes that it would help since my charcoal isn't cuttin' it. The bar itself is GIANT, I actually cut it into thirds and was able to share with my gf (she has infamously dry skin and has found some relief with a plain sulfur soap). This bar STINKS- my mom thought it smelled good, but I can't smell anything other than sulfur. HOWEVER. It doesn't hinder my love for it, as I bought it /for/ the sulfur and eucalyptus. The lather was rich and creamy and it rinsed off easily, leaving my skin feeling clean. I'm hoping to see improvement in my acne issues, but as of right now I'm pretty pleased with this soap.\nEDIT: After a few uses, I can tell that my acne is MUCH more controlled and I'm having way fewer flair ups. 10/10!"},{"id":178,"reviewer":"Boogers","date":"08/26/2020","rating":5,"product":"Exfoliating AHA Facial Toner","text":"Extremely impressed with this toner. My skin feels SO soft and I can tell that the toner actually helped hydrate my skin. The ingredients are awesome- I've never seen this combo for a toner before. Overall, I found my new favorite toner and would DEFINITELY recommend."},{"id":179,"reviewer":"Boogers","date":"08/26/2020","rating":5,"product":"Kojic-Geranium-Honey-Goatmilk Soap","text":"I got these for my mom, as she has \"old lady skin\" and I figured she'd appreciate a soap with a lot of hydration and collagen added to it. Very great size, especially for the price. Thank you!"},{"id":180,"reviewer":"lakeisha","date":"08/25/2020","rating":5,"product":"Kojic Acid Peppermint Soaps","text":"Second day of using the soap and its already healing some of the bumps on my face! Been using it when I take a shower so the steam will help open up my pores better. I have the soap on the full length of my shower and I rinse with cool water. My skin never feels stripped and it's leaves my skin smooth. Once I see improvement in my dark stops I'll update this again 😊"},{"id":181,"reviewer":"Patrick","date":"08/19/2020","rating":5,"product":"Organic Henna-Moringa & Eucalyptus Shampoo Bar","text":"I used different brands of shampoo and some of my brands are very expensive,so I decided to try this shampoo bar which is affordable and I like the smells of it ,my hair feels super cleaned after and smooth,no need to use hair conditioner.Im happy and satisfied with my purchased and thankS again Nutrileaf on my kojic acid whitening soaps It is really working ,I will try whitening cream maybe next Time on my purchase."},{"id":182,"reviewer":"Dulce Rios","date":"08/19/2020","rating":5,"product":"Exfoliating AHA Facial Toner","text":"I purchased the exfoliatingAHA Facial Toner and I simply fell in love with it. My skin feels fresh,hydrated,clean to the last pore I am very,very satisfied with the product.The shop owner was nice enough to give me a free sample of the Retinol day cream wich I also tried for over a month and not only did my face feesl hydrated my make up lasts all day long and also have noticed the dark spots on my face are getting a little lighter.The shop owner recommend that I start using the Retinol night cream and night serum so I am very excited to start using them."},{"id":183,"reviewer":"Joanna Marie","date":"08/17/2020","rating":5,"product":"Retinol & Hyaluronic Acid Night Cream","text":"I’ve been using this retinol and cream combo for almost a month now.\nFirst I have a dry skin,and dark spots,black under eye area, and using this product I saw changes in my skin tone,first it’s Super hydrated and moisturized when I woke up in the morning.Second,my dark spots look lighter a little, maybe in a long time I’d use i can see the best result,and one thing I like on this product it’s made of non-toxic chemicals compared to branded and expensive serum and cream.Ive tried so many creams before but nothing works than this combo.Im happy for the results and it keep my skin looking healthy than before.Thanks Nutrileaf \nAnd also I’m grateful and thankful for the sulfur body wash,the shop owner give me a sample for my daughter who have eczema problem,and I can see it's getting better."},{"id":184,"reviewer":"Joanna Marie","date":"08/17/2020","rating":5,"product":"Organic Arnica Body Pain Reliever","text":"It helps relieved the  aches on my ankles and it smelles soo good \nIt has soothing and cooling effect I like it and it’s organic😉"},{"id":185,"reviewer":"amjh70","date":"08/16/2020","rating":5,"product":"Retinol-Collagen Peptide Day Cream","text":"I enjoy the outdoors and sunshine. My skin feels so soft and my has not peeled since I stated using the Retinol Collagen Peptide Day Cream. I also find my dark sun spots are getting lighter. I highly recommend this product. I look forward to purchasing other products soon. Fe uses all natural ingredients."},{"id":186,"reviewer":"Donna","date":"08/15/2020","rating":5,"product":"Natural Deodorant Stick","text":"The customer service is great!"},{"id":187,"reviewer":"Patrick","date":"08/11/2020","rating":5,"product":"Kojic Acid Skin Whitening and Skin Tightening Soaps","text":"I had a very bad acne scars and I’ve been using this kojic acid soap and it really works for me,it helps my acne scars lighter a little,maybe I have to continue using this soap until I got the best result.So far ,I’m So happy of the result at least it works for me.I will highly recommend this kojic acid soap and I will continue using this.Fast shipping and owner is so approachable.Thanks Nutrileaf"},{"id":188,"reviewer":"Inactive Etsy Member","date":"08/09/2020","rating":5,"product":"Kojic Acid Skin Whitening and Skin Tightening Soaps","text":"Left my skin feeling so soft and amazing! Professional texture and a little bit goes a long way! Super fast shipping as well!! Thanks again"},{"id":189,"reviewer":"Alma","date":"08/05/2020","rating":5,"product":"Retinol-Collagen Peptide Day Cream","text":"I have been using the Retinol & Hyaluronic serum and cream combo for about a week and I love how my skin feels hydrated and moisturized when I wake up. Thanks Fe!"},{"id":190,"reviewer":"Michelle","date":"07/25/2020","rating":5,"product":"Retinol-Kojic Acid & Glutathione Facial Cream","text":"I love this Retinol it has helped me with dark spots on my face and making my face feel rejuvenated. Love all the products so far. Will continue to purchase from this seller. Thank you Fe."},{"id":191,"reviewer":"Michelle","date":"07/25/2020","rating":5,"product":"Sulfur-Anti-Acne Soaps","text":"After wearing the Face mask I broke out with Acne very bad. One week of using Sulfur soap and it's been helping with my Acne. Thank you Fe😊"},{"id":192,"reviewer":"Michelle","date":"07/25/2020","rating":5,"product":"Kojic Acid Peppermint Soaps","text":"I love the way this bar soap makes my skin especially with Pepper mint. It feels so refresh. Thank Fe love your product."},{"id":193,"reviewer":"Dulce Rios","date":"07/25/2020","rating":5,"product":"Kojic Acid Peppermint Soaps","text":"I really recommend the kojic acid peppermint soaps.My skin feels soft,fresh,and also moisturized to the fullest.I cannot wait to purchase more of the whitening soaps I also got a free sample of the Retinol cream and it felt so smooth on my skin and neck.I love using foundation and with the face cover I was very impress of the non oily sensation on my face.The supplier is very easy to reach and I loved that she responded to the questions I had over future products I will like to order.I am very excited ii found this natural organic products on etsy."},{"id":194,"reviewer":"Dulce Rios","date":"07/25/2020","rating":5,"product":"Organic Arnica Body Pain Reliever","text":"The organic arnica did really worked for me after a long day at work and the walking my feet and legs were in so much pain.I applied the arnica before bedtime and I could not believe the next morning I felt no more pain.I am so happy for this purchase I made my feet and legs are so happy now."}];
const reviewState={rating:"All",product:"All",visible:6};
const reviewGrid=document.querySelector("#reviewGrid");
const reviewProductFilter=document.querySelector("#reviewProductFilter");
const reviewsMore=document.querySelector("#reviewsMore");
const reviewsLess=document.querySelector("#reviewsLess");
const reviewsEmpty=document.querySelector("#reviewsEmpty");

function reviewStars(rating){
  return "★★★★★".slice(0,rating)+"☆☆☆☆☆".slice(0,5-rating);
}
function reviewFiltered(){
  return customerReviews.filter(r=>
    (reviewState.rating==="All" || String(r.rating)===String(reviewState.rating)) &&
    (reviewState.product==="All" || r.product===reviewState.product)
  );
}
function renderReviewProducts(){
  if(!reviewProductFilter)return;
  const products=[...new Set(customerReviews.map(r=>r.product))].sort((a,b)=>a.localeCompare(b));
  reviewProductFilter.innerHTML='<option value="All">All Products</option>'+
    products.map(p=>`<option value="${p.replace(/"/g,'&quot;')}">${p}</option>`).join("");
  reviewProductFilter.value=reviewState.product;
}
function renderReviews(){
  if(!reviewGrid)return;
  const list=reviewFiltered();
  const visible=list.slice(0,reviewState.visible);
  reviewGrid.innerHTML=visible.map(r=>`
    <article class="review-card" tabindex="0" role="button" aria-label="Read full review from ${r.reviewer}">
      <div class="review-card-top">
        <span class="review-card-stars" aria-label="${r.rating} out of 5 stars">${reviewStars(r.rating)}</span>
        <span class="etsy-mark">Etsy Review</span>
      </div>
      <p class="review-text">${r.text.replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p>
      <div class="review-card-bottom">
        <strong>${r.reviewer.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</strong>
        <span>${r.product.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>
        <span class="review-date">Reviewed: ${r.date}</span>
      </div>
      <span class="review-read-more">Read full review →</span>
    </article>
  `).join("");
  reviewsEmpty.hidden=list.length!==0;
  reviewsMore.hidden=visible.length>=list.length || list.length===0;
  reviewsLess.hidden=reviewState.visible<=6 || list.length===0;
}
document.querySelectorAll(".review-filter").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".review-filter").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    reviewState.rating=btn.dataset.rating;
    reviewState.visible=6;
    renderReviews();
  });
});
if(reviewProductFilter){
  reviewProductFilter.addEventListener("change",e=>{
    reviewState.product=e.target.value;
    reviewState.visible=6;
    renderReviews();
  });
}
function updateReviewsAndKeepControlsInPlace(nextVisible){
  const controls=document.querySelector(".reviews-pagination");
  const anchorTop=controls ? controls.getBoundingClientRect().top : null;
  const grid=document.querySelector("#reviewGrid");

  if(grid){
    grid.classList.add("reviews-changing");
  }

  reviewState.visible=nextVisible;
  renderReviews();

  if(grid){
    requestAnimationFrame(()=>{
      grid.classList.remove("reviews-changing");
      grid.classList.add("reviews-settled");
      window.setTimeout(()=>grid.classList.remove("reviews-settled"),220);
    });
  }

  if(anchorTop!==null){
    const newTop=controls.getBoundingClientRect().top;
    window.scrollBy({top:newTop-anchorTop,left:0,behavior:"smooth"});
  }
}
if(reviewsMore){
  reviewsMore.addEventListener("click",()=>{
    updateReviewsAndKeepControlsInPlace(reviewState.visible+6);
  });
}
if(reviewsLess){
  reviewsLess.addEventListener("click",()=>{
    updateReviewsAndKeepControlsInPlace(Math.max(6,reviewState.visible-6));
  });
}
renderReviewProducts();
renderReviews();


/* Full review modal */
const reviewModal=document.createElement("div");
reviewModal.className="review-modal";
reviewModal.setAttribute("aria-hidden","true");
reviewModal.innerHTML=`
  <div class="review-modal-overlay" data-review-close></div>
  <div class="review-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle">
    <button type="button" class="review-modal-close" aria-label="Close review" data-review-close>×</button>
    <div class="review-modal-stars" id="reviewModalStars"></div>
    <p class="review-modal-eyebrow">CUSTOMER REVIEW</p>
    <h3 id="reviewModalTitle"></h3>
    <div class="review-modal-divider" aria-hidden="true"><span>◆</span></div>
    <p class="review-modal-product" id="reviewModalProduct"></p>
    <p class="review-modal-date" id="reviewModalDate"></p>
    <div class="review-modal-body" id="reviewModalBody"></div>
  </div>`;
document.body.appendChild(reviewModal);

let reviewModalLastFocus=null;
function openReviewModal(review){
  reviewModalLastFocus=document.activeElement;
  document.querySelector("#reviewModalStars").textContent=reviewStars(review.rating);
  document.querySelector("#reviewModalTitle").textContent=review.reviewer;
  document.querySelector("#reviewModalProduct").textContent=review.product;
  document.querySelector("#reviewModalDate").textContent="Reviewed: "+review.date;
  document.querySelector("#reviewModalBody").innerHTML=review.text.replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
  reviewModal.classList.add("open");
  reviewModal.setAttribute("aria-hidden","false");
  document.body.classList.add("review-modal-open");
  reviewModal.querySelector(".review-modal-close").focus();
}
function closeReviewModal(){
  reviewModal.classList.remove("open");
  reviewModal.setAttribute("aria-hidden","true");
  document.body.classList.remove("review-modal-open");
  if(reviewModalLastFocus) reviewModalLastFocus.focus();
}
reviewGrid.addEventListener("click",e=>{
  const card=e.target.closest(".review-card");
  if(!card) return;
  const cards=[...reviewGrid.querySelectorAll(".review-card")];
  const visible=reviewFiltered().slice(0,reviewState.visible);
  const index=cards.indexOf(card);
  if(index>=0 && visible[index]) openReviewModal(visible[index]);
});
reviewGrid.addEventListener("keydown",e=>{
  if(e.key!=="Enter" && e.key!==" ") return;
  const card=e.target.closest(".review-card");
  if(!card) return;
  e.preventDefault();
  const cards=[...reviewGrid.querySelectorAll(".review-card")];
  const visible=reviewFiltered().slice(0,reviewState.visible);
  const index=cards.indexOf(card);
  if(index>=0 && visible[index]) openReviewModal(visible[index]);
});
reviewModal.addEventListener("click",e=>{
  if(e.target.closest("[data-review-close]")) closeReviewModal();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && reviewModal.classList.contains("open")) closeReviewModal();
});
