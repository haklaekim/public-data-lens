"""§11 수용 기준: 커서 페이징 무중복·무누락, 4뷰 정합, 오류 일관성, 전 응답 스냅샷·rule 버전."""
import pytest

from datanav.api.errors import (
    DatasetNotFound,
    InvalidArgument,
    TooManyDatasets,
)
from tests.conftest import requires_catalog

pytestmark = requires_catalog


def _envelope_ok(body):
    assert set(body) == {"data", "meta", "warnings"}
    assert body["meta"]["sourceSnapshot"]
    assert body["meta"]["schemaVersion"] == "1.0.0"
    assert isinstance(body["meta"]["ruleVersions"], list)
    assert any("보증하지 않습니다" in w for w in body["warnings"])  # 면책 고지


def test_search_envelope_and_ranking_meta(service):
    r = service.search_datasets(query="도서관", page_size=10)
    _envelope_ok(r)
    rk = r["data"]["ranking"]
    assert rk["version"] == "ranking-bm25-v1.0"
    assert rk["indexVersion"] and rk["tieBreak"]


def test_cursor_pagination_no_dup_no_gap(service):
    seen = []
    cursor = None
    for _ in range(3):
        r = service.search_datasets(query="현황", page_size=50, cursor=cursor)
        ids = [i["recordId"] for i in r["data"]["items"]]
        seen.extend(ids)
        cursor = r["data"]["nextCursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen))  # 무중복
    total = service.search_datasets(query="현황", page_size=50)["data"]["totalEstimate"]
    assert len(seen) == min(150, total)  # 무누락


def test_four_views_consistency(service):
    rid = service.search_datasets(page_size=1)["data"]["items"][0]["recordId"]
    card = service.get_dataset(rid, "card")["data"]["dataset"]
    norm = service.get_dataset(rid, "normalized")["data"]["dataset"]
    src = service.get_dataset(rid, "source")["data"]["dataset"]
    jld = service.get_dataset(rid, "jsonld")["data"]["dataset"]
    assert card["title"] == norm["title"] == src["sourceFields"]["목록명"] == jld["title"]
    assert card["listKey"] == norm["list_key"] == src["sourceFields"]["목록키"]
    # 정본 URI는 목록키 기반 불변(§7), record_id는 내부 식별자(kdp:recordId)
    assert jld["@id"].endswith(f"/dataset/{card['listKey']}")
    assert jld["kdp:recordId"] == rid
    assert jld["kdp:evidenceLevel"] == "CATALOG_METADATA_ONLY"
    assert jld["kdp:qualityTier"] is None
    assert jld["kdp:diagnosticMaturity"] is None
    # card 재구성 규칙 버전 표기
    assert card["cardRule"] == "card-projection-v1.0"


def test_error_consistency(service):
    with pytest.raises(DatasetNotFound):
        service.get_dataset("no-such-id", "card")
    with pytest.raises(InvalidArgument):
        service.get_dataset("15000001", "bogus-view")
    with pytest.raises(TooManyDatasets):
        service.compare_datasets(["a", "b", "c", "d", "e", "f"])
    with pytest.raises(InvalidArgument):
        service.search_datasets(query="x" * 501)
    with pytest.raises(InvalidArgument):
        service.search_datasets(cursor="박살난커서")
    err = DatasetNotFound("x").to_dict("2026-02")
    assert set(err["error"]) == {"code", "message", "details", "sourceSnapshot"}


def test_compare_is_fact_only(service):
    ids = [i["recordId"] for i in service.search_datasets(query="현황", page_size=2)["data"]["items"]]
    r = service.compare_datasets(ids)
    _envelope_ok(r)
    assert "해석" in r["data"]["note"]  # 무해석 명시
    for d in r["data"]["differences"]:
        assert set(d) == {"field", "values"}  # 사실 구조만


def test_changes_no_baseline_warning(service):
    r = service.get_catalog_changes()
    _envelope_ok(r)
    if r["data"]["baseSnapshot"] is None:
        assert any("이전 스냅샷" in w for w in r["warnings"])


def test_stats_completeness_by_profile(service):
    r = service.get_catalog_stats("completeness")
    _envelope_ok(r)
    profiles = {p["profile"]: p for p in r["data"]["profiles"]}
    assert set(profiles) == {"FILE", "API", "STD"}
    for p in profiles.values():
        assert p["rule"].startswith("catalog-completeness-")


def test_region_evidence_in_results(service):
    r = service.search_datasets(region="KR-11", include_inferred=False, page_size=5)
    for item in r["data"]["items"]:
        seoul = [x for x in item["regions"] if x["code"] == "KR-11"]
        assert seoul and seoul[0]["evidence"] == "EXPLICIT_SPATIAL"
