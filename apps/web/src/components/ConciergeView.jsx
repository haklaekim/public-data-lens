import { useEffect, useRef, useState } from 'react'

const EXAMPLES = [
  '고령자 의료·교통 접근성을 분석하고 싶다',
  '관광지 방문객 데이터를 상권과 연결해 보고 싶다',
  '폭염에 취약한 지역을 찾아 대응 시설을 점검하고 싶다',
]

const STEP_LABEL = {
  search_datasets: (ev) => `② 검색 "${ev.args.query}"${ev.args.region ? ` (${ev.args.region})` : ''} → ${ev.resultSummary}`,
  get_dataset: (ev) => `③ 프로필 확인 — ${ev.resultSummary}`,
  compare_datasets: (ev) => `④ 비교 — ${ev.args.recordIds.length}개 데이터셋, ${ev.resultSummary}`,
  get_catalog_stats: (ev) => `통계 조회 — ${ev.args.axis}`,
}

function stepLabel(ev) {
  if (ev.type === 'stage') {
    return ev.stage === 'planning' ? `① ${ev.message}…` : `⑤ ${ev.message}…`
  }
  return (STEP_LABEL[ev.tool] || ((e) => e.tool))(ev)
}

export default function ConciergeView({ onOpen }) {
  const [status, setStatus] = useState(null)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [steps, setSteps] = useState([])
  const sessionId = useRef(`web-${Math.random().toString(36).slice(2, 10)}`)

  const loadStatus = () =>
    fetch('/api/concierge/status').then((r) => r.json()).then(setStatus).catch(() => setStatus(null))

  useEffect(() => { loadStatus() }, [])

  const ask = async (q) => {
    const text = (q ?? question).trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSteps([])
    try {
      const r = await fetch('/api/concierge/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            setSteps((prev) => [...prev, ev])
          } else if (ev.type === 'result') {
            setResult(ev)
          } else if (ev.type === 'error') {
            setError(`${ev.error.code}: ${ev.error.message}`)
          }
        }
      }
      loadStatus()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
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

  const plan = result?.data?.plan

  return (
    <section>
      <h3 style={{ margin: '4px 0 2px' }}>어떤 분석이나 서비스를 만들고 싶으신가요?</h3>
      <p className="result-meta">
        목적을 한 문장으로 적으면, 목록 메타데이터를 근거로 데이터 후보와 활용 계획을 제안합니다.
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
        <button type="submit" disabled={loading}>{loading ? '분석 중…' : '질문'}</button>
      </form>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" disabled={loading}
                  onClick={() => { setQuestion(ex); ask(ex) }}>{ex}</button>
        ))}
      </div>

      {(loading || (steps.length > 0 && !result)) && (
        <div className="progress-box">
          {steps.map((s, i) => (
            <div key={i} className={`progress-step ${i === steps.length - 1 && loading ? 'active' : 'done'}`}>
              <span className="progress-mark">{i === steps.length - 1 && loading ? '⏳' : '✓'}</span>
              {stepLabel(s)}
            </div>
          ))}
          {loading && steps.length === 0 && (
            <div className="progress-step active"><span className="progress-mark">⏳</span> 연결 중…</div>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {result && steps.length > 0 && (
        <details className="result-meta" style={{ margin: '8px 0' }}>
          <summary>진행 과정 {steps.length}단계 보기</summary>
          <div className="progress-box">
            {steps.map((s, i) => (
              <div key={i} className="progress-step done">
                <span className="progress-mark">✓</span>{stepLabel(s)}
              </div>
            ))}
          </div>
        </details>
      )}

      {result && plan && (
        <div>
          {result.warnings.filter((w) => !w.startsWith('본 결과는')).map((w, i) => (
            <p className="warning" key={i}>⚠ {w}</p>
          ))}

          {plan.answer && <p style={{ fontSize: 15, margin: '14px 0 4px' }}><strong>{plan.answer}</strong></p>}

          {plan.purposeBreakdown?.length > 0 && (<>
            <h3 className="case-h">① 목적 분해</h3>
            <ul className="case-list">{plan.purposeBreakdown.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>)}

          {plan.candidates?.length > 0 && (<>
            <h3 className="case-h">② 후보 데이터셋 (Tool 결과 근거 검증 완료: {result.data.grounding.grounded}/{result.data.grounding.checked})</h3>
            <ul className="results">
              {plan.candidates.map((c) => (
                <li key={c.recordId} className="card-row">
                  <div className="card-main" onClick={() => c.card && onOpen(c.recordId)}>
                    <div className="card-title-line">
                      {c.card && <span className={`type type-${c.card.listType}`}>{c.card.listType}</span>}
                      <strong>{c.card ? c.card.title : c.recordId}</strong>
                      {c.role && <span className="chip small">{c.role}</span>}
                    </div>
                    <div className="card-sub"><span>{c.reason}</span></div>
                    {c.card && (
                      <div className="card-badges">
                        <span className="completeness">
                          <span className="bar"><span className="fill" style={{ width: `${c.card.completeness.score * 100}%` }} /></span>
                          {(c.card.completeness.score * 100).toFixed(0)}%
                        </span>
                        {c.card.modifiedDate && <span className="chip small">수정 {c.card.modifiedDate}</span>}
                      </div>
                    )}
                  </div>
                  {c.card?.portalUrl && (
                    <div className="card-actions">
                      <a href={c.card.portalUrl} target="_blank" rel="noreferrer"
                         onClick={(e) => e.stopPropagation()}>포털 원문 ↗</a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>)}

          {plan.complementaryData?.length > 0 && (<>
            <h3 className="case-h">③ 함께 필요한 데이터</h3>
            <ul className="case-list">{plan.complementaryData.map((x, i) => <li key={i}><strong>{x.need}</strong> — {x.how}</li>)}</ul>
          </>)}

          {plan.expectedJoinKeys?.length > 0 && (<>
            <h3 className="case-h">④ 예상 결합 키 (추론 — 비단정)</h3>
            <ul className="case-list">{plan.expectedJoinKeys.map((x, i) => <li key={i}><strong>{x.key}</strong> — {x.note}</li>)}</ul>
          </>)}

          {plan.unverified?.length > 0 && (<>
            <h3 className="case-h">⑤ 미확인 항목</h3>
            <ul className="case-list">{plan.unverified.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>)}

          {plan.limitations?.length > 0 && (<>
            <h3 className="case-h">⑥ 한계</h3>
            <ul className="case-list">{plan.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>)}

          <div className="portal-box" style={{ marginTop: 16 }}>
            <p>
              모델 {result.data.meta.model} · Prompt {result.data.meta.promptVersion} · 스냅샷{' '}
              {result.data.meta.sourceSnapshot} · 이번 질의 약 {result.data.meta.estimatedCostKrw}원
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
        </div>
      )}
    </section>
  )
}
