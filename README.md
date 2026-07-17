# 공공데이터 내비게이터 (datanav)

[설계서 v1.0 확정판](docs/공공데이터_내비게이터_설계서_v1.0_확정판.md) 기반 구현.
공공데이터포털 목록개방현황(월간)을 AIRD 정본(1층) → MCP 서버(2층) → 웹(3층)으로 제공한다.

> 본 결과는 공공데이터포털 목록 메타데이터 기반이며 실제 데이터의 내용·품질·결합 가능성을 보증하지 않습니다.

## 구조

```
apps/server/            # Python — 1층 파이프라인 + 2층 MCP + REST
  datanav/pipeline/     #   파싱·정규화·완전성·JSON-LD·SHACL·diff·빌드(원자적 배포)
  datanav/rules/        #   판정 규칙 레지스트리(§5) — registry.json
  datanav/store/        #   SQLite(FTS5) 릴리스 스토어
  datanav/api/          #   공용 Service + MCP 서버 + REST(FastAPI)
  datanav/prompts/      #   build_data_plan 공개 문서(3중 제공)
  tests/                #   §11 수용 기준 테스트
apps/web/               # React/Vite — M2 비생성형 웹(검색·프로필 4뷰·비교·변경 피드)
data/raw/{YYYY-MM}/     # 원본 스냅샷 보존(해시·행수 메타)
data/catalog/releases/  # 릴리스(불변) + current.json 포인터
docs/매핑표_v1.0.md     # 정규화 매핑표(공개 산출물)
```

## 빠른 시작

```bash
python3 -m venv .venv
.venv/bin/pip install -e "apps/server[dev]"

# 1) 월간 빌드 (수집→정규화→SHACL→수용검사→원자적 배포)
cd apps/server
../../.venv/bin/python scripts/build_catalog.py ../../data/public_data_202602.csv 2026-02

# 2) 테스트 (수용 기준)
../../.venv/bin/python -m pytest

# 3) REST API (웹용)
../../.venv/bin/uvicorn datanav.api.rest:app --port 8000

# 4) 웹 UI
cd ../web && npm install && npm run dev   # http://localhost:5173

# 5) MCP 서버 (stdio)
../../.venv/bin/python -m datanav.api.mcp_server
```

### MCP 클라이언트 등록 (Claude Code 예)

```json
{
  "mcpServers": {
    "datanav": {
      "command": "/절대경로/.venv/bin/python",
      "args": ["-m", "datanav.api.mcp_server"],
      "cwd": "/절대경로/apps/server"
    }
  }
}
```

## 인터페이스 요약 (설계서 §4)

- **Tool 5+1**: `search_datasets`, `get_dataset`(card/normalized/source/jsonld), `compare_datasets`(≤5, 사실만), `get_catalog_changes`(6개 상태), `get_catalog_stats`, `get_context`(호환)
- **Prompt 2**: `build_data_plan`, `compare_for_purpose`
- **Resource 4**: 판정 규칙 레지스트리 / JSON-LD Context / SHACL 셰이프 / Prompt 공개 문서
- **응답 봉투**: `{ data, meta: { sourceSnapshot, processedAt, schemaVersion, ruleVersions[] }, warnings[] }`
- **오류 모델**: INVALID_ARGUMENT / DATASET_NOT_FOUND / SNAPSHOT_NOT_FOUND / FILTER_NOT_AVAILABLE / TOO_MANY_DATASETS / INDEX_NOT_READY / SOURCE_VERSION_UNAVAILABLE / RATE_LIMITED / INTERNAL_ERROR

## v1.0 구현 메모 (부속 명세 확정 대상)

- 목록키 중복(FILE/API 이중 등재 22건)은 `{목록키}-{유형}`으로 분리하고 이슈 관찰로 표면화 — [매핑표 §2](docs/매핑표_v1.0.md)
- SHACL은 카탈로그 노드 + 표본 검증(기본 500건, `DATANAV_SHACL_SAMPLE=0`으로 전수) + 프로그램적 전수 구조 검사
- 오류 코드에 `RATE_LIMITED` 추가(설계서 검토에서 식별된 §4.3 보완)
- 계통적 이슈 패턴(전 행 50% 초과)은 카탈로그 수준 관찰 1건으로 축약
