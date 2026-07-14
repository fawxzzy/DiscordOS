# DiscordOS Mazer Board Governance

Last updated: 2026-07-14

This note governs Mazer board synchronization passes where product notes include both active implementation work and future ideas.

## Rule - Backlog Is Not Progress

A proposed feature, card, design note, TODO, or implementation plan does not qualify for a progress percentage.

Only work backed by repository implementation, tests, proof artifacts, or completed operational state may receive a current-work marker.

## Pattern - Evidence-Based Tracker And Idempotent Board Upsert

Current-work percentages come from verified implementation evidence. Discord synchronization updates stable cards in place by stable card ID first, then normalized title and scope.

Do not create duplicate title variants to repair formatting. Preserve live thread IDs, message IDs, reactions, discussion history, and useful existing content when updating a card.

## Rule - Explicit Mutation Scope

A guarded Mazer apply must use `--card-id <stable-card-id>` for a bounded update. Applying without a card selector fails closed. Config-wide mutation additionally requires `--full-board`; it is never inferred from the absence of a selector.

The live sync preflights the full admitted set before its first write. A canonical starter body cannot be replaced by the legacy config renderer or by canonical content whose `updated` timestamp is missing, equal, or older. One failed row blocks the entire full-board batch. A bounded card replay with unchanged title, body, and reaction emits `unchanged` and performs no mutation.

Use the canonical card-journal writer for lifecycle/body changes after a card has a managed starter body. The legacy Mazer sync may not downgrade that body to config-shaped markdown.

Stable prevention codes are `mazer_canonical_card_body_downgrade_prevented`, `mazer_card_mutation_out_of_scope_prevented`, and `mazer_card_sync_batch_preflight_blocked`.

## Failure Mode - Brainstorm-To-Active-Work Leakage

Broad idea dumps must not become active Codex work, fake progress, or duplicate Discord cards.

When a prompt contains future ideas, place them on backlog cards only. Do not add those ideas to the Mazer current-work tracker and do not assign them a progress marker.
