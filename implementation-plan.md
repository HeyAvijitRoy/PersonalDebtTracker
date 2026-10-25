# Account tracking and progress implementation plan

Prepared: 2026-10-24. Status: implementation started on `feature/account-tracking-progress`.

Stage 1 foundation is implemented: cent-accurate calculation helpers, versioned
account readers, legacy compatibility fixtures, bounded AES-GCM envelopes,
session-safe asynchronous reads, a repeatable test command, and public-asset-only
caching/deployment. New forms and history writes are not enabled in this stage.
Stage 2 persistence is implemented and tested: context-bound encrypted snapshots
and events, an encrypted IndexedDB outbox, revision conflict detection, idempotent
replay, and owner-only paired-write rules. Five emulator rule tests pass. UI
integration is complete in Stage 3: calculated/default entry, direct-entry fallback,
dated observations, APR-only freshness preservation, backdated entries, and
encrypted mutations for add/edit/import/quick adjustments. Synthetic desktop/mobile
browser checks pass. Stage 4 adds paginated history/corrections, freshness filters,
archive/issuer-status controls, frozen batched deletion/Undo, full JSON history
backup/restore with stable identities, and formula-safe CSV exports. Six emulator
rule tests cover live and restored history. Stage 5 adds manual statement/promotion
references, conditional interest guidance, optional statement-linked payment
records/status updates, atomic two-account transfer records, provisional adjustment
labels, and explicit interest-scenario opt-in/coverage. No minimum-payment fields
or exact interest-start inference are included. Stage 6 adds the dedicated Progress
page with date/account selectors, comparable balance KPIs, dated balance graphs,
accessible tables, account comparison bars, aligned utilization/limit graphs, and
derived milestones. Missing/one-point/basis-change history is handled explicitly.
Stage 7 local verification and release preparation are complete as of 2026-10-25.
See `docs/tracking-release.md` for checks, security boundaries, and the remaining
production rollout. No live cloud rules or deployment have been changed.

## Goal and scope

Make routine updates reflect the information users see in their card apps, retain
an encrypted account history, and show useful progress without confusing balance
changes with payments. Preserve the existing authentication, encryption, account
editing, search, sorting, bar/donut views, threshold hints, payoff tools,
import/export, dark mode, accessibility, and offline capability.

The completed card-level threshold hints and monthly-interest presentation were
committed separately as `c5ccc60`. This plan describes subsequent work only.

## Research decisions (reviewed 2026-10-24)

These are product decisions informed by the sources below, not statements that
the app can verify a bank account. Preserve existing features while correcting
their labels and assumptions during implementation.

| Keep | Qualification or boundary |
| --- | --- |
| Limit and available-credit entry | Label the result "Estimated balance (credit used)"; retain directly entered posted/current balance as a separate optional observation |
| Encrypted history and freshness | Record what the user observed, its date, source, and later corrections |
| Overall/per-account progress | Track estimated balance reduction/increase, not payments or inferred repayment; retain the observation source |
| Statement dates, due dates, payment logs | Manual reminders and records, not certification that issuer obligations were met |
| Utilization payment calculator | Rename FICO optics/threshold nudges to "Payments to utilization targets"; retain 30%/50%/80% as editable planning targets |
| Interest comparison and payoff tools | Explicit scenarios with input assumptions and coverage, not actual charges, verified savings, or guaranteed payoff dates |
| Promotion reminders | Keep actual entered dates/types; no inference of continued eligibility or automatic repricing |
| Archive/restore and backups | Archiving affects display, not the fact a debt exists or the account's issuer status |

Exclude minimum-payment tracking as requested. Also exclude exact interest-start
dates inferred from due dates, score-point predictions, bank-confirmed late/paid
status, automated grace-period qualification, reconstructed transaction histories,
and actual interest-saved KPIs inferred from snapshots.

Defer a full multi-APR/payment-allocation/interest-accrual engine. Initially support
optional issuer-entered balance categories and notes, flag mixed/unknown rates,
and keep them out of supposedly precise aggregate estimates. That preserves a
useful tracker without requiring users to model their complete card agreement.

### Evidence and resulting product decisions

- [Capital One: pending transactions](https://www.capitalone.com/help-center/credit-cards/card-pending-transactions/):
  holds affect available credit before charges post, and pending amounts can
  change or disappear. Therefore repayment inferred from this value is an estimate,
  and an available-credit-derived amount is not a proven interest-bearing balance.
- [CFPB: grace periods](https://www.consumerfinance.gov/ask-cfpb/what-is-a-grace-period-for-a-credit-card-en-47/):
  purchase grace periods are conditional and do not generally cover cash advances.
  Keep date reminders; do not calculate a universal interest-start date.
- [CFPB: interest calculation](https://www.consumerfinance.gov/ask-cfpb/how-does-my-credit-card-company-calculate-the-amount-of-interest-i-owe-en-51/):
  daily balances, different APR categories, and payment allocation affect charges.
  A single balance/APR snapshot supports a scenario, not a statement reconstruction.
- [myFICO: utilization targets](https://www.myfico.com/credit-education/blog/credit-utilization-be):
  30% is not a universal score-change cliff. Treat selected percentages as planning
  goals and replace "Healthy/Watch/Medium/High" credit-risk judgments with neutral
  numerical bands or target-relative descriptions. Do not promise score changes.
- [Experian: reported balances](https://www.experian.com/blogs/ask-experian/why-doesnt-credit-report-show-that-i-always-pay-in-full/):
  scoring uses lender-reported snapshots, which may differ from today's entries.
  Label app utilization an estimate and never infer an exact bureau-reporting date.
- [Experian: accounts included in utilization](https://www.experian.com/blogs/ask-experian/does-credit-utilization-include-all-credit-cards/):
  closed-account treatment can differ by scoring model. Keep closed debt in debt
  totals; show open-card utilization separately, not a purported FICO calculation.
- [CFPB: payment timing](https://www.consumerfinance.gov/ask-cfpb/when-is-my-credit-card-payment-considered-to-be-late-en-79/):
  receipt timing and payment method matter. Keep the entered due date and an
  optional issuer cutoff; do not infer delinquency or auto-shift every weekend date.
- [CFPB: deferred interest](https://www.consumerfinance.gov/ask-cfpb/i-got-a-credit-card-promising-no-interest-for-a-purchase-if-i-pay-in-full-within-12-months-how-does-this-work-en-40/):
  distinguish deferred interest from 0% APR. Expiry reminders cannot establish
  that payment-allocation or eligibility conditions have been met.
- [Capital One: residual interest](https://www.capitalone.com/help-center/credit-cards/interest-charges/):
  a paid statement can still be followed by residual charges. Celebrate recorded
  progress without a guarantee of zero future interest or a final bank payoff.

## 1. Default entry: limit and available credit

On Add Account and Update Account, default new accounts to:

- Account name, credit limit, available credit, and APR.
- A read-only preview: **Estimated balance (credit used) = credit limit - available credit**.
- An effective date (defaults to today), optional reason, and optional note.
- An alternate **Enter balance directly** mode, retained for existing accounts,
  imports, over-limit cases, and issuer information that does not fit the estimate.

Example: a $5,000 limit and $3,200 available credit produce a $1,800 estimated
balance and 36% estimated utilization. Keep the original input values and entry
method, rather than saving only the derived result.

Use concise help text: "May include pending charges or holds. This estimate may
differ from your posted balance or statement balance."

Treat these as distinct values:

| Value | Purpose |
| --- | --- |
| Estimated balance from available credit | Default day-to-day tracking value |
| Directly entered current balance | Alternate tracking value, explicitly selected |
| Statement balance and statement date | Optional reference for a particular billing cycle |
| Payment due date | Optional user-entered statement deadline |

Do not silently substitute statement balance for the current tracking value.
Do not label an available-credit estimate as a reported bureau balance, an exact
amount owed, or the amount required to avoid interest.

### Calculation and validation decisions

- Calculate money with integer cents; reject non-finite values and ambiguous input.
- Limit and available credit are required in calculated mode; never turn a blank
  available-credit field into zero. A positive limit is required for utilization;
  otherwise show unavailable rather than 0%.
- Permit available credit above the limit and show **Available credit exceeds
  limit**; ask the user to check the issuer's values. Do not infer a confirmed
  refundable credit balance from this difference. Exclude the negative derived
  amount from debt and interest totals rather than offsetting another card's debt.
- Explain that available credit of zero only establishes that no credit is
  available; it cannot reveal how far an account may be over its limit. Offer
  direct entry for the actual over-limit balance. Never cap direct entry at limit.
- Changing limit and available credit together creates one observation and one
  history event. A limit-only edit must not silently recalculate debt using stale
  available credit: request a fresh available-credit value or retain the prior
  balance with its observation date and mark available credit as stale.
- If switching entry methods, preview the change and mark the measurement-basis
  change in history. Do not award a progress achievement for the switch itself.
- Keep the interest comparison as a **cost scenario if this amount is carried at
  this APR**. Prefer an explicitly entered posted balance with one applicable APR.
  Using estimated credit used requires an explicit scenario choice; do not silently
  include pending holds in a claimed interest bill. Unknown/mixed APR accounts
  show unavailable and are excluded from numeric scenario totals with coverage
  counts, not treated as zero. Zero APR means zero only for the balance it covers.
- Label monthly `balance * APR / 12` and annual `balance * APR` values as simplified,
  constant-balance scenarios before compounding/fees, not future bills. Likewise
  explain the assumptions of per-$100 comparisons and interest-cost ranking.
- Keep utilization-target payments under each account's visualization and in the full summary;
  distinguish reaching a threshold from going strictly below it using cent-accurate
  calculations. Calculate against the selected observed balance, label its basis
  and date, and assume no new charges or limit changes. A pending hold release may
  change the amount independently of a payment. No promised FICO score improvement.
- Preserve avalanche/snowball and the balance-transfer optimizer as hypothetical
  allocation/scenario tools. Without minimum-payment tracking, do not instruct
  users to skip other issuer-required payments. Budget allocation assumes those
  requirements are handled separately; timelines are simplified simulations.
  Show transfer approval, available capacity, applicable promotional APR, fees,
  expiry, and no-new-charges assumptions; never label a suggested move guaranteed.

Source basis: [Chase: pending transactions](https://www.chase.com/personal/credit-cards/education/basics/pending-transactions)
and [Chase: zero available credit](https://www.chase.com/personal/credit-cards/education/basics/zero-available-credit)
explain that pending charges/holds can reduce available credit before posting to
the balance. This supports the estimated-balance label and direct-entry fallback.

## 2. Encrypted history and a single update path

Extend the encrypted account payload with a schema version, entry method,
available-credit observation, optional statement fields, timestamps, and lifecycle
status. Retain a normalized balance for existing calculations during migration.
Keep balances, limits, APRs, reasons, notes, and dates inside encrypted payloads.

Store history separately at `cards/{cardId}/events/{eventId}` instead of appending
an unbounded array to the account document. The current Firestore rules bound
encrypted card data to 8,192 characters; growing history inside that document
would eventually exceed this limit.

Each event records:

- Stable account/event identifiers and schema version.
- Effective date and recorded time, with a device timezone/offset where needed.
- Before and after values for changed balance inputs, APR, credit limit, and
  statement fields; the initial event is a baseline.
- Source: add, inline edit, quick adjustment, recorded payment, transfer, import,
  archive/restore, or correction.
- Optional reason/note and references to related events or corrections.

Use one shared account-mutation service for every write path. Atomically persist
the current account and its event so neither can succeed alone. Skip unchanged
saves. Stable operation IDs make retries idempotent.

For concurrency, use Firestore transactions with revision checks when connected.
An opaque revision token outside the ciphertext can support conflict detection;
it contains no financial values and must be covered by owner-only security rules.
Define the envelope/version migration before implementation; preserve the existing
crypto metadata and passphrase scheme.

Firestore transactions do not provide offline commits: retain offline usability
through an encrypted local outbox of operations, shown as pending sync, and replay
each operation transactionally after reconnect. Compare its base revision first.
For a conflict, retain the user's draft and show the remote value for resolution;
do not silently overwrite newer data. Keep queued data isolated by signed-in user,
require unlock to replay it, and stop replay on sign-out. Pending observations
must be visually distinct from synced history and excluded from confirmed awards.

Fetch the latest history page on demand, with pagination and date filtering.
Do not download every event whenever account cards render. Show both effective
date and recorded time for backdated entries. Historical corrections supersede
events without erasing the audit trail; rebuild affected trends and milestones.

## 3. Migration, backups, and account lifecycle

- Existing accounts remain readable and default to direct-balance mode. Do not
  invent an issuer-provided available-credit value or previous update date.
- Offer a one-time tracking baseline. Its date is the date tracking actually
  starts, not the account-open date; migration must not create a debt reduction.
- Keep legacy CSV/JSON import working. Add a versioned full JSON backup containing
  account IDs, history, statement fields, settings, and archive status. Provide
  separate current-account and history CSV exports.
- A restored backup retains identity and dates, deduplicates stable event IDs,
  and previews conflicts. Routine imports of new accounts are portfolio additions,
  not debt increases caused by spending. Never treat file import as a payment.
- Full exports contain sensitive plaintext after unlock, as current exports do;
  communicate this clearly. Encrypt all restored data before cloud storage.
- Separate UI archiving from issuer status (open/closed/unknown); hiding a card
  cannot reduce its available credit or change debt totals. Add archive/restore
  and an explicit issuer-closed status. Archiving preserves history and does
  not mark a balance paid. Accounts with outstanding debt remain in debt totals
  and payoff calculations. Show closed-account debt separately and calculate
  open-card utilization from open-card balances and limits only. Total debt
  includes all outstanding balances. Do not divide all debt by open limits and
  call it bureau utilization; closed-account scoring treatment is model-dependent.
- Retain permanent delete and undo. Because deleting a Firestore parent does not
  remove subcollections, explicitly delete history in bounded batches and handle
  partial failure. Undo restores the account and its history during the undo
  window; delay irreversible history cleanup until that window has elapsed.
- Exclude deletions from payoff achievements and expose portfolio removals in
  comparisons rather than presenting them as debt paid off.

## 4. Account history UI and freshness

Add View History to each account with a dated change list, field differences,
reason/note, and optional balance/APR/limit trend views. Support keyboard access,
mobile layouts, dark mode, and clear loading/error/empty states.

Show **Balance observed on** and **Last edited** separately. Editing an APR or
note must not refresh the balance observation date. Allow a configurable stale
balance interval, defaulting to seven days, and a filter for accounts needing an
update. Imported legacy dates remain unknown until the user records an observation.

## 5. Explicit payments and transfers

Add Record Payment with amount, effective date, account, optional note, and
pending/confirmed/corrected status. A payment record is evidence of what the user
entered, not bank confirmation. Prevent duplicate submission through operation IDs.
This is optional: users never need to record individual payments to receive
repayment progress, history, or achievements. A balance update alone is sufficient.

Default to logging the payment without changing an observed balance. Offer an
explicit **Apply an estimated balance adjustment** option with a preview; label
the adjusted value as provisional until the next issuer observation. Never both
subtract a logged payment and subtract it again from a freshly entered available
credit or current balance. Keep existing quick +/-$50 actions as adjustments and
record the actual applied delta, including clamping near zero.

Add a linked transfer record connecting source and destination updates, including
fees. Principal moved between tracked accounts is not overall debt reduction;
fees remain increases. Existing optimizer/simulator outputs remain hypothetical
until the user explicitly records an action. Do not count a transfer as a payment
toward a debt-reduction award.

## 6. Progress page, visualizations, and achievements

Offer overall and per-account views with Since tracking began, This month,
Last 30 days, and custom ranges. Use recorded observations as of each boundary;
show observation dates and stale/missing coverage. Do not interpolate exact daily
balances between observations. Backdated corrections update historical views.

### Dedicated Progress page

Add a clearly labeled **Progress** destination in the app navigation. Keep account
entry and quick updates on the main dashboard. Reuse the existing authenticated,
unlocked session and visual shell; navigation must not require another unlock or
expose history after sign-out. Support browser back/forward and direct navigation
through the app's static-host-compatible routing.

Initial release:

- One estimated-balance trend graph, defaulting to the overall portfolio.
- An account selector to switch between overall and individual-account trends.
- Since tracking began, This month, Last 30 days, and custom date-range filters.
- Three KPI cards: starting estimated balance, latest estimated balance, and net
  balance reduction/increase, with percentage change where the baseline permits.
- A compact milestones area using the achievement rules below.

Follow-up visualizations within this stage, after validating the initial view:

- Horizontal bars comparing the latest estimated balance by account, with each
  observation date visible and no implication that all were updated together.
- Utilization trends alongside credit-limit changes, using separate aligned
  panels to avoid confusing percentage and dollar axes.

Show dated observation markers and exact values in accessible details. Do not
smooth or interpolate a daily balance curve between sparse observations. Any
connecting lines are visual guides only. For aggregate history, use latest-known
account observations with visible coverage and stale-value indicators; do not
label these reconstructed totals exact balances observed on that date. Never
zero-fill missing periods. With one observation, show a single point and explain
that another update is needed to show change; with none, show an empty state.

Annotate portfolio additions/removals, corrections, measurement-basis changes,
and linked transfers where they affect comparisons. Let users distinguish total
portfolio history from like-for-like comparisons; preserve the raw observations.
Apply the same period, baseline, and coverage rules to charts, KPI cards, and
milestones so their numbers agree.

Keep charts readable on mobile and in dark mode. Provide descriptive labels,
keyboard-accessible values, a tabular alternative, and non-color indicators for
increases/decreases. Render on demand from decrypted history already authorized
for the user; load only the needed range and avoid sending financial data to
third-party chart services. A local chart library is acceptable if warranted.

### Balance-change model (accepted)

Default to estimated balance = credit limit minus available credit, subject to the
edge rules in Section 1. No separately entered fixed balance or individual payment
record is required. Direct entry remains an optional compatibility/exception mode.

Track changes in the balance itself without inferring their cause. Show **Balance
reduced by $X**, **Balance increased by $X**, or **No change**, using the selected
period's starting and ending comparable observations. Retain an estimated label
and the source/date. Purchases, interest, refunds, payments, and released holds
can all affect the observed result; optional reasons add context without changing
the raw difference. Corrections revise erroneous observations rather than count
as financial activity. A separately recorded payment is never added to this KPI.

For example, a $500 payment and $200 of new charges produce a $300 balance
reduction. A series $1,000 -> $700 -> $900 produces a $100 reduction for the whole
period, not $300. Do not sum only decreases while ignoring increases. Optional
payment records may support statement notes, but no repayment KPI is required.

KPI definitions:

| KPI | Definition and qualification |
| --- | --- |
| Balance reduction / increase | Starting versus ending comparable estimated balances; payment logs and cause inference are not required |
| Percentage reduction | Reduction / comparable starting balance; show unavailable if starting balance is zero; identify estimated versus posted basis |
| Recorded payments (optional detail) | User-entered records, separate from balance changes; an incomplete log is not the user's total payments |
| Utilization change | Compare balance/limit observations; distinguish limit-driven changes |
| Estimated monthly interest change | Compare estimates using recorded APR and balance basis; not verified interest saved |
| Recorded zero balances | Either tracking method reaches zero; retain an estimated label for derived balances; no claim of final bank payoff |

Show current portfolio totals plus a like-for-like comparison for accounts present
at both boundaries. List new/removed accounts as composition changes. Do not
count a newly added account's entire balance as new spending. Never report zero
for a historical period with no coverage. Mark comparisons across entry-method
changes as not directly comparable; offer a new comparison baseline. Credit
surpluses do not cancel positive debt on other cards.

Derive achievements from qualifying synced observations: first recorded zero
balance, 10%/25%/50% estimated balance reduction, and utilization targets.
Available-credit-based tracking qualifies without individual payment logs; use
estimated balance-change wording without asserting how the reduction occurred.
Reverse awards if later corrections invalidate the underlying observation.
Separate a dated milestone
from current status. A milestone reached through a limit increase can be described
as utilization progress, not debt repayment. Re-evaluate awards after corrections;
do not retain a false award from a corrected event. Avoid punitive streaks and
celebrations for unsynced updates, corrections, archiving, or deletion. Transfers
may change individual account balances but cannot create overall principal reduction.

### Additional edge cases and required behavior

- **Changing credit limit:** use limit and available credit from the same
  observation. A limit increase with a matching increase in available credit must
  leave the estimated balance unchanged, even though utilization improves.
- **Accounts updated at different times:** mark the overall total as a sum of
  latest observations with mixed dates. List stale accounts; do not imply every
  balance was observed today or claim an exact calendar-day total.
- **Transfers recorded one side at a time:** flag linked transfers as incomplete
  until both observations are reconciled. Do not award an overall reduction from
  a temporarily missing destination balance or double-count intermediate history.
  Preserve actual observations and annotate partial coverage.
- **New, removed, hidden, or closed accounts:** maintain separate current totals
  and like-for-like period comparisons. Adding an existing debt is not new spending;
  hiding/deleting an account is not balance reduction. Closure is a separate status.
- **Blank or malformed inputs:** missing available credit is unknown, not zero.
  Validate currency/locale input and cents before saving; preview large changes
  for review without rejecting legitimate increases or requiring extra fields.
- **Zero and excess available credit:** zero available cannot reveal an over-limit
  amount. Available credit above limit does not establish a refundable surplus.
  Explain limitations and retain optional direct entry; never fabricate precision.
- **Zero baseline:** percentage change is unavailable from a zero starting balance;
  show the dollar increase instead. Missing baseline/history is not zero.
- **Corrections and backdated entries:** distinguish correcting a typo from a new
  observation. Recompute affected comparisons and milestones; retain the audit trail.
- **Same-day and offline updates:** keep recorded time and effective date, stable
  ordering, deduplication, pending-sync state, and conflict handling. Repeated saves
  must not create duplicate progress.
- **Cycles and reminders:** statement closing and due dates are separate explicit
  dates. Do not silently shift dates for short months, weekends, or timezone changes.
- **Milestone later reversed:** preserve a valid dated milestone alongside current
  progress; do not award it on every repeated crossing. Corrections invalidate a
  false milestone; later purchases simply change current status.

## 7. Statement planning and APR promotions

Add optional statement date, statement balance, due date,
promotion-end date, and post-promotion APR. All are user-entered, dated values.
Use explicit dates per statement, not a fixed monthly day that fails in short
months. Ask for updated statement information each cycle.

Minimum-payment tracking and calculation are out of scope. Do not add minimum
payment fields, estimates, reminders, or related KPIs.

Provide Upcoming Payments, approaching due-date badges, past-due-date reminders,
promotion-expiry indicators, and a search/filter for these states. A due date is
not proof a payment was missed: show recorded payments and the calculated statement
tracking remainder, and support marking the statement handled without claiming the bank's
payment requirements have been satisfied.

Start with in-app reminders, including configurable seven-day promotion warnings.
Do not promise background/browser-closed notifications. Display a promotion that
has ended and ask the user to confirm the actual APR; do not silently overwrite
the observed APR or retroactively change history. Any forecast uses a separately
labeled future-rate assumption.

### Statement deadlines and interest-status guidance

Include this feature in Stage 5. Dates support reminders and conditional guidance;
they do not establish a universal interest-start date. Scope the initial guidance
to US credit cards. Do not apply these assumptions to other countries silently.

Add encrypted, per-statement fields for cycle opening/closing date, due date,
statement balance, and an optional issuer-displayed amount to avoid
interest (with its observation date). Closing date and due date remain distinct.
Keep an immutable statement identifier so payments and reminders stay attached to
the right cycle when a new statement arrives.

Capture optional, dated user confirmations in an expandable section; none are
required for routine limit/available-credit entry:

- Purchase grace-period status: active, inactive, or unknown (default unknown).
- Whether the prior statement was paid in full by its deadline: yes/no/unknown.
- Issuer payment cutoff/timezone, if known. A due date alone is not a precise
  payment-processing deadline; do not assume a midnight cutoff.
- Relevant balance types: ordinary purchases, cash advance, transfer, and
  promotional balances. Initially these are issuer-entered references, not an
  allocation engine; unknown/mixed types disable precise cost claims.
- Promotion type: true 0% APR, deferred interest, or unknown; relevant balance,
  purchase/start date, end date, and issuer terms/reference if provided.

Show an **Interest status** panel with explainable states:

| Known information | Presentation |
| --- | --- |
| User reports an active purchase grace period | Show user-reported status and statement deadline; general conditional guidance, not app-certified interest-free eligibility |
| Balance carried or grace period inactive | Interest may already be accruing; no future interest-free countdown |
| Grace-period status or balance composition unknown | Due-date reminder and "Interest timing unknown"; list missing information |
| Cash advance present | Separate transaction-type guidance; request transaction date/terms rather than using the statement due date |
| Confirmed 0% promotional balance | Show promotion end date for that balance, separate from the statement payment due date |
| Deferred-interest balance | Prominent pay-in-full promotion deadline; explain potential backdated interest without inventing its amount |

Prefer "Statement due [date]. Check the issuer's pay-to-avoid-interest amount and
grace-period conditions." If entered, show that issuer amount as a dated reference,
not a recalculated payoff quote. Do not
display "Interest starts the day after your due date." Loss of a grace period
can affect interest from purchase dates; cash advances generally do not receive
a purchase grace period. See [CFPB: grace periods](https://www.consumerfinance.gov/ask-cfpb/what-is-a-grace-period-for-a-credit-card-en-47/).

Many issuers calculate interest using daily balances. Snapshot history alone is
insufficient to reconstruct exact charges or transaction-level accrual dates.
Keep cost projections separate from the deadline panel. See
[CFPB: calculating interest](https://www.consumerfinance.gov/ask-cfpb/how-does-my-credit-card-company-calculate-the-amount-of-interest-i-owe-en-51/).

Show **Statement balance minus linked recorded payments**, not an issuer-verified
remaining amount due or pay-to-avoid-interest amount. This is not a bank-calculated
minimum or a determination that the account is delinquent. Payment records must
reference a statement and distinguish scheduled,
pending, posted, failed/reversed, and corrected entries. Only user-confirmed
posted amounts count toward that tracking calculation; show that these
are manually tracked, not bank-verified. Never infer statement payments from a
change in available credit. Cap the displayed remainder at zero and handle
refunds/credits through an explicit adjustment with an issuer-reconciliation note.
For installment plans or mixed promotional balances, record an issuer-displayed
pay-to-avoid-interest amount as a dated reference. Do not simulate how the issuer
allocates payments or reduce that reference automatically after a logged payment.

Paying off a carried balance can leave residual interest; a zero observed balance
must not automatically become an "interest-free" guarantee. See
[Capital One: interest charges](https://www.capitalone.com/help-center/credit-cards/interest-charges/).
Distinguish true 0% offers from deferred interest, which can add charges dating
back to the original purchase if its conditions are not met. See
[CFPB: promotional financing](https://www.consumerfinance.gov/archive/blog/how-understand-special-promotional-financing-offers-credit-cards/).

Test full/partial/late payments, reversals, unknown grace status, mixed balance
types, successive statement cycles, backdated entries, residual-interest states,
promotion expiry, date-only timezone handling, payment cutoffs, leap days, and
short months. Passing a deadline without a payment record produces "Payment not
recorded; confirm status," not an asserted missed payment or exact interest charge.

## 8. Implementation order and affected areas

| Stage | Work | Completion criterion |
| --- | --- | --- |
| 1 | Calculation helpers, schema, compatibility readers, migration fixtures | Cent-accurate calculations and legacy accounts load without value changes |
| 2 | Encrypted event storage, shared mutation service, outbox, rules | Every write path has atomic, idempotent history and tested conflict handling |
| 3 | Limit/available-credit forms, derived preview, direct-entry fallback | Add/edit/quick-adjust/import use consistent balance rules |
| 4 | History UI, freshness, archive/restore, complete backup/restore | Users can inspect and preserve the full record |
| 5 | Payment/transfer recording, statement/promotion reminders, and educational interest-status references | No duplicate adjustment; statement-linked deadlines; no inferred eligibility or interest-start date |
| 6 | Dedicated Progress page, balance trend, account/date selectors, change KPIs, milestones, then comparison/utilization charts | Accessible charts and tables agree with KPI/history calculations and obey coverage, basis, and portfolio rules |
| 7 | Accessibility, responsive/PWA regression checks, release | Existing features remain functional and rollout checks pass |

Primary areas: `app.js` (currently mixes all concerns), `index.html`, compiled
`styles.css`, `firestore.rules`, `sw.js`, and documentation. Extract small modules
for money/balance calculations, encrypted storage/mutations, history, and progress
as needed; avoid a framework migration. Add a minimal repeatable test command and
Firestore Emulator tests for the new persistence/rules behavior.

Update `project-plan.md` to reference this work during implementation and replace
its older snapshot/minimum-payment proposals with these specific requirements.
Its prohibition on implied live due dates remains: these fields are explicitly
manual. Update README and dated status entries only as stages are completed.

## 9. Verification and release gates

- Calculation tests: cents/rounding, blank/invalid values, zero limit, surplus,
  over-limit direct entry, pending estimates, basis switches, and threshold edges.
- Product-language checks: neutral utilization targets, estimated versus posted
  balances, scenario versus actual interest, visible incomplete coverage, no
  minimum-payment fields, no inferred grace eligibility, no guaranteed score or
  payoff claims, and archiving independent of issuer closure.
- Legacy/enriched encryption round-trips; malformed payloads; backward reads;
  migrations that can be retried without duplicate baselines; wrong-key failures.
- Emulator checks: owner-only card/history access, invalid envelopes, unauthorized
  revisions, atomic account/event writes, concurrent-device edits, and retries.
- Offline/reconnect/sign-out tests, outbox isolation, conflict resolution, and
  failures that must not produce confirmed payments or achievements.
- History correction and backdating; baseline-zero/missing-period cases;
  transfers/fees; account additions, archive/restore, delete/undo; mixed/stale
  observations; limit-only edits and measurement-basis changes.
- Balance-change tracking without payment logs; estimated-balance milestones;
  payments plus new charges; decreases followed by increases; corrections;
  mixed-date totals; partial transfers; and no double counting of payment logs
  and balance observations.
- Legacy import and full backup/restore round-trips, pagination, and deletion
  cleanup across more than one batch.
- Mobile/desktop rendering, keyboard/screen-reader flows, light/dark themes,
  long names, large amounts, empty/error states, and all existing planning tools.
- Progress-page navigation/back/forward/direct links and sign-out protection;
  chart/KPI/table consistency across filters; zero/one/sparse observations;
  mixed-date aggregate coverage; correction/transfer markers; and accessible
  keyboard interaction without relying on hover or color alone.
- Rebuild Tailwind after markup changes and bump the service-worker cache version
  for release. Keep financial data out of service-worker asset caching.
- Deploy compatible Firestore rules before enabling history writes; verify existing
  clients cannot bypass required revisions/events. Gate writes from stale clients
  with a refresh-required message once migration starts. Keep older account data
  readable, and do not roll back to a client that drops new encrypted fields.
- Verify deployed rules and a real authenticated sync separately from local source
  and emulator checks. Local verification does not perform a push or deployment.

## Review baseline

Defaults proposed for review: calculated entry for new accounts; direct-entry
compatibility for existing accounts; automatic encrypted history for future edits;
seven-day stale indicators; manual in-app reminders; progress only from observed
and adequately covered data. Earlier history cannot be reconstructed automatically.
All research decisions above apply to the existing tools as well as new screens;
preserve their capabilities while replacing misleading names and hidden assumptions.

## Completed extension - 2026-10-25

- Added monthly per-account payment schedules to each payoff strategy, first month
  expanded, later months lazy-rendered, with baseline/priority allocation, interest,
  remaining balances, calendar labels, monthly totals, and safe CSV download.
  Zero/omitted baselines require review before predictions; explicit continuation
  retains clear zero-allocation warnings. No issuer minimum-payment calculation.

- Accounts, Payoff Plan, and Progress now share one unlocked session, with
  import/export under Settings & data and legacy links retained.
- Compare Avalanche and Snowball with either a combined monthly budget or target
  months. Optional baseline payments are planning assumptions, never issuer
  minimums. Show estimated interest, total paid, payoff timing/order, projected
  balances, and a monthly table. Keep projections separate from observed history.
- Model money in cents; disclose fixed APR, monthly interest, end-of-month
  payments, and no new purchases/fees. Reject mixed/unknown APR and deferred
  interest instead of manufacturing a result. Explicitly flag promotion expiry
  limitations. Deadline comparisons use separate estimated monthly budgets.
- Keep the 0% optimizer collapsed and manually available, with recorded promotion
  context that does not assert transfer eligibility.
- Generate overall utilization KPI cards for every saved custom threshold and
  retain per-card nudges. Keep the save button compact at desktop/mobile widths.
- Keep planning inputs/results in memory, clear them on logout, render account
  names as text, and verify no financial writes result from simulations.
