# Mazer PR 62 account-scoped settings board closeout

## Outcome

- Result: `pass`
- Card: `mazer-account-scoped-settings-persistence`
- Product pull request: `fawxzzy/mazer#62`
- Product head: `317f58a313d283930339bca03124fbe449cdd457`
- Product merge: `69bc1b150cadac31497bc604180aa373a477e79c`
- Product merged at: `2026-07-14T20:56:40Z`
- Board branch: `codex/mazer-settings-closeout`
- Board base: DiscordOS `9513259aab77ae3bc24c45b9c5835246ed522e2e`
- Production deployment: `not performed`

The account-scoped settings persistence card is proof-complete and moved to the Completed board. Valid legacy unscoped preferences migrate once into guest scope only and are never assigned to an authenticated account. Existing scoped data wins, invalid data falls back safely, failed guest writes retain the legacy key, and legacy-key removal failure cannot invalidate a successful guest write.

## Product verification

- Focused settings, auth-soak, and render-frame suite: `66/66` passed.
- TypeScript check (`npx tsc --noEmit`): passed.
- Full Mazer verification retry: `46` files / `348` tests passed and the production build passed.
- One initial full-verification attempt hit the unrelated load-sensitive high-complexity generator timeout. Its exact file then passed `17/17` alone, and the complete retry passed `348/348`; no unrelated generator change was made.
- Authenticated Chromium fixture proof at `405x958`, DPR `2`: `8/8` steps passed through setting change, reload, visible Options, played-game Pause, logout to guest, and account re-entry.
- Browser console: no actionable messages. Page errors: none.
- Browser summary: `tmp/captures/mazer-account-settings-completion/settings-guest-migration-v7/settings-guest-migration-v7.summary.json`.
- Screenshots: authenticated Options, authenticated Pause, and final authenticated re-entry under the same capture directory.
- No credentials, live user data, auth-provider mutation, production deployment, or change to protected `tests/ai/demo-walker.test.ts` was used.

## GitHub truth

- PR `#62` was created as a focused draft from `codex/account-settings-legacy-migration`.
- Reviewed head: `317f58a313d283930339bca03124fbe449cdd457`.
- GitHub reported the PR mergeable with no review submissions, no inline review threads, and no registered workflow/status checks.
- The draft was marked ready and merged only against the exact reviewed head.
- Merge commit: `69bc1b150cadac31497bc604180aa373a477e79c`.

## Governed lifecycle evidence

| Transition | Event | Thread or destination | Journal |
| --- | --- | --- | --- |
| Ready to in progress | `mazer-account-scoped-settings-persistence-pr62-implementation-20260714` | source `1525045144225841257` | `1526694811904643215` |
| In progress to review | `mazer-account-scoped-settings-persistence-pr62-review-20260714` | source `1525045144225841257` | `1526694828056903700` |
| Review to completed | `mazer-account-scoped-settings-persistence-pr62-completed-20260714` | destination `1526695257406701651` | `1526695265938047217` |

Both lifecycle events replayed with `journalAction: reused`, the same journal IDs, starter and journal readback true, and no reason codes. The Completed-board transfer replay returned destination action `updated`, reaction `already_present`, completion journal `reused`, source archived and locked, and every source/destination/link/journal readback true. The source card was not deleted and no duplicate destination or journal was created.

The first transfer command was rejected before mutation because Windows/npm split a space-bearing evidence argument. The corrected single-token evidence command then applied once and replayed idempotently. This transport rejection created no board state or history.

## Full-board sync and readback

- Full guarded sync at `2026-07-14T21:03:00.472Z`.
- Config cards: `64`.
- Completed source cards excluded: `6`.
- Governed non-completed source targets: `58`.
- Sync: `58/58` existing targets, `0` created, no reason codes.
- Exact bot-backed readback: checked `58/58`, correlated `58/58`, idempotency-correlated `58/58`, no reason codes.
- Readback receipt: `dbr_bc39ad303db9d9c57ee5f485ef040fb8`.
- Read-only replay returned the same receipt ID and the same exact counts.

The denominator is deliberate: DiscordOS retains all `64` durable config records, including completed history. Full live sync/readback governs only non-completed source cards, so `64 - 6 completed = 58`. The Completed-board destination is independently proven by the double-guarded transfer and is not counted again as a source-board target.

The canonical full-board sync receipt remains `docs/ops/discordos-mazer-feedback-board-live-sync-2026-07-09.md`. It was regenerated only by this full-board sync and truthfully reports the `58`-target scope.

## Board disposition

- Card state: `completed` at `100%` with success reaction.
- Source thread: archived, locked, and linked to the Completed card.
- Ready cards: `0`.
- Open cards: `39`.
- Completed cards: `6`.
- Backlog cards: `19`.
- Active selector: `none` because no card is Ready.
- Reason codes: `none`.

## DiscordOS verification

- Focused board, full-sync, exact-readback, journal, and Completed-transfer suite: `59/59` passed.
- Full repo-local `npm run verify`: passed in `218.2s`.
- `git diff --check`: passed.
- An initial full-verify capture was terminated by its `180s` shell window and emitted `EPIPE`; the unchanged verify command completed successfully when given a longer process window.

## Commands and source contracts

- Focused tests: `node --test tests/discordos-mazer-feedback-board.test.js tests/discordos-mazer-feedback-board-live-sync.test.js tests/discordos-mazer-feedback-board-live-readback.test.js tests/discordos-board-card-journal.test.js tests/discordos-board-completed-transfer.test.js`
- Lifecycle writer: `scripts/discordos-board-card-journal.js` with both journal guards.
- Completed transfer writer: `scripts/discordos-board-completed-transfer.js` with both transfer guards.
- Full sync: `npm run ops:production-env:run -- npm run ops:discordos:mazer-feedback-board-live-sync:json -- --allow-sync --apply` with `DISCORDOS_MAZER_FEEDBACK_BOARD_SYNC=enabled`.
- Exact readback: `npm run ops:production-env:run -- npm run ops:discordos:mazer-feedback-board-live-readback:json`.

## Decisions and questions

- Decision: legacy unscoped settings migrate into guest scope only; authenticated scopes are never inferred.
- Operator questions: `none`.

## Residual state

- No blocker remains for this card.
- No new Ready card was invented during closeout.
- The broader Mazer program and final production deployment remain non-terminal and continue under the standing Mazer task.
