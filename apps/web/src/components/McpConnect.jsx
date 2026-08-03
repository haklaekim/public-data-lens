import { useState } from 'react'

// 배포 도메인 기준으로 자동 구성 — service.datahub.kr에서는 정본 커넥터 URL이 된다
const MCP_URL = `${window.location.origin}/projects/public-data-lens/mcp`

export default function McpConnect() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard 미지원 환경 — 수동 복사 */
    }
  }

  return (
    <>
      <button className="mcp-cta" onClick={() => setOpen(true)}>
        AI에 연결
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-label="AI 연결 안내" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>AI에서 대화로 사용하기</h2>
              <button className="close" onClick={() => setOpen(false)} aria-label="닫기">✕</button>
            </div>
            <p className="mcp-lead">
              이 화면의 검색·비교·구조 조회는 <strong>MCP(Model Context Protocol)</strong> 서버로도
              제공됩니다. Claude 등 MCP를 지원하는 AI에 아래 주소를 등록하면, 화면 대신
              <strong> 대화로</strong> 공공데이터를 탐색할 수 있습니다.
            </p>
            <div className="mcp-url">
              <code>{MCP_URL}</code>
              <button onClick={copy}>{copied ? '복사됨 ✓' : '복사'}</button>
            </div>
            <ol className="mcp-steps">
              <li>Claude 웹/앱 → <strong>설정 → 커넥터 → 커스텀 커넥터 추가</strong></li>
              <li>위 주소를 붙여넣고 추가 — 인증 불필요, 무료</li>
              <li>대화에서 바로: <em>"폐교 활용 사업에 참고할 공공데이터 찾아줘"</em></li>
            </ol>
            <p className="mcp-note">
              웹과 동일한 판정 엔진을 사용합니다 — 근거 수준·규칙 버전이 응답에 함께 제공됩니다.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
