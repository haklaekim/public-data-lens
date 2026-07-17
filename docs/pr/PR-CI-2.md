# PR-CI-2: Playwright UI Smoke + CI Integration

## Purpose

Add deterministic, minimal UI E2E smoke tests and run them in CI with local backend + fixture data.

## Added

- Playwright setup in `apps/catalog_ui`:
  - `playwright.config.ts`
  - `tests/e2e/search.spec.ts`
  - `tests/e2e/ask_evidence.spec.ts`
  - `tests/e2e/observed.spec.ts`
- UI scripts:
  - `npm run start` (preview on `127.0.0.1:3000`)
  - `npm run test:e2e`
- CI workflow update:
  - `.github/workflows/ci_smoke.yml` now includes `ui-smoke` job.

## What `ui-smoke` Does

1. Setup Python + Node.
2. Install backend deps.
3. Build temp data workspace and ingest fixture CSV.
4. Start backend server on `127.0.0.1:8010`.
5. Install UI deps (`npm ci`), build, and start preview server on `127.0.0.1:3000`.
6. Install Playwright browsers.
7. Run Playwright tests headlessly.
8. Upload Playwright report artifact on failure.

## Local Run

Backend (terminal 1):

```bash
python -m pip install -e ./apps/catalog_mcp
python apps/catalog_mcp/scripts/smoke_all.py --csv apps/catalog_mcp/tests/fixtures/public_data_small.csv
```

UI Playwright (terminal 2):

```bash
cd apps/catalog_ui
npm install
npm run build
API_BASE_URL=http://127.0.0.1:8010 VITE_API_BASE_URL=http://127.0.0.1:8010 npm run start
```

UI tests (terminal 3):

```bash
cd apps/catalog_ui
npx playwright install --with-deps
npm run test:e2e
```
