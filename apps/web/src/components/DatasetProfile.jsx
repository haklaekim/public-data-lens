import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

import { exampleStatusLabel, COMPLETENESS_FIELD_LABEL, FRESHNESS_LABEL, EVIDENCE_LABEL } from '../labels.js'
import WarningPanel from './WarningPanel.jsx'
import EvidenceRow from './EvidenceRow.jsx'
import CoverageIndicator from './CoverageIndicator.jsx'

/* 상세 = 렌즈 3종(§5.1) + 기술 표현 접힘. 렌즈는 관점이고, JSON 덤프는 렌즈가 아니다. */
const LENSES = [
  ['overview', '개요'],
  ['structure', '데이터 구조'],
  ['evidence', '근거'],
]

export default function DatasetProfile({ recordId, lens = 'overview', onLensChange, onClose }) {
  const [cardBody, setCardBody] = useState(null)
  const [structBody, setStructBody] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCardBody(null)
    setStructBody(null)
    setError(null)
    api.dataset(recordId, 'card').then(setCardBody).catch((e) => setError(e.message))
  }, [recordId])

  useEffect(() => {
    if (lens !== 'structure' || structBody) return
    api.structure(recordId).then(setStructBody).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, recordId])

  // drawer 접근성(§8.2): dialog 시맨틱 + Escape + 포커스 트랩 + 닫을 때 포커스 복귀
  const asideRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.activeElement
    const aside = asideRef.current
    aside?.querySelector('.close')?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { closeRef.current(); return }
      if (e.key !== 'Tab' || !aside) return
      const els = aside.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
      )
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [])

  // 렌즈 탭 ARIA(§8.2): tab/aria-selected/화살표 키 이동
  const onTabKey = (e, idx) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + LENSES.length) % LENSES.length
    onLensChange?.(LENSES[next][0])
    e.currentTarget.parentElement.children[next]?.focus()
  }

  const ds = cardBody?.data?.dataset
  const body = lens === 'structure' ? structBody : cardBody
  const activeLens = LENSES.some(([l]) => l === lens) ? lens : 'overview'

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label={ds ? `${ds.title} 상세` : '데이터셋 상세'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div className="drawer-tabs" role="tablist" aria-label="상세 렌즈">
            {LENSES.map(([l, label], i) => (
              <button
                key={l}
                role="tab"
                aria-selected={activeLens === l}
                tabIndex={activeLens === l ? 0 : -1}
                className={activeLens === l ? 'tab active' : 'tab'}
                onClick={() => onLensChange?.(l)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="close" onClick={onClose} aria-label="상세 닫기">✕</button>
        </div>

        {error && <p className="error">{error}</p>}
        {!body && !error && <p className="loading">불러오는 중…</p>}

        <WarningPanel warnings={body?.warnings} />

        {ds && activeLens === 'overview' && <OverviewLens ds={ds} />}
        {activeLens === 'structure' && structBody && <StructureView st={structBody.data} />}
        {ds && activeLens === 'evidence' && <EvidenceLens ds={ds} meta={cardBody.meta} />}

        {activeLens !== 'structure' && ds && <RawSection recordId={recordId} />}

        {body && (
          <p className="drawer-meta">
            스냅샷 {body.meta.sourceSnapshot} · 규칙 {body.meta.ruleVersions.join(', ') || '—'}
          </p>
        )}
      </aside>
    </div>
  )
}

function OverviewLens({ ds }) {
  const fresh = FRESHNESS_LABEL[ds.freshness?.status] || FRESHNESS_LABEL.UNKNOWN
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
              {filled ? '✓' : '—'} {COMPLETENESS_FIELD_LABEL[f] || f}
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
        <EvidenceRow level={ds.evidenceLevel} />
      </div>
    </div>
  )
}

/* 근거 렌즈(§5.4) — 신규 필드 없이 기존 값 조합. "판정이 있으면 근거가 있다"의 구현. */
function EvidenceLens({ ds, meta }) {
  return (
    <div className="profile">
      <h2>근거 — 이 카드의 판정이 어디서 왔는가</h2>
      <EvidenceRow level={ds.evidenceLevel} snapshot={meta.sourceSnapshot} />
      <div className="prop-grid">
        <Prop k="판정 스냅샷" v={`${meta.sourceSnapshot} (처리 ${meta.processedAt?.slice(0, 10)})`} />
        <Prop k="스키마 버전" v={meta.schemaVersion} />
        <Prop k="적용 규칙" v={meta.ruleVersions.join(', ') || '—'} />
        <Prop k="카드 재구성 규칙" v={ds.cardRule || '—'} />
        <Prop k="완전성 규칙" v={`${ds.completeness.rule} (${ds.completeness.profile} 프로파일)`} />
        <Prop k="최신성 규칙" v={ds.freshness?.rule || '—'} />
      </div>
      {ds.freshness?.note && <p className="obs-meta">최신성 주석: {ds.freshness.note}</p>}
      {ds.regions?.length > 0 && (
        <>
          <h3>지역 판정</h3>
          <ul className="case-list">
            {ds.regions.map((r) => (
              <li key={r.code}>
                {r.name} — {EVIDENCE_LABEL[r.evidence] || r.evidence}
                (<code>{r.evidence}</code>) · 신뢰도 {r.confidence}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="obs-meta">
        구조 관측의 출처(provenance·스캔 범위)는 '데이터 구조' 렌즈의 파일별 관측 정보에 있습니다.
      </p>
    </div>
  )
}

/* 기술 표현(정규화/원본/JSON-LD)은 렌즈가 아니다 — 접힘으로 격리(§5.1) */
function RawSection({ recordId }) {
  const [view, setView] = useState(null)
  const [body, setBody] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!view) return
    setBody(null)
    setError(null)
    api.dataset(recordId, view).then(setBody).catch((e) => setError(e.message))
  }, [view, recordId])
  return (
    <details className="raw-section">
      <summary>원본 데이터 — 기술 표현(정규화 · 원본 · JSON-LD)</summary>
      <div className="raw-tabs">
        {[['normalized', '정규화'], ['source', '원본'], ['jsonld', 'JSON-LD']].map(([v, label]) => (
          <button
            key={v}
            className={view === v ? 'tab active' : 'tab'}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {view && !body && !error && <p className="loading">불러오는 중…</p>}
      {body && <pre className="json-view">{JSON.stringify(body.data.dataset, null, 2)}</pre>}
    </details>
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

/* 데이터 구조 렌즈(§5.3) — 실제 파일에서 관측한 원본 컬럼·유형·예시값 상태.
   미수집·보류는 오류가 아닌 정상 상태로 표시한다. sourceName은 원본 그대로. */
function StructureView({ st }) {
  if (!st.assets) {
    return (
      <div className="structure-view">
        <CoverageIndicator status={st.coverageStatus} />
        {st.portalUrl && (
          <p><a href={st.portalUrl} target="_blank" rel="noreferrer">공공데이터포털에서 원문 확인 ↗</a></p>
        )}
      </div>
    )
  }
  return (
    <div className="structure-view">
      <CoverageIndicator
        status={st.coverageStatus}
        available={st.coverage.availableAssets}
        total={st.coverage.totalAssets}
        examplesPublic={st.examplesPublic}
      />
      {st.assets.map((a, i) => (
        <div className="structure-asset" key={i}>
          <h3>
            {a.containerName ? `${a.containerName} › ` : ''}{a.fileName}
            <small> {a.shape || a.format} · {a.status}</small>
          </h3>
          {a.failureReason && <p className="obs-meta">실패 사유: {a.failureReason}</p>}
          <EvidenceRow className="obs-meta" observation={a.observation}>
            {a.observation?.licenseGate === 'COLUMNS_ONLY' && ' · 예시값 라이선스 보류'}
          </EvidenceRow>
          {(a.tables || []).map((t) => (
            <div key={t.tableIndex}>
              {t.sheetName && <p className="sheet-name">시트: {t.sheetName}</p>}
              <div className="table-scroll" tabIndex={0}>
                <table className="structure-table">
                  <thead>
                    <tr><th>#</th><th>원본 컬럼명</th><th>관측 유형</th><th>고유값</th><th>예시값</th></tr>
                  </thead>
                  <tbody>
                    {t.columns.map((c) => (
                      <tr key={c.ordinal}>
                        <td>{c.ordinal}</td>
                        <td>
                          {c.sourceName}
                          {c.note && <small className="col-note"> — {c.note}</small>}
                        </td>
                        <td>{c.observedType || '—'}</td>
                        <td>{c.distinctCount != null ? c.distinctCount.toLocaleString() + (c.distinctApprox ? '≈' : '') : '—'}</td>
                        <td>
                          {c.examples
                            ? c.examples.slice(0, 3).join(', ')
                            : <em className="ex-status">{exampleStatusLabel(c.exampleStatus, st.examplesPublic)}</em>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="table-meta">
                스캔 행 {t.rowsScanned?.toLocaleString() ?? '—'}
                {t.rowCountObserved != null && <> / 관측된 전체 행 {t.rowCountObserved.toLocaleString()}</>}
                {' '}· 컬럼 {t.columnCount} · 범위 {t.scanScope}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
