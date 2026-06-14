# DiscordOS Music Sesh Workflow v0 Contract

## Scope

This is the v0 contract surface for future DiscordOS Music Sesh workflows.

It is contract-only. It does not join voice channels, call music provider APIs, resolve playlists, persist queue state, send Discord messages, or open a live Music Sesh feature lane by itself.

## Session Identity

Every Music Sesh session should include:

- session id
- guild id
- channel id
- host Discord user id
- opened timestamp

The matching code-facing shape is `DiscordOSMusicSeshSessionIdentity` in `src/contracts/music-sesh.ts`.

## Queue Item

Every queued item should include:

- session id
- item id
- title
- optional source URL
- submitting Discord user id
- item status
- submitted timestamp
- proof object

The matching code-facing shape is `DiscordOSMusicSeshQueueItem` in `src/contracts/music-sesh.ts`.

## Vote Contract

Every vote should include:

- session id
- item id
- voter Discord user id
- direction
- occurrence timestamp
- proof object

The matching code-facing shape is `DiscordOSMusicSeshVote` in `src/contracts/music-sesh.ts`.

## Event Envelope

Future Music Sesh producers should emit `DiscordOSMusicSeshEventEnvelope` events only after a live lane is explicitly opened.

## Forbidden Behaviors

This v0 contract does not allow:

- voice-channel joins or playback control
- external music API calls
- queue persistence or schema migration
- sending Discord messages from contract validation
- treating contract-only queue state as deployed product state
- Fitness product code edits

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-feature-contract-status`
- `npm run ops:discordos:music-sesh-status`
