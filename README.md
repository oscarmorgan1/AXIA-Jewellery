# AXIA Jewellery

The storefront is the static site in this folder (HTML/CSS/vanilla JS). Products now come from **Cloud Firestore** and are managed in the **admin portal** (React + TypeScript, Vite) at `/admin`. Everything is served by a small Node server (`server/`) on **Firebase App Hosting** in the `axia-jewellery` project, which also runs Stripe checkout and sends order emails through Resend. App Hosting is connected to GitHub, so merging to `main` deploys.

```
index.html, product.html, ...   storefront pages (unchanged look)
assets/js/catalogue.js          loads products from Firestore, then runs page scripts
assets/data/products.js         offline fallback + seed source (public prices only)
admin-portal/                   admin portal source (React + TS), builds to /admin
server/                         web server: serves the site, Stripe checkout + webhook, Resend emails
apphosting.yaml                 App Hosting settings and the secrets it reads
scripts/                        seed, grant admin, export catalogue (Firebase Admin SDK)
firebase.json                   hosting + emulators config
firestore.rules, storage.rules  security rules
```

## Run it locally

Needs Node 20+ and Java 17+ (for the Firebase emulators).

```bash
npm install          # also installs admin-portal/
npm run dev          # emulators + seed + admin portal dev server
```

To try checkout locally as well, put test keys in a git-ignored `.env` (`STRIPE_SECRET_KEY=sk_test_...`, plus `RESEND_API_KEY` and `ORDER_EMAIL_FROM` if you want emails) and run `npm run serve` alongside the emulators: the site and API are then at http://localhost:5050. Forward webhooks with the Stripe CLI: `stripe listen --forward-to localhost:5050/api/stripe/webhook`, and put the `whsec_...` it prints in `.env` as `STRIPE_WEBHOOK_SECRET`.

Then open:

| What | URL |
| --- | --- |
| Admin portal (hot reload) | http://127.0.0.1:5173/admin/ |
| Storefront (served like production) | http://127.0.0.1:5000/ |
| Emulator UI (data, users, files) | http://127.0.0.1:4000/ |

Local admin login: `admin@axia.test` / `axia-admin-123` (emulator only).

Seeding loads factory costs from `private/AXIA-backend-data.json` if it exists. Put your copy there (the folder is git-ignored) or pass `npm run seed -- --private /path/to/file.json`. Emulator data resets when you stop `npm run dev`.

On localhost the storefront reads the emulator. Add `?catalogue=live` to read production, or `?catalogue=static` to use the bundled file.

## Data model

| Collection | Who can read | Who can write | Holds |
| --- | --- | --- | --- |
| `products/{id}` | everyone | admins | The public catalogue, same fields as `products.js`, plus `sort`, `archived`, `updatedAt`. `coll` lists the collection slugs it belongs to |
| `collections/{slug}` | everyone | admins | Reusable groups of products. `showInShop` ones become the Shop All tabs, in `sort` order |
| `site/countdown` | everyone | admins | The launch countdown (timer, text or hidden), edited under Website in the portal. Without it the site shows "Dropping soon" |
| `visits/{day}_{id}` | admins | anyone can create (validated) | Anonymous unique visitors: one entry per browser per day (Sydney time) with landing page, referring site and device. Shown on the dashboard. Admins who have signed in to the portal aren't counted |
| `signups/{id}` | admins | anyone can create (validated) | Waitlist registrations from the landing and First Drop pages. Shown under Customers |
| `messages/{id}` | admins | anyone can create (validated) | Support page contact form. Shown in the Inbox |
| `productCosts/{id}` | admins | admins | Factory cost, quoted size, notes. **Private** |
| `internal/costAssumptions` | admins | admins | Payment fee, packaging, returns reserve |
| `internal/firstDropPlan` | admins | admins | Internal unit plan |
| `orders/{id}` | admins | admins | Paid Stripe orders, keyed by Checkout session id. Written by the webhook with the Admin SDK |

"Admin" means a Firebase Auth user with the custom claim `admin: true`. The rules also refuse any cost or economics field on a public product.

The raw `AXIA-backend-data.json` must never be committed or deployed: `.gitignore` and the Hosting `ignore` list both exclude it.

## Going live (one time)

1. In the [Firebase console](https://console.firebase.google.com/project/axia-jewellery):
   - **Firestore Database**: create it in production mode (`australia-southeast1` is closest to your customers).
   - **Authentication**: enable *Email/Password* (and *Google* if you want the Google button).
   - **Storage**: create the default bucket (needs the Blaze plan) so photo uploads work.
2. Sign in and deploy the rules first:
   ```bash
   npx firebase login
   npx firebase deploy --only firestore:rules,storage --project axia-jewellery
   ```
3. Load the catalogue and private costs into production (needs Google credentials:
   `gcloud auth application-default login`, or `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account key kept outside the repo):
   ```bash
   npm run seed -- --prod --private /path/to/AXIA-backend-data.json
   ```
4. Create your admin account (or, if you already signed in with Google, drop `--create`):
   ```bash
   npm run set-admin -- you@example.com --create 'a-strong-password' --prod
   ```
5. The site and portal deploy through App Hosting when you merge to `main`. Rules still deploy from your machine:
   ```bash
   npx firebase deploy --only firestore:rules,storage --project axia-jewellery
   ```

### Upgrading a database seeded before collections existed

```bash
npx firebase deploy --only firestore:rules --project axia-jewellery
npm run migrate:collections -- --prod   # adds starter collections, never overwrites your edits
```

Any change to `firestore.rules` (for example the `site` rule that the Website countdown needs) only takes effect after `npx firebase deploy --only firestore:rules`. App Hosting deploys the site, not the rules.

The server uses clean URLs (`/collection` rather than `/collection.html`; old `.html` links redirect). Pages, scripts and styles are served with `Cache-Control: no-cache`, so visitors get a new deploy on their next page load. Only the root pages, `assets/` and `admin/` are ever served.

Before later deploys, refresh the offline fallback so it matches Firestore: `npm run export:products -- --prod`.

## Payments and email

Checkout uses **Stripe Checkout** (Stripe's hosted payment page). `checkout.html` shows the bag, then `POST /api/checkout` prices every piece from Firestore (never from the browser) and sends the buyer to Stripe, which collects the address, shipping choice (free standard or A$25 express), discount code and card. Stripe then calls `POST /api/stripe/webhook`, which writes the order to `orders/` (shown in the portal) and emails a confirmation through **Resend**. Refunds made in the Stripe dashboard mark the order Refunded.

Discount codes are Stripe **promotion codes**: create them in the Stripe dashboard under Product catalogue > Coupons (for example `FIRST15` for 15% off). The old codes written into the checkout page are gone.

### Secrets

Set these once in App Hosting (Cloud Secret Manager). **Create all three before merging the change that adds them to `apphosting.yaml`, or the rollout fails.** Each command asks for the value and offers to grant your backend access; say yes.

```bash
npx firebase apphosting:secrets:set stripe-secret-key --project axia-jewellery      # sk_test_... (sk_live_... at cutover)
npx firebase apphosting:secrets:set stripe-webhook-secret --project axia-jewellery  # whsec_... from the webhook endpoint below
npx firebase apphosting:secrets:set resend-api-key --project axia-jewellery         # re_...
```

If you created a secret without granting access: `npx firebase apphosting:secrets:grantaccess <name> --backend <backend-id> --project axia-jewellery`.

### Stripe webhook

In Stripe (test mode first): Developers > Webhooks > Add endpoint, URL `https://<your App Hosting URL>/api/stripe/webhook` (the `...hosted.app` address on the App Hosting dashboard, or the custom domain once it's connected), with these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`

Copy its signing secret (`whsec_...`) into `stripe-webhook-secret`.

### Resend

Verify the sending domain in Resend (Domains > Add domain, then add the DNS records it shows). The sender and reply-to addresses are plain settings in `apphosting.yaml` (`ORDER_EMAIL_FROM`, `ORDER_EMAIL_REPLY_TO`).

### Going live with payments

At cutover, add a live-mode webhook endpoint in Stripe with the same URL and events, then replace `stripe-secret-key` and `stripe-webhook-secret` with the live values (run the same `secrets:set` commands; they add a new version) and roll out again. Orders record whether they were test or live (`stripe.livemode`).
