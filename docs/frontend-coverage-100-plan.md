# Frontend 100% Coverage Plan

## Objective
- Enforce 100% line/branch/function/statement coverage for the entire `frontend/src`.

## Current Baseline
- CI currently enforces 100% only for the `apiError` utility scope.
- Lint and coverage pipelines are already integrated in PR validation.

## Delivery Strategy
- Use staged expansion with hard gates per scope.
- Keep each stage shippable.
- Run independent scopes in parallel to reduce lead time.

## Stage Plan

### Stage 0: Infrastructure (Applied)
- Added coverage scopes in `frontend/vite.config.mjs` via `COVERAGE_SCOPE`.
- Added shard scripts in `frontend/package.json`:
  - `test:coverage:core`
  - `test:coverage:shell`
  - `test:coverage:admin-pages`
  - `test:coverage:customer-pages`
  - `test:coverage:all-src`
  - `test:coverage:parallel`
- Each scope already has 100% thresholds configured.

### Stage 1: Core Modules (utils/services/contexts)
- Add tests for:
  - `src/services/api.ts` interceptors and API wrappers
  - `src/contexts/AuthContext.tsx` login/logout/bootstrap branches
  - Additional utility edge cases
- Switch CI frontend coverage gate from `api-error` to `core`.

### Stage 2: Shell and Routing
- Add tests for:
  - `src/App.tsx` route guards and redirects
  - `src/components/Layout.tsx` role-based nav rendering
  - `src/index.tsx` bootstrap smoke test
- Add CI matrix lane for `shell`.

### Stage 3: Customer Flows
- Add tests for:
  - `CustomerDashboard`, `CustomerProfile`, `Login`
  - success/failure/rendering states
- Enable `customer-pages` gate in CI.

### Stage 4: Admin Flows
- Add tests for:
  - `CustomerManagement`, `CustomerDetail`
  - `MembershipManagement`, `MembershipTypeManagement`
  - `ClassManagement`, `ClassDetail`, `AdminDashboard`
- Enable `admin-pages` gate in CI.

### Stage 5: Final Gate
- Replace scoped gate with single strict gate:
  - `npm run test:coverage:all-src`
- Keep shard jobs for fast diagnosis, but block merge on `all-src`.

## Parallel Execution Options

### Option A (Recommended): 4-track parallel by scope
- Track 1: `core`
- Track 2: `shell`
- Track 3: `customer-pages`
- Track 4: `admin-pages`
- Pros: minimal merge conflicts, clear ownership.

### Option B: Page-per-owner split
- One owner per page file.
- Pros: max concurrency.
- Cons: review and CI load increase.

### Option C: Risk-priority split
- First: auth/login/customer-management/class-detail
- Then remaining pages.
- Pros: early risk reduction.

## CI Expansion Blueprint
- Start with matrix (non-blocking) for shard visibility.
- Promote shard jobs to required checks once stable.
- Final required check:
  - `frontend-coverage-all-src-100`

## Done Criteria
- `npm run test:coverage:all-src` passes at 100/100/100/100.
- CI required checks include full frontend 100% coverage.
- New frontend PRs cannot merge with coverage regression.

