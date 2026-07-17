"""월간 빌드 오케스트레이션(§8): 수집→검증→정규화→SHACL→diff→수용 검사→원자적 배포."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import random
import shutil
import sqlite3
from pathlib import Path

from ..config import CATALOG_DIR, CURRENT_POINTER, RAW_DIR, RELEASES_DIR, SCHEMA_VERSION
from ..rules import RULE_ISSUE, load_registry
from ..store import db as store
from . import aird, diff as diffmod, shacl
from .completeness import compute_completeness
from .jsonld import catalog_jsonld, dataset_jsonld
from .normalize import detect_issues, normalize_row
from .parse import parse_snapshot_csv


class BuildError(Exception):
    """수용 검사 실패 — 배포 중단, 이전 정상 버전 유지(§8)."""


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def preserve_snapshot(source_csv: Path, snapshot: str) -> Path:
    """원본 스냅샷 보존 + 해시·행수 메타(§8). 이미 보존돼 있으면 해시 검증만."""
    raw_dir = RAW_DIR / snapshot
    raw_dir.mkdir(parents=True, exist_ok=True)
    target = raw_dir / f"public_data_{snapshot}.csv"
    if not target.exists():
        shutil.copy2(source_csv, target)
    digest = _sha256(target)
    meta_path = raw_dir / "meta.json"
    if meta_path.exists():
        prev = json.loads(meta_path.read_text(encoding="utf-8"))
        if prev["sha256"] != digest:
            raise BuildError(f"보존된 스냅샷 해시 불일치: {snapshot}")
    else:
        with open(target, encoding="utf-8-sig", newline="") as f:
            line_count = sum(1 for _ in f)
        meta_path.write_text(
            json.dumps(
                {"snapshot": snapshot, "sha256": digest, "bytes": target.stat().st_size,
                 "physicalLines": line_count, "preservedAt": _now()},
                ensure_ascii=False, indent=2,
            ),
            encoding="utf-8",
        )
    return target


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_release(source_csv: Path, snapshot: str, min_rows: int = 1000) -> Path:
    """릴리스 디렉터리를 새로 빌드한다. 성공 시에만 current 포인터 교체."""
    started = _now()
    csv_path = preserve_snapshot(source_csv, snapshot)

    release_name = f"{snapshot}_{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    release_dir = RELEASES_DIR / release_name
    release_dir.mkdir(parents=True, exist_ok=False)
    db_path = release_dir / "catalog.db"
    conn = store.create_db(db_path)

    # 1) 파싱·정규화·적재 — 목록키 중복은 record-identity-v1.0으로 해소
    parsed = list(parse_snapshot_csv(csv_path))
    source_rows = len(parsed)
    if source_rows < min_rows:
        raise BuildError(f"행수 급감 감지: {source_rows} < {min_rows}")

    key_counts: dict[str, int] = {}
    for p in parsed:
        k = p["source"]["목록키"].strip()
        key_counts[k] = key_counts.get(k, 0) + 1

    detected_at = _now()
    dup_records: list[str] = []
    inserted = 0
    for p in parsed:
        rec = normalize_row(p["source"], p["row_no"])
        if key_counts[rec["list_key"]] > 1:
            rec["record_id"] = f"{rec['list_key']}-{rec['list_type']}"
            dup_records.append(rec["record_id"])
        else:
            rec["record_id"] = rec["list_key"]
        comp = compute_completeness(rec)
        store.insert_dataset(conn, rec, comp)
        inserted += 1
        for issue in detect_issues(rec, p["source"]):
            _insert_issue(conn, rec["record_id"], issue, detected_at)
    for rid in dup_records:
        _insert_issue(
            conn, rid,
            {"field": "목록키", "source_value": rid.rsplit("-", 1)[0],
             "issue_type": "DUPLICATE_LIST_KEY", "confidence": 1.0},
            detected_at,
        )
    _collapse_systemic_issues(conn, inserted, detected_at)
    store.build_fts(conn)
    conn.commit()

    # 2) AIRD 자가 진단 + 카탈로그 JSON-LD
    aird_report = aird.measure_mmi(conn)
    cat_doc = catalog_jsonld(snapshot, inserted, aird_report, started)
    (release_dir / "catalog.jsonld").write_text(
        json.dumps(cat_doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (release_dir / "aird_report.json").write_text(
        json.dumps(aird_report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 3) SHACL 검증: 카탈로그 노드 + 데이터셋 표본
    n_sample = shacl.sample_size()
    conn.row_factory = sqlite3.Row
    sample_rows = conn.execute(
        "SELECT * FROM datasets ORDER BY record_id"
    ).fetchall()
    if n_sample and n_sample < len(sample_rows):
        rng = random.Random(20260717)  # 재현 가능 표본
        sample_rows = rng.sample(sample_rows, n_sample)
    docs = [cat_doc] + [
        dataset_jsonld(store.row_to_record(r), snapshot) for r in sample_rows
    ]
    shacl_report = shacl.validate_docs(docs)
    shacl_report["sampleSize"] = len(sample_rows)
    shacl_report["mode"] = "sample" if n_sample else "full"
    (release_dir / "shacl_report.json").write_text(
        json.dumps(shacl_report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if not shacl_report["conforms"]:
        raise BuildError(f"SHACL 치명 오류 {shacl_report['violationCount']}건 — 배포 중단")

    # 4) diff (이전 릴리스가 있으면)
    prev_release = _read_current()
    diff_summary = {"baseSnapshot": None, "counts": {}}
    if prev_release and prev_release["snapshot"] != snapshot:
        prev_db = RELEASES_DIR / prev_release["release"] / "catalog.db"
        if prev_db.exists():
            prev_conn = store.open_ro(prev_db)
            prev_missing = {
                r[0] for r in prev_conn.execute(
                    "SELECT record_id FROM changes WHERE status='MISSING_FROM_SNAPSHOT'"
                )
            }
            withdrawn = diffmod.load_withdrawn_confirmed(CATALOG_DIR / "withdrawn_confirmed.json")
            changes = diffmod.compute_changes(
                conn, prev_conn, prev_release["snapshot"], prev_missing, withdrawn
            )
            prev_conn.close()
            conn.executemany(
                "INSERT INTO changes (record_id, list_key, status, changed_fields, base_snapshot, title, org_name)"
                " VALUES (:record_id, :list_key, :status, :changed_fields, :base_snapshot, :title, :org_name)",
                changes,
            )
            conn.commit()
            counts: dict[str, int] = {}
            for c in changes:
                counts[c["status"]] = counts.get(c["status"], 0) + 1
            diff_summary = {"baseSnapshot": prev_release["snapshot"], "counts": counts}

    # 5) 수용 검사(§11 데이터 기준)
    checks = _acceptance_checks(conn, source_rows, parsed)
    report = {
        "snapshot": snapshot,
        "release": release_name,
        "startedAt": started,
        "finishedAt": _now(),
        "sourceRows": source_rows,
        "insertedRows": inserted,
        "duplicateListKeys": len(dup_records) // 2 if dup_records else 0,
        "acceptance": checks,
        "aird": {"qiMmi": aird_report["qiMmi"], "dmLevel": aird_report["dmLevel"]},
        "shacl": {k: shacl_report[k] for k in ("conforms", "violationCount", "warningCount", "sampleSize", "mode")},
        "diff": diff_summary,
        "schemaVersion": SCHEMA_VERSION,
        "ruleRegistryVersion": load_registry()["registryVersion"],
    }
    (release_dir / "build_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    failed = [k for k, v in checks.items() if not v["pass"]]
    if failed:
        raise BuildError(f"수용 검사 실패: {failed}")

    # 빌드 메타를 DB에도 기록
    for k, v in (
        ("snapshot", snapshot), ("release", release_name),
        ("processedAt", report["finishedAt"]), ("schemaVersion", SCHEMA_VERSION),
        ("datasetCount", str(inserted)),
    ):
        conn.execute("INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)", (k, v))
    conn.commit()
    conn.close()

    # 6) 원자적 배포: 포인터 교체
    tmp = CURRENT_POINTER.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(
            {"release": release_name, "snapshot": snapshot, "deployedAt": _now()},
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )
    tmp.replace(CURRENT_POINTER)
    return release_dir


def _collapse_systemic_issues(conn, total_rows: int, detected_at: str) -> None:
    """전체 행의 50%를 초과하는 동일 유형·필드 패턴은 카탈로그 수준 관찰 1건으로 축약(rule: issue-detect-v1.0)."""
    systemic = conn.execute(
        "SELECT issue_type, field, COUNT(*) AS n FROM issues "
        "GROUP BY issue_type, field HAVING n > ?",
        (total_rows // 2,),
    ).fetchall()
    for issue_type, field, n in systemic:
        conn.execute(
            "DELETE FROM issues WHERE issue_type = ? AND field = ?", (issue_type, field)
        )
        _insert_issue(
            conn, "@catalog",
            {"field": field,
             "source_value": f"계통적 패턴 — 전체 {total_rows}행 중 {n}행에서 발생",
             "issue_type": issue_type, "confidence": 0.99},
            detected_at,
        )


def _insert_issue(conn, record_id: str, issue: dict, detected_at: str) -> None:
    conn.execute(
        "INSERT INTO issues (record_id, field, source_value, issue_type, confidence, detection_rule, detected_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (record_id, issue["field"], issue["source_value"], issue["issue_type"],
         issue["confidence"], RULE_ISSUE, detected_at),
    )


def _read_current() -> dict | None:
    if CURRENT_POINTER.exists():
        return json.loads(CURRENT_POINTER.read_text(encoding="utf-8"))
    return None


def _acceptance_checks(conn, source_rows: int, parsed: list) -> dict:
    inserted = conn.execute("SELECT COUNT(*) FROM datasets").fetchone()[0]
    dup_ids = conn.execute(
        "SELECT COUNT(*) FROM (SELECT record_id FROM datasets GROUP BY record_id HAVING COUNT(*) > 1)"
    ).fetchone()[0]
    src_urls = sum(1 for p in parsed if p["source"]["목록 URL"].strip() not in ("", "-"))
    db_urls = conn.execute("SELECT COUNT(*) FROM datasets WHERE list_url IS NOT NULL").fetchone()[0]
    no_rule = conn.execute(
        "SELECT COUNT(*) FROM datasets WHERE completeness_rule IS NULL OR completeness_rule = ''"
    ).fetchone()[0]
    return {
        "rowCountMatch": {"pass": inserted == source_rows, "source": source_rows, "inserted": inserted},
        "recordIdDuplicates": {"pass": dup_ids == 0, "count": dup_ids},
        "urlPreservation": {"pass": db_urls == src_urls, "source": src_urls, "db": db_urls},
        "allRowsHaveCompletenessRule": {"pass": no_rule == 0, "missing": no_rule},
    }
