// 서버 경고·오류의 단일 표시 지점(가이드 §7, ADR-001 — 웹·컨시어지 표면 공유).
// 서버 문안을 치환하지 않는다. 유일한 표시 정책: 상시 고지(면책·생성형 고지)는
// 푸터·결과 헤더가 상시 담당하므로 이 패널에서는 반복하지 않는다.
const STANDING_PREFIXES = ['본 결과는', '생성형 응답은']

export default function WarningPanel({ warnings, error }) {
  const items = (warnings || []).filter(
    (w) => !STANDING_PREFIXES.some((p) => w.startsWith(p)),
  )
  if (!items.length && !error) return null
  return (
    <>
      {error && <p className="error">{error}</p>}
      {items.map((w, i) => (
        <p className="notice" key={i}>{w}</p>
      ))}
    </>
  )
}
