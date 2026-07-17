# DiscordOS Interaction Reliability Review v1

## Purpose

`discordos.interaction-reliability-review.v1` is the bounded, test-owned review
surface for activation step 7. It proves exactly five interaction outcomes:
successful, failed, duplicate, interrupted/restarted, and stale receipt.

The surface is a fixed GET-only canary. It makes no Discord, board, Supabase,
Auth, billing, schema, secret, deployment, or other owner-repository mutation.
Its object writes are deterministic in-memory fixture transitions, reported
separately from external requests and writes.

Fixture request counts are the sum of the explicit fixture reads and writes for
each scenario. The hosted GET is counted separately from those logical fixture
operations, so the receipt does not conflate one HTTP request with its bounded
in-memory transition proof.

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

## Status boundaries

The review distinguishes `accepted`, `applied`, `failed`, `duplicate`,
`interrupted`, `recovered`, `stale`, `blocked`, and `UNKNOWN`. UNKNOWN remains
explicit for real-user interactions outside the fixed canary and for production
adoption of this review contract. Adoption by the existing production
message-command path is also UNKNOWN: the fixed canary does not import, invoke,
or mutate that path.

This still satisfies the selector's owner-side hosted reliability-review
admission because the exact candidate revision executes the complete five-case
contract on the authorized safe hosted test surface. It is evidence for the
interaction correlation contract, not evidence that production traffic already
uses that contract.

## Hosted route

`GET /api/interaction-reliability-review` returns the complete matrix and uses
`Cache-Control: no-store`. Other methods return `405`. The route does not accept
caller-controlled scenario input and cannot address product cards.

## Acceptance

- exactly five scenarios in frozen order;
- deterministic IDs and digests at one source revision;
- exact readback for every scenario;
- duplicate and stale scenarios perform zero fixture writes;
- interrupted work publishes once after recovery;
- external request and write counts remain zero inside the fixture;
- retained blocked/stale board events are not retried;
- next packet remains `owner-export-integration`.
