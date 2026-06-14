# DiscordOS Product Runtime Scope Marker Opening

Date: 2026-06-14

## Scope

Open the next requested DiscordOS repo-local percent markers in the requested order:

1. `DiscordOS Board Task Runtime v0`
2. `DiscordOS Moderation Persistence v0`
3. `DiscordOS Feature Registry Activation Gates v0`

This does not reopen Discord OS Infrastructure Separation, Discord OS Feedback Workflow Canonicalization, DiscordOS Runtime & Product Hardening, or earlier closed DiscordOS product-scope markers.

## Active Front-Page Marker Table

- DiscordOS Board Task Runtime v0: `0%`
- DiscordOS Moderation Persistence v0: `0%`
- DiscordOS Feature Registry Activation Gates v0: `0%`

## Ordered Execution Rule

- complete board/task workflow runtime first
- complete moderation persistence second
- complete feature registry activation gates third
- publish one final update only after all three markers have proof-backed `100%` closeout

## Boundary

- sends Discord messages during opening: `false`
- writes runtime artifacts during opening: `false`
- mutates production config: `false`
- creates or applies database migrations: `false`
- touches Fitness product code: `false`
- reads or prints secret values: `false`
