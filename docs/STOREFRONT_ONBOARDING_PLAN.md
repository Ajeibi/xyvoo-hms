# Storefront onboarding and website builder: build plan

Status: draft for review · 1 October 2026

How a merchant goes from "Get started" to a live, branded store at
`storename.getxyvoo.com`: registration, a five-step onboarding wizard, the store
dashboard, and a website editor that fills one of the storefront templates with
their own content, theme and products.

Hotel templates (Coral Tide, Fernhollow, Aldwin) are out of scope for this plan.

---

## 1. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Convert the three storefront templates to React server components that render from the database. Do not run `build.js` per tenant. | Agreed |
| D2 | The wizard is the minimum needed to reach a branded preview (steps 1–5). Products, payments, delivery and content go on the dashboard checklist. | Agreed |
| D3 | The plan step uses the existing pricing cards: Free (₦0, 4% fee per order), Standard (₦10,000/month, 0% fee), Enterprise (talk to sales). | Agreed |
| D4 | Stores live on subdomains of `getxyvoo.com`. The base domain is one environment variable, so it can move later. | Agreed |
| D5 | Enterprise merchants start on Free until sales agree terms. | Recommended, not yet confirmed |
| D6 | A store can't be published until it has at least one active product and Paystack is connected. | Recommended, not yet confirmed |
| D7 | Every store takes payments through Paystack subaccounts with split payments on XYVOO's account. The 4% fee is deducted when each payment settles. See section 7. | Agreed |
| D8 | Hosted on Vercel. Wildcard subdomains need `getxyvoo.com` on Vercel nameservers. See Phase 3. | Agreed |

---

## 2. Current state (what the plan builds on)

**Exists**
- Store registration: email and password, or Google (`/register/storefront`, `/api/store/register`). It creates the tenant (`product='store'`) and an owner row in `store.memberships`.
- Store login (`/auth/login/storefront`).
- Merchant dashboard at `/storefront/[slug]` with Overview, Products, Orders and Settings. Settings only holds the Paystack keys.
- The product catalogue (a full schema), CSV/Excel import, and image storage.
- The public shop at `/shop/[slug]` with cart and Paystack checkout (`store.create_guest_order`, `mark_order_paid`).
- Six static templates in `design/storefront-templates/`. They are built from hard-coded `config.js` sample data, and their theme is CSS custom properties in `_base/base.css` plus each template's `theme.css`.
- Pricing cards in `src/constants/pricing.ts`.

**Missing**
- Any link between a tenant and a template, theme, content, pages, collections, menus or delivery zones.
- Runtime rendering of the templates. `/shop/[slug]` is a plain product grid.
- Subdomain routing (`src/proxy.ts` does no host handling).
- Email verification for stores, and a forgot/reset password flow for every product.
- Platform billing:
  - The Standard subscription is never charged.
  - `store.orders.platform_fee` is never filled in.
  - There is no subscriptions table.
- Smaller faults:
  - The storefront pricing buttons link to `/register`, which is the hotel wizard.
  - `/storefront` isn't in the proxy's protected list.
  - The templates format prices in GBP while the store uses NGN.

---

## 3. The journey

```
Marketing (pricing card / template gallery / get started)
  └─► Register ─► Verify email ─► Wizard 1–5 ─► Preview ─► Dashboard (draft site)
Header "Log in" ─► Log in ─► setup finished? ── no ─► resume wizard
                                             └─ yes ─► Dashboard
Dashboard checklist: products · collections · Paystack · delivery · customise website
  └─► Website editor (8 tabs, live preview, saves to a draft)
        └─► Ready to sell? ─► Publish ─► live at storename.getxyvoo.com
```

The links carry what the visitor has already chosen: `/register/storefront?plan=standard` and
`?template=linden-home`. The matching wizard step comes pre-filled.

---

## 4. Fields at each step

### Account
- **Register:**
  - Full name, email, phone, password (with a strength hint), confirm password, and accept terms and privacy.
  - Or continue with Google.
  - Hidden: `plan` and `template` from the link.
- **Verify email:**
  - A six-digit code, with "Resend code" and "Change email".
  - Skipped for Google sign-ups.
- **Log in:** email and password, or Google.
- **Forgot password:** email address, then the reset page asks for a new password and confirmation.

### Wizard (saved after every step and resumable)
1. **Store basics:**
   - Store name.
   - Subdomain, suggested from the name, with a live availability check and a preview of the address.
   - What you sell (fashion, beauty, home, food, electronics, other).
   - Country (defaults to Nigeria) and currency (defaults to NGN).
2. **Template:**
   - Choose Linden Home, Sage and Stem or Loftwood.
   - Live desktop and mobile preview.
   - Recommended from "what you sell", or pre-picked from the gallery link.
3. **Brand:**
   - Logo upload (PNG or SVG), or a text logo.
   - Palette: the template's presets, or a custom accent colour with a contrast check.
   - Font pairing.
   - Tagline (optional).
   - The favicon is made from the logo.
4. **Essentials:**
   - Business email, phone and WhatsApp.
   - Address: street, city, state.
   - Flat delivery fee and a free-delivery threshold.
   - Optional: collection in person, social links, opening hours.
5. **Choose a plan:**
   - Free, Standard or Enterprise.
   - Standard: card payment through Paystack.
   - Enterprise: name, phone and message to sales, then the store starts on Free (D5).
6. **Preview:**
   - The template filled with their details, using sample products until real ones are added.
   - Then on to the dashboard.

### Dashboard checklist
- **Products** (exists):
  - Name, description and images.
  - Price and compare-at price.
  - Category, stock and SKU.
  - Variants.
  - Featured, new and bestseller flags.
  - Or CSV/Excel import.
- **Collections:**
  - Name, description, cover image and alt text.
  - Products, picked by hand or by a rule.
- **Get paid** (replaces the API key screen):
  - Bank, chosen from Paystack's bank list.
  - Account number. The account holder's name is fetched and shown so the merchant can confirm it's right.
  - Business name for settlement.
  - The fee is set by the plan: 4% on Free, 0% on Standard, custom on Enterprise.
- **Delivery:** zones (states or cities), fee per zone, estimated delivery time, collection in person.

### Website editor tabs
- **Template:** switch template; content carries across.
- **Theme:**
  - Colours: background, surface, text, accent, hover, dark band and its text.
  - Heading and body fonts.
  - Button shape and card corners.
  - Product card style (`cardVariant`).
- **Homepage:**
  - Hero: heading, text, image and button.
  - Featured collections, new arrivals and bestsellers.
  - Promo banner, journal and newsletter sign-up.
  - Every section can be shown, hidden or reordered.
- **Content:**
  - Announcement bar, about story, footer blurb and copyright.
  - Page headings and intros.
  - Grouped by page, from the template's `strings` slots.
- **Pages:**
  - About, Contact, FAQs, Delivery and returns.
  - Privacy and terms, with starter text.
  - Custom pages.
- **Navigation:**
  - Header and footer menus, linking to a page, collection, product or URL.
  - Social icons on or off.
- **Media:** an image library. Alt text is required.
- **SEO and sharing:** site title and description, social share image, favicon, and analytics/pixel IDs (optional).
- **Publish:**
  - Checks for D6.
  - Summary of changes since the last publish.
  - Publish or discard the draft.
  - Restore an earlier version.
- **Domain:**
  - Change the subdomain, with a warning that old links break.
  - Copy the store link.
  - Custom domains come in a later phase.

---

## 5. Data model (new migrations)

All new tables are in the `store` schema. RLS is forced, members can read and the service role writes, as in `20260810120000_store_schema_foundation.sql`.

| Table | Purpose | Key columns |
|---|---|---|
| `store.onboarding` | Wizard progress | `tenant_id` pk, `current_step`, `completed_steps text[]`, `data jsonb`, `completed_at` |
| `store.sites` | Template, theme and content, as a draft and a published copy | `tenant_id` pk, `template_slug`, `draft jsonb`, `published jsonb`, `published_at`, `published_version int`, `updated_at` |
| `store.site_versions` | Publish history, so a version can be restored | `id`, `tenant_id`, `version`, `snapshot jsonb`, `published_by`, `created_at` |
| `store.business_profile` | Contact details, address, socials, opening hours | `tenant_id` pk, plus one column per field |
| `store.collections` + `store.collection_products` | Collections | `slug` unique per tenant, `rule jsonb` (optional), `position` |
| `store.pages` | CMS pages | `slug`, `title`, `body` (structured blocks), `seo`, `show_in_menu`, `status` |
| `store.delivery_zones` | Delivery options | `name`, `regions text[]`, `fee`, `eta_text`, `is_pickup` |
| `store.subscriptions` | Plan and billing | `tenant_id` pk, `plan` (free, standard or enterprise), `status`, `fee_percentage`, `paystack_customer_code`, `paystack_subscription_code`, `current_period_end` |
| `store.payout_accounts` | Paystack subaccount for each store | `tenant_id` pk, `subaccount_code`, `bank_code`, `account_name`, `account_number_last4`, `percentage_charge`, `verified_at` |
| `store.email_otps` | Store email verification | Mirrors `hotel.registration_otps` |

`sites.draft` and `sites.published` share one shape, validated by Zod in
`src/lib/store/site/schema.ts`:
- `theme`: the tokens from `base.css`, such as `bg`, `surface`, `ink`, `accent` and `font_display`.
- `content`: the template's `strings` slots, grouped by page.
- `sections`: the homepage order and settings for each section.
- `brand`: logo, favicon and tagline.
- `seo`.

Each template provides default values for this shape, so a new site is never empty.

Header and footer menus are stored in `sites.draft.navigation`, not in a separate table, so they are
published and versioned along with the theme and content.

**Built in Phase 1** (migrations `20261001120000`, `20261001130000` and `20261001140000`; code in `src/lib/store/site/`):
- `schema.ts`: the Zod schema for the site settings.
- `templates.ts`: the three templates' defaults.
- `fonts.ts`: the font pairings.
- `contrast.ts`: WCAG contrast checks.
- `resolve.ts`: merges the merchant's choices over the template defaults and produces the CSS variables.
- `onboarding.ts`: wizard steps and plan fee rates.
- `signup-intent.ts`: reads `?plan=` and `?template=`.
- `data.ts`: reads and writes the database, and `provisionStoreDefaults` sets up a new store's records. Both registration routes call it.

---

## 6. Phases

Relative size: S, M, L or XL. These are not time estimates; the developer doing the work sets those.

### Phase 0: Fixes and groundwork (S)
- Point the storefront pricing and solution buttons at `/register/storefront?plan=…`. Affected files:
  - `src/constants/pricing.ts`
  - `HomePricingSection.tsx:374`
  - `SolutionsStorefrontDeepDive.tsx:106`
- Add `/storefront` to the protected paths in `src/proxy.ts`.
- Add the environment variable `STOREFRONT_ROOT_DOMAIN=getxyvoo.com`.
- Add a reserved-subdomain list: www, app, admin, api, mail, support, help, blog, shop, status, store, dashboard, auth, cdn, static, docs, and so on.
- Make currency formatting in the shop components follow the tenant's currency, with no GBP left in.

### Phase 1: Data model (M)
- The migrations in section 5.
- Zod schemas and default values for each template.
- A data-access layer in `src/lib/store/site/`.
- A backfill that creates a `store.sites` row and a Free `store.subscriptions` row for each existing store tenant.

### Phase 2: Template rendering engine (XL, the critical path)
- Convert `_base/` (the storefront layer) to React server components under `src/components/storefront-themes/`:
  - Header, footer, home sections, collection page, product page, cart, checkout and content pages.
- Write the theme tokens as CSS variables on the store's root element, read from `published.theme` (or `draft.theme` in preview).
- Build three template variants (Linden Home, Sage and Stem, Loftwood). Each has its own header, footer, home layout, theme presets and font pairings.
- Bind the data:
  - Products, the featured/new/bestseller lists and collections come from the `store` tables.
  - The cart and checkout use the existing `CartProvider` and checkout API.
- Turn `build.js`'s quality gates into automated tests:
  - exactly one `<h1>` on every page
  - no broken links
  - no duplicate IDs
  - no inline styles
- Self-host fonts. The templates' README requires this before any site goes live.
- Lighthouse and accessibility checks on every template.

**Progress on Phase 2** (4 October 2026)

**Done:**
- **Two root layouts.** The app now has `src/app/(platform)/` for the XYVOO site, apps and dashboards, and `src/app/(storefront)/shop/[slug]/` for stores. Stores load none of XYVOO's CSS, fonts, favicon or structured data.
- **Template CSS** is copied into `src/styles/storefront/` by `npm run templates:css` (`scripts/build-storefront-css.mjs`). Each theme is scoped to `<html data-template>`, and the merchant's colours are set as inline CSS variables.
- **Fonts** are self-hosted through next/font, and only the chosen pairing is preloaded.
- **Linden Home markup, now built:**
  - the homepage sections
  - the product listing (category chips, sort, pagination)
  - collection pages and content pages (`store.pages`)
  - the product page, with options, gallery, reviews, related products and Product structured data
  - the basket, checkout and order confirmation
  - the store's own "not found" page and an "opening soon" page for unpublished stores
  - a draft preview that only store members can see
- **Search engines:** unpublished stores are marked noindex.
- The old Tailwind shop components have been removed.
- **Checked in the browser** on the demo store, at desktop and phone width: home, listing, adding to the basket, basket, product page and the mobile menu.

- **Sage and Stem and Loftwood now have their own markup** (`sections-sage.tsx`, `sections-loftwood.tsx`). `sections.tsx` picks the right version of each section for the store's template.
  - **Sage and Stem:** hero card, value strip, three tiles, centred product rows, the "new favourite" panel, and the logo centred in the header.
  - **Loftwood:** panel hero with the store's categories as scrolling cards, icon value strip, bento categories with item counts, deals grid, flash sale with countdown, and the phone number and social links in the announcement bar.
  - Checked in the browser at desktop and phone width on a test store, which was then set back to Linden Home.
  - The carousel arrows couldn't be tested in the browser pane: it doesn't scroll even the original static template.

**Still to do in Phase 2:**
- Test the carousel arrows in a normal browser.
- Test the checkout form in the browser. The demo store has no Paystack, so it shows the "online payment isn't available" message instead.
- Turn the template quality gates into automated tests.
- Run Lighthouse and a production `next build`.

**Notes for later phases:**
- **Delivery fees** aren't included in the checkout total yet (Phase 6/7).
- **Newsletter and journal** sections don't render until subscribers and a blog exist.
- **Phase 3 proxy:**
  - It must overwrite the `x-storefront-host` header on every request.
  - It must not rewrite `/api`, `/_next` or `/sf-assets`.
  - The Paystack `callbackUrl` in `src/app/api/shop/[slug]/checkout/route.ts` must use the store's own address.

### Phase 3: Subdomain routing (M). Code done 4 October 2026; Vercel setup outstanding

**Built:**
- **`src/proxy.ts`:**
  - A request on `<store>.getxyvoo.com` is rewritten to `/shop/<store>` (`storefrontRewritePath` in `src/lib/store/subdomain.ts`), and the proxy sets `x-storefront-host` for the pages.
  - Any `x-storefront-host` header sent by a browser is deleted on every request.
  - `/api`, `/_next` and `/sf-assets` pass through unchanged.
  - The pre-launch lock and sign-in checks don't apply to stores.
  - Platform pages such as `/admin` give a 404 on a store's address.
  - Reserved names (www, admin, api…) and the bare `getxyvoo.com` still serve the platform.
- **Local development:** `<store>.localhost:3000` works in Chrome and Edge.
- **Canonical addresses:** every page's canonical URL and structured data point to the subdomain, including when viewed at `/shop/<store>`. So `/shop/<store>` is **not redirected**. It stays usable for the dashboard's "View storefront" link and draft previews, which need the platform login cookie. Login cookies don't reach store subdomains.
- **Search files:** each store has its own `robots.txt` (no indexing until published; cart and checkout excluded) and `sitemap.xml` (home, shop, categories, products, collections and pages). The proxy now also matches `/robots.txt` and `/sitemap.xml`.
- **Paystack** returns the shopper to the address they checked out on (`src/app/api/shop/[slug]/checkout/route.ts`).
- **Tested** against the dev server on `demo-store.localhost`: pages, page-to-page navigation, the basket link, the API, icons, robots, sitemap, the `/admin` 404, a forged header and canonical tags.

**Not done:**
- A branded page for an unknown store address. It currently shows Next.js's plain 404, because the proxy can't check the database cheaply.

**Vercel setup** (needs someone with access to the Vercel project and the domain registrar):
1. Set `NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN=getxyvoo.com` in the Vercel project.
2. Copy **every** existing DNS record into Vercel DNS first: the Zoho email records (MX, SPF, DKIM, DMARC), the Mailtrap sending records, any verification TXT records and any other subdomains. Missing one stops email to `@getxyvoo.com`.
3. Lower the TTLs at the current DNS provider a day ahead.
4. Switch the domain's nameservers to Vercel's. Vercel only issues wildcard certificates for domains on its nameservers.
5. Add `getxyvoo.com` and `*.getxyvoo.com` to the Vercel project's domains.
6. Check that email still sends and arrives, then open `demo-store.getxyvoo.com`.

Vercel preview deployments don't get wildcard subdomains, so test stores there at `/shop/<store>`.

### Phase 4: Registration and authentication (M). Code done 5 October 2026; end-to-end test waits on the migration

**Built:**
- **Migration `20261005120000_account_codes.sql`:**
  - `public.account_codes` holds hashed six-digit codes. Each lasts 10 minutes and allows 5 attempts.
  - A new code can be sent at most once a minute.
  - A service-role-only `find_auth_user_by_email` function.
  - Drops the unused `store.email_otps`.
- **Registration** (`/api/store/register`):
  - New fields: full name, phone and terms acceptance (with a timestamp).
  - The account is created **unconfirmed**, because Supabase blocks password sign-in until the email is confirmed.
  - A code is emailed through Mailtrap, and the register page switches to an "enter the code" step.
  - Confirming signs the owner in and opens the dashboard.
- **Store sign-in:** an unconfirmed owner who tries to sign in gets the same code step, then is signed in.
- **Forgot password** (`/auth/forgot-password?for=storefront|hms`) works for both products: email, then code and new password, then a link back to the right sign-in page. Both sign-in pages link to it.
- **Security and branding:**
  - Responses are identical whether or not an account exists, so the pages can't be used to find out who has signed up.
  - Requests are rate-limited per IP address and per email address.
  - The emails are branded with the existing XYVOO email layout.
- Google sign-up and the hotel sign-up are unchanged.

**Decisions:**
- **Store name and address stay on the register form**, because the store record is created at registration. Wizard step 1 will let the owner change them and add the rest.
- **Sending unfinished merchants back to the wizard moves to Phase 5**, because the wizard route doesn't exist yet.

**Known issue (existing, not from this work):** `/register/storefront` renders its form twice, a desktop copy and a mobile copy with one hidden, so every field ID appears twice. On phones the labels can point at the hidden copy. The fix is to render the form once.

### Phase 4 (original scope)
- Register form fields as in section 4, and pass `plan` and `template` through to the wizard.
- Email verification by one-time code (`store.email_otps`), following the hotel pattern.
  - Avoid the faults found there: no tenant ID taken from the browser, and no metadata overwrites.
- Forgot and reset password, for stores and the HMS. The existing FAQ already promises this.
- `/api/store/auth/post-login-redirect` sends merchants who haven't finished setup back to their wizard step.

### Phase 5: Onboarding wizard (L). Code done 5 October 2026; not yet walked through signed in

**Built:**
- **Routes:**
  - The wizard is at `/storefront/[slug]/welcome/[step]`, full screen.
  - Dashboard pages moved into `storefront/[slug]/(dashboard)/` so they keep the sidebar.
  - `[slug]/layout.tsx` is now only the members-only check.
  - The `(dashboard)` layout sends stores that haven't finished setup to their current wizard step.
  - Sign-in does the same (`getUserStoreDashboardPath`).
  - Existing stores are marked as set up, so they aren't affected.
- **Steps** (rules in `src/lib/store/site/onboarding-steps.ts`, saving in `onboarding-save.ts`, API `POST /api/store/onboarding`):
  1. **Store basics:**
     - Store name.
     - Web address, with a live availability check (`GET /api/store/subdomain-check`).
     - What you sell.
     - Country. The currency follows the country: Nigeria, Ghana, Kenya and South Africa, the countries Paystack settles to.
     - Changing the web address renames the store and moves the wizard to the new address.
  2. **Template:** the three templates with live thumbnails and links to the full static previews. The template chosen from the gallery or the merchant's category is pre-selected.
  3. **Brand:**
     - Logo upload, through the existing image upload.
     - The template's colours or a custom brand colour. The same contrast check runs in the browser and on the server, and colours that make button text unreadable are refused.
     - A font pairing, with the template's recommended pairings first.
     - A tagline.
  4. **Contact and delivery:**
     - Business email, phone, WhatsApp and address.
     - One delivery charge, optional free delivery over an amount, and optional collection in person. These are stored as `store.delivery_zones`.
     - Social links, https only.
  5. **Plan:**
     - The plan cards from `pricing.ts`.
     - **Free:** active immediately.
     - **Standard:** saved as "pending payment". The store keeps the 4% fee until Phase 6 billing exists, and the step says so.
     - **Enterprise:** the enquiry is saved on the subscription and emailed to hello@ through the contact-form email, and the store starts on Free.
  6. **Preview:** the store's draft in a frame (members see the draft at `/shop/<slug>`). Finishing marks setup complete and opens the dashboard.
- Each step is saved before moving on. Steps can be revisited but not skipped. Only owners and admins can run the wizard.
- **Checked:** type check, lint, tests (including the step rules), and that signed-out visitors and API calls are refused. **Not checked signed in.** That needs a store owner account, and local development points at the production database.

**Not done:**
- **The favicon** uses the logo as it is. There's no separate favicon file yet.
- **Publishing** doesn't exist yet, so a store finishing the wizard stays in draft. That comes in Phases 7 and 8.

### Phase 6: Payments and billing (L). Code done 6 October 2026; inactive until the platform Paystack keys are set

**Built:**
- **Migration `20261006120000_store_subscription_payments.sql`:**
  - The subscription email token, which is needed to cancel.
  - `store.subscription_payments`, so sign-up payments are checked against our own records.
- **Platform Paystack client** (`src/lib/payments/platform-paystack.ts`): bank list, account-name lookup, subaccount create and update, the Standard sign-up payment and cancellation.
  - Environment variables: `PAYSTACK_PLATFORM_SECRET_KEY`, `PAYSTACK_STANDARD_PLAN_CODE` and `PAYSTACK_SPLIT_BEARER` (in `.env.example`).
  - With no secret key set, every payment screen says payments aren't switched on yet.
- **Fee rules** (`src/lib/store/billing.ts`, tested):
  - Free: 4%.
  - Standard: 0% while paid up, including a 7-day grace period after a failed renewal and until the end of the paid month after cancelling. After that it returns to 4%.
  - Enterprise: the stored agreed rate.
- **Checkout** (`/api/shop/[slug]/checkout`):
  - A store with a payout account pays through XYVOO's account, with `subaccount`, `transaction_charge` (the exact fee for this order) and `bearer`.
  - The fee is recorded on the order (`platform_fee`, `platform_fee_percentage`) and the subaccount on the payment intent.
  - Stores still on their own keys work as before, with no fee recorded or collected.
  - The verify route picks the right key from our own records.
- **Webhook** (`/api/webhooks/paystack`):
  - Events signed with the platform key cover split-payment orders, the first Standard payment, renewals, subscription created, payment failed and cancelled.
  - Other events go to the existing own-keys path.
  - All handlers can safely run twice.
- **Dashboard → Settings ("Payments and plan"):**
  - **Get paid:** choose a bank, enter the account number, check the account holder's name, then save. This creates or updates the Paystack subaccount. Only the last four digits are stored.
  - **Plan and fees:** the current plan and fee, "Switch to Standard" (opens Paystack, then the return page at `/storefront/<slug>/billing/callback`), and cancel with a confirmation step.
  - The old own-keys form only shows for stores that already use it.
- The shop's checkout page offers payment when the store has a payout account **or** its own keys.
- **Admin API:** `PATCH /api/platform/stores/<tenantId>/plan` (platform admins only) sets an agreed Enterprise rate or returns a store to Free.
- **Checked:** type check, lint, tests, and that signed-out calls and forged webhooks are refused or ignored. **Not tested against Paystack:** there are no platform keys in this environment.

**To go live:**
1. Create the Standard plan in the Paystack dashboard: ₦10,000, monthly. Copy its `PLN_…` code.
2. Set `PAYSTACK_PLATFORM_SECRET_KEY` (test key first) and `PAYSTACK_STANDARD_PLAN_CODE` in Vercel and `.env.local`.
3. In Paystack, set the webhook URL to `https://getxyvoo.com/api/webhooks/paystack`.
4. Agree with Paystack:
   - **Who pays Paystack's charge.** The default `subaccount` means the store pays, as it does today with its own keys. With `account`, XYVOO would pay Paystack's fees on Standard stores' sales while earning nothing from them.
   - **Refunds and chargebacks** on split payments.
   - **Settlement timing.**
5. Test end to end with Paystack test keys: add a payout account, place an order, check the split in the Paystack dashboard, then subscribe to and cancel Standard.

**Not done:**
- **An admin screen for Enterprise rates.** The platform tenant page is hotel-only; the API exists.
- **Moving older stores** from their own keys to payout accounts. That's the merchant's action from Settings; nothing forces it yet.

### Phase 6 (original scope)
- **XYVOO's Paystack account:** platform keys are held only in Vercel environment variables, never in the database or in code.
- **Subaccounts:**
  - On "Get paid", check the bank details with Paystack's account-resolve call, then create a subaccount with `percentage_charge` set from the plan.
  - Save `subaccount_code` and the masked account details in a new table, `store.payout_accounts`.
  - When the plan changes, update `percentage_charge`.
- **Checkout:**
  - `src/lib/shop/paystack.ts` and the checkout API start transactions on XYVOO's keys, passing the store's `subaccount`.
  - `store.create_guest_order` records `platform_fee` and `platform_fee_percentage`.
  - The webhook at `src/app/api/webhooks/paystack/route.ts` checks the signature against XYVOO's secret.
- **Existing stores using their own keys:** keep that path working until each has set up a subaccount, then remove `tenants.paystack_setup` from store checkout.
  - Hotel and HMS payments are not affected.
- **Standard:**
  - A Paystack plan and subscription on XYVOO's account.
  - Webhooks (`subscription.create`, `invoice.payment_failed`, `subscription.disable`) update `store.subscriptions`.
  - If a renewal fails, the store returns to Free (4%) after a grace period and the merchant is emailed.
- **Enterprise:** a lead form goes to sales. A platform admin can set `fee_percentage` per tenant.
- **To agree with Paystack before launch:**
  - who pays Paystack's own transaction charge (the `bearer` setting)
  - how refunds and chargebacks are handled on split payments
  - settlement timing to subaccounts

### Phase 7: Dashboard and checklist (M). Code done 7 October 2026; not walked through signed in

**Built:**
- **Sidebar:** Overview, Products, Collections, Orders, Delivery, Payments, Settings. Website and Domain come with Phases 8 and 9.
- **Overview → go-live checklist** (`src/lib/store/go-live.ts`): reads the real state of products, the payout account (or own keys), delivery options, collections, and whether the store is published.
  - **Publish** needs a product on sale and a way to take payment (D6). It copies the draft to the live site, keeps a numbered copy in `store.site_versions`, and sets the store live.
  - **Take offline** sets the store to paused, so customers see "opening soon".
  - Publishing again pushes later changes.
  - API: `POST /api/store/site/publish`.
- **Collections:**
  - Create, edit and delete.
  - Name, web address, description, cover image (alt text required when there's an image), shown or hidden.
  - Products picked from a searchable list, in the order they're ticked.
  - Only products belonging to the store are saved.
  - API: `/api/store/collections` and `/api/store/collections/[id]`.
- **Delivery:**
  - Add, edit, delete and hide delivery options: name, charge, free over an amount, delivery time and areas, or collection in person.
  - API: `/api/store/delivery-zones` and `/api/store/delivery-zones/[id]`.
- **Delivery at checkout** (migration `20261007120000_store_order_delivery.sql` adds `orders.delivery_fee` and `delivery_method`):
  - The shopper picks an active option at checkout.
  - The server works out the charge again, including the free-over threshold, and adds it to the order total and the payment.
  - Collection skips the address.
  - Stores with no options charge for items only.
- **Payments** has its own page. **Settings** is now "Store details": name, what you sell, contact details and socials (`/api/store/profile`).
- **Checked:** type check, lint, tests (including the delivery rules), and that signed-out visitors are refused. **Not walked through signed in** (no test account on the production database).

**Not done:**
- **Team members** under Settings.
- **Changing the web address after setup.** That belongs on the Domain screen in Phase 9.

### Phase 8: Website editor (XL)
- Eight tabs, with a live preview in an iframe of the store rendering `draft`. Preview access uses a signed, short-lived preview token.
- Changes save automatically to `sites.draft`.
- Editing for Pages, Navigation and Media, with alt text required.
- Publish:
  - Check D6.
  - Show the differences from the live version.
  - Copy `draft` to `published`, increment the version and write `site_versions`.
- Restore an earlier version.

### Phase 9: Domain settings, QA and launch (M)
- A Domain screen for changing the subdomain and copying the store link.
- End-to-end tests of the whole journey: register → wizard → product → Paystack test mode → publish → buy.
- Accessibility (WCAG 2.2 AA) and Lighthouse checks on each template, on mobile and desktop.
- Update `docs/XYVOO_MODULES_STATUS.txt`.

**Order:** Phase 0 → 1, then Phases 2 and 3 alongside each other, then 4 → 5 → 7 → 8 → 9. Phase 6
can start as soon as D7 is decided, and must finish before launch.

---

## 7. D7: collecting the 4% fee (decided: option A)

Merchants currently connect their **own** Paystack keys, so shoppers' money goes
straight to the merchant and XYVOO never touches it. To take 4%, one of these
has to change:

- **A. Paystack subaccounts with split payments (chosen).**
  - XYVOO's Paystack account processes the payment.
  - Each merchant is a subaccount, registered with their bank details, and XYVOO's share is set as a percentage.
  - Paystack deducts the fee automatically when the payment settles.
  - Effects:
    - The "Connect Paystack" step asks for bank details, not API keys.
    - The merchant has no Paystack dashboard of their own.
    - XYVOO needs to agree settlement and refund handling with Paystack.
- **B. Keep the merchants' own keys and invoice the fee monthly.**
  - Simplest to build.
  - XYVOO carries the risk of not being paid, and has to chase unpaid invoices.
- **C. Hybrid.** Free stores must use subaccounts. Standard and Enterprise stores can bring their own keys.

This is a commercial decision as much as a technical one. Please confirm it with whoever owns
pricing before Phase 6 starts.

---

## 8. Risks

- **Converting the templates is the largest job.** About 30 pages each, sharing one base layer.
  Convert Linden Home fully first, then build the other two as variants.
- **Changing a subdomain breaks links.** Keep the old slug as a redirect for 90 days.
- **Merchant content and the main domain's reputation.** Watch for abuse. A separate store domain can be added later by changing `STOREFRONT_ROOT_DOMAIN`.
- **Customer accounts, wishlists and order tracking** appear in the templates but have no tables behind them.
  Hide them at launch and plan them as a follow-on phase.
