# DiscordOS Cron Scheduled vs Manual Classification - Pass 56

Date: 2026-06-13

Scope:

- Runtime/product hardening inside `repos/DiscordOS`.
- No Discord messages sent.
- No runtime artifacts written by verification.
- No committed secrets.

## Result

`pass`

This pass prevents manual authorized cron proofs from being recorded as real scheduled Vercel Cron runs.

Vercel documents that production Cron invocations include `vercel-cron/1.0` as the user agent. The cron route now uses that user agent to classify:

- scheduled Vercel Cron runs as `vercel-daily-runtime-health`
- manual authorized operator proofs as `manual-authorized-runtime-health`

## What Changed

Updated `api/cron/runtime-health.js`:

- added `isVercelCronRequest`
- added `getCronScheduleName`
- passes the classified schedule name into `buildCronRuntimeHealthProof`
- writes manual authorized audit rows with source `manual-authorized-runtime-health`

Updated `tests/runtime-health-cron.test.js`:

- covers Vercel Cron user-agent classification
- covers manual authorized audit payload source and run id
- preserves scheduled Vercel audit payload behavior

## Why It Matters

Before this pass, manual authorized proof runs could be written with the same schedule name/source as real scheduled Vercel Cron runs. That made durable cron audit rows less precise and could confuse first-real-scheduled-run proof.

After this pass, manual authorized proof remains useful, but it no longer pollutes scheduled cron evidence.

## Verification

```powershell
npm run verify:runtime-health-cron
```

Result: pass.

