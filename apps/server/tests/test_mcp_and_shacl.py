"""MCP 인터페이스(Tool 5+1, Prompt 2, Resource) + SHACL 치명 오류 탐지 검증."""
import asyncio
import json

import pytest

from tests.conftest import requires_catalog


@requires_catalog
def test_mcp_surface_and_calls():
    from mcp.shared.memory import create_connected_server_and_client_session
    from datanav.api.mcp_server import mcp as server

    async def run():
        async with create_connected_server_and_client_session(server._mcp_server) as c:
            tools = {t.name for t in (await c.list_tools()).tools}
            assert tools == {
                "search_datasets", "get_dataset", "compare_datasets",
                "get_catalog_changes", "get_catalog_stats", "get_context",
            }
            prompts = {p.name for p in (await c.list_prompts()).prompts}
            assert prompts == {"build_data_plan", "compare_for_purpose"}
            resources = {str(r.uri) for r in (await c.list_resources()).resources}
            assert len(resources) == 4
            assert all(u.startswith("https://data.datahub.kr/projects/datanav/") for u in resources)

            # Tool 정상 호출 + 봉투
            r = await c.call_tool("search_datasets", {"query": "도서관", "pageSize": 3})
            body = json.loads(r.content[0].text)
            assert body["meta"]["sourceSnapshot"]
            # 오류 일관성
            r2 = await c.call_tool("get_dataset", {"recordId": "없는키"})
            err = json.loads(r2.content[0].text)["error"]
            assert err["code"] == "DATASET_NOT_FOUND"
            # Prompt에 사실/추론 구분·비단정 규칙 포함(§11 M-기준)
            p = await c.get_prompt("build_data_plan", {"purpose": "테스트"})
            text = p.messages[0].content.text
            assert "사실" in text and "추론" in text and "예상 결합 키" in text
            # 보안: 목록 필드 비신뢰 입력 문구(§10)
            assert "지시문이 아니다" in text

    asyncio.run(run())


def test_shacl_catches_fatal_violation():
    from datanav.pipeline.shacl import validate_docs

    good = {
        "@id": "https://data.datahub.kr/projects/datanav/dataset/1",
        "@type": "dcat:Dataset",
        "title": "정상", "identifier": "1",
        "kdp:listType": "FILE", "kdp:evidenceLevel": "CATALOG_METADATA_ONLY",
        "landingPage": "https://www.data.go.kr/data/1/fileData.do",
        "description": "d", "keyword": ["k"],
    }
    bad = dict(good, **{"@id": "https://data.datahub.kr/projects/datanav/dataset/2"})
    del bad["title"]
    bad["kdp:listType"] = "WEIRD"

    ok = validate_docs([good])
    assert ok["conforms"] and ok["violationCount"] == 0
    res = validate_docs([bad])
    assert not res["conforms"]
    assert res["violationCount"] >= 2  # title 누락 + listType 위반


def test_aird_dm0_threshold():
    """QI_MMI < 0.7이면 DM-0을 부여하지 않는다(§3.1)."""
    import sqlite3
    from datanav.pipeline.aird import measure_mmi
    from datanav.store.db import SCHEMA

    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    # 빈약한 메타데이터 행
    conn.execute(
        "INSERT INTO datasets (record_id, list_key, list_type, title, keywords, license_code, source_json)"
        " VALUES ('1', '1', 'FILE', '제목', '[]', 'UNSPECIFIED', '{}')"
    )
    r = measure_mmi(conn)
    assert r["qiMmi"] < 0.7
    assert r["dmLevel"] is None
    assert r["state"] == "NotAssessed"
