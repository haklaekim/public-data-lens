# 공공데이터 내비게이터 (datanav)

[설계서 v1.0 확정판](docs/공공데이터_내비게이터_설계서_v1.0_확정판.md) 기반 구현.
공공데이터포털 목록개방현황(월간)을 AIRD 정본(1층) → MCP 서버(2층) → 웹(3층)으로 제공한다.

**현재 상태: v1.0 코어 구현 후보 (M1·M2 beta)** — 검색·정규화·MCP·비생성형 웹 구현, 2026-06 스냅샷(96,056건) 배포,
2026-02→2026-06 실데이터 diff 가동. 공개 계약은 2026-07-17 부속 명세 v1.0.0 승인으로 동결. 남은 v1.0 확정 조건: 골든셋 인간 검수, 정본 URI 호스팅(도메인 확보됨).

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

## 빠른 시작 (Docker — 표준 실행 방식)

로컬·클라우드 공용. 카탈로그(`data/`)는 볼륨 마운트라 스냅샷 교체 시 재빌드가 필요 없다.

```bash
cp .env.example .env          # ANTHROPIC_API_KEY 입력(컨시어지용, 없으면 비생성형만 동작)
docker compose up -d --build  # 웹+API: http://localhost:8088 (API는 nginx 프록시 뒤)

# 월간 카탈로그 갱신 (빌드→수용검사→배포→재기동→로그 정리 일괄)
scripts/monthly_update.sh <목록개방현황.csv> <YYYY-MM>
```

위 스택은 **로컬·데모용(웹 포함)** 이다. 외부 공개 배포는 아래의 MCP 전용 스택을 사용한다.

## 공개 배포 (MCP 전용 — docker-compose.prod.yml)

웹 UI 없이 **gateway(리버스 프록시+랜딩) + mcp + api(정본 URI 해소)** 만 노출하는 공개 구성.
공개 표면은 `/`(안내 랜딩) · `/mcp` · `/projects/datanav/**`(§7 정본) · `/api/status` ·
`/privacy`(§10 고지)뿐이며, 웹용 REST와 생성형 컨시어지는 라우팅하지 않는다(`ANTHROPIC_API_KEY` 불필요).
웹·REST 공개는 [차기 기능 백로그](docs/차기_기능_백로그_v1.0.md)에서 별도 스펙으로 관리한다.

```bash
cp .env.example .env   # GATEWAY_REAL_IP_FROM(LB 대역), DATANAV_MCP_ALLOWED_HOSTS(도메인) 설정
docker compose -f docker-compose.prod.yml up -d --build

# 월간 카탈로그 갱신 (prod 스택 지정)
COMPOSE_FILE=docker-compose.prod.yml scripts/monthly_update.sh <목록개방현황.csv> <YYYY-MM>
```

운영 전제:

- **TLS는 LB/프록시 계층에서 종단**한다(커스텀 커넥터는 https 필수). 도메인은 `BASE_URI`와
  동일한 `data.datahub.kr`이어야 정본 URI 디레퍼런싱이 성립한다.
- **`GATEWAY_REAL_IP_FROM`에 LB 내부 대역(CIDR)을 반드시 지정**한다 — 미지정 시 모든
  사용자가 LB IP 하나로 묶여 IP당 rate limit(MCP 2 req/s 등)이 서비스 전체 한도가 된다.
- 카탈로그는 배포 전에 빌드되어 있어야 한다(api healthcheck가 미빌드 상태를 unhealthy로 표시).
- 게이트웨이 접근 로그는 §10 고지에 맞춰 **원 IP를 기록하지 않는 익명 형식**이고,
  컨테이너 로그는 크기 기반 로테이션으로 보존을 제한한다.
- rate limit·사용량 캡은 단일 프로세스 전제이므로 api·mcp 복제 수는 1로 유지한다.

## 개발 환경 (venv — 테스트·MCP stdio용)

```bash
python3 -m venv .venv
.venv/bin/pip install -e "apps/server[dev]"

# 1) 월간 빌드 (수집→정규화→진단→SHACL→벌크 정본→diff→수용검사→원자적 배포)
cd apps/server
../../.venv/bin/python scripts/build_catalog.py <목록개방현황.csv> <YYYY-MM>
# 예: .../목록개방현황_20260630.csv 2026-06 — 이전 릴리스가 있으면 diff 자동 생성

# 2) 테스트 (수용 기준)
../../.venv/bin/python -m pytest

# 3) REST API (웹용)
../../.venv/bin/uvicorn datanav.api.rest:app --port 8000

# 4) 웹 UI
cd ../web && npm install && npm run dev   # http://localhost:5173

# 5) MCP 서버 (stdio)
../../.venv/bin/python -m datanav.api.mcp_server
```

### MCP 접속 — 원격(권장, KOSIS 사례와 동일 방식)

도커 스택이 streamable HTTP MCP를 함께 제공한다. 호스트 앱의 **커스텀 커넥터**에 URL만 등록하면 된다.

- 로컬: `http://localhost:8088/mcp`
- 클라우드 배포 후: `https://<도메인>/mcp`
- Claude 웹/앱: [설정]→[커넥터]→[커스텀 커넥터 추가]에 위 URL 입력
- 특성: 무상태(stateless) 스트리밍 HTTP, 인증 없는 공개 읽기 전용, nginx 계층 IP당 2 req/s 제한

### MCP 접속 — 로컬 stdio (Claude Code 등 개발용)

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

## v1.0 구현 메모 (부속 명세 v1.0.0 동결 반영)

- **AIRD 진단은 표준 MMI 기준**(aird-mmi-v1.1, AIRD 제2부 v0.87): D5-03·D6-01·D7-01·D7-02 4지표,
  QI_MMI ≥ 0.7 → `DM-0 (기본 적합성, STRUCT, 참고)` — 참고 공시이며 공식 적합성 선언은 DM-2 이상.
  발견성 8지표는 `catalog-discoverability-v1.0`(참고)으로 분리
- **Dataset 정본 URI는 항상 목록키 기반 불변**(`/dataset/{목록키}`). record_id는 내부 식별자이며
  FILE/API 이중 등재(22건)는 동일 데이터셋의 복수 제공 형태로 해석, CatalogRecord가 유형별 시점 기술 담당
- **벌크 정본 산출**(릴리스 디렉터리): `datasets-{월}.ndjson.gz`, `catalog-records-{월}.ndjson.gz`,
  `quality-annotations-{월}.ndjson.gz`(DQV·PROV), `aird-assessment-{월}.jsonld`, `catalog.jsonld`
- SHACL은 카탈로그 노드 + 표본 검증(기본 500건, `DATANAV_SHACL_SAMPLE=0`으로 전수) + 프로그램적 전수 구조 검사
- 오류 코드에 `RATE_LIMITED` 추가(설계서 검토에서 식별된 §4.3 보완)
- 계통적 이슈 패턴(전 행 50% 초과)은 카탈로그 수준 관찰 1건으로 축약
- **M3 생성형 컨시어지 구현됨(상한 운영, §9·§11)**: 서버 측 LLM(기본 `claude-haiku-4-5`)이
  첫 번째 MCP 클라이언트로 build_data_plan 수행. `ANTHROPIC_API_KEY` 설정 + API 서버 재시작으로 활성화.
  캡 3종(세션 5회/일 50회/월 20만 원 — 환경변수 조정), 무근거 recordId 자동 제거, 주입 방어.
  라이브 검증: `python scripts/concierge_smoke.py` (무근거 생성 0 + 주입 방어 판정).
  코어 완료를 차단하지 않는 별도 트랙이며 오류 코드 `CONCIERGE_UNAVAILABLE`(503)은 부속 명세 v1.1 대상
- **§7 정본 URI 디레퍼런싱**: `/projects/datanav/{dataset/{목록키}, catalog/current(+aird-assessment·files/벌크),
  context·rules·shapes·spec·prompts}`가 실제 정본 표현으로 해소됨(JSON-LD 등, 브라우저는 포털로 303).
  도메인 연결 시 JSON-LD `@id`가 그대로 접속 가능 — Cool URIs 충족
- **§10 익명 사용 로그**: `data/logs/usage-일자.jsonl` — 원 IP 미저장(난수 ID 또는 IP 해시),
  DNT/GPC/X-Datanav-No-Log 시 전면 미기록, 보존 12개월(월간 갱신 시 자동 정리).
  고지 전문: `docs/개인정보_로그_고지_v1.0.md` = 웹 푸터 링크 = `/api/resources/privacy`
- 운영 환경변수: `DATANAV_CORS_ORIGINS`(쉼표 구분), `DATANAV_RATE_LIMIT_PER_MIN`, `DATANAV_SHACL_SAMPLE`,
  `DATANAV_USAGE_LOG`(0=로그 비활성)/`DATANAV_LOG_DIR`,
  `DATANAV_TRUST_PROXY`(리버스 프록시 뒤에서만 1 — X-Real-IP 신뢰),
  `DATANAV_CONCIERGE_MODEL`/`_SESSION_LIMIT`/`_DAILY_LIMIT`/`_CLIENT_DAILY_LIMIT`(IP 해시 기준 일 10회 — sessionId 우회 차단)/`_MONTHLY_BUDGET_KRW`, `DATANAV_USD_KRW`
- 재현성: `requirements.lock`(의존성 고정), fixture 기반 빌드 테스트(`tests/test_build_fixture.py`,
  실카탈로그 없이 파이프라인 전 과정 검증), 골든셋은 자동 생성 v0(예비 평가, 인간 검수 전)
