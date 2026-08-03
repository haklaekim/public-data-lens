import { useEffect, useMemo, useState } from 'react'
import { rowButtonProps } from '../a11y.js'

/* ---------- 유틸 ---------- */

const short = (s, n = 14) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '')

const KIND_META = {
  coverage: { label: '커버리지', dot: 'var(--green-accent)' },
  synergy: { label: '시너지', dot: 'var(--green-starbucks)' },
  gap: { label: '공백', dot: 'var(--warn-text)' },
  caution: { label: '주의', dot: 'var(--error)' },
}

const CONF_META = {
  high: { cls: 'conf-high', label: '★ 신뢰도 높음 — 목록 사실 확인' },
  medium: { cls: 'conf-medium', label: '신뢰도 중간 — 목록 기반 추론' },
  low: { cls: 'conf-low', label: '가설 — 실데이터 확인 필요' },
}

const FRESH_LABEL = {
  FRESH: '최신',
  POSSIBLY_STALE: '갱신 지연 가능',
  UNKNOWN: '판단 불가',
}

/* ---------- 카운트업 숫자 ---------- */

function useCountUp(target, duration = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min((t - t0) / duration, 1)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // 백그라운드 탭 등 rAF가 멈춰도 최종 값은 반드시 도달
    const done = setTimeout(() => setV(target), duration + 150)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [target, duration])
  return v
}

/* ---------- 단어 단위 리빌 ---------- */

function WordReveal({ text, base = 0.15, step = 0.045 }) {
  return (
    <>
      {String(text || '').split(/(\s+)/).map((w, i) =>
        /^\s+$/.test(w) ? w : (
          <span key={i} className="cz-word" style={{ animationDelay: `${base + i * step}s` }}>
            {w}
          </span>
        ),
      )}
    </>
  )
}

/* ---------- 도넛 게이지 ---------- */

function Donut({ value, text, dark, size = 64 }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value))
    return () => cancelAnimationFrame(id)
  }, [value])
  const r = 25
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" className="cz-donut" style={{ width: size, height: size }}
         role="img" aria-label={text}>
      <circle cx="32" cy="32" r={r} fill="none"
              stroke={dark ? 'rgba(255,255,255,0.18)' : 'var(--ceramic)'} strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r} fill="none"
        stroke={dark ? 'var(--green-light)' : 'var(--green-accent)'} strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(Math.max(v, 0), 1))}
        transform="rotate(-90 32 32)"
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
      />
      <text x="32" y="37" textAnchor="middle"
            className={`cz-donut-text ${dark ? 'dark' : ''}`}>{text}</text>
    </svg>
  )
}

/* ---------- 데이터 연결 지도 (선택·교차 하이라이트) ---------- */

const TYPE_FILL = { FILE: 'var(--green-light)', API: 'var(--ceramic)', STD: 'var(--green-house)' }
const TYPE_STROKE = { FILE: 'var(--green-starbucks)', API: 'var(--green-house)', STD: 'var(--green-house)' }

function Constellation({ question, candidates, complements, activeId, linkedIds, onSelect, onHover, onSearch }) {
  const W = 720
  const H = 400
  const cx = W / 2
  const cy = H / 2

  const layout = useMemo(() => {
    const cands = candidates.filter((c) => c.card)
    const comps = (complements || []).slice(0, 4)
    const total = cands.length + comps.length
    const nodes = []
    const place = (i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(total, 1)
      return { x: cx + 252 * Math.cos(a), y: cy + 138 * Math.sin(a) }
    }
    cands.forEach((c, i) => {
      const score = c.card.completeness?.score ?? 0.5
      nodes.push({ type: 'dataset', c, r: 21 + score * 13, ...place(i) })
    })
    comps.forEach((m, i) => {
      nodes.push({ type: 'complement', m, r: 20, ...place(cands.length + i) })
    })

    const edges = []
    const ds = nodes.filter((n) => n.type === 'dataset')
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const ka = new Set((ds[i].c.card.keywords || []).map((k) => k.toLowerCase()))
        const shared = (ds[j].c.card.keywords || []).filter((k) => ka.has(k.toLowerCase()))
        const sameTheme =
          ds[i].c.card.theme?.top && ds[i].c.card.theme?.top === ds[j].c.card.theme?.top
        if (shared.length > 0 || sameTheme) {
          edges.push({
            a: ds[i], b: ds[j], shared,
            label: shared.length > 0 ? `공유 키워드: ${shared.slice(0, 4).join(', ')}` : `같은 주제: ${ds[i].c.card.theme.top}`,
            w: Math.min(1 + shared.length, 4),
          })
        }
      }
    }
    return { nodes, edges }
  }, [candidates, complements])

  const someActive = !!activeId || (linkedIds && linkedIds.size > 0)
  const nodeState = (rid) => {
    if (activeId === rid) return 'active'
    if (linkedIds && linkedIds.has(rid)) return 'linked'
    return someActive ? 'faded' : ''
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cz-constellation" role="img"
         aria-label="후보 데이터셋 연결 지도">
      {layout.nodes.map((n, i) => (
        <line key={`s${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y}
              className={n.type === 'complement' ? 'cz-spoke dashed' : 'cz-spoke'}
              style={{ animationDelay: `${0.1 + i * 0.07}s` }} />
      ))}
      {layout.edges.map((e, i) => {
        const lit = activeId && (e.a.c.recordId === activeId || e.b.c.recordId === activeId)
        return (
          <line key={`e${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
                className={`cz-edge ${lit ? 'lit' : ''}`} strokeWidth={e.w}
                style={{ animationDelay: `${0.4 + i * 0.08}s` }}>
            <title>{e.label}</title>
          </line>
        )
      })}
      <g className="cz-node" style={{ animationDelay: '0s' }} onClick={() => onSelect(null)}>
        <circle cx={cx} cy={cy} r="47" fill="var(--green-accent)" />
        <text x={cx} y={cy - 12} textAnchor="middle" className="cz-goal-label">분석 목표</text>
        <text x={cx} y={cy + 5} textAnchor="middle" className="cz-goal-sub">
          {short(question, 7)}
        </text>
        {question.length > 7 && (
          <text x={cx} y={cy + 21} textAnchor="middle" className="cz-goal-sub">
            {short(question.slice(7), 7)}
          </text>
        )}
      </g>
      {layout.nodes.map((n, i) =>
        n.type === 'dataset' ? (
          <g key={`n${i}`}
             className={`cz-node clickable ${nodeState(n.c.recordId)}`}
             style={{ animationDelay: `${0.15 + i * 0.07}s` }}
             tabIndex={0} role="button"
             aria-label={`${n.c.card.title} — 상세 보기`}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.c.recordId) } }}
             onClick={() => onSelect(n.c.recordId)}
             onMouseEnter={() => onHover(n.c.recordId)}
             onMouseLeave={() => onHover(null)}>
            <title>{`${n.c.card.title}\n${n.c.card.orgName} · 완전성 ${Math.round((n.c.card.completeness?.score ?? 0) * 100)}% — 클릭하면 우측에 상세`}</title>
            <circle cx={n.x} cy={n.y} r={n.r}
                    fill={TYPE_FILL[n.c.card.listType] || 'var(--card)'}
                    stroke={TYPE_STROKE[n.c.card.listType] || 'var(--line)'} strokeWidth="1.5" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" className="cz-node-type"
                  fill={n.c.card.listType === 'STD' ? '#fff' : 'var(--green-house)'}>
              {n.c.card.listType}
            </text>
            <text x={n.x} y={n.y + n.r + 15} textAnchor="middle" className="cz-node-label">
              {short(n.c.card.title, 16)}
            </text>
          </g>
        ) : (
          <g key={`n${i}`} className={`cz-node clickable ${someActive ? 'faded' : ''}`}
             style={{ animationDelay: `${0.15 + i * 0.07}s` }}
             tabIndex={0} role="button"
             aria-label={`보완 데이터 검색: ${n.m.need}`}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSearch(n.m.need) } }}
             onClick={() => onSearch(n.m.need)}>
            <title>{`함께 필요한 데이터(미확보): ${n.m.need}\n클릭하면 검색 탭에서 바로 찾아봅니다`}</title>
            <circle cx={n.x} cy={n.y} r={n.r} className="cz-comp-circle" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" className="cz-node-type"
                  fill="var(--muted)">＋</text>
            <text x={n.x} y={n.y + n.r + 15} textAnchor="middle" className="cz-node-label muted">
              {short(n.m.need, 16)}
            </text>
          </g>
        ),
      )}
    </svg>
  )
}

/* ---------- 포트폴리오 매트릭스 (완전성 × 수정 경과일) ---------- */

function Matrix({ candidates, activeId, linkedIds, onSelect, onHover }) {
  const W = 720
  const H = 360
  const L = 64
  const R = 24
  const T = 30
  const B = 44
  const MAX_AGE = 730

  const withAge = candidates.filter((c) => c.card && Number.isFinite(c.card.freshness?.ageDays))
  const noAge = candidates.filter((c) => c.card && !Number.isFinite(c.card.freshness?.ageDays))

  const px = (score) => L + Math.min(Math.max((score - 0.5) / 0.5, 0), 1) * (W - L - R)
  const py = (age) => T + (Math.sqrt(Math.min(age, MAX_AGE)) / Math.sqrt(MAX_AGE)) * (H - T - B)

  const someActive = !!activeId || (linkedIds && linkedIds.size > 0)
  const cls = (rid) => {
    if (activeId === rid) return 'active'
    if (linkedIds && linkedIds.has(rid)) return 'linked'
    return someActive ? 'faded' : ''
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cz-matrix" role="img"
         aria-label="후보 데이터셋 포트폴리오 매트릭스 (완전성 × 수정 경과일, 목록 기준)">
      {/* 사분면 가이드 */}
      <rect x={px(0.8)} y={T} width={W - R - px(0.8)} height={py(365) - T}
            className="cz-quad best" />
      <line x1={px(0.8)} y1={T} x2={px(0.8)} y2={H - B} className="cz-guide" />
      <line x1={L} y1={py(365)} x2={W - R} y2={py(365)} className="cz-guide" />
      <text x={W - R - 6} y={T + 16} textAnchor="end" className="cz-quad-label">
        완전·최신 (목록 기준)
      </text>
      <text x={W - R - 6} y={H - B - 8} textAnchor="end" className="cz-quad-label dimmed">
        완전·갱신 확인 필요
      </text>
      <text x={L + 6} y={T + 16} className="cz-quad-label dimmed">최신·항목 보완 여지</text>
      <text x={L + 6} y={H - B - 8} className="cz-quad-label dimmed">보완·갱신 모두 확인</text>
      {/* 축 */}
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} className="cz-axis" />
      <line x1={L} y1={T} x2={L} y2={H - B} className="cz-axis" />
      <text x={W - R} y={H - 10} textAnchor="end" className="cz-axis-label">완전성 →</text>
      <text x={14} y={T + 4} className="cz-axis-label">↑ 최신(수정 경과일)</text>
      {[0.6, 0.8, 1.0].map((s) => (
        <text key={s} x={px(s)} y={H - 26} textAnchor="middle" className="cz-tick">{Math.round(s * 100)}%</text>
      ))}
      {[30, 180, 365, 730].map((d) => (
        <text key={d} x={L - 8} y={py(d) + 4} textAnchor="end" className="cz-tick">{d}일</text>
      ))}
      {/* 점 */}
      {withAge.map((c, i) => {
        const x = px(c.card.completeness?.score ?? 0.5)
        const y = py(c.card.freshness.ageDays)
        const fresh = c.card.freshness?.status === 'FRESH'
        return (
          <g key={c.recordId} className={`cz-node clickable cz-mx-dot ${cls(c.recordId)}`}
             style={{ animationDelay: `${0.1 + i * 0.07}s` }}
             tabIndex={0} role="button"
             aria-label={`${c.card.title} — 상세 보기`}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.recordId) } }}
             onClick={() => onSelect(c.recordId)}
             onMouseEnter={() => onHover(c.recordId)}
             onMouseLeave={() => onHover(null)}>
            <title>{`${c.card.title}\n완전성 ${Math.round((c.card.completeness?.score ?? 0) * 100)}% · 수정 ${c.card.modifiedDate} (${c.card.freshness.ageDays}일 경과)${fresh ? ' · FRESH 판정' : ''}`}</title>
            <circle cx={x} cy={y} r="13"
                    fill={TYPE_FILL[c.card.listType] || 'var(--card)'}
                    stroke={fresh ? 'var(--green-accent)' : (TYPE_STROKE[c.card.listType] || 'var(--line)')}
                    strokeWidth={fresh ? 2.5 : 1.5} />
            <text x={x} y={y + 3.5} textAnchor="middle" className="cz-node-type"
                  fill={c.card.listType === 'STD' ? '#fff' : 'var(--green-house)'}>
              {c.card.listType[0]}
            </text>
            <text x={x} y={y + 27} textAnchor="middle" className="cz-node-label">
              {short(c.card.title, 13)}
            </text>
          </g>
        )
      })}
      {noAge.length > 0 && (
        <text x={L} y={H - 8} className="cz-tick">
          경과일 미상 {noAge.length}건: {noAge.map((c) => short(c.card.title, 10)).join(' · ')}
        </text>
      )}
    </svg>
  )
}

/* ---------- 도시에(우측 상세 패널) ---------- */

function Dossier({ selected, candidates, references, insights, pipeline, keywordsShared, onOpen, onSelect }) {
  const withCard = candidates.filter((c) => c.card)

  if (!selected) {
    const typeCounts = withCard.reduce((acc, c) => {
      acc[c.card.listType] = (acc[c.card.listType] || 0) + 1
      return acc
    }, {})
    const fresh = withCard.filter((c) => c.card.freshness?.status === 'FRESH').length
    return (
      <aside className="cz-dossier">
        <span className="cz-dossier-kicker">전체 브리핑</span>
        <h4>데이터 조합 {withCard.length}건</h4>
        <dl>
          <div><dt>구성</dt><dd>{Object.entries(typeCounts).map(([t, n]) => `${t} ${n}`).join(' · ') || '—'}</dd></div>
          <div><dt>최신성</dt><dd>FRESH {fresh}/{withCard.length} (갱신 주기 대비)</dd></div>
          <div><dt>공통 키워드</dt><dd>{keywordsShared.slice(0, 4).join(' · ') || '—'}</dd></div>
        </dl>
        <p className="cz-dossier-hint">
          지도의 노드를 클릭하면 이 자리에서 해당 데이터의 역할·근거·연결이 열립니다.
          발견 카드에 마우스를 올리면 근거 노드가 지도에서 빛납니다.
        </p>
      </aside>
    )
  }

  const c = withCard.find((x) => x.recordId === selected)
  if (!c) {
    // 후보는 아니지만 정찰 중 확인된 참조 파일 — 미니 도시에
    const ref = references?.[selected]
    const citedBy = insights.filter((ins) => ins.evidence?.includes(selected))
    return (
      <aside className="cz-dossier">
        <span className="cz-dossier-kicker">
          조사 파일 (후보 외)
          <button className="cz-dossier-close" onClick={() => onSelect(null)} title="선택 해제">✕</button>
        </span>
        <h4>{ref?.title || `#${selected}`}</h4>
        <p className="cz-dossier-org">{ref?.listType || ''}{ref?.listType ? ' · ' : ''}정찰 중 확인된 근거 자료 — 최종 후보에는 포함되지 않았습니다.</p>
        {citedBy.length > 0 && (
          <>
            <h5>이 데이터가 뒷받침하는 발견</h5>
            <ul>{citedBy.map((ins, i) => <li key={i}>{ins.title}</li>)}</ul>
          </>
        )}
        <div className="cz-dossier-actions">
          <button className="cz-btn-solid" onClick={() => onOpen(selected)}>전체 프로필 열기</button>
        </div>
      </aside>
    )
  }
  const cited = insights.filter((ins) => ins.evidence?.includes(selected))
  const steps = pipeline
    .map((st, i) => ({ ...st, no: i + 1 }))
    .filter((st) => st.uses?.includes(selected))

  return (
    <aside className="cz-dossier selected">
      <span className="cz-dossier-kicker">
        데이터 도시에
        <button className="cz-dossier-close" onClick={() => onSelect(null)} title="선택 해제">✕</button>
      </span>
      <h4>{c.card.title}</h4>
      <p className="cz-dossier-org">{c.card.orgName}{c.role ? ` · ${c.role}` : ''}</p>
      {c.reason && <p className="cz-dossier-reason">{c.reason}</p>}
      <dl>
        <div><dt>완전성</dt><dd>
          <span className="completeness">
            <span className="bar"><span className="fill" style={{ width: `${(c.card.completeness?.score ?? 0) * 100}%` }} /></span>
            {Math.round((c.card.completeness?.score ?? 0) * 100)}%
          </span>
        </dd></div>
        <div><dt>최신성</dt><dd>
          {FRESH_LABEL[c.card.freshness?.status] || '—'}
          {Number.isFinite(c.card.freshness?.ageDays) && ` · ${c.card.freshness.ageDays}일 경과`}
        </dd></div>
        <div><dt>수정일</dt><dd>{c.card.modifiedDate || '—'}</dd></div>
        <div><dt>포맷</dt><dd>{(c.card.formats || []).join(', ') || '—'}</dd></div>
      </dl>
      {cited.length > 0 && (
        <>
          <h5>이 데이터가 뒷받침하는 발견</h5>
          <ul>{cited.map((ins, i) => <li key={i}>{ins.title}</li>)}</ul>
        </>
      )}
      {steps.length > 0 && (
        <>
          <h5>실행 계획에서의 쓰임</h5>
          <ul>{steps.map((st) => <li key={st.no}>단계 {st.no} — {(st.step || '').replace(/^\s*\d+[.)]\s*/, '')}</li>)}</ul>
        </>
      )}
      <div className="cz-dossier-actions">
        <button className="cz-btn-solid" onClick={() => onOpen(selected)}>전체 프로필 열기</button>
        {c.card.portalUrl && (
          <a className="cz-btn-outline" href={c.card.portalUrl} target="_blank" rel="noreferrer">
            포털 원문 ↗
          </a>
        )}
      </div>
    </aside>
  )
}

/* ---------- 대시보드 본체 ---------- */

export default function ConciergeDashboard({ result, onOpen, onFollowUp, onSearch, busy, scanStats }) {
  const { plan, grounding, meta, references } = result.data
  const candidates = plan.candidates || []
  const withCard = candidates.filter((c) => c.card)
  const [sel, setSel] = useState(null)
  const [hover, setHover] = useState(null)
  const [linked, setLinked] = useState(null) // Set — 발견/단계 hover 시 근거 노드
  const [view, setView] = useState('map')
  const [coach, setCoach] = useState(() => !localStorage.getItem('cz-coach-v1'))
  const [copied, setCopied] = useState(false)
  const activeId = hover || sel
  // 지도·매트릭스는 후보 노드만 반응 — 후보 외 참조를 잡아도 전체가 페이드되지 않게
  const candidateIds = useMemo(() => new Set(withCard.map((c) => c.recordId)), [withCard])
  const graphActiveId = candidateIds.has(activeId) ? activeId : null

  const titleOf = useMemo(() => {
    const m = new Map(withCard.map((c) => [c.recordId, c.card.title]))
    return (rid) => m.get(rid) || references?.[rid]?.title || `#${rid}`
  }, [withCard, references])

  const dismissCoach = () => {
    setCoach(false)
    try { localStorage.setItem('cz-coach-v1', '1') } catch { /* 프라이빗 모드 */ }
  }

  const avgCompleteness = withCard.length
    ? withCard.reduce((s, c) => s + (c.card.completeness?.score ?? 0), 0) / withCard.length
    : 0
  const freshCount = withCard.filter((c) => c.card.freshness?.status === 'FRESH').length
  const freshRatio = withCard.length ? freshCount / withCard.length : 0
  const groundedRatio = grounding.checked ? grounding.grounded / grounding.checked : 0
  const joinKeys = plan.expectedJoinKeys || []
  const insights = (plan.insights || []).slice(0, 4)
  const pipeline = (plan.pipeline || []).slice(0, 6)
  const followUps = (plan.followUps || []).slice(0, 3)

  // 실행 준비도(참고) — 서버 판정 사실의 가중 합성. 공식은 화면에 공개한다.
  const readiness = Math.round(
    100 * (0.4 * avgCompleteness + 0.3 * freshRatio + 0.2 * groundedRatio +
      0.1 * Math.min(joinKeys.length, 3) / 3),
  )
  const readinessCount = useCountUp(readiness)

  // 브리핑 Markdown 내보내기 — 화면 내용과 동일한 근거·한계를 그대로 담는다
  const buildMarkdown = () => {
    const L = []
    L.push(`# 공공데이터 활용 브리핑 — ${result.data.question}`)
    L.push('')
    L.push(`> 분석 스냅샷 ${meta.sourceSnapshot} · 모델 ${meta.model} · ${meta.promptVersion}` +
      (scanStats?.discovered ? ` · ${scanStats.discovered}건 탐색 · ${scanStats.examined}건 정밀 검증` : ''))
    L.push('')
    L.push(`**결론.** ${plan.answer || ''}`)
    L.push('')
    L.push(`**실행 준비도(참고) ${readiness}%** — 완전성 ${Math.round(avgCompleteness * 100)}% · FRESH ${freshCount}/${withCard.length} · 근거 검증 ${grounding.grounded}/${grounding.checked} · 결합 키 ${joinKeys.length}개`)
    if (plan.purposeBreakdown?.length) {
      L.push('', '## 목적 분해', ...plan.purposeBreakdown.map((p) => `- ${p}`))
    }
    if (withCard.length) {
      L.push('', '## 후보 데이터셋')
      withCard.forEach((c) => L.push(
        `- **${c.card.title}** (${c.card.listType}, ${c.card.orgName}) — ${c.role || ''}` +
        ` · 완전성 ${Math.round((c.card.completeness?.score ?? 0) * 100)}% · 수정 ${c.card.modifiedDate || '—'}` +
        (c.card.portalUrl ? ` · [포털 원문](${c.card.portalUrl})` : '') +
        (c.reason ? `\n  - ${c.reason}` : '')))
    }
    if (insights.length) {
      L.push('', '## 핵심 발견')
      insights.forEach((ins) => L.push(
        `- **${ins.title}** (${(CONF_META[ins.confidence] || CONF_META.medium).label})\n  - ${ins.detail}` +
        (ins.evidence?.length ? `\n  - 근거: ${ins.evidence.map(titleOf).join(', ')}` : '')))
    }
    if (pipeline.length) {
      L.push('', '## 분석 실행 계획')
      pipeline.forEach((st, i) => L.push(
        `${i + 1}. **${(st.step || '').replace(/^\s*\d+[.)]\s*/, '')}** — ${st.detail || ''}` +
        (st.uses?.length ? ` (사용: ${st.uses.map(titleOf).join(', ')})` : '')))
    }
    if (joinKeys.length) {
      L.push('', '## 예상 결합 키 (비단정)', ...joinKeys.map((k) => `- ${k.key} — ${k.note || ''}`))
    }
    if (plan.complementaryData?.length) {
      L.push('', '## 함께 필요한 데이터', ...plan.complementaryData.map((x) => `- ${x.need} — ${x.how}`))
    }
    if (plan.unverified?.length) {
      L.push('', '## 실데이터를 열기 전에는 알 수 없는 것', ...plan.unverified.map((x) => `- ${x}`))
    }
    if (plan.limitations?.length) {
      L.push('', '## 한계', ...plan.limitations.map((x) => `- ${x}`))
    }
    L.push('', '---',
      '본 결과는 공공데이터포털 목록 메타데이터 기반이며 실제 데이터의 내용·품질·결합 가능성을 보증하지 않습니다. 모든 후보는 포털 원문 확인이 필요합니다.')
    return L.join('\n')
  }

  const downloadMd = () => {
    const blob = new Blob([buildMarkdown()], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `datanav-briefing-${meta.sourceSnapshot}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown())
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* 클립보드 권한 없음 — 다운로드로 유도 */ }
  }

  const keywordsShared = useMemo(() => {
    const count = new Map()
    withCard.forEach((c) => {
      new Set((c.card.keywords || []).map((k) => k.trim())).forEach((k) => {
        if (k) count.set(k, (count.get(k) || 0) + 1)
      })
    })
    return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }, [withCard])

  const evChips = (rids) => (
    <div className="cz-evidence">
      {rids.map((rid) => (
        <button key={rid} className="chip small clickable"
                onClick={() => setSel(rid)}
                onMouseEnter={() => setHover(rid)}
                onMouseLeave={() => setHover(null)}>
          {short(titleOf(rid), 18)}
        </button>
      ))}
    </div>
  )

  const dimIf = (rids) =>
    activeId && !(rids || []).includes(activeId) ? 'dim' : ''

  return (
    <div className="cz-dash">
      {/* ① 결론 밴드 + 실행 준비도 */}
      <section className="cz-hero" style={{ animationDelay: '0s' }}>
        <div className="cz-hero-main">
          <span className="cz-hero-kicker">
            AI 컨시어지 분석
            {scanStats?.discovered > 0 &&
              ` — ${scanStats.discovered}건 탐색 · ${scanStats.examined}건 정밀 검증에서 도출`}
          </span>
          <p className="cz-hero-answer"><WordReveal text={plan.answer} /></p>
          {plan.purposeBreakdown?.length > 0 && (
            <div className="cz-hero-chips">
              {plan.purposeBreakdown.map((p, i) => <span key={i}>{p}</span>)}
            </div>
          )}
        </div>
        <div className="cz-hero-side">
          <div className="cz-readiness">
            <Donut value={readiness / 100} text={`${readinessCount}%`} dark size={72} />
            <div>
              <strong>실행 준비도<span title="가중 합성: 완전성 40% + 최신성 30% + 근거 검증 20% + 결합 키 10% — 목록 사실 기반 참고 지표">ⓘ</span></strong>
              <span>완전성 {Math.round(avgCompleteness * 100)}% · FRESH {freshCount}/{withCard.length} · 근거 {grounding.grounded}/{grounding.checked} · 키 {joinKeys.length}개</span>
            </div>
          </div>
          <div className="cz-hero-stat">
            <strong>{meta.sourceSnapshot}</strong>
            <span>분석 스냅샷 · 후보 {withCard.length}건</span>
          </div>
          <div className="cz-hero-actions">
            <button onClick={downloadMd} title="브리핑을 Markdown 파일로 저장">⬇ 브리핑.md</button>
            <button onClick={copyMd} title="브리핑 전문을 클립보드에 복사">{copied ? '복사됨 ✓' : '복사'}</button>
          </div>
        </div>
      </section>

      {/* ② 증거 워크스페이스 — 지도/매트릭스 + 도시에 */}
      {withCard.length > 0 && (
        <section className="cz-card cz-workspace" style={{ animationDelay: '0.15s' }}>
          <header>
            <div>
              <h3>증거 워크스페이스</h3>
              <p>
                {view === 'map'
                  ? '공유 키워드·주제(목록 사실) 기반 연결 — 노드를 클릭하면 우측 도시에가 열립니다. 점선은 미확보 보완 데이터.'
                  : '완전성 × 수정 경과일 배치(목록 기준) — 우상단일수록 완전하고 최신입니다. 활용 적합성 판정이 아닌 참고 배치입니다.'}
              </p>
            </div>
            <div className="cz-seg" role="tablist">
              <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>연결 지도</button>
              <button className={view === 'matrix' ? 'on' : ''} onClick={() => setView('matrix')}>배치도</button>
            </div>
          </header>
          {coach && (
            <p className="cz-coach">
              💡 발견 카드에 마우스를 올리면 근거 노드가 지도에서 빛나고, 노드를 클릭하면 우측에
              상세가 열립니다. 점선 노드를 클릭하면 검색 탭에서 바로 찾아봅니다.
              <button onClick={dismissCoach} aria-label="안내 닫기">닫기 ✕</button>
            </p>
          )}
          <div className="cz-workspace-body">
            <div className="cz-workspace-canvas">
              {view === 'map' ? (
                <Constellation
                  question={result.data.question}
                  candidates={candidates}
                  complements={plan.complementaryData}
                  activeId={graphActiveId}
                  linkedIds={linked}
                  onSelect={(rid) => setSel(rid === sel ? null : rid)}
                  onHover={setHover}
                  onSearch={onSearch}
                />
              ) : (
                <Matrix
                  candidates={candidates}
                  activeId={graphActiveId}
                  linkedIds={linked}
                  onSelect={(rid) => setSel(rid === sel ? null : rid)}
                  onHover={setHover}
                />
              )}
              <div className="cz-legend">
                <span><i style={{ background: 'var(--green-light)', borderColor: 'var(--green-starbucks)' }} /> FILE</span>
                <span><i style={{ background: 'var(--ceramic)', borderColor: 'var(--green-house)' }} /> API</span>
                <span><i style={{ background: 'var(--green-house)', borderColor: 'var(--green-house)' }} /> 표준</span>
                {view === 'map' && <span><i className="dashed" /> 보완 필요(클릭=검색)</span>}
                {view === 'map'
                  ? <span>원 크기 = 완전성</span>
                  : <span>굵은 초록 테두리 = FRESH 판정 · 사분면 = 목록 기준 참고</span>}
              </div>
            </div>
            <Dossier
              selected={sel}
              candidates={candidates}
              references={references}
              insights={insights}
              pipeline={pipeline}
              keywordsShared={keywordsShared}
              onOpen={onOpen}
              onSelect={setSel}
            />
          </div>
        </section>
      )}

      {/* ③ 핵심 발견 — 지도와 교차 연동 */}
      {insights.length > 0 && (
        <section className="cz-insights">
          {insights.map((ins, i) => {
            const kind = KIND_META[ins.kind] || KIND_META.coverage
            const conf = CONF_META[ins.confidence] || CONF_META.medium
            return (
              <article className={`cz-card cz-insight ${dimIf(ins.evidence)}`} key={i}
                       style={{ animationDelay: `${0.25 + i * 0.08}s` }}
                       onMouseEnter={() => ins.evidence?.length && setLinked(new Set(ins.evidence))}
                       onMouseLeave={() => setLinked(null)}>
                <header>
                  <span className="cz-kind"><i style={{ background: kind.dot }} />{kind.label}</span>
                  <span className={`cz-conf ${conf.cls}`}>{conf.label}</span>
                </header>
                <h4>{ins.title}</h4>
                <p>{ins.detail}</p>
                {ins.evidence?.length > 0 && evChips(ins.evidence)}
              </article>
            )
          })}
        </section>
      )}

      {/* ④ 실행 계획 */}
      {pipeline.length > 0 && (
        <section className="cz-card cz-pipeline" style={{ animationDelay: '0.35s' }}>
          <header>
            <h3>분석 실행 계획</h3>
            <p>목록 메타데이터 근거의 제안 — 실데이터 확인 후 조정이 필요합니다.</p>
          </header>
          <ol>
            {pipeline.map((st, i) => (
              <li key={i} className={dimIf(st.uses)}
                  style={{ animationDelay: `${0.4 + i * 0.08}s` }}
                  onMouseEnter={() => st.uses?.length && setLinked(new Set(st.uses))}
                  onMouseLeave={() => setLinked(null)}>
                <span className="cz-step-no">{i + 1}</span>
                <div>
                  <strong>{(st.step || '').replace(/^\s*\d+[.)]\s*/, '')}</strong>
                  <p>{st.detail}</p>
                  {st.uses?.length > 0 && evChips(st.uses)}
                </div>
              </li>
            ))}
          </ol>
          {joinKeys.length > 0 && (
            <div className="cz-joinkeys">
              <span>예상 결합 키(비단정)</span>
              {joinKeys.map((k, i) => <code key={i} title={k.note}>{k.key}</code>)}
            </div>
          )}
        </section>
      )}

      {/* ⑤ 후보 상세 (접이식) */}
      {candidates.length > 0 && (
        <details className="cz-details" style={{ animationDelay: '0.45s' }}>
          <summary>후보 데이터셋 상세 {candidates.length}건</summary>
          <ul className="results" style={{ marginTop: 10 }}>
            {candidates.map((c) => (
              <li key={c.recordId} className="result-row">
                <div className="row-main" {...(c.card ? rowButtonProps(() => onOpen(c.recordId)) : {})}>
                  <div className="row-title">
                    {c.card && <span className={`type type-${c.card.listType}`}>{c.card.listType}</span>}
                    <strong>{c.card ? c.card.title : c.recordId}</strong>
                    {c.role && <span className="chip small">{c.role}</span>}
                  </div>
                  <div className="row-sub"><span>{c.reason}</span></div>
                  {c.card && (
                    <div className="row-badges">
                      <span className="completeness">
                        <span className="bar"><span className="fill" style={{ width: `${c.card.completeness.score * 100}%` }} /></span>
                        {(c.card.completeness.score * 100).toFixed(0)}%
                      </span>
                      {c.card.modifiedDate && <span className="chip small">수정 {c.card.modifiedDate}</span>}
                    </div>
                  )}
                </div>
                {c.card?.portalUrl && (
                  <div className="row-actions">
                    <a href={c.card.portalUrl} target="_blank" rel="noreferrer"
                       onClick={(e) => e.stopPropagation()}>포털 원문 ↗</a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ⑥ 함께 필요한 데이터 + 정직성(미확인·한계) */}
      {(plan.complementaryData?.length > 0 || plan.unverified?.length > 0 || plan.limitations?.length > 0) && (
        <section className="cz-honesty" style={{ animationDelay: '0.5s' }}>
          {plan.complementaryData?.length > 0 && (
            <div>
              <h4>함께 필요한 데이터</h4>
              <ul>{plan.complementaryData.map((x, i) => <li key={i}><strong>{x.need}</strong> — {x.how}</li>)}</ul>
            </div>
          )}
          {plan.unverified?.length > 0 && (
            <div>
              <h4>실데이터를 열기 전에는 알 수 없는 것</h4>
              <ul>{plan.unverified.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {plan.limitations?.length > 0 && (
            <div>
              <h4>한계</h4>
              <ul>{plan.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {/* ⑦ 이어서 탐색하기 */}
      {followUps.length > 0 && (
        <section className="cz-followups" style={{ animationDelay: '0.55s' }}>
          <h4>이어서 탐색하기</h4>
          <div className="examples">
            {followUps.map((q, i) => (
              <button key={i} className="chip" disabled={busy} onClick={() => onFollowUp(q)}>
                {q} →
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
