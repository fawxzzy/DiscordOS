# DiscordOS master readback API source

Status: source-only proposal against PR #111. The SQL files under `docs/ops/sql/`
are not migrations and have not been applied to the master project.

The master project's `public` schema is not exposed through the latest signed-in
Data API settings readback. Three existing zero-argument JSONB readbacks remain
in `public`: music session, product workflow, and runtime-health cron status.
The proposed `discordos_api` schema contains only service-role-callable wrappers
for these functions. Master direct callers select it with `Content-Profile`;
legacy direct and Edge calls keep their existing routing. Do not expose the
entire `public` or `discordos` schema to make these callers work.

Before any installation, the owning provider task must prove the exact master
project, absence of `discordos_api`, current definitions and service-role grants
for all three retained functions, a single writer, the Data API settings
preimage, and the exact rollback plan. The forward file creates the schema and
wrappers with restrictive grants in one transaction. Its `BEGIN ATOMIC` bodies
record dependencies on the retained `public` functions. After installation,
read back definitions, ownership, schema and function privileges, and select
only `discordos_api` plus the three named wrappers in the Data API settings.
Refresh API discovery and prove exact service-role HTTP calls before release.

For rollback, first remove and read back Data API exposure and prove no deployed
route uses the wrappers. Compute the guarded rollback file's exact schema and
function identity fingerprint from a fresh catalog readback, begin one
transaction, set it with `SET LOCAL`, execute with stop-on-error, verify the
poststate, and commit only if the expected objects were removed. A missing or
changed fingerprint holds rollback. `DROP ... RESTRICT` protects new dependents.

The other direct master RPCs, the Fitness live-transfer wrapper, member-link
function selection, deployed binding, and normal-user acceptance remain
separate gates. This source proposal is not runtime acceptance or permission
for a provider, production, or legacy-retirement effect.
