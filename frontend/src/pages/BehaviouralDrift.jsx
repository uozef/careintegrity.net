import { useState, useEffect } from 'react'
import { useApi, fetchApi } from '../hooks/useApi'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function BehaviouralDrift() {
  const { data: alerts, loading } = useApi('/alerts?limit=100&engine=Behavioural%20Drift', [])
  const { data: providers } = useApi('/providers', [])
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [driftData, setDriftData] = useState(null)

  // Get top risk providers
  const topProviders = (providers || []).filter(p => p.risk_score > 0).slice(0, 10)

  useEffect(() => {
    if (selectedProvider) {
      fetchApi(`/providers/${selectedProvider}/drift`).then(setDriftData)
    }
  }, [selectedProvider])

  // Auto-select first provider
  useEffect(() => {
    if (topProviders.length > 0 && !selectedProvider) {
      setSelectedProvider(topProviders[0].id)
    }
  }, [providers])

  if (loading) return <div className="loading"><div className="loading-spinner" />Loading drift analysis...</div>

  return (
    <div>
      <div className="page-header">
        <h2>Behavioural Drift Engine</h2>
        <p>Provider behaviour fingerprint tracking — detecting impossible acceleration and structural anomalies</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Select Provider to Analyse</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topProviders.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                style={{
                  padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  background: selectedProvider === p.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                  border: `1px solid ${selectedProvider === p.id ? '#3b82f6' : 'transparent'}`,
                  display: 'flex', justifyContent: 'space-between',
                }}
              >
                <span>{p.id} — {p.name}</span>
                <span style={{ color: '#f97316', fontWeight: 600 }}>{((p.risk_score || 0) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Drift Alerts ({alerts?.total || 0})</div>
          <div className="alert-list" style={{ maxHeight: 350, overflowY: 'auto' }}>
            {(alerts?.alerts || []).slice(0, 10).map((a, i) => (
              <div key={i} className="alert-item" style={{ padding: '8px 12px' }}>
                <div className={`alert-severity ${a.severity}`} />
                <div className="alert-content">
                  <div className="alert-title" style={{ fontSize: 12 }}>{a.title}</div>
                  <div className="alert-desc" style={{ fontSize: 11 }}>{a.description?.slice(0, 120)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {driftData && driftData.length > 0 && (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Participant Growth vs Worker Growth — {selectedProvider}</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={driftData}>
                  <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                  <Line type="monotone" dataKey="participants" stroke="#8b5cf6" strokeWidth={2} name="Participants" />
                  <Line type="monotone" dataKey="workers" stroke="#10b981" strokeWidth={2} name="Workers" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-title">Session Duration & Weekend Ratio — {selectedProvider}</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={driftData}>
                  <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                  <Line type="monotone" dataKey="avg_session_duration" stroke="#f59e0b" strokeWidth={2} name="Avg Session (h)" />
                  <Line type="monotone" dataKey="weekend_ratio" stroke="#ec4899" strokeWidth={2} name="Weekend Ratio" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Monthly Fingerprint Data — {selectedProvider}</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Participants</th>
                    <th>Workers</th>
                    <th>Total Hours</th>
                    <th>Total Amount</th>
                    <th>Avg Session</th>
                    <th>Staffing Ratio</th>
                    <th>Growth Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {driftData.map((d, i) => (
                    <tr key={i}>
                      <td>{d.period}</td>
                      <td>{d.participants}</td>
                      <td>{d.workers}</td>
                      <td>{d.total_hours?.toFixed(0)}</td>
                      <td>${d.total_amount?.toLocaleString()}</td>
                      <td>{d.avg_session_duration?.toFixed(1)}h</td>
                      <td style={{ color: d.staffing_ratio > 20 ? '#ef4444' : '#8b8fa3' }}>
                        {d.staffing_ratio?.toFixed(1)}
                      </td>
                      <td style={{ color: d.growth_rate > 0.5 ? '#ef4444' : d.growth_rate > 0.2 ? '#f59e0b' : '#8b8fa3' }}>
                        {d.growth_rate > 0 ? '+' : ''}{(d.growth_rate * 100)?.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
