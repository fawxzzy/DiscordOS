# DiscordOS Fitness Transfer Provenance Edge Hop Fix - 2026-06-12

## Summary

DiscordOS production accepted the live Fitness test submission `fitness-live-transfer-1515148121418629341`, but the row was still stamped proof-only.

Root cause: the Vercel persisted-writer endpoint authenticated the Fitness transfer and then forwarded the normalized row to the Supabase Edge writer without the original `transferSource` and `sourceProof` provenance fields. Edge accepted the shared transfer secret, but without those provenance fields it used the proof-only runtime-warning fallback.

## Change

- Preserved Fitness provenance fields across the Vercel-to-Edge persistence hop:
  - `transfer_source: fitness-discord-interaction`
  - `source_proof: discord-signature-verified-by-fitness`
- Added a regression test that locks the provenance forwarding contract.

## Verification

- `npm run verify:feedback-persist`
- `npm run verify`
- Vercel production deployment: `https://fawxzzy-discordos-46qhobmd7-fawxzzy.vercel.app`
- Production alias: `https://fawxzzy-discordos.vercel.app`

## Boundary

This fix does not rewrite the earlier proof-only live row.

This fix does not itself prove a human non-proof live transfer row.

The remaining cutover proof still requires a new real Discord-signed Fitness feedback submission after this deployment.
