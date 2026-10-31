# KEZMOTO — Supabase setup

Everything in the app is written and wired. What is left is the part that can
only be done from a Supabase account: creating the project and running these
files. About ten minutes end to end.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) (free tier, no card).
2. New project → **region: Southeast Asia (Singapore)** — closest to the
   Philippines.
3. Save the database password somewhere safe. You will not be shown it again.

## 2. Point the app at it

Project Settings → API, then:

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` (Project URL) and `VITE_SUPABASE_ANON_KEY`
(anon / public key). `.env.local` is git-ignored. The app throws a named error
on boot if either is missing, so a blank value fails loudly rather than
silently.

## 3. Run the migrations

SQL Editor → New query → paste each file, in order, and run:

| File | What it does |
|---|---|
| `migrations/0001_schema.sql` | Tables, indexes, constraints |
| `migrations/0002_rls.sql` | RLS on every table, plus the policies |
| `migrations/0003_auth_trigger.sql` | Creates a `profiles` row per signup |
| `migrations/0004_storage.sql` | The two buckets and their access rules |
| `migrations/0005_realtime.sql` | Publishes `messages` for live chat |
| `migrations/0006_transactions_schema.sql` | Phase 3: `transactions`, `verification_checklist`, `inspections`, `reviews` |
| `migrations/0007_transactions_rls.sql` | Phase 3: RLS on those four tables, plus two additive policies on `chats`/`transactions` so an admin can see an unclaimed middleman request |
| `migrations/0008_fix_rating_trigger.sql` | Phase 3 fix: `refresh_rating_avg` needed `security definer` — see *Notes on the schema* below |
| `migrations/0009_payments_schema.sql` | Phase 4: commission + meetup columns on `transactions`, the `payments` table (manual GCash submission + admin review), the private `payment-proofs` bucket, and `sync_commission_status` |
| `migrations/0010_payments_rls.sql` | Phase 4: RLS on `payments` — the seller may submit their own pending payment, only an admin may confirm/reject it — plus report-visibility policies so *any* admin sees every transaction/payment, not just their own |
| `migrations/0011_payments_realtime.sql` | Phase 4: publishes `transactions` and `payments` so an admin's confirm/reject appears live for the seller |
| `migrations/0012_ai_features_schema.sql` | Phase 5: `ai_chatbot_logs`, `fraud_flags` tables; score/breakdown columns on `listings`; `enforce_listing_score_lock` and `sync_fraud_removal` triggers; `pg_trgm` extension + `find_similar_listings` |
| `migrations/0013_ai_features_rls.sql` | Phase 5: RLS on `ai_chatbot_logs` (own rows) and `fraud_flags` (admin-only) |
| `migrations/0026_user_reports_schema.sql` | `profiles.is_disabled` / `disabled_at` / `disabled_reason`; `user_reports` table; `is_admin()` and `is_disabled_user()` helpers |
| `migrations/0027_user_reports_rls.sql` | RLS for `user_reports`; admins can update any profile; trigger locking `role` / disabled columns for non-admins; restrictive policies so disabled accounts can't post. **Apply 0026 and 0027 (SQL Editor) before using Report user / Manage Users.** |
| `migrations/0028_require_verified_to_post.sql` | `is_verified_or_admin()` helper + restrictive insert policy on `listings`: only ID-and-face-verified customers (or admins) can post a unit |

If `0004` errors on the `storage.objects` policies (some projects lock that
table down), create the two buckets by hand in Storage — `listing-photos`
**public**, `listing-documents` **private** — and add the same policies through
Storage → Policies.

The RLS and trigger files (`0002`, `0003`, `0005`, `0007`, `0008`, `0010`,
`0011`, `0013`) are safe to paste again — every `create policy`/`create
trigger` is preceded by a `drop … if exists`. `0009` and `0012` are mostly
safe too (`add column if not exists`, `create table if not exists`), except
their `alter … add column` statements will no-op harmlessly rather than error
if re-run. `0001` and `0006` are the only genuinely first-time-only files:
their bare `create table` statements error on a second run once the tables
exist.

## 4. Authentication settings

Authentication → Providers → Email is on by default. While testing, turn
**Confirm email** off (Authentication → Sign In / Providers): with it on, a
signup returns no session and the app tells the user to go and confirm before
logging in. Turn it back on before real users arrive.

### Password reset email via Brevo

"Forgot password?" calls `resetPasswordForEmail`; Supabase sends the email and
the link opens `/reset-password`. Supabase's built-in mailer only sends a few
emails an hour (and only to team members), so route it through Brevo:

1. **Brevo**: Senders, Domains & Dedicated IPs → add and verify the sender
   address (e.g. `no-reply@yourdomain`). Then SMTP & API → **SMTP** tab →
   *Generate a new SMTP key*. Note the SMTP login shown on that page.
2. **Supabase → Authentication → Emails → SMTP Settings**: enable custom SMTP.
   - Host `smtp-relay.brevo.com`, port `587`
   - Username: the Brevo SMTP login (not your Brevo account email unless they match)
   - Password: the Brevo SMTP key
   - Sender email: the verified address; sender name `KEZMOTO`
3. **Supabase → Authentication → URL Configuration → Redirect URLs**: add
   `http://127.0.0.1:5180/reset-password`, `http://localhost:5173/reset-password`
   and your production `https://<domain>/reset-password`. A link to any other
   URL falls back to the Site URL and the reset screen never opens.
4. Authentication → Emails → Templates → **Reset password**: subject
   `Reset your KEZMOTO password`, body = the whole of
   `supabase/templates/reset-password.html` (logo, message, orange button).
   The logo loads from `{{ .SiteURL }}/brand/email-logo.png`, so the Site URL
   must be the live Render address for it to show in Gmail.
5. Optional: Authentication → Rate Limits → raise "emails sent per hour" now
   that Brevo carries the load (the app itself waits 60 s between requests).

The SMTP key lives only in the Supabase dashboard; never put it in `.env` or
the app.

## 5. Accounts and demo data

The login screen no longer lists them, but these two demo accounts are still handy. Create them through the
app's own Register screen so Supabase Auth owns the credentials:

| Role | Email | Password |
|---|---|---|
| Customer | `kez@kezmoto.app` | `kezmoto` |
| Admin | `admin@kezmoto.app` | `kezmoto` |

Signup always creates a Customer. Promote the admin once:

```sql
update profiles set role = 'admin'
where profile_id = (select id from auth.users where email = 'admin@kezmoto.app');
```

Then optionally run `seed.sql` for four listings and two wanted posts, so the
Landing and Home grids are not empty on the first run.

## 6. Verify RLS

Two browsers (or one plus a private window), one account each.

- [ ] Customer B cannot edit or remove Customer A's unit — open
      `/units/<A's listing id>/edit` as B; the save fails and the unit is
      untouched.
- [ ] Customer B cannot read a thread they are not in — `/chat/<A's chat id>`
      shows "That conversation could not be opened."
- [ ] Signed out, `/` and `/listing/:id` still render active units, and any
      write attempt is rejected.
- [ ] A document URL copied out of the app stops working after an hour, and the
      raw object URL (`…/storage/v1/object/public/listing-documents/…`) never
      works at all.

A quick way to prove the policies rather than the UI — run in the SQL editor,
which bypasses RLS, to get ids, then try the same reads from two signed-in
browser sessions.

## 7. Try the Phase 3 flow

1. As a customer, message a seller from any listing, then tap **Request
   Middleman** in the chat — this creates the `transactions` row and flips
   `chats.status`.
2. As the admin account, open **Middleman Requests** in the side menu, tap
   **Join** on that deal. You land back in the chat as its third participant;
   your messages there render with the "KEZMOTO admin" badge.
3. From the chat, open the transaction detail (link above the messages, admin
   only) to run the **Verification** checklist —
   it advances the transaction's status automatically.
4. Move status to `completed` from the **Overview** tab. Back on the customer
   side, `/transactions` (or the chat thread) now offers a star rating for the
   other party; `profiles.rating_avg` updates itself via the
   `refresh_rating_avg` trigger, no client recompute involved.
5. **Reports** (admin, side menu) lists every transaction with status and date
   filters — no commission or totals yet, `agreed_price` is reference-only
   until Phase 4.

## 8. Set KEZMOTO's GCash number

There is no payment gateway in this build — the seller pays KEZMOTO's own
GCash number directly, so there is no external account to sign up for and
nothing to deploy before you can try it. Open
`src/components/TransactionTracker.tsx` and set `KEZMOTO_GCASH_NUMBER` /
`KEZMOTO_GCASH_NAME` near the top of the file to the real number this app
should tell sellers to pay.

## 9. Try the Phase 4 flow

Nothing external needed — this runs entirely inside the app and your Supabase
project, right now:

1. Get a transaction to `verified` or later (follow the Phase 3 flow above),
   with an `agreed_price` set from the Overview tab.
2. As the **seller**, open the deal's chat thread — the tracker shows the
   commission owed (5% of agreed price) and the GCash number to send it to.
   Enter any reference number and attach any image as the "screenshot" (this
   is entirely manual, so nothing needs to look real) → **Submit payment**.
3. As the **admin**, open the same deal's Transaction Detail → Overview. The
   Commission panel now shows the submitted reference number and the
   screenshot with **Confirm payment** / **Reject** buttons. Confirming sets
   `commission_status = 'paid'` and (if the deal is at `verified` or later)
   advances `status` to `'payment'` — both via the `sync_commission_status`
   trigger, not a direct client write.
4. Back on the seller's side, the tracker updates to "Paid" without a
   refresh — the Realtime subscription from `0011` picks up the confirm.
5. Schedule a meetup from the same Overview tab (date/time + place), then move
   status to `completed` from the dropdown — this reopens the Phase 3 review
   prompt on both sides.
6. **Reports** (admin, side menu) shows units sold, total sales value and
   commission earned at the top, respecting the date filter — commission
   counts only confirmed (`succeeded`) payments, so a pending or rejected
   submission contributes nothing.

## 10. Deploy the Phase 5 Edge Functions

Unlike Phase 4, this phase does need something deployed — the AI calls
run server-side so the key never reaches the browser. Needs the
[Supabase CLI](https://supabase.com/docs/guides/cli) and a
[Gemini API key](https://aistudio.google.com/apikey) — free, no billing
setup or card required. The free tier is rate-limited (requests per minute);
see [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)
for current limits if a call ever fails with a 429.

Both of the transient failures these calls hit in practice — a 429 (our own
per-minute quota) and a 503 (`"This model is currently experiencing high
demand"`, Google's own capacity) — are retried inside `_shared/gemini.ts`
with backoff before the caller ever sees them, and any that still fail are
reported as one plain "the AI assistant is busy" sentence rather than
Google's raw prose. Nothing to configure.

```bash
supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy ask-chatbot
supabase functions deploy score-listing-quality
supabase functions deploy score-condition
supabase functions deploy check-listing-fraud
supabase functions deploy verify-id
supabase functions deploy face-match

supabase secrets set GEMINI_API_KEY=...
```

All six share `supabase/functions/_shared/` (`cors.ts`, `supabaseAdmin.ts`,
`gemini.ts`, `base64.ts`, `comparables.ts`) — nothing to configure there, the
CLI bundles it automatically. Because `gemini.ts` is shared, changing it means
redeploying all six, not just the one you were working on. No other secret is needed: `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are already present in every Edge Function's
environment by default.

## 11. Try the Phase 5 flow

1. Tap the floating chat button (bottom-right, on Home or any listing) and
   ask a question — **AI Assistant** answers using `ask-chatbot`, grounded in
   that listing's specs and a few comparables when opened from a listing
   page.
2. Post a new unit (**Sell**). Quality and condition scores appear on its
   card and detail page within a few seconds — `score-listing-quality` and
   `score-condition` both fire in the background right after the listing is
   created, and `listing_quality_breakdown` on the detail page shows exactly
   which checks passed.
3. `check-listing-fraud` fires at the same time, silently — nothing shows to
   the seller or buyers. As the **admin**, open **Fraud Flag Review** (side
   menu) to see anything it flagged, grouped by listing, with **Dismiss** /
   **Remove listing** actions.
4. To see a flag fire deliberately: post the same photos twice (near-duplicate
   image check), or a price far below similar listings (low-price check), or
   describe the unit with obvious scam language ("wire deposit first",
   "urgent, moving abroad") in the condition notes (AI text check).

## Before accepting real money

This build intentionally has no gateway, so most of a "going live" checklist
for a payment integration doesn't apply here — there is no API key to leak,
no webhook signature to verify. What's still worth deciding before treating
this as real:

- [ ] A refund/dispute policy — nothing here implements refunds;
      `payments.status = 'refunded'` exists as a column value but nothing
      sets it.
- [ ] What happens if a seller submits a fake screenshot — the admin's manual
      review is the only check in this design; decide what evidence you'll
      actually require before trusting it with real money.
- [ ] Whether 5% is the rate you actually want, and whether "seller pays" is
      the arrangement you want — both are one-line changes
      (`COMMISSION_RATE` in `src/services/paymentsService.ts`) but change real
      revenue once live.

## Notes on the schema

- Columns marked `KEZMOTO extension` in `0001_schema.sql` are not in the Phase 2
  brief. Each exists because a Phase 1 screen already renders that value:
  `profiles.bio`, `listings.description`, `listings.admin_assisted`,
  `chats.buyer_last_read_at` / `seller_last_read_at`, `messages.is_system`,
  `document_redactions.label`.
- `document_redactions` holds one row per document even when nothing is
  blacked out, because it also carries the document's label.
- Redaction boxes are stored as `0–1` fractions of the image, not percentages,
  matching what the Phase 1 canvas produces. They are drawn as an overlay at
  render time; burning them into the pixels server-side is a later pass.
- Removing a unit sets `status = 'removed'` rather than deleting the row, so
  chats and favorites that reference it stay intact.

### Phase 3 additions

- A `transactions` row is created exactly once per chat, at the moment either
  side requests a middleman — there is no bare `'inquiry'` row sitting there
  before that in this phase.
- The brief's `transactions` update policy is row-level only (`auth.uid() =
  admin_id or auth.uid() in (buyer_id, seller_id)`), which can't stop a buyer
  from writing `status` or `agreed_price` directly — RLS sees whole rows, not
  columns. `0007` adds a trigger, `enforce_transaction_update`, that lets an
  admin manage a transaction they own (or one still unclaimed) freely, while a
  buyer/seller may only move `proposed_price`, and only before a middleman is
  assigned.
- Two RLS policies exist purely so an admin can *discover* work: as written,
  the participant-only `select` policies on `chats` and `transactions` hide an
  unclaimed request from every admin, since none of them are
  buyer/seller/admin_id yet. The added policies open unclaimed rows (and, for
  chats, anything already flagged `middleman_requested`/`middleman_joined`) to
  any `role = 'admin'` profile — additive only, never wider than that.
- `reviews` is hardened past the brief's bare `with check (auth.uid() =
  reviewer_id)`: an insert must also point at a `completed` transaction, name
  the *other* party as reviewee, and not review yourself.
- `profiles.rating_avg` is kept current by a trigger on `reviews`
  (`refresh_rating_avg`) rather than recomputed client-side — the brief called
  this the cleaner long-term option, so it's built that way from the start.
  Live-tested this session: the function needed `security definer`, since a
  plain trigger runs with the *caller's* privileges, and `profiles`' own
  update policy only lets someone update their own row — without it, the
  trigger silently updated 0 rows whenever the reviewer wasn't also the
  reviewee, which is every real review. `0008` is the fix, with a backfill.

### Phase 4 additions (manual GCash commission, seller pays 5%, no gateway)

- KEZMOTO is a project system, not a live business with a payment-gateway
  merchant account — so there is no PayMongo/Xendit integration here, on
  purpose. The seller pays KEZMOTO's own GCash number directly and submits a
  reference number plus a screenshot; an admin reviews it by eye and
  confirms or rejects. The admin's decision *is* the trust boundary — there
  is no gateway API to independently verify the payment happened.
- `payments` has real client write policies, unlike a webhook-driven design:
  the seller may `insert` their own row (status forced to `pending` by the
  policy), and only an admin may `update` it — never the payer, buyer
  included. See `0010`.
- The owed commission amount is never cached on `transactions` — it's
  computed on demand from `agreed_price * COMMISSION_RATE`
  (`commissionAmountFor` in `paymentsService.ts`) everywhere it's shown, so
  it can't drift out of sync if the agreed price ever changes. The amount
  actually *submitted*, and the reference number, live on the `payments` row
  instead.
- Confirming or rejecting a payment is one admin action that needs to move
  two tables consistently (`payments.status`, then
  `transactions.commission_status`/`status`) — handled by a single trigger,
  `sync_commission_status`, rather than two separate app-level writes that
  could be left inconsistent with each other.
- That trigger needed `security definer` for the same reason `0008`'s
  `refresh_rating_avg` did: a plain trigger runs with the *caller's*
  privileges, and the confirming admin isn't necessarily a
  buyer/seller/admin_id participant of the row by RLS's literal reading in
  every edge case. Definer rights make the sync reliable regardless.
- `enforce_transaction_update` (0007) no longer has a service-role bypass or
  a blanket lock on commission columns — there's no service role in this
  design. The trusted writer for commission fields is now the assigned
  admin, exactly like `status`/`agreed_price` already were; buyers/sellers
  remain blocked from all three, same as before.
- Reporting surfaced a real gap while wiring the Commission Report: the
  existing admin-visibility policies (`transactions`, and by the same logic
  `payments`) only ever covered a deal an admin personally claimed or one
  still unclaimed — a second admin's Reports screen would have silently
  omitted every deal the first admin ever handled. `0010` widens both to any
  `role = 'admin'` profile, which is what a platform-wide report actually
  needs.
- Proof screenshots live in a private `payment-proofs` bucket, same shape as
  `listing-documents` from Phase 2 (owner-prefixed path, signed-URL reads,
  open to any signed-in user rather than a stricter per-transaction check —
  the same simplification `0004` already accepted for OR/CR documents).
- Nothing in this build implements refunds or a dispute flow — see *Before
  accepting real money* above.

### Phase 5 additions (AI chatbot, quality/condition scores, fraud detection)

- Every AI call goes through an Edge Function; the Gemini key lives only in
  Edge Function secrets, never in a frontend env var or bundle. The provider
  is swappable behind one wrapper (`_shared/gemini.ts`, `askGemini()`) —
  originally built against Claude/Anthropic, switched to Gemini's free tier
  since this is a project system with no budget for a paid API, without
  touching anything downstream of that one file.
- `listings.listing_quality_score`, `listing_quality_breakdown`,
  `condition_score`, `condition_score_explanation` are lockable columns: RLS
  is row-level only, so `enforce_listing_score_lock` (a `before update`
  trigger, `0012`) blocks anyone but the service-role client from writing
  them — the same "RLS can't stop a column write, a trigger can" pattern as
  `enforce_transaction_update` in Phase 3/4. The scoring Edge Functions write
  through a service-role client for exactly that reason; every other read in
  those functions uses a caller-scoped client instead, deliberately kept as
  narrow as it can be.
- Listing quality scoring is two layers, not one AI call: 80 of the 100
  points are plain rules evaluated straight from the row (photo count, spec
  completeness, mileage sanity, price sanity, location, document count) —
  cheap, deterministic, and never gameable by prompting; only the remaining
  20 (how specific the condition notes read) go to Gemini.
- Fraud detection is five checks, and only one of them calls Gemini
  (`suspicious_text`, scam-language detection). The other four are rules:
  price far below comparables, near-duplicate photos (perceptual hash —
  `src/utils/imageHash.ts`, 8×8 average hash computed client-side at upload
  and compared with Hamming distance ≤ 6 server-side), near-duplicate listing
  text (`pg_trgm` similarity via the `find_similar_listings` SQL function),
  and a seller posting more than 5 listings in 24 hours. Keeping the
  deterministic checks as SQL/rules rather than prompting the model for all
  five keeps the false-positive rate predictable and the free-tier rate
  budget down.
- `fraud_flags` has no policy for buyers/sellers at all — not "hidden in the
  UI", genuinely unreadable by anyone but an admin at the RLS layer.
  `ScoreBadges` (the component showing quality/condition on cards and detail
  pages) deliberately has no fraud variant, matching the brief's "Admin only:
  Fraud Flag Review screen" — there is no public surface where a flag could
  leak, by construction.
- `sync_fraud_removal` (`security definer`, same reasoning as
  `refresh_rating_avg`/`sync_commission_status` before it) is what actually
  removes a listing when an admin picks **Remove listing** in Fraud Flag
  Review — the client only ever updates the `fraud_flags` row it has
  permission to touch; the trigger does the cross-table `listings.status =
  'removed'` write with elevated rights.
- The AI chatbot's conversation is session-only by design (component state,
  not persisted) — only the brief's `ai_chatbot_logs` audit trail survives a
  reload, not the visible thread itself.
