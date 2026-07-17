"""부속 명세 — Tool별 출력 JSON Schema 정의(공개 계약 초안).

입력 스키마는 MCP 서버(FastMCP)가 생성하는 것을 단일 출처로 추출하고(스크립트),
출력 스키마는 본 모듈이 단일 출처다. 계약-코드 정합은 tests/test_contract_spec.py가 보증한다.

호환성 원칙(초안): 필드 추가는 하위 호환(minor), required 필드 제거·의미 변경은 breaking(major).
schemaVersion은 응답 봉투 meta.schemaVersion으로 전달된다.
"""
from __future__ import annotations

SPEC_VERSION = "1.0-draft"

# ---------------------------------------------------------------- $defs
DEFS = {
    "meta": {
        "type": "object",
        "required": ["sourceSnapshot", "processedAt", "schemaVersion", "ruleVersions"],
        "properties": {
            "sourceSnapshot": {"type": "string", "description": "판정 근거 스냅샷(YYYY-MM)"},
            "processedAt": {"type": "string", "format": "date-time"},
            "schemaVersion": {"type": "string"},
            "ruleVersions": {"type": "array", "items": {"type": "string"}},
        },
    },
    "warnings": {
        "type": "array",
        "items": {"type": "string"},
        "description": "면책 고지 1건 이상 항상 포함(§10)",
        "minItems": 1,
    },
    "error": {
        "type": "object",
        "required": ["error"],
        "properties": {
            "error": {
                "type": "object",
                "required": ["code", "message", "details", "sourceSnapshot"],
                "properties": {
                    "code": {
                        "enum": [
                            "INVALID_ARGUMENT", "DATASET_NOT_FOUND", "SNAPSHOT_NOT_FOUND",
                            "FILTER_NOT_AVAILABLE", "TOO_MANY_DATASETS", "INDEX_NOT_READY",
                            "SOURCE_VERSION_UNAVAILABLE", "RATE_LIMITED", "INTERNAL_ERROR",
                        ]
                    },
                    "message": {"type": "string"},
                    "details": {"type": "object"},
                    "sourceSnapshot": {"type": ["string", "null"]},
                },
            }
        },
    },
    "completeness": {
        "type": "object",
        "required": ["score", "profile", "rule"],
        "properties": {
            "score": {"type": "number", "minimum": 0, "maximum": 1},
            "profile": {"enum": ["FILE", "API", "STD"]},
            "rule": {"type": "string"},
        },
    },
    "region": {
        "type": "object",
        "required": ["code", "name", "evidence", "confidence"],
        "properties": {
            "code": {"type": "string", "pattern": "^KR-\\d{2}$"},
            "name": {"type": "string"},
            "evidence": {
                "enum": ["EXPLICIT_SPATIAL", "INFERRED_FROM_TITLE",
                         "INFERRED_FROM_PUBLISHER", "INFERRED_FROM_DESCRIPTION", "UNKNOWN"]
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
    },
    "summaryItem": {
        "type": "object",
        "required": ["recordId", "listKey", "listType", "title", "orgName",
                     "theme", "formats", "updateCycle", "completeness", "regions"],
        "properties": {
            "recordId": {"type": "string"},
            "listKey": {"type": "string"},
            "listType": {"enum": ["FILE", "API", "STD"]},
            "title": {"type": "string"},
            "orgName": {"type": ["string", "null"]},
            "theme": {
                "type": "object",
                "properties": {"top": {"type": ["string", "null"]}, "sub": {"type": ["string", "null"]}},
            },
            "formats": {"type": "array", "items": {"type": "string"}},
            "updateCycle": {"type": "string"},
            "modifiedDate": {"type": ["string", "null"]},
            "completeness": {"$ref": "#/$defs/completeness"},
            "regions": {"type": "array", "items": {"$ref": "#/$defs/region"}},
            "portalUrl": {"type": ["string", "null"]},
            "score": {"type": "number", "description": "query 있을 때만 — BM25 점수(낮을수록 상위)"},
        },
    },
    "ranking": {
        "type": "object",
        "required": ["method", "version", "indexVersion", "embeddingModel", "tieBreak"],
        "properties": {
            "method": {"type": "string"},
            "version": {"type": "string"},
            "indexVersion": {"type": "string"},
            "embeddingModel": {"type": ["string", "null"]},
            "tieBreak": {"type": "string"},
        },
    },
    "changeItem": {
        "type": "object",
        "required": ["recordId", "listKey", "status", "changedFields", "title", "orgName"],
        "properties": {
            "recordId": {"type": "string"},
            "listKey": {"type": "string"},
            "status": {
                "enum": ["ADDED", "MODIFIED", "MISSING_FROM_SNAPSHOT", "REAPPEARED",
                         "POSSIBLE_IDENTITY_CHANGE", "OFFICIALLY_WITHDRAWN"]
            },
            "changedFields": {"type": ["array", "null"], "items": {"type": "string"}},
            "title": {"type": ["string", "null"]},
            "orgName": {"type": ["string", "null"]},
        },
    },
}


def _envelope(data_schema: dict) -> dict:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["data", "meta", "warnings"],
        "properties": {
            "data": data_schema,
            "meta": {"$ref": "#/$defs/meta"},
            "warnings": {"$ref": "#/$defs/warnings"},
        },
        "$defs": DEFS,
    }


# ------------------------------------------------------- Tool별 출력 스키마
OUTPUT_SCHEMAS: dict[str, dict] = {
    "search_datasets": _envelope({
        "type": "object",
        "required": ["items", "nextCursor", "hasMore", "totalEstimate", "ranking"],
        "properties": {
            "items": {"type": "array", "items": {"$ref": "#/$defs/summaryItem"}},
            "nextCursor": {"type": ["string", "null"]},
            "hasMore": {"type": "boolean"},
            "totalEstimate": {"type": "integer", "minimum": 0},
            "ranking": {"$ref": "#/$defs/ranking"},
        },
    }),
    "get_dataset": _envelope({
        "type": "object",
        "required": ["view", "dataset"],
        "properties": {
            "view": {"enum": ["card", "normalized", "source", "jsonld"]},
            "dataset": {"type": "object"},
        },
        "allOf": [
            {
                "if": {"properties": {"view": {"const": "card"}}},
                "then": {"properties": {"dataset": {
                    "type": "object",
                    "required": ["recordId", "listKey", "listType", "title", "completeness",
                                 "freshness", "evidenceLevel", "cardRule", "portal"],
                    "properties": {
                        "evidenceLevel": {"const": "CATALOG_METADATA_ONLY"},
                        "cardRule": {"type": "string"},
                        "freshness": {
                            "type": "object",
                            "required": ["status", "rule"],
                            "properties": {"status": {"enum": ["FRESH", "POSSIBLY_STALE", "UNKNOWN"]}},
                        },
                        "portal": {
                            "type": "object",
                            "required": ["listKey", "orgName", "listUrl", "listBaseDate", "analyzedAt"],
                        },
                    },
                }}},
            },
            {
                "if": {"properties": {"view": {"const": "source"}}},
                "then": {"properties": {"dataset": {
                    "type": "object", "required": ["sourceFields", "sourceRowNo"],
                }}},
            },
            {
                "if": {"properties": {"view": {"const": "jsonld"}}},
                "then": {"properties": {"dataset": {
                    "type": "object",
                    "required": ["@context", "@id", "@type", "identifier",
                                 "kdp:recordId", "kdp:evidenceLevel",
                                 "kdp:qualityTier", "kdp:diagnosticMaturity"],
                    "properties": {
                        "@type": {"const": "dcat:Dataset"},
                        "kdp:evidenceLevel": {"const": "CATALOG_METADATA_ONLY"},
                        "kdp:qualityTier": {"type": "null"},
                        "kdp:diagnosticMaturity": {"type": "null"},
                    },
                }}},
            },
        ],
    }),
    "compare_datasets": _envelope({
        "type": "object",
        "required": ["datasets", "differences", "sharedFields", "note"],
        "properties": {
            "datasets": {"type": "array", "minItems": 2, "maxItems": 5,
                         "items": {"$ref": "#/$defs/summaryItem"}},
            "differences": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["field", "values"],
                    "properties": {"field": {"type": "string"}, "values": {"type": "object"}},
                    "additionalProperties": False,
                },
                "description": "사실 차이만 — 해석 필드는 계약상 존재하지 않는다(§4.1)",
            },
            "sharedFields": {
                "type": "array",
                "items": {"type": "object", "required": ["field", "value"]},
            },
            "note": {"type": "string"},
        },
    }),
    "get_catalog_changes": _envelope({
        "type": "object",
        "required": ["baseSnapshot", "currentSnapshot", "items", "nextCursor",
                     "hasMore", "totalEstimate"],
        "properties": {
            "baseSnapshot": {"type": ["string", "null"],
                             "description": "v1.0 범위: 직전 배포 스냅샷과의 diff만 제공. 기간·기준월 조회는 v1.1 백로그"},
            "currentSnapshot": {"type": "string"},
            "items": {"type": "array", "items": {"$ref": "#/$defs/changeItem"}},
            "nextCursor": {"type": ["string", "null"]},
            "hasMore": {"type": "boolean"},
            "totalEstimate": {"type": "integer", "minimum": 0},
        },
    }),
    "get_catalog_stats": _envelope({
        "type": "object",
        "required": ["axis"],
        "properties": {"axis": {"enum": ["theme", "org", "format", "completeness", "listType"]}},
        "oneOf": [
            {
                "required": ["buckets"],
                "properties": {"buckets": {"type": "array", "items": {
                    "type": "object", "required": ["key", "count"],
                    "properties": {"key": {"type": ["string", "null"]},
                                   "count": {"type": "integer"}},
                }}},
            },
            {
                "required": ["profiles"],
                "properties": {"profiles": {"type": "array", "items": {
                    "type": "object",
                    "required": ["profile", "rule", "average", "histogram"],
                    "properties": {
                        "profile": {"enum": ["FILE", "API", "STD"]},
                        "average": {"type": ["number", "null"]},
                        "histogram": {"type": "array", "items": {
                            "type": "object", "required": ["range", "count"],
                        }},
                    },
                }}},
            },
        ],
    }),
    "get_context": _envelope({
        "type": "object",
        "required": ["currentSnapshot", "release", "deployedAt", "processedAt",
                     "counts", "service"],
        "properties": {
            "counts": {
                "type": "object",
                "required": ["datasets", "issues", "changes"],
            },
            "service": {
                "type": "object",
                "required": ["definition", "baseUri", "rules", "responsibilityNote"],
                "properties": {"rules": {"type": "array", "items": {
                    "type": "object", "required": ["ruleId", "title"],
                }}},
            },
        },
    }),
}
