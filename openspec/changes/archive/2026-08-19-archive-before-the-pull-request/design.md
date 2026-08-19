## Context

See proposal.md — Why. Two facts shape the approach.

The first is that `npm run check` is run _while a change is active_. It is the last task in every archived change's task list, and `CONTRIBUTING.md` names it as the pre-pull-request gate. So the naive rule — fail whenever `openspec/changes/` holds anything but `archive/` — would make the repository's own verification command unusable during the work it verifies.

The second is that the three past occurrences were not deliberate choices. Each was a forgotten step, and each was noticed only afterwards. A rule written in prose would have been available to forget in exactly the same way, which is why this change pairs the rule with a check rather than only stating it.

## Goals / Non-Goals

**Goals:**

- Make the moment of failure the moment the mistake is actually made: a change is finished and about to be delivered, but has not been archived.
- Keep local and CI behavior identical, so `npm run check` keeps meaning what `CONTRIBUTING.md` says it means.
- Name the missing step in the failure output, so the fix does not require knowing this design exists.

**Non-Goals:**

- Enforcing that a change is archived in the _same commit_ as its implementation. The requirement is about what reaches `main`, not about commit shape within a branch.
- Validating the content of a change's artifacts. `openspec validate` already does that; this check only asks where a finished change sits.
- Detecting an abandoned change. A change left permanently half-complete keeps the check passing, and that is intended — the check is about delivery, not about diligence.

## Decisions

**Trigger on completed tasks, not on the existence of an active change.** The invariant worth enforcing is "a _finished_ change must be archived before it lands", and task completion is the repository's own existing record of finished. Reading it costs one file per active change and needs no git history, no branch comparison, and no CI-only environment probe. The alternatives were worse in specific ways: gating on a `CI` environment variable makes the local command a weaker check than the remote one, which is the property `npm run check` exists to deny; running the check only in the workflow file takes it out of `npm run check` and breaks the same claim from the other side; and comparing the branch against `main` makes a check that cannot be reasoned about locally at all.

The cost is that the trigger depends on checkboxes being written honestly. That is acceptable because the same task list is already the input to `openspec archive`, so a dishonest checkbox already breaks archiving — this adds no new trust.

**Apply it to every author, with no fork exemption.** A fork exemption would reintroduce exactly the defect this change removes, and would do so on the pull requests where the promoted spec most needs to be visible in the diff — the ones where someone other than the maintainer decided what a capability now says. The repository has taken no external pull requests to date (47 from the owner, 10 from Dependabot, none from a fork), so the rule costs nothing today. The shapes an outside contribution actually takes are unaffected: a change-free fix has no active change, and a proposal opened for discussion has incomplete tasks. Only a fully implemented change is asked to archive itself.

If that ever proves to be a barrier, the exemption is one condition on the workflow step (`github.event.pull_request.head.repo.fork`), and can be added when a real contributor hits it rather than in anticipation of one.

**Say the rule about task lists in the specification, not only in contributor documentation.** The task-list shape is the mechanical cause of the failure, not a style preference: a list containing "open the pull request" cannot be completed before the pull request, and archiving requires completed tasks. Recording it beside the ordering rule keeps the cause and the consequence in one place.

**Leave the CI workflow file alone.** CI already runs `npm run check`, so wiring the script into that chain gives the remote gate for free and keeps one list of checks rather than two that can drift.

## Risks / Trade-offs

- **A change is archived, then review asks for more work.** → The edits land under `openspec/changes/archive/<name>/` on the same branch, which is inelegant but correct: the archive is part of the branch's diff until it merges, so it can still be amended. This is not new — it already applies to any change archived before its pull request.
- **The check reads a task list whose format it does not own.** → It looks only for the checkbox markers the schema already parses, and treats a change with no readable task list as in-progress, so a schema that stops using checkboxes makes the check quiet rather than wrong.
- **A contributor now needs the `openspec` CLI to complete a change.** → It is not declared by the repository today, so contributor documentation names how to get it. A contribution that carries no OpenSpec change never needs it.
- **The rule forbids splitting one change across pull requests.** → Accepted deliberately. Every change in the repository's history was delivered in a single pull request, and the three that appeared split were accidents rather than plans.
