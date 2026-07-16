# Mazer PR 80 account sync and browser parity board checkpoint

## Outcome

- Result: `pass`
- Mutation scope: three exact existing Mazer cards only
- Product PR: `fawxzzy/mazer#80` (merged)
- Product head: `ed090e8d710d9e5babdcbc5a8fcaa293b3f55f91`
- Product merge: `c633315de2d1759ce4aed42f0b49d59a03dee98d`
- Preview deployment: `5ELdb6fPuktXuPBJNUsVKvfgmVK3`
- Preview URL: `https://fawxzzy-mazer-cgb93h4sk-fawxzzy.vercel.app`
- Production deployment: `dpl_BMopmVCmS5oi4Xd6fEu7qJFiJxFQ` (`Ready`)
- Production URL: `https://fawxzzy-mazer.vercel.app/`
- Full-board/config-wide Mazer sync: `not run`

PR #80 hydrates authenticated player/AI progression and settings before the first maze, rejects stale destructive replacement, and makes a narrow portrait fine-pointer browser reuse the mobile menu/play composition without changing the phone branch. GitHub merged the exact validated head, and Vercel built the production deployment from the resulting merge commit. The cards remain `in_progress`; their existing evidence percentages were preserved instead of being re-estimated.

## Product and data proof

- Focused account/browser tests: `4` files / `41` tests passed.
- Fast verification: TypeScript plus `13` files / `184` tests passed.
- Architecture verification: `5` files / `18` tests passed.
- Lint and production-mode build passed.
- Aggregate verification passed `49` files / `374` tests; three expensive seed-family tests timed out only under accumulated serial load and passed in isolation.
- Preview menu/play proof passed at `390x844` and `499x958`: one canvas, zero off-screen/overlap violations, and no console errors.
- Production menu/play proof repeated at `390x844` and `499x958`: one canvas and zero off-screen/overlap violations on all four surfaces. Production play boards measured `360px` and `469px`, respectively, and both used the compact lower controller composition.
- Vercel readback returned deployment `dpl_BMopmVCmS5oi4Xd6fEu7qJFiJxFQ` as target `production`, status `Ready`, with the canonical production alias attached; an independent HTTP request returned `200` from Vercel.
- The live additive Supabase migration `20260716211513 account_state_revisions` had completed before the FawxzzyPlatform write hold. It preserved all three existing progression rows and did not rewrite user payloads.
- No Supabase, Auth, billing, user-row, or secret mutation occurred during merge, deployment, or board closeout.

## Exact live board receipt

| Card | Thread | Event | Journal | Apply | Replay |
| --- | --- | --- | --- | --- | --- |
| `mazer-auth-remote-playbook-sync` | `1524889586021699684` | `mazer-auth-remote-pr80-checkpoint-20260716` | `1527435285976055949` | `created` | `reused` |
| `mazer-browser-layout-persistence` | `1525337752290197514` | `mazer-browser-layout-pr80-checkpoint-20260716` | `1527435906603028530` | `created` | `reused` |
| `mazer-cross-viewport-ui-reliability` | `1525337748830031875` | `mazer-cross-viewport-pr80-checkpoint-20260716` | `1527436499610501160` | `created` | `reused` |

Every apply and replay used the explicit stable card ID plus exact thread ID. For all three cards:

- live identity preflight found exactly one matching location and zero collision locations;
- starter, journal, title, and code-point-exact readback were `true`;
- replay reused the original journal ID;
- reason codes were empty;
- no legacy snapshot, duplicate thread, or duplicate journal was created.

The guarded writer performed its required registry identity scan before each exact event. It did not run the legacy Mazer sync, a targeted legacy sync, a config-wide sync, or a full-board sync.

## Production closeout live receipt

| Card | Thread | Production event | Journal | Exact readback | Scan |
| --- | --- | --- | --- | --- | --- |
| `mazer-auth-remote-playbook-sync` | `1524889586021699684` | `mazer-auth-remote-pr80-production-20260716` | `1527443460989128734` | starter, journal, title, and code points `true` | `consistent`; `245` current identities; zero collisions/reasons |
| `mazer-browser-layout-persistence` | `1525337752290197514` | `mazer-browser-layout-pr80-production-20260716` | `1527443999684694036` | starter, journal, title, and code points `true` | `consistent`; `245` current identities; zero collisions/reasons |
| `mazer-cross-viewport-ui-reliability` | `1525337748830031875` | `mazer-cross-viewport-pr80-production-20260716` | `1527444562040062123` | starter, journal, title, and code points `true` | `consistent`; `245` current identities; zero collisions/reasons |

Each production event updated exactly its explicit existing thread and appended one new journal. The three applies ran serially. The first two had completed and the third was already in flight when the DiscordOS owner-slot release instruction arrived; the in-flight third operation was allowed to complete its built-in exact readback. No idempotent replay or further board mutation ran after that instruction.

## DiscordOS verification

- Board, journal, and consistency suites: `52/52` passed.
- Focused mutation-scope, downgrade-protection, guard, and renderer checks: `9/9` passed.
- Local projections for all three exact card IDs returned `ok: true` with no reason codes.
- `git diff --check`: passed.

The combined live-sync test file also exposed three pre-existing stale assertions on current DiscordOS `main`: they still expect the removed `mazer:` title prefix, while the canonical contract and live board now use plain outcome titles. This packet does not change writer code or mix that unrelated test repair into the card-evidence branch.

## Disposition

- `mazer-auth-remote-playbook-sync`: remains open/in progress; same-account phone/computer confirmation, Atlas consumer wiring, and future receipt/outbox work remain.
- `mazer-browser-layout-persistence`: remains open/in progress; native maximize/restore and browser-chrome proof remain.
- `mazer-cross-viewport-ui-reliability`: remains open/in progress; physical iPhone safe-area, installed-PWA, and native browser proof remain.
- No completed card was reopened and no new card was created.
- The serialized DiscordOS owner slot is released after this receipt; no additional Mazer implementation or board mutation is admitted by this packet.
