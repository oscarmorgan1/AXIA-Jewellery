import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgePercent, DollarSign, Gem, ShoppingCart } from 'lucide-react';
import StatCard from '../components/StatCard';
import { BarChart, StackedBars } from '../components/Charts';
import { useAssumptions, useCosts, useOrders, useProducts } from '../lib/data';
import { collectionOf, statusOf, type Collection } from '../lib/catalogue';
import { productEconomics } from '../lib/economics';
import { aud, pct } from '../lib/format';
import { usingEmulators } from '../firebase';
import { OrdersTable } from './Orders';

const COLLECTIONS: Collection[] = ['Cuban', 'Tennis', 'Titans', 'Pendants', 'Sets'];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default function Dashboard() {
  const { data: products, loading } = useProducts();
  const { byId: costs } = useCosts();
  const { data: assumptions } = useAssumptions();
  const { data: orders } = useOrders();
  const [scope, setScope] = useState<'live' | 'all'>('live');

  const stats = useMemo(() => {
    const active = products.filter(p => !p.archived);
    const live = active.filter(p => statusOf(p) === 'Live');
    const inScope = scope === 'live' ? live : active;
    const econ = inScope.map(p => ({ p, e: productEconomics(p, costs.get(p.id), assumptions) })).filter(x => x.e);
    const byColl = COLLECTIONS.map(c => {
      const ps = inScope.filter(p => collectionOf(p) === c);
      const es = econ.filter(x => collectionOf(x.p) === c).map(x => x.e!);
      return {
        label: c,
        count: ps.length,
        avgPrice: avg(ps.map(p => p.fromPriceAUD || 0)),
        avgCost: avg(es.map(e => e.factoryCostAUD)),
        avgMargin: avg(es.map(e => e.grossProfitAUD)),
      };
    }).filter(c => c.count > 0);
    const paid = orders.filter(o => o.status === 'paid' || o.status === 'fulfilled');
    return {
      active, live, inScope, byColl,
      comingSoon: active.filter(p => p.hidden).length,
      avgPrice: avg(inScope.map(p => p.fromPriceAUD || 0)),
      avgGross: avg(econ.map(x => x.e!.grossMarginPct)),
      avgContribution: avg(econ.map(x => x.e!.contributionMarginPct)),
      costed: econ.length,
      revenue: paid.reduce((a, o) => a + (o.totalAUD || 0), 0),
      paidCount: paid.length,
    };
  }, [products, costs, assumptions, orders, scope]);

  return (
    <>
      <div className="page-head">
        <h1>Store Overview</h1>
        <span className="spacer" />
        <span className={`env-badge${usingEmulators ? '' : ' env-badge--live'}`}>{usingEmulators ? 'Local emulators' : 'Live data'}</span>
        <div className="segmented" role="tablist">
          <button className={scope === 'live' ? 'on' : ''} onClick={() => setScope('live')}>Live pieces</button>
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Incl. coming soon</button>
        </div>
      </div>

      <div className="grid-4">
        <StatCard label="Products on sale" value={loading ? '…' : stats.live.length} icon={<Gem size={20} />}
          chip={<span className="chip chip--muted">{stats.active.length} total</span>}
          foot={<>Coming soon: <b>{stats.comingSoon}</b></>} />
        <StatCard label="Average from-price" value={aud(stats.avgPrice)} icon={<DollarSign size={20} />}
          foot={<>Across <b>{stats.inScope.length}</b> pieces</>} />
        <StatCard label="Avg gross margin" value={pct(stats.avgGross)} icon={<BadgePercent size={20} />}
          chip={<span className="chip chip--good">{pct(stats.avgContribution)} contrib.</span>}
          foot={<>{stats.costed} of {stats.inScope.length} pieces costed · <Link to="/margins" style={{ color: 'var(--accent)' }}>details</Link></>} />
        <StatCard label="Revenue" value={aud(stats.revenue, 2)} icon={<ShoppingCart size={20} />}
          foot={stats.paidCount ? <>Paid orders: <b>{stats.paidCount}</b></> : <>Awaiting Stripe checkout</>} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card__head"><h2>Average price by collection</h2></div>
          <BarChart data={stats.byColl.map(c => ({ label: c.label, value: Math.round(c.avgPrice) }))} format={n => aud(n)} />
        </div>
        <div className="card">
          <div className="card__head">
            <div><h2>Cost and margin</h2><div className="card__sub">Average per piece at its quoted size. Admins only.</div></div>
          </div>
          <div className="chart-inset">
            <div className="card__head" style={{ marginBottom: 6 }}>
              <b style={{ fontSize: 15, fontWeight: 500 }}>By collection</b><span className="spacer" />
              <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Margin</span><span><i style={{ background: 'var(--dark)' }} />Factory cost</span></div>
            </div>
            <StackedBars data={stats.byColl.filter(c => c.avgCost > 0).map(c => ({ label: c.label, bottom: c.avgCost, top: c.avgMargin }))} format={n => aud(n)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head"><h2>Recent orders</h2><span className="spacer" /><Link className="btn btn--sm" to="/orders">View all</Link></div>
        <OrdersTable orders={orders.slice(0, 6)} empty="Checkout is still a preview. Paid Stripe orders will show up here." />
      </div>
    </>
  );
}
