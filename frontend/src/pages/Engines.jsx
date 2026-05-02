import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'

const ENGINE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#10b981', '#f97316', '#ef4444', '#6366f1']
const ENGINE_NAMES_MAP = {
  'Network Graph Analysis': 'Network Graph',
  'Behavioural Drift': 'Behavioural Drift',
  'Time Budget Constraints': 'Time Budget',
  'Provider DNA Embeddings': 'Provider DNA',
  'Synthetic Simulation': 'Synthetic Simulation',
  'Collusion Detection': 'Collusion Detection',
  'Invoice Pressure Testing': 'Invoice Pressure Testing',
}

export default function Engines() {
  const { data, loading } = useApi('/engines/status', [])
  const [selectedEngine, setSelectedEngine] = useState(null)
  const [engineAlerts, setEngineAlerts] = useState(null)
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15

  const engines = data?.engines || []

  const selectEngine = async (engine) => {
    setSelectedEngine(engine)
    setPage(0)
    setSearchTerm('')
    setLoadingAlerts(true)
    const engineName = ENGINE_NAMES_MAP[engine.name] || engine.name
    const alerts = await fetchApi(`/alerts?limit=200&engine=${encodeURIComponent(engineName)}`)
    setEngineAlerts(alerts)
    setLoadingAlerts(false)
  }

  const filteredAlerts = (engineAlerts?.alerts || []).filter(a => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return a.title?.toLowerCase().includes(s) || a.id?.toLowerCase().includes(s) ||
      a.type?.toLowerCase().includes(s) || (a.entities || []).some(e => e.toLowerCase().includes(s))
  })

  const pagedAlerts = filteredAlerts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filteredAlerts.length / PAGE_SIZE)

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading engines...</div>

  return (
    <div>
      <div className="page-header">
        <h2>Detection Engines</h2>
        <p>{engines.length} independent fraud detection engines running in parallel -- click any engine to view its alerts</p>
      </div>

      <div className="engine-grid">
        {engines.map((engine, i) => (
          <div key={engine.id} className="engine-card" onClick={() => selectEngine(engine)}
            style={{ cursor: 'pointer', border: selectedEngine?.id === engine.id ? '2px solid var(--accent-blue)' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${ENGINE_COLORS[i]}20`, color: ENGINE_COLORS[i],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14,
              }}>{i + 1}</div>
              <div className="engine-name">{engine.name}</div>
            </div>
            <div className="engine-desc">{engine.description}</div>
            <div className="engine-stat">
              <div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Alerts Generated</span>
                <div className="engine-alert-count">{engine.alerts?.toLocaleString()}</div>
              </div>
              <span className="engine-status">{engine.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Engine Alerts Panel */}
      {selectedEngine && (
        <div className="card fade-in" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 2 }}>{selectedEngine.name} -- Alerts</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {filteredAlerts.length} alerts {searchTerm && `matching "${searchTerm}"`}
              </div>
            </div>
            <button className="btn sm" onClick={() => { setSelectedEngine(null); setEngineAlerts(null) }}>Close</button>
          </div>

          <input className="form-input" placeholder="Search alerts by title, type, ID, or entity..."
            value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(0) }}
            style={{ marginBottom: 14, fontSize: 13, padding: '10px 14px' }} />

          {loadingAlerts ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}><div className="loading-spinner" style={{ margin: '0 auto 8px', width: 20, height: 20 }} />Loading alerts...</div>
          ) : (
            <>
              <div className="alert-list" style={{ maxHeight: 500, overflowY: 'auto' }}>
                {pagedAlerts.map((a, i) => (
                  <div key={a.id || i} className="alert-item">
                    <div className={`alert-severity ${a.severity}`} />
                    <div className="alert-content">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="alert-title" style={{ fontSize: 13 }}>{a.title}</div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{(a.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="alert-desc" style={{ fontSize: 12 }}>{a.description?.slice(0, 150)}</div>
                      <div className="alert-meta" style={{ marginTop: 6 }}>
                        <span className={`risk-badge ${a.severity}`} style={{ fontSize: 10 }}>{a.severity}</span>
                        <span className="alert-tag">{a.type}</span>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{a.id}</span>
                        {a.entities?.length > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Entities: {a.entities.slice(0, 3).join(', ')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {pagedAlerts.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No alerts matching search</div>
                )}
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 }}>
                  <button className="btn sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page + 1} of {totalPages}</span>
                  <button className="btn sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">How the Scoring Works</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 12 }}>
            Each engine analyses a different dimension of the NDIS ecosystem. Instead of asking
            <span style={{ color: 'var(--accent-yellow)' }}> "Is this invoice valid?"</span>, the system asks
            <span style={{ color: 'var(--accent-green)' }}> "Does this provider behave like a legitimate economic organism inside the NDIS network?"</span>
          </p>
          <p style={{ marginBottom: 12 }}>The final fraud likelihood for each invoice is computed as:</p>
          <div style={{ background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: 8, fontFamily: 'monospace', fontSize: 14, color: 'var(--text-primary)', marginBottom: 12, border: '1px solid var(--border)' }}>
            Fraud Likelihood = Deviation(0.4) x Network Risk(0.3) x Behavioural Drift(0.3)
          </div>
          <p>
            Where <strong>Deviation</strong> measures how far the invoice deviates from statistical baselines,{' '}
            <strong>Network Risk</strong> scores the provider's position in the ecosystem graph, and{' '}
            <strong>Behavioural Drift</strong> measures how much the provider has changed over time.
          </p>
        </div>
      </div>
    </div>
  )
}
