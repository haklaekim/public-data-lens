"""AIRD 자가 진단(rule: aird-mmi-v1.0) — 월별 카탈로그에 대한 MMI 측정과 DM-0 판정(§3.1).

표준을 자기 자신에게 적용하는 실증: 적용 가능한 MMI 지표를 전수 측정하고
QI_MMI ≥ 0.7일 때만 DM-0(Discoverable)을 부여한다.
AIRD Core Manifest는 DM-2 이상 및 Quality-Ready 전이 후 생성(v1.0 범위 외).
"""
from __future__ import annotations

import re
import sqlite3

from ..rules import RULE_AIRD

_URL_RE = re.compile(r"^https?://\S+$")

QI_THRESHOLD = 0.7


def measure_mmi(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) FROM datasets").fetchone()[0]
    if total == 0:
        raise ValueError("빈 카탈로그에는 MMI를 측정하지 않는다")

    def ratio(where: str) -> float:
        n = conn.execute(f"SELECT COUNT(*) FROM datasets WHERE {where}").fetchone()[0]
        return round(n / total, 4)

    url_valid = conn.execute(
        "SELECT list_url FROM datasets WHERE list_url IS NOT NULL"
    ).fetchall()
    url_valid_n = sum(1 for (u,) in url_valid if _URL_RE.match(u))

    indicators = {
        "identifierPresence": ratio("list_key IS NOT NULL AND list_key != ''"),
        "titlePresence": ratio("title IS NOT NULL AND title != ''"),
        "descriptionPresence": ratio("description IS NOT NULL"),
        "publisherPresence": ratio("org_name IS NOT NULL"),
        "licensePresence": ratio("license_code NOT IN ('UNSPECIFIED')"),
        "keywordPresence": ratio("keywords != '[]'"),
        "datePresence": ratio("modified_date IS NOT NULL AND created_date IS NOT NULL"),
        "urlFormatValidity": round(url_valid_n / total, 4),
    }
    qi_mmi = round(sum(indicators.values()) / len(indicators), 4)
    dm_level = "DM-0" if qi_mmi >= QI_THRESHOLD else None
    return {
        "rule": RULE_AIRD,
        "indicators": indicators,
        "qiMmi": qi_mmi,
        "threshold": QI_THRESHOLD,
        "dmLevel": dm_level,
        "state": "Discoverable" if dm_level else "NotAssessed",
        "note": "목록 메타데이터 기반 자가 진단. 개별 데이터셋에는 Q-Tier·DM을 부여하지 않는다(evidenceLevel=CATALOG_METADATA_ONLY).",
    }
