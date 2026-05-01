import { useApi } from '../hooks/useApi'

const STATUS_COLORS = { passing: '#10b981', warning: '#f59e0b', failing: '#ef4444' }

export default function Compliance() {
  const { data, loading } = useApi('/compliance', [])
  if (loading || !data) return <div className="loading"><div className="loading-spinner" />Loading compliance...</div>
  const { standards, summary: s } = data

  return (
    <div>
      <div className="page-header"><h2>NDIS Compliance Framework</h2><p>Quality & Safeguards alignment — {s.total_standards} standards monitored</p></div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[['Overall Score', `${s.overall_score}%`, s.overall_score >= 85 ? 'success' : 'warning'],
          ['Passing', s.passing, 'success'], ['Warning', s.warning, 'warning'], ['Failing', s.failing, 'critical']
        ].map(([l,v,c]) => <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v}</div></div>)}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {Object.entries(s.by_category || {}).map(([cat, info]) => (
          <div key={cat} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{cat}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: info.avg_score >= 90 ? '#10b981' : info.avg_score >= 70 ? '#f59e0b' : '#ef4444' }}>{info.avg_score}%</div>
            </div>
            <div className="progress-bar" style={{ height: 8 }}>
              <div className="progress-fill" style={{ width: `${info.avg_score}%`, background: info.avg_score >= 90 ? '#10b981' : info.avg_score >= 70 ? '#f59e0b' : '#ef4444' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{info.count} standard(s)</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">All Compliance Standards</div>
        {standards.map(std => (
          <div key={std.id} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[std.status], marginTop: 5, flexShrink: 0, boxShadow: std.status === 'failing' ? '0 0 8px rgba(239,68,68,0.5)' : 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{std.standard}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{std.description}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: STATUS_COLORS[std.status] }}>{std.score}%</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{std.check_type}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <span className="alert-tag">{std.category}</span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{std.id}</span>
                <span className={`status-badge ${std.status === 'passing' ? 'paid' : std.status === 'warning' ? 'pending' : 'overdue'}`}>{std.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
