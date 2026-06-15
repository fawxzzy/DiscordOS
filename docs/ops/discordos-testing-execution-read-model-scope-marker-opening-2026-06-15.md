# DiscordOS Testing Execution Read Model Scope Marker Opening

Date: 2026-06-15

## Scope

Open five DiscordOS percent markers for the current runtime/product pass, in the requested order:

1. DiscordOS Testing Surface Provisioning
2. DiscordOS Signed Button Route Execution
3. DiscordOS Chat Message Live Ingest
4. DiscordOS Music Sesh Queue Status Read Model
5. DiscordOS Board Moderation Post Button Conversion

This pass keeps DiscordOS interaction doctrine fixed on post buttons and user chat messages. It does not reopen slash-command registration, does not touch Fitness product code, and does not move secrets into committed files.

## Active Marker Table

| Marker | Opening Percent | Status |
| --- | ---: | --- |
| DiscordOS Testing Surface Provisioning | `0%` | open |
| DiscordOS Signed Button Route Execution | `0%` | open |
| DiscordOS Chat Message Live Ingest | `0%` | open |
| DiscordOS Music Sesh Queue Status Read Model | `0%` | open |
| DiscordOS Board Moderation Post Button Conversion | `0%` | open |

## Active Front-Page Marker Table

- DiscordOS Testing Surface Provisioning: `0%`
- DiscordOS Signed Button Route Execution: `0%`
- DiscordOS Chat Message Live Ingest: `0%`
- DiscordOS Music Sesh Queue Status Read Model: `0%`
- DiscordOS Board Moderation Post Button Conversion: `0%`

## Boundary

- Test/control messages must not be posted to `#updates` or other public channels.
- Live test targeting uses the dedicated testing category/channel.
- Final requested update posts may still publish to `#updates`.
- Slash command surfaces remain rejected for DiscordOS workflows.
