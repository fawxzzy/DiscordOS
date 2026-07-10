# DiscordOS Mazer Board Correction

Date: 2026-07-09

## Root Cause

The first Mazer DiscordOS board pass optimized for getting a board live quickly and did not bind the output to the existing project feedback forum, the exact requested board name, or the richer card/reaction contract already established by adjacent board work.

A later formatting pass correctly enriched the source cards but initially exceeded Discord's starter-message content limit on six cards. That produced `400` update responses during guarded live sync. The renderer now keeps Discord posts under the content limit while preserving full detail in the source board config.

## Corrections

- Board id and label are now `mazer`.
- The configured placement is `project-feedback`, live forum `1524889569475170478`, parent category `Project Feedback Boards` / `1508057063874629684`.
- The previous standalone live forum id is retained as `legacyForumChannelId` for migration evidence.
- The board now tracks 15 Mazer cards, covering auth gate, remote receipts, AI/progression, level/rank/complexity, Options guide, edge-wrap topology, graphics, icon-quality target, fluid controls, unified messages, animation smoothness, play-mode lifecycle, iridescent player/trail material, diagonal graph contract, visual-proof discipline, and DiscordOS board discipline.
- Cards now include summary, acceptance criteria, proof plan, marker, progress, reference, next command, and failure reaction metadata while incomplete.
- Cards now include why-it-matters, current status, work breakdown, and next actions so they are useful project references instead of thin placeholders.
- Live sync now targets the project feedback forum by default, updates existing card starter messages, applies the configured card reaction, and keeps Discord content under the platform limit.
- Live readback now checks the actual Discord starter messages for required card sections before DiscordOS claims the board is correctly formatted.
- Completed-board movement is still a separate tooling gap: Discord forum threads cannot be safely re-parented as a simple move, so the proper command should clone/close the completed card into the `completed` forum, apply success reaction, archive/link the original, and then read back both surfaces before claiming completion movement.

## Regression Guards

- `npm run verify:discordos-mazer-feedback-board`
- `npm run verify:discordos-mazer-feedback-board-live-sync`
- `npm run verify:discordos-mazer-feedback-board-live-readback`

The verifiers now fail if the board reverts to `mazer-feedback`, omits project-feedback placement, ships thin cards, exceeds Discord card content limits, skips incomplete-card failure reactions, or claims live formatting without bot-backed message readback.

## Latest Live Proof

- Live sync result: `pass`
- Live board: `mazer`
- Forum id: `1524889569475170478`
- Parent category: `Project Feedback Boards`
- Cards synced: `15`
- Existing cards updated: `8`
- New cards created: `7`
- Not-done reactions applied: `15`
- Live readback: `15 / 15` starter messages passed required section checks with no missing markers.
