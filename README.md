# 공공데이터 내비게이터 (datanav)

> **하고 싶은 일을 말하면, 사용할 공공데이터와 그 선택 이유, 함께 필요한 데이터,
> 확인해야 할 한계를 알려주는 AI 공공데이터 내비게이터.**

![snapshot](https://img.shields.io/badge/%EC%8A%A4%EB%83%85%EC%83%B7-2026--06-blue)
![datasets](https://img.shields.io/badge/%EB%8D%B0%EC%9D%B4%ED%84%B0%EC%85%8B-96%2C056%EA%B1%B4-informational)
![contract](https://img.shields.io/badge/MCP%20%EA%B3%84%EC%95%BD-v1.0.0%20%EB%8F%99%EA%B2%B0-success)
![status](https://img.shields.io/badge/%EC%83%81%ED%83%9C-v1.0%20beta-orange)

> 본 결과는 공공데이터포털 목록 메타데이터 기반이며 실제 데이터의 내용·품질·결합 가능성을
> 보증하지 않습니다. 공공데이터포털을 대체하지 않으며 모든 원문 접근은 포털로 연결합니다.

**English** — *datanav* is a discovery-and-judgement layer for Korea's open data portal
([data.go.kr](https://www.data.go.kr)). It turns the portal's monthly catalog (~96k dataset
listings) into a canonical JSON-LD/DCAT layer with versioned, deterministic quality rules
(SHACL-validated, DQV/PROV issue observations), and exposes search / compare / diff tools to
AI hosts via the **Model Context Protocol**. It also serves as a research testbed for the
AIRD (AI-Ready Data) standard: every judgement carries a rule version and evidence level,
and canonical URIs dereference to their JSON-LD representations.

## 빠른 시작 — Claude에 연결하기

인증 없이 **URL 등록만으로** 사용할 수 있습니다 (읽기 전용, 무료).

1. Claude 웹/앱 → **[설정] → [커넥터] → [커스텀 커넥터 추가]**
2. `https://data.datahub.kr/mcp` 입력
3. 대화에서 바로 사용:
   - *"폐교 활용 사업을 검토 중인데 참고할 공공데이터 찾아줘"*
   - *"고령자 의료 접근성 분석에 쓸 데이터 후보를 비교해줘"*
   - *"지난달 공공데이터 목록에서 사라진 데이터가 있어?"*

더 정형화된 결과가 필요하면 프롬프트 메뉴에서 **`build_data_plan`** 을 선택하고 목적
한 문장을 입력하세요 — 목적 분해→검색→비교→예상 결합 키→미확인 항목→포털 링크 순서의
활용 계획이 표준 절차대로 생성됩니다.

Claude Code 등 개발 도구는 `.mcp.json`에 등록합니다:

```json
{
  "mcpServers": {
    "datanav": { "type": "http", "url": "https://data.datahub.kr/mcp" }
  }
}
```

## 제공 기능

| 구분 | 이름 | 요지 |
|---|---|---|
| Tool | `search_datasets` | 키워드 + 분류·기관·포맷·주기·라이선스·유형·지역(근거 수준 동반)·수정일 필터, 커서 페이징 |
| Tool | `get_dataset` | 단건 조회 — `card`(판단 요약) / `normalized` / `source`(원본) / `jsonld`(정본) |
| Tool | `compare_datasets` | 최대 5개의 구조화된 사실 비교 (해석 없음) |
| Tool | `get_catalog_changes` | 월별 변경 추적 — 6개 상태, **스냅샷 부재 ≠ 폐기** |
| Tool | `get_catalog_stats` | 주제·기관·포맷·완전성·유형 통계 |
| Tool | `get_context` | (호환) 서비스 개요·스냅샷·규칙 요약 |
| Prompt | `build_data_plan` / `compare_for_purpose` | 활용 계획 수립 / 목적 관점 비교의 절차 표준화 |
| Resource | 판정 규칙 레지스트리 · JSON-LD Context · SHACL 셰이프 · Prompt 공개 문서 · Tool 스키마 명세 | 정본은 §7 URI로도 해소 |

**공통 계약** (부속 명세 v1.0.0, 2026-07-17 동결): 응답 봉투
`{ data, meta: { sourceSnapshot, processedAt, schemaVersion, ruleVersions[] }, warnings[] }`,
일관된 오류 모델(INVALID_ARGUMENT / DATASET_NOT_FOUND / RATE_LIMITED 등 9종), 모든 판정에
rule 버전 표기. 전문: [부속명세 v1.0](docs/부속명세_v1.0.md)

## 목적과 배경

이 프로젝트는 이중 정체성을 갖습니다.

- **서비스로서** — 공공데이터포털이 공식 유통 기반이라면, datanav는 그 위의
  **탐색·판단 계층**입니다. 어떤 데이터가 존재하고 어떤 후보가 검토할 가치가 있는지를
  근거와 함께 제시하며, 포털을 대체하지 않습니다.
- **연구로서** — 대학 연구실이 운영하는 **AIRD(AI-Ready Data) 표준 실증** 프로젝트입니다.
  월간 목록을 정본 JSON-LD(DCAT)로 정규화하고, SHACL 검증·버전 관리되는 판정 규칙
  레지스트리·DQV/PROV 이슈 관찰로 "표준이 실제로 동작함"을 보입니다. 1차 목적은 표준의
  제정·확산이며, 서비스는 그 실증 수단입니다.

```
[3층: 판단·경험]  호스트 에이전트(Claude 등) · 웹 UI(별도 서비스 예정)
        ↑ MCP (Tools·Prompts·Resources)
[2층: 인터페이스]  MCP 서버 — 결정론적 Tool, Prompt, Resource
        ↑
[1층: AIRD 정본]  월별 스냅샷 → 정규화(매핑표) → JSON-LD 카탈로그
                  SHACL 검증 · 판정 규칙 엔진 · diff · 이슈 관찰
        ↑
[원천]  공공데이터포털 목록개방현황(월간)
```

**책임 분리 원칙**: 재현되어야 하는 판정(정규화·완전성·최신성·사실 비교·랭킹)은 서버가
결정론적으로 수행하고, 목적 의존적 해석(조건부 추천·활용 계획)은 호스트 LLM이 수행합니다.
판단 로직을 두 벌 만들지 않습니다.

## 사용자 가이드라인

- **목록 수준 근거입니다.** 모든 응답은 `evidenceLevel: CATALOG_METADATA_ONLY` — 실제
  파일·API의 내용·품질은 반드시 포털 원문에서 확인하세요. 응답의 포털 링크가 그 통로입니다.
- **스냅샷 부재는 폐기가 아닙니다.** `MISSING_FROM_SNAPSHOT`은 관찰 사실이며, 폐기 확정은
  `OFFICIALLY_WITHDRAWN`으로만 표기됩니다.
- **검색어에 개인정보를 입력하지 마세요.** 검색어 원문은 품질 개선 목적으로 익명 로그에
  기록될 수 있습니다.
- **공정 사용**: IP당 2 req/s(순간 20회 버스트)로 제한됩니다. 대량 분석이 필요하면 벌크
  정본(`.ndjson.gz`)을 내려받아 사용하세요.
- **로그와 옵트아웃**: 원 IP를 저장하지 않는 익명 이용 로그를 기록하며, 브라우저 DNT/GPC
  신호 또는 `X-Datanav-No-Log: 1` 헤더가 있으면 전혀 기록하지 않습니다.
  전문: [개인정보·이용 로그 고지](docs/개인정보_로그_고지_v1.0.md)
- **오류 제보를 환영합니다.** 목록 메타데이터의 오류 의심(잘못된 분류, 깨진 URL, 모순된
  기재 등)을 발견하면 GitHub Issue로 알려주세요 — 검토를 거쳐 데이터 제공 기관에 환류하는
  것이 이 프로젝트 설계(§6)의 일부입니다.

## 셀프 호스팅 (공개 배포 스택)

웹 UI 없이 **gateway(리버스 프록시+랜딩) + mcp + api(정본 URI 해소)** 만 노출하는 구성.
공개 표면은 `/`(안내 랜딩) · `/mcp` · `/projects/datanav/**`(§7 정본) · `/api/status` ·
`/privacy`뿐이며, LLM API 키가 필요 없습니다.

```bash
cp .env.example .env   # GATEWAY_REAL_IP_FROM(LB 대역), DATANAV_MCP_ALLOWED_HOSTS(도메인) 설정
docker compose -f docker-compose.prod.yml up -d --build

# 월간 카탈로그 갱신 (빌드→수용검사→원자적 배포→재기동→로그 정리 일괄)
COMPOSE_FILE=docker-compose.prod.yml scripts/monthly_update.sh <목록개방현황.csv> <YYYY-MM>
```

운영 전제:

- **TLS는 LB/프록시 계층에서 종단**합니다(커스텀 커넥터는 https 필수). 정본 URI가 성립하려면
  도메인이 `BASE_URI`(기본 `data.datahub.kr`)와 일치해야 합니다.
- **`GATEWAY_REAL_IP_FROM`에 LB 내부 대역(CIDR)을 반드시 지정**합니다 — 미지정 시 모든
  사용자가 LB IP 하나로 묶여 IP당 제한이 서비스 전체 한도가 됩니다.
- 카탈로그는 배포 전에 빌드되어 있어야 합니다(api healthcheck가 미빌드를 unhealthy로 표시).
- 게이트웨이 접근 로그는 원 IP를 기록하지 않는 익명 형식이며, 컨테이너 로그는 크기 기반
  로테이션으로 보존을 제한합니다.
- rate limit·사용량 캡은 단일 프로세스 전제 — api·mcp 복제 수는 1로 유지합니다.

로컬 데모(웹 UI + 생성형 컨시어지 포함)는 `docker compose up -d --build`
(`docker-compose.yml`, http://localhost:8088)를 사용합니다.

## 개발

```
apps/server/            # Python — 1층 파이프라인 + 2층 MCP + REST
  datanav/pipeline/     #   파싱·정규화·완전성·JSON-LD·SHACL·diff·빌드(원자적 배포)
  datanav/rules/        #   판정 규칙 레지스트리(§5)
  datanav/api/          #   공용 Service + MCP 서버 + REST(FastAPI) + 컨시어지
  tests/                #   §11 수용 기준 테스트
apps/gateway/           # 공개 배포용 리버스 프록시 + 랜딩
apps/web/               # React/Vite — 비생성형 웹(별도 서비스로 분리 예정)
data/catalog/releases/  # 불변 릴리스 + current.json 포인터 (git 미포함)
```

```bash
python3 -m venv .venv
.venv/bin/pip install -e "apps/server[dev]"

cd apps/server
../../.venv/bin/python scripts/build_catalog.py <목록개방현황.csv> <YYYY-MM>   # 월간 빌드
../../.venv/bin/python -m pytest                                              # 수용 기준 테스트
../../.venv/bin/python -m datanav.api.mcp_server                              # MCP 서버 (stdio)
```

로컬 stdio 등록(`.mcp.json`):

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

<details>
<summary><strong>v1.0 구현 메모</strong> (부속 명세 v1.0.0 동결 반영 — 펼치기)</summary>

- **AIRD 진단은 표준 MMI 기준**(aird-mmi-v1.1, AIRD 제2부 v0.87): QI_MMI ≥ 0.7 →
  `DM-0 (기본 적합성, STRUCT, 참고)` — 참고 공시이며 공식 적합성 선언은 DM-2 이상
- **Dataset 정본 URI는 목록키 기반 불변**(`/dataset/{목록키}`). FILE/API 이중 등재는 동일
  데이터셋의 복수 제공 형태로 해석, CatalogRecord가 유형별 시점 기술 담당
- **벌크 정본 산출**(릴리스 디렉터리): `datasets-{월}.ndjson.gz`,
  `catalog-records-{월}.ndjson.gz`, `quality-annotations-{월}.ndjson.gz`(DQV·PROV),
  `aird-assessment-{월}.jsonld`, `catalog.jsonld`
- SHACL은 카탈로그 노드 + 표본 검증(기본 500건, `DATANAV_SHACL_SAMPLE=0`으로 전수)
- **M3 생성형 컨시어지**(웹 스택 전용, 상한 운영): 서버 측 LLM이 첫 번째 MCP 클라이언트로
  build_data_plan 수행. 캡 3종 + 클라이언트별 일일 캡, 무근거 recordId 자동 제거, 주입 방어
- **§7 정본 URI 디레퍼런싱**: dataset/catalog/context/rules/shapes/spec/prompts가 실제 정본
  표현으로 해소(JSON-LD 등, 브라우저는 포털로 303) — Cool URIs 충족
- **§10 익명 사용 로그**: 원 IP 미저장(난수 ID 또는 단방향 해시), DNT/GPC/X-Datanav-No-Log
  시 전면 미기록, 보존 12개월(월간 갱신 시 자동 정리)
- **MCP 전송 보안**: `DATANAV_MCP_ALLOWED_HOSTS` 지정 시 Host 헤더 검증(DNS 리바인딩 보호)
- 재현성: `requirements.lock`, fixture 기반 빌드 테스트(실카탈로그 없이 파이프라인 전 과정
  검증), 골든셋은 자동 생성 v0(인간 검수 전)
- 운영 환경변수 전체 목록은 `.env.example`과 각 compose 파일 주석 참조
</details>

## 문서

| 문서 | 내용 |
|---|---|
| [설계서 v1.0 확정판](docs/공공데이터_내비게이터_설계서_v1.0_확정판.md) | 아키텍처·데이터 모델·규칙·운영 (동결) |
| [부속명세 v1.0](docs/부속명세_v1.0.md) | Tool별 JSON Schema 전문 + 공통 계약 (v1.0.0 동결) |
| [매핑표 v1.0](docs/매핑표_v1.0.md) | 원본 CSV → 정규화 필드 매핑 (공개 산출물) |
| [호환성 확인 v1.0](docs/호환성_확인_v1.0.md) | MCP 클라이언트 호환성 기록 |
| [개인정보·로그 고지 v1.0](docs/개인정보_로그_고지_v1.0.md) | §10 이행 문서 |
| [차기 기능 백로그 v1.0](docs/차기_기능_백로그_v1.0.md) | 공개 배포 이후 계획 |

정본(기계 판독용): [Tool 스키마](https://data.datahub.kr/projects/datanav/spec/tools/1.0) ·
[판정 규칙](https://data.datahub.kr/projects/datanav/rules/catalog/1.0) ·
[JSON-LD Context](https://data.datahub.kr/projects/datanav/context/catalog/1.0) ·
[SHACL](https://data.datahub.kr/projects/datanav/shapes/catalog/1.0)

## 향후 계획

**v1.0 확정 잔여 조건** — ① 골든셋 인간 검수 ② 정본 도메인(`data.datahub.kr`) 연결.
완료 전까지 beta 표기를 유지합니다.

**공개 배포 이후** ([백로그](docs/차기_기능_백로그_v1.0.md) 상세):

- 웹 UI 별도 서비스 재배포 (검색 화면 + 생성형 컨시어지, 예산 캡 운영)
- REST API의 공개 계약 승격 (수요 확인 후)
- MCP 채널 사용 지표(§12) — 앱 레벨 익명 로깅
- 이슈 관찰 환류 자동화 (B트랙 — NIA·제공 기관 전달)

## 데이터 출처 · 라이선스 · 인용

- **데이터 출처**: 행정안전부 [공공데이터포털](https://www.data.go.kr) 목록개방현황(월간).
  본 저장소는 목록 **메타데이터의 가공물**만 포함하며 실데이터를 재배포하지 않습니다.
- **코드 라이선스**: _(확정 예정 — LICENSE 파일 추가 전까지 모든 권리 유보)_
- **공개 산출물**(매핑표·판정 규칙·JSON-LD Context·SHACL): _(확정 예정 — CC BY 4.0 검토 중)_
- **인용**: 연구·보고서에서 인용 시 `CITATION.cff`(추가 예정)를 참조하거나 저장소 URL을
  명시해 주세요.
- **문의**: GitHub Issue 또는 _(연구실 대표 연락처 — 확정 예정)_
