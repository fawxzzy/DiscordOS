# Mazer account-scoped settings admission

## Outcome

- Result: `pass`
- Card: `mazer-account-scoped-settings-persistence`
- State: `ready`
- Marker: unchanged at `70%`
- Active selector: `mazer-account-scoped-settings-persistence`
- Product base: Mazer `origin/main` at `afc6e8401893c2ddb4c0681db39e6b3b435985ff`
- Prior product proof: Mazer PR `#58`, merge `6245efb9bdb9029b4c226711c3a967f98396c019`
- Production deployment: `not performed`

The operator-selected settings lane is admitted for one bounded completion slice. The remaining question was resolved without operator input: a legacy unscoped preference has no trustworthy authenticated owner, so only a valid legacy value may migrate once into guest scope. The legacy key is removed only after the guest-scoped write succeeds. Existing scoped data wins, corrupt data falls back safely, and no legacy value may overwrite authenticated settings.

## Admitted implementation

1. Implement idempotent valid-only migration from the legacy unscoped preference key to guest scope.
2. Preserve existing guest and authenticated scoped values.
3. Keep the legacy key when the scoped write fails; tolerate removal failure after a successful write without breaking settings load.
4. Prove missing/corrupt data falls back to immutable defaults.
5. Prove visible authenticated Options and played-game Pause settings survive reload/re-entry and do not leak after logout or account switching.

The slice does not change the auth provider, session ownership, gameplay, progression, account records, or production data.

## Live board evidence

- Forum: `1524889569475170478`
- Thread/starter: `1525045144225841257`
- Event: `mazer-account-scoped-settings-persistence-ready-20260714`
- Journal: `1526688174951104663`
- Journal apply: `created`, starter readback true, journal readback true, no reason codes.
- Idempotent replay: `reused` the same journal ID, no legacy snapshot, starter readback true, journal readback true, no reason codes.
- Full guarded sync: `2026-07-14T20:33:35.083Z`, `64` config cards, `5` completed excluded, `59/59` existing live targets, `0` created, no reason codes.
- Exact bot-backed readback: `59/59` checked, correlated, and idempotency-correlated.
- Readback receipt: `dbr_b8b054583932b506ed99db77451d4444`.
- Settings live state: `ready` with the exact admission event observed and no reason codes.

The denominator remains `64 - 5 completed = 59` governed non-completed source cards. The canonical full-board receipt remains `docs/ops/discordos-mazer-feedback-board-live-sync-2026-07-09.md` and was regenerated only by the full-board sync.

## Verification

- Board, full-sync, live-readback, and card-journal tests: `48/48` passed.
- Local read model: one Ready card, `39` open, `5` completed, `19` backlog, active/next card exact.
- `git diff --check`: passed.
- Environment admission: `ready`; no board reason codes.

## Commands and source contracts

- `npm run ops:discordos:mazer-feedback-board:json -- --card-id mazer-account-scoped-settings-persistence`
- `node --test tests/discordos-mazer-feedback-board.test.js tests/discordos-mazer-feedback-board-live-sync.test.js tests/discordos-mazer-feedback-board-live-readback.test.js tests/discordos-board-card-journal.test.js`
- `DISCORDOS_MAZER_FEEDBACK_BOARD_SYNC=enabled npm run ops:production-env:run -- node scripts/discordos-mazer-feedback-board-live-sync.js --json --allow-sync --apply`
- `DISCORDOS_BOARD_CARD_JOURNAL=enabled npm run ops:production-env:run -- node scripts/discordos-board-card-journal.js --input <ATLAS-local-event-file> --json --allow-apply --apply`
- `npm run ops:production-env:run -- node scripts/discordos-mazer-feedback-board-live-readback.js --json`

## Decisions and questions

- Decision: guest-only, valid-only, delete-after-success migration.
- Operator questions: `none`.
