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
| `site/shop` | everyone | admins | The Open shop switch (`open: true/false`), under Website in the portal. Missing or false means closed: buttons say "Reserve your spot" and the server refuses checkout |
| `site/countdown` | everyone | admins | The launch countdown (timer, text or hidden), edited under Website in the portal. Without it the site shows "Dropping soon" |
| `site/media` | everyone | the server | The site videos uploaded under Website > Videos: `landing` (home/waitlist page) and `store` (store page), each with 1080p and 720p MP4 links, a poster and sizes. A missing slot uses the built-in film in `assets/video/` |
| `visits/{day}_{id}` | admins | anyone can create (validated) | Anonymous unique visitors: one entry per browser per day (Sydney time) with landing page, referring site and device. Shown on the dashboard. Admins who have signed in to the portal aren't counted |
| `signups/{id}` | admins | anyone can create (validated) | Waitlist registrations from the landing and First Drop pages. Shown under Customers |
| `messages/{id}` | admins | anyone can create (validated) | Support page contact form. Shown in the Inbox |
| `productCosts/{id}` | admins | admins | Factory cost, quoted size, notes. **Private** |
| `internal/costAssumptions` | admins | admins | Payment fee, packaging, returns reserve |
| `internal/firstDropPlan` | admins | admins | Internal unit plan |
| `orders/{id}` | admins | admins | Paid Stripe orders, keyed by Checkout session id. Written by the webhook and the admin API with the Admin SDK. Holds each line's engraving, the promo code used, `statusHistory`, and `emails` (every customer email with its Resend ID) |
| `customers/{email}` | nobody | nobody | One record per buyer, keyed by lower-cased email: latest name, phone and address, order ids, first and last order dates, and private notes. Created or updated by the webhook on every order; the portal reads it through `/api/admin/customers`, which also creates records for older orders |
| `promoCodes/{id}` | nobody | nobody | Promo codes, keyed by Stripe promotion code id. Only the server reads and writes them (portal goes through `/api/admin/promos`) |

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

Checkout only works while the shop is open: **Website > Shop > Open shop** in the portal. The server checks the same switch before creating any payment, so closing it stops checkout immediately.

Checkout uses **Stripe Checkout** (Stripe's hosted payment page). `checkout.html` shows the bag, then `POST /api/checkout` prices every piece from Firestore. The browser only sends which piece, width, length, colour, engraving and quantity; any price it sends is ignored and sends the buyer to Stripe, which collects the address, shipping choice (free standard or A$25 express), discount code and card. Stripe then calls `POST /api/stripe/webhook`, which writes the order to `orders/` (shown in the portal) and emails a confirmation through **Resend**. Refunds made in the Stripe dashboard mark the order Refunded.

Discount codes are Stripe **promotion codes**: create them in the Stripe dashboard under Product catalogue > Coupons (for example `FREE15` for 15% off). The old codes written into the checkout page are gone.

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

### Order status and customer emails

Open an order in the portal to see everything about it and change its status: New, In progress, Shipped (with carrier, tracking number and link), Fulfilled or Cancelled. The portal shows exactly which email will go to which address and asks you to confirm before anything is saved. Changes go through `POST /api/admin/orders/:id/status`, which needs the signed-in admin's Firebase ID token. Each email sent (confirmation and status updates) is logged on the order with its Resend ID. Cancelling doesn't refund; do that in Stripe, which then marks the order Refunded.

### Customers and search

Every order creates or updates a customer record. Customers in the portal joins those records with orders, waitlist sign-ups and Inbox messages by email, so each person has one page with their open orders, order history, total spent, pieces bought, codes used, sign-ups, messages and private notes. The header search (Ctrl K) covers orders (number, name, email, phone, engraving, tracking, code), customers, products, collections, promo codes and messages.

### Welcome email

Sign-ups from the landing and First Drop pages go through `POST /api/signup`, which saves them to `signups/` and emails a one-time welcome with the first-order code (`FREE15`, 15% off; change with the `WELCOME_CODE` and `WELCOME_PERCENT_OFF` variables). The email's Resend ID is logged on the sign-up (`welcomeEmail`) and the customer record, and shows in the customer's activity. Create the code itself under Promo codes so it works at checkout; the Promo codes page warns while it's missing. If the server can't be reached, the forms fall back to saving straight to Firestore, without the email.

Links in every email point at `https://axiajewellery.com` (override with `EMAIL_LINK_URL`), never the temporary App Hosting address.

### Unsubscribe

Every email has an Unsubscribe link at the bottom and the one-click `List-Unsubscribe` header that Gmail and Apple Mail show. The link opens `/unsubscribe`, which asks the person to confirm (so link scanners can't unsubscribe anyone) and has a Resubscribe option. Unsubscribing marks their customer record `unsubscribed` and turns off email consent on their waitlist sign-ups; the portal shows them as Unsubscribed. Order emails and your replies still reach them. Signing up again with the email box ticked puts them back on the list. Links are signed with a random key the server creates in `serverConfig/unsubscribe` (server-only), or `UNSUBSCRIBE_SECRET` if set.

### Replies and messages

Reply to an Inbox inquiry, or message a customer from their page or from an order, without leaving the portal. You see exactly what will be sent before it goes. Emails go through Resend (`POST /api/admin/messages/send`) in the AXIA layout, and replies to them land at `ORDER_EMAIL_REPLY_TO`. Each one is logged with its Resend ID on the inquiry (`replies`), on the order if it's about one, and on the customer record. Inquiries link the order they mention, whatever the format (`#XYZQWE`, `axia-xyzqwe`, `xyz qwe`), plus any other orders from the same email.

### Site videos

The home (waitlist) page film and the store page film can be swapped under Website > Videos. The portal uploads the original straight to Cloud Storage (`media/uploads/`, through a one-off upload session from `POST /api/admin/media/upload-url`), then `POST /api/admin/media/video` converts it with ffmpeg, reading the original straight from Storage so it never fills the server's memory, (the `ffmpeg-static` package): sound removed, cut to 20 seconds, a 1080p and a 720p H.264 MP4 that start playing before they finish downloading, and a poster image. Those land in `media/{slot}/` and the links in `site/media`; the original is deleted. "Use original" goes back to the built-in film.

Pages never download a video up front: it loads only when it's about to scroll into view, and phones (or data-saver connections) get the 720p one. The App Hosting service account needs write access to the Storage bucket (`STORAGE_BUCKET`, default `axia-jewellery.firebasestorage.app`); conversion is why `apphosting.yaml` asks for 2 CPUs and 2 GiB.

### Promo codes

Promo codes are made under Promo codes in the portal. Each one becomes a Stripe coupon (percent off, applied once) plus a promotion code, so customers enter it on the Stripe checkout page. Affiliate codes carry the affiliate's name, and the page totals orders, sales and discount per code and per affiliate from paid orders. Codes made while the test key is in use exist only in Stripe test mode, so recreate them after switching to live keys.

### Going live with payments

At cutover, add a live-mode webhook endpoint in Stripe with the same URL and events, then replace `stripe-secret-key` and `stripe-webhook-secret` with the live values (run the same `secrets:set` commands; they add a new version) and roll out again. Orders record whether they were test or live (`stripe.livemode`).
