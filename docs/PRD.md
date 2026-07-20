# XYVOO HMS — Product Requirements Document

**Scope:** This document describes the **hotel HMS** app in **`xyvoo-next`** only.  
**Sister product (e-commerce platform):** The **multi-tenant store** product lives in **`xyvoo`** — see [`../xyvoo/docs/PRD.md`](../xyvoo/docs/PRD.md) for the **store platform application description** (same filename for now).

---

**Product:** XYVOO — cloud hotel management system (HMS) for independent hotels in Africa  
**Stack (current implementation):** Next.js (App Router), Supabase (Auth + Postgres, `hotel` schema), Paystack (billing), email (Mailtrap / production SMTP)  
**Document status:** Reconstructed from the live codebase and internal parity notes — treat as living requirements, not legal spec.

---

## 1. Vision & problem statement

### Vision

Give independent hotels (boutique chains, guesthouses, mid-size properties) software that feels as capable as chain-grade PMS + operations tools, without enterprise cost or complexity — tuned for African markets (payments, connectivity expectations, local operations).

### Problems we solve

- Fragmented tools (spreadsheets, WhatsApp, paper) for reservations, rooms, and guest experience  
- Weak staff access control (everyone sees everything, or shared logins)  
- Slow check-in / poor visibility into room status and housekeeping  
- Hard-to-use or unaffordable international HMS products for smaller properties  

### Product promise (marketing-aligned)

- Single full-featured plan (no tiered feature locks) with flexible billing (monthly / quarterly / yearly)  
- 14-day trial, Paystack-friendly payments  
- Role-based “department stations” with controlled access  
- Web-first HMS with paths scoped per hotel (`/hms/[tenant-slug]/…`)

---

## 2. Goals & non-goals

### Goals

| ID | Goal |
|----|------|
| G1 | Authenticated users can onboard or join a hotel tenant and land in the correct experience (platform admin vs hotel staff). |
| G2 | Each hotel operates in an isolated tenant context (slug/subdomain + `hotel` schema data). |
| G3 | Hotel operators can configure branding, staff access, and core modules from a consistent HMS shell. |
| G4 | Marketing site drives awareness, trust, and conversion to registration. |
| G5 | Security baseline: protected routes for admin, tenant directory, onboard, and HMS; Supabase session cookies. |

### Non-goals (current phase)

- Full OTA / channel manager parity (may appear as roadmap / “coming soon” in UI)  
- Native mobile apps (PWA / responsive web is in scope)  
- Multi-property chain roll-ups beyond per-tenant slug (unless explicitly added later)  

---

## 3. Personas & access model

### 3.1 Platform operator (XYVOO internal)

- **Identifier:** Email on `@xyvoo.com` (treated as platform admin for redirect logic).  
- **Needs:** See all hotel tenants, status (active vs pending trial), onboarding entry points, support for internal ops.  
- **Primary surfaces:** `/admin`, `/tenants`, `/tenants/[id]`, `/onboard`.

### 3.2 Hotel owner / general manager

- **Needs:** Full property setup, billing decisions, staff and roles, branding, analytics orientation.  
- **Primary surfaces:** Registration → trial / payment → `/hms/[slug]/dashboard`, Settings, module areas as permitted.

### 3.3 Department staff (front desk, housekeeping, F&B, etc.)

- **Needs:** Fast, focused UI for their department; credentials managed by owner/admin.  
- **Primary surfaces:** Subset of HMS routes; access governed by role metadata and future route guards (see §8).

### 3.4 Prospect (not yet a user)

- **Needs:** Understand product, pricing, company story, contact sales/support.  
- **Primary surfaces:** `/home` and subpages (`/home/pricing`, `/home/about`, …), `/register`.

---

## 4. Information architecture (routes)

### 4.1 Public / low-friction

| Route | Purpose |
|-------|---------|
| `/` | Canonical entry → redirect to marketing home. |
| `/home` | Marketing landing. |
| `/home/about`, `/home/team`, `/home/pricing`, `/home/blog`, `/home/careers`, `/home/support`, `/home/contact` | Trust, pricing, content, contact. |
| `/register` | Hotel self-registration (multi-step: property → OTP → account → trial / payment). |
| `/auth/login` | Supabase email/password sign-in; post-login redirect API resolves destination. |
| `/privacy`, `/terms` | Legal / compliance pages. |

**Note:** Legacy `/website` should redirect to `/home` (SEO/bookmarks).

### 4.2 Authenticated — platform

| Route | Purpose |
|-------|---------|
| `/admin` | Platform overview: tenant counts, quick links (e.g. onboard). |
| `/tenants` | Tenant list (hotels on platform). |
| `/tenants/[id]` | Single-tenant drill-down. |
| `/onboard` | Internal / assisted hotel onboarding (workflow TBD vs self-serve register). |

**Middleware:** These paths require a signed-in user (see §8).

### 4.3 Authenticated — hotel HMS

| Route | Purpose |
|-------|---------|
| `/hms/[slug]/setup` | Guided setup / empty state entry. |
| `/hms/[slug]/dashboard` | Operational home. |
| `/hms/[slug]/frontdesk` | Front desk operations. |
| `/hms/[slug]/reservations`, `…/new`, `…/[id]` | Reservation pipeline. |
| `/hms/[slug]/rooms` | Room inventory / status. |
| `/hms/[slug]/guests`, `…/[id]` | Guest directory / profile. |
| `/hms/[slug]/accounts` | Finance / billing orientation. |
| `/hms/[slug]/restaurant-bar` | F&B. |
| `/hms/[slug]/inventory` | Stock / procurement alignment. |
| `/hms/[slug]/housekeeping` | Housekeeping board / tasks. |
| `/hms/[slug]/settings` | Tenant settings: access, branding, staff creation hooks. |

**Slug resolution:** `[slug]` maps to tenant identity (`subdomain` or `name` or `id` fallback) for `product = hotel`.

---

## 5. Functional requirements

### 5.1 Marketing website

- **M1** Responsive layouts, consistent header/footer navigation.  
- **M2** Pricing reflects single-plan positioning and billing cycle copy.  
- **M3** Contact page collects lead-style fields (implementation may be demo/submit stub until backend wired).  
- **M4** Blog and resources support editorial content (static or CMS TBD).

### 5.2 Registration & trial

- **R1** Capture hotel profile: name, email, phone, country, city, address, room count, hotel type, terms acceptance.  
- **R2** OTP verification via API (`send-otp`, `verify-otp`).  
- **R3** Account password capture with validation.  
- **R4** Start trial and/or initiate Paystack payment (`start-trial`, `initiate-payment`).  
- **R5** City/address lookup via internal geocoding proxy (`/api/location/search`) with sensible limits and country bias.

### 5.3 Authentication & session

- **A1** Email/password login via Supabase.  
- **A2** After login, `POST /api/auth/post-login-redirect` returns `redirectTo`:  
  - Platform admin (`@xyvoo.com`): respect `from` query/body or default `/admin`.  
  - Hotel user: first hotel membership → `/hms/[slug]/dashboard`, or `/register` if none.  
- **A3** Middleware protects `/admin`, `/tenants`, `/onboard`, `/hms/*` — unauthenticated users go to `/auth/login?from=…`.

### 5.4 Platform administration

- **P1** List tenants with derived display name, slug, status (`active` / `pending` today; type system allows `suspended` / `cancelled` for future use).  
- **P2** Join profile + latest registration session for plan/contact hints.  
- **P3** Entry points to onboard new hotels.

### 5.5 Hotel tenant (HMS)

- **H1** HMS shell: sidebar nav across modules; hotel display name + optional `logo_url` from branding API.  
- **H2** Settings: department access matrix (documented roles), staff creation with department role and Supabase user provisioning (API-backed).  
- **H3** Each module page: at minimum scaffolded UI with empty/loading states; replace mock data with Supabase reads/writes as features land.  
- **H4** Branding API persists `logo_url` / colors as implemented in schema.

### 5.6 Department roles (source of truth for UX copy & staff creation)

| Role | HMS areas (summary) | Login creatable by owner/admin |
|------|---------------------|--------------------------------|
| Admin / GM | All | Yes |
| Front Desk | Front Desk, Reservations, Smart Access, Accounts (partial) | Yes |
| Housekeeping | Housekeeping | Yes |
| F&B Staff | Food & Beverage | Yes |
| Kitchen | F&B (KDS view only) | Yes |
| Maintenance | Maintenance | Yes |
| Procurement | Procurement (vendors, purchase orders, receiving, budgets, reports) — read-only visibility into Inventory reorder data, no Inventory write access | Yes |
| Store / Inventory | Inventory | Yes |
| Accounts | Accounts & Finance, Analytics (partial) | Yes |
| HR Manager | HR & Scheduling | Yes |
| Revenue Manager | Revenue Management, Analytics | Yes |
| Owner | Analytics only (read-only) | No |

**API expectation:** Staff creation validates `department_role` against creatable roles; maps to Supabase `user_metadata` / app metadata for future authorization.

---

## 6. Data & integrations (high level)

### 6.1 Core entities (conceptual)

- **Tenant** (`tenants`): hotel product row; `subdomain`, `name`, `display_name`, branding fields.  
- **Membership** (`hotel.memberships`): user ↔ tenant link.  
- **Profile** (`hotel.profiles`): room count, trial dates, contact/geo, etc.  
- **Registration session** (`hotel.registration_sessions`): onboarding email, billing metadata.  
- **Users:** Supabase Auth users; metadata carries department role for HMS.

### 6.2 Integrations

- **Supabase:** Auth, Postgres, RLS (policies to be documented per table).  
- **Paystack:** Subscription / payment initiation from registration flow.  
- **Email:** Transactional OTP and notifications (env-driven provider).  
- **OpenStreetMap Nominatim:** Used only server-side via `/api/location/search` with User-Agent discipline.

---

## 7. Non-functional requirements

- **NFR1 Performance:** Marketing pages should achieve good LCP; prefer `next/image` for static assets where applicable.  
- **NFR2 Security:** No service role keys in client bundles; server-only secrets for admin APIs.  
- **NFR3 Privacy:** Terms/privacy published; minimize PII in logs.  
- **NFR4 Observability:** Add structured logging / error tracking as the app hardens (Sentry etc. — TBD).  
- **NFR5 Quality:** ESLint/TypeScript clean on CI; shared types in `@/types` for cross-cutting shapes.

---

## 8. Authorization roadmap (explicit gaps)

**Current state (from codebase):** Middleware enforces **authentication** on platform + HMS routes; **fine-grained role-based route enforcement** (e.g. Front Desk-only paths) should be specified and implemented as a dedicated milestone.

**Target behavior (recommended PRD):**

- Map each HMS route group to allowed `department_role` / `role_key` values.  
- Deny with 403 or redirect to `/hms/[slug]/dashboard` when role ∉ allowed set.  
- Owner read-only: enforce server-side + UI hide for mutating controls.

---

## 9. Milestones & parity (engineering backlog)

Internal parity tracker (`BASE44_PARITY_MAP.md`) distinguishes:

- **Migrated:** Marketing `/home/*`, `/register` feature folder.  
- **Evolving:** Admin/tenants/onboard/HMS routes exist as shells or partial UIs — replace placeholders, wire lists/tables to live data, align empty/error states across modules.

**Suggested milestone order**

1. HMS dashboard KPIs from real data  
2. Reservations CRUD + calendar/list  
3. Rooms board + housekeeping linkage  
4. Guests CRUD + search  
5. Accounts / invoices (Paystack reconciliation)  
6. Inventory / F&B depth  
7. Harden RBAC middleware + Settings UX alignment  

---

## 10. Success metrics (to fill with business targets)

| Metric | Definition | Target (TBD) |
|--------|------------|--------------|
| Activation | Registered → verified OTP → trial started | |
| Time-to-value | First reservation or room created | |
| Retention | MAU per property / churn | |
| NPS | Post-trial survey | |
| Revenue | MRR / ARPA | |

---

## 11. Open questions

1. **Channel manager:** Vendor and timeline vs in-house sync?  
2. **Multi-property:** Single login across hotels under one group?  
3. **Offline / poor network:** PWA offline scope for front desk?  
4. **Localization:** Languages, currency display beyond ₦ defaults?  
5. **Support:** In-app ticketing vs email-only for v1?  

---

## 12. Document control

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 0.1 | 2026-05-04 | Engineering (reconstructed) | Initial PRD from codebase |

---

*End of PRD*
