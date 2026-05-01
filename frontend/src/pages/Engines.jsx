import { useApi } from '../hooks/useApi'

export default function Engines() {
  const { data, loading } = useApi('/engines/status', [])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading engines...</div>

  const engines = data?.engines || []

  const ENGINE_ICONS = ['1', '2', '3', '4', '5', '6', '7']
  const ENGINE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#10b981', '#f97316', '#ef4444']

  return (
    <div>
      <div className="page-header">
        <h2>Detection Engines</h2>
        <p>7 independent fraud detection engines running in parallel</p>
      </div>

      <div className="engine-grid">
        {engines.map((engine, i) => (
          <div key={engine.id} className="engine-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${ENGINE_COLORS[i]}20`,
                color: ENGINE_COLORS[i],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14,
              }}>
                {ENGINE_ICONS[i]}
              </div>
              <div>
                <div className="engine-name">{engine.name}</div>
              </div>
            </div>
            <div className="engine-desc">{engine.description}</div>
            <div className="engine-stat">
              <div>
                <span style={{ fontSize: 12, color: '#8b8fa3' }}>Alerts Generated</span>
                <div className="engine-alert-count">{engine.alerts}</div>
              </div>
              <span className="engine-status">{engine.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">How the Scoring Works</div>
        <div style={{ fontSize: 13, color: '#8b8fa3', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 12 }}>
            Each engine analyses a different dimension of the NDIS ecosystem. Instead of asking
            <span style={{ color: '#f59e0b' }}> "Is this invoice valid?"</span>, the system asks
            <span style={{ color: '#10b981' }}> "Does this provider behave like a legitimate economic organism inside the NDIS network?"</span>
          </p>
          <p style={{ marginBottom: 12 }}>
            The final fraud likelihood for each invoice is computed as:
          </p>
          <div style={{
            background: '#0f1117', padding: '16px 20px', borderRadius: 8, fontFamily: 'monospace',
            fontSize: 14, color: '#e4e6f0', marginBottom: 12, border: '1px solid #2a2d3a',
          }}>
            Fraud Likelihood = Deviation(0.4) x Network Risk(0.3) x Behavioural Drift(0.3)
          </div>
          <p>
            Where <strong style={{ color: '#e4e6f0' }}>Deviation</strong> measures how far the invoice deviates from statistical baselines,{' '}
            <strong style={{ color: '#e4e6f0' }}>Network Risk</strong> scores the provider's position in the ecosystem graph, and{' '}
            <strong style={{ color: '#e4e6f0' }}>Behavioural Drift</strong> measures how much the provider has changed over time.
          </p>
        </div>
      </div>
    </div>
  )
}
