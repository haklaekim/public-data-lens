# PR-CI-CORE: Minimal Server + UI Wiring Smoke

## Goal

Verify core end-to-end wiring only:

- backend server starts
- UI starts
- UI pages load and trigger API calls without fetch errors

No business correctness assertions are enforced in these tests.

## Added

- Backend bootstrap script:
  - `apps/catalog_mcp/scripts/ci_bootstrap_backend.py`
- Playwright smoke tests:
  - `apps/catalog_ui/tests/e2e/smoke_search.spec.ts`
  - `apps/catalog_ui/tests/e2e/smoke_evidence.spec.ts`
  - `apps/catalog_ui/tests/e2e/smoke_observed.spec.ts`
- Workflow:
  - `.github/workflows/core_wiring_smoke.yml`

## Local Run

1. Start backend bootstrap:

```bash
python apps/catalog_mcp/scripts/ci_bootstrap_backend.py --csv apps/catalog_mcp/tests/fixtures/public_data_small.csv --host 127.0.0.1 --port 8010
```

2. In another terminal, build and run UI:

```bash
cd apps/catalog_ui
npm install
API_BASE_URL=http://127.0.0.1:8010 VITE_API_BASE_URL=http://127.0.0.1:8010 npm run build
API_BASE_URL=http://127.0.0.1:8010 VITE_API_BASE_URL=http://127.0.0.1:8010 npm run start
```

3. Run Playwright smoke tests:

```bash
cd apps/catalog_ui
npx playwright install --with-deps
npx playwright test tests/e2e/smoke_*.spec.ts
```

## CI Behavior

Single job `core-wiring-smoke`:

1. install backend deps
2. run backend bootstrap in background (fixture-based, temp workspace)
3. install/build/start UI on port 3000
4. run Playwright smoke specs
5. upload Playwright report on failure
