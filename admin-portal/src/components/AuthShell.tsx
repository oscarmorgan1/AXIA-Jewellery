import { useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import Logo from './Logo';
import { db, siteUrl } from '../firebase';
import { firstImage } from '../lib/catalogue';
import type { Product } from '../types';

interface Slide { name: string; caption: string; image: string }

const SLIDE_MS = 5500;
const MAX_SLIDES = 5;

// Shown until the catalogue loads (or if it can't): photos that ship with the site.
const FALLBACK: Slide[] = [
  { name: 'Classic Cuban Bracelet', caption: 'Hand-set VVS moissanite in 925 sterling silver.', image: 'assets/img/products/classic-cuban-bracelet-10mm/silver/1.jpg' },
];

/** Site photos have 1200px WebP copies next to them (npm run images); anything else is used as it is. */
const large = (src: string) => {
  const m = /^\/?(assets\/img\/[^?#]+)\.(jpe?g|png)$/i.exec(src);
  return siteUrl(m ? `${m[1]}-1200.webp` : src);
};

const firstSentence = (s = '') => {
  const t = s.replace(/\s+/g, ' ').trim();
  const m = /^.{20,160}?[.!?](\s|$)/.exec(t);
  return m ? m[0].trim() : t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t;
};

function useSlides(): Slide[] {
  const [slides, setSlides] = useState<Slide[]>(FALLBACK);
  useEffect(() => {
    let live = true;
    // products/ is publicly readable, so this works before sign-in.
    getDocs(collection(db, 'products')).then(snap => {
      const list = snap.docs.map(d => ({ ...(d.data() as Product), id: d.id }))
        .filter(p => !p.archived && !p.hidden && !p.linkTo && firstImage(p))
        .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
        .slice(0, MAX_SLIDES)
        .map(p => ({ name: p.name, caption: firstSentence(p.desc) || 'Hand-set in 925 sterling silver.', image: firstImage(p)! }));
      if (live && list.length) setSlides(list);
    }).catch(() => { /* keep the fallback */ });
    return () => { live = false; };
  }, []);
  return slides;
}

/** Product photos from the live catalogue, crossfading with progress dashes. Hover or focus pauses it. */
function Showcase() {
  const slides = useSlides();
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const i = at % slides.length;

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setTimeout(() => setAt(n => (n + 1) % slides.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [at, paused, slides.length]);

  return (
    <aside className="auth__show" aria-label="AXIA pieces" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {slides.map((s, n) => (
        <img key={s.image} className={`auth__img${n === i ? ' on' : ''}`} src={large(s.image)} alt=""
          loading={n === 0 ? 'eager' : 'lazy'} onError={e => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = siteUrl(s.image); } }} />
      ))}
      <div className="auth__shade" />
      <div className="auth__cap" aria-live="polite">
        {slides.length > 1 && (
          <div className="auth__dashes">
            {slides.map((s, n) => (
              <button key={s.image} type="button" aria-label={`Show ${s.name}`} aria-current={n === i}
                className={`auth__dash${n === i ? ' on' : ''}${n === i && paused ? ' paused' : ''}`} onClick={() => setAt(n)}>
                <i key={n === i ? at : undefined} style={{ animationDuration: `${SLIDE_MS}ms` }} />
              </button>
            ))}
          </div>
        )}
        <h2 key={`h${i}`}>{slides[i].name}</h2>
        <p key={`p${i}`}>{slides[i].caption}</p>
      </div>
    </aside>
  );
}

/** The sign-in screens: the form centred on the left, AXIA pieces on the right. */
export default function AuthShell({ children, foot }: { children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="auth">
      <main className="auth__side">
        <div className="auth__form">
          <Logo height={24} className="auth__logo" />
          {children}
        </div>
        <p className="auth__foot">{foot ?? <>By continuing, you agree to our <a href={siteUrl('terms')} target="_blank" rel="noreferrer">Terms &amp; Conditions</a><br />and acknowledge our <a href={siteUrl('terms#privacy')} target="_blank" rel="noreferrer">Privacy Policy</a>.</>}</p>
      </main>
      <Showcase />
    </div>
  );
}
