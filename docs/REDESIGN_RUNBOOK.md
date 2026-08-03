# apps/web 리디자인 실행 순서

Claude Code에 순서대로 넣는다. 각 STEP은 독립 세션으로 돌려도 된다.

**전제**: `CLAUDE.md`, `DESIGN.md`, `docs/UI_IMPLEMENTATION_GUIDE.md`가 커밋되어 있어야
한다(STEP 0). 이 세 문서가 있으면 각 프롬프트가 짧아진다 — 불변식을 매번 쓰지 않는다.

**원칙**: 한 STEP이 끝나면 커밋하고 화면을 눈으로 확인한 뒤 다음으로 간다.
STEP을 합치지 않는다. 합치면 회귀 원인을 특정할 수 없다.

---

## STEP 0 — 문서 등재와 현황 확인

코드 변경 없음. 가장 안전하므로 먼저 한다.

```
DESIGN.md를 저장소 루트에, UI_IMPLEMENTATION_GUIDE.md를 docs/ 에,
CLAUDE.md를 저장소 루트에 커밋해라(파일은 별도 제공).

그다음 아래를 확인해 보고만 하라. 코드는 수정하지 마라.

1. 배포 격차
   config.py의 SCHEMA_VERSION과 rest.py가 서빙하는 tool-schemas 버전을 확인하라.
   라이브 서비스는 schemaVersion 1.3.0, Tool 8종을 반환한다.
   저장소가 앞서 있으면 무엇이 미배포인지 목록화하라.

2. build_data_plan의 노출 경로
   MCP Tool로는 등록되어 있으나 REST 라우트가 없는 것으로 보인다.
   plan.py의 build_plan()을 REST에서 호출하는 경로가 있는지 확인하라.

3. 테스트 현황
   apps/web의 테스트 파일과 package.json의 test 스크립트,
   .github/workflows/ci.yml의 web job이 무엇을 실행하는지 확인하라.

4. labels.js 밖에 흩어진 라벨 상수
   apps/web/src/components/ 안에 정의된 라벨 매핑 상수를 전부 찾아
   파일별로 목록화하라. 각 상수가 계약 enum 몇 종 중 몇 종을 정의하는지 세어라.
```

**확인**: 4번 결과에서 `COVERAGE_LABEL`이 10종 중 5종만 정의하고 있어야 한다.
그렇다면 STEP 3의 빌드 가드가 실제로 필요한 상태다.

---

## STEP 1 — 시각 베이스라인

CSS 정리를 이미 돌렸다면 그 결과 상태에서 확보한다.

```
apps/web에 Playwright 시각 회귀 테스트를 도입해라.
CSS·컴포넌트 변경 전 베이스라인 확보가 목적이다.

대상 화면 (VITE_SURFACE=core 빌드 기준):
- 홈 (검색 첫 화면, pristine 상태)
- 검색 결과 (질의 '어린이 보호구역')
- 컬럼 검색 결과 (키워드 '위도, 경도')
- 데이터셋 프로필 — card 탭
- 데이터셋 프로필 — structure 탭 (structureAvailable=true 레코드)
- 비교 (2건 선택)
- 변경 이력
- 소개
- AI에 연결
- AI 컨시어지 초기 화면 (VITE_SURFACE=all 빌드 — WarningPanel 통합 범위, ADR-001)
- AI 컨시어지 결과 대시보드 (응답 스텁 픽스처 — 라이브 LLM 호출 금지)
- 각 화면의 모바일 폭(375px)

요구사항:
- package.json에 test 스크립트 추가
- .github/workflows/ci.yml의 web job에 테스트 단계 추가 (현재 build만 실행)
- 스냅샷 데이터에 의존하는 화면은 API 응답을 고정 픽스처로 스텁해서
  카탈로그 갱신 때 테스트가 깨지지 않게 해라
- 베이스라인 이미지를 커밋해라

동시에 확인: 직전 CSS 정리 작업이 시각 결과를 바꾸지 않았어야 한다.
정리 전 스크린샷이 없다면, 현재 화면에서 의도하지 않은 변화로 보이는 것을 보고하라.
```

**확인**: 베이스라인 이미지가 커밋됐고 CI에서 테스트가 돈다. 이게 없으면 STEP 2로 가지 않는다.

---

## STEP 2 — 의미 토큰 층

CSS 정리가 팔레트를 갈랐다면, 여기서 의미 층을 얹어 3층을 완성한다.

```
docs/UI_IMPLEMENTATION_GUIDE.md의 §2와 DESIGN.md의 §7을 읽어라.

styles.css의 토큰을 3층으로 완성해라. 현재 팔레트 층은 분리되어 있다.
빠진 것은 2층(의미)이다.

1층 팔레트   :root(웹) / [data-surface='concierge'](컨시어지)
2층 의미     계약 enum에서 도출. 두 테마가 같은 변수명을 공유하고 값만 다름
3층 컴포넌트 2층만 참조. 1층을 직접 참조하지 않는다

2층 변수는 가이드 §2.2~§2.10의 색 배정을 따라 정의해라. 축은 다음과 같다:
  근거 수준(2종) / 지역 근거(5종) / 구조 수집 상태(10종) /
  예시값 상태(6종) / 최신성(3종) / 변경 상태(6종) / 오류·경고

절대 규칙: 미수집·불명·보류에 실패색을 쓰지 마라.
coverageStatus 10종 중 COLLECTION_FAILED 하나만 경고색이다.
MISSING_FROM_SNAPSHOT, UNKNOWN, INFERRED_* 도 전부 중립이다.
가이드 §2.4 표를 그대로 적용해라.

그다음 3층에서 1층을 직접 참조하는 선택자를 전부 2층 참조로 바꿔라.
grep으로 확인: 컴포넌트 선택자가 팔레트 변수를 직접 쓰는 곳이 남으면 안 된다.

시각 결과는 바뀌지 않아야 한다 — 값이 아니라 참조 경로만 바꾸는 작업이다.
Playwright 회귀가 통과해야 한다. 통과하지 못하면 어디가 왜 달라졌는지 보고하라.

decisions/ 에 ADR을 남겨라: 의미 축을 계약 enum에 정박한 결정과 그 근거.
```

**확인**: `data-surface`를 `concierge`로 토글해도 레이아웃이 깨지지 않는다. 회귀 통과.

---

## STEP 3 — 라벨 커버리지 완결과 빌드 가드

저위험이고 효과가 즉시 나타난다. 이후 모든 컴포넌트 작업의 전제다.

**전제 정정(STEP 0 실측, 2026-08-04, main b3a2184)**: `labels.js`는 이미 존재하며
UPDATE_CYCLE·LICENSE·CHANGE_STATUS 3군은 중앙화 완료다. 이 STEP은 신설이 아니라
**나머지 로컬 상수의 이전과 커버리지 완결**이다. 대상은 아래 인벤토리로 고정한다.

| 위치 | 상수 | 커버리지 | 조치 |
|---|---|---|---|
| labels.js | `UPDATE_CYCLE_LABEL` | 8/8 | 유지 |
| labels.js | `LICENSE_LABEL` + `licenseLabel` 폴백 | 열린 집합 | 유지 — 가드 제외 |
| labels.js | `CHANGE_STATUS_LABEL` / `_NOTE` | 6/6 + 부연 | 유지 |
| DatasetCardRow.jsx | `EVIDENCE_LABEL` | 4/5 — `UNKNOWN` 누락 | 이전 + 완결 |
| DatasetCardRow.jsx | `KEY_FIELD_LABEL` | 3/3 (객체 키) | 이전 |
| DatasetProfile.jsx | `COVERAGE_LABEL` | 5/10 — QUEUED·COLLECTING·SOURCE_UNAVAILABLE·UNSUPPORTED_FORMAT·ACCESS_RESTRICTED 누락 | 이전 + 완결 |
| DatasetProfile.jsx | `EXAMPLE_STATUS_LABEL` | 5/6 — `AVAILABLE`은 인라인 폴백 | 이전 + 가이드 §2.5 조합 표 적용 |
| DatasetProfile.jsx | `FRESH_LABEL` | 3/3 | 이전 |
| DatasetProfile.jsx | `FIELD_LABEL` | 완전성 체크리스트 18항(열린 사전) | 이전 |
| CompareView.jsx | `FIELD_LABEL` | 비교 필드 15항(열린 사전) | 이전 |
| SearchView.jsx | `CYCLES` 필터 | 7/8 — `UNSPECIFIED` 누락 | 완결(가이드 §4.3) |
| SearchView.jsx | `REGION/FORMAT/CYCLE/TYPE_ALIAS` | 해석 사전 — 라벨 아님 | STEP 8-2 서버 이관 후 제거 |

```
docs/UI_IMPLEMENTATION_GUIDE.md의 §2.1~§2.10을 읽어라.

1. 위 인벤토리의 '이전' 대상 로컬 상수를 labels.js로 옮겨라.
   통합 후 컴포넌트 파일에는 라벨 상수가 남지 않아야 한다.

2. 계약 enum 전체를 커버하도록 라벨을 완결해라.
   가이드 §2의 표가 라벨 문안이다. COVERAGE_LABEL의 누락 5종
   (QUEUED, COLLECTING, SOURCE_UNAVAILABLE, UNSUPPORTED_FORMAT,
   ACCESS_RESTRICTED)과 EVIDENCE_LABEL의 UNKNOWN,
   exampleStatus × examplesPublic 조합(§2.5)을 포함해라.

3. 빌드 가드를 넣어라.
   apps/server/datanav/spec/tool-schemas-v1.4.0.json에서 enum을 추출해
   labels.js의 키와 대조하고, 누락이 있으면 빌드를 실패시켜라.
   license는 계약에 열린 집합으로 정의되어 있으므로 폴백 라벨을 허용하고
   가드에서 제외해라.

가드가 실제로 동작하는지 검증해라: 라벨 하나를 일시적으로 지우고 빌드가
실패하는지 확인한 뒤 되돌려라.
```

**확인**: 라벨 하나를 지우면 빌드가 깨진다. 이 가드가 없으면 계약에 enum이 추가될 때마다
원시 코드가 사용자에게 노출된다.

---

## STEP 4 — 공통 컴포넌트 3종

검색과 상세가 모두 이 셋에 의존하므로 먼저 만든다.

```
docs/UI_IMPLEMENTATION_GUIDE.md의 §7을 읽어라.

WarningPanel, EvidenceRow, CoverageIndicator를 만들고 기존 중복을 대체해라.

WarningPanel
  현재 7개 파일이 warnings 필터를 각자 복제하고 있고(웹 5 + 컨시어지 2 —
  ConciergeView·ConciergeDashboard 포함, ADR-001로 전부 통합 확정),
  startsWith('본 결과는')으로 서버 DISCLAIMER 문안에 문자열 결합되어 있다.
  단일 컴포넌트로 대체해라. 서버 문안을 치환하지 마라.
  컨시어지 화면의 회귀는 STEP 1에서 추가한 베이스라인으로 확인한다.
  SearchView가 INFERRED_ 경고를 자체 문안으로 바꾸고 원문을 title에만
  남기고 있다 — 이걸 없애고 원문을 본문에 표시해라.
  (구조화된 경고 필드는 additive 요청 대상이며 이번 범위가 아니다)

EvidenceRow
  현재 DatasetCardRow의 지역 배지, DatasetProfile의 evidence-note,
  StructureView의 obs-meta에 흩어져 있다.
  DatasetProfile의 evidence-note는 문장이 하드코딩되어 있으므로
  evidenceLevel 값에서 도출하도록 바꿔라.

CoverageIndicator
  현재 3곳에 다른 형태로 있다: StructureView의 coverage-note,
  DatasetCardRow의 structure-chip, SearchView의 컬럼 검색 모집단 표시.
  분모 없이 표시하지 않는 것이 규칙이다.

각 컴포넌트에 단위 테스트를 붙여라. 특히 CoverageIndicator는
coverageStatus 10종 전부에 대해 렌더되고 COLLECTION_FAILED만
경고 스타일이 적용되는 것을 검증해라.
```

**확인**: `NOT_COLLECTED` 상태 데이터셋을 열어 경고색이 아닌지 눈으로 본다.

---

## STEP 5 — DatasetRow와 검색 결과

개명과 접근성을 함께 한다. 나눠서 하면 같은 파일을 두 번 만진다.

```
docs/UI_IMPLEMENTATION_GUIDE.md의 §4와 §8.1을 읽어라.

1. DatasetCardRow.jsx를 DatasetRow.jsx로 개명하고 card-* 클래스 어휘를
   행 어휘로 바꿔라. styles.css, ChangesView.jsx, CasesView.jsx가 같은
   클래스를 쓰므로 함께 잡아라. CasesView는 현재 App.jsx에서 import되지
   않는 고아 컴포넌트지만 클래스는 공유하므로 빠뜨리지 마라.

2. 키보드 접근성을 고쳐라.
   div className="card-main" onClick 패턴이 DatasetRow, ChangesView,
   CasesView에 있다. 현재 키보드로 데이터셋 상세를 열 수 없다(WCAG 2.1.1).
   포커스 링도 보이게 해라.

3. 미사용 필드를 노출해라: rowCountListed.

4. 결과 메타를 고쳐라.
   ranking.method.includes('bm25')로 정렬 방식을 추론하는 코드를 없애라.
   계약에 방향 필드가 없으므로 method와 version을 그대로 표기하거나
   표시하지 않는다. score(BM25 음수)는 노출하지 마라.

5. 완전성 표시에서 프론트엔드 임계값을 없애라: topPercent <= 10 조건.

6. 컬럼 검색에 커서 페이징이 없다는 사실을 화면에 명시해라.
   현재 pageSize 상한에서 조용히 끊긴다.

7. 빈 결과 문안을 가이드 §4.5대로 바꿔라.
   조회 범위(스냅샷·건수)를 함께 말하고, 컬럼 검색은 모집단 한계를 명시해라.
   결과 없음이 데이터 부재로 읽히지 않게 해라.
```

**확인**: Tab 키로 결과 행에 도달해 Enter로 열린다. 빈 결과 화면에 조회 범위가 보인다.

---

## STEP 6 — 홈

```
docs/UI_IMPLEMENTATION_GUIDE.md의 §3을 읽어라.

홈을 §3의 9개 블록 구조로 재구성해라. 각 블록의 데이터 출처가 §3 표에 있다.
표에 없는 데이터를 가정하지 마라.

우선순위가 높은 것 셋:

Coverage 블록 (§3.1)
  세 숫자를 함께 표시해라 — counts.datasets,
  structureCoverage.fileRecordsTotal, structureCoverage.recordsAvailable.
  현재 AboutView는 첫째와 셋째만 보여줘서 사용자가 분모를 계산해야 한다.
  API·STD가 구조 관측 대상이 아님을 명시해라.
  스냅샷 지연도 표기해라 — currentSnapshot과 deployedAt의 차이.

Open Infrastructure 블록 (§3.2)
  전부 기존 라우트다. 백엔드 변경 없이 만들 수 있다.
  /api/status의 service.rules[] 전체를 추가 왕복 없이 목록화하고(개수 하드코딩 금지),
  상세는 /api/resources/rules에서 펼쳐라.
  폐기된 규칙(aird-mmi-v1.0)을 숨기지 말고 폐기 표시해라 —
  버전 관리되고 있다는 증거다.

Live Exploration 블록 (§3 #4)
  SearchView는 마운트 시 이미 빈 질의로 검색을 실행하지만
  pristine 상태에서 결과를 숨긴다. 상위 3~5건을 노출해라.
  추가 서버 왕복이 없다.
```

**확인**: 홈에서 96,056 / 83,695 / 59,395 세 숫자와 스냅샷 지연이 보인다.

---

## STEP 7 — 라우팅과 상세

가장 큰 구조 변경이다. 앞 STEP이 모두 안정된 뒤에 한다.

```
docs/UI_IMPLEMENTATION_GUIDE.md의 §5, §6, §8을 읽어라.

1. 라우팅을 도입해라.
   현재 App.jsx의 useState('search') 단일 문자열이 뷰 전환의 전부여서
   공유·북마크·뒤로가기가 불가능하다. nginx.conf의 try_files는 이미
   딥링크에 대응하고 있다.
   검색 결과 상태(질의·필터·페이지)와 데이터셋 상세가 URL에 담겨야 한다.
   비교 뷰로 갔다 돌아올 때 검색 결과가 소실되는 현재 동작도 해소된다.

2. DatasetProfile을 분할하고 LensNavigation을 도입해라.
   렌즈: Overview / Structure / Evidence
   접힘: 원본 데이터 (normalized / source / jsonld)
   현재 5탭이 한 층에 있고 뒤 3개는 JSON.stringify 덤프다.
   Evidence 렌즈는 §5.4의 기존 필드 조합으로 만들 수 있다 — 새 필드 불필요.

3. drawer를 페이지로 승격하거나, 유지한다면 접근성을 완비해라.
   현재 role="dialog"·aria-modal 없음, Escape 없음, 포커스 트랩·복귀 없음.

4. LensNavigation의 ARIA를 완비해라.
   role="tablist" + 자식 role="tab" + aria-selected + 화살표 키.
   현재 tablist만 선언하고 tab이 없어 없는 것보다 나쁜 상태다.

5. 미사용 필드를 노출해라: rowCountObserved(rowsScanned와 구분),
   failureReason, column.note.

6. CompareView의 structureComparison.onlyIn이 recordId를 그대로
   보여준다 — datasets[]의 제목으로 해소해라.

decisions/ 에 라우팅 채택 ADR을 남겨라.
```

**확인**: 데이터셋 URL을 새 탭에 붙여넣으면 그 데이터셋이 열린다. Escape로 닫힌다.

---

## STEP 8 — 서버 additive와 Possible Uses

여기서 처음 서버를 만진다.

```
docs/UI_IMPLEMENTATION_GUIDE.md의 §12를 읽어라.

additive 변경만 한다. required 제거·타입/의미 변경·오류코드 제거 금지.
변경 시 scripts/gen_tool_spec.py 재생성 + tests/test_contract_spec.py 갱신
+ config.py의 SCHEMA_VERSION 증가를 동반해라.

우선순위 순:

1. POST /api/plan — plan.py의 build_plan()을 REST로 노출
   로직은 이미 있고 MCP Tool로만 등록되어 있다. 새 판정을 만드는 게 아니다.
   그다음 Possible Uses 렌즈를 만들어라(가이드 §5.5).
   planStatus=DRAFT, qualityAssessment=NOT_ASSESSED,
   possibleJoinKeys의 CANDIDATE_ONLY를 항상 화면에 노출해라.
   fitSignals 4개를 각각 표시하고 하나의 점수로 합치지 마라 —
   계약 주석이 이유를 적어놨다.
   이 렌즈를 "추천"이나 "적합 데이터"로 부르지 마라.

2. /api/search에 interpretedFilters[]{field,value,sourceToken,ruleId} 추가
   SearchView의 interpretQuery()가 결정론적 판정을 프론트엔드에서 하고 있고
   ruleId·버전·eval이 없다. 서버 plan.py에 REGION_CODES가 이미 있고
   plan-assembly-v1.0으로 버전 관리된다. 그 규칙을 검색에도 적용해 노출해라.
   그다음 프론트엔드의 interpretQuery와 4개 별칭 사전을 제거해라.
   evals/ 에 케이스를 남겨라 — 입력 문장과 기대 필터의 쌍.

3. notices[]{code,severity,text} 추가 (기존 warnings[] 유지)
   WarningPanel의 문자열 결합을 제거한다.

4. ranking.direction 또는 정규화된 rank 정수

5. /api/status에 snapshotLagDays

6. /api/stats?axis=regionEvidence

7. /api/resources/eval — golden/eval_report.json 읽기 전용 노출
   Open Infrastructure 블록에 검색 품질 지표를 추가한다.
   humanReviewed=false 상태를 반드시 함께 표기해라.

각 항목마다 ADR을 남길지 판단하고, 계약 변경이면 남겨라.
```

---

## 남은 것 — 이번 범위 밖

| 항목 | 이유 |
|---|---|
| `CasesView` 복귀 | `cases/*.json`의 `humanReviewed: false` — 사람 검수가 선행 조건 |
| Relations · Readiness · Quality 렌즈 | 서버 근거 없음. 계약이 `null` 고정으로 명시 |
| 폰트 조달 | `@font-face`·`<link>` 부재로 `DESIGN.md` §7 타이포그래피가 미구현 상태. 서브셋 셀프호스팅 vs CDN 별도 결정 필요 |
| SSR·프리렌더 | `index.html`이 12줄 CSR이라 외부 fetch 시 본문이 비어 있다. 기계 판독성 개선은 별도 라운드 |

---

## 체크포인트

각 STEP 종료 시 확인한다.

```
cd apps/server && python -m pytest -q
cd apps/web && VITE_SURFACE=core npm run build && npm test
```

그리고 눈으로: 미수집·불명 상태가 실패로 보이지 않는지, 근거 표기가 사라지지 않았는지.
