# DiscordOS Mazer Board Governance

Last updated: 2026-07-10

This note governs Mazer board synchronization passes where product notes include both active implementation work and future ideas.

## Rule - Backlog Is Not Progress

A proposed feature, card, design note, TODO, or implementation plan does not qualify for a progress percentage.

Only work backed by repository implementation, tests, proof artifacts, or completed operational state may receive a current-work marker.

## Pattern - Evidence-Based Tracker And Idempotent Board Upsert

Current-work percentages come from verified implementation evidence. Discord synchronization updates stable cards in place by stable card ID first, then normalized title and scope.

Do not create duplicate title variants to repair formatting. Preserve live thread IDs, message IDs, reactions, discussion history, and useful existing content when updating a card.

## Failure Mode - Brainstorm-To-Active-Work Leakage

Broad idea dumps must not become active Codex work, fake progress, or duplicate Discord cards.

When a prompt contains future ideas, place them on backlog cards only. Do not add those ideas to the Mazer current-work tracker and do not assign them a progress marker.
