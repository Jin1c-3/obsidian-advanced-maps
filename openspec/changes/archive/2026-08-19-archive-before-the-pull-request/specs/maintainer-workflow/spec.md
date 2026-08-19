## MODIFIED Requirements

### Requirement: Changes use a lightweight protected-main workflow

Ordinary repository changes SHALL update local `main`, use a focused short-lived branch, proceed through a pull request, resolve conversations, pass `CI / format · lint · types · tests · build`, and squash-merge into protected `main`. Repository merge settings SHALL allow squash merge only and automatically delete merged head branches. The `main` ruleset SHALL block deletion and force pushes, require a pull request and the named CI check, and require zero approving reviews. Because the repository is maintained by one person, administrator bypass SHALL be reserved for emergencies and followed by equivalent validation with a recorded reason.

Work carried by an OpenSpec change SHALL have its delta specs promoted into the stable capability paths and its change directory moved under the archive before its pull request opens, so that one pull request carries the implementation, the promoted specs, and the archived change together. A change SHALL NOT reach `main` while it is still active. This applies to every author; a contribution that completes a change carries its own promotion and archive.

Because delivery is what carries a finished change rather than a step inside it, a change's task list SHALL end at verification and SHALL NOT contain branch, push, pull-request, or archive steps. A task list that requires the pull request to exist cannot be completed before it, and archiving asks for completed tasks.

The repository check SHALL fail when a change whose tasks are all complete still sits outside the archive, and SHALL pass while any of that change's tasks remain incomplete, so the check stays runnable throughout implementation.

#### Scenario: Ordinary change is ready

- **WHEN** a branch has a focused change and its pull request passes `format · lint · types · tests · build`
- **THEN** it is squash-merged to `main` and the source branch is deleted

#### Scenario: A change is finished but still active

- **WHEN** every task in a change is complete and its directory still sits outside the archive
- **THEN** the repository check fails and names the promotion and archive step that is missing

#### Scenario: A change is still being implemented

- **WHEN** a maintainer runs the repository check while tasks in the active change remain incomplete
- **THEN** the check passes, because the change is not yet due to be archived

#### Scenario: A completed change arrives from outside

- **WHEN** a pull request from any author, including one from a fork, completes an OpenSpec change
- **THEN** the same promotion and archive rule applies to it, and the check does not exempt it

#### Scenario: Pull request has an unresolved conversation

- **WHEN** required CI passes but a pull-request conversation remains unresolved
- **THEN** the protected branch rule still prevents merge until the conversation is resolved

#### Scenario: Direct push is attempted

- **WHEN** an ordinary non-emergency update targets `main` without a pull request
- **THEN** repository protection rejects it

#### Scenario: Emergency bypass is used

- **WHEN** an administrator must bypass the pull-request rule for an urgent repair
- **THEN** the reason is recorded and the same checks run before or immediately after the push

#### Scenario: Solo maintainer opens a pull request

- **WHEN** the repository owner proposes an ordinary change
- **THEN** no approving review is required, while the pull request, conversation-resolution, and required-CI rules still apply

#### Scenario: Dependabot or routine automation proposes a change

- **WHEN** routine automation updates the repository
- **THEN** it uses a pull request and the same required CI instead of receiving a broad direct-push bypass
