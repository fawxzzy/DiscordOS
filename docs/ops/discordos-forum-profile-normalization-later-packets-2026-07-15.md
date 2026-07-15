# DiscordOS Forum Profile Normalization Later Packets

Status: queued packets only. No live Discord mutation is authorized or performed by this document.

## 1. Explicit Live Profile Normalization

Authority required: current-thread operator approval for the named DiscordOS forum-profile apply.

Preconditions:

- production environment readiness is `ready`
- the denominator scanner completes 12/12 with zero uncovered boards
- canonical roles resolve exactly and unknown overwrites are zero
- orphan and ambiguous applied-tag findings are cleared by the dedicated packets below
- the dry-run plan is reviewed and retained

Execution is one guarded apply using `DISCORDOS_FORUM_PROFILE_NORMALIZATION=enabled` plus `--allow-normalization --apply`, followed by exact 12-board readback and a durable receipt. It changes forum-level configuration only. It must not migrate cards or decide lifecycle state.

## 2. Legacy Shared Intake and Music Sesh Decision and Migration

Scope: exactly 152 legacy drifts: one Shared Intake card and 151 Music Sesh cards. Do not bulk-convert from titles alone.

Required decisions:

- retain, map, supersede, or archive each owner-meaningful record
- preserve current thread history and accepted archive/lock state
- decide whether Music Sesh remains a legacy archive and receives a clean active successor forum
- route future canaries to the existing testing surface rather than legacy project history

Use the existing migration planner and journal contract only after owner sources and ambiguous identities are reconciled. This packet is card mutation and remains separate from forum-profile normalization.

## 3. Active-Source Completion Semantics

Scope: the 12 reciprocal active-source and Completed destination pairs.

Decision required: whether a transferred source's managed state is canonically `review` or `completed`. Either decision must preserve these invariant conditions:

- active source archived and locked
- exact Completed destination link on the source
- exact original source link on the destination
- Completed destination state is `completed`
- duplicate stable identity classification recognizes only the reciprocal pair

After the decision, update lifecycle policy, migrate the seven disagreeing source states if required, and prove all 12 pairs.

## 4. Orphan-Tag Cleanup

Scope: Shared Completed orphan applied-tag IDs plus any legacy applied tag whose name has no canonical semantic key.

Never infer meaning from an ID. Build an explicit thread-by-thread mapping from managed body state/type/priority/outcome evidence or record the tag as removed without semantic carry-forward. Snapshot targeted threads first, apply a bounded mapping, and verify that every applied tag exists in the canonical available-tag set before forum normalization.

## 5. Socials OS Board 13 Admission

This is a separate Socials OS owner lane. Required inputs:

- operator confirmation that Socials OS belongs in the governed denominator
- owner adapter and `atlas.project-board.owner-export.v1` artifact
- stable namespace and lifecycle policy
- exact forum name/topic/profile exceptions
- guarded forum provision and exact readback
- registry admission only after the live forum and owner source agree

If admitted, the denominator changes from 12 to 13 in one serialized registry and live-readback cluster. This packet must not be folded into the 12-board normalization apply.

## Candidate Marker Measurement

The candidate measurement is 30%, not a marker move.

- forum structure: 12/12
- restricted single-writer permissions: 4/12
- legacy tag presence: 4/12
- canonical declared live tag profile: 0/12
- owner seed adoption: 78/78
- healthy and journaled current cards: 215/367
- remaining legacy drift: 152
- reciprocal completion pairs: 12/12
- duplicate stable identities: 0
- actionable encoding findings: 0
- immutable historical findings: 124

The marker may ratchet only after executed state changes and exact proof satisfy the ATLAS marker threshold.
