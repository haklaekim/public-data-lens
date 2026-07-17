"""JSON-LD 매핑 — dcat:Catalog / dcat:Dataset(Discovery 계층 1) / dcat:CatalogRecord (§3.1, §7)."""
from __future__ import annotations

from ..config import BASE_URI

CONTEXT_URI = f"{BASE_URI}/context/catalog/1.0"

# JSON-LD Context (정본은 HTTP Resource로도 공개)
JSONLD_CONTEXT = {
    "@version": 1.1,
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "kdp": f"{BASE_URI}/ns/kdp#",
    "title": "dct:title",
    "description": "dct:description",
    "identifier": "dct:identifier",
    "issued": {"@id": "dct:issued", "@type": "xsd:date"},
    "modified": {"@id": "dct:modified", "@type": "xsd:date"},
    "keyword": "dcat:keyword",
    "theme": "dcat:theme",
    "landingPage": {"@id": "dcat:landingPage", "@type": "@id"},
    "publisher": "dct:publisher",
    "accrualPeriodicity": "dct:accrualPeriodicity",
    "license": "dct:license",
    "spatial": "dct:spatial",
    "temporal": "dct:temporal",
    "dataset": "dcat:dataset",
    "record": "dcat:record",
}


def dataset_uri(record_id: str) -> str:
    return f"{BASE_URI}/dataset/{record_id}"


def catalog_uri(snapshot: str) -> str:
    return f"{BASE_URI}/catalog/{snapshot}"


def record_uri(snapshot: str, record_id: str) -> str:
    return f"{BASE_URI}/catalog/{snapshot}/record/{record_id}"


def dataset_jsonld(rec: dict, snapshot: str) -> dict:
    """개별 공공데이터의 Discovery Profile. Q-Tier·DM 부여 금지(§3.1) — null 고정."""
    doc = {
        "@context": CONTEXT_URI,
        "@id": dataset_uri(rec["record_id"]),
        "@type": "dcat:Dataset",
        "identifier": rec["list_key"],
        "title": rec["title"],
        "description": rec["description"],
        "keyword": rec["keywords"] or None,
        "theme": rec["theme_raw"],
        "issued": rec["created_date"],
        "modified": rec["modified_date"],
        "landingPage": rec["list_url"],
        "publisher": {
            "@type": "foaf:Agent",
            "foaf:name": rec["org_name"],
            "kdp:orgCode": rec["org_code"],
        },
        "accrualPeriodicity": rec["update_cycle_raw"],
        "license": rec["license_raw"],
        "spatial": rec["spatial_raw"],
        "temporal": rec["temporal_raw"],
        "kdp:listType": rec["list_type"],
        "kdp:listKey": rec["list_key"],
        "kdp:evidenceLevel": "CATALOG_METADATA_ONLY",
        "kdp:qualityTier": None,
        "kdp:diagnosticMaturity": None,
        "kdp:catalogMetadataCompleteness": {
            "kdp:score": rec["completeness_score"],
            "kdp:profile": rec["completeness_profile"],
            "kdp:rule": rec["completeness_rule"],
        },
        "kdp:sourceSnapshot": snapshot,
        "kdp:catalogRecord": record_uri(snapshot, rec["record_id"]),
    }
    # Q-Tier·DM 부여 금지는 명시적 null로 표현한다(§3.1) — 그 외 미기재 필드만 제거
    keep_null = {"kdp:qualityTier", "kdp:diagnosticMaturity"}
    return {k: v for k, v in doc.items() if v is not None or k in keep_null}


def catalog_record_jsonld(rec: dict, snapshot: str) -> dict:
    """dcat:CatalogRecord — 데이터셋 정체성과 시점 기술의 분리(§3.1)."""
    return {
        "@context": CONTEXT_URI,
        "@id": record_uri(snapshot, rec["record_id"]),
        "@type": "dcat:CatalogRecord",
        "foaf:primaryTopic": {"@id": dataset_uri(rec["record_id"])},
        "modified": rec["modified_date"],
        "kdp:sourceSnapshot": snapshot,
        "kdp:sourceRowNo": rec["source_row_no"],
    }


def catalog_jsonld(snapshot: str, dataset_count: int, aird_report: dict, processed_at: str) -> dict:
    """월별 카탈로그 전체(1건의 STRUCT 데이터셋) — Discovery JSON-LD + AIRD 진단 리포트."""
    doc = {
        "@context": CONTEXT_URI,
        "@id": catalog_uri(snapshot),
        "@type": "dcat:Catalog",
        "title": f"공공데이터포털 목록개방현황 카탈로그 {snapshot}",
        "description": "공공데이터포털 목록개방현황(월간)을 정규화한 월별 카탈로그. 각 목록 행은 개별 공공데이터의 Discovery Profile로 제공된다.",
        "issued": processed_at,
        "kdp:datasetCount": dataset_count,
        "kdp:airdReport": aird_report,
        "kdp:evidenceLevel": "CATALOG_METADATA_ONLY",
    }
    # DM-0은 판정 조건 충족 시에만 표시(§9)
    if aird_report.get("dmLevel") is not None:
        doc["kdp:diagnosticMaturity"] = aird_report["dmLevel"]
        doc["kdp:airdState"] = "Discoverable"
    return doc
