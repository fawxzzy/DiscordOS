# DiscordOS Music Sesh Feature Card Custom Reaction Correction Pass 167

Date: 2026-06-15

## Scope

Correct the Music Sesh feature-card reaction workflow from generic Unicode reactions to the existing DiscordOS feedback/forum application emoji convention.

## Correction

The previous reaction correction used Unicode `success`/`failure` stand-ins. That was wrong for this DiscordOS server. The live feedback/forum convention uses application emojis:

- success: `success:1507384062166302851`
- failure: `failure:1507384094424694785`

The reaction operator now:

- applies the custom `success` or `failure` app emoji
- removes the opposite custom app emoji
- removes legacy Unicode `success`/`failure` stand-ins from the bot
- treats final Discord readback as the source of truth
- retries one Discord `429` rate-limit response before failing

## Live Backfill

The five current Music Sesh feature cards were corrected in place. Each readback returned:

- `currentReactionPresent=true`
- `oppositeReactionPresent=false`
- `legacyCurrentReactionPresent=false`
- `legacyOppositeReactionPresent=false`

Corrected card starter messages:

- `1515961745414557896`
- `1515961745896771755`
- `1515961747050201168`
- `1515961747880673361`
- `1515961748719407114`

## Verification

- `npm run verify:discordos-music-sesh-feature-card-reactions`: pass
- `npm run verify:discordos-music-sesh-feedback-board`: pass
