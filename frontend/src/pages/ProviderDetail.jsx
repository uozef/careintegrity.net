import { useApi } from '../hooks/useApi'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

export default function ProviderDetail({ providerId, onBack }) {
  const { data, loading } = useApi(`/providers/${providerId}`, [providerId])

  if (loading || !data) return <div className="loading"><div className="loading-spinner" />Loading provider...</div>
  if (data.error) return <div className="loading">{data.error}</div>

  const { provider, risk_profile, alerts, drift_timeline } = data

  return (
    <div>
      <div className="provider-header">
        <div>
          <button className="back-btn" onClick={onBack}>&larr; Back to Providers</button>
          <h2 style={{ marginTop: 12 }}>{provider.name}</h2>
          <p style={{ fontSize: 13, color: '#8b8fa3', marginTop: 4 }}>
            {provider.id} &middot; ABN: {provider.abn} &middot; {provider.address}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#8b8fa3', textTransform: 'uppercase' }}>Risk Score</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: provider.risk_score >= 0.5 ? '#ef4444' : '#10b981' }}>
            {((provider.risk_score || 0) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Alerts</div>
          <div className="stat-value warning">{risk_profile?.alerts || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Max Severity</div>
          <div className={`stat-value ${risk_profile?.max_severity === 'critical' ? 'critical' : 'high'}`}>
            {risk_profile?.max_severity || 'none'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Services</div>
          <div className="stat-value info">{provider.service_types?.length || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Registered</div>
          <div className="stat-value" style={{ fontSize: 18, color: '#8b8fa3' }}>{provider.registration_date}</div>
        </div>
      </div>

      {drift_timeline && drift_timeline.length > 0 && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Participant & Worker Count Over Time</div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={drift_timeline}>
                <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                <Line type="monotone" dataKey="participants" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Participants" />
                <Line type="monotone" dataKey="workers" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Workers" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title">Billing & Hours Trend</div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={drift_timeline}>
                <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                <Area type="monotone" dataKey="total_amount" stroke="#3b82f6" fill="rgba(59,130,246,0.15)" strokeWidth={2} name="Total Amount ($)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {drift_timeline && drift_timeline.length > 0 && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Staffing Ratio Over Time</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={drift_timeline}>
                <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                <Line type="monotone" dataKey="staffing_ratio" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Participants per Worker" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title">Geographic Spread</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={drift_timeline}>
                <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                <Area type="monotone" dataKey="geographic_spread" stroke="#06b6d4" fill="rgba(6,182,212,0.15)" strokeWidth={2} name="Geo Spread" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Provider Alerts ({alerts?.length || 0})</div>
        <div className="alert-list">
          {(alerts || []).map((alert, i) => (
            <div key={i} className="alert-item">
              <div className={`alert-severity ${alert.severity}`} />
              <div className="alert-content">
                <div className="alert-title">{alert.title}</div>
                <div className="alert-desc">{alert.description}</div>
                <div className="alert-meta">
                  <span className="alert-tag">{alert.source_engine}</span>
                  <span className="alert-confidence">Confidence: {(alert.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
          {(!alerts || alerts.length === 0) && (
            <div style={{ padding: 20, textAlign: 'center', color: '#5e6275' }}>No alerts for this provider</div>
          )}
        </div>
      </div>
    </div>
  )
}
