import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { UPDATE_CYCLE_LABEL } from '../labels.js'
import DatasetRow from './DatasetRow.jsx'
import WarningPanel from './WarningPanel.jsx'
import { CoveragePopulation } from './CoverageIndicator.jsx'
import { CoverageBlock, OpenInfraBlock } from './HomeBlocks.jsx'

const EXAMPLES = [
  '어린이 보호구역',
  '산후조리원 현황',
  '무더위 쉼터',
  '식품 제조 공장',
  '버스 정류장 위치',
  '관광지 방문객',
]

// 컬럼 모드 예시 — 실파일에서 자주 관측되는 원본 컬럼명 조합
const COLUMN_EXAMPLES = ['위도, 경도', '주소, 전화번호', '사업자등록번호', '설치연도']

const REGIONS = [
  ['', '지역 전체'], ['KR-11', '서울'], ['KR-26', '부산'], ['KR-27', '대구'],
  ['KR-28', '인천'], ['KR-29', '광주'], ['KR-30', '대전'], ['KR-31', '울산'],
  ['KR-50', '세종'], ['KR-41', '경기'], ['KR-42', '강원'], ['KR-43', '충북'],
  ['KR-44', '충남'], ['KR-45', '전북'], ['KR-46', '전남'], ['KR-47', '경북'],
  ['KR-48', '경남'], ['KR-49', '제주'],
]

const CYCLES = [['', '주기 전체'], ...Object.entries(UPDATE_CYCLE_LABEL)]

const FORMATS = ['', 'CSV', 'JSON', 'XML', 'XLSX', 'PDF', 'SHP']

const CYCLE_LABEL = UPDATE_CYCLE_LABEL

/* 질의 해석은 서버(query-interpret-v1.0)가 한다 — 프론트 별칭 사전·해석 로직 제거(STEP 8).
   서버가 반환한 interpretedFilters[]를 배너로 표시하고, 해제 시 interpret=false로 재검색. */
const FIELD_LABEL = { region: '지역', format: '포맷', updateCycle: '주기', listType: '유형' }
const interpretedLabel = (f) => {
  const v = f.field === 'region'
    ? (REGIONS.find(([c]) => c === f.value)?.[1] || f.value)
    : f.field === 'updateCycle' ? (CYCLE_LABEL[f.value] || f.value) : f.value
  return `${FIELD_LABEL[f.field] || f.field} ${v}`
}

// 검색 상태(질의·필터·모드)를 URL 쿼리로 직렬화 — 공유·북마크·복원의 단일 형식(ADR-003)
function toUrlParams(q, f, m, cq) {
  const p = new URLSearchParams()
  if (m === 'columns') {
    p.set('mode', 'columns')
    if (cq) p.set('cols', cq)
    return p.toString()
  }
  if (q) p.set('q', q)
  for (const k of ['listType', 'region', 'updateCycle', 'format']) if (f[k]) p.set(k, f[k])
  if (!f.includeInferred) p.set('inferred', '0')
  return p.toString()
}

export default function SearchView({
  onOpen, compareIds, onToggleCompare, seed, status, urlParams, onUrlChange,
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({
    listType: '', region: '', includeInferred: true, updateCycle: '', format: '',
  })
  const [result, setResult] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 사용자가 해석을 해제하면(원문 그대로 검색) 다음 제출 전까지 interpret를 끈다
  const [interpretOff, setInterpretOff] = useState(false)

  const runSearch = useCallback(
    async (cursor = null, q = query, f = filters, interpret = !interpretOff) => {
      setLoading(true)
      setError(null)
      try {
        const body = await api.search({
          query: q || undefined,
          listType: f.listType || undefined,
          region: f.region || undefined,
          includeInferred: f.includeInferred,
          updateCycle: f.updateCycle || undefined,
          format: f.format || undefined,
          cursor: cursor || undefined,
          pageSize: 20,
          // 질의 해석은 서버 규칙(query-interpret-v1.0) — 근거가 interpretedFilters로 돌아온다
          interpret: interpret && q ? true : undefined,
        })
        setResult(body)
        setItems((prev) => (cursor ? [...prev, ...body.data.items] : body.data.items))
      } catch (e) {
        setError(`${e.code || ''} ${e.message}`)
      } finally {
        setLoading(false)
      }
    },
    [query, filters, interpretOff],
  )

  // URL 반영 — 검색을 실행한 조건을 주소창에 남긴다(replace — 히스토리를 더럽히지 않음)
  const syncUrl = (q, f, m = 'keyword', cq = '') => {
    onUrlChange?.(toUrlParams(q, f, m, cq))
  }

  // 컨시어지 보완 노드에서 넘어온 프리필 질의
  useEffect(() => {
    if (!seed?.q) return
    setQuery(seed.q)
    setPristine(false)
    runSearch(null, seed.q, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.t])

  // 첫 화면에만 예시를 보여준다 — 검색을 시작하면 화면을 비운다
  const [pristine, setPristine] = useState(true)
  // 필터는 기본 접힘 — 활성 조건은 칩으로 요약 노출
  const [showFilters, setShowFilters] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    setPristine(false)
    setInterpretOff(false) // 새 제출은 해석 재개
    runSearch(null, query, filters, true)
    syncUrl(query, filters)
  }

  // '원문 그대로 검색' — 서버 해석을 끄고 같은 질의를 재실행
  const dismissInterp = () => {
    setInterpretOff(true)
    runSearch(null, query, filters, false)
  }

  // 컬럼 기준 검색(v1.3) — 원본 컬럼명 부분 일치(AND), 구조 확인분 내에서만
  const [mode, setMode] = useState('keyword') // 'keyword' | 'columns'
  const [colQuery, setColQuery] = useState('')
  const runColumnSearch = async (e, q = colQuery) => {
    e?.preventDefault()
    setPristine(false)
    const kws = q.split(',').map((k) => k.trim()).filter(Boolean)
    if (!kws.length) return
    syncUrl('', filters, 'columns', q)
    setLoading(true)
    setError(null)
    try {
      const body = await api.searchColumns(kws)
      setResult(body)
      setItems(body.data.items)
    } catch (err) {
      setError(`${err.code || ''} ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const setFilter = (k, v) => {
    const next = { ...filters, [k]: v }
    setFilters(next)
    runSearch(null, query, next)
    syncUrl(query, next)
  }

  // 최초 마운트: URL에 담긴 검색 상태를 복원한다(공유·북마크·뒤로가기 — ADR-003)
  useEffect(() => {
    const p = urlParams
    if (p && p.get('mode') === 'columns' && p.get('cols')) {
      setMode('columns')
      setColQuery(p.get('cols'))
      runColumnSearch(null, p.get('cols'))
      return
    }
    const restored = { ...filters }
    let any = false
    for (const k of ['listType', 'region', 'updateCycle', 'format']) {
      if (p?.get(k)) { restored[k] = p.get(k); any = true }
    }
    if (p?.get('inferred') === '0') { restored.includeInferred = false; any = true }
    const q = p?.get('q') || ''
    if (q || any) {
      setQuery(q)
      setFilters(restored)
      setPristine(false)
      runSearch(null, q, restored)
    } else {
      runSearch() // 초기: 최신 수정순 목록(pristine 홈의 Live 블록 데이터)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className={pristine ? 'search-home' : undefined}>
      {pristine && (
        <div className="hero">
          <h2 className="hero-title">
            공공데이터 {result ? result.data.totalEstimate.toLocaleString() : '96,056'}건을<br />
            근거와 함께 찾아드립니다
          </h2>
          <p className="hero-sub">
            목록 검색부터 실파일에서 확인한 컬럼 구조까지 — 웹과 AI(MCP)가 같은 판정 엔진을 씁니다
          </p>
        </div>
      )}
      <form
        className="searchbar unified"
        onSubmit={mode === 'keyword' ? submit : runColumnSearch}
      >
        <div className="search-shell">
          <div className="seg" role="tablist" aria-label="검색 방식">
            <button
              type="button"
              className={mode === 'keyword' ? 'on' : ''}
              onClick={() => setMode('keyword')}
            >
              키워드
            </button>
            <button
              type="button"
              className={mode === 'columns' ? 'on' : ''}
              onClick={() => setMode('columns')}
              title="실제 파일에서 관측된 원본 컬럼명으로 데이터셋을 찾습니다"
            >
              컬럼
            </button>
          </div>
          {mode === 'keyword' ? (
            <input
              key="kw"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="무엇을 찾으시나요? — 지역·포맷을 함께 적어도 됩니다"
              maxLength={500}
            />
          ) : (
            <input
              key="col"
              value={colQuery}
              onChange={(e) => setColQuery(e.target.value)}
              placeholder="원본 컬럼명 — 쉼표로 여러 개 (예: 위도, 경도)"
              maxLength={200}
            />
          )}
        </div>
        <button type="submit" disabled={loading}>검색</button>
      </form>
      {mode === 'columns' && (
        <p className="search-hint">
          실제 파일에서 관측된 원본 컬럼명과 부분 일치하는 데이터셋을 찾습니다 — 여러 개를
          쉼표로 적으면 모두 가진 것만(AND) 반환합니다.
        </p>
      )}
      {mode === 'keyword' && result?.data?.interpretedFilters?.length > 0 && (
        <p className="interp">
          <span className="interp-mark">해석</span>
          검색어에서 <strong>
            {result.data.interpretedFilters.map(interpretedLabel).join(' · ')}
          </strong> 조건을 읽어 적용했습니다
          <small> ({result.data.interpretedFilters[0].ruleId})</small>
          <button type="button" className="link" onClick={dismissInterp}>원문 그대로 검색</button>
        </p>
      )}

      {pristine && (
        <div className="examples">
          <span className="examples-label">예시</span>
          {(mode === 'keyword' ? EXAMPLES : COLUMN_EXAMPLES).map((ex) => (
            <button
              key={ex}
              className="chip"
              onClick={() => {
                setPristine(false)
                if (mode === 'keyword') { setQuery(ex); runSearch(null, ex, filters); syncUrl(ex, filters) }
                else { setColQuery(ex); runColumnSearch(null, ex) }
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {pristine && (
        <button
          type="button"
          className="browse-all"
          onClick={() => { setPristine(false); runSearch() }}
        >
          전체 목록 둘러보기 →
        </button>
      )}

      {/* §3 #4 Live exploration — 마운트 시 이미 받아둔 결과 상위 5건(추가 왕복 없음) */}
      {pristine && result && items.length > 0 && (
        <div className="home-block live-block">
          <h3>지금 카탈로그 — 최신 수정순 상위 5건</h3>
          <ul className="results">
            {items.slice(0, 5).map((item) => (
              <DatasetRow
                key={item.recordId}
                item={item}
                onOpen={onOpen}
                compared={compareIds.includes(item.recordId)}
                compareFull={compareIds.length >= 5}
                onToggleCompare={onToggleCompare}
              />
            ))}
          </ul>
        </div>
      )}

      {pristine && <CoverageBlock status={status} />}
      {pristine && <OpenInfraBlock />}

      {!pristine && result && (
        <div className="toolbar">
          <p
            className="result-meta"
            title={result.data.ranking
              ? `랭킹 ${result.data.ranking.method} (${result.data.ranking.version})`
              : undefined}
          >
            {/* 정렬 방식은 계약(ranking.method/version)을 그대로 툴팁에 표기 —
                문자열 패턴으로 의미를 추론하지 않는다(CLAUDE.md 불변식) */}
            총 {result.data.totalEstimate.toLocaleString()}건
            {result.data.coverage && (
              <> · <CoveragePopulation
                searched={result.data.coverage.searchedRecords}
                total={result.data.coverage.fileRecordsTotal}
              /></>
            )}
            {result.data.coverage && items.length < result.data.totalEstimate && (
              <> · 상위 {items.length}건 표시 — 컬럼 검색에는 커서 페이징이 없습니다(컬럼을 추가해 좁혀 보세요)</>
            )}
          </p>
          {mode === 'keyword' && (
            <div className="toolbar-right">
              {['listType', 'region', 'updateCycle', 'format'].filter((k) => filters[k]).map((k) => (
                <button key={k} className="fchip" onClick={() => setFilter(k, '')} title="조건 해제">
                  {k === 'region'
                    ? REGIONS.find(([c]) => c === filters[k])?.[1]
                    : k === 'updateCycle' ? CYCLE_LABEL[filters[k]] : filters[k]}
                  <span aria-hidden> ×</span>
                </button>
              ))}
              <button
                type="button"
                className={`filter-toggle${showFilters ? ' open' : ''}`}
                onClick={() => setShowFilters((v) => !v)}
              >
                필터
              </button>
            </div>
          )}
        </div>
      )}

      {showFilters && mode === 'keyword' && (
      <div className="filters">
        <select value={filters.listType} onChange={(e) => setFilter('listType', e.target.value)}>
          <option value="">유형 전체</option>
          <option value="FILE">FILE</option>
          <option value="API">API</option>
          <option value="STD">표준(STD)</option>
        </select>
        <select value={filters.region} onChange={(e) => setFilter('region', e.target.value)}>
          {REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="inferred">
          <input
            type="checkbox"
            checked={filters.includeInferred}
            onChange={(e) => setFilter('includeInferred', e.target.checked)}
          />
          추론 지역 포함
        </label>
        <select value={filters.updateCycle} onChange={(e) => setFilter('updateCycle', e.target.value)}>
          {CYCLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.format} onChange={(e) => setFilter('format', e.target.value)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f || '포맷 전체'}</option>)}
        </select>
      </div>
      )}

      {error && <p className="error">{error}</p>}
      {!pristine && <WarningPanel warnings={result?.warnings} notices={result?.notices} />}

      {/* 빈 결과(§4.5) — 조회 범위를 함께 말해 '데이터 부재'로 읽히지 않게 한다 */}
      {!pristine && result && !loading && items.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">이 조건으로는 결과가 없습니다</p>
          <p className="empty-body">
            조회 범위: {result.meta?.sourceSnapshot} 스냅샷
            {result.data.coverage
              ? <> — 컬럼 검색은 구조가 관측된 {result.data.coverage.searchedRecords.toLocaleString()}건
                  안에서만 찾습니다. 결과에 없다고 해당 컬럼이 없는 것이 아닙니다(미수집일 수 있음).</>
              : ' 전체 목록.'}
            <br />
            키워드를 줄이거나 필터를 해제해 보세요. 찾는 방식이 막막하면 우측 상단
            <strong> AI에 연결</strong>로 대화하며 탐색할 수도 있습니다.
          </p>
        </div>
      )}

      {!pristine && (<>
      <ul className="results">
        {items.map((item) => (
          <DatasetRow
            key={item.recordId}
            item={item}
            onOpen={onOpen}
            compared={compareIds.includes(item.recordId)}
            compareFull={compareIds.length >= 5}
            onToggleCompare={onToggleCompare}
          />
        ))}
      </ul>

      {result?.data.nextCursor && result?.data.hasMore && (
        <button
          className="more"
          disabled={loading}
          onClick={() => runSearch(result.data.nextCursor)}
        >
          {loading ? '불러오는 중…' : '결과 더 보기'}
        </button>
      )}
      </>)}
    </section>
  )
}
