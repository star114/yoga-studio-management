# Multi-Agent Operating Guide

This repository uses an orchestrator + specialist agents model.

## Goals
- Keep work parallelizable and reviewable.
- Make handoffs explicit.
- Gate merges with objective checks.

## Agent Roles

### 1) Planner
- Breaks request into scoped tickets.
- Defines dependencies and execution order.
- Produces Definition of Done (DoD) per ticket.

Output template:
- `Scope`
- `Out of scope`
- `Tasks`
- `Risks`
- `DoD`

### 2) Implementer
- Implements a single scoped ticket.
- Keeps changes minimal and isolated.
- Includes migration/rollback notes when relevant.

Output template:
- `Files changed`
- `Behavior changes`
- `Tech notes`
- `Local verification`

### 3) Reviewer
- Reviews for correctness, regressions, and security.
- Verifies assumptions and edge cases.
- Requests fixes with actionable comments.

Output template:
- `Findings (severity ordered)`
- `Requested fixes`
- `Residual risks`

### 4) Tester
- Runs lint/type/test/build checks.
- Executes targeted scenario tests for changed areas.
- Reports reproducible failures with exact commands.

Output template:
- `Commands run`
- `Pass/fail summary`
- `Failing cases`
- `Retest result`

### 5) Release
- Prepares commit grouping, PR body, and release notes.
- Confirms CI and merge gates.
- Handles tag/release/deploy steps.

Output template:
- `Commit plan`
- `PR summary`
- `Release impact`
- `Rollback plan`

## Workflow (Required)
1. Planner defines tickets and DoD.
2. Implementer executes one ticket at a time.
3. Reviewer signs off or returns fixes.
4. Tester verifies all checks.
5. Release prepares PR and merge.

No step may be skipped for production-impacting changes.

## Handoff Rules
- Every handoff must include:
  - what changed
  - what remains
  - known risks
  - exact verification status
- Avoid hidden context in chat only; write key points in PR.

## Branch and Commit Conventions
- Branch naming:
  - `feat/<topic>`
  - `fix/<topic>`
  - `chore/<topic>`
- Commit prefixes:
  - `plan:`
  - `feat:`
  - `fix:`
  - `test:`
  - `chore:`
  - `review:`

## Merge Gates
- CI checks must pass.
- PR checklist must be completed.
- At least one review pass recorded.
- High-risk changes need rollback notes.

## Suggested Work Split for This Repo
- Backend API/database: Implementer A
- Frontend UI/UX: Implementer B
- CI/CD + release: Implementer C
- Shared Reviewer and Tester across all streams

