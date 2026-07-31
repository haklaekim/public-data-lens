#!/usr/bin/env python3
"""컨시어지 미니 벤치마크 채점기 — 전부 결정적(LLM 채점 없음).

지표(문항 평균):
  precisionAt3      상위 3 후보 중 골든셋 관련성 규칙(titleRegex+region) 일치 비율
  structureCitedAt3 상위 3 후보 중 계획 본문이 그 데이터셋의 '실관측 컬럼명'을 인용한 비율
                    (관측 스토어와 대조 — C1에서는 관측이 없으므로 0이 정직한 값)
  limitsStated      unverified/limitations가 비어 있지 않은 문항 비율(한계 명시율)
  groundingRemoved  근거 없는 참조가 제거된 건수 합(0이 이상적)
  failures          실행 실패 문항 수

사용: python scripts/score_bench.py <C1.json> <C2.json> <출력리포트.json>
검수 대상(리뷰 파일): C2에서 precision@3=0이거나 실패한 문항.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datanav.api.service import Service  # noqa: E402


def relevant(q: dict, title: str, regions: str) -> bool:
    if not re.search(q["titleRegex"], title, re.IGNORECASE):
        return False
    if q.get("region"):
        return q["region"] in (regions or "")
    return True


def observed_columns(svc: Service, record_id: str) -> set[str]:
    try:
        d = svc.get_dataset_structure(record_id)["data"]
    except Exception:
        return set()
    cols: set[str] = set()
    for a in d.get("assets", []) or []:
        for t in a.get("tables") or []:
            cols.update(c["sourceName"] for c in t.get("columns", []))
    return cols


def score_one(svc: Service, golden_q: dict, r: dict) -> dict:
    if not r.get("ok"):
        return {"id": r["id"], "failed": True}
    plan = r.get("plan") or {}
    cands = (plan.get("candidates") or [])[:3]
    plan_text = json.dumps(plan, ensure_ascii=False)

    rel = cited = 0
    for c in cands:
        rid = c.get("recordId", "")
        card = c.get("card") or {}
        title = card.get("title", "")
        regions = ",".join(card.get("regions") or [])
        if title and relevant(golden_q, title, regions):
            rel += 1
        cols = observed_columns(svc, rid)
        # 2자 이하 컬럼명(구, 동 등)은 우연 일치가 많아 제외
        if any(col in plan_text for col in cols if len(col) >= 3):
            cited += 1

    g = r.get("grounding") or {}
    return {
        "id": r["id"],
        "failed": False,
        # 후보·도구 호출이 모두 없으면 명료화 응답(질문 되물음) — 벤치 질문 품질 진단용
        "clarificationOnly": not cands and not r.get("toolTrace"),
        "candidates": len(cands),
        "precisionAt3": rel / 3,
        "structureCitedAt3": cited / 3,
        "limitsStated": bool(plan.get("unverified") or plan.get("limitations")),
        "groundingRemoved": g.get("removedRefs", 0) + len(g.get("removed", [])),
        "elapsedSec": r.get("elapsedSec"),
    }


def aggregate(rows: list[dict]) -> dict:
    ok = [x for x in rows if not x["failed"]]
    n = len(ok) or 1
    return {
        "questions": len(rows),
        "failures": sum(x["failed"] for x in rows),
        "clarificationOnly": sum(x.get("clarificationOnly", False) for x in ok),
        "precisionAt3": round(sum(x["precisionAt3"] for x in ok) / n, 3),
        "structureCitedAt3": round(sum(x["structureCitedAt3"] for x in ok) / n, 3),
        "limitsStatedRate": round(sum(x["limitsStated"] for x in ok) / n, 3),
        "groundingRemovedTotal": sum(x["groundingRemoved"] for x in ok),
        "meanElapsedSec": round(sum(x["elapsedSec"] or 0 for x in ok) / n, 1),
    }


def main() -> None:
    c1 = json.loads(Path(sys.argv[1]).read_text())
    c2 = json.loads(Path(sys.argv[2]).read_text())
    out = Path(sys.argv[3])

    golden = json.loads((Path(__file__).resolve().parents[1] / "golden" / "goldenset_v0.json").read_text())
    gmap = {q["id"]: q for q in golden["queries"]}
    svc = Service()  # 채점은 항상 관측 스토어 포함 기준으로 대조한다

    report: dict = {"note": "결정적 채점 — 관련성=골든셋 titleRegex, 컬럼 인용=관측 스토어 대조"}
    review: list[dict] = []
    for cond, data in (("catalogOnly", c1), ("withStructure", c2)):
        rows = [score_one(svc, gmap[r["id"]], r) for r in data["results"]]
        report[cond] = {"summary": aggregate(rows), "perQuestion": rows}
    for row in report["withStructure"]["perQuestion"]:
        if row["failed"] or row["precisionAt3"] == 0:
            review.append({"id": row["id"], "purpose": gmap[row["id"]]["purpose"],
                           "why": "실패" if row["failed"] else "상위 3 관련성 0 — 인간 검수 필요"})
    report["needsHumanReview"] = review

    out.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for cond in ("catalogOnly", "withStructure"):
        print(cond, json.dumps(report[cond]["summary"], ensure_ascii=False))
    print("검수 필요:", len(review), "문항")


if __name__ == "__main__":
    main()
