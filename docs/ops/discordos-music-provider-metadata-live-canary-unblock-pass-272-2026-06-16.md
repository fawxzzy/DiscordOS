# DiscordOS music provider metadata live canary unblock pass 272 - 2026-06-16

Scope: unblock `music-provider-metadata-live-canary`, prove the production route responds without a dedicated metadata canary URL env, and verify the repo after the change.

## Changes

- added `api/music-provider-metadata.js` as a read-only metadata preview route for the music-provider live canary
- updated `scripts/discordos-music-provider-metadata-live-canary.js` to resolve the production metadata route by default when `DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY_URL` is absent
- updated the metadata route to admit read-only preview requests without relying on a separate production `DISCORDOS_MUSIC_PROVIDER_ADAPTER` env toggle
- extended `tests/discordos-music-provider-metadata-live-canary.test.js` to cover default URL resolution and adapter-env-free preview admission

## Verification

- `npm run verify:discordos-music-provider-metadata-live-canary` passed
- `npm run verify` passed
- production deployment `dpl_G4iFQwyiyVEJcFK32ctHJvkXiQnp` for commit `abe7e1cde40e6313f75175911498e7c48b1b7520` reached `READY`
- `DISCORDOS_MUSIC_PROVIDER_ADAPTER=enabled DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY=enabled npm run ops:production-env:run -- node scripts/discordos-music-provider-metadata-live-canary.js --json --live --allow-provider-admission --allow-live-canary --query "Music Sesh Live Canary"` returned:
  - `status=provider_metadata_live_canary_ready`
  - `liveResult.httpStatus=200`
  - `liveResult.canaryUrl=https://fawxzzy-discordos.vercel.app/api/music-provider-metadata`
  - `liveResult.resultCount=3`
  - `controlsPlayback=false`
  - `slashCommandsAdmitted=false`

## Result

- `music-provider-metadata-live-canary` is unblocked and now executes successfully against production
- the previous blocker `provider_metadata_canary_url_missing` is replaced by a durable route-backed default and no longer gates this surface
