# Dependency validation CI

`CI` runs for every pull request (including Renovate and forks), pushes to `main`, and manual dispatch. It uses `contents: read`, does not persist checkout credentials, and never uses `pull_request_target` or repository secrets. Repository rules and auto-merge are not changed by this workflow.

## Jobs and required checks

Configure branch protection to require **Checks** and **E2E** after the first successful run. Both jobs are independent and have time limits. A newer run for the same PR/ref cancels the older run; feature-branch pushes do not duplicate PR runs.

- **Checks**: frozen install, a non-writing dependency-resolution dry run with strict peers, lint, typecheck (including Worker), formatting, unit/integration tests (including Notion API fixtures, PGlite and Scheduler), audit-policy tests, production build, and security audit. Frozen install alone can skip peer resolution when the lockfile is consistent; the dry run catches conflicts already recorded in that lockfile. It does not update dependencies or save a lockfile.
- **E2E**: frozen install with strict peers, Chrome installation, production build, Mock E2E, migrations into a fresh PostgreSQL 18 service container, PostgreSQL schema/read checks, Notion synchronization checks, then empty/error Database E2E. The Notion suite creates its own randomly named database in the disposable service to exercise committed multi-connection transactions and drops only that database afterward. The CI role needs database creation privileges. It never seeds the empty-E2E database. The container is destroyed with the runner. Its credentials are public test values, not personal database credentials. No Notion API connection is needed.

Node is pinned to **26.13.0**. pnpm is read from `package.json#packageManager` (currently **12.16.1**) so a Renovate package-manager update tests the proposed version. The root `engines >=22.12` is broader than jsdom 30's supported versions; CI intentionally uses the verified Node version. The dependency store is cached by the pnpm setup action and lockfile; every job still performs a frozen install. `node_modules` and build outputs are not restored from cache.

All external actions use official release commit SHAs, with version comments. Renovate can review changes to these pins through its existing GitHub Actions manager.

## Production Docker validation

The independent **Docker** job builds the Web and Worker multi-stage images and the explicit maintenance target, then runs `node scripts/ci/docker.mjs`. It uses only generated disposable credentials and a test-only Notion fetch preload; no real Notion request, VPS deployment, registry push, or repository secret is used. Production source guards and API endpoints are not weakened for tests.

The job validates Compose, applies migrations twice, provisions separate roles, starts Web/PostgreSQL without Worker, checks readiness/static assets and role privileges, explicitly runs fixture Worker sync twice, verifies heartbeat and signal/lock recovery, tests database outage/recovery and named-volume persistence, then backs up and restores into a second empty project. Cleanup verifies the exact project label before deleting only the run's temporary volume. Logs/results are retained for seven days; env/config/dumps are not uploaded.

All actions retain full commit SHA pins. There are no additional Docker actions or deployment permissions. The existing Checks/E2E jobs remain required as before; add Docker as a required check only after its first successful hosted run, through a separate repository-settings change. Local test success is not a hosted CI result. If Docker is unavailable, the script exits nonzero and records `unavailable`, never a passing test.

The Checks job also runs the production Secret Loader and health-probe Node tests. Formatting now covers Docker/CI scripts, production Compose, the workflow, and operational docs. The only dependency-category change is moving the existing locked `tsx` version into Worker runtime dependencies; no package version upgrade is needed.

## Security audit policy

Run locally with `node scripts/ci/audit.mjs`; test the policy with `node --test scripts/ci/audit.test.mjs`.

The runner executes `pnpm audit --json` and writes the raw result to `test-results/security-audit.json`. CI uploads that file and displays the findings in the job summary. Registry failures, malformed reports and unsupported audit formats fail closed.

`.github/security-audit-baseline.json` records the eight reviewed development-only advisories from 2026-11-02. Matching uses GHSA ID, package, exact affected installed versions, maximum reviewed severity, and development-only reachability. A new ID fails even if the vulnerability count is unchanged. Production exposure, a new affected version, or higher severity also fails. Resolved advisories are reported and may be removed from the baseline; they are never reintroduced automatically.

For PRs, the proposed baseline must not expand the baseline at the PR base commit. For pushes, it is compared with the previous commit; manual runs compare the committed baseline. The initial main rollout is the sole bootstrap case when the previous revision has no baseline. There is no update-baseline command or audit-fix step. Do not add exceptions merely to make a dependency PR pass: fix the vulnerability, or obtain a separate explicit policy review. Review workflow/checker changes as security-sensitive code; CI cannot protect its own definition from an authorized edit. Requiring code-owner review is a possible follow-up repository setting, not enabled here.

Known risks remain in development tooling (esbuild, Vite, Zod and minimatch); baseline acceptance is not a declaration that they are fixed. Each baseline entry includes reachability and remediation notes. The current production-only audit has no findings.

## Local database E2E

Use a separately created, empty PostgreSQL test database. Set `DATABASE_URL` explicitly to that disposable database before running `pnpm db:migrate` and `pnpm test:e2e:database`. Never use the normal `.env` database for this sequence. Build first with `DATA_SOURCE=mock`. Existing tests create no seed data and check both empty-state behavior and deliberate connection failure.

The assertions select the accessible `main` landmark, and the dashboard additionally selects its `今日` region. This identifies the page content and Today component without `first()` and keeps every empty-state assertion, avoiding duplicate text nodes in streamed markup. Failure traces/screenshots are uploaded by the E2E job for seven days.
