/* /genuine serial lookup, used by the page's search (window.axiaGenuineLookup).
   Asks the server (server/genuine.js), which returns only the product name and
   the customer's purchase date for a sold serial in the registry. Resolves to
   { name, purchasedAt } for a known serial, null for an unknown one, and throws
   when the check couldn't be made (network, rate limit), so the page can say so. */
(function(){
  window.axiaGenuineLookup=async function(serial){
    const res=await fetch('/api/genuine?serial='+encodeURIComponent(String(serial||'').slice(0,40)),{headers:{Accept:'application/json'}});
    if(res.status===404) return null;
    if(!res.ok) throw new Error('lookup failed: '+res.status);
    const r=await res.json();
    /* a bare date, read as local midnight so it shows the same day everywhere */
    return { name:String(r.name||''), purchasedAt:r.purchasedOn?r.purchasedOn+'T00:00:00':'' };
  };
})();
