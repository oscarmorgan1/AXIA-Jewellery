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

/** One customer review video, converted by the server (server/media.js, slot 'review') and kept in `site/reviews`. */
export interface ReviewVideo {
  id: string;
  src: string;
  poster: string;
  width?: number | null;
  height?: number | null;
  seconds?: number | null;
  audio?: boolean;
  /** The piece in the clip: the product page shows a small card linking to it under the video. */
  productId?: string;
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
  /** Old per-product review clips. Review videos are now shared (`site/reviews`, Admin > Reviews);
   *  the product page only falls back to these until that list has been set up. */
  reviewVideos?: ReviewVideo[];
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

type Stamp = { toDate(): Date };

export interface OrderItem {
  id: string; name: string; qty: number; priceAUD: number;
  options?: string; width?: string; length?: string; colour?: string; engraving?: string; image?: string;
}

export interface OrderEmail { type: string; to: string; subject: string; resendId: string | null; status: 'sent' | 'skipped'; sentAt?: Stamp; body?: string; by?: string; inquiryId?: string; orderId?: string }
export interface OrderHistory { status: string; at?: Stamp; by: string; emailed?: boolean; note?: string; tracking?: Tracking }
export interface Tracking { carrier?: string; number?: string; url?: string }

export interface Order {
  id: string;
  orderNumber?: string;
  createdAt?: Stamp;
  updatedAt?: Stamp;
  customer?: { name?: string; email?: string; phone?: string };
  shipping?: {
    name?: string; method?: string; amountAUD?: number;
    address?: { line1?: string; line2?: string | null; city?: string; state?: string; postal_code?: string; country?: string } | null;
  };
  items?: OrderItem[];
  gift?: { id: string; name: string; length?: string } | null;
  subtotalAUD?: number;
  discountAUD?: number;
  promotionCode?: string;
  promotionCodeId?: string;
  totalAUD?: number;
  status?: 'pending' | 'paid' | 'in_progress' | 'shipped' | 'fulfilled' | 'refunded' | 'cancelled' | string;
  tracking?: Tracking;
  emails?: OrderEmail[];
  statusHistory?: OrderHistory[];
  stripe?: { sessionId?: string; paymentIntent?: string; livemode?: boolean; receiptUrl?: string; card?: { brand: string; last4: string } | null };
}

/** Promo code (server API; stored in Firestore `promoCodes`, mirrored in Stripe). */
export interface PromoCode {
  id: string;
  code: string;
  kind: 'standard' | 'affiliate';
  percentOff: number;
  affiliate: { name: string; email?: string } | null;
  active: boolean;
  maxRedemptions: number | null;
  expiresAt: number | null;
  createdAt: number | null;
  stripe: { couponId: string; promotionCodeId: string; livemode: boolean };
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
  /** Replies sent from the portal, with their Resend IDs. */
  replies?: OrderEmail[];
  createdAt?: Ts;
  /** Sent from the customer portal (/portal): their account, and their follow-ups. */
  source?: 'portal';
  uid?: string;
  subject?: string;
  orderId?: string | null;
  customerReplies?: { body: string; at?: Ts }[];
  /** Last message either way; the Inbox sorts by it. */
  lastAt?: Ts;
}

/** site/countdown: the launch countdown shown across the storefront. Public. */
/** Public `site/shop`: the Open shop switch. While closed the bag works but checkout is refused. */
/** The Site mode switch (`site/maintenance`). Missing means production; the first version stored `on: true` for maintenance. */
export interface MaintenanceSettings {
  mode: 'production' | 'maintenance' | 'offline';
  updatedAt?: { toDate(): Date };
}

export interface ShopSettings {
  open: boolean;
  updatedAt?: { toDate(): Date };
}

export interface Countdown {
  mode: 'timer' | 'text' | 'off';
  label: string;
  text: string;
  /** ISO date-time the timer counts down to. */
  target: string;
  endedText: string;
  updatedAt?: { toDate(): Date };
}

/** visits/{day}_{vid}: one anonymous entry per browser per day (Sydney time). */
export interface Visit {
  id: string;
  day: string;
  vid: string;
  page?: string;
  ref?: string;
  device?: 'mobile' | 'tablet' | 'desktop';
  createdAt?: { toDate(): Date };
}

/** Customer record (server API; Firestore `customers/{email}`), made on every order. */
export interface CustomerRecord {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  address?: NonNullable<NonNullable<Order['shipping']>['address']> | null;
  orderIds?: string[];
  notes?: string;
  firstOrderAt?: number | null;
  lastOrderAt?: number | null;
  createdAt?: number | null;
  /** Set when they used the unsubscribe link in an email (at in millis). */
  unsubscribed?: { at: number | null; via: string } | null;
  /** Their customer portal (/portal) account: invited by email after an order, or active once claimed (millis). */
  account?: { status: 'invited' | 'active'; invitedAt: number | null; since: number | null } | null;
  /** Messages and replies sent to them from the portal (sentAt in millis). */
  emails?: (Omit<OrderEmail, 'sentAt'> & { sentAt: number | null })[];
}

/** One site video (public `site/media`), converted by the server from an upload. */
export interface SiteVideo {
  src: string;
  mobileSrc?: string;
  poster?: string;
  sizeBytes?: number;
  mobileSizeBytes?: number;
  seconds?: number | null;
  width?: number | null;
  height?: number | null;
  trimmed?: boolean;
  updatedAt?: { toDate(): Date };
  by?: string;
}
export type SiteMedia = Partial<Record<'landing' | 'store', SiteVideo>>;

/**
 * One physical piece (Firestore `pieces/{key}`), admins only. `key` is the serial
 * in capitals with spaces and dashes removed, so one serial is one record.
 * The public /genuine lookup (server/genuine.js) shows only the product and its order's date, once assigned to a paid order.
 */
export interface Piece {
  key: string;
  serial: string;
  productId: string;
  productName: string;
  /** Width, length, colour: whatever tells this piece apart from others of the product. */
  variant?: string;
  /** The size and colour picked from the product's options; `variant` joins them. */
  size?: string;
  colour?: string;
  /** Supplier's name as it was when picked (the record is suppliers/{supplierId}). */
  supplier?: string;
  supplierId?: string | null;
  /** The supplier's order or invoice number for this piece. */
  supplierOrderNo?: string;
  /** Date ordered from the supplier, YYYY-MM-DD. Private: /genuine shows the customer's order date instead. */
  purchasedOn: string;
  /**
   * Date it arrived from the supplier, YYYY-MM-DD. null means it's still being made;
   * missing (pieces added before this field existed) counts as received.
   */
  receivedOn?: string | null;
  /** Date it left in an order, YYYY-MM-DD. Set when the order is marked shipped. */
  shippedOn?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  /** Which line of the order's items it fills (index into order.items). */
  orderLine?: number | null;
  /** The customer account its portal copy is in (server/sync.js). */
  portalUid?: string | null;
  /** Set once a customer transfers it to another account (server/transfers.js). */
  ownerUid?: string | null;
  ownerEmail?: string | null;
  transferredOn?: string | null;
  /** Everyone who has owned it, oldest first (from its first transfer). */
  owners?: { uid: string; email: string; via: 'order' | 'transfer'; transferId?: string; at?: Ts | null }[];
  /** A transfer waiting on the recipient. */
  transfer?: { id: string; toEmail: string; expiresAt?: Ts } | null;
  notes?: string;
  createdAt?: Ts;
  updatedAt?: Ts;
}

/** A manufacturer or supplier (Firestore `suppliers/{id}`), admins only. */
export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  /** Usual days from order to delivery, for the "due" hint on pieces being made. */
  leadDays?: number | null;
  notes?: string;
  createdAt?: Ts;
  updatedAt?: Ts;
}
