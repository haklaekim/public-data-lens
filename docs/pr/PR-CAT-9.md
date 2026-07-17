# PR-CAT-9: Dataset -> Observed Queue

## Purpose

Enable users to register catalog datasets as Observed candidates for downstream Reference Backbone / Ontology Manager workflows.

## What This PR Adds

- Append-only observed registry artifact:
  - `data/catalog/observed/observed_dataset_registry.jsonl`
- Dedup index artifact:
  - `data/catalog/observed/observed_dataset_registry_index.json`
- API:
  - `POST /api/observed/enqueue`
  - `GET /api/observed/list`
- UI:
  - Enqueue action on Dataset Detail
  - Enqueue action on Evidence results
  - New Observed list page (`/observed`)

## Artifact Schema

Each `observed_dataset_registry.jsonl` line:

```json
{
  "event_type": "enqueue",
  "event_id": "uuid4",
  "ts": "ISO8601",
  "dataset_id": "string",
  "reason": "string|null",
  "tags": ["string"],
  "requested_by": "string|null",
  "source": {
    "snapshot_key": "YYYY-MM",
    "sha256": "...",
    "catalog_rows": 123
  },
  "quality_gate": {
    "status": "PASS|WARN|FAIL|SKIPPED",
    "generated_at": "ISO8601|null"
  },
  "dataset_ref": {
    "title": "...",
    "provider_name": "...",
    "category": "...",
    "format_norm": "...",
    "delivery_norm": "...",
    "mod_date": "...",
    "url": "..."
  }
}
```

## Dedup Policy

- Idempotent by `(dataset_id, snapshot_key)`.
- Same snapshot enqueue:
  - returns `already_enqueued`
  - does not append a new line.
- New snapshot enqueue:
  - appends a new line and returns `enqueued`.

## How To Run

1. Start backend: `python apps/catalog_mcp/scripts/run_server.py`
2. Enqueue:
   `curl -sS -X POST http://127.0.0.1:8010/api/observed/enqueue -H "Content-Type: application/json" -d '{"dataset_id":"<id>","reason":"candidate","tags":["backbone"],"requested_by":"user"}'`
3. List:
   `curl -sS "http://127.0.0.1:8010/api/observed/list?limit=20"`

## Future Integration Notes

Ontology Manager can ingest `observed_dataset_registry.jsonl` as the source for Observed Concept candidate creation and curation workflows.
