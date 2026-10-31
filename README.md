# KEZMOTO — Phase 5 (AI features)

**BUY. SELL. RIDE.** — an Ionic + React (TypeScript) marketplace for second-hand
motorcycles. Phase 1 built every screen on mock data. Phase 2 replaced that data
layer with Supabase — real accounts, listings that persist, photo and document
uploads, and live chat. Phase 3 added the deal itself: a transaction lifecycle
from inquiry to completion, an admin middleman queue, an in-chat verification
checklist, and post-deal reviews. Phase 4 added KEZMOTO's own
commission — the buyer still pays the seller directly, KEZMOTO never holds the
sale itself, and the commission is settled manually: the seller pays a GCash
number and an admin reviews and confirms it. No payment gateway, no external
account of any kind — this is a project system, not a live business with a
merchant account, so that's a deliberate choice, not a placeholder for one.
Phase 5 adds AI: a floating chatbot, an automatic listing-quality score, a
condition/"worth buying" score, and background fraud detection — every AI call
runs through a Supabase Edge Function (Google Gemini's free tier), so no key ever
reaches the browser.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm run lint
npm run test.unit  # vitest
npm run test.e2e   # cypress (needs the dev server running)
```

The app needs a Supabase project before it will start — see
[`supabase/README.md`](supabase/README.md) for the setup: create the project,
paste two keys into `.env.local`, run the thirteen migrations. Phase 4's
commission flow needs nothing external at all — no gateway signup, nothing to
deploy — just one constant set to KEZMOTO's real GCash number (same file,
step 8). Phase 5's AI features are the one part of this app that *does* need
something deployed and an external key: four Edge Functions and a Gemini
API key (`supabase/README.md`, steps 10–11) — free, no card required. The
app runs fine without them, it just won't have a chatbot or scores until
they're set up.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Customer | `kez@kezmoto.app` | `kezmoto` |
| Admin | `admin@kezmoto.app` | `kezmoto` |

These are no longer built in. Register both through the app, then promote the
admin with the one-line `update` in `supabase/README.md`. Sign-up always creates
a Customer account — there is no role picker, and Admin accounts are
provisioned outside the app.

### Reviewing states and breakpoints

- Append `?simulate=empty`, `?simulate=error` or `?simulate=slow` to any route to
  force the empty, error or loading state of that screen
  (e.g. `/home?simulate=error`).
- `http://localhost:5173/dev/responsive.html?path=/home` renders the app at
  375 / 768 / 1280 side by side. Dev-only: it lives outside `public/`, so it is
  never copied into `dist/`.

## What is in this phase

Everything from Phase 1/2/3/4, plus:

- **AI Assistant** — a floating chatbot (bottom-right, on Home and Listing
  Detail), answers general marketplace questions and, when opened from a
  listing, questions about that specific unit (price framing against a few
  comparables, condition notes, etc.). Session-only conversation; every
  question and answer is also logged to `ai_chatbot_logs` for audit.
- **Listing quality score** — appears on unit cards and the detail page right
  after a listing is posted. 80 of 100 points are rules evaluated straight
  from the row (photo count, spec completeness, mileage sanity, price
  sanity, location, document count); the remaining 20 come from Gemini rating
  how specific the condition notes are. The detail page shows the full
  breakdown checklist, not just the number.
- **Condition / "worth buying" score** — a 0–100 AI read on mileage-for-age,
  condition notes, and price versus comparable active listings, with a short
  plain-language explanation shown alongside it.
- **Fraud detection** (admin-only, invisible to buyers/sellers) — five checks
  run in the background on every new listing: price far below comparables,
  near-duplicate photos (perceptual hash), near-duplicate listing text,
  a seller posting too many listings too fast, and AI-detected scam language
  in the description. Anything flagged lands in **Fraud Flag Review**
  (`/admin/fraud`, side menu), where an admin dismisses it or removes the
  listing.

Deliberately **not** implemented: showing any fraud signal to a buyer or
seller (admin-only by design, not just by UI — `fraud_flags` has no policy
for anyone else), a payment gateway of any kind (a deliberate choice for a
project system, not a placeholder — see `supabase/README.md`), escrow /
holding the sale price itself, refunds or disputes, per-deal commission
rates (one constant, seller-pays-5%, for now), and standalone
a standalone Verification *list* screen (`/admin/verification` —
reached per-deal from Transaction Detail instead). There is no inspection step.

## Structure

```
src/
  theme/variables.css     Design tokens — colour, spacing, type. Change them here, nowhere else.
  theme/global.css        Layout primitives and shared utility classes.
  types/                  Domain models, shaped like the eventual Supabase tables.
  lib/supabaseClient.ts   The one Supabase client. Every service imports it.
  lib/database.types.ts   Row types, mirroring supabase/migrations/0001_schema.sql.
  services/api.ts         Barrel: authApi · listingsApi · favoritesApi · chatsApi · wantedApi ·
                          usersApi · transactionsApi · verificationApi ·
                          reviewsApi · paymentsApi · aiApi · fraudApi
  services/*Service.ts    One file per area — the only modules that call Supabase.
  services/mappers.ts     Row ⇄ domain translation; the only place column names appear.
  utils/imageHash.ts      Client-side perceptual image hash (aHash), used by the fraud check.
  context/                AuthContext (session) · MarketplaceContext (favourites, threads)
  hooks/                  useAsync (loading/error/data) · useBreakpoint
  components/             AppPage, SideMenu, AppTabBar, UnitCard, UnitGrid, PhotoGallery,
                          RedactionCanvas, ChatPanel, TransactionTracker, ScoreBadges,
                          AiChatbot, StateViews, …
  pages/                  One file per screen, including Transactions, Middleman,
                          TransactionDetail, Reports, FraudReview.
  navigation/navItems.ts  Single source of truth for primary, secondary and admin nav.
supabase/functions/
  _shared/                cors.ts · supabaseAdmin.ts (service-role + caller-scoped clients) ·
                          gemini.ts (Gemini wrapper) · comparables.ts
  ask-chatbot/            AI Assistant
  score-listing-quality/  Layer 1 rules (80pts) + Layer 2 AI (20pts)
  score-condition/        AI condition / worth-buying score
  check-listing-fraud/    5 fraud checks (4 rules, 1 AI), admin-only output
```

### How the data layer is put together

Screens import from `src/services/api.ts` and nothing else — exactly as in
Phase 1. That module is now a barrel over one service file per area, so no page
or component holds a Supabase call:

```
services/api.ts          re-exports every api object
  authService.ts         supabase.auth + the profiles table
  listingsService.ts     listings, storage uploads, document redactions
  favoritesService.ts    favorites
  chatService.ts         chats, messages, realtime subscription
  wantedService.ts       wanted posts
  usersService.ts        public profile lookups
  transactionsService.ts transaction lifecycle, middleman queue/claim
  verificationService.ts the verification checklist (admin-only)
  reviewsService.ts      post-transaction ratings
  paymentsService.ts     manual GCash submission + admin confirm/reject — no gateway
  aiService.ts           thin wrappers over supabase.functions.invoke() for the 4 AI calls
  fraudService.ts        admin fraud-flag list + review (dismiss / remove listing)
  mappers.ts             row ⇄ domain types
  storageService.ts      bucket uploads, public + signed URLs
  simulate.ts            the ?simulate= review states
```

`AuthContext` holds the Supabase session, restores it on boot through
`supabase.auth.getSession()`, and subscribes to `onAuthStateChange`, so signing
in or out in another tab is reflected here too.

The chat thread subscribes to `postgres_changes` on `messages` filtered by
`chat_id`; new messages appear without a refresh, and Realtime enforces the same
RLS as a normal read.

`transactionsApi.requestMiddleman()` is the one place a `transactions` row gets
created — Chat Thread's Request Middleman button is the only caller. Everything
downstream (the admin claiming it, moving its status, logging a verification)
reads and writes that same row through `transactionsService.ts`.

There is no payment gateway anywhere in this app. The seller submits a
reference number and a screenshot straight into `payments` (their own RLS
insert), and an admin's confirm/reject is a normal authenticated update to
that same row — no Edge Function, no external account. A database trigger,
`sync_commission_status`, is the only thing that ever reflects that decision
onto `transactions.commission_status` (see `supabase/README.md`'s Phase 4
notes for exactly how that's enforced, and why it needed to change from an
earlier PayMongo-based design).

The AI features are the one part of the app that *does* go through an Edge
Function, on purpose: `aiApi`/`fraudApi` call `supabase.functions.invoke()`
rather than a table directly, because each of the four calls either needs the
Gemini key (never sent to the browser) or needs to write a column the
client is deliberately locked out of (`enforce_listing_score_lock`). A new
listing's three AI calls (`scoreListingQuality`, `scoreCondition`,
`checkFraud`) fire fire-and-forget right after `listingsApi.create()`
succeeds — the seller isn't blocked waiting on Gemini, the scores just appear
a few seconds later once the app's next read picks them up.

## Responsiveness

Mobile ≤ 599px · Tablet 600–1023px · Desktop ≥ 1024px, from one codebase.

- **Navigation** — bottom tab bar plus an overlay drawer on mobile and tablet; at
  1024px the tab bar is dropped entirely and `IonSplitPane` docks the sidebar
  permanently, with the page toolbar acting as the top bar.
- **Unit grids** — `IonGrid` column spans (`sizeXs` … `sizeXl`), never fixed
  widths: 1-up, 2-up, 3-up, then 4-up above 1700px.
- **Cards** — the action row switches to two columns on a container query, so it
  reacts to the card's own width rather than the viewport's.
- **Photos** — swipeable scroll-snap carousel with dots on mobile; arrows and a
  thumbnail rail from tablet up.
- **Chat** — full-screen single pane on mobile; list + thread split from 600px.

## Notes on the data

- Photos go to the public `listing-photos` bucket and are stored as paths;
  documents go to the private `listing-documents` bucket and are only ever
  handed out as one-hour signed URLs, so a signed-out visitor sees a listing
  without its document previews.
- Redactions are stored as normalised (0–1) rectangles in
  `document_redactions`, so they survive any render size. They are drawn as an
  overlay from those coordinates; burning them into the pixels server-side is a
  later hardening pass.
- Placeholder artwork in `public/mock/` is generated SVG and is still used by
  the unit form's "add a sample" buttons and by `supabase/seed.sql`. Anything
  that already looks like a URL passes through the storage resolver untouched.
- Removing a unit marks it `removed` rather than deleting the row, so existing
  chats and favorites keep resolving.
- A transaction only ever exists because a middleman was requested — there is
  no bare "inquiry" transaction sitting behind an ordinary chat. Requesting a
  middleman a second time on the same chat reuses that row rather than
  creating a duplicate.
- Buyers and sellers can only move `proposed_price`, and only before an admin
  joins; every other field is admin-controlled once assigned. That is enforced
  by a database trigger (`enforce_transaction_update`), not just the app —
  see `supabase/README.md` for why RLS alone can't express it.
- Saving a verification checklist advances the transaction's status as a
  side effect (to `verified` once every check passes) — the admin never has to
  separately click the status dropdown for that move, only every other
  transition.
- KEZMOTO never holds the sale price — only its own commission. The buyer and
  seller settle the motorcycle's price between themselves; `agreed_price` on
  `transactions` is recorded for reference and for the Reports summary, not
  moved through this app.
- The seller pays a flat 5% commission (`COMMISSION_RATE` in
  `paymentsService.ts`), computed on demand from `agreed_price` everywhere
  it's shown rather than cached — it can never drift out of sync with the
  price this way.
- A payment is "paid" only once, from exactly one place: an admin's
  **Confirm payment** action on the reviewed submission. The seller who
  submitted it can never mark their own payment succeeded — enforced by RLS,
  not just by the UI hiding the button.
- The four score/breakdown columns on `listings` can only ever be written by
  a service-role Edge Function client, never by the signed-in seller who owns
  the row — a `before update` trigger (`enforce_listing_score_lock`) blocks
  everyone else, the same "RLS is row-level, a trigger can be column-level"
  approach used for `transactions` in Phase 3/4.
- Fraud flags are genuinely unreadable by buyers and sellers — `fraud_flags`
  has exactly one RLS policy and it's admin-only — not merely hidden by the
  UI. Removing a listing from Fraud Flag Review goes through the same
  soft-delete (`status = 'removed'`) as every other removal path.
- Photo perceptual hashes (`listings.photo_hashes`) are computed client-side
  at upload time and stored unordered — they exist to detect near-duplicate
  images across *different* listings, not to preserve which hash belongs to
  which photo position.
