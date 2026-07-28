import { useEffect, useState } from 'react'
import { api } from '../api.js'

const VIEWS = [
  ['card', '카드'],
  ['normalized', '정규화'],
  ['source', '원본'],
  ['jsonld', 'JSON-LD'],
]

// 완전성 점검 필드의 한글 표기 — 점수(기재 n/16)의 분해 근거 체크리스트용
const FIELD_LABEL = {
  title: '제목', theme: '분류', org_name: '제공기관', update_cycle: '갱신주기',
  keywords: '키워드', description: '설명', license: '이용허락', created_date: '등록일',
  modified_date: '수정일', list_url: '원문 URL', spatial: '공간범위', temporal: '시간범위',
  data_limits: '이용제한', format: '포맷', row_count: '행 수', file_data_name: '파일명',
  api_type: 'API 유형', traffic: '트래픽',
}

const FRESH_LABEL = {
  FRESH: { text: '최신', cls: 'fresh' },
  POSSIBLY_STALE: { text: '갱신 지연 가능', cls: 'stale' },
  UNKNOWN: { text: '최신성 판단 불가', cls: 'unknown' },
}

export default function DatasetProfile({ recordId, onClose }) {
  const [view, setView] = useState('card')
  const [body, setBody] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setBody(null)
    setError(null)
    api.dataset(recordId, view).then(setBody).catch((e) => setError(e.message))
  }, [recordId, view])

  const ds = body?.data?.dataset

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-tabs">
            {VIEWS.map(([v, label]) => (
              <button key={v} className={view === v ? 'tab active' : 'tab'} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </div>
          <button className="close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="error">{error}</p>}
        {!body && !error && <p className="loading">불러오는 중…</p>}

        {body?.warnings
          ?.filter((w) => !w.startsWith('본 결과는'))
          .map((w, i) => <p className="warning" key={i}>⚠ {w}</p>)}

        {ds && view === 'card' && <CardView ds={ds} />}
        {ds && view !== 'card' && (
          <pre className="json-view">{JSON.stringify(ds, null, 2)}</pre>
        )}

        {body && (
          <p className="drawer-meta">
            스냅샷 {body.meta.sourceSnapshot} · 규칙 {body.meta.ruleVersions.join(', ') || '—'}
          </p>
        )}
      </aside>
    </div>
  )
}

function CardView({ ds }) {
  const fresh = FRESH_LABEL[ds.freshness?.status] || FRESH_LABEL.UNKNOWN
  return (
    <div className="profile">
      <h2>
        <span className={`type type-${ds.listType}`}>{ds.listType}</span> {ds.title}
      </h2>
      <p className="org">{ds.orgName}</p>

      <div className="prop-grid">
        <Prop k="분류" v={ds.theme?.top ? `${ds.theme.top}${ds.theme.sub ? ' › ' + ds.theme.sub : ''}` : '—'} />
        <Prop k="포맷" v={ds.formats?.join(', ') || '—'} />
        <Prop k="업데이트 주기" v={ds.updateCycleRaw || '—'} />
        <Prop k="이용허락" v={ds.license?.raw || '—'} />
        <Prop k="등록일" v={ds.createdDate || '—'} />
        <Prop k="수정일" v={ds.modifiedDate || '—'} />
        <Prop k="공간범위" v={ds.spatial || '미기재'} />
        <Prop k="시간범위" v={ds.temporal || '미기재'} />
        {ds.rowCount != null && <Prop k="전체 행" v={ds.rowCount.toLocaleString()} />}
        {ds.apiType && <Prop k="API 유형" v={ds.apiType} />}
      </div>

      <div className="judgments">
        <span
          className="completeness large"
          title={`${ds.completeness.profile} 프로파일 · ${ds.completeness.rule}`}
        >
          목록 기재 {ds.completeness.filledFields}/{ds.completeness.totalFields}
          <small>
            {' '}({ds.completeness.profile} 프로파일 ·{' '}
            {ds.completeness.typical
              ? `동일 유형의 ${ds.completeness.typicalShare}%와 같은 표준 수준`
              : `유형 내 상위 ${ds.completeness.topPercent}%`})
          </small>
        </span>
        <span className={`freshness ${fresh.cls}`} title={ds.freshness?.note || ''}>
          {fresh.text}
          {ds.freshness?.ageDays != null && <small> · 수정 후 {ds.freshness.ageDays}일</small>}
        </span>
      </div>

      {ds.completeness.fields && (
        <div className="field-checklist">
          {Object.entries(ds.completeness.fields).map(([f, filled]) => (
            <span key={f} className={filled ? 'fc filled' : 'fc missing'}>
              {filled ? '✓' : '—'} {FIELD_LABEL[f] || f}
            </span>
          ))}
        </div>
      )}

      {ds.description && (
        <>
          <h3>설명</h3>
          <p className="desc">{ds.description}</p>
        </>
      )}
      {ds.dataLimits && (
        <>
          <h3>데이터 한계 (기관 기재)</h3>
          <p className="desc">{ds.dataLimits}</p>
        </>
      )}
      {ds.keywords?.length > 0 && (
        <div className="keywords">
          {ds.keywords.map((k) => <span key={k} className="chip small">{k}</span>)}
        </div>
      )}

      <div className="portal-box">
        <p>
          목록키 <code>{ds.portal.listKey}</code> · {ds.portal.orgName} · 목록 기준{' '}
          {ds.portal.listBaseDate} · 분석 기준 {ds.portal.analyzedAt?.slice(0, 10)}
        </p>
        {ds.portal.listUrl && (
          <a className="portal-link" href={ds.portal.listUrl} target="_blank" rel="noreferrer">
            공공데이터포털에서 원문 확인 ↗
          </a>
        )}
        <p className="evidence-note">
          근거 수준: 목록 메타데이터만(CATALOG_METADATA_ONLY) — 실제 데이터 내용은 확인되지 않았습니다.
        </p>
      </div>
    </div>
  )
}

function Prop({ k, v }) {
  return (
    <div className="prop">
      <span className="prop-k">{k}</span>
      <span className="prop-v">{v}</span>
    </div>
  )
}
