import { Link } from 'react-router-dom';
import { useAssumptions, useCosts, useProducts } from '../lib/data';
import { orderEconomics } from '../lib/economics';
import { aud, pct } from '../lib/format';
import type { Order } from '../types';

/** What one order really made: from the prices paid, after its promotion and promo code. */
export default function OrderMargin({ order }: { order: Order }) {
  const { byId: costs, loading } = useCosts();
  const { data: assumptions } = useAssumptions();
  const { data: products } = useProducts();
  if (loading) return null;
  const byId = new Map(products.map(p => [p.id, p]));
  const m = orderEconomics(order, id => costs.get(id), assumptions, id => byId.get(id));
  const discounted = m.promotionOffAUD + m.couponOffAUD > 0.005;
  const none = m.grossMarginPct == null;

  return (
    <div className="card order-margin">
      <div className="card__head"><div><h2>Margin</h2><div className="card__sub">From what the customer paid{discounted ? ', after discounts' : ''}.</div></div></div>
      {none ? <div className="card__sub">Add factory costs on <Link to="/margins">Margins</Link> to see this order’s margin.</div> : (
        <dl className="kv">
          {discounted && <><dt>Full price</dt><dd>{aud(m.listAUD, 2)}</dd></>}
          {m.promotionOffAUD > 0.005 && <><dt>Promotion</dt><dd>−{aud(m.promotionOffAUD, 2)}</dd></>}
          {m.couponOffAUD > 0.005 && <><dt>Promo code{order.promotionCode ? ` (${order.promotionCode})` : ''}</dt><dd>−{aud(m.couponOffAUD, 2)}</dd></>}
          <dt>Items paid</dt><dd>{aud(m.revenueAUD, 2)}</dd>
          <dt>Factory cost</dt><dd>{aud(m.costAUD + m.giftCostAUD, 2)}</dd>
          {m.giftCostAUD > 0 && <><dt className="muted">incl. free gift</dt><dd className="muted">{aud(m.giftCostAUD, 2)}</dd></>}
          {m.freightAUD > 0 && <><dt>Freight</dt><dd>{aud(m.freightAUD, 2)}</dd></>}
          <dt>Gross profit</dt><dd className={m.grossProfitAUD < 0 ? 'bad' : undefined}>{aud(m.grossProfitAUD, 2)}</dd>
          <dt><b>Gross margin</b></dt><dd><span className={`chip ${m.grossMarginPct! >= 50 ? 'chip--good' : m.grossMarginPct! >= 40 ? 'chip--warn' : 'chip--bad'}`}>{pct(m.grossMarginPct)}</span></dd>
          {discounted && m.listMarginPct != null && <><dt className="muted">At full price</dt><dd className="muted">{pct(m.listMarginPct)}</dd></>}
          <dt>Contribution</dt><dd className={m.contributionAUD < 0 ? 'bad' : undefined}>{aud(m.contributionAUD, 2)}</dd>
        </dl>
      )}
      {!none && m.missing.length > 0 && <div className="card__sub" style={{ marginTop: 10, color: 'var(--warn)' }}>Leaves out {m.missing.join(', ')}: no factory cost.</div>}
      {!none && <div className="card__sub" style={{ marginTop: 10 }}>GST off, then fees on the total paid and packaging per piece, as in Settings. Shipping charged isn’t counted.</div>}
    </div>
  );
}
