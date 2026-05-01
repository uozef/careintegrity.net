import { useState } from 'react'
import { useApi } from '../hooks/useApi'

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low']
const ENGINES = ['all', 'Network Graph', 'Behavioural Drift', 'Time Budget', 'Provider DNA', 'Synthetic Simulation', 'Collusion Detection']

export default function Alerts() {
  const [severity, setSeverity] = useState('all')
  const [engine, setEngine] = useState('all')
  const [expanded, setExpanded] = useState(null)

  const severityParam = severity !== 'all' ? `&severity=${severity}` : ''
  const engineParam = engine !== 'all' ? `&engine=${encodeURIComponent(engine)}` : ''
  const { data, loading } = useApi(`/alerts?limit=200${severityParam}${engineParam}`, [severity, engine])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading alerts...</div>

  const alerts = data?.alerts || []

  return (
    <div>
      <div className="page-header">
        <h2>Fraud Alerts</h2>
        <p>{data?.total || 0} alerts detected across all engines</p>
      </div>

      <div className="filter-bar">
        {SEVERITIES.map(s => (
          <button key={s} className={`filter-btn ${severity === s ? 'active' : ''}`} onClick={() => setSeverity(s)}>
            {s === 'all' ? 'All Severities' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="filter-bar" style={{ marginBottom: 20 }}>
        {ENGINES.map(e => (
          <button key={e} className={`filter-btn ${engine === e ? 'active' : ''}`} onClick={() => setEngine(e)}>
            {e === 'all' ? 'All Engines' : e}
          </button>
        ))}
      </div>

      <div className="alert-list">
        {alerts.map((alert) => (
          <div key={alert.id} className="alert-item" onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
            <div className={`alert-severity ${alert.severity}`} />
            <div className="alert-content">
              <div className="alert-title">{alert.title}</div>
              <div className="alert-desc">{alert.description}</div>
              <div className="alert-meta">
                <span className="alert-tag">{alert.source_engine}</span>
                <span className="alert-tag">{alert.type}</span>
                <span className="alert-confidence">Confidence: {(alert.confidence * 100).toFixed(0)}%</span>
              </div>
              {expanded === alert.id && (
                <div style={{ marginTop: 12, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 12 }}>
                  <div style={{ color: '#8b8fa3', marginBottom: 4 }}>Entities Involved:</div>
                  <div style={{ color: '#e4e6f0' }}>{(alert.entities || []).join(', ')}</div>
                  {alert.distance_km && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ color: '#8b8fa3' }}>Distance: </span>
                      <span style={{ color: '#ef4444' }}>{alert.distance_km} km</span>
                    </div>
                  )}
                  {alert.ratio && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: '#8b8fa3' }}>Ratio: </span>
                      <span style={{ color: '#f97316' }}>{alert.ratio}x</span>
                    </div>
                  )}
                  {alert.period && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: '#8b8fa3' }}>Period: </span>
                      <span>{alert.period}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#5e6275' }}>No alerts matching filters</div>
        )}
      </div>
    </div>
  )
}
