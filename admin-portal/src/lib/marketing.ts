// Marketing emails (server/marketing.js). Everything goes through /api/admin/marketing:
// the campaigns live in server-only Firestore collections.

export type Audience = 'waitlist' | 'everyone';

export interface CampaignContent {
  subject: string;
  preheader: string;
  eyebrow: string;
  heroImage: string;
  heroAlt: string;
  stat: { value: string; label: string; note: string } | null;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  productsTitle: string;
  footnote: string;
  products: string[];
  audience: Audience;
}

export interface CampaignStats {
  recipients: number; sent: number; failed: number; skipped: number;
  delivered: number; opened: number; clicked: number; bounced: number; complained: number;
  opens: number; clicks: number;
}

export interface Campaign {
  id: string;
  name: string;
  template: string;
  status: 'draft' | 'sending' | 'sent';
  content: CampaignContent;
  stats: CampaignStats;
  links: { url: string; clicks: number }[];
  createdAt: number | null;
  updatedAt: number | null;
  sendStartedAt: number | null;
  sentAt: number | null;
  createdBy: string;
  sentBy: string;
  tests: { to: string; at: number | null; resendId: string | null }[];
  lastError: string;
  syncedAt: number | null;
}

export interface Recipient {
  email: string; firstName: string; status: 'queued' | 'sent' | 'skipped' | 'failed'; error: string; resendId: string | null;
  sentAt: number | null; deliveredAt: number | null; openedAt: number | null; clickedAt: number | null;
  bouncedAt: number | null; complainedAt: number | null; opens: number; clicks: number;
}

export interface Template { id: string; name: string; blurb: string; heroImage: string }

export interface AudienceSummary { count: number; excluded: { unsubscribed: number; noConsent: number }; sample: string[] }

export interface Tracking {
  emailReady: boolean; from: string; endpoint: string; domain: string;
  webhook: boolean; webhookVia: string | null; openTracking: boolean | null; clickTracking: boolean | null; setUpAt: number | null;
}

/** Share of delivered emails (falls back to sent before any delivery reports arrive). */
export function rate(n: number, s: CampaignStats) {
  const base = s.delivered || s.sent;
  return base ? (n / base) * 100 : null;
}

export const AUDIENCE_LABEL: Record<Audience, string> = { waitlist: 'Waitlist', everyone: 'Everyone subscribed' };

export const day = (ms: number | null) => ms ? new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const dayTime = (ms: number | null) => ms ? new Date(ms).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

/** Curated email photos, offered first in the picker (assets/img/email). */
export const EMAIL_PHOTOS = [
  { src: 'assets/img/email/drop-hero.jpg', alt: 'AXIA Moonrock Cuban chain' },
  { src: 'assets/img/email/store-hero.jpg', alt: 'AXIA Micro Pavé Cuban chain' },
  { src: 'assets/img/email/case-hero.jpg', alt: 'The AXIA travel case' },
];
