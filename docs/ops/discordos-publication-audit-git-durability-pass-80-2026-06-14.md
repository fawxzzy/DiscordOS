# DiscordOS Publication Audit Git Durability - Pass 80

Date: 2026-06-14

Scope:

- Improve DiscordOS publication audit so receipt durability is not inferred from files merely existing on disk.
- Add Git tracked-state annotation for audited publication receipts when the command runs inside a Git worktree.
- Report untracked publication receipts as a durability warning without classifying them as receipt backfill failures.
- Surface untracked publication receipt count through the combined operator status.
- Do not send Discord messages.
- Do not change production env values.
- Do not touch Fitness product code.
- Do not commit secrets.

Marker:

- `DiscordOS runtime/product hardening`: publication audit now distinguishes durable tracked receipts from disk-only receipt files.

## Result

`pass`

`scripts/discord-publication-audit-rollup.js` now:

- runs `git ls-files` for the audited docs directory when available
- annotates audited publication records with `gitTracked`
- reports `counts.untrackedPublicationReceipts`
- reports `untrackedPublicationReceipts`
- uses status `ready_with_untracked_receipts` when no backfill is needed but audited receipt files are untracked
- supports `--no-git-status` for contexts where Git state should be skipped

`scripts/discordos-operator-status.js` now:

- includes `publicationAudit.untrackedPublicationReceipts`
- renders the untracked count in Markdown
- adds next action `review_untracked_publication_receipts` when the count is nonzero

`scripts/discordos-next-work-recommender.js` now:

- detects `discordos-publication-audit-git-durability-pass-*` receipts
- omits `audit-discord-publication-tooling-gaps` after this proof exists
- advances steady-state next-work to `inspect-operator-command-ergonomics`

## Current Audit Finding

Command:

```powershell
npm run ops:discord:publication-audit:json
```

Current result:

- result: `pass`
- status: `ready_with_untracked_receipts`
- audited files: `16`
- published receipts: `4`
- publication proof only: `12`
- needs backfill: `0`
- untracked publication receipts: `1`
- reason code: `publication_receipt_untracked`
- untracked path: `docs/ops/fitness-routines-feature-card-8ed05d76-start-update-post-2026-06-13.md`

This pass does not modify that untracked Fitness-related receipt. It only makes the durability state visible so future publication audits do not silently count disk-only receipts as fully durable.

## Next-Work Proof

Command:

```powershell
npm run ops:production-env:run -- npm run ops:discordos:next-work:json
```

Current result:

- result: `pass`
- publication audit git durability receipt detected: `true`
- recommendation count: `1`
- top recommendation: `inspect-operator-command-ergonomics`
- reason code: `operator_status_ready_for_command_ergonomics`

## Verification

Commands:

```powershell
npm run verify:discord-publication-audit
npm run verify:discordos-operator-status
npm run verify:discordos-next-work
npm run verify
```

Result: pass.
