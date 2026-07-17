"""JSON-LD 매핑 — dcat:Catalog / dcat:Dataset(Discovery 계층 1) / dcat:CatalogRecord (§3.1, §7)."""
from __future__ import annotations

import json

from ..config import BASE_URI

CONTEXT_URI = f"{BASE_URI}/context/catalog/1.0"

# JSON-LD Context (정본은 HTTP Resource로도 공개)
JSONLD_CONTEXT = {
    "@version": 1.1,
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "dqv": "http://www.w3.org/ns/dqv#",
    "oa": "http://www.w3.org/ns/oa#",
    "prov": "http://www.w3.org/ns/prov#",
    "aird": f"{BASE_URI}/ns/aird#",
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


def dataset_uri(list_key: str) -> str:
    """정본 Dataset URI — 항상 목록키 기반 불변(§7, rule: record-identity-v1.0)."""
    return f"{BASE_URI}/dataset/{list_key}"


def catalog_uri(snapshot: str) -> str:
    return f"{BASE_URI}/catalog/{snapshot}"


def record_uri(snapshot: str, record_id: str) -> str:
    return f"{BASE_URI}/catalog/{snapshot}/record/{record_id}"


def dataset_jsonld(rec: dict, snapshot: str) -> dict:
    """개별 공공데이터의 Discovery Profile. Q-Tier·DM 부여 금지(§3.1) — null 고정."""
    doc = {
        "@context": CONTEXT_URI,
        "@id": dataset_uri(rec["list_key"]),
        "@type": "dcat:Dataset",
        "identifier": rec["list_key"],
        "dct:language": "ko",
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
        "kdp:recordId": rec["record_id"],
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
        "foaf:primaryTopic": {"@id": dataset_uri(rec["list_key"])},
        "modified": rec["modified_date"],
        "kdp:listType": rec["list_type"],
        "kdp:sourceSnapshot": snapshot,
        "kdp:sourceRowNo": rec["source_row_no"],
    }


def catalog_jsonld(
    snapshot: str, dataset_count: int, assessment: dict, discoverability: dict, processed_at: str
) -> dict:
    """월별 카탈로그 전체(1건의 STRUCT 데이터셋) — Discovery JSON-LD + AIRD 진단 레코드 참조."""
    doc = {
        "@context": CONTEXT_URI,
        "@id": catalog_uri(snapshot),
        "@type": "dcat:Catalog",
        "title": f"공공데이터포털 목록개방현황 카탈로그 {snapshot}",
        "description": "공공데이터포털 목록개방현황(월간)을 정규화한 월별 카탈로그. 각 목록 행은 개별 공공데이터의 Discovery Profile로 제공된다.",
        "dct:language": "ko",
        # dct:issued는 컨텍스트상 xsd:date — 날짜부만 기록하고 전체 시각은 별도 키(J2)
        "issued": processed_at[:10],
        "kdp:processedAt": processed_at,
        "kdp:datasetCount": dataset_count,
        "kdp:evidenceLevel": "CATALOG_METADATA_ONLY",
        "kdp:airdAssessment": {"@id": assessment["@id"]},
        # 중첩 키가 RDF에서 소실되지 않도록 프리픽스 부여, 상세는 JSON 리터럴(J3)
        "kdp:catalogDiscoverability": {
            "kdp:rule": discoverability["rule"],
            "kdp:catalogMetadataReadinessScore": discoverability["catalogMetadataReadinessScore"],
            "kdp:indicatorsJson": json.dumps(discoverability["indicators"], ensure_ascii=False),
        },
    }
    # DM-0은 판정 조건 충족 시에만 기록(§9). Discoverable에서 qualityTier는 금지(제3부 5.3절).
    if assessment.get("aird:diagnosticMaturity"):
        doc["aird:diagnosticMaturity"] = assessment["aird:diagnosticMaturity"]
        doc["aird:qualityIndexMMI"] = assessment["aird:qualityIndexMMI"]
        doc["aird:dataType"] = assessment["aird:dataType"]
        doc["kdp:airdState"] = "Discoverable"
    return doc


def issue_annotation_jsonld(issue: dict, snapshot: str, dataset_list_key: str | None) -> dict:
    """이슈 관찰의 DQV·PROV 표현(§6) — 원본 불변, 별도 관찰 객체."""
    target: dict = {"kdp:field": issue["field"]}
    if dataset_list_key:
        target["@id"] = dataset_uri(dataset_list_key)
    else:
        target["@id"] = catalog_uri(snapshot)  # 카탈로그 수준 관찰(계통적 패턴)
    return {
        "@id": f"{catalog_uri(snapshot)}/annotation/{issue['issue_id']}",
        "@type": "dqv:QualityAnnotation",
        "oa:hasTarget": target,
        "oa:hasBody": {
            "kdp:issueType": issue["issue_type"],
            "kdp:sourceValue": issue["source_value"],
            "kdp:confidence": issue["confidence"],
        },
        "oa:motivatedBy": "dqv:qualityAssessment",
        "prov:wasGeneratedBy": {
            "@type": "prov:Activity",
            "kdp:detectionRule": issue["detection_rule"],
            "prov:endedAtTime": issue["detected_at"],
        },
        "kdp:reviewStatus": issue["review_status"],
        "kdp:resolutionStatus": issue["resolution_status"],
        "kdp:sourceSnapshot": snapshot,
    }
