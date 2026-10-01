# AXIA Jewellery

The storefront is the static site in this folder (HTML/CSS/vanilla JS). Products now come from **Cloud Firestore** and are managed in the **admin portal** (React + TypeScript, Vite) at `/admin`. Everything is served by **Firebase Hosting** on the `axia-jewellery` project.

```
index.html, product.html, ...   storefront pages (unchanged look)
assets/js/catalogue.js          loads products from Firestore, then runs page scripts
assets/data/products.js         offline fallback + seed source (public prices only)
admin-portal/                   admin portal source (React + TS), builds to /admin
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
| `signups/{id}` | admins | anyone can create (validated) | Waitlist registrations from the landing and First Drop pages. Shown under Customers |
| `messages/{id}` | admins | anyone can create (validated) | Support page contact form. Shown in the Inbox |
| `productCosts/{id}` | admins | admins | Factory cost, quoted size, notes. **Private** |
| `internal/costAssumptions` | admins | admins | Payment fee, packaging, returns reserve |
| `internal/firstDropPlan` | admins | admins | Internal unit plan |
| `orders/{id}` | admins | admins | Reserved for Stripe (webhook writes with the Admin SDK) |

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
5. Deploy the site and portal:
   ```bash
   npm run deploy
   ```

### Upgrading a database seeded before collections existed

```bash
npx firebase deploy --only firestore:rules --project axia-jewellery
npm run migrate:collections -- --prod   # adds starter collections, never overwrites your edits
npm run deploy
```

Any change to `firestore.rules` (for example the `site` rule that the Website countdown needs) only takes effect after `npx firebase deploy --only firestore:rules`; `npm run deploy` deploys hosting and rules together.

Pages, scripts and styles are served with `Cache-Control: no-cache`, so visitors get a new deploy on their next page load instead of up to an hour later.

Before later deploys, refresh the offline fallback so it matches Firestore: `npm run export:products -- --prod`.

## Not done yet

- **Emails.** The site no longer sends any email (FormSubmit and Klaviyo were removed). Sign-ups and messages are saved to Firestore; export customers as CSV from the portal.
- **Stripe checkout.** `checkout.html` is still a preview and discount codes are still in the page. The `orders` collection and dashboard are ready for a Stripe webhook (Cloud Function) to write paid orders.
