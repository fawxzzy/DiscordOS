# DiscordOS Next Scope Percent Markers

Date: 2026-06-14

## Scope

This receipt opens the next DiscordOS runtime/product work markers in the order requested by the operator.

Implementation belongs in `repos/DiscordOS` unless a later task explicitly requires ATLAS receipts or markers. This marker does not reopen the closed Discord OS Feedback Workflow Canonicalization lane, does not touch Fitness product code, and does not move secrets into committed files.

## Ordered Markers

1. `DiscordOS Notification Layer v0`
   - marker: `0%`
   - state: opened
   - intended value: shared notification routing, severity policy, and channel separation for future runtime, ATLAS health, updates, and board/card events.

2. `DiscordOS ATLAS Health Expansion`
   - marker: `0%`
   - state: queued
   - intended value: broader critical health coverage without noisy routine posting or uncontrolled usage growth.

3. `DiscordOS Update-Post Workflow v2`
   - marker: `0%`
   - state: queued
   - intended value: better drafted update formats, validation, release checks, and durable publication receipts.

4. `DiscordOS Forum/Card Operations`
   - marker: `0%`
   - state: queued
   - intended value: governed board/card lifecycle operations for DiscordOS-owned planning and feedback surfaces.

## Execution Order

- requested order: `1`, `4`, `5`, then `3`
- interpreted order: notification layer, ATLAS health expansion, update-post workflow v2, then forum/card operations
- next implementation pass starts with `DiscordOS Notification Layer v0`

## Current Boundary

- sends Discord messages: `false`
- writes runtime artifacts: `false`
- mutates production config: `false`
- touches Fitness product code: `false`
- changes secrets handling: `false`
