# DiscordOS Music Sesh Feature Card Reaction Correction Pass 166

Date: 2026-06-15

## Scope

Correct the Music Sesh feature-card workflow so completed cards carry explicit success/failure reaction metadata and the live forum card starter messages can be backfilled and read back without posting new public messages.

## Root Cause

The Music Sesh board and forum-card lifecycle workflow created feature-card posts, but no workflow step owned the success/failure reaction. The board also did not store the live forum thread/message ids or expected reaction status, so this was not catchable from the committed read model.

## Correction

- Added `npm run ops:discordos:music-sesh-feature-card-reactions`.
- Added double-guarded live apply with `DISCORDOS_MUSIC_SESH_CARD_REACTIONS=enabled` plus `--allow-apply --apply`.
- Added success/failure status mapping, opposite-reaction cleanup, Discord readback, and no-slash/no-message assertions.
- Added the feature-card reaction surface to the operator dashboard.
- Updated the Music Sesh feedback board so completed cards require:
  - `liveThreadId`
  - `liveMessageId`
  - `reactionStatus`

## Live Backfill

Each current completed Music Sesh forum card starter message was backfilled with `reactionStatus=success`; Discord readback reported `currentReactionPresent=true` and `oppositeReactionPresent=false`.

- `music-sesh-testing-surface`: thread/message `1515961745414557896`
- `music-sesh-signed-button-route-execution`: thread/message `1515961745896771755`
- `music-sesh-chat-message-live-ingest`: thread/message `1515961747050201168`
- `music-sesh-queue-status-read-model`: thread/message `1515961747880673361`
- `music-sesh-board-moderation-post-button-conversion`: thread/message `1515961748719407114`

## Verification

- `npm run verify:discordos-music-sesh-feature-card-reactions`: pass
- `npm run verify:discordos-dashboard`: pass
- `npm run verify:discordos-music-sesh-feedback-board-live-sync`: pass
