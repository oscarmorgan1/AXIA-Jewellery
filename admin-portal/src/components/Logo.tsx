import type { CSSProperties } from 'react';
import logo from '../assets/axia-logo.png';

/** The AXIA wordmark, drawn in the current text colour so it follows light and dark mode. */
export default function Logo({ height = 22, className = '' }: { height?: number; className?: string }) {
  return <span role="img" aria-label="AXIA" className={`logo ${className}`} style={{ height, '--logo': `url(${logo})` } as CSSProperties} />;
}
