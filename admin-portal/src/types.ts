export interface Variant {
  length: string | null;
  priceAUD: number;
}

export interface WidthOption {
  width: string;
  image?: string;
  fromPriceAUD?: number;
  variants: Variant[];
}

/** Public product document (Firestore `products/{id}`), same shape the storefront reads. */
export interface Product {
  id: string;
  name: string;
  desc?: string;
  width?: string | null;
  cat?: 'chain' | 'bracelet' | 'pendant' | string;
  cons?: string | null;
  level?: number;
  col?: string[];
  coll?: string[];
  badge?: string | null;
  mto?: boolean;
  art?: string;
  stone?: string;
  images?: string[];
  imagesByColor?: Record<string, string[]>;
  sizingImage?: string;
  video?: string;
  videoPoster?: string;
  variants?: Variant[];
  widths?: WidthOption[];
  defaultLength?: string;
  defaultWidth?: string;
  fromPriceAUD?: number;
  compareAtAUD?: number;
  singlePrice?: boolean;
  bundle?: string[];
  bundleOf?: string[];
  hidden?: boolean;
  linkTo?: string;
  titan?: boolean;
  // admin bookkeeping
  sort?: number;
  archived?: boolean;
  updatedAt?: unknown;
  [key: string]: unknown;
}

/** Private cost document (Firestore `productCosts/{id}`), admins only. */
export interface ProductCost {
  id: string;
  name?: string;
  category?: string | null;
  representativeSize?: string | null;
  factoryCostAUD: number | null;
  factoryCostEstimated?: boolean;
  notes?: string;
  updatedAt?: unknown;
}

export interface CostAssumptions {
  paymentFeePct: number;
  paymentFeeFixedAUD: number;
  packagingPerUnitAUD: number;
  shippingAUD: number;
  returnsReservePct: number;
}

export interface Order {
  id: string;
  createdAt?: { toDate(): Date };
  customer?: { name?: string; email?: string };
  items?: { id: string; name: string; qty: number; priceAUD: number }[];
  totalAUD?: number;
  status?: 'pending' | 'paid' | 'fulfilled' | 'refunded' | 'cancelled' | string;
}

/** Public collection document (Firestore `collections/{slug}`). Products join via `coll`. */
export interface Collection {
  slug: string;
  name: string;
  tab?: string;
  intro?: string;
  image?: string;
  showInShop?: boolean;
  sort?: number;
  updatedAt?: unknown;
}

type Ts = { toDate(): Date };

/** Waitlist / registration entry (Firestore `signups/{id}`), admins only. */
export interface Signup {
  id: string;
  firstName: string;
  email: string;
  mobile?: string;
  instagram?: string;
  productId?: string;
  productName?: string;
  size?: string;
  emailConsent?: boolean;
  smsConsent?: boolean;
  source?: string;
  page?: string;
  createdAt?: Ts;
}

/** Support form message (Firestore `messages/{id}`), admins only. */
export interface Message {
  id: string;
  name: string;
  email: string;
  topic: string;
  order?: string;
  message: string;
  status: 'new' | 'done' | string;
  createdAt?: Ts;
}

/** site/countdown: the launch countdown shown across the storefront. Public. */
export interface Countdown {
  mode: 'timer' | 'text' | 'off';
  label: string;
  text: string;
  /** ISO date-time the timer counts down to. */
  target: string;
  endedText: string;
  updatedAt?: { toDate(): Date };
}
