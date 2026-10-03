# DiscordOS master member-link RPC schema contract

The `upsert_discord_member_link` RPC exists in the master project's `fitness`
schema. DiscordOS calls it through the Supabase Data API with
`Content-Profile: fitness`; an elevated key alone does not select a non-default
schema. If either dedicated member-link URL or key setting is present, both must
be present. The call cannot mix a dedicated value with the general DiscordOS
connection. The verification handler checks that the effective URL and key are
both present before calling the Fitness bridge or granting a Discord role.
Operator environment readiness treats this pair as required for Fitness
verification and reports a partial dedicated pair as blocked even when general
DiscordOS settings exist.

The interaction grants the Discord verified role, then writes the link and role
grant time. The write result is checked. A failed write returns a private
reconciliation-needed message instead of reporting completed verification.
The implementation does not make the Discord role change and database write
atomic: access may be active while the stored link is stale after a failed
write. The source does not perform a preliminary upsert because the current
master function replaces a prior `verified_role_granted_at` value with null on
conflict when passed null. A safe pre-grant reservation or compensating action
needs a separate database and Discord state contract.

This local source change does not prove that `fitness` is exposed through the
master Data API, that a deployed DiscordOS environment points to master, or
that the production build contains this change. It changes no environment
value, credential, Supabase row, Discord account, or deployment. Before cutover,
verify the deployed binding without echoing keys, Data API schema exposure and
RPC privileges, a QA member-link call, reconciliation and rollback behavior,
and the release gate. Do not retire the legacy DiscordOS project on this proof.
