# DiscordOS live-transfer public response v1

`GET /api/live-transfer-status` is public. Its server-side Supabase credential is never an authorization grant to the caller.

For either the direct master RPC or the legacy Edge fallback, the response may publish only the readiness boolean and nonnegative integer transfer counts in `status` (and in the compatibility `edge` field when the legacy fallback is used):

- `liveSignedTransferReady`
- `fitnessLiveTransferCount`
- `humanFitnessLiveTransferCount`
- `nonProofFitnessLiveTransferCount`
- `humanNonProofFitnessLiveTransferCount`

The route must not forward database row objects, report IDs, Discord user IDs, warnings, or the raw service-role RPC payload. A successful backend response without a boolean readiness field fails closed with HTTP 502. The public response is operational status only; it does not prove live cutover acceptance, zero legacy dependencies, or deletion readiness.
