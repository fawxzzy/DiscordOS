# DiscordOS Bot Token Runtime Readiness Proof - 2026-06-12

## Scope

This receipt records a DiscordOS-owned runtime readiness proof for the Discord bot credential.

It does not activate DiscordOS writers, move Fitness traffic, send Discord messages, copy Fitness implementation code, or open runtime workflow parity.

## Proof Added

- `api/readiness.js` now validates `DISCORDOS_BOT_TOKEN` with a read-only Discord API call to `/users/@me`.
- The readiness response reports only boolean and reason-code fields:
  - `discordBotTokenConfigured`
  - `discordBotTokenValid`
  - `discordBotTokenPresent`
  - `discordBotApiReachable`
  - `discordBotUserOk`
  - `discordBotReason`
- The readiness response does not return token material, bot identity values, Discord message data, or Fitness data.

## Fail-Closed Coverage

`tests/readiness.test.js` covers:

- missing Discord bot token
- invalid Discord bot token response
- non-bot user response
- valid bot user response

The readiness endpoint remains fail-closed when the token is absent, invalid, unreachable, or not a bot user.

## Verification

Repo-local verification:

```text
npm run verify
```

Result:

```text
tsc --project tsconfig.json --noEmit
node --test tests/readiness.test.js
tests 12
pass 12
fail 0
```

## Boundary

Still unopened:

- live DiscordOS writer activation
- Fitness-to-DiscordOS traffic transfer
- rollback execution proof
- live workflow parity proof
- Discord message mutation
- Fitness repo modification

Remaining blocker class after this proof:

`DiscordOS writer activation plus Fitness-to-DiscordOS traffic transfer, rollback proof, and live workflow parity proof`
