# DiscordOS master write and search API source

Status: source-only proposal against PR #111. The forward and rollback SQL under
`docs/ops/sql/` are not migrations and have not been applied to the master.

Six retained `public` RPCs have direct master callers: feedback-proof and
runtime-health-cron inserts, board-card and Music Sesh upserts, and moderation
audit insert and search. Each takes a `payload jsonb` argument. The two first
inserts return sets of their retained `discordos` row types; the others return
JSONB. The proposed wrappers preserve these signatures and use `SECURITY
INVOKER`, explicit references to the retained functions, and service-role-only
grants. Exact master direct callers select `Content-Profile: discordos_api`;
legacy direct and Edge calls keep their current routing.

Install the separately reviewed readback API schema source first, only after
its exact provider authority and proof gates pass. Before this second forward
file, prove the six retained definitions, signatures, grants, schema identity,
absence of the six wrappers, exact Data API settings preimage, single writer,
and rollback plan. Apply its one transaction and read back dependencies,
ownership, schema and function privileges. Select only the six exact functions
in Data API settings; keep `public` and `discordos` unexposed. Refresh API
discovery and prove exact service-role HTTP calls, including preservation of
the two row-set response shapes, before release. Preview build success is not
runtime acceptance.

For rollback, first remove and read back the six Data API function selections
and prove no deployed route uses them. Begin one transaction, set the exact
fresh six-function identity fingerprint with `SET LOCAL`, execute the rollback
file with stop-on-error, verify only these wrappers were removed, and commit
only on the planned poststate. A changed identity or dependent object holds
rollback. The readback API schema and its three wrappers remain separate.

The Fitness live-transfer wrapper, member-link function selection, deployed
DiscordOS binding, normal-user acceptance, and legacy retirement remain
separate gates. These files grant no provider, production, or live-data effect.
