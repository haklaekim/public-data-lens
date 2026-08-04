# 작업 지시 — 공공데이터 렌즈 evals 케이스 세트 및 사례집 구축

대상 저장소: `hike-lab/public-data-lens` (유일한 공식 저장소. ADR 009로 통합됨)
작성 맥락: 대표 질의 케이스를 저장소 자산으로 고정하고, 사례집을 evals에서 자동 생성한다.
선행 문서: `decisions/009-저장소-통합-및-이력-미이월.md`, `decisions/010-프로젝트-경계-및-자산-흐름.md`

## 0. 이 작업의 원칙 (먼저 읽을 것)

1. **evals가 정본, 사례집은 렌더링 결과다.** `docs/사례_20선.md`를 손으로 편집하는 코드나 절차를 만들지 말 것. 생성 파일 상단에 자동 생성 경고를 넣는다.
2. **기계 검증(assertions)과 사람 판정(judgment)을 섞지 말 것.** 스냅샷이 바뀌어도 assertions는 통과해야 한다.
3. **`status: known_gap` 케이스는 실패가 아니다.** 서비스가 답하지 못하는 질의를 의도적으로 기록하는 자산이며, runner는 이를 정상 종료로 처리한다.
4. **케이스를 20개 먼저 만들지 말 것.** 5개 시드로 스키마를 검증한 뒤 확장한다. 이 지시서의 Phase 순서를 지킬 것.
5. 스키마·필드명·코드는 영어, 문서와 설명은 한국어.
6. **이 저장소는 공개 저장소다.** 작성하는 모든 케이스와 문서가 공개된다고 전제할 것. 공개 범위 정책은 ADR 009에 확정되어 있다.

| 경로 | 처리 |
| --- | --- |
| `evals/cases/**` | 커밋 (공개 자산) |
| `evals/results/**` | **`.gitignore` — 커밋하지 말 것** |
| `evals/results/<snapshot>/drift.md` | 예외적으로 커밋 (gitignore에 negate 규칙 추가) |
| `docs/사례_20선.md` | 커밋 |
| `glossary/**` | 커밋 |

## 1. Phase 0 — 사전 확인 (코드 작성 전)

카탈로그 DB에 질의해 다음 수치를 확인하고 보고할 것. 이후 케이스 `EV-COV-001`의 기대값 근거가 된다.

- 스냅샷 기준 전체 데이터셋 건수
- 그중 실파일 구조를 관측한 건수 (`FILE_OBSERVATION` 보유)
- 관측 건의 총 컬럼 수, 데이터셋당 평균 컬럼 수
- 관측 커버리지 = 관측 건수 / 전체 건수 (%)
- 관측 건의 포맷별·기관 유형별 분포 (커버리지 편향 확인)

이 수치가 나오기 전에는 Phase 1로 넘어가지 말 것. 커버리지가 낮으면 `column_search` 케이스의 기대값 설계 자체가 달라진다.

## 2. 디렉터리 구조

```
evals/
  schema/
    case.schema.json          # 케이스 파일 JSON Schema (정본)
  cases/
    purpose_plan/*.yaml
    column_search/*.yaml
    structure_lookup/*.yaml
    catalog_search/*.yaml
    comparison/*.yaml
    change_tracking/*.yaml
    coverage_stat/*.yaml
  results/
    <snapshot>/               # 예: 2026-06/
      <case_id>.json          # 실행 응답 원문 + assertion 결과
      summary.json
  runner/
    run_evals.py              # 실행기
    assertions.py             # assertion DSL 평가기
    render_casebook.py        # 사례집 렌더러
  README.md                   # evals 사용법 (사람용, 손으로 작성)
docs/
  사례_20선.md                # 자동 생성물. 편집 금지
decisions/
  0NN-*.md                    # 아래 6절 참조
```

## 3. 케이스 스키마

`evals/schema/case.schema.json`을 아래 요구를 만족하도록 작성한다. YAML 케이스 파일은 이 스키마로 검증한다.

### 필수 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | `EV-<CAT>-<NNN>` 패턴. 예: `EV-PLAN-001`, `EV-COL-003` |
| `title` | string | 한국어 한 줄 |
| `category` | enum | `purpose_plan` \| `column_search` \| `structure_lookup` \| `catalog_search` \| `comparison` \| `change_tracking` \| `coverage_stat` |
| `tool` | string | 호출할 MCP Tool 이름 |
| `status` | enum | `pass` \| `known_gap` \| `regression_guard` |
| `authored_against.snapshot` | string | `YYYY-MM` |
| `authored_against.rule_versions` | string[] | 작성 시점 규칙 버전 |
| `input` | object | Tool 입력 파라미터 그대로 |
| `assertions` | array | 계층 1. 아래 DSL 참조 |
| `judgment` | object | 계층 2. `rationale` 필수 |
| `provenance.source` | enum | `real_user_query` \| `workshop` \| `synthetic` \| `concierge_derived` |

### assertion DSL

`assertions[]`의 각 항목은 `path` + 연산자 하나로 구성한다. `path`는 JSONPath 부분집합(점 표기 + `[*]` + `[n]`)을 지원한다.

| 연산자 | 인자 | 의미 |
|---|---|---|
| `equals` | scalar | 값 일치. `[*]` 경로면 모든 요소가 일치 |
| `includes` | array | 추출 결과가 인자 전체를 포함 |
| `excludes` | array | 추출 결과가 인자를 하나도 포함하지 않음 |
| `exists` | bool | 경로 존재 여부 |
| `min_length` / `max_length` | int | 배열·문자열 길이 |
| `matches` | regex | 문자열 정규식 |
| `numeric_range` | `{min,max}` | 수치 범위 |

`concierge_derived`는 별도 법인의 상용 AI 컨시어지에서 유래한 케이스를 뜻한다(ADR 010). **고객 질의 원문은 이 저장소에 들어올 수 없으며**, 추상화된 목적 패턴과 미충족 데이터 항목만 허용된다. 이 값을 가진 케이스를 작성할 때 원문으로 보이는 문장이 `input`에 있으면 중단하고 보고할 것.

**금지 사항**: 결과 순위 전체를 고정하는 assertion, 결과 건수를 정확히 고정하는 assertion을 생성하지 말 것. 스냅샷마다 깨진다. 건수는 `min_length` 또는 `numeric_range`로 표현한다.

### 케이스 예시 (스키마 구현 시 픽스처로 사용)

```yaml
id: EV-PLAN-001
title: 폐교 활용 사업 데이터 탐색
category: purpose_plan
tool: build_data_plan
status: pass
authored_against:
  snapshot: "2026-06"
  rule_versions: ["catalog/1.0"]
input:
  purpose: "폐교를 지역 커뮤니티 시설로 활용하는 사업을 검토 중이다"
assertions:
  - path: meta.evidenceLevel
    equals: DRAFT
  - path: data.joinKeys[*].evidenceLevel
    equals: CANDIDATE_ONLY
  - path: data.candidates[*].datasetId
    includes: ["<TODO: 필수 후보 id>"]
  - path: data.candidates[*].datasetId
    excludes: ["<TODO: 대표 오검출 id>"]
  - path: data.unmetRequirements
    min_length: 1
judgment:
  expected_roles:
    - 폐교 현황
    - 인구·연령 구조
    - 기존 커뮤니티 시설 분포
  unmet_requirements:
    - "폐교 건물 구조 안전등급 — 국가 수준 목록 부재"
  rationale: |
    <TODO: 역할 분해가 이 세 축이어야 하는 이유, 안전등급 미충족 근거>
provenance:
  source: workshop
  author: <TODO>
  reviewed_at: 2026-08-04
```

`<TODO>` 자리의 실제 `datasetId`는 임의로 채우지 말 것. Phase 1에서 실제 Tool을 호출해 응답을 보고 채우고, 채운 근거를 `judgment.rationale`에 남긴다.

## 4. Runner 요구사항

`evals/runner/run_evals.py`

```
usage: run_evals.py [--snapshot YYYY-MM | --latest] [--category CAT] [--case ID]
                    [--endpoint URL] [--out evals/results] [--fail-on-drift]
```

동작:
1. 케이스 YAML 로드 → `case.schema.json`으로 검증 (스키마 위반은 즉시 오류)
2. `tool` + `input`으로 MCP 엔드포인트 호출. 기본 엔드포인트는 로컬 스택
3. 응답 원문과 assertion 평가 결과를 `evals/results/<snapshot>/<case_id>.json`에 저장
4. `summary.json`에 카테고리별 pass/fail/known_gap 집계와 실행 메타(엔드포인트, 스냅샷, 규칙 버전) 기록

### 두 가지 실행 모드 — 반드시 구분해 구현할 것

| 모드 | 스냅샷 | 실패 의미 | 종료 코드 |
|---|---|---|---|
| 고정 (CI, 커밋마다) | `authored_against.snapshot` | 회귀 | 실패 시 1 |
| 최신 (월간 잡) | 최신 스냅샷 | 드리프트 신호 | 기본 0, `--fail-on-drift` 시 1 |

`status: known_gap` 케이스는 assertions 실패 시에도 종료 코드에 영향을 주지 않으며, `summary.json`에 `known_gap` 으로 분류한다. 단 **known_gap 케이스가 갑자기 통과한 경우는 별도 신호(`gap_closed`)로 보고**한다 — 서비스가 개선됐다는 뜻이므로 케이스 재분류가 필요하다.

### 드리프트 리포트

최신 모드 실행 시 `evals/results/<snapshot>/drift.md`를 생성한다. 케이스별로 고정 스냅샷 대비 달라진 점을 서술한다. 특히 `includes`로 지정된 필수 후보가 최신 목록에서 사라진 경우를 명시적으로 표기한다 — 이것이 목록 안정성의 정량 증거이므로 별도 섹션으로 뽑을 것.

## 5. 렌더러 요구사항

`evals/runner/render_casebook.py` → `docs/사례_20선.md`

- 입력: `evals/cases/**` + `evals/results/<snapshot>/**`
- 상단에 자동 생성 경고와 생성 시점·스냅샷·규칙 버전 명시
- 카테고리별 섹션, 케이스별로 다음을 표시: 제목 / 입력 질의 / 반환된 후보 요약 / 판정 근거(`judgment.rationale`) / 근거 수준 배지
- `known_gap` 케이스는 **숨기지 말고 "현재 답할 수 없는 질의" 섹션으로 별도 노출**한다
- 결과 JSON이 없는 케이스는 "미실행"으로 표시하고 렌더링을 중단하지 않는다
- CI에서 렌더 결과와 커밋된 파일이 다르면 실패하도록 검사 스텝을 넣는다 (사례집 낡음 방지)

## 6. Phase 순서 (지킬 것)

**Phase 1 — 시드 5개로 스키마 확정**
`purpose_plan` 2, `column_search` 2, `known_gap` 1. 실제 Tool을 호출해 응답을 보고 작성한다. 이 과정에서 스키마에 부족하거나 남는 필드를 발견하면 스키마를 고친다. 스키마 확정 전 15개 확장 금지.

**Phase 2 — runner + assertion 평가기 완성**
시드 5개가 고정 모드에서 통과하고 known_gap이 종료 코드를 오염시키지 않는 것을 확인한다.

**Phase 3 — 20개로 확장**

| 카테고리 | 개수 | 증명 대상 |
|---|---|---|
| `purpose_plan` | 6 | 목적 분해 타당성, 미충족 요구를 정직하게 반환하는가 |
| `column_search` | 4 | 포털이 못 하는 컬럼 기준 탐색 (차별화 지점) |
| `structure_lookup` | 3 | 관측 구조의 실제 일치, 안전 게이트 작동 |
| `catalog_search` | 2 | 필터 조합·커서 페이징 정상성 |
| `comparison` | 2 | 해석 없는 사실 비교 준수 |
| `change_tracking` | 2 | `MISSING_FROM_SNAPSHOT` ≠ 폐기 |
| `coverage_stat` | 1 | Phase 0 커버리지 수치의 정본 기록 |

이 중 `known_gap`을 3~5개 포함한다. **케이스마다 서로 다른 이유로 실패할 수 있어야 한다** — 같은 이유로 깨지는 케이스 여러 개는 케이스 하나로 간주해 통합한다.

**Phase 4 — 렌더러 + CI**
`.github/workflows/evals.yml`: 커밋마다 고정 모드 실행 + 사례집 최신성 검사. 월간 스케줄 잡으로 최신 모드 실행 + 드리프트 리포트 커밋.

**Phase 5 — README 연결**
README `무엇을 믿을 수 있나` 섹션에 사례집 링크 한 줄 추가. 다른 섹션은 건드리지 말 것. README는 ADR 001·002 반영으로 이미 개정되었으므로 구조를 재검토하지 말 것.

## 7. 함께 작성할 ADR

`decisions/`에 다음 3건을 작성한다. 형식: 맥락 / 결정 / 기각한 대안과 이유 / 영향.

| 번호 | 제목 | 반드시 담을 기각 대안 |
|---|---|---|
| 011 | evals 2계층 구조(assertions/judgment 분리) 채택 | 단일 기대값 고정 — 스냅샷 변동마다 깨져 아무도 실행하지 않게 됨 |
| 012 | 스냅샷 드리프트를 실패가 아닌 신호로 처리 | 드리프트를 CI 실패로 처리 — 목록 변경이 곧 빌드 중단이 되어 케이스 세트가 폐기됨 |
| 013 | 사례집을 evals에서 렌더링 (수동 작성 금지) | 사례집 수동 관리 — evals와 어긋나고 낡은 채 방치됨 |

번호는 이 저장소의 decisions/ 기존 최대 번호(현재 010) 다음인 011부터 부여한다.

## 8. glossary 등재 (병행)

`glossary/evidence-level.yaml`을 작성한다. 근거 수준 4종(`CATALOG_METADATA_ONLY`, `FILE_OBSERVATION`, `DRAFT`, `CANDIDATE_ONLY`)과 변경 상태(`MISSING_FROM_SNAPSHOT`, `OFFICIALLY_WITHDRAWN`)의 enum 정본이다. 각 항목에 `id` / `label_ko` / `definition_ko` / `definition_en` / `applies_to`(Tool 목록) / `introduced_in`을 둔다.

작성 후 README와 부속명세의 해당 표가 이 파일과 불일치하는지 점검해 보고할 것. 문서 수정은 보고 후 별도 승인을 받는다.

이 파일은 AIRD 표준 문안의 원료로 인용될 수 있다(ADR 010: 기여 방향은 렌즈 → 표준). `introduced_in`에 도입 시점을 정확히 기록해 선행성이 확인 가능하도록 할 것.

## 9. 수락 기준

- [ ] Phase 0 커버리지 수치 보고 완료
- [ ] `case.schema.json`으로 전 케이스 검증 통과
- [ ] 고정 모드 CI 통과, `known_gap`이 종료 코드를 오염시키지 않음
- [ ] `known_gap` 통과 시 `gap_closed` 신호 발생 확인
- [ ] 최신 모드가 드리프트 리포트를 생성하고 종료 코드 0
- [ ] `docs/사례_20선.md`가 렌더링으로만 생성되며 CI 최신성 검사 작동
- [ ] 순위 고정·건수 정확 고정 assertion이 하나도 없음
- [ ] ADR 3건, `glossary/evidence-level.yaml` 작성 완료
- [ ] `<TODO>` 플레이스홀더가 남아 있지 않음

## 10. 하지 말 것

- 빈 칸을 메우기 위한 합성 케이스 작성 (`provenance.source: synthetic`은 정상성 검증용 `catalog_search`에만 허용)
- `docs/사례_20선.md` 직접 편집
- README 구조 변경 (5절의 링크 한 줄 외)
- 실제 `datasetId`를 확인 없이 추정해 채우기
- 서비스가 못 하는 질의를 케이스 세트에서 제외
- `evals/results/**` 커밋 (drift.md 제외)
- 컨시어지 관련 케이스에 고객 질의 원문 기재
