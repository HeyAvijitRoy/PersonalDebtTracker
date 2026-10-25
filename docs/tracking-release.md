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

Verified locally: 41 unit/crypto/model/session/server tests; eight emulator rule
tests; two synthetic browser suites; dependency audit with zero reported
vulnerabilities. Checks include owner/anonymous/foreign-user
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
   workflow. Service-worker cache v7 replaces older asset caches.
4. Verify real sign-in/unlock, one account update with its encrypted event,
   offline/reconnect, backup/restore, Progress, and sign-out on the live deployment.
5. Keep a schema-compatible client for rollback. Do not restore the old four-field
   writer or permissive rules: it could discard tracking fields or bypass history.
   A conservative rollback is read-only until the compatible release is corrected.

No push, merge, rules deployment, or public publication was performed as part of
the local implementation.
