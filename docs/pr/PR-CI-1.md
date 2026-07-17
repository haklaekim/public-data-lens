# PR-CI-1: Backend Integrated Smoke in CI

## Purpose

Add a single backend smoke command that validates end-to-end API behavior with a small fixture dataset, and run it automatically in GitHub Actions.

## Added

- Script: `apps/catalog_mcp/scripts/smoke_all.py`
- Fixture CSV: `apps/catalog_mcp/tests/fixtures/public_data_small.csv`
- Workflow: `.github/workflows/ci_smoke.yml`

## Smoke Flow

`smoke_all.py` executes:

1. `ensure_dirs.py`
2. `ingest_current.py` with fixture CSV
3. starts server subprocess on local host/port
4. waits for `GET /api/health` (retry)
5. calls:
   - `GET /api/health`
   - `GET /api/catalog/search?q=성남시&limit=3`
   - `POST /api/ask`
   - `POST /api/observed/enqueue` (first evidence id)
   - `GET /api/observed/list?limit=5`
6. validates response shapes/content
7. shuts down server

## Local Run

```bash
python -m pip install -e ./apps/catalog_mcp
python apps/catalog_mcp/scripts/smoke_all.py --csv apps/catalog_mcp/tests/fixtures/public_data_small.csv
```

Optional arguments:

- `--host` (default `127.0.0.1`)
- `--port` (default `8010`)
- `--timeout_sec` (default `45`)

## CI Notes

- URL checks are disabled in workflow (`URL_CHECK_ENABLED=false`).
- Smoke uses a temp data workspace via env overrides; repository data artifacts are not required.
