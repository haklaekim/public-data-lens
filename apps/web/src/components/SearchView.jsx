import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import DatasetCardRow from './DatasetCardRow.jsx'

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

const CYCLES = [
  ['', '주기 전체'], ['DAILY', '일간'], ['WEEKLY', '주간'], ['MONTHLY', '월간'],
  ['QUARTERLY', '분기'], ['SEMIANNUAL', '반기'], ['ANNUAL', '연간'], ['IRREGULAR', '수시'],
]

const FORMATS = ['', 'CSV', 'JSON', 'XML', 'XLSX', 'PDF', 'SHP']

export default function SearchView({ onOpen, compareIds, onToggleCompare, seed }) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({
    listType: '', region: '', includeInferred: true, updateCycle: '', format: '',
  })
  const [result, setResult] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const runSearch = useCallback(
    async (cursor = null, q = query, f = filters) => {
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
        })
        setResult(body)
        setItems((prev) => (cursor ? [...prev, ...body.data.items] : body.data.items))
      } catch (e) {
        setError(`${e.code || ''} ${e.message}`)
      } finally {
        setLoading(false)
      }
    },
    [query, filters],
  )

  useEffect(() => {
    runSearch() // 초기: 최신 수정순 목록
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 컨시어지 보완 노드에서 넘어온 프리필 질의
  useEffect(() => {
    if (!seed?.q) return
    setQuery(seed.q)
    runSearch(null, seed.q, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.t])

  const submit = (e) => {
    e.preventDefault()
    runSearch()
  }

  // 컬럼 기준 검색(v1.3) — 원본 컬럼명 부분 일치(AND), 구조 확인분 내에서만
  const [mode, setMode] = useState('keyword') // 'keyword' | 'columns'
  const [colQuery, setColQuery] = useState('')
  const runColumnSearch = async (e, q = colQuery) => {
    e?.preventDefault()
    const kws = q.split(',').map((k) => k.trim()).filter(Boolean)
    if (!kws.length) return
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
  }

  return (
    <section>
      <form
        className="searchbar unified"
        onSubmit={mode === 'keyword' ? submit : runColumnSearch}
      >
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
            placeholder="키워드로 검색 (예: 어린이 보호구역)"
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
        <button type="submit" disabled={loading}>검색</button>
      </form>
      {mode === 'columns' && (
        <p className="search-hint">
          실제 파일에서 관측된 원본 컬럼명과 부분 일치하는 데이터셋을 찾습니다 — 여러 개를
          쉼표로 적으면 모두 가진 것만(AND) 반환합니다.
        </p>
      )}

      <div className="examples">
        {(mode === 'keyword' ? EXAMPLES : COLUMN_EXAMPLES).map((ex) => (
          <button
            key={ex}
            className="chip"
            onClick={() => {
              if (mode === 'keyword') { setQuery(ex); runSearch(null, ex, filters) }
              else { setColQuery(ex); runColumnSearch(null, ex) }
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {mode === 'keyword' && (
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
      {result && (
        <>
          <p className="result-meta">
            {result.data.totalEstimate.toLocaleString()}건
            {result.data.ranking && (
              <> · 랭킹 {result.data.ranking.method} ({result.data.ranking.version})</>
            )}
            {result.data.coverage && (
              <> · 구조 확인 {result.data.coverage.searchedRecords.toLocaleString()}건 내 컬럼 검색</>
            )}
          </p>
          {result.warnings
            .filter((w) => !w.startsWith('본 결과는'))
            .map((w, i) => <p className="warning" key={i}>⚠ {w}</p>)}
        </>
      )}

      <ul className="results">
        {items.map((item) => (
          <DatasetCardRow
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
          {loading ? '불러오는 중…' : '더 보기'}
        </button>
      )}
    </section>
  )
}
