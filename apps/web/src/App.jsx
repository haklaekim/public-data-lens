import { useEffect, useState } from 'react'
import { api } from './api.js'
import SearchView from './components/SearchView.jsx'
import CompareView from './components/CompareView.jsx'
import ChangesView from './components/ChangesView.jsx'
import CasesView from './components/CasesView.jsx'
import DatasetProfile from './components/DatasetProfile.jsx'

const DISCLAIMER =
  '본 결과는 공공데이터포털 목록 메타데이터 기반이며 실제 데이터의 내용·품질·결합 가능성을 보증하지 않습니다.'

const TABS = [
  { id: 'search', label: '검색' },
  { id: 'compare', label: '비교' },
  { id: 'changes', label: '변경 피드' },
  { id: 'cases', label: '활용 사례' },
]

export default function App() {
  const [tab, setTab] = useState('search')
  const [status, setStatus] = useState(null)
  const [profileId, setProfileId] = useState(null)
  const [compareIds, setCompareIds] = useState([])

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 5
          ? prev
          : [...prev, id],
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>공공데이터 내비게이터</h1>
          <p className="tagline">
            하고 싶은 일을 말하면, 사용할 공공데이터와 그 선택 이유, 함께 필요한
            데이터, 확인해야 할 한계를 알려주는 AI 공공데이터 내비게이터
          </p>
        </div>
        {status && (
          <div className="status-chip" title={`릴리스 ${status.data.release}`}>
            <span>스냅샷 {status.data.currentSnapshot}</span>
            <span>{status.data.counts.datasets.toLocaleString()}건</span>
            <span>분석 기준 {status.data.processedAt?.slice(0, 10)}</span>
          </div>
        )}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'compare' && compareIds.length > 0 && (
              <span className="badge">{compareIds.length}</span>
            )}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'search' && (
          <SearchView
            onOpen={setProfileId}
            compareIds={compareIds}
            onToggleCompare={toggleCompare}
          />
        )}
        {tab === 'compare' && (
          <CompareView
            ids={compareIds}
            onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
            onOpen={setProfileId}
          />
        )}
        {tab === 'changes' && <ChangesView onOpen={setProfileId} />}
        {tab === 'cases' && <CasesView onOpen={setProfileId} />}
      </main>

      {profileId && (
        <DatasetProfile recordId={profileId} onClose={() => setProfileId(null)} />
      )}

      <footer className="footer">
        <p>{DISCLAIMER}</p>
        <p>
          모든 원문 접근은{' '}
          <a href="https://www.data.go.kr" target="_blank" rel="noreferrer">
            공공데이터포털
          </a>
          로 연결됩니다. 본 서비스는 포털을 대체하지 않는 탐색·판단 계층입니다.
        </p>
      </footer>
    </div>
  )
}
