import { useEffect, useRef, useState } from 'react'

import { anonHeaders } from '../api'
import ConciergeDashboard from './ConciergeDashboard.jsx'

const EXAMPLES = [
  '고령자 의료·교통 접근성을 분석하고 싶다',
  '노후 산업단지의 제조업 경쟁력을 진단하고 싶다',
  '관광지 방문객 데이터를 상권과 연결해 보고 싶다',
  '폭염에 취약한 지역을 찾아 대응 시설을 점검하고 싶다',
]

const short = (s, n = 22) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '')

/* Tool 이벤트 → 타임라인 항목 (제목 + 모노 상세) */
function stepInfo(ev) {
  if (ev.type === 'stage') {
    return ev.stage === 'planning'
      ? { title: '질문 분석·검색 계획 수립', detail: null }
      : { title: '발견 종합 — 분석 결과 구성', detail: null }
  }
  switch (ev.tool) {
    case 'search_datasets':
      return {
        title: '카탈로그 검색',
        detail: `search_datasets("${ev.args.query}"${ev.args.region ? `, ${ev.args.region}` : ''}) → ${ev.resultSummary}`,
      }
    case 'get_dataset':
      return { title: '프로필 정밀 검증', detail: `get_dataset → ${ev.resultSummary}` }
    case 'compare_datasets':
      return {
        title: '사실 비교',
        detail: `compare_datasets(${ev.args.recordIds.length}건) → ${ev.resultSummary}`,
      }
    case 'get_catalog_stats':
      return { title: '분포 통계', detail: `get_catalog_stats(${ev.args.axis})` }
    default:
      return { title: ev.tool, detail: ev.resultSummary || null }
  }
}

function ReasoningTimeline({ steps, live }) {
  return (
    <ol className="cz-timeline">
      {steps.map((s, i) => {
        const info = stepInfo(s)
        const isLast = i === steps.length - 1
        return (
          <li key={i} className={live && isLast ? 'live' : 'done'}>
            <span className="cz-tl-dot">{live && isLast ? '' : '✓'}</span>
            <div>
              <strong>{info.title}</strong>
              {info.detail && <code>{info.detail}</code>}
            </div>
          </li>
        )
      })}
      {live && steps.length === 0 && (
        <li className="live">
          <span className="cz-tl-dot" />
          <div><strong>연결 중…</strong></div>
        </li>
      )}
    </ol>
  )
}

/* ---------- 미션 컨트롤 — 실시간 데이터 정찰 소나 ---------- */

const GOLDEN = 137.508

function MissionControl({ steps, discovered, examined, elapsed, phase, winners, totalScanned, onReveal, candidates }) {
  const W = 720
  const H = 330
  const cx = W / 2
  const cy = H / 2
  const dots = discovered.slice(0, 60)
  const latest = dots[dots.length - 1]
  const toolCalls = steps.filter((s) => s.type === 'tool').length
  const crystallizing = phase === 'crystallize'
  const [tip, setTip] = useState(null) // { d, x, y } — 호버 중인 점

  const pos = (i) => {
    const a = ((i * GOLDEN) % 360) * (Math.PI / 180)
    const r = 62 + 22 * Math.sqrt(i)
    return { x: cx + Math.min(r, 330) * Math.cos(a), y: cy + Math.min(r, 138) * Math.sin(a) }
  }

  const candOf = (rid) => (candidates || []).find((c) => c.recordId === rid)

  return (
    <div className={`cz-mission ${crystallizing ? 'crystallize' : ''}`}>
      <header>
        <div>
          <span className="cz-hero-kicker">AI 데이터 정찰</span>
          <h3>{crystallizing ? '발견 종합 — 후보 결정화' : '카탈로그 96,056건을 실시간 탐사 중'}</h3>
        </div>
        <div className="cz-mission-stats">
          <span><strong>{elapsed}s</strong>경과</span>
          <span><strong>{toolCalls}</strong>Tool 호출</span>
          <span><strong>{discovered.length}</strong>발견</span>
          <span><strong>{examined.size}</strong>정밀 검증</span>
        </div>
      </header>

      <div className="cz-sonar-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="cz-sonar" role="img" aria-label="실시간 데이터 탐사 현황">
          {[62, 105, 148].map((r) => (
            <ellipse key={r} cx={cx} cy={cy} rx={Math.min(r * 2.2, 340)} ry={r * 0.94}
                     className="cz-ring" />
          ))}
          {dots.map((d, i) => {
            const p = pos(i)
            const win = winners && winners.has(d.recordId)
            const dim = crystallizing && !win
            return (
              <g key={d.recordId}
                 className={`cz-dot hoverable ${win ? 'win' : ''} ${dim ? 'dim' : ''} ${examined.has(d.recordId) ? 'examined' : ''}`}
                 style={{ animationDelay: `${(i % 8) * 0.05}s` }}
                 onMouseEnter={() => setTip({ d, ...p })}
                 onMouseLeave={() => setTip(null)}>
                <circle cx={p.x} cy={p.y} r={win ? 9 : 5}
                        className={d.listType === 'API' ? 'api' : 'file'} />
                {/* 히트 영역 확장 — 작은 점도 쉽게 호버 */}
                <circle cx={p.x} cy={p.y} r="13" fill="transparent" />
                {win && (
                  <text x={p.x} y={p.y - 14} textAnchor="middle" className="cz-dot-label win">
                    {short(d.title, 14)}
                  </text>
                )}
              </g>
            )
          })}
          {/* 중심 — 스캔 펄스 */}
          <circle cx={cx} cy={cy} r="34" className="cz-core-pulse" />
          <circle cx={cx} cy={cy} r="34" className="cz-core" />
          <text x={cx} y={cy - 2} textAnchor="middle" className="cz-core-t1">
            {crystallizing ? '선별' : 'SCAN'}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="cz-core-t2">
            {crystallizing ? `${winners ? winners.size : 0}건` : `${discovered.length}건`}
          </text>
          {/* 최신 발견 라벨 */}
          {!crystallizing && latest && !tip && (
            <text key={latest.recordId} x={cx} y={H - 12} textAnchor="middle" className="cz-latest">
              + {short(latest.title, 34)}
            </text>
          )}
        </svg>
        {tip && (() => {
          const cand = candOf(tip.d.recordId)
          const win = winners && winners.has(tip.d.recordId)
          return (
            <div className="cz-dot-tip"
                 style={{
                   left: `${Math.min(Math.max((tip.x / W) * 100, 14), 86)}%`,
                   top: `${(tip.y / H) * 100}%`,
                 }}>
              <strong>{tip.d.title}</strong>
              <span>
                {tip.d.listType}
                {tip.d.via ? ` · 발견 경로 "${tip.d.via}"` : ''}
                {examined.has(tip.d.recordId) ? ' · 정밀 검증됨' : ''}
                {crystallizing ? (win ? ' · 후보 선별 ✓' : ' · 미선별') : ''}
              </span>
              {win && cand?.role && <em>{cand.role}{cand.reason ? ` — ${short(cand.reason, 56)}` : ''}</em>}
            </div>
          )
        })()}
      </div>

      {crystallizing ? (
        <>
          <p className="cz-ribbon">
            {totalScanned.toLocaleString()}건 탐색 → {examined.size}건 정밀 검증 → 후보 {winners ? winners.size : 0}건 선별 — 근거 검증 통과분만 공개합니다
          </p>
          {onReveal && (
            <button className="cz-reveal-btn" onClick={onReveal}>
              분석 결과 보기 →
            </button>
          )}
        </>
      ) : (
        <div className="cz-mission-log">
          {steps.slice(-3).map((s, i, arr) => {
            const info = stepInfo(s)
            return (
              <p key={steps.length - arr.length + i} className={i === arr.length - 1 ? 'now' : ''}>
                <span>{i === arr.length - 1 ? '▸' : '✓'}</span> {info.title}
                {info.detail && <code>{info.detail}</code>}
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* 세션 내 결과 지속: 탭 이동·새로고침에도 마지막 브리핑을 복원한다 */
function loadSaved() {
  try { return JSON.parse(sessionStorage.getItem('cz-last') || 'null') } catch { return null }
}

export default function ConciergeView({ onOpen, onSearch }) {
  const saved = useRef(loadSaved()).current
  const [status, setStatus] = useState(null)
  const [question, setQuestion] = useState(saved?.question || '')
  const [phase, setPhase] = useState(saved ? 'done' : 'idle') // idle | live | crystallize | done
  const [result, setResult] = useState(saved?.result || null)
  const [error, setError] = useState(null)
  const [steps, setSteps] = useState(saved?.steps || [])
  const [discovered, setDiscovered] = useState(saved?.discovered || []) // [{recordId,title,listType,via}]
  const [examined, setExamined] = useState(new Set(saved?.examined || []))
  const [totalScanned, setTotalScanned] = useState(saved?.totalScanned || 0)
  const [elapsed, setElapsed] = useState(0)
  // 정찰 종료 → 결과 전환 방식: 자동(잠시 결정화 후 전환) | 수동(사용자가 버튼으로 전환)
  const [autoReveal, setAutoReveal] = useState(
    () => (localStorage.getItem('cz-reveal') ?? 'auto') === 'auto',
  )
  const sessionId = useRef(`web-${Math.random().toString(36).slice(2, 10)}`)
  const seenRef = useRef(new Set())
  const loading = phase === 'live' || phase === 'crystallize'

  const setRevealMode = (auto) => {
    setAutoReveal(auto)
    try { localStorage.setItem('cz-reveal', auto ? 'auto' : 'manual') } catch { /* 프라이빗 모드 등 */ }
  }

  // 자동 모드: 결정화 연출을 잠시 보여준 뒤 결과로 전환. 수동 모드: 버튼을 기다린다.
  useEffect(() => {
    if (phase !== 'crystallize' || !autoReveal) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setPhase('done'), reduced ? 250 : 2400)
    return () => clearTimeout(t)
  }, [phase, autoReveal])

  // 결과 확정 시 세션에 저장 — 탭 이동·새로고침 후에도 복원
  useEffect(() => {
    if (phase !== 'done' || !result) return
    try {
      sessionStorage.setItem('cz-last', JSON.stringify({
        question: result.data.question, result, steps,
        discovered, examined: [...examined], totalScanned,
      }))
    } catch { /* 저장 실패(용량 등)는 무해 */ }
  }, [phase, result, steps, discovered, examined, totalScanned])

  const loadStatus = () =>
    fetch('/api/concierge/status', { headers: anonHeaders() }).then((r) => r.json()).then(setStatus).catch(() => setStatus(null))

  useEffect(() => { loadStatus() }, [])

  useEffect(() => {
    if (phase !== 'live') return undefined
    setElapsed(0)
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  const ingest = (ev) => {
    setSteps((prev) => [...prev, ev])
    if (ev.type !== 'tool') return
    if (Array.isArray(ev.found)) {
      const fresh = ev.found
        .filter((d) => d.recordId && !seenRef.current.has(d.recordId))
        .map((d) => ({ ...d, via: ev.args?.query })) // 호버 툴팁용 발견 경로
      fresh.forEach((d) => seenRef.current.add(d.recordId))
      if (fresh.length) setDiscovered((prev) => [...prev, ...fresh])
      const m = /^(\d[\d,]*)건/.exec(ev.resultSummary || '')
      if (m) setTotalScanned((t) => t + parseInt(m[1].replace(/,/g, ''), 10))
    }
    if (ev.focus?.recordId) {
      if (!seenRef.current.has(ev.focus.recordId)) {
        seenRef.current.add(ev.focus.recordId)
        setDiscovered((prev) => [...prev, ev.focus])
      }
      setExamined((prev) => new Set(prev).add(ev.focus.recordId))
    }
  }

  const ask = async (q) => {
    const text = (q ?? question).trim()
    if (!text || loading) return
    setPhase('live')
    setError(null)
    setResult(null)
    setSteps([])
    setDiscovered([])
    setExamined(new Set())
    setTotalScanned(0)
    seenRef.current = new Set()
    let finalResult = null
    try {
      const r = await fetch('/api/concierge/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...anonHeaders() },
        body: JSON.stringify({ question: text, sessionId: sessionId.current }),
      })
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = chunk.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const ev = JSON.parse(line.slice(6))
          if (ev.type === 'stage' || ev.type === 'tool') {
            ingest(ev)
          } else if (ev.type === 'result') {
            finalResult = ev
          } else if (ev.type === 'error') {
            setError(`${ev.error.code}: ${ev.error.message}`)
          }
        }
      }
      loadStatus()
      if (finalResult) {
        // 결정화 단계: 탐사 화면 위에서 후보가 선별되는 과정을 보여준 뒤
        // 자동 모드면 잠시 후, 수동 모드면 사용자의 '분석 결과 보기'로 전환한다.
        setResult(finalResult)
        setPhase('crystallize')
      } else {
        setPhase('idle')
      }
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  const followUp = (q) => {
    setQuestion(q)
    ask(q)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (status && !status.enabled) {
    return (
      <section className="empty">
        <h3>생성형 컨시어지 (M3)</h3>
        <p className="warning">⚠ {status.note}</p>
        <p className="result-meta">
          서버에 <code>ANTHROPIC_API_KEY</code>를 설정하고 API 서버를 재시작하면 활성화됩니다.
          검색·비교 등 비생성형 기능은 계속 사용할 수 있습니다.
        </p>
      </section>
    )
  }

  const winners = result
    ? new Set((result.data.plan.candidates || []).map((c) => c.recordId))
    : null

  return (
    <section>
      <h3 style={{ margin: '4px 0 2px' }}>어떤 분석이나 서비스를 만들고 싶으신가요?</h3>
      <p className="result-meta">
        목적을 한 문장으로 적으면, AI가 카탈로그를 실시간 정찰해 데이터 조합과 실행 계획을
        시각 대시보드로 제안합니다.
        {status && ` (오늘 ${status.usage.todayQueries}/${status.usage.dailyLimit}회 · 이번 달 ${status.usage.monthlyCostKrw.toLocaleString()}원/${status.usage.monthlyBudgetKrw.toLocaleString()}원)`}
      </p>

      <form className="searchbar" onSubmit={(e) => { e.preventDefault(); ask() }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="예: 고령자 의료·교통 접근성을 분석하고 싶다"
          maxLength={500}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>{loading ? `분석 중 ${elapsed}s` : '질문'}</button>
      </form>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" disabled={loading}
                  onClick={() => { setQuestion(ex); ask(ex) }}>{ex}</button>
        ))}
      </div>
      <div className="cz-mode">
        <span>정찰 종료 후</span>
        <div className="cz-seg small">
          <button type="button" className={autoReveal ? 'on' : ''}
                  onClick={() => setRevealMode(true)}>자동 전환</button>
          <button type="button" className={!autoReveal ? 'on' : ''}
                  onClick={() => setRevealMode(false)}>확인 후 전환</button>
        </div>
        {!autoReveal && <span className="cz-mode-hint">정찰 결과를 살펴본 뒤 '분석 결과 보기'를 누르면 전환됩니다</span>}
      </div>

      {loading && (
        <MissionControl
          steps={steps}
          discovered={discovered}
          examined={examined}
          elapsed={elapsed}
          phase={phase}
          winners={winners}
          totalScanned={totalScanned}
          onReveal={autoReveal ? null : () => setPhase('done')}
          candidates={result?.data?.plan?.candidates || null}
        />
      )}
      {error && <p className="error">{error}</p>}

      {phase === 'done' && result && result.data?.plan && (
        <>
          {result.warnings.filter((w) => !w.startsWith('본 결과는') && !w.startsWith('생성형 응답은')).map((w, i) => (
            <p className="warning" key={i}>⚠ {w}</p>
          ))}

          <div aria-live="polite" className="sr-only">
            분석 완료 — 후보 {result.data.plan.candidates?.length || 0}건이 제시되었습니다
          </div>
          <ConciergeDashboard
            result={result}
            onOpen={onOpen}
            onFollowUp={followUp}
            onSearch={onSearch}
            busy={loading}
            scanStats={{ scanned: totalScanned, discovered: discovered.length, examined: examined.size }}
          />

          {steps.length > 0 && (
            <details className="cz-details">
              <summary>추론 과정 {steps.filter((s) => s.type === 'tool').length}회 Tool 호출 다시 보기</summary>
              <ReasoningTimeline steps={steps} live={false} />
            </details>
          )}

          <div className="portal-box" style={{ marginTop: 16 }}>
            <p>
              모델 {result.data.meta.model} · Prompt {result.data.meta.promptVersion} · 스냅샷{' '}
              {result.data.meta.sourceSnapshot} · 이번 질의 약 {result.data.meta.estimatedCostKrw}원 ·
              생성형 응답은 목록 메타데이터 기반 계획이며 모든 후보는 포털 원문 확인이 필요합니다.
            </p>
            <details>
              <summary>Tool 호출 기록 ({result.data.toolTrace.length}건)</summary>
              <ul className="case-list">
                {result.data.toolTrace.map((t, i) => (
                  <li key={i}><code>{t.tool}</code> {JSON.stringify(t.args)} → {t.resultSummary}</li>
                ))}
              </ul>
            </details>
          </div>
        </>
      )}
    </section>
  )
}
