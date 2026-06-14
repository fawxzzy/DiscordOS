# DiscordOS Moderation Workflow v0 Contract

## Scope

This is the v0 contract surface for future DiscordOS moderation workflows.

It is contract-only. It does not grant moderation permissions, send Discord messages, invoke Discord API actions, persist moderation cases, or open a live moderation feature lane by itself.

## Case Identity

Every moderation case should include:

- case id
- guild id
- optional source channel id
- subject Discord user id
- opened timestamp

The matching code-facing shape is `DiscordOSModerationCaseIdentity` in `src/contracts/moderation.ts`.

## Case State

Every moderation case should expose:

- status
- reason
- latest action timestamp
- optional assigned Discord user id

The matching code-facing shape is `DiscordOSModerationCaseState` in `src/contracts/moderation.ts`.

## Action Contract

The admitted v0 action names are:

- `note`
- `warn`
- `timeout`
- `remove_content`
- `escalate`
- `close`

Every action must include an actor, timestamp, optional note, and proof object.

The matching code-facing shape is `DiscordOSModerationAction` in `src/contracts/moderation.ts`.

## Event Envelope

Future moderation producers should emit `DiscordOSModerationEventEnvelope` events when a live lane is explicitly opened.

## Forbidden Behaviors

This v0 contract does not allow:

- live Discord moderation API calls
- automatic timeout, ban, kick, or message-delete behavior
- service-role or bot-token values in committed files
- Fitness product code edits
- treating contract-only proof as human moderation proof

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-feature-contract-status`
- `npm run ops:discordos:moderation-status`
