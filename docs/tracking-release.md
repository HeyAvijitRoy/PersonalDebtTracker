# Account tracking release and verification

Local implementation completed on 2026-10-25 on `feature/account-tracking-progress`.
Nothing in this work deploys to Firebase or publishes the site automatically.

## Behavior

- New accounts default to estimated balance = limit minus available credit.
  Direct entry remains available for legacy/over-limit exceptions. Available
  credit above limit never offsets another account's debt.
- Balance observations, APR/limit changes, references, and corrections are encrypted.
  Progress measures balance changes, not a sum of payments. No payment log is
  needed for the main workflow or milestones.
- History and the current snapshot commit atomically with revision checks.
  Conflicting edits stay in an encrypted local outbox until reviewed or discarded.
- Full JSON backups retain IDs, history, statement/promotion fields, archive status,
  and UI preferences. CSV exports are separately available for snapshots/history.
  Downloads contain decrypted financial information; keep them private.
- Archiving only hides an account. Issuer closure is a separate status; closed
  debt remains in total balances. Permanent deletion freezes writes and purges
  both normal and restored history in bounded batches after the Undo interval.
- Statement/promotion dates are user-entered references. The app does not track
  minimum payments, certify delinquency, calculate exact interest-start dates, or
  reconstruct bank payment allocation. Interest figures and payoff tools are
  explicitly hypothetical scenarios with limited coverage/assumptions.
- The Progress destination uses hash navigation and the same unlock session.
  It shows recorded observations, comparison coverage, accessible tables, charts,
  and dated milestones. It does not invent daily balances or zero-fill history.

## Security boundaries

Financial fields are encrypted before Firestore or the offline outbox receives
them. AES-GCM keys remain non-extractable and in memory; PBKDF2/key verification
and existing ciphertext remain compatible. New records authenticate the owner,
project, account path, event path, and revision through AES-GCM additional data.

The database still sees document identifiers, ciphertext sizes, revision/purge
flags, record counts, and operational update order. History ID prefixes encode
record creation order/time for pagination; issuer statement/due dates and financial
observations remain inside ciphertext. This is not anonymity or protection against
an unlocked/compromised browser. No financial data is sent to a chart service.

Rules enforce owner-only access, immutable events, bounded envelopes, paired
snapshot/event writes, legacy upgrades, and terminal purge behavior. They cannot
validate encrypted financial values. Client validation handles amounts, schemas,
dates, bounds, and identities. Malformed/unsupported data is not silently repaired;
the UI marks totals incomplete and blocks purported full backups.

Session guards discard stale decryption results and clear account content on
sign-out/user changes. Only public runtime assets enter the service-worker cache
and Pages artifact; test stubs, development dependencies, private configuration,
backups, and workspace files are excluded. There is no test-auth bypass in the app.

## Repeatable checks

Use Node 22 and Java 21+; install Chromium for the browser checks:

```powershell
npm.cmd ci
npm.cmd exec -- playwright install chromium
npm.cmd run build:css
npm.cmd run check
npm.cmd test
npm.cmd run test:rules
npm.cmd run test:browser
git diff --check
```

On macOS/Linux replace `npm.cmd` with `npm` (those platform commands were not run
locally). The browser runner starts an isolated local server and uses only
synthetic encrypted accounts with mocked Firebase transport. Rule tests use
`demo-pdt` on loopback port 8085, never a production project. If the Firebase CLI
needs a writable config/cache directory, point `XDG_CONFIG_HOME` and
`FIREBASE_EMULATORS_PATH` at private local development folders.

The development SDK and pinned browser SDK use Firebase 12.19.0, compatible with
Node 22. Patched transitive development dependencies are pinned through npm
overrides and exercised by the build/emulator/browser checks. No npm packages
are included in the deployed static artifact.

Verified locally: 68 unit/crypto/model/session/server tests and four synthetic
browser suites. Earlier backend validation passed twelve emulator rule tests and
a dependency audit with zero reported vulnerabilities. Checks include owner/anonymous/foreign-user
rules; paired/stale writes; immutable/restored history; multi-batch purge; calculated
entry/edit; offline reload/replay; conflict review; linked transfers/fees; backup
deduplication; Undo/deletion; malicious-looking names rendered as text;
keyboard/Escape; hash back/forward; light/dark and 320/390-pixel layouts.

Not verified by these tests: real Google sign-in, real-account Firestore sync,
production security-rule deployment, and live hosting behavior.

`npm.cmd start` serves the app at `http://127.0.0.1:5173/` with a runtime-asset
allowlist and loopback/Host restrictions. It does not expose repository metadata,
credential folders, test fixtures, or backups as a general directory server would.

## Production rollout (not performed)

1. Export a current backup with the existing app and retain the current Git ref.
2. Review/deploy `firestore.rules` to the intended Firebase project. The new rules
   block old-client writes while preserving legacy reads; keep this maintenance
   gap short. Test owner and foreign-user access against the actual deployed rules.
3. Publish this branch's tested application assets through the normal Pages
   workflow. Service-worker cache v17 replaces older asset caches.
4. Verify real sign-in/unlock, one account update with its encrypted event,
   offline/reconnect, backup/restore, Progress, and sign-out on the live deployment.
5. Keep a schema-compatible client for rollback. Do not restore the old four-field
   writer or permissive rules: it could discard tracking fields or bypass history.
   A conservative rollback is read-only until the compatible release is corrected.

No push, merge, rules deployment, or public publication was performed as part of
the local implementation.

## Encryption-settings connection recovery

Metadata loading uses the SDK cache or an owner-scoped cache containing only the
salt and encrypted verifier. If a server SDK read stalls, an authenticated HTTPS
document read starts after 1.5 seconds. Firebase ID tokens are sent only in the
Authorization header and are never persisted in this cache or placed in URLs.
The fallback does not use an admin/service-account credential: normal owner-access
rules still apply. See [Firebase REST authentication](https://firebase.google.com/docs/firestore/use-rest-api).

The SDK uses forced long polling to avoid indefinitely buffered streaming
responses on some proxy/security-software configurations, as described in
[Firebase transport settings](https://firebase.google.com/docs/reference/js/firestore.firestoresettings).
Timeouts, permission errors, and sign-in refresh failures do not trigger a new
passphrase setup or overwrite existing encryption settings.


## Account-read connection recovery (2026-10-25)

Account lists and history also use authenticated HTTPS reads when SDK reads stall
or reject. Empty SDK caches do not become empty account lists. A visible status
panel offers Refresh, and HTTPS account reads repeat every minute while visible.
Network and permission failures remain unavailable states; they never clear data.
Successful account reads retain only validated encrypted envelopes in an
owner-scoped IndexedDB snapshot. Offline recovery explicitly labels stale data.
Session guards reject late reads after sign-out. History pagination filters the
existing version-2 envelope field before descending document order, avoiding the
bare descending-key query failure reproduced with the emulator.

Writes use revision-checked authenticated HTTPS transactions. Unconfirmed saves retain
encrypted drafts for retry rather than claiming a save succeeded. No rules were
weakened or deployed. Local validation: 61 unit checks, 12 emulator rule checks
(including real REST listing, history cursors and foreign-owner rejection), and
all three browser suites. Startup coverage includes a stalled account listener,
authenticated HTTPS account loading, and encrypted offline account recovery.
The user's real authenticated session still needs a local retry.


## Account UX refinement (2026-10-25)

Routine balance updates and history stay visible. A native keyboard-accessible
Actions disclosure groups all other account operations. Archive/unarchive,
issuer-open/closed changes and deletion require an explanatory confirmation;
Cancel is initially focused, Escape cancels, and sign-out cannot apply a pending
confirmation to a different session. Deletion keeps the existing Undo window.
Checkbox spacing and wrapping are consistent throughout dialogs and filters.
Reminder/stale-day inputs use padded, centered, dark-mode-aware controls.

Browser validation covers cancelled archive/status actions, confirmed lifecycle
changes without dropping outstanding debt, menu keyboard access, checkbox spacing,
dark day-field padding, 390px/320px layouts, existing records/backup/Undo flows and
private-state clearing. Dark mobile screenshots were visually inspected. No new
financial calculations, storage format, permissions or dependencies were added.


## Sticky header and Add Account modal (2026-10-25)

The opaque sticky header measures its current height to offset section anchors.
The Add Account form is a native modal outside route-specific views. Existing
shortcuts and the My Accounts Add Account button use the same guarded entry
point. Sorting/display controls remain on the account page in a labelled View &
filters fieldset, with filters separated from sorting. All Actions operations
have visible bordered button styling.

Modal fields scroll independently while Add Account and Cancel remain visible.
Errors are announced and scrolled into view inside the dialog. Cancel, Escape,
completed saves and sign-out clear unfinished fields; the native modal traps
focus and returns it on close. No draft is newly persisted. Browser checks cover
these flows, private-state clearing, sticky scroll positioning, continued history/
backup/Undo behavior, and dark mobile layout. Financial logic and access rules
are unchanged.


## HTTPS transaction sync recovery (2026-10-25)

The initial HTTPS fallback covered reads while saves still used the stalled SDK
transport. Account/history saves now use authenticated HTTPS read-write
optimistic commits with the same revision checks, atomic paired-event rules and
idempotent encrypted operation IDs. Transactions retry bounded ABORTED contention;
network errors, denied writes, session changes and uncertain commit responses retain
the original encrypted draft. Previously committed immutable events are read and
verified before a replay clears its local draft. No simultaneous SDK/REST write
race is introduced. Purge batches use authenticated HTTPS and existing freeze rules.

Server-confirmed views update in memory before pending rows are removed, including
linked transfers. Offline snapshots contain only encrypted envelopes and rejected
record counts. A commit invalidates older in-flight list refreshes. The connection
notice distinguishes unavailable live updates from independently confirmed saves.
Rules failures point to deploying the existing firestore.rules; rules were not
weakened or deployed by this fix. REST emulator tests and browser transport stubs
verify these cases, including a confirmed changed balance surviving offline reload.
Real-user sync remains to be verified in the user's authenticated browser.


## Browser-compatible optimistic commits (2026-10-25)

The production console exposed 403 responses on BeginTransaction that emulator
validation had not reproduced. The browser now follows the installed Firebase
12.19.0 web SDK transaction model: BatchGet reads capture document updateTime or
confirmed absence, then Commit sends version/existence preconditions on writes
and verify mutations for every read-only document. All mutations apply atomically.
ABORTED, FAILED_PRECONDITION and ALREADY_EXISTS contention rerun the full callback
within a bounded retry count. A denied commit is retried only when a fresh server
read proves a document version changed; unchanged denials remain permission errors. Missing document versions fail closed. No explicit
BeginTransaction/rollback RPC or server/IAM credential is used.

Browser mocks now deliberately deny BeginTransaction, so regression coverage
includes this production-specific limitation. Emulator checks also force a real
concurrent update and confirm the stale attempt cannot overwrite it. Other console
warnings (browser extensions, preload credentials, favicon and deprecation notices)
are separate from the failed sync request. Real-user confirmation remains necessary.


## App icon and freshness visibility (2026-10-25)

Favicon SVG, 16/32/48px ICO, Apple touch PNG and the PWA icon share the same
credit-card/paydown mark. All are explicit public runtime assets in the local
server, Pages artifact and offline cache.

Outdated, undated and provisional account values use amber card borders, a text
badge, a highlighted observation block and an Update now action. Unsynced drafts
have a separate blue Pending sync badge. Current observations clear the freshness
warning; APR-only changes do not falsely refresh balance observations. The filter
and card styling share one predicate. No balance/date is altered by rendering.

Application-owned console prints have been removed; validation and failures stay
visible in the UI. Firestore initializes through persistentLocalCache with the
multi-tab manager instead of the deprecated persistence initializer. This does
not change encrypted outbox format, keys or server rules. Extension-injected and
Cloudflare/browser messages remain outside application logging control.


## Passphrase metadata and Cloudflare loading (2026-10-25)

Both passphrase forms include a CSS-hidden autocomplete=username field populated
from the authenticated account email/UID and cleared on session changes. It is
not sent to the app's storage or included in account backups. Existing
new-password/current-password annotations and native visibility controls remain.
See [Chromium password-form guidance](https://www.chromium.org/developers/design-documents/form-styles-that-chromium-understands/).

Theme, configuration and module scripts now use the correct static
`data-cfasync="false"` attribute before src; the old `data-cf-async` spelling was
not Cloudflare's opt-out. The app module explicitly uses anonymous CORS mode.
See [Cloudflare exclusions](https://developers.cloudflare.com/speed/optimization/content/rocket-loader/ignore-javascripts/).
If an older edge-cached page continues to produce Rocket Loader preload warnings,
purge that page's Cloudflare cache or disable Rocket Loader for the app hostname
with a Configuration Rule. Local browser tests validate markup and application
behavior; they do not simulate Cloudflare's live transformation layer.
