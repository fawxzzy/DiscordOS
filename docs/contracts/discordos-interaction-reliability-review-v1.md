# DiscordOS Interaction Reliability Review v1

## Purpose

`discordos.interaction-reliability-review.v1` is the bounded, test-owned review
surface for activation step 7. It proves exactly five interaction outcomes:
successful, failed, duplicate, interrupted/restarted, and stale receipt.

The surface is a fixed GET-only canary. It makes no Discord, board, Supabase,
Auth, billing, schema, secret, deployment, or other owner-repository mutation.
Its object writes are deterministic in-memory fixture transitions, reported
separately from external requests and writes. The canary executes each state
transition against keyed fixture tables and derives receipts, publications,
readbacks, and accounting from the resulting operation trace; it does not
declare a scenario healthy from preassembled terminal objects.

Fixture request counts are the sum of the explicit fixture reads and writes for
each scenario. The CLI and default builder are always `local_fixture`, including
when supplied Preview/Production identity flags or Vercel environment variables.
They report zero hosted requests and leave exact hosted execution UNKNOWN. A
successful local `ok`/exit code establishes fixture validity only; its status is
`interaction_reliability_fixture_ready`.

Only the GET handler selects the internal `hosted_get` execution surface. It
reports one received hosted GET when Preview/Production runtime metadata is
present, separately from logical fixture operations. That is a server-reported
count, not an independently observed network request. Execution surface is bound
into the review digest, so local and handler results cannot share that digest.

## Correlation contract

Every scenario binds these identifiers:

- ingress request ID and interaction event ID;
- task ID, `atlas.job-envelope.v2` job ID, and lease ID;
- `atlas.execution-receipt.v2` execution receipt ID;
- response ID and publication-attempt ID;
- publication ID when a publication is admitted;
- exact touched-object readback ID and content digest.

A failed or stale interaction has a stable publication-attempt identity and an
exact absence readback, but no fabricated publication ID. A duplicate request
has a new ingress request ID and reuses the original terminal interaction,
receipt, response, publication, and readback identities with zero writes.
Interrupted work first persists the original lease and interrupted receipt,
then overwrites the task under a distinct restart lease. Both the recovered
task and recovered receipt bind that restart lease before the single
publication is admitted, and the publication itself carries the restart lease.
A stale submission captures exact current-receipt
preimage and postimage digests and passes only when they are identical.

## Status boundaries

The review distinguishes `accepted`, `applied`, `failed`, `duplicate`,
`interrupted`, `recovered`, `stale`, `blocked`, and `UNKNOWN`. UNKNOWN remains
explicit for real-user interactions outside the fixed canary and for production
adoption of this review contract. Adoption by the existing production
message-command path is also UNKNOWN: the fixed canary does not import, invoke,
or mutate that path.

Hosted reliability-review admission requires an independently observed response
from the exact authorized deployment URL, with its source revision and deployment
ID compared against provider evidence. A supplied identity or local fixture
receipt cannot satisfy this gate. Even a handler result leaves
`independent_transport_and_deployment_binding` UNKNOWN and marks identity as
`independentlyVerified: false`; the release collector must record that separate
observation. This evidence concerns the interaction correlation contract, not
production traffic adoption or migration runtime acceptance.

## Hosted route

`GET /api/runtime-health?surface=interaction-reliability-review` returns the
complete matrix and uses `Cache-Control: no-store`. The frozen selector is
mounted on the existing read-only runtime-health function so the review does
not increase the Vercel serverless-function denominator. Other methods return
`405`. The surface does not accept caller-controlled scenario input and cannot
address product cards. Ordinary `/api/runtime-health` behavior is unchanged.
The handler uses runtime environment identity, never caller query identity.
Hosted proof fails closed unless the runtime provides an exact 40-character
Git source revision, Preview/Production environment, and a deployment ID. An
identity failure returns a failed review and removes exact-head execution from
the proven scope. The review digest binds both the source revision and exact
deployment ID so a receipt cannot be replayed as evidence for another hosted
deployment of the same commit.

## Acceptance

- exactly five scenarios in frozen order;
- deterministic IDs and digests at one source revision;
- accounting derived from the stateful fixture operation trace;
- exact readback for every scenario;
- duplicate and stale scenarios perform zero fixture writes;
- interrupted work publishes once after recovery;
- external request and write counts remain zero inside the fixture;
- retained blocked/stale board events are not retried;
- next packet remains `owner-export-integration`.
