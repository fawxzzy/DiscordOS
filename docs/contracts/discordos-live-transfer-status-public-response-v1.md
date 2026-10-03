# DiscordOS live-transfer public response v1

`GET /api/live-transfer-status` is public. Its server-side Supabase credential is never an authorization grant to the caller.

The direct master RPC selects the `fitness` Data API schema and requires the separately installed `fitness.discordos_get_live_transfer_status` wrapper. Legacy direct and Edge transports retain their prior schema behavior. For either transport, the response may publish only the readiness boolean and nonnegative integer transfer counts in `status` (and in the compatibility `edge` field when the legacy fallback is used):

- `liveSignedTransferReady`
- `fitnessLiveTransferCount`
- `humanFitnessLiveTransferCount`
- `nonProofFitnessLiveTransferCount`
- `humanNonProofFitnessLiveTransferCount`

The route must not forward database row objects, report IDs, Discord user IDs, warnings, upstream error strings, or the raw service-role RPC payload. Every response is marked `Cache-Control: no-store`. A successful backend response without a boolean readiness field fails closed with HTTP 502. The public response is operational status only; it does not prove live cutover acceptance, zero legacy dependencies, or deletion readiness.
