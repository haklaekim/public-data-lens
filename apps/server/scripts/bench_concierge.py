#!/usr/bin/env python3
"""컨시어지 미니 벤치마크 실행기 — 골든셋 목적 질의를 컨시어지에 넣고 결과를 수집한다.

조건은 프로세스 환경으로 분리한다(코드 분기 없음 — 배포물과 동일 경로):
  C1 카탈로그만:   DATANAV_OBS_DB=/nonexistent (구조 관측 전면 NOT_COLLECTED)
  C2 구조 관측 포함: 기본 환경

사용: python scripts/bench_concierge.py <조건이름> <출력.json> [문항수]
채점은 scripts/score_bench.py가 결정적으로 수행한다(LLM 채점 없음).
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# 캡이 벤치마크를 막지 않도록 상향(import 전에 설정해야 모듈 상수에 반영된다)
os.environ.setdefault("DATANAV_CONCIERGE_SESSION_LIMIT", "1000")
os.environ.setdefault("DATANAV_CONCIERGE_DAILY_LIMIT", "1000")
os.environ.setdefault("DATANAV_CONCIERGE_CLIENT_DAILY_LIMIT", "1000")

from datanav.api.concierge import run_concierge  # noqa: E402

# 골든셋 purpose는 명사구("공중위생 인프라")라 서술어 없이 자연스러운 틀을 쓴다 —
# 비문이면 컨시어지가 (규칙대로) 명료화 질문을 되돌려 벤치가 성립하지 않는다(v0 실측 교훈)
QUESTION_TEMPLATE = "{purpose}에 필요한 공공데이터를 찾고, 결합 방법과 한계까지 포함해 활용 계획을 세워 주세요."


def main() -> None:
    condition = sys.argv[1]
    out_path = Path(sys.argv[2])
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 25

    golden = json.loads((Path(__file__).resolve().parents[1] / "golden" / "goldenset_v0.json").read_text())
    queries = golden["queries"][::2][:n]  # 홀수 번호 25문항 — 주제 분산

    results = []
    for i, q in enumerate(queries, 1):
        question = QUESTION_TEMPLATE.format(purpose=q["purpose"])
        t0 = time.time()
        try:
            r = run_concierge(question, session_id=f"bench-{condition}-{q['id']}")
            body = r.get("data", r)  # 공통 응답 봉투 {data, meta, warnings} 해제
            results.append({
                "id": q["id"], "purpose": q["purpose"], "ok": True,
                "elapsedSec": round(time.time() - t0, 1),
                "plan": body.get("plan"), "grounding": body.get("grounding"),
                "toolTrace": [t.get("tool") for t in body.get("toolTrace", [])],
            })
        except Exception as e:  # 실패도 데이터 — 채점에서 집계
            results.append({
                "id": q["id"], "purpose": q["purpose"], "ok": False,
                "elapsedSec": round(time.time() - t0, 1), "error": str(e)[:300],
            })
        print(f"[{condition}] {i}/{len(queries)} {q['id']} "
              f"{'OK' if results[-1]['ok'] else 'FAIL'} {results[-1]['elapsedSec']}s", flush=True)
        out_path.write_text(json.dumps(
            {"condition": condition, "results": results}, ensure_ascii=False, indent=1))

    print(f"[{condition}] 완료 — {sum(r['ok'] for r in results)}/{len(results)} 성공", flush=True)


if __name__ == "__main__":
    main()
