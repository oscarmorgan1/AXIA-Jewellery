/* /genuine serial lookup, used by the page's search (window.axiaGenuineLookup).
   Asks the server (server/genuine.js), which returns only the public side of a
   sold piece's record: product name, variant and id, the purchase date, and how
   many owners it has had. Resolves to
   { name, variant, productId, purchasedAt, owners, ownerSince } for a known serial, null for an unknown one, and throws
   when the check couldn't be made (network, rate limit), so the page can say so. */
(function(){
  window.axiaGenuineLookup=async function(serial){
    const res=await fetch('/api/genuine?serial='+encodeURIComponent(String(serial||'').slice(0,40)),{headers:{Accept:'application/json'}});
    if(res.status===404) return null;
    if(!res.ok) throw new Error('lookup failed: '+res.status);
    const r=await res.json();
    /* bare dates, read as local midnight so they show the same day everywhere */
    const day=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?d+'T00:00:00':'';
    return {
      name:String(r.name||''), variant:String(r.variant||''), productId:String(r.productId||''),
      purchasedAt:day(r.purchasedOn), owners:Math.max(1,Number(r.owners)||1), ownerSince:day(r.ownerSince),
    };
  };
})();
