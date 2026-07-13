# DiscordOS Board Autonomy Lifecycle v1

## Purpose

This contract separates captured ideas from work that is safe for autonomous AI implementation. A card being present on a project board does not authorize implementation.

## Lifecycle

| State | Meaning | Autonomous implementation |
|---|---|---|
| `intake` | Newly captured idea, bug, or request. Planning may be incomplete. | Not admitted |
| `planning` | Research, scope, dependencies, and acceptance criteria are being developed. | Not admitted |
| `ready` | The implementation contract is complete and has passed the autonomy gate. | Admitted |
| `in_progress` | A correlated task or job is actively implementing the card. | Already running |
| `review` | Implementation is complete enough for verification, review, or requested changes. | Not admitted as new work |
| `completed` | Acceptance criteria are satisfied and the result has been accepted. | Closed |
| `archived` | Historical record retained outside the active board. | Closed |
| `blocked` | Work cannot proceed until a named blocker is resolved. | Not admitted |

`intake` replaces the ambiguous label `unplanned`. `Ready` is the only queue-admission state.

## Ready Gate

A card may enter `ready` only when all of the following are true:

- Stable card ID, project, title, summary, and type are present.
- Objective describes the desired outcome.
- Acceptance criteria define observable completion.
- Next actions provide an executable implementation starting point.
- Owner is assigned.
- Priority is assigned.
- Blockers are empty.
- The previous lifecycle state admits the transition.

If any requirement is missing, the card remains or returns to `planning`. Research and discussion may continue there without blocking unrelated Ready work.

## Transition Contract

The primary path is:

```text
intake -> planning -> ready -> in_progress -> review -> completed -> archived
```

Allowed recovery paths:

- Active work may move to `blocked` when a concrete blocker appears.
- `blocked` may return to `planning` or `ready` after reconciliation.
- `ready` may return to `planning` when new design work is discovered.
- `review` may return to `in_progress` when changes are required.
- Same-state transitions are valid journal checkpoints and must not duplicate the card.

Skipping directly from `planning` to `in_progress` is forbidden because it bypasses autonomy admission.

## Execution Contract

Before an autonomous Mazer, Fitness, Atlas, or future owner-lane task starts implementation:

1. Read the live card and journal history.
2. Evaluate the Ready gate using the canonical card fields.
3. Select only admitted `ready` cards according to dependency and priority policy.
4. Write a correlated `in_progress` journal checkpoint when the task starts.
5. Append discoveries, completed work, next actions, blockers, and evidence while work proceeds.
6. Move to `review` only with verification evidence.
7. Move to `completed` only after acceptance and live readback.
8. Transfer the accepted card to the Completed board and archive the source according to the Completed-transfer contract.

## Governance

- DiscordOS remains the single logical board writer.
- Project tasks submit structured card events; they do not improvise Discord formatting or duplicate cards.
- Full local execution permission does not authorize production deployment, Discord mutation outside the card contract, or unrelated live-data mutation.
- A newly discovered independent outcome becomes an `intake` card instead of silently expanding active scope.
- A discovery that invalidates the current plan moves the card back to `planning` or `blocked` before implementation continues.

## Reusable Knowledge

**RULE - Ready Is Admission**  
Only a fully planned card in `ready` may be selected for autonomous implementation.

**PATTERN - Planning Gate Before Execution**  
Capture first, develop the plan, evaluate admission, then create the implementation task.

**FAILURE MODE - Backlog Presence Implies Authority**  
Treating every board card as executable causes incomplete plans, scope drift, duplicate work, and unreliable autonomous runs.
