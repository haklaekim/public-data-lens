"""공용 쿼리 서비스 — MCP·REST가 같은 판정 로직을 사용한다(판단 로직 이중화 금지, §2)."""
from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
from pathlib import Path

from ..config import (
    DEFAULT_PAGE_SIZE,
    MAX_COMPARE,
    MAX_PAGE_SIZE,
    MAX_QUERY_LENGTH,
    current_db_path,
    read_current_pointer,
)
from ..pipeline.jsonld import dataset_jsonld
from ..rules import (
    RULE_CARD,
    RULE_COMPLETENESS,
    RULE_DIFF,
    RULE_FRESHNESS,
    RULE_IDENTITY,
    RULE_RANKING,
    RULE_REGION,
)
from ..store.db import open_ro, row_to_record
from .envelope import decode_cursor, encode_cursor, envelope
from .errors import (
    DatasetNotFound,
    FilterNotAvailable,
    IndexNotReady,
    InvalidArgument,
    TooManyDatasets,
)

_FRESHNESS_DAYS = {
    "DAILY": 7, "WEEKLY": 30, "MONTHLY": 60,
    "QUARTERLY": 180, "SEMIANNUAL": 365, "ANNUAL": 540,
}

_VALID_LIST_TYPES = ("FILE", "API", "STD")
_STATS_AXES = ("theme", "org", "format", "completeness", "listType")
_CHANGE_STATUSES = (
    "ADDED", "MODIFIED", "MISSING_FROM_SNAPSHOT", "REAPPEARED",
    "POSSIBLE_IDENTITY_CHANGE", "OFFICIALLY_WITHDRAWN",
)
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Service:
    def __init__(self, db_path: Path | None = None):
        try:
            path = db_path or current_db_path()
        except FileNotFoundError as e:
            raise IndexNotReady(str(e)) from None
        if not path.exists():
            raise IndexNotReady(f"카탈로그 DB가 없습니다: {path}")
        self.conn: sqlite3.Connection = open_ro(path)
        meta = {k: v for k, v in self.conn.execute("SELECT key, value FROM build_meta")}
        self.snapshot: str = meta.get("snapshot", "unknown")
        self.processed_at: str = meta.get("processedAt", "")
        self.release: str = meta.get("release", "")

    # ------------------------------------------------------------ search
    def search_datasets(
        self,
        query: str | None = None,
        theme: str | None = None,
        org: str | None = None,
        fmt: str | None = None,
        update_cycle: str | None = None,
        license_code: str | None = None,
        list_type: str | None = None,
        region: str | None = None,
        include_inferred: bool = True,
        updated_after: str | None = None,
        cursor: str | None = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict:
        if query and len(query) > MAX_QUERY_LENGTH:
            raise InvalidArgument(f"query는 {MAX_QUERY_LENGTH}자 이하", {"length": len(query)})
        if not 1 <= page_size <= MAX_PAGE_SIZE:
            raise InvalidArgument(f"pageSize는 1~{MAX_PAGE_SIZE}", {"pageSize": page_size})
        if list_type and list_type.upper() not in _VALID_LIST_TYPES:
            raise FilterNotAvailable("listType은 FILE/API/STD", {"listType": list_type})
        if updated_after and not _DATE_RE.match(updated_after):
            raise InvalidArgument("updatedAfter는 YYYY-MM-DD 형식", {"updatedAfter": updated_after})

        offset = 0
        if cursor:
            offset = decode_cursor(cursor, self.snapshot).get("o", 0)

        where, params = [], []
        joins = ""
        warnings: list[str] = []

        if theme:
            where.append("(d.theme_top = ? OR d.theme_raw = ?)")
            params += [theme, theme]
        if org:
            where.append("d.org_name LIKE ?")
            params.append(f"%{org}%")
        if fmt:
            where.append(
                "EXISTS (SELECT 1 FROM json_each(d.formats) jf WHERE jf.value = ?)"
            )
            params.append(fmt.upper())
        if update_cycle:
            where.append("d.update_cycle = ?")
            params.append(update_cycle.upper())
        if license_code:
            where.append("d.license_code = ?")
            params.append(license_code.upper())
        if list_type:
            where.append("d.list_type = ?")
            params.append(list_type.upper())
        if updated_after:
            where.append("d.modified_date >= ?")
            params.append(updated_after)
        if region:
            cond = "json_extract(jr.value, '$.code') = ?"
            if not include_inferred:
                cond += " AND json_extract(jr.value, '$.evidence') = 'EXPLICIT_SPATIAL'"
            where.append(f"EXISTS (SELECT 1 FROM json_each(d.regions) jr WHERE {cond})")
            params.append(region)
            if include_inferred:
                warnings.append(
                    "region 매칭에 추론 근거(INFERRED_*)가 포함될 수 있습니다 — 각 결과의 regions.evidence를 확인하세요(rule: region-match-v1.0)."
                )

        fts_mode = None
        if query and query.strip():
            tokens = [t for t in re.split(r"\s+", query.strip()) if t]
            fts_expr = " ".join('"' + t.replace('"', '""') + '"' for t in tokens)
            joins = "JOIN datasets_fts f ON f.rowid = d.rowid"
            base_where = list(where)
            where.append("datasets_fts MATCH ?")
            params_fts = params + [fts_expr]
            order = "ORDER BY bm25(datasets_fts, 4.0, 3.0, 1.0, 2.0), d.record_id"
            fts_mode = "AND"
            total = self._count(joins, where, params_fts)
            if total == 0 and len(tokens) > 1:
                fts_expr = " OR ".join('"' + t.replace('"', '""') + '"' for t in tokens)
                params_fts = params + [fts_expr]
                total = self._count(joins, where, params_fts)
                fts_mode = "OR-fallback"
                warnings.append("전체 단어 일치 결과가 없어 부분 일치(OR)로 완화해 검색했습니다.")
            params = params_fts
            score_col = "bm25(datasets_fts, 4.0, 3.0, 1.0, 2.0) AS score"
        else:
            order = "ORDER BY d.modified_date DESC, d.record_id"
            score_col = "NULL AS score"
            total = self._count(joins, where, params)

        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        rows = self.conn.execute(
            f"SELECT d.*, {score_col} FROM datasets d {joins} {where_sql} {order} LIMIT ? OFFSET ?",
            params + [page_size, offset],
        ).fetchall()

        items = []
        for r in rows:
            rec = row_to_record(r)
            item = self._summary(rec)
            if rec.get("score") is not None:
                item["score"] = round(rec["score"], 4)
            items.append(item)

        has_more = offset + len(rows) < total
        data = {
            "items": items,
            "nextCursor": encode_cursor({"s": self.snapshot, "o": offset + len(rows)}) if has_more else None,
            "hasMore": has_more,
            "totalEstimate": total,
            "ranking": {
                "method": f"bm25(fts5)/{fts_mode}" if fts_mode else "modified_date desc",
                "version": RULE_RANKING,
                "indexVersion": self.release,
                "embeddingModel": None,
                "tieBreak": "record_id asc",
            },
        }
        return envelope(data, self.snapshot, [RULE_RANKING, RULE_REGION, RULE_IDENTITY], warnings)

    def _count(self, joins: str, where: list[str], params: list) -> int:
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        return self.conn.execute(
            f"SELECT COUNT(*) FROM datasets d {joins} {where_sql}", params
        ).fetchone()[0]

    # ------------------------------------------------------------ get
    def get_dataset(self, record_id: str, view: str = "card") -> dict:
        if view not in ("card", "normalized", "source", "jsonld"):
            raise InvalidArgument("view는 card|normalized|source|jsonld", {"view": view})
        row = self.conn.execute(
            "SELECT * FROM datasets WHERE record_id = ?", (record_id,)
        ).fetchone()
        if row is None:
            # 목록키로 재시도(중복키 레코드 안내)
            alts = self.conn.execute(
                "SELECT record_id FROM datasets WHERE list_key = ?", (record_id,)
            ).fetchall()
            if alts:
                raise DatasetNotFound(
                    "해당 목록키는 복수 유형으로 등재되어 있습니다 — record_id를 지정하세요",
                    {"candidates": [a[0] for a in alts], "rule": RULE_IDENTITY},
                )
            raise DatasetNotFound(f"데이터셋을 찾을 수 없습니다: {record_id}", {"recordId": record_id})
        rec = row_to_record(row)

        if view == "card":
            data = self._card(rec)
            rules = [RULE_CARD, RULE_FRESHNESS, RULE_REGION, rec["completeness_rule"]]
        elif view == "normalized":
            data = {k: v for k, v in rec.items() if k != "source_json"}
            rules = list(RULE_COMPLETENESS.values()) + [RULE_REGION]
        elif view == "source":
            data = {
                "sourceFields": json.loads(rec["source_json"]),
                "sourceRowNo": rec["source_row_no"],
                "note": "공공데이터포털 목록개방현황 원본 필드·값 그대로입니다.",
            }
            rules = []
        else:  # jsonld (정본)
            data = dataset_jsonld(rec, self.snapshot)
            rules = [rec["completeness_rule"]]

        issues = self.conn.execute(
            "SELECT issue_type, field, confidence, review_status FROM issues WHERE record_id = ?",
            (record_id,),
        ).fetchall()
        warnings = [
            f"메타데이터 이슈 관찰 {len(issues)}건 존재(자동 탐지, 검수 전) — 원본 확인 필요"
        ] if issues else []
        return envelope({"view": view, "dataset": data}, self.snapshot, rules, warnings)

    def _summary(self, rec: dict) -> dict:
        return {
            "recordId": rec["record_id"],
            "listKey": rec["list_key"],
            "listType": rec["list_type"],
            "title": rec["title"],
            "orgName": rec["org_name"],
            "theme": {"top": rec["theme_top"], "sub": rec["theme_sub"]},
            "formats": rec["formats"],
            "updateCycle": rec["update_cycle"],
            "modifiedDate": rec["modified_date"],
            "completeness": {
                "score": rec["completeness_score"],
                "profile": rec["completeness_profile"],
                "rule": rec["completeness_rule"],
            },
            "regions": rec["regions"],
            "portalUrl": rec["list_url"],
        }

    def _card(self, rec: dict) -> dict:
        card = self._summary(rec)
        card.update({
            "keywords": rec["keywords"],
            "description": rec["description"],
            "dataLimits": rec["data_limits"],
            "notes": rec["notes"],
            "license": {"code": rec["license_code"], "raw": rec["license_raw"]},
            "updateCycleRaw": rec["update_cycle_raw"],
            "createdDate": rec["created_date"],
            "rowCount": rec["row_count"],
            "apiType": rec["api_type"],
            "fee": rec["fee"],
            "spatial": rec["spatial_raw"],
            "temporal": rec["temporal_raw"],
            "isNationalCore": bool(rec["is_national_core"]),
            "isStandard": bool(rec["is_standard"]),
            "freshness": self._freshness(rec),
            "evidenceLevel": "CATALOG_METADATA_ONLY",
            "cardRule": RULE_CARD,
            "portal": {
                "listKey": rec["list_key"],
                "orgName": rec["org_name"],
                "listUrl": rec["list_url"],
                "listBaseDate": self.snapshot,
                "analyzedAt": self.processed_at,
            },
        })
        return card

    def _freshness(self, rec: dict) -> dict:
        cycle = rec["update_cycle"]
        days = _FRESHNESS_DAYS.get(cycle)
        if days is None or not rec["modified_date"]:
            return {"status": "UNKNOWN", "rule": RULE_FRESHNESS}
        try:
            mod = dt.date.fromisoformat(rec["modified_date"])
            ref = dt.datetime.fromisoformat(self.processed_at.replace("Z", "+00:00")).date()
        except ValueError:
            return {"status": "UNKNOWN", "rule": RULE_FRESHNESS}
        age = (ref - mod).days
        return {
            "status": "FRESH" if age <= days else "POSSIBLY_STALE",
            "ageDays": age,
            "thresholdDays": days,
            "rule": RULE_FRESHNESS,
            "note": "목록 수준 판정 — 실데이터 최신성이 아닙니다",
        }

    # ------------------------------------------------------------ compare
    def compare_datasets(self, record_ids: list[str]) -> dict:
        if len(record_ids) < 2:
            raise InvalidArgument("비교에는 2개 이상 필요", {"count": len(record_ids)})
        if len(record_ids) > MAX_COMPARE:
            raise TooManyDatasets(f"비교는 최대 {MAX_COMPARE}개", {"count": len(record_ids)})
        recs = []
        for rid in record_ids:
            row = self.conn.execute("SELECT * FROM datasets WHERE record_id = ?", (rid,)).fetchone()
            if row is None:
                raise DatasetNotFound(f"데이터셋을 찾을 수 없습니다: {rid}", {"recordId": rid})
            recs.append(row_to_record(row))

        fields = [
            ("listType", lambda r: r["list_type"]),
            ("orgName", lambda r: r["org_name"]),
            ("theme", lambda r: r["theme_raw"]),
            ("formats", lambda r: r["formats"]),
            ("updateCycle", lambda r: r["update_cycle"]),
            ("license", lambda r: r["license_code"]),
            ("modifiedDate", lambda r: r["modified_date"]),
            ("createdDate", lambda r: r["created_date"]),
            ("rowCount", lambda r: r["row_count"]),
            ("spatial", lambda r: r["spatial_raw"]),
            ("temporal", lambda r: r["temporal_raw"]),
            ("completenessScore", lambda r: r["completeness_score"]),
            ("keywords", lambda r: r["keywords"]),
            ("fee", lambda r: r["fee"]),
            ("apiType", lambda r: r["api_type"]),
        ]
        differences, shared = [], []
        for name, getter in fields:
            values = {r["record_id"]: getter(r) for r in recs}
            uniq = {json.dumps(v, ensure_ascii=False, sort_keys=True) for v in values.values()}
            if len(uniq) > 1:
                differences.append({"field": name, "values": values})
            else:
                shared.append({"field": name, "value": next(iter(values.values()))})

        data = {
            "datasets": [self._summary(r) for r in recs],
            "differences": differences,
            "sharedFields": shared,
            "note": "구조화된 사실 비교입니다. 목적별 의미 해석은 포함하지 않습니다(§4.1).",
        }
        return envelope(data, self.snapshot, [RULE_CARD], [])

    # ------------------------------------------------------------ changes
    def get_catalog_changes(
        self, status: str | None = None, cursor: str | None = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> dict:
        if status and status not in _CHANGE_STATUSES:
            raise InvalidArgument(f"status는 {_CHANGE_STATUSES} 중 하나", {"status": status})
        if not 1 <= page_size <= MAX_PAGE_SIZE:
            raise InvalidArgument(f"pageSize는 1~{MAX_PAGE_SIZE}", {"pageSize": page_size})
        offset = decode_cursor(cursor, self.snapshot).get("o", 0) if cursor else 0

        where, params = [], []
        if status:
            where.append("status = ?")
            params.append(status)
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        total = self.conn.execute(
            f"SELECT COUNT(*) FROM changes {where_sql}", params
        ).fetchone()[0]
        rows = self.conn.execute(
            f"SELECT * FROM changes {where_sql} ORDER BY status, record_id LIMIT ? OFFSET ?",
            params + [page_size, offset],
        ).fetchall()
        base = self.conn.execute(
            "SELECT base_snapshot FROM changes LIMIT 1"
        ).fetchone()

        warnings = []
        if total == 0 and base is None:
            warnings.append(
                "비교 기준 이전 스냅샷이 없습니다 — 첫 스냅샷이거나 diff 미생성 상태입니다."
            )
        items = [
            {
                "recordId": r["record_id"],
                "listKey": r["list_key"],
                "status": r["status"],
                "changedFields": json.loads(r["changed_fields"]) if r["changed_fields"] else None,
                "title": r["title"],
                "orgName": r["org_name"],
            }
            for r in rows
        ]
        has_more = offset + len(rows) < total
        data = {
            "baseSnapshot": base["base_snapshot"] if base else None,
            "currentSnapshot": self.snapshot,
            "items": items,
            "nextCursor": encode_cursor({"s": self.snapshot, "o": offset + len(rows)}) if has_more else None,
            "hasMore": has_more,
            "totalEstimate": total,
        }
        return envelope(data, self.snapshot, [RULE_DIFF], warnings)

    # ------------------------------------------------------------ stats
    def get_catalog_stats(self, axis: str, limit: int = 30) -> dict:
        if axis not in _STATS_AXES:
            raise InvalidArgument(f"axis는 {_STATS_AXES} 중 하나", {"axis": axis})
        limit = min(max(limit, 1), 200)
        rules = []
        if axis == "theme":
            rows = self.conn.execute(
                "SELECT theme_top AS k, COUNT(*) AS n FROM datasets GROUP BY theme_top ORDER BY n DESC LIMIT ?",
                (limit,),
            ).fetchall()
            data = {"axis": axis, "buckets": [{"key": r["k"], "count": r["n"]} for r in rows]}
        elif axis == "org":
            rows = self.conn.execute(
                "SELECT org_name AS k, COUNT(*) AS n FROM datasets GROUP BY org_name ORDER BY n DESC LIMIT ?",
                (limit,),
            ).fetchall()
            data = {"axis": axis, "buckets": [{"key": r["k"], "count": r["n"]} for r in rows]}
        elif axis == "format":
            rows = self.conn.execute(
                "SELECT jf.value AS k, COUNT(*) AS n FROM datasets d, json_each(d.formats) jf "
                "GROUP BY jf.value ORDER BY n DESC LIMIT ?",
                (limit,),
            ).fetchall()
            data = {"axis": axis, "buckets": [{"key": r["k"], "count": r["n"]} for r in rows]}
        elif axis == "listType":
            rows = self.conn.execute(
                "SELECT list_type AS k, COUNT(*) AS n FROM datasets GROUP BY list_type ORDER BY n DESC"
            ).fetchall()
            data = {"axis": axis, "buckets": [{"key": r["k"], "count": r["n"]} for r in rows]}
        else:  # completeness — 유형별 프로파일 기준(§4.1)
            rules = list(RULE_COMPLETENESS.values())
            buckets = []
            for profile in ("FILE", "API", "STD"):
                rows = self.conn.execute(
                    "SELECT CAST(completeness_score * 10 AS INTEGER) AS b, COUNT(*) AS n "
                    "FROM datasets WHERE completeness_profile = ? GROUP BY b ORDER BY b",
                    (profile,),
                ).fetchall()
                avg = self.conn.execute(
                    "SELECT AVG(completeness_score) FROM datasets WHERE completeness_profile = ?",
                    (profile,),
                ).fetchone()[0]
                buckets.append({
                    "profile": profile,
                    "rule": RULE_COMPLETENESS[profile],
                    "average": round(avg, 4) if avg is not None else None,
                    "histogram": [
                        {"range": f"{r['b'] / 10:.1f}~{(r['b'] + 1) / 10:.1f}", "count": r["n"]}
                        for r in rows
                    ],
                })
            data = {"axis": axis, "profiles": buckets}
        return envelope(data, self.snapshot, rules, [])

    # ------------------------------------------------------------ status/context
    def get_status(self) -> dict:
        ptr = read_current_pointer()
        counts = {
            "datasets": self.conn.execute("SELECT COUNT(*) FROM datasets").fetchone()[0],
            "issues": self.conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0],
            "changes": self.conn.execute("SELECT COUNT(*) FROM changes").fetchone()[0],
        }
        data = {
            "currentSnapshot": self.snapshot,
            "release": self.release,
            "deployedAt": ptr.get("deployedAt"),
            "processedAt": self.processed_at,
            "counts": counts,
        }
        return envelope(data, self.snapshot, [], [])
