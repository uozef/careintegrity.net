import { useApi } from '../hooks/useApi'

function getRiskClass(score) {
  if (score >= 0.7) return 'critical'
  if (score >= 0.5) return 'high'
  if (score >= 0.3) return 'medium'
  if (score > 0) return 'low'
  return 'none'
}

export default function Providers({ onSelectProvider }) {
  const { data, loading } = useApi('/providers', [])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading providers...</div>

  return (
    <div>
      <div className="page-header">
        <h2>Provider Risk Assessment</h2>
        <p>{data?.length || 0} providers ranked by risk score</p>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Provider ID</th>
                <th>Name</th>
                <th>Services</th>
                <th>Risk Score</th>
                <th>Alerts</th>
                <th>Max Severity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map(p => (
                <tr key={p.id} onClick={() => onSelectProvider(p.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id}</td>
                  <td style={{ fontWeight: 500, color: '#e4e6f0' }}>{p.name}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(p.service_types || []).slice(0, 3).map(s => (
                        <span key={s} style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(59,130,246,0.1)', borderRadius: 3, color: '#6b9bfc' }}>{s}</span>
                      ))}
                      {(p.service_types || []).length > 3 && (
                        <span style={{ fontSize: 10, color: '#5e6275' }}>+{p.service_types.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ width: 60 }}>
                        <div className="progress-fill" style={{
                          width: `${(p.risk_score || 0) * 100}%`,
                          background: p.risk_score >= 0.7 ? '#ef4444' : p.risk_score >= 0.5 ? '#f97316' : p.risk_score >= 0.3 ? '#f59e0b' : '#10b981',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: p.risk_score >= 0.5 ? '#f97316' : '#8b8fa3' }}>
                        {((p.risk_score || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: p.alert_count > 0 ? '#f97316' : '#5e6275' }}>
                      {p.alert_count || 0}
                    </span>
                  </td>
                  <td>
                    <span className={`risk-badge ${getRiskClass(p.risk_score)}`}>
                      {p.max_severity || 'none'}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: p.status === 'active' ? '#10b981' : '#ef4444', fontSize: 12 }}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
