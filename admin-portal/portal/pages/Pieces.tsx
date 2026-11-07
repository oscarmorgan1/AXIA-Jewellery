import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Gem } from 'lucide-react';
import { siteUrl } from '../../src/firebase';
import { useMyPieces, ymd } from '../pieces';
import { thumb } from './Orders';

/** /portal/pieces: every piece registered to them, with its serial. */
export default function Pieces() {
  const { pieces, error } = useMyPieces();
  useEffect(() => { document.title = 'Pieces · AXIA'; }, []);
  return (
    <div className="page pt-page">
      <div className="page-head"><h1>Pieces</h1><p className="lede">Each AXIA piece you own, with the serial from its authenticity card.</p></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {pieces === null ? <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>
        : !pieces.length ? (
          <div className="card empty">
            <Gem size={28} />
            <b>No pieces yet</b>
            <p>Once your piece is made and checked, its serial is registered here.</p>
          </div>
        ) : (
          <div className="pt-pieces">
            {pieces.map(p => (
              <article key={p.key} className="card pt-piece">
                <div className="pt-piece__img">
                  {p.image ? <img src={thumb(p.image)} alt="" onError={e => { e.currentTarget.src = siteUrl(p.image); }} /> : null}
                  <span className={`chip chip--onimg`}>{p.shippedOn ? 'With you' : 'Being finished'}</span>
                </div>
                <div className="pt-piece__body">
                  <h2>{p.productName}</h2>
                  {p.variant && <small>{p.variant}</small>}
                  <dl className="kv kv--left pt-piece__kv">
                    <dt>Serial</dt><dd className="mono">{p.serial}</dd>
                    {p.purchasedOn && <><dt>Bought</dt><dd>{ymd(p.purchasedOn)}</dd></>}
                    {p.orderNumber && <><dt>Order</dt><dd>{p.orderId ? <Link to={`/orders/${encodeURIComponent(p.orderId)}`}>#{p.orderNumber}</Link> : `#${p.orderNumber}`}</dd></>}
                  </dl>
                  <a className="btn btn--sm" href={`/genuine?serial=${encodeURIComponent(p.serial)}`}><BadgeCheck size={15} /> Verify</a>
                </div>
              </article>
            ))}
          </div>
        )}
    </div>
  );
}
