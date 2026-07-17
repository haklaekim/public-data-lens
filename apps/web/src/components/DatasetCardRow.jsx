const EVIDENCE_LABEL = {
  EXPLICIT_SPATIAL: '공간범위 명시',
  INFERRED_FROM_TITLE: '제목 추론',
  INFERRED_FROM_PUBLISHER: '기관명 추론',
  INFERRED_FROM_DESCRIPTION: '설명 추론',
}

export default function DatasetCardRow({ item, onOpen, compared, compareFull, onToggleCompare }) {
  return (
    <li className="card-row">
      <div className="card-main" onClick={() => onOpen(item.recordId)}>
        <div className="card-title-line">
          <span className={`type type-${item.listType}`}>{item.listType}</span>
          <strong>{item.title}</strong>
        </div>
        <div className="card-sub">
          <span>{item.orgName}</span>
          {item.theme?.top && <span>{item.theme.top}{item.theme.sub ? ` › ${item.theme.sub}` : ''}</span>}
          {item.formats?.length > 0 && <span>{item.formats.join(' · ')}</span>}
          {item.modifiedDate && <span>수정 {item.modifiedDate}</span>}
        </div>
        <div className="card-badges">
          <span
            className="completeness"
            title={`목록 메타데이터 완전성 (${item.completeness.profile} 프로파일, ${item.completeness.rule})`}
          >
            <span className="bar">
              <span className="fill" style={{ width: `${item.completeness.score * 100}%` }} />
            </span>
            {(item.completeness.score * 100).toFixed(0)}%
          </span>
          {item.regions?.map((r) => (
            <span
              key={r.code}
              className={`region ${r.evidence === 'EXPLICIT_SPATIAL' ? 'explicit' : 'inferred'}`}
              title={`${EVIDENCE_LABEL[r.evidence] || r.evidence} · 신뢰도 ${r.confidence}`}
            >
              {r.name.replace(/(특별자치|특별|광역)?(시|도)$/, '')}
              {r.evidence !== 'EXPLICIT_SPATIAL' && '?'}
            </span>
          ))}
        </div>
      </div>
      <div className="card-actions">
        <label className="compare-check" title="비교에 추가 (최대 5개)">
          <input
            type="checkbox"
            checked={compared}
            disabled={!compared && compareFull}
            onChange={() => onToggleCompare(item.recordId)}
          />
          비교
        </label>
        {item.portalUrl && (
          <a href={item.portalUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            포털 원문 ↗
          </a>
        )}
      </div>
    </li>
  )
}
