function decorateProductCards(){
  const container=document.querySelector('#products');
  if(!container)return;
  for(const card of container.querySelectorAll('.product[data-product-id]')){
    if(card.querySelector('.product-details-link'))continue;
    const id=card.dataset.productId;
    const name=card.querySelector('h3')?.textContent?.trim()||'product';
    const row=card.querySelector('.product-row');
    if(!id||!row)continue;
    const link=document.createElement('a');
    link.className='product-details-link';
    link.href=`product.html?id=${encodeURIComponent(String(id))}`;
    link.textContent='View details';
    link.setAttribute('aria-label',`View details for ${name}`);
    const add=row.querySelector('.add');
    row.insertBefore(link,add||null);
  }
}

const products=document.querySelector('#products');
if(products){
  const observer=new MutationObserver(decorateProductCards);
  observer.observe(products,{childList:true});
  try{
    await window.nutrileafCatalogReady;
  }catch{
    // The existing catalog error state remains authoritative.
  }
  decorateProductCards();
}
